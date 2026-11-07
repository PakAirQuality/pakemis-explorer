"""The agent loop: an injectable model, the locked engine, and the server-side rendering gate.

ModelClient.stream(system, messages, tools) yields ModelEvents:
    thinking_delta(text) | text_delta(text) | tool_use(id, name, input) | stop(stop_reason, usage, content)
`content` on the stop event is the assistant's content blocks exactly as the provider returned
them (thinking blocks keep their signatures) so the next call of the same turn can replay them;
a client that gives none gets a synthesised text+tool_use message.

run_turn(...) is a generator of (event_name, payload) pairs: the SSE stream of one user message.
"""
import collections
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Iterator, Protocol

from pydantic import ValidationError

from pakemis_api import models_gen as G
from pakemis_api.ask import prompt as PROMPT
from pakemis_api.ask.limits import Limits, cost_estimate_usd, usage_total
from pakemis_api.ask.render import BareNumberError, UnknownPlaceholderError, render_multi
from pakemis_api.ask.tools import DOWNLOAD_TOOL, FUNCTION_MODEL, MAP_TOOL, ToolInputError, validate_map_view
from pakemis_api.ask.watch import CallTiming, OutOfTime, Silent, watched
from pakemis_api.settings import API_PREFIX
from pakemis_query import errors as E
from pakemis_query.placeholders import PlaceholderError

log = logging.getLogger("pakemis_api.ask")

# WHEN THE TURN STOPS LOOKING AND ANSWERS (2026-10-20). On 19 October one question spent its whole
# 50 s on four refused calls to the same tool, the last one after a call that had succeeded, and
# the reader got "took too long" instead of the figure already in hand. Two refusals of one tool,
# or a turn nearly out of time with any result in hand, now end the looking: the next model call
# may not call a tool and is told why.
REFUSALS_BEFORE_ANSWER = 2
ANSWER_AFTER_REFUSALS = ("%d calls to %s have now been refused for this question. Do not call a "
                         "tool again: answer now from the results you have, and say what the release "
                         "holds and where, as the refusals state it.")
ANSWER_BEFORE_DEADLINE = ("Time for this question is nearly up. Do not call a tool again: answer now "
                          "from the results already obtained, and say plainly what is not covered.")

# A RETRY NEEDS ROOM, AND A BUSY SERVICE A MOMENT. No retry starts with less than this much of the
# turn left (it could not finish), and a retry after a server error waits this long first.
RETRY_MIN_LEFT_S = 10.0
RETRY_PAUSE_S = 1.0
# what a provider says when the fault is its own and passing: a server error, an overloaded or
# unreachable service, a deadline its side ran out of, a connection dropped mid-stream. A 429 is
# not here - Gemini's fallback chain answers that (ask/gemini.py) - nor is anything about the request.
_TRANSIENT = re.compile(r"\b(500|502|503|504)\b|UNAVAILABLE|DEADLINE_EXCEEDED|INTERNAL|OVERLOADED|"
                        r"TIMEOUT|TIMED OUT|CONNECT|REMOTEPROTOCOL|READERROR|CONNECTION RESET|INCOMPLETE", re.IGNORECASE)
_TIMED_OUT = re.compile(r"DEADLINE|TIMEOUT|TIMED OUT", re.IGNORECASE)


def retryable_model_error(exc):
    """Whether a ModelError is the provider's passing fault, so asking again may work."""
    return bool(_TRANSIENT.search(str(exc)))


def call_failure_payload(kind, exc, attempts):
    """The reader's error for a model call that failed for good: plain words for what they can do
    about it. A timeout of any kind is "ask again" (`turn_timeout`), never the provider's text -
    "504 DEADLINE_EXCEEDED" reached a reader on 7 November because only "timeout" was matched."""
    tried = " It was tried %d times." % attempts if attempts > 1 else ""
    if kind == "silent":
        return {"code": "turn_timeout",
                "message": "The assistant stopped responding (nothing for %.0f s) and was cut off.%s "
                           "Nothing was lost: ask it again." % (exc.silent_s, tried)}
    if kind == "cap" or _TIMED_OUT.search(str(exc)):
        return {"code": "turn_timeout",
                "message": "The assistant took too long over this question and stopped.%s Nothing was lost: "
                           "ask it again, or ask for one thing at a time." % tried}
    if kind == "transient":
        return {"code": "model_error",
                "message": "The assistant's model service is having trouble right now (%s).%s Ask again in a moment."
                           % (str(exc)[:160], tried)}
    return {"code": "model_error", "message": str(exc)}


def _instruct(messages, text):
    """Add an instruction to the turn without breaking the role order: beside the tool results
    when they are the last message, else as a user message of its own."""
    last = messages[-1] if messages else None
    if last and last.get("role") == "user" and isinstance(last.get("content"), list):
        last["content"] = list(last["content"]) + [{"type": "text", "text": text}]
    else:
        messages.append({"role": "user", "content": text})
