"""A turn has a clock, and a model call is cut for SILENCE, not for taking long.

On 9 October 2026 a model stream went silent after the first tool call and the turn sat for the
service's whole 300 s request timeout, so the turn got a clock. On 7 November that clock killed an
answer that was still being written: the loop handed Gemini "what is left of the turn" as a timeout,
the SDK sent it as a total deadline, and the reader got "504 DEADLINE_EXCEEDED" after 50 s.

Held here: a call that keeps sending is never cut, however long it takes; a call that sends nothing
for `model_stall_seconds` is cut and retried once, as is a call the provider fails with a passing
server error; a request the provider rejects is not retried; half an answer from a failed call is
taken back; a timeout of any kind reads as "ask again"; no model call starts after the turn's cap;
the cap is generous in code and pinned under Firebase Hosting's 60 s in the deploy that still sits
behind it; and each call logs a start and an end with its timings."""
import dataclasses
import logging
import re
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pakemis_api.ask.loop import ModelError, ModelEvent
from test_ask import FakeModel, ask, only, stop, text, tool_use

CALL = tool_use("query_emissions", {"periods": ["FY2023-24"]})
ANSWER = [text("The total is {{result_1_cell_0}}."), stop()]
CLOUDBUILD = Path(__file__).resolve().parents[2] / "cloudbuild.yaml"


def thinking(t="..."):
    return ModelEvent("thinking_delta", text=t)


class PlanModel(FakeModel):
    """Each call plays one plan: a ModelEvent is sent, a number is a pause of that many seconds and
    an exception is raised there. The plan is taken when the call is made, so a call abandoned
    mid-pause cannot take the next call's plan when it wakes."""
    accepts_timeout = True

    def __init__(self):
        super().__init__()
        self.timeouts = []

    def load(self, *plans):
        super().load(*plans)
        self.timeouts = []

    def stream(self, system, messages, tools, timeout_s=None):
        self.timeouts.append(timeout_s)
        self.calls.append({"system": system, "messages": messages, "tools": tools})
        if not self.scripts:
            raise AssertionError("PlanModel has no plan left for call %d" % len(self.calls))
        return self._play(self.scripts.pop(0))

    @staticmethod
    def _play(plan):
        for step in plan:
            if isinstance(step, (int, float)):
                time.sleep(step)
            elif isinstance(step, BaseException):
                raise step
            else:
                yield step


@pytest.fixture(scope="module")
def fake():
    return PlanModel()


@pytest.fixture(scope="module")
def ask_client(settings, fake):
    from pakemis_api.app import create_app
    with TestClient(create_app(settings, model_client=fake)) as c:
        yield c


@pytest.fixture
def limits(ask_client):
    """Set the turn's clocks for one test and put the deployment's back."""
    runtime = ask_client.app.state.ask
    original = runtime.limits

    def set_limits(**changes):
        runtime.limits = dataclasses.replace(original, **changes)

    yield set_limits
    runtime.limits = original


def phases(events, phase):
    return [s for s in only(events, "status") if s.get("phase") == phase]


# -- the clocks themselves ------------------------------------------------------------------------

def test_the_cap_is_generous_and_the_deploy_behind_firebase_pins_it_under_sixty(ask_client):
    limits = ask_client.app.state.ask.limits
    assert limits.turn_seconds >= 120                        # a cap on a runaway turn, not a target
    assert 0 < limits.model_stall_seconds < limits.turn_seconds and limits.model_retries >= 1
    deploy = CLOUDBUILD.read_text(encoding="utf-8")
    pinned = re.search(r'^\s*_ASK_TURN_SECONDS:\s*"?(\d+)"?', deploy, re.M)
    assert pinned and 0 < int(pinned.group(1)) < 60          # Hosting ends a request at 60 s
    assert "PAKEMIS_ASK_TURN_SECONDS=${_ASK_TURN_SECONDS}" in deploy


def test_no_model_call_starts_after_the_deadline_and_the_reader_is_told(ask_client, fake, limits):
    limits(turn_seconds=1, model_stall_seconds=5)
    fake.load([1.2, CALL, stop("tool_use")], [text("never reached"), stop()])
    events = ask(ask_client, "national total?")
    error = only(events, "error")[0]
    assert error["code"] == "turn_timeout" and "ask it again" in error["message"]
    assert not only(events, "answer") and only(events, "done")       # the stream still ends cleanly
    assert len(fake.calls) == 1                                       # the second model call was never made
    assert only(events, "tool_result")                                # what was already found stayed found


def test_the_provider_is_handed_the_rest_of_the_turn_never_the_silence_limit(ask_client, fake, limits):
    limits(turn_seconds=30, model_stall_seconds=5)
    fake.load([0.3, CALL, stop("tool_use")], ANSWER)
    ask(ask_client, "national total?")
    first, second = fake.timeouts
    assert 29 <= first <= 30 and 25 <= second < first        # what is left of the turn, not 5
    limits(turn_seconds=0, model_stall_seconds=5)
    fake.load([text("ok"), stop()])
    ask(ask_client, "hello")
    assert fake.timeouts == [None]                           # no cap: the provider's own defaults


# -- silence ---------------------------------------------------------------------------------------

def test_a_call_that_keeps_sending_is_not_cut_however_long_it_takes(ask_client, fake, limits):
    """The 7 November failure: an answer still being written. Here it takes 3 s against a 1 s
    silence limit, sending something every 0.4 s, and it arrives whole."""
    limits(turn_seconds=30, model_stall_seconds=1)
    working = []
    for _ in range(7):
        working += [0.4, thinking()]
    fake.load([CALL, stop("tool_use")], working + [text("The total is {{result_1_cell_0}}."), stop()])
    events = ask(ask_client, "national total?")
    assert only(events, "answer") and not only(events, "error") and not phases(events, "retry")


