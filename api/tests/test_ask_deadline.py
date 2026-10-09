"""A turn has a clock. On 9 October 2026 one did not: the model stream went silent after the first
tool call, the turn sat for the service's whole 300 s request timeout, and the reader got an HTML
502 from the hosting edge. Nothing in the log said where it had stopped, because a turn logged
nothing between its first line and its last.

Held here: no further model call once the turn's deadline has passed, and the reader is told so
in the stream; a model call is handed how long it may stay silent, never longer than what is left
of the turn; a call cut for silence reads as "ask again" rather than as a model's error text; and
each model call logs a start and an end, so one that never returns shows as a start alone."""
import dataclasses
import logging
import time

import pytest
from fastapi.testclient import TestClient

from pakemis_api.ask.loop import ModelError
from test_ask import FakeModel, ask, only, stop, text, tool_use

CALL = tool_use("query_emissions", {"periods": ["FY2023-24"]})


class ClockedModel(FakeModel):
    """A FakeModel that accepts the loop's timeout, records it, and can be slow or silent."""
    accepts_timeout = True

    def __init__(self):
        super().__init__()
        self.timeouts = []
        self.delays = []          # seconds to wait before each call's script, in order
        self.raises = []          # an exception to raise instead of a script, in order

    def stream(self, system, messages, tools, timeout_s=None):
        self.timeouts.append(timeout_s)
        if self.delays:
            time.sleep(self.delays.pop(0))
        if self.raises:
            exc = self.raises.pop(0)
            if exc is not None:
                self.calls.append({"system": system, "messages": messages, "tools": tools})
                raise exc
        yield from super().stream(system, messages, tools)


@pytest.fixture(scope="module")
def fake():
    return ClockedModel()


@pytest.fixture(scope="module")
def ask_client(settings, fake):
    from pakemis_api.app import create_app
    with TestClient(create_app(settings, model_client=fake)) as c:
        yield c


@pytest.fixture
def limits(ask_client):
    """Set the turn's clock for one test and put the deployment's back."""
    runtime = ask_client.app.state.ask
    original = runtime.limits

    def set_limits(**changes):
        runtime.limits = dataclasses.replace(original, **changes)

    yield set_limits
    runtime.limits = original


def reset(fake, *scripts, delays=(), raises=()):
    fake.load(*scripts)
    fake.timeouts, fake.delays, fake.raises = [], list(delays), list(raises)


def test_the_defaults_fit_under_a_sixty_second_edge(ask_client):
    limits = ask_client.app.state.ask.limits
    assert 0 < limits.turn_seconds < 60 and 0 < limits.model_stall_seconds <= limits.turn_seconds


def test_no_model_call_starts_after_the_deadline_and_the_reader_is_told(ask_client, fake, limits):
    limits(turn_seconds=1, model_stall_seconds=1)
    reset(fake, [CALL, stop("tool_use")], [text("never reached"), stop()], delays=[1.2])
    events = ask(ask_client, "national total?")
    error = only(events, "error")[0]
    assert error["code"] == "turn_timeout" and "ask it again" in error["message"]
    assert not only(events, "answer") and only(events, "done")       # the stream still ends cleanly
    assert len(fake.calls) == 1                                       # the second model call was never made
    assert only(events, "tool_result")                                # what was already found stayed found


def test_a_model_call_is_handed_what_is_left_of_the_turn(ask_client, fake, limits):
    limits(turn_seconds=30, model_stall_seconds=20)
    reset(fake, [CALL, stop("tool_use")], [text("The total is {{result_1_cell_0}}."), stop()], delays=[0.6])
    ask(ask_client, "national total?")
    first, second = fake.timeouts
    assert first == 20                      # the stall limit, while the turn has more than that left
    assert 5 <= second <= 20
    limits(turn_seconds=8, model_stall_seconds=20)
    reset(fake, [text("ok"), stop()])
    ask(ask_client, "hello")
    assert 5 <= fake.timeouts[0] <= 8       # never longer than the turn itself
    limits(turn_seconds=0, model_stall_seconds=0)
    reset(fake, [text("ok"), stop()])
    ask(ask_client, "hello")
    assert fake.timeouts == [None]          # switched off: the model's own defaults


def test_a_call_cut_for_silence_reads_as_ask_again(ask_client, fake):
    reset(fake, raises=[ModelError("ReadTimeout: The read operation timed out")])
    events = ask(ask_client, "national total?")
    error = only(events, "error")[0]
    assert error["code"] == "turn_timeout" and "ReadTimeout" not in error["message"]
    reset(fake, raises=[ModelError("429 RESOURCE_EXHAUSTED: quota")])
    assert only(ask(ask_client, "national total?"), "error")[0]["code"] == "model_error"


def test_each_model_call_logs_a_start_and_an_end(ask_client, fake, caplog):
    reset(fake, [CALL, stop("tool_use")], [text("The total is {{result_1_cell_0}}."), stop()])
    with caplog.at_level(logging.INFO, logger="pakemis_api.ask"):
        ask(ask_client, "national total?")
    lines = [r.getMessage() for r in caplog.records if r.name.startswith("pakemis_api.ask")]
    starts = [l for l in lines if "starting at" in l]
    ends = [l for l in lines if "returned in" in l]
    assert len(starts) == 2 and len(ends) == 2
    assert any("ask tool call 1 (query_emissions)" in l for l in lines)
