"""Caps and prices for the agent, all overridable from the environment.

PAKEMIS_ASK_MAX_TURNS            model calls per user message (default 8)
PAKEMIS_ASK_MAX_TOOL_CALLS       tool calls per user message (default 12)
PAKEMIS_ASK_MAX_OUTPUT_TOKENS    max_tokens per model call (default 8000)
PAKEMIS_ASK_CONVERSATION_TOKENS  input+output tokens one conversation may spend (default 400000)
PAKEMIS_ASK_DAILY_TOKENS         input+output tokens the process may spend per UTC day (default 3000000)
PAKEMIS_ASK_PER_IP_PER_HOUR      POST /ask requests one client address may make per hour (default 60)
PAKEMIS_ASK_BUDGET_STORE         where the daily budget is counted: unset = this process's memory;
                                 `firestore` = one document a day that every instance adds to
PAKEMIS_ASK_BUDGET_COLLECTION    the Firestore collection holding those documents (default ask_budget)
PAKEMIS_TRUSTED_PROXIES          comma list of addresses/CIDRs that are this deployment's OWN proxies
                                 (default none); see client_address
PAKEMIS_ASK_EFFORT               output_config.effort for the model (default medium)

The price table is USD per million tokens (input, output); cache reads are billed at a tenth
of input and cache writes at five quarters. The estimate on the `done` event is exactly that,
an estimate: the invoice is the provider's.
"""
import ipaddress
import logging
import os
import threading
import time
from dataclasses import dataclass

log = logging.getLogger("pakemis_api.ask")

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
    # A TURN HAS A DEADLINE, AND IT IS SHORTER THAN THE EDGE'S. On 9 October 2026 one turn sat for
    # the service's whole 300 s request timeout: the model stream stalled after the first tool
    # call, nothing in the turn had a clock, and the hosting edge in front of the service gave the
    # reader an HTML 502 long before the service gave up. Past `turn_seconds` no further model
    # call is started and the reader is told, in the stream, to ask again; a model call that goes
    # silent is cut after `model_stall_seconds` or what is left of the turn, whichever is less.
    # 0 switches either off.
    turn_seconds: int = 50
    model_stall_seconds: int = 40
    # THE LAST CALL ANSWERS (2026-10-20). On 19 October a turn holding a successful result spent
    # its deadline on one more refused lookup and ended in "took too long". Once this little of
    # the turn is left and a tool has run, the next model call may not call a tool: it answers
    # from what it has. 0 switches it off.
    final_answer_seconds: int = 15

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
            turn_seconds=_int("PAKEMIS_ASK_TURN_SECONDS", cls.turn_seconds),
            model_stall_seconds=_int("PAKEMIS_ASK_MODEL_STALL_SECONDS", cls.model_stall_seconds),
            final_answer_seconds=_int("PAKEMIS_ASK_FINAL_ANSWER_SECONDS", cls.final_answer_seconds),
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


class FirestoreDayStore:
    """One document per UTC day in a Firestore collection, holding the tokens spent that day by
    every instance. `add` is an atomic server-side increment, so two instances adding at once both
    count. The client is made on first use: nothing imports the library until a deployment asks
    for this store."""

    TIMEOUT = 6.0     # seconds: the first call on a new instance opens the channel (about 4 s measured from far away), later ones are a fraction of one

    def __init__(self, collection="ask_budget", client=None):
        self.collection = collection
        self._client = client

    def _doc(self, day):
        if self._client is None:
            from google.cloud import firestore
            self._client = firestore.Client()
        return self._client.collection(self.collection).document(day)

    def read(self, day):
        snapshot = self._doc(day).get(timeout=self.TIMEOUT, retry=None)
        return int((snapshot.to_dict() or {}).get("tokens", 0)) if snapshot.exists else 0

    def add(self, day, tokens):
        from google.cloud import firestore
        self._doc(day).set({"tokens": firestore.Increment(int(tokens)), "updated": firestore.SERVER_TIMESTAMP},
                           merge=True, timeout=self.TIMEOUT, retry=None)


