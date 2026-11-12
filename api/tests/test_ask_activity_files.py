"""The activity files, listed the way the Downloads page lists them.

Asked "can I get the underlying activity data?", the assistant copied the prompt's five-bullet example
because nothing told it which files the page offers. `list_activity_files` does (no query, no receipt):
every activity file of "The activity behind the estimates", in the page's order, each with what it
measures. The model writes `{{download:<table>}}` per file it lists; the server checks the table is
served and emits `<pdownload to="file:<table>"><table></pdownload>`; the web app draws the entry's
title (a link that opens the page at it), description and coverage from the page's own catalogue.
"""
import json
import os
import re

import pytest
from fastapi.testclient import TestClient

from test_ask import FakeModel, ask, only, stop, text, tool_use       # first: it puts the query core on the path
from pakemis_api.ask import prompt as PROMPT
from pakemis_api.ask.local import Library
from pakemis_api.ask.loop import served_tables
from pakemis_api.ask.render import UnknownPlaceholderError, check_bare_numbers, render_links, render_multi
from pakemis_api.ask.tools import (ACTIVITY_FILE_ORDER, ACTIVITY_HELPERS, CATALOG_TOOL, activity_file_order,
                                   activity_files)

PDOWNLOAD = re.compile(r'<pdownload to="file:([^"]*)">([^<]*)</pdownload>')
TABLES = frozenset({"fact_activity_vehicles", "fact_annual"})
VEHICLES = "fact_activity_vehicles"
HELPERS = ["fact_activity_source_details", "dim_activity_columns"]


# --- the renderer -------------------------------------------------------------------------------

def test_a_download_entry_becomes_a_tag_for_a_served_table_only():
    assert PDOWNLOAD.findall(render_links("- {{download:%s}}" % VEHICLES, TABLES)) == [(VEHICLES, VEHICLES)]
    assert render_links("{{download:fact_secret}}", TABLES) == "{{download:fact_secret}}"
    # no catalogue (a test double): no entry is recognised
    assert render_links("{{download:%s}}" % VEHICLES) == "{{download:%s}}" % VEHICLES
    with pytest.raises(UnknownPlaceholderError):
        render_multi("- {{download:fact_secret}}", [], tables=TABLES)
    out, _ = render_multi("Files:\n- {{download:fact_secret}}\n- {{download:%s}}" % VEHICLES, [],
                          drop_unknown=True, tables=TABLES)
    assert PDOWNLOAD.findall(out) == [(VEHICLES, VEHICLES)] and "{{" not in out


def test_a_download_entry_is_not_a_bare_number_and_a_forged_tag_is_stripped():
    check_bare_numbers("{{download:fact_activity_power_monthly}}")
    out, _ = render_multi('<pdownload to="file:fact_secret">fact_secret</pdownload> and {{download:%s}}' % VEHICLES,
                          [], tables=TABLES)
    assert PDOWNLOAD.findall(out) == [(VEHICLES, VEHICLES)] and "fact_secret" in out and out.count("<pdownload") == 1


# --- the order and the list -----------------------------------------------------------------------

def _page_activity_tables():
    page = os.path.join(os.path.dirname(__file__), "..", "..", "web", "src", "components", "downloads", "catalogue.ts")
    if not os.path.exists(page):
        pytest.skip("the web app is not beside this checkout")
    with open(page, encoding="utf-8") as handle:
        source = handle.read()
    section = source[source.index('id: "activity"'):source.index('id: "air"')]
    return [stem for stem in re.findall(r'files: \["([a-z0-9_]+)\.csv"', section)]


def test_the_order_is_the_downloads_pages_own():
    """The page's activity section, top to bottom, is the order the tool hands out."""
    assert list(ACTIVITY_FILE_ORDER) == _page_activity_tables()
    assert set(ACTIVITY_HELPERS) <= set(ACTIVITY_FILE_ORDER)


def test_a_release_that_ships_its_catalogue_is_listed_in_that_order():
    catalog = {"collections": [
        {"id": "emissions", "downloads": [{"files": ["fact_annual.csv"]}]},
        {"id": "activity", "downloads": [{"files": ["fact_activity_crops.csv", "fact_activity_crops.parquet"]},
                                         {"files": ["fact_activity_new.csv"], "pending": True},
                                         {"files": ["dim_activity_columns.csv"]}]}]}
    assert activity_file_order(catalog) == ("fact_activity_crops", "dim_activity_columns")
    assert activity_file_order(None) == ACTIVITY_FILE_ORDER
    assert activity_file_order({"collections": []}) == ACTIVITY_FILE_ORDER


@pytest.fixture(scope="module")
def fake():
    return FakeModel()


@pytest.fixture(scope="module")
def ask_client(settings, fake):
    from pakemis_api.app import create_app
    with TestClient(create_app(settings, model_client=fake)) as c:
        yield c


