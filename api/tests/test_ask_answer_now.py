"""The question that ran out of time: "how many cars are there in Punjab?" (19 October 2026).

The live turn made five model calls and five query_activity calls in 50 s. Four were refused,
because the vehicle registers are held by district and nothing named "Punjab". One returned
rows, and the turn still ended in "took too long". Held here:

- the province is a place for the activity query, so the question is one call and one answer,
  and its total is the sum of the province's districts at one register date, marked as computed;
- two refusals of one tool end the looking: the next model call may not call a tool, and is
  told why beside the refusal;
- a turn nearly out of time, with a result in hand, answers instead of looking again;
- the timeout message says what was tried.

The model is scripted; what is under test is what the server hands it and what it lets through.
"""
import csv
import dataclasses
import json
import os
import time
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from test_ask import FakeModel, ask, only, stop, text, tool_use

VEHICLES = "fact_activity_vehicles"
REGISTERED = "Registered vehicles"
CARS = "Small cars (4W1)"


class AnswerOnlyModel(FakeModel):
    """A FakeModel that takes the loop's timeout and answer-only switch and records both."""
    accepts_timeout = True
    accepts_answer_only = True

    def __init__(self):
        super().__init__()
        self.answer_only = []
        self.delays = []

    def stream(self, system, messages, tools, timeout_s=None, answer_only=False):
        self.answer_only.append(answer_only)
        if self.delays:
            time.sleep(self.delays.pop(0))
        yield from super().stream(system, messages, tools)


@pytest.fixture(scope="module")
def fake():
    return AnswerOnlyModel()


@pytest.fixture(scope="module")
def ask_client(settings, fake):
    from pakemis_api.app import create_app
    with TestClient(create_app(settings, model_client=fake)) as c:
        yield c


@pytest.fixture
def limits(ask_client):
    runtime = ask_client.app.state.ask
    original = runtime.limits

    def set_limits(**changes):
        runtime.limits = dataclasses.replace(original, **changes)

    yield set_limits
    runtime.limits = original


def reset(fake, *scripts, delays=()):
    fake.load(*scripts)
    fake.answer_only, fake.delays = [], list(delays)


@pytest.fixture(scope="module")
def punjab(settings):
    """Punjab's newest car register, from the release's own table: its date and its district rows."""
    path = os.path.join(settings.semantic_dir, VEHICLES + ".csv")
    with open(path, encoding="utf-8-sig", newline="") as handle:
        rows = [r for r in csv.DictReader(line for line in handle if not line.startswith("#"))
                if r["Province"] == "Punjab" and r["Measure"] == REGISTERED and r["Vehicle class"] == CARS]
    assert rows, "the release holds no Punjab car register"
    newest = max(r["Period"] for r in rows)
    return {"period": newest, "rows": [r for r in rows if r["Period"] == newest]}


def punjab_call(**extra):
    return dict({"table": VEHICLES, "measure": REGISTERED, "locations": ["Punjab"],
                 "categories": [CARS], "total": True}, **extra)


def test_punjab_is_one_call_and_its_total_is_its_districts_at_one_date(ask_client, fake, punjab):
    n = len(punjab["rows"])
    reset(fake, [tool_use("query_activity", punjab_call()), stop("tool_use")],
          [text("Punjab's districts held {{result_1_cell_%d}} {{result_1_cell_%d.unit}} at the register's "
                "date - motor cars, jeeps and station wagons - summed here over its districts." % (n, n)), stop()])
    events = ask(ask_client, "how many cars are there in punjab?")
    assert not only(events, "refusal") and not only(events, "error")
    assert len(fake.calls) == 2                       # one lookup, one answer
    cells = json.loads(fake.calls[1]["messages"][-1]["content"][0]["content"])["cells"]
    assert len(cells) == n + 1
    total = cells[-1]
    assert total["display"] == "{:,}".format(int(sum(Decimal(r["Value"]) for r in punjab["rows"])))
    assert total["attrs"]["period"] == punjab["period"]
    assert "district rows of Punjab's register" in total["interpretation"]
    assert only(events, "answer")


def test_two_refusals_of_one_tool_end_the_looking(ask_client, fake):
    """The 19 October shape: the same tool refused again and again until the deadline."""
    bad = {"table": VEHICLES, "measure": REGISTERED, "locations": ["Nowhere"]}
    worse = dict(bad, locations=["Nowhere either"])
    reset(fake, [tool_use("query_activity", bad), stop("tool_use")],
          [tool_use("query_activity", worse), stop("tool_use")],
          [text("The registers are held by district; no record names that place."), stop()])
    events = ask(ask_client, "how many cars are there in nowhere?")
    assert len(only(events, "refusal")) == 2
    assert fake.answer_only == [False, False, True]   # the third call may not call a tool
    told = fake.calls[2]["messages"][-1]["content"]
    assert any("Do not call a tool again" in str(block.get("content", "")) for block in told)
    assert any(s.get("phase") == "answer_now" and s.get("reason") == "refusals" for s in only(events, "status"))
    assert only(events, "answer")


def test_a_turn_nearly_out_of_time_answers_with_what_it_has(ask_client, fake, limits, punjab):
    limits(turn_seconds=10, model_stall_seconds=10, final_answer_seconds=9)
    n = len(punjab["rows"])
    reset(fake, [tool_use("query_activity", punjab_call()), stop("tool_use")],
          [text("Punjab: {{result_1_cell_%d}} {{result_1_cell_%d.unit}}." % (n, n)), stop()],
          delays=[1.5])
    events = ask(ask_client, "how many cars are there in punjab?")
    assert fake.answer_only == [False, True]
    assert any(s.get("phase") == "answer_now" and s.get("reason") == "deadline" for s in only(events, "status"))
    told = fake.calls[1]["messages"][-1]["content"]
    assert any(block.get("type") == "text" and "nearly up" in block.get("text", "") for block in told)
    assert only(events, "answer") and not only(events, "error")


def test_the_answer_window_waits_for_a_result(ask_client, fake, limits):
    """With nothing found yet there is nothing to answer from, so the window does not open."""
    limits(turn_seconds=10, model_stall_seconds=10, final_answer_seconds=10)
    reset(fake, [text("Hello."), stop()])
    ask(ask_client, "hello")
    assert fake.answer_only == [False]


def test_the_timeout_says_what_was_tried(ask_client, fake, limits):
    # the 1.2 s call is inside the silence limit; it is the turn's clock that ends the turn
    limits(turn_seconds=1, model_stall_seconds=5, final_answer_seconds=0)
    bad = {"table": VEHICLES, "measure": REGISTERED, "locations": ["Nowhere"]}
    reset(fake, [tool_use("query_activity", bad), stop("tool_use")], [text("never"), stop()], delays=[1.2])
    events = ask(ask_client, "how many cars are there in nowhere?")
    error = only(events, "error")[0]
    assert error["code"] == "turn_timeout"
    assert "1 lookup (query_activity x1), 1 of them refused" in error["message"]