USAGE_KEYS = ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")


@dataclass
class ModelEvent:
    kind: str                      # thinking_delta | text_delta | tool_use | stop
    text: str = ""
    id: str = ""
    name: str = ""
    input: dict = field(default_factory=dict)
    stop_reason: str = ""
    usage: dict = field(default_factory=dict)
    content: list = None           # provider content blocks to replay (stop only)


class ModelClient(Protocol):
    model_id: str

    def stream(self, system: str, messages: list, tools: list) -> Iterator[ModelEvent]: ...


class ModelError(RuntimeError):
    pass


class AnthropicModel:
    """client.messages.stream with a cached system block, adaptive summarised thinking and an
    effort level; falls back to no thinking parameter if the installed SDK does not type it."""

    def __init__(self, model_id, max_tokens=8000, effort="medium"):
        self.model_id = model_id
        self.max_tokens = max_tokens
        self.effort = effort
        self._client = None
        self._thinking = self._thinking_param()

    @staticmethod
    def _thinking_param():
        try:
            from anthropic.types import ThinkingConfigAdaptiveParam  # noqa: F401
            return {"type": "adaptive", "display": "summarized"}
        except ImportError:
            return None

    @property
    def client(self):
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic()          # the key comes from the environment, never from settings
        return self._client

    # the loop may hand stream() a timeout: how long this one call may stay silent (see Limits)
    accepts_timeout = True
    accepts_answer_only = True

    def stream(self, system, messages, tools, timeout_s=None, answer_only=False):
        import anthropic
        kwargs = dict(model=self.model_id, max_tokens=self.max_tokens, tools=tools, messages=messages,
                      system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}])
        if answer_only:
            kwargs["tool_choice"] = {"type": "none"}
        if timeout_s:
            kwargs["timeout"] = float(timeout_s)
        if self._thinking:
            kwargs["thinking"] = self._thinking
        if self.effort:
            kwargs["output_config"] = {"effort": self.effort}
        try:
            with self.client.messages.stream(**kwargs) as stream:
                for event in stream:
                    if event.type == "content_block_delta":
                        if event.delta.type == "thinking_delta" and event.delta.thinking:
                            yield ModelEvent("thinking_delta", text=event.delta.thinking)
                        elif event.delta.type == "text_delta" and event.delta.text:
                            yield ModelEvent("text_delta", text=event.delta.text)
                final = stream.get_final_message()
        except anthropic.APIError as exc:
            raise ModelError("%s: %s" % (type(exc).__name__, getattr(exc, "message", str(exc)))) from exc
        for block in final.content:
            if block.type == "tool_use":
                yield ModelEvent("tool_use", id=block.id, name=block.name, input=dict(block.input or {}))
        usage = {k: getattr(final.usage, k, 0) or 0 for k in USAGE_KEYS}
        content = [b.model_dump(exclude_none=True, mode="json") for b in final.content]
        yield ModelEvent("stop", stop_reason=final.stop_reason or "end_turn", usage=usage, content=content)


# --- the turn ---------------------------------------------------------------------------------
def _modules_of_reporting_sector(claims, reporting_sector):
    """Which modules compute a reporting sector, from the release's own stream dimension.

    The two vocabularies share their ten ids, so a reporting id is usually also a module name and
    a naive join looks right. It is right by coincidence, and only for the sectors whose atoms all
    come from one module - captive self-generation is exactly the case where it is not."""
    try:
        rows = claims._fetch("SELECT DISTINCT module FROM dim_stream WHERE reporting_sector = '%s'"
                             % reporting_sector.replace("'", "''"))
    except Exception:
        return [reporting_sector]
    return [r["module"] for r in rows] or [reporting_sector]



def _compact_context(context):
    keep = ("basis", "periods", "configuration_id", "gwp_basis", "geography_level", "geography_ids", "spatial_view", "defaults_applied")
    out = {k: context[k] for k in keep if k in context}
    rp = context.get("reporting_period") or {}
    if isinstance(rp, dict) and rp.get("label"):
        out["reporting_period"] = rp["label"]
    return out


def _metric_of(env):
    """The pollutant an air envelope answered for, off its canonical request.

    An air envelope's `context` names no pollutant at all - it is in the request and in the cells'
    unit - so an answer's scope used to say WHERE and WHEN and not WHAT, and the page had no way to
    tell a PM2.5 answer from a greenhouse one when it rebuilt a view from it."""
    if env.get("request_type") != "query_air":
        return {}
    try:
        pollutants = json.loads(env.get("request") or "{}").get("pollutants") or []
    except (TypeError, ValueError):
        return {}
    return {"pollutants": list(pollutants)} if pollutants else {}