class SharedDailyBudget:
    """The daily budget counted ONCE, in a store every instance adds to.

    DailyBudget counts in this process's memory. That was honest for one process and stopped
    being so in production: the service runs up to four instances, each with its own count, and
    an instance that scales to zero starts again from nothing - so "3M tokens a day" was really
    3M per instance per start. This keeps the same two methods and puts the count where all of
    them see it.

    What is known here is the store's total as last read (`_remote`) plus what THIS instance has
    spent since that read (`_since`). The store is re-read at most every `refresh` seconds, so the
    check a turn makes costs no round trip; the price is that instances may together overshoot by
    what they can spend in that window.

    ⚠ A STORE THAT FAILS MUST NOT UNLOCK THE BUDGET, AND MUST NOT TAKE THE ASSISTANT DOWN. Every
    failure is logged and the count carries on from what is already known - which, if the store has
    never answered, is exactly DailyBudget's in-memory count. Tokens that could not be added are
    kept (`_unsent`) and offered again with the next spend."""

    def __init__(self, daily_tokens, store, refresh=15.0):
        self.daily_tokens = daily_tokens
        self.store = store
        self.refresh = refresh
        self._lock = threading.Lock()
        self._day = None
        self._remote = 0
        self._since = 0
        self._unsent = 0
        self._read_at = None

    def warm(self):
        """Read the day's total in the background, now. The first call on a new instance opens the
        store's channel and takes seconds; this spends them at start instead of inside somebody's
        first question."""
        threading.Thread(target=self.remaining, name="ask-budget-warm", daemon=True).start()

    @staticmethod
    def day_key(now):
        return time.strftime("%Y-%m-%d", time.gmtime(now))

    def _roll(self, now):
        day = self.day_key(now)
        if day != self._day:
            self._day, self._remote, self._since, self._unsent, self._read_at = day, 0, 0, 0, None

    def _sync(self, now):
        if self._read_at is not None and now - self._read_at < self.refresh:
            return
        self._read_at = now                       # a failing store is asked once per window, not per call
        try:
            total = self.store.read(self._day)
        except Exception:
            log.warning("the shared daily budget could not be read; counting on from %d", self._remote + self._since, exc_info=True)
            return
        # the store's total, plus what this instance spent and has not managed to add to it
        self._remote, self._since = total + self._unsent, 0

    def remaining(self, now=None):
        now = now if now is not None else time.time()
        with self._lock:
            self._roll(now)
            self._sync(now)
            return self.daily_tokens - (self._remote + self._since)

    def spend(self, tokens, now=None):
        now = now if now is not None else time.time()
        with self._lock:
            self._roll(now)
            self._since += tokens
            owed = self._unsent + tokens
            try:
                self.store.add(self._day, owed)
                self._unsent = 0
            except Exception:
                self._unsent = owed
                log.warning("the shared daily budget could not be written; %d tokens held to add later", owed, exc_info=True)


def build_budget(limits):
    """The daily budget this deployment asks for (PAKEMIS_ASK_BUDGET_STORE): in memory by default,
    shared through Firestore when named. An unknown store stops the start: a typo here would
    otherwise run a public assistant on the wrong budget and say nothing."""
    store = (os.environ.get("PAKEMIS_ASK_BUDGET_STORE") or "").strip().lower()
    if store == "":
        return DailyBudget(limits.daily_tokens)
    if store == "firestore":
        return SharedDailyBudget(limits.daily_tokens, FirestoreDayStore(os.environ.get("PAKEMIS_ASK_BUDGET_COLLECTION") or "ask_budget"))
    raise ValueError("PAKEMIS_ASK_BUDGET_STORE=%r is not a budget store this API knows (unset, or 'firestore')" % store)


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
