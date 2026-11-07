"""A model call is cut when it goes SILENT, not when a clock runs out while it is still working.

Until November 2026 the loop handed each model call "what is left of the turn" as a timeout, and
the Gemini SDK sends a timeout to the server as a total deadline (the X-Server-Timeout header).
A call that was thinking and writing the whole time was therefore killed at the deadline: on 7
November a Punjab vehicles question had 33 s left for its answer, Gemini was still producing it,
and the reader got "504 DEADLINE_EXCEEDED".

The stream itself is the heartbeat. While pieces arrive - thought summaries or answer text - the
model is working. `watched` reads the provider's stream on a worker thread and lets the loop wait
for the next piece with a clock of its own: nothing for `silent_s` seconds is a stall (`Silent`),
and running past `until` (the turn's safety cap) is `OutOfTime`. Every call also gets a
`CallTiming`, so the log says how long the model took to say anything, to start the answer, and
the longest it went quiet - the numbers the silence limit is tuned from.

The worker thread cannot be killed. A call abandoned for silence keeps its thread until the
provider's own stream ends, which the per-call timeout the loop still passes (the rest of the
turn) bounds; the thread then sees it was abandoned and closes the stream without delivering.
"""
import queue
import threading
import time
from dataclasses import dataclass

# how often the loop wakes while it waits, to check the clocks
POLL_S = 0.25


class Silent(Exception):
    """The model sent nothing for `silent_s` seconds."""

    def __init__(self, silent_s):
        super().__init__("the model sent nothing for %.0f s" % silent_s)
        self.silent_s = silent_s


class OutOfTime(Exception):
    """The turn's safety cap passed while this call was still running."""


@dataclass
class CallTiming:
    started: float
    first_piece_s: float = None       # anything at all: a thought, text or a tool call
    first_text_s: float = None        # the first piece of answer text
    longest_silence_s: float = 0.0
    pieces: int = 0
    _last: float = None

    def piece(self, kind, now):
        since = now - (self._last if self._last is not None else self.started)
        self.longest_silence_s = max(self.longest_silence_s, since)
        self._last = now
        self.pieces += 1
        if self.first_piece_s is None:
            self.first_piece_s = now - self.started
        if kind == "text_delta" and self.first_text_s is None:
            self.first_text_s = now - self.started

    def close(self, now):
        """The silence from the last piece to the end counts too."""
        self.longest_silence_s = max(self.longest_silence_s, now - (self._last if self._last is not None else self.started))

    def summary(self, now=None):
        now = time.time() if now is None else now
        fmt = lambda v: "-" if v is None else "%.1f s" % v      # noqa: E731
        return "first piece %s, first answer text %s, longest silence %.1f s, %d pieces, %.1f s in all" % (
            fmt(self.first_piece_s), fmt(self.first_text_s), self.longest_silence_s, self.pieces, now - self.started)


def watched(stream, silent_s=None, until=None, timing=None):
    """Yield `stream`'s events, raising Silent after `silent_s` seconds without one and OutOfTime
    once `until` (a time.time() value) passes. Either may be None/0 for no limit. The provider's
    own exceptions are raised here, in the caller's thread."""
    timing = timing or CallTiming(started=time.time())
    q = queue.Queue()
    abandoned = threading.Event()

    def work():
        it = iter(stream)
        try:
            for ev in it:
                if abandoned.is_set():
                    break
                q.put(("event", ev))
            else:
                q.put(("end", None))
        except BaseException as exc:          # noqa: BLE001 - handed to the caller's thread
            q.put(("error", exc))
        finally:
            if abandoned.is_set():
                close = getattr(it, "close", None)
                if close is not None:
                    try:
                        close()
                    except Exception:        # noqa: BLE001 - nobody is listening any more
                        pass

    threading.Thread(target=work, name="ask-model-stream", daemon=True).start()
    try:
        while True:
            try:
                kind, value = q.get(timeout=POLL_S)
            except queue.Empty:
                now = time.time()
                last = timing._last if timing._last is not None else timing.started
                if silent_s and now - last >= silent_s:
                    timing.close(now)
                    raise Silent(silent_s)
                if until and now >= until:
                    timing.close(now)
                    raise OutOfTime()
                continue
            if kind == "end":
                timing.close(time.time())
                return
            if kind == "error":
                timing.close(time.time())
                raise value
            timing.piece(getattr(value, "kind", ""), time.time())
            yield value
    finally:
        abandoned.set()
