"""Links to the site's own pages: the model writes them as placeholders, the server checks them.

The reader asked "can I get the underlying activity data?" and was told to ask the assistant for
figures, when the answer was a section of the Downloads page. A link may not be a URL the model
typed, so it is a placeholder - {{link:downloads}}, {{link:downloads:<section>}},
{{link:file:<table>}} - and the server recognises only a section the page has and a table the
release serves, the same way it recognises only a cell a result has. What it emits is a tag
(<plink to="...">label</plink>) the web app turns into a route; nothing here is ever an href.
"""
import json
import os
import re
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from pakemis_api.ask import prompt as PROMPT
from pakemis_api.ask.loop import served_tables, tool_result_payload
from pakemis_api.ask.render import (DOWNLOAD_SECTIONS, BareNumberError, UnknownPlaceholderError, check_bare_numbers,
                                    render_links, render_multi)
from test_ask import FakeModel, ask, only, stop, text, tool_use

PLINK = re.compile(r'<plink to="([^"]*)">([^<]*)</plink>')
TABLES = frozenset({"fact_activity_vehicles", "fact_annual"})
VEHICLES = "fact_activity_vehicles"


def env(display="1.50", unit="Mt CO2e"):
    return {"values": [{"exact": display, "display": display, "display_short": display, "unit": unit}], "receipt": "r" * 32}


# --- the renderer -------------------------------------------------------------------------------

def test_the_page_and_its_sections_become_tags_reading_downloads():
    out = render_links("see {{link:downloads}} or {{link:downloads:activity}}")
    assert PLINK.findall(out) == [("downloads", "Downloads"), ("downloads:activity", "Downloads")]


def test_a_section_the_page_does_not_have_is_not_recognised():
    assert render_links("{{link:downloads:everything}}") == "{{link:downloads:everything}}"
    with pytest.raises(UnknownPlaceholderError):
        render_multi("see {{link:downloads:everything}}", [])


def test_a_file_link_must_name_a_table_the_release_serves():
    assert PLINK.findall(render_links("{{link:file:%s}}" % VEHICLES, TABLES)) == [("file:" + VEHICLES, VEHICLES)]
    assert render_links("{{link:file:fact_secret}}", TABLES) == "{{link:file:fact_secret}}"
    # with no catalogue (a test double), no file link is recognised at all
    assert render_links("{{link:file:%s}}" % VEHICLES) == "{{link:file:%s}}" % VEHICLES
    with pytest.raises(UnknownPlaceholderError):
        render_multi("{{link:file:fact_secret}}", [], tables=TABLES)


def test_links_and_figures_render_together_and_an_unrecognised_link_is_struck_on_the_second_pass():
    template = "It is {{result_1_cell_0.short}} {{result_1_cell_0.unit}}; the table is {{link:file:fact_annual}}."
    out, cites = render_multi(template, [env()], tables=TABLES)
    assert PLINK.findall(out) == [("file:fact_annual", "fact_annual")]
    assert len(cites) == 2 and "{{" not in out
    out, _ = render_multi("Visit {{link:downloads:nowhere}} now.", [], drop_unknown=True)
    assert out == "Visit now." and "plink" not in out


def test_a_link_placeholder_is_not_a_bare_number_and_a_number_beside_it_still_is():
    check_bare_numbers("{{link:file:fact_adm2_month}} and {{link:downloads:air}}")
    with pytest.raises(BareNumberError):
        check_bare_numbers("{{link:downloads}} holds 1.5 Mt")


def test_a_link_tag_the_model_typed_is_stripped_rather_than_drawn():
    # a tag in the model's own text never went through the check, so it is removed, not trusted
    out, _ = render_multi('Go <plink to="file:fact_secret">here</plink> or {{link:downloads}}.', [])
    assert PLINK.findall(out) == [("downloads", "Downloads")]
    assert "fact_secret" not in out and "here" in out