def test_a_silent_call_is_retried_once_and_the_retry_answers(ask_client, fake, limits):
    limits(turn_seconds=30, model_stall_seconds=1)
    fake.load([CALL, stop("tool_use")], [3, text("never sent"), stop()], ANSWER)
    events = ask(ask_client, "national total?")
    assert phases(events, "retry") == [{"phase": "retry", "attempt": 2, "reason": "silent"}]
    assert only(events, "answer") and not only(events, "error")
    assert len(fake.calls) == 3


def test_a_call_silent_twice_ends_in_ask_again(ask_client, fake, limits):
    limits(turn_seconds=30, model_stall_seconds=1)
    fake.load([3, text("never")], [3, text("never")])
    events = ask(ask_client, "national total?")
    error = only(events, "error")[0]
    assert error["code"] == "turn_timeout"
    assert "nothing for 1 s" in error["message"] and "tried 2 times" in error["message"]
    assert "ask it again" in error["message"] and only(events, "done")


# -- provider errors -------------------------------------------------------------------------------

def test_a_passing_server_error_is_retried_and_a_rejected_request_is_not(ask_client, fake, limits):
    limits(turn_seconds=30, model_stall_seconds=5)
    fake.load([ModelError("ServerError: 503 UNAVAILABLE: The model is overloaded.")], [text("Hello."), stop()])
    events = ask(ask_client, "hello")
    assert phases(events, "retry") == [{"phase": "retry", "attempt": 2, "reason": "error"}]
    assert only(events, "answer") and len(fake.calls) == 2
    fake.load([ModelError("ClientError: 400 INVALID_ARGUMENT: bad schema")], [text("never"), stop()])
    events = ask(ask_client, "hello")
    assert not phases(events, "retry") and len(fake.calls) == 1
    assert only(events, "error")[0] == {"code": "model_error", "message": "ClientError: 400 INVALID_ARGUMENT: bad schema"}


def test_the_providers_deadline_reads_as_ask_again(ask_client, fake, limits):
    """What the reader saw on 7 November, raised by both attempts."""
    limits(turn_seconds=30, model_stall_seconds=5)
    deadline = "ServerError: 504 DEADLINE_EXCEEDED: Deadline expired before operation could complete."
    fake.load([ModelError(deadline)], [ModelError(deadline)])
    error = only(ask(ask_client, "how many vehicles are there in Punjab?"), "error")[0]
    assert error["code"] == "turn_timeout"
    assert "DEADLINE" not in error["message"] and "504" not in error["message"] and "ask it again" in error["message"]
    fake.load([ModelError("ReadTimeout: The read operation timed out")], [ModelError("ReadTimeout: The read operation timed out")])
    error = only(ask(ask_client, "national total?"), "error")[0]
    assert error["code"] == "turn_timeout" and "ReadTimeout" not in error["message"]


def test_no_retry_starts_without_room_to_finish(ask_client, fake, limits):
    limits(turn_seconds=5, model_stall_seconds=5)
    fake.load([ModelError("ServerError: 503 UNAVAILABLE: busy")], [text("never"), stop()])
    events = ask(ask_client, "hello")
    assert not phases(events, "retry") and len(fake.calls) == 1
    assert only(events, "error")[0]["code"] == "model_error"


def test_half_an_answer_from_a_failed_call_is_taken_back_before_the_retry(ask_client, fake, limits):
    limits(turn_seconds=30, model_stall_seconds=5)
    fake.load([CALL, stop("tool_use")],
              [text("The total is {{result_1_cell_0}}.\n"), ModelError("ServerError: 503 UNAVAILABLE: dropped")],
              ANSWER)
    events = ask(ask_client, "national total?")
    names = [name for name, _ in events]
    first_delta, reset_at, retry_at = names.index("answer_delta"), names.index("answer_reset"), names.index("status", names.index("answer_reset"))
    assert first_delta < reset_at < retry_at
    assert only(events, "answer_reset") == [{"reason": "retry"}]
    assert only(events, "answer") and not only(events, "error")


# -- the log ---------------------------------------------------------------------------------------

def test_each_model_call_logs_a_start_and_an_end_with_its_timings(ask_client, fake, caplog):
    fake.load([CALL, stop("tool_use")], [thinking(), text("The total is {{result_1_cell_0}}."), stop()])
    with caplog.at_level(logging.INFO, logger="pakemis_api.ask"):
        ask(ask_client, "national total?")
    lines = [r.getMessage() for r in caplog.records if r.name.startswith("pakemis_api.ask")]
    starts = [l for l in lines if "starting at" in l]
    ends = [l for l in lines if "returned in" in l]
    assert len(starts) == 2 and len(ends) == 2
    assert "first piece" in ends[1] and "first answer text" in ends[1] and "longest silence" in ends[1]
    assert any("ask tool call 1 (query_emissions)" in l for l in lines)


def test_a_failed_call_logs_why_and_its_timings(ask_client, fake, limits, caplog):
    limits(turn_seconds=30, model_stall_seconds=1)
    fake.load([thinking(), 3, text("never")], [text("Hello."), stop()])
    with caplog.at_level(logging.INFO, logger="pakemis_api.ask"):
        ask(ask_client, "hello")
    failed = [r.getMessage() for r in caplog.records if "failed (silent)" in r.getMessage()]
    assert len(failed) == 1 and "1 pieces" in failed[0]
    assert any("(retry 1) starting at" in r.getMessage() for r in caplog.records)