def test_every_served_activity_file_is_listed_in_the_pages_order(ask_client):
    runtime = ask_client.app.state.ask
    served = served_tables(runtime.service)
    files = activity_files(runtime.dims, served)
    assert [f["table"] for f in files] == [t for t in ACTIVITY_FILE_ORDER if t in served]
    assert len(files) == len(ACTIVITY_FILE_ORDER)          # the pinned release serves all nineteen
    by_table = {f["table"]: f for f in files}
    assert "Registered vehicles" in by_table[VEHICLES]["measures"] and by_table[VEHICLES]["location_levels"]
    for helper in HELPERS:
        assert by_table[helper]["kind"] == "guide to the other files" and by_table[helper]["holds"]
    # a table the release does not serve is not offered
    assert [f["table"] for f in activity_files(runtime.dims, frozenset({VEHICLES}))] == [VEHICLES]
    # nothing a page would print is handed over: no title, no description, no coverage
    assert not {"title", "dek", "coverage"} & {key for f in files for key in f}


def test_the_tool_is_offered_with_no_input(ask_client):
    tool = next(t for t in ask_client.app.state.ask.tools if t["name"] == CATALOG_TOOL)
    assert tool["input_schema"] == {"type": "object", "properties": {}}
    assert "{{download:<table>}}" in tool["description"]


# --- through the agent ----------------------------------------------------------------------------

def test_the_activity_question_lists_every_file_as_a_download_entry(ask_client, fake):
    order = list(ACTIVITY_FILE_ORDER)
    answer = ("Yes. The records the estimates are calculated from can be downloaded as CSV files:\n"
              + "\n".join("- {{download:%s}}" % t for t in order)
              + '\n\nThey are all in the "The activity behind the estimates" section on the {{link:downloads:activity}} page.')
    fake.load([tool_use(CATALOG_TOOL, {}), stop("tool_use")], [text(answer), stop()])
    events = ask(ask_client, "Can i get the underlying activity data this website uses?",
                 ui_state={"level": "adm1", "geo": "Khyber Pakhtunkhwa"})
    assert not only(events, "error") and not only(events, "refusal")
    # the call is shown, and nothing is presented as a query result: no tool_result, no receipt
    assert [c["name"] for c in only(events, "tool_call")] == [CATALOG_TOOL]
    assert not only(events, "tool_result")
    final = only(events, "answer")[0]
    assert final["receipts"] == [] and final["scope"] is None
    # what the model was handed: every file, in the page's order, and how to write them
    handed = json.loads(fake.calls[1]["messages"][-1]["content"][0]["content"])
    assert [f["table"] for f in handed["files"]] == order
    assert "{{download:<table>}}" in handed["write"]
    # what the reader gets: one entry per file, in that order, each checked
    assert [t for t, _ in PDOWNLOAD.findall(final["text"])] == order
    assert "{{" not in final["text"]
    # the streamed lines carry the same tags as they arrive
    streamed = "".join(d["text"] for d in only(events, "answer_delta"))
    assert [t for t, _ in PDOWNLOAD.findall(streamed)] == order


def test_a_narrow_question_can_list_one_file_and_the_guides(ask_client, fake):
    listed = ["fact_activity_livestock"] + HELPERS
    fake.load([tool_use(CATALOG_TOOL, {}), stop("tool_use")],
              [text("The livestock records are downloadable:\n" + "\n".join("- {{download:%s}}" % t for t in listed)), stop()])
    # this question used to be answered by the library's agriculture card, which lists no file
    events = ask(ask_client, "Where can I download the livestock data?")
    assert [c["name"] for c in only(events, "tool_call")] == [CATALOG_TOOL]
    assert [t for t, _ in PDOWNLOAD.findall(only(events, "answer")[0]["text"])] == listed


# --- the library steps aside ------------------------------------------------------------------

@pytest.mark.parametrize("question", [
    "Where can I download the livestock data?",
    "Is there a CSV of power plant generation?",
    "How do I get the fuel sales data?",
    "Which files have the vehicle registrations?",
])
def test_the_library_declines_a_question_about_getting_the_data(question):
    assert Library().answer(question, {}) is None


@pytest.mark.parametrize("question, card", [
    ("What sources does agriculture use?", "agriculture_data"),
    ("What is methane?", "gas_ch4"),
])
def test_the_library_still_answers_its_own_questions(question, card):
    answer = Library().answer(question, {})
    assert answer and answer["card_ids"][0] == card


# --- the prompt -------------------------------------------------------------------------------------

def test_the_prompt_teaches_the_tool_and_the_entry():
    contract = PROMPT.CONTRACT
    for phrase in ("{{download:TABLE}}", "call list_activity_files", "A question about activity data in general lists EVERY file",
                   "list the two guides to the other files", "never write a file's title or description yourself"):
        assert phrase in contract, phrase
    # the old hand-written list of five subjects is gone: the files come from the tool
    assert "- vehicle registrations by class and district" not in contract
    assert "{{download:TABLE}}" in PROMPT.correction_message("x")