_CELL_SKIP = {"exact", "value", "display", "display_short", "unit", "unit_words", "unit_short", "quantiles_short",
              "share_pct_short", "interval_short",       # derived figures no placeholder can print
              "result_row_ids", "formula", "group",
              # an activity record: its reader form is printed through .short, and its ids and deposit
              # locator are for the receipt, not for prose
              "display_words", "record_id", "source_table", "source_row", "source_status"}
_NUMERIC = re.compile(r"^[-+]?(\d+[.,]?\d*|\.\d+)([eE][-+]?\d+)?$")
_ID_KEYS = ("month", "period_id")           # digit-shaped identifiers the model may name


def compact_cells(values, cap):
    cells = []
    for i, v in enumerate(values[:cap]):
        # display_short is the server's two-decimal rendering (presentation.py); the model may
        # print it through {{result_k_cell_n.short}} and is asked to prefer it in prose
        cell = {"i": i, "display": v.get("display"), "display_short": v.get("display_short", v.get("display")), "unit": v.get("unit")}
        if v.get("group"):
            cell["group"] = v["group"]
        for key in ("co2e_exactness", "exactness", "interpretation"):
            if v.get(key):
                cell["exactness" if key != "interpretation" else key] = v[key]
        # identifying strings only (ledger_id, month, kind, ...): a numeric attribute is a figure the
        # model could restate, and only `display`/`exact`/`unit` are printable through placeholders
        attrs = {k: val for k, val in v.items() if k not in _CELL_SKIP and not k.startswith("co2e_exact")
                 and k not in ("exactness", "interpretation") and isinstance(val, str) and val
                 and (k in _ID_KEYS or not _NUMERIC.match(val))}
        if attrs:
            cell["attrs"] = attrs
        cells.append(cell)
    return cells


# the request's grain -> the fact_uncertainty resolution its rows are read at (adm1 has no row of
# its own: every resolution is listed, and the block says so)
RESOLUTIONS = {("national", False): "annual_national", ("national", True): "monthly_national",
               ("adm2", False): "annual_adm2", ("adm2", True): "monthly_adm2"}


def _rows_as_strings(rows):
    return [{k: (str(v) if v is not None else "") for k, v in r.items()} for r in rows if isinstance(r, dict)]


def compact_uncertainty(env, claims=None):
    """The uncertainty block for the answer card: the envelope's own per-category rows when it
    carries any (every field a string as the table carries it) and the interpretation; for a
    query_emissions envelope whose block is empty (the core lists no row at the grains it names -
    a named follow-up), the fact_uncertainty rows for the request's categories or sectors at the
    request's resolution, read from the claim store and marked source: fact_uncertainty; None for
    any other envelope (a get_uncertainty result carries its uncertainty in the cells)."""
    block = env.get("uncertainty")
    if isinstance(block, dict) and block.get("rows"):
        # the core supplies these directly again: before its resolution defect was fixed the
        # string it selected on matched nothing, so this branch never fired and the fallback
        # below did all the work
        return {"rows": _rows_as_strings(block["rows"]), "interpretation": block.get("interpretation", ""),
                "resolution": block.get("resolution"), "source": "envelope"}
    if isinstance(block, dict) and block.get("interpretation") and "resolution" in block:
        # AN EXPLICIT REFUSAL FROM THE CORE, AND IT IS NOT A CACHE MISS. The core now returns an
        # empty block with a reason for a grain the release does not publish - a province, one
        # gas, another configuration, another period, one stream. Falling through to the query
        # below would answer those from fact_uncertainty anyway, which is the refusal being
        # bypassed by the very fallback that was written when the block was always empty.
        return {"rows": [], "interpretation": block["interpretation"], "resolution": None,
                "source": "refused"}
    if env.get("request_type") != "query_emissions" or claims is None:
        return None
    try:
        req = json.loads(env.get("request") or "")
    except (TypeError, ValueError):
        return None
    if not isinstance(req, dict):
        return None
    where = []
    if req.get("categories"):
        where.append("category IN (%s)" % ", ".join("'%s'" % c.replace("'", "''") for c in req["categories"]))
    elif req.get("sectors") or req.get("reporting_sectors"):
        # fact_uncertainty is MODULE-keyed. A `sectors` filter names modules directly; a
        # `reporting_sectors` filter names where IPCC 2006 reports a stream, so it is resolved
        # through the release's own map of which modules compute each reporting sector. Before
        # rc54 this branch read `sectors` only, so a reporting-axis request silently got NO
        # uncertainty block at all - the sidecar was absent rather than wrong, which is harder
        # to notice.
        modules = list(req.get("sectors") or [])
        for rep in req.get("reporting_sectors") or []:
            modules.extend(_modules_of_reporting_sector(claims, rep))
        if modules:
            where.append("module IN (%s)"
                         % ", ".join("'%s'" % m.replace("'", "''") for m in sorted(set(modules))))
    level = req.get("geography_level") or "national"
    resolution = RESOLUTIONS.get((level, bool(req.get("months"))))
    if resolution:
        where.append("resolution = '%s'" % resolution)
    rows = claims._fetch("SELECT * FROM fact_uncertainty%s ORDER BY category, resolution" % ((" WHERE " + " AND ".join(where)) if where else ""))
    if not rows:
        return None
    note = ("per-category envelopes (structural, no probability) at resolution %s; they are never combined in quadrature across categories - see aggregation_rule" % resolution
            if resolution else "per-category envelopes at every resolution (the release carries no adm1 resolution); never combined in quadrature across categories - see aggregation_rule")
    return {"rows": _rows_as_strings(rows), "interpretation": note, "source": "fact_uncertainty", "resolution": resolution}


