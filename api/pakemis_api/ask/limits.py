"""Caps and prices for the agent, all overridable from the environment.

PAKEMIS_ASK_MAX_TURNS            model calls per user message (default 8)
PAKEMIS_ASK_MAX_TOOL_CALLS       tool calls per user message (default 12)
PAKEMIS_ASK_MAX_OUTPUT_TOKENS    max_tokens per model call (default 8000)
PAKEMIS_ASK_CONVERSATION_TOKENS  input+output tokens one conversation may spend (default 400000)
PAKEMIS_ASK_DAILY_TOKENS         input+output tokens the process may spend per UTC day (default 3000000)
PAKEMIS_ASK_PER_IP_PER_HOUR      POST /ask requests one client address may make per hour (default 60)
PAKEMIS_TRUSTED_PROXIES          comma list of addresses/CIDRs that are this deployment's OWN proxies
                                 (default none); see client_address
PAKEMIS_ASK_EFFORT               output_config.effort for the model (default medium)

The price table is USD per million tokens (input, output); cache reads are billed at a tenth
of input and cache writes at five quarters. The estimate on the `done` event is exactly that,
an estimate: the invoice is the provider's.
"""
import ipaddress
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
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-2.5-pro": (1.25, 10.0),
    # gemini-3.1-pro-preview: no published price at the time of writing -> cost_estimate_usd None
}
CACHE_READ_FACTOR = 0.1
CACHE_WRITE_FACTOR = 1.25
# ONE SET OF WEIGHTS FOR THE INVOICE AND THE CAP. The cost display discounted a cache read to a
# tenth and the budget counted it at full weight, and that disagreement is what drained the
# conversation cap: a turn that makes eight model calls replays the whole cached prefix eight
# times, so one looping question charged the prefix over and over at full price against a 400k cap
# its real content never approached. The next question then died on `budget_exhausted` before it
# ran. The budget has no reason to disagree with what is actually billed.
BUDGET_WEIGHTS = {"input_tokens": 1.0, "output_tokens": 1.0,
                  "cache_read_input_tokens": CACHE_READ_FACTOR,
                  "cache_creation_input_tokens": CACHE_WRITE_FACTOR}


def _int(name, default):
    raw = os.environ.get(name)
    return int(raw) if raw not in (None, "") else default


def parse_networks(raw):
    """A comma list of addresses or CIDRs -> networks; a typo stops the start rather than
    silently trusting nothing (or everything)."""
    return tuple(ipaddress.ip_network(part.strip(), strict=False) for part in (raw or "").split(",") if part.strip())


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
    trusted_proxies: tuple = ()

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
            trusted_proxies=parse_networks(os.environ.get("PAKEMIS_TRUSTED_PROXIES")),
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
    """Tokens charged against the budgets, weighted the way the bill weights them."""
    return int(round(sum((usage.get(k, 0) or 0) * w for k, w in BUDGET_WEIGHTS.items())))


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


def _is_trusted(hop, trusted):
    try:
        address = ipaddress.ip_address(hop)
    except ValueError:
        return False
    return any(address in network for network in trusted)


def client_address(forwarded_for, peer, trusted=()):
    """The address a request is rate-limited under: the RIGHT-MOST X-Forwarded-For hop that is not
    one of this deployment's own proxies.

    Every proxy appends the address it received the request from, so the header reads
    `<whatever the client sent>, <client>, <our proxies...>`. The left-most entry is therefore the
    one part a caller writes for themselves: keying on it (which this did until the API went
    public) let anyone mint a fresh bucket per request by sending a different value each time.
    Read from the right instead, skipping only hops in `trusted`, and the first address reached is
    one a proxy of ours observed.

    With nothing trusted this is the last hop: correct for a caller that reaches the service
    directly, and for one behind an edge it is the EDGE's address. A single edge address would put
    every reader in one bucket; an edge that answers from a pool (Firebase Hosting's did, a
    different address on every request when measured) puts every REQUEST in its own, and the limit
    silently stops limiting. Naming the edge's ranges in PAKEMIS_TRUSTED_PROXIES fixes both."""
    hops = [hop.strip() for hop in (forwarded_for or "").split(",") if hop.strip()]
    for hop in reversed(hops):
        if not _is_trusted(hop, trusted):
            return hop
    return hops[0] if hops else (peer or "unknown")


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
