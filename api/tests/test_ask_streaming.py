"""The answer streams line by line, and every line is checked before it is sent.

The answer used to arrive in one piece: the server held the whole text back, because every figure
in it must be a placeholder it fills and no number may be typed bare, and it checked the text only
when the model had finished. It now checks each completed line as it arrives and sends it at once
(`answer_delta`, figures already filled in). Three things keep that honest:

- text the model writes before deciding to call a tool was never the answer: once a tool call
  arrives the draft is taken back (`answer_reset`, reason "tools") and nothing more of that call
  streams;
- a line that fails its check is not sent, nor is anything after it from that call; if the whole
  answer then fails, the draft is taken back (`answer_reset`, reason "correction") before the
  model is asked to rewrite it, and the rewrite streams again;
- the final `answer` event still carries the whole rendered text, so history, receipts and
  replays are unchanged - the draft is only what the reader watched arrive.
"""
import re

import pytest
from fastapi.testclient import TestClient

from test_ask import CITE, FakeModel, ask, only, stop, text, tool_use

QUERY = {"periods": ["FY2023-24"]}


@pytest.fixture(scope="module")
def fake():
    return FakeModel()


@pytest.fixture(scope="module")
def ask_client(settings, fake):
    from pakemis_api.app import create_app
    with TestClient(create_app(settings, model_client=fake)) as c:
        yield c


def names(events):
    return [n for n, _ in events]


def drafted(events):
    return "".join(d["text"] for d in only(events, "answer_delta"))


def test_each_completed_line_is_sent_as_it_arrives_with_its_figures_filled_in(ask_client, fake):
    fake.load([tool_use("query_emissions", QUERY), stop("tool_use")],
              [text("In 2023-24 Pakistan emitted {{result_1_cell_0.short}} "), text("{{result_1_cell_0.unit}}.\n"),
               text("\nThat is the national total.\nIt excludes nothing"), text(" else."), stop()])
    events = ask(ask_client, "What were Pakistan's emissions in 2023-24?")
    assert not only(events, "error")
    deltas = only(events, "answer_delta")
    # three whole lines (the second is the blank between paragraphs); the unterminated last line
    # arrives with the final answer, not as a fragment
    assert [d["text"].endswith("\n") for d in deltas] == [True, True, True]
    assert "{{" not in drafted(events)
    first = CITE.findall(deltas[0]["text"])
    assert len(first) == 2 and first[0][0] == "1"
    answer = only(events, "answer")[0]
    assert answer["text"].startswith(drafted(events))
    assert answer["text"].endswith("It excludes nothing else.")
    # the draft precedes the answer, and nothing streams after it
    order = names(events)
    assert order.index("answer_delta") < order.index("answer")
    assert "answer_delta" not in order[order.index("answer"):]


def test_text_before_a_tool_call_is_taken_back_and_not_the_answer(ask_client, fake):
    fake.load([text("Let me look that up.\n"), tool_use("query_emissions", QUERY), text("ignored\n"), stop("tool_use")],
              [text("It was {{result_1_cell_0.short}} {{result_1_cell_0.unit}}.\n"), stop()])
    events = ask(ask_client, "Total in 2023-24?")
    order = names(events)
    resets = only(events, "answer_reset")
    assert resets and resets[0]["reason"] == "tools"
    # the preamble streamed, was taken back when the tool call arrived, and the line after the
    # tool call in the same message never streamed at all
    deltas = only(events, "answer_delta")
    assert deltas[0]["text"] == "Let me look that up.\n"
    assert all("ignored" not in d["text"] for d in deltas)
    assert order.index("answer_reset") < order.index("tool_call")
    # the answer that follows streams afresh
    assert "It was" in deltas[-1]["text"] and only(events, "answer")


def test_a_line_with_a_typed_number_is_held_and_the_draft_is_taken_back_for_the_correction(ask_client, fake):
    fake.load([tool_use("query_emissions", QUERY), stop("tool_use")],
              [text("The total is {{result_1_cell_0.short}} {{result_1_cell_0.unit}}.\n"),
               text("That is about 12.3 Mt.\n"), text("More text.\n"), stop()],
              [text("The total is {{result_1_cell_0.short}} {{result_1_cell_0.unit}}.\n"), stop()])
    events = ask(ask_client, "Total in 2023-24?")
    assert not only(events, "error")
    deltas = only(events, "answer_delta")
    # the typed decimal never reached the reader, nor anything after it
    assert all("12.3" not in d["text"] and "More text" not in d["text"] for d in deltas)
    resets = only(events, "answer_reset")
    assert [r["reason"] for r in resets] == ["correction"]
    order = names(events)
    reset_at = order.index("answer_reset")
    assert order.index("status", reset_at) > reset_at            # the correction notice follows the take-back
    # the rewrite streamed again, and is what the answer says
    assert order.index("answer_delta", reset_at) > reset_at
    assert "12.3" not in only(events, "answer")[0]["text"]


def test_a_withheld_answer_leaves_no_draft_behind(ask_client, fake):
    fake.load([tool_use("query_emissions", QUERY), stop("tool_use")],
              [text("Fine line {{result_1_cell_0.short}}.\nBad 1.5 Mt.\n"), stop()],
              [text("Still 1.5 Mt.\n"), stop()])
    events = ask(ask_client, "Total in 2023-24?")
    errors = only(events, "error")
    assert errors and errors[0]["code"] == "bare_numbers"
    assert not only(events, "answer")
    # the line that streamed was taken back before the rewrite, and the rewrite streamed nothing
    assert only(events, "answer_reset")
    order = names(events)
    assert "answer_delta" not in order[order.index("answer_reset"):]


def test_links_stream_as_checked_tags(ask_client, fake):
    fake.load([text("Visit the {{link:downloads:activity}} page.\n"), stop()])
    events = ask(ask_client, "can I get the activity data?")
    assert re.search(r'<plink to="downloads:activity">Downloads</plink>', drafted(events))