def event_payload(result, env, cap, claims=None):
    """The tool_result SSE event: the model's payload plus `uncertainty` (compact_uncertainty) and
    `n_rows` per cell (the count of result_row_ids), which the model does not see (its view is unchanged)."""
    values = env.get("values") or []
    out = dict(result)
    out["cells"] = [dict(cell, n_rows=len(values[cell["i"]].get("result_row_ids") or ())) for cell in result.get("cells") or []]
    out["uncertainty"] = compact_uncertainty(env, claims)
    return out


def tool_result_payload(k, call_id, name, env, cap):
    values = env.get("values") or []
    payload = {
        "k": k, "id": call_id, "name": name, "receipt": env.get("receipt"), "request_type": env.get("request_type"),
        "context": _compact_context(env.get("context") or {}),
        "n_values": len(values),
        "cells": compact_cells(values, cap),
        "limitations_hit": [l.get("id") for l in env.get("limitations_hit") or [] if isinstance(l, dict)],
    }
    # THE TABLES THE ANSWER WAS READ FROM, by name (the envelope's provenance). The model uses them
    # for {{link:file:<table>}}, and the web app for the answer's "Data" line; the digests and
    # paths stay in the envelope, which "Reproduce" replays.
    tables = [t.get("table") for t in (env.get("provenance") or {}).get("tables") or [] if isinstance(t, dict) and t.get("table")]
    if tables:
        payload["source_tables"] = tables
    if len(values) > cap:
        payload["truncated"] = "showing the first %d of %d cells; narrow the request or use limit/group_by" % (cap, len(values))
    un = env.get("unallocated") or {}
    # a lineage envelope keys its block `by_module_gas`; this read `by_module`, which nothing writes
    if un.get("by_province") or un.get("by_module_gas"):
        payload["unallocated"] = un
    return payload


def served_tables(service):
    """The table names the release serves as CSV files (products.ProductCatalog.files), or none
    for a service without a catalogue - a test double - so no file link is recognised there."""
    files = getattr(getattr(service, "products", None), "files", None) or {}
    return frozenset(name[:-4] for name in files if name.endswith(".csv"))


def refusal_payload(k, call_id, name, exc, service=None):
    body = exc.to_dict() if isinstance(exc, E.QueryError) else {"error": "invalid_input", "message": str(exc), "limitation_id": None, "detail": {}}
    out = {"k": k, "id": call_id, "name": name, "error": body["error"], "error_class": type(exc).__name__,
           "limitation_id": body.get("limitation_id"), "message": body["message"], "detail": body.get("detail") or {}}
    word = getattr(service, "word", None)
    if callable(word):
        out["message_worded"] = word(body["message"])
    return out


def _validation_message(exc):
    """What was rejected, what was sent, and what would have been accepted.

    This kept `loc` and `msg` and discarded pydantic's `input` and `ctx`. The generated request
    models are permissive - the vocabularies are enforced by the engine, which already returns
    structured errors - so what the echo of `input` reliably recovers is WHICH value offended: a
    model told only "limit: Input should be a valid integer" cannot see which of the several
    things it passed was wrong; told `(received "abc")` it can. `ctx["expected"]` is the
    permitted-values list where pydantic supplies one, and is included when it does.
    """
    parts = []
    for e in exc.errors():
        line = "%s: %s" % (".".join(str(p) for p in e.get("loc", ())) or "(root)", e.get("msg"))
        if "input" in e:
            got = json.dumps(e["input"], default=str, sort_keys=True)
            line += " (received %s)" % (got if len(got) <= 200 else got[:197] + "...")
        expected = (e.get("ctx") or {}).get("expected")
        if expected:
            line += "; permitted: %s" % expected
        parts.append(line)
    return "; ".join(parts)


