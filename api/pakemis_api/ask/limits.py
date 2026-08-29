"""Caps and prices for the agent, all overridable from the environment.

PAKEMIS_ASK_MAX_TURNS            model calls per user message (default 8)
PAKEMIS_ASK_MAX_TOOL_CALLS       tool calls per user message (default 12)
PAKEMIS_ASK_MAX_OUTPUT_TOKENS    max_tokens per model call (default 8000)
PAKEMIS_ASK_CONVERSATION_TOKENS  input+output tokens one conversation may spend (default 400000)
PAKEMIS_ASK_DAILY_TOKENS         input+output tokens the process may spend per UTC day (default 3000000)
PAKEMIS_ASK_PER_IP_PER_HOUR      /v1/ask requests one client address may make per hour (default 60)
PAKEMIS_ASK_EFFORT               output_config.effort for the model (default medium)

The price table is USD per million tokens (input, output); cache reads are billed at a tenth
of input and cache writes at five quarters. The estimate on the `done` event is exactly that,
an estimate: the invoice is the provider's.
"""
import os
import threading
import time
from dataclasses import dataclass

PRICE_PER_MTOK = {
    "claude-sonnet-5": (2.0, 10.0),
    "claude-opus-5": (5.0, 25.0),
    "claude-opus-4-8": (5.0, 25.0),
    "claude-opus-4-7": (5.0, 25.0),
    "claude-opus-4-6": (5.0, 25.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
}
CACHE_READ_FACTOR = 0.1
CACHE_WRITE_FACTOR = 1.25


def _int(name, default):
    raw = os.environ.get(name)
    return int(raw) if raw not in (None, "") else default


@dataclass(frozen=True)
class Limits:
    max_turns: int = 8
    max_tool_calls: int = 12
    max_output_tokens: int = 8000
    conversation_tokens: int = 400_000
    daily_tokens: int = 3_000_000
    per_ip_per_hour: int = 60
    effort: str = "medium"
    max_cells_for_model: int = 60

    @classmethod
    def from_env(cls):
        return cls(
            max_turns=_int("PAKEMIS_ASK_MAX_TURNS", cls.max_turns),
            max_tool_calls=_int("PAKEMIS_ASK_MAX_TOOL_CALLS", cls.max_tool_calls),
            max_output_tokens=_int("PAKEMIS_ASK_MAX_OUTPUT_TOKENS", cls.max_output_tokens),
            conversation_tokens=_int("PAKEMIS_ASK_CONVERSATION_TOKENS", cls.conversation_tokens),
            daily_tokens=_int("PAKEMIS_ASK_DAILY_TOKENS", cls.daily_tokens),
            per_ip_per_hour=_int("PAKEMIS_ASK_PER_IP_PER_HOUR", cls.per_ip_per_hour),
            effort=os.environ.get("PAKEMIS_ASK_EFFORT") or cls.effort,
        )


def cost_estimate_usd(model_id, usage):
    """usage: {input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens}."""
    price = PRICE_PER_MTOK.get(model_id)
    if price is None:
        return None
    in_price, out_price = price
    usd = (usage.get("input_tokens", 0) * in_price
           + usage.get("cache_read_input_tokens", 0) * in_price * CACHE_READ_FACTOR
           + usage.get("cache_creation_input_tokens", 0) * in_price * CACHE_WRITE_FACTOR
           + usage.get("output_tokens", 0) * out_price) / 1_000_000
    return round(usd, 6)


def usage_total(usage):
    return sum(usage.get(k, 0) for k in ("input_tokens", "output_tokens", "cache_read_input_tokens",
                                          "cache_creation_input_tokens"))


class DailyBudget:
    """Tokens spent since 00:00 UTC; resets when the day changes."""

    def __init__(self, daily_tokens):
        self.daily_tokens = daily_tokens
        self._lock = threading.Lock()
        self._day = None
        self._spent = 0

    def _roll(self, now):
        day = int(now // 86400)
        if day != self._day:
            self._day, self._spent = day, 0

    def remaining(self, now=None):
        with self._lock:
            self._roll(now if now is not None else time.time())
            return self.daily_tokens - self._spent

    def spend(self, tokens, now=None):
        with self._lock:
            self._roll(now if now is not None else time.time())
            self._spent += tokens


class PerIpBucket:
    """A fixed one-hour window per client address."""

    def __init__(self, per_hour):
        self.per_hour = per_hour
        self._lock = threading.Lock()
        self._hits = {}

    def allow(self, ip, now=None):
        now = now if now is not None else time.time()
        with self._lock:
            window = [t for t in self._hits.get(ip, ()) if now - t < 3600]
            if len(window) >= self.per_hour:
                self._hits[ip] = window
                return False
            window.append(now)
            self._hits[ip] = window
            return True