def test_the_sections_are_the_downloads_pages_own():
    """The server's list and the page's tabs are one list in two languages."""
    page = os.path.join(os.path.dirname(__file__), "..", "..", "web", "src", "components", "downloads", "catalogue.ts")
    if not os.path.exists(page):
        pytest.skip("the web app is not beside this checkout")
    with open(page, encoding="utf-8") as handle:
        ids = re.search(r"export const COLLECTION_IDS = \[([^\]]*)\]", handle.read()).group(1)
    assert tuple(re.findall(r'"([a-z]+)"', ids)) == DOWNLOAD_SECTIONS


# --- what the model is handed -------------------------------------------------------------------

def test_served_tables_are_the_catalogues_csv_files():
    service = SimpleNamespace(products=SimpleNamespace(files={"fact_annual.csv": 1, "fact_annual.parquet": 1, "semantic_release.json": 1}))
    assert served_tables(service) == frozenset({"fact_annual"})
    assert served_tables(object()) == frozenset()


def test_a_tool_result_names_the_tables_it_was_read_from():
    envelope = {"values": [], "receipt": "r", "request_type": "query_activity", "context": {},
                "provenance": {"tables": [{"table": VEHICLES, "path": "x", "sha256": "y"}]}}
    assert tool_result_payload(1, "c", "query_activity", envelope, 10)["source_tables"] == [VEHICLES]
    assert "source_tables" not in tool_result_payload(1, "c", "x", {"values": []}, 10)


def test_the_prompt_teaches_the_links_the_tables_and_that_the_question_wins():
    contract = PROMPT.CONTRACT
    for phrase in ("{{link:downloads}}", "{{link:downloads:SECTION}}", "{{link:file:TABLE}}",
                   '"The activity behind the estimates" section on the {{link:downloads:activity}}',
                   "Never write a web address", "GO IN A TABLE", "|---|---:|",
                   "THE QUESTION WINS OVER THE MAP", "take them from the result".upper()):
        assert phrase in contract, phrase
    # the old rule that the interface prints the scope is gone, and so is the one that made the map's
    # selection the scope of every answer
    assert "THE INTERFACE STATES THE SCOPE" not in contract
    assert "scope it was ASKED under" not in contract
    assert "{{link:downloads}}" in PROMPT.correction_message("x")


# --- through the agent ----------------------------------------------------------------------------

@pytest.fixture(scope="module")
def fake():
    return FakeModel()


@pytest.fixture(scope="module")
def ask_client(settings, fake):
    from pakemis_api.app import create_app
    with TestClient(create_app(settings, model_client=fake)) as c:
        yield c


def test_the_data_question_is_answered_with_a_link_to_the_downloads_section(ask_client, fake):
    fake.load([text('Yes. Visit the "The activity behind the estimates" section on the {{link:downloads:activity}} page.'), stop()])
    events = ask(ask_client, "can i get the underlying activity data on which this repo is made?",
                 ui_state={"level": "adm1", "geo": "Khyber Pakhtunkhwa"})
    assert not only(events, "error")
    answer = only(events, "answer")[0]
    assert PLINK.findall(answer["text"]) == [("downloads:activity", "Downloads")]
    assert "{{" not in answer["text"]


def test_a_file_link_from_a_result_of_this_turn_reaches_the_reader(ask_client, fake):
    call = {"table": VEHICLES, "locations": ["Lahore"], "measure": "Registered vehicles", "categories": ["Small cars (4W1)"]}
    fake.load([tool_use("query_activity", call), stop("tool_use")],
              [text("Lahore's register held {{result_1_cell_0.short}} {{result_1_cell_0.unit}}; the full table is "
                    "{{link:file:%s}}." % VEHICLES), stop()])
    events = ask(ask_client, "How many cars are in Lahore?")
    assert not only(events, "error") and not only(events, "refusal")
    # the model was told which table the record came from, so it could name it
    handed = json.loads(fake.calls[1]["messages"][-1]["content"][0]["content"])
    assert handed["source_tables"] == [VEHICLES]
    assert only(events, "tool_result")[0]["source_tables"] == [VEHICLES]
    assert PLINK.findall(only(events, "answer")[0]["text"]) == [("file:" + VEHICLES, VEHICLES)]