class Turn:
    """One user message against one conversation; `events()` streams it."""

    def __init__(self, service, model, tools, system, dims, conversation, message, ui_state, limits: Limits, budget=None):
        self.service, self.model, self.tools, self.system, self.dims = service, model, tools, system, dims
        self.conv, self.message, self.ui_state, self.limits, self.budget = conversation, message, ui_state or {}, limits, budget
        self.results = []          # envelope per tool call k (None when the call returned no envelope)
        self.receipts = []
        self.scope = None          # the last tool result's compact context (the answer's `scope`)
        self.usage = {k: 0 for k in USAGE_KEYS}
        self.rejected_drafts = []
        # (tool, input) -> (k, body, is_error, envelope) for every call already made this message,
        # so an identical retry is answered rather than re-run. See `_execute`.
        self._calls = {}
        # tokens this turn has spent but the CONVERSATION has not yet accepted. See `_spend`.
        self.turn_spent = 0
        # the tables the release serves as files: what a {{link:file:<table>}} may name
        self.link_tables = served_tables(service)

    # -- streaming ---------------------------------------------------------------------------

    def _render_line(self, line):
        """One completed line of the answer, rendered for the reader, or None when it fails a
        check - a typed number, a cell that does not exist, an unknown placeholder - and must not
        be sent. The whole answer is checked again when the model finishes."""
        try:
            rendered, _ = render_multi(line, self.results, allowlist=(self.dims.version, self.dims.release_id),
                                       tables=self.link_tables)
        except PlaceholderError:
            return None
        return rendered

    # -- repeated calls ---------------------------------------------------------------------

    @staticmethod
    def _repeat_key(call):
        return "%s(%s)" % (call.name, json.dumps(call.input, sort_keys=True, default=str))

    def _repeat(self, k, call, prior):
        """An identical call has already been made this message. Do not make it again."""
        first_k, body, was_error, env, out = prior
        self.results.append(env)
        if not was_error:
            # identical to a call that already succeeded. Hand back the same envelope rather than
            # re-running it: nothing about the release changed between the two. The events are
            # replayed at THIS k and call id, so the citations resolve and the timeline shows the
            # result the model was actually given.
            replay = [("status", {"phase": "repeated_call", "k": k, "same_as": first_k})]
            for name, payload in out:
                replay.append((name, dict(payload, k=k, id=call.id) if isinstance(payload, dict) else payload))
            return body, False, replay
        first = str(body).strip().splitlines()[0] if str(body).strip() else "(no message)"
        err = ToolInputError(
            "call %d repeats call %d exactly, and call %d failed: %s -- repeating it cannot "
            "succeed. Change the input, or answer with the results already obtained."
            % (k, first_k, first_k, first[:400]))
        return "error: %s" % err, True, [("refusal", refusal_payload(k, call.id, call.name, err, self.service))]

    # -- tool execution ---------------------------------------------------------------------

    def _execute(self, k, call):
        """-> (tool_result content for the model, is_error, [(event, payload)...]).

        REFUSES AN IDENTICAL RETRY. Nothing recorded what had already been asked, so a model whose
        call was rejected could re-issue it byte-for-byte; with a schema that disagreed with the
        validator there was no input it could reach that would work, and it spent all eight turns
        discovering that. The second identical call now returns a different error - one that says
        it is a repeat and that repeating cannot help - instead of the same rejection a third,
        fourth and fifth time.
        """
        key = self._repeat_key(call)
        prior = self._calls.get(key)
        if prior is not None:
            return self._repeat(k, call, prior)
        before = len(self.results)
        out = self._execute_once(k, call)
        # `_execute_once` appends exactly one entry to self.results on every path; keep it so a
        # repeat can replay the same envelope at its own k.
        env = self.results[before] if len(self.results) > before else None
        self._calls[key] = (k, out[0], out[1], env, out[2])
        return out

    def _execute_once(self, k, call):
        name, payload = call.name, call.input
        if name == MAP_TOOL:
            try:
                action = validate_map_view(payload, self.dims)
            except ToolInputError as exc:
                self.results.append(None)
                return "error: %s" % exc, True, [("refusal", refusal_payload(k, call.id, name, exc, self.service))]
            self.results.append(None)
            return json.dumps({"map_action": action}), False, [("map_action", action)]
        if name not in FUNCTION_MODEL:
            self.results.append(None)
            return "error: unknown tool %r" % name, True, [("refusal", refusal_payload(k, call.id, name, ToolInputError("unknown tool %r" % name)))]
        model = G.MODELS[FUNCTION_MODEL[name]]
        try:
            body = model.model_validate(payload if isinstance(payload, dict) else {})
        except ValidationError as exc:
            self.results.append(None)
            err = ToolInputError(_validation_message(exc))
            return "error: invalid input: %s" % err, True, [("refusal", refusal_payload(k, call.id, name, err, self.service))]
        if name == DOWNLOAD_TOOL:
            return self._download(k, call, body)
        try:
            env = self.service.run(G.to_request(body))          # the locked chokepoint
        except E.QueryError as exc:
            self.results.append(None)
            body_text = json.dumps({"error": exc.to_dict(), "error_class": type(exc).__name__}, sort_keys=True)
            return body_text, True, [("refusal", refusal_payload(k, call.id, name, exc, self.service))]
        self.results.append(env)
        self.receipts.append(env["receipt"])
        self.conv.receipts.add(env["receipt"])
        result = tool_result_payload(k, call.id, name, env, self.limits.max_cells_for_model)
        self.scope = dict(result["context"], k=k, request_type=env.get("request_type"), receipt=env.get("receipt"), name=name, **_metric_of(env))
        return json.dumps(result, sort_keys=True), False, [("tool_result", event_payload(result, env, self.limits.max_cells_for_model, getattr(self.service, "claims", None)))]

    def _download(self, k, call, body):
        self.results.append(None)
        receipt = body.receipt_id
        if body.format and body.format != "csv":
            err = ToolInputError("format %r is not served; the explorer serves csv and RECEIPT.json" % body.format)
            return "error: %s" % err, True, [("refusal", refusal_payload(k, call.id, call.name, err, self.service))]
        if receipt not in self.conv.receipts:
            err = ToolInputError("receipt %r was not minted in this conversation; run the query first" % receipt)
            return "error: %s" % err, True, [("refusal", refusal_payload(k, call.id, call.name, err, self.service))]
        links = {"csv": "%s/download/%s.csv" % (API_PREFIX, receipt), "receipt_json": "%s/download/%s.receipt.json" % (API_PREFIX, receipt)}
        result = {"k": k, "id": call.id, "name": call.name, "receipt": receipt, "request_type": "DownloadRequest",
                  "context": {}, "n_values": 0, "cells": [], "limitations_hit": [], "download": links}
        return json.dumps(result, sort_keys=True), False, [("tool_result", result)]

    # -- the loop ---------------------------------------------------------------------------

    def _spend(self, usage):
        for key in USAGE_KEYS:
            self.usage[key] += usage.get(key, 0) or 0
        spent = usage_total(usage)
        # THE DAY PAYS FOR WHAT WAS BILLED; THE CONVERSATION PAYS FOR WHAT IT KEEPS. These were the
        # same counter, so a turn that ended at the turn limit raised conv.tokens_spent and
        # appended NO history - the conversation carried all of the cost and none of the benefit,
        # and the next question died on `budget_exhausted` before it ran. That is the second half
        # of the screenshot. The daily budget still sees every token, because those were really
        # spent; the conversation cap is about the context it carries, and a turn that carries
        # nothing forward has not grown it. Committed at the one place history is retained.
        self.turn_spent += spent
        if self.budget is not None:
            self.budget.spend(spent)

    def _done(self):
        return ("done", {"conversation_id": self.conv.id, "usage": dict(self.usage),
                         "cost_estimate_usd": cost_estimate_usd(getattr(self.model, "model_id", ""), self.usage)})

    def events(self):
        user_text = PROMPT.user_message(self.message, self.ui_state)
        messages = list(self.conv.messages) + [{"role": "user", "content": user_text}]
        k = 0
        turns = 0
        corrected = False
        started = time.time()
        answer_only = False                     # the next model call may not call a tool
        refused = collections.Counter()         # refusals per tool, this message
        tried = collections.Counter()           # calls per tool, this message
        while True:
            # "this conversation OR this day" left a reader unable to tell whether starting a new
            # conversation would help. It is knowable here, so say which, and say the remedy.
            over_day = self.budget is not None and self.budget.remaining() <= 0
            over_conv = self.conv.tokens_spent + self.turn_spent >= self.limits.conversation_tokens
            if over_day or over_conv:
                yield "error", {"code": "budget_exhausted",
                                "scope": "daily" if over_day else "conversation",
                                "message": ("the shared daily token budget is spent; it resets at "
                                            "00:00 UTC, and a new conversation will not help")
                                if over_day else
                                ("this conversation has spent its token budget; start a new one to "
                                 "carry on - the daily budget still has room")}
                break
            if turns >= self.limits.max_turns:
                yield "error", {"code": "turn_limit", "message": "the agent made %d model calls without a final answer" % turns}
                break
            # the turn's clock: no further model call once it has run out (see Limits.turn_seconds)
            elapsed = time.time() - started
            deadline = self.limits.turn_seconds
            if deadline and elapsed >= deadline:
                log.warning("ask turn stopped at its deadline: %.1f s, %d model call(s), %d tool call(s)", elapsed, turns, k)
                lookups = ""
                if tried:
                    lookups = " It made %d lookup%s (%s)%s." % (
                        sum(tried.values()), "" if sum(tried.values()) == 1 else "s",
                        ", ".join("%s x%d" % kv for kv in sorted(tried.items())),
                        ", %d of them refused" % sum(refused.values()) if refused else "")
                yield "error", {"code": "turn_timeout",
                                "message": "The assistant took too long over this question and stopped.%s "
                                           "Nothing was lost: ask it again, or ask for one thing at a time." % lookups}
                break
            # the answer window: little of the turn left and a result in hand, so this call answers
            if (not answer_only and k and deadline and self.limits.final_answer_seconds
                    and deadline - elapsed <= self.limits.final_answer_seconds):
                answer_only = True
                _instruct(messages, ANSWER_BEFORE_DEADLINE)
                yield "status", {"phase": "answer_now", "reason": "deadline"}
            turns += 1
            yield "status", {"phase": "model", "turn": turns}
            tools, base_kwargs = self.tools, {}
            if answer_only:
                # a client that can switch calling off keeps the declarations the history refers to
                if getattr(self.model, "accepts_answer_only", False):
                    base_kwargs["answer_only"] = True
                else:
                    tools = []
            # A CALL IS CUT FOR SILENCE, AND RETRIED ONCE (2026-11-07; ask/watch.py). The provider is
            # handed the rest of the turn as its own deadline, never the silence limit: the Gemini SDK
            # sends a timeout to the server as a total deadline, which killed answers still being
            # written. What cuts a call is `model_stall_seconds` with nothing from the model.
            silent_s = float(self.limits.model_stall_seconds or 0) or None
            cap_at = started + deadline if deadline else None
            attempt, failure = 0, None
            while True:
                attempt += 1
                now = time.time()
                stream_kwargs = dict(base_kwargs)
                if cap_at and getattr(self.model, "accepts_timeout", False):
                    stream_kwargs["timeout_s"] = max(5.0, cap_at - now)
                # one line when a model call starts and one when it ends, so a call that never returns
                # is visible in the log as a start with no end - the stalled turn left nothing at all
                log.info("ask model call %d%s starting at %.1f s%s%s", turns, " (retry %d)" % (attempt - 1) if attempt > 1 else "",
                         now - started, " (cut after %.0f s of silence)" % silent_s if silent_s else "",
                         " (answer only)" if answer_only else "")
                timing = CallTiming(started=now)
                text_parts, calls, stop, failure = [], [], None, None
                # THE ANSWER STREAMS, A CHECKED LINE AT A TIME. Each completed line is rendered on its
                # own - the same bare-number and placeholder checks the whole answer gets below - and
                # sent at once as `answer_delta`, its figures already filled in. A line that fails is
                # not sent, nor anything after it from this call: the whole-text check below decides
                # what happens (a correction takes the draft back first). Text before a tool call was
                # never the answer, so a tool call takes back what streamed and stops this call's
                # streaming.
                pending_line, streamed, holding = "", False, False
                try:
                    stream = self.model.stream(self.system, messages, tools, **stream_kwargs)
                    # a little past the cap, so a provider honouring its own deadline reports it first
                    for ev in watched(stream, silent_s, cap_at + 2 if cap_at else None, timing):
                        if ev.kind == "thinking_delta":
                            yield "thinking", {"text": ev.text}
                        elif ev.kind == "text_delta":
                            text_parts.append(ev.text)
                            if holding:
                                continue
                            pending_line += ev.text
                            while "\n" in pending_line:
                                line, pending_line = pending_line.split("\n", 1)
                                piece = self._render_line(line)
                                if piece is None:
                                    holding = True
                                    break
                                streamed = True
                                yield "answer_delta", {"text": piece + "\n"}
                        elif ev.kind == "tool_use":
                            calls.append(ev)
                            if streamed:
                                yield "answer_reset", {"reason": "tools"}
                                streamed = False
                            holding = True
                        elif ev.kind == "stop":
                            stop = ev
                except Silent as exc:
                    failure = ("silent", exc)
                except OutOfTime as exc:
                    failure = ("cap", exc)
                except ModelError as exc:
                    failure = ("transient" if retryable_model_error(exc) else "error", exc)
                if failure is None:
                    log.info("ask model call %d returned in %.1f s with %d tool call(s): %s",
                             turns, time.time() - timing.started, len(calls), timing.summary())
                    break
                kind, exc = failure
                log.warning("ask model call %d failed (%s): %s; %s", turns, kind, exc, timing.summary())
                if streamed:          # half an answer from a call that did not finish is not the answer
                    yield "answer_reset", {"reason": "retry"}
                    streamed = False
                left = cap_at - time.time() if cap_at else None
                if kind in ("silent", "transient") and attempt <= self.limits.model_retries \
                        and (left is None or left >= RETRY_MIN_LEFT_S):
                    yield "status", {"phase": "retry", "attempt": attempt + 1, "reason": "silent" if kind == "silent" else "error"}
                    if kind == "transient":
                        time.sleep(RETRY_PAUSE_S)
                    continue
                yield "error", call_failure_payload(kind, exc, attempt)
                break
            if failure is not None:
                break
            if stop is None:
                stop = ModelEvent("stop", stop_reason="tool_use" if calls else "end_turn")
            self._spend(stop.usage)
            text = "".join(text_parts)
            content = stop.content or ([{"type": "text", "text": text}] if text else []) + \
                [{"type": "tool_use", "id": c.id, "name": c.name, "input": c.input} for c in calls]
            if not content:
                content = [{"type": "text", "text": ""}]
            messages.append({"role": "assistant", "content": content})
            if stop.stop_reason == "refusal":
                yield "error", {"code": "model_refusal", "message": "the model declined this request"}
                break
            if calls:
                tool_results = []
                for call in calls:
                    k += 1
                    yield "tool_call", {"k": k, "id": call.id, "name": call.name, "input": call.input}
                    if k > self.limits.max_tool_calls:
                        self.results.append(None)
                        yield "status", {"phase": "tool_limit", "k": k}
                        tool_results.append({"type": "tool_result", "tool_use_id": call.id, "is_error": True,
                                             "content": "tool call limit (%d) reached for this message; answer with the results you have" % self.limits.max_tool_calls})
                        continue
                    yield "status", {"phase": "tool", "k": k, "name": call.name}
                    tool_started = time.time()
                    body, is_error, out = self._execute(k, call)
                    log.info("ask tool call %d (%s) took %.2f s%s", k, call.name, time.time() - tool_started, ", refused" if is_error else "")
                    for name, payload in out:
                        yield name, payload
                    tried[call.name] += 1
                    tr = {"type": "tool_result", "tool_use_id": call.id, "content": body}
                    if is_error:
                        tr["is_error"] = True
                        refused[call.name] += 1
                        if refused[call.name] >= REFUSALS_BEFORE_ANSWER and not answer_only:
                            answer_only = True
                            tr["content"] = "%s\n\n%s" % (body, ANSWER_AFTER_REFUSALS % (refused[call.name], call.name))
                            yield "status", {"phase": "answer_now", "reason": "refusals", "tool": call.name}
                    tool_results.append(tr)
                messages.append({"role": "user", "content": tool_results})
                continue
            if stop.stop_reason == "max_tokens":
                yield "error", {"code": "model_error", "message": "the answer hit the output token cap"}
                break
            if not text.strip():
                if streamed:   # blank lines only: nothing worth keeping on screen
                    yield "answer_reset", {"reason": "correction"}
                    streamed = False
                # the model ended the turn with no text (Gemini writes its answer beside the last tool
                # call, which is not shown, then believes it has answered): ask once, then say so
                if not corrected:
                    corrected = True
                    yield "status", {"phase": "correction", "reason": "the model ended the turn without an answer"}
                    messages.append({"role": "user", "content": PROMPT.empty_answer_message()})
                    continue
                yield "error", {"code": "empty_answer", "message": "the model ended the turn without an answer"}
                break
            # a final text: render or correct once
            try:
                rendered, citations = render_multi(text, self.results, allowlist=(self.dims.version, self.dims.release_id),
                                                   tables=self.link_tables)
            except PlaceholderError as exc:
                code = "bare_numbers" if isinstance(exc, BareNumberError) else "placeholder_error"
                self.rejected_drafts.append(text)
                log.info("answer rejected (%s): %s | draft: %r", code, exc, text)
                if streamed:
                    # what streamed was checked line by line, but the answer as a whole is being
                    # rewritten (or withheld): take the draft back before anything else is said
                    yield "answer_reset", {"reason": "correction"}
                    streamed = False
                if not corrected:
                    corrected = True
                    yield "status", {"phase": "correction", "reason": str(exc)}
                    messages.append({"role": "user", "content": PROMPT.correction_message(str(exc))})
                    continue
                if isinstance(exc, UnknownPlaceholderError):
                    # SECOND FAILURE, AND ONLY FOR THIS CLASS: drop the phrase and ship. Brace syntax
                    # on a reader's screen is unacceptable, but so is withholding a correct answer
                    # over one unwritable aside - every figure in it is real and cited. A
                    # BareNumberError never reaches here: an invented decimal is a correctness
                    # failure and stays withheld.
                    log.warning("answer shipped with an unknown placeholder dropped: %s", exc)
                    rendered, citations = render_multi(text, self.results,
                                                       allowlist=(self.dims.version, self.dims.release_id),
                                                       drop_unknown=True, tables=self.link_tables)
                else:
                    yield "error", {"code": code, "message": str(exc)}
                    break
            self.conv.append("user", user_text)
            self.conv.append("assistant", rendered)
            self.conv.tokens_spent += self.turn_spent      # history kept, so the cost is kept too
            self.turn_spent = 0
            yield "answer", {"text": rendered, "receipts": list(dict.fromkeys(self.receipts)), "citations": citations,
                             "scope": self.scope, "elapsed_s": round(time.time() - started, 3)}
            break
        yield self._done()
