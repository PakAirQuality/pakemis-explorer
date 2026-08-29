"""The agent loop: an injectable model, the locked engine, and the server-side rendering gate.

ModelClient.stream(system, messages, tools) yields ModelEvents:
    thinking_delta(text) | text_delta(text) | tool_use(id, name, input) | stop(stop_reason, usage, content)
`content` on the stop event is the assistant's content blocks exactly as the provider returned
them (thinking blocks keep their signatures) so the next call of the same turn can replay them;
a client that gives none gets a synthesised text+tool_use message.

run_turn(...) is a generator of (event_name, payload) pairs: the SSE stream of one user message.
"""
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
from pakemis_api.ask.render import BareNumberError, render_multi
from pakemis_api.ask.tools import DOWNLOAD_TOOL, FUNCTION_MODEL, MAP_TOOL, ToolInputError, validate_map_view
from pakemis_query import errors as E
from pakemis_query.placeholders import PlaceholderError

log = logging.getLogger("pakemis_api.ask")
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

    def stream(self, system, messages, tools):
        import anthropic
        kwargs = dict(model=self.model_id, max_tokens=self.max_tokens, tools=tools, messages=messages,
                      system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}])
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

def _compact_context(context):
    keep = ("basis", "periods", "configuration_id", "gwp_basis", "geography_level", "geography_ids", "spatial_view", "defaults_applied")
    out = {k: context[k] for k in keep if k in context}
    rp = context.get("reporting_period") or {}
    if isinstance(rp, dict) and rp.get("label"):
        out["reporting_period"] = rp["label"]
    return out


_CELL_SKIP = {"exact", "value", "display", "unit", "result_row_ids", "formula", "group"}
_NUMERIC = re.compile(r"^[-+]?(\d+[.,]?\d*|\.\d+)([eE][-+]?\d+)?$")
_ID_KEYS = ("month", "period_id")           # digit-shaped identifiers the model may name


def compact_cells(values, cap):
    cells = []
    for i, v in enumerate(values[:cap]):
        cell = {"i": i, "display": v.get("display"), "unit": v.get("unit")}
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


def tool_result_payload(k, call_id, name, env, cap):
    values = env.get("values") or []
    payload = {
        "k": k, "id": call_id, "name": name, "receipt": env.get("receipt"), "request_type": env.get("request_type"),
        "context": _compact_context(env.get("context") or {}),
        "n_values": len(values),
        "cells": compact_cells(values, cap),
        "limitations_hit": [l.get("id") for l in env.get("limitations_hit") or [] if isinstance(l, dict)],
    }
    if len(values) > cap:
        payload["truncated"] = "showing the first %d of %d cells; narrow the request or use limit/group_by" % (cap, len(values))
    un = env.get("unallocated") or {}
    if un.get("by_province") or un.get("by_module"):
        payload["unallocated"] = un
    return payload


def refusal_payload(k, call_id, name, exc):
    body = exc.to_dict() if isinstance(exc, E.QueryError) else {"error": "invalid_input", "message": str(exc), "limitation_id": None, "detail": {}}
    return {"k": k, "id": call_id, "name": name, "error": body["error"], "error_class": type(exc).__name__,
            "limitation_id": body.get("limitation_id"), "message": body["message"], "detail": body.get("detail") or {}}


def _validation_message(exc):
    return "; ".join("%s: %s" % (".".join(str(p) for p in e.get("loc", ())), e.get("msg")) for e in exc.errors())


class Turn:
    """One user message against one conversation; `events()` streams it."""

    def __init__(self, service, model, tools, system, dims, conversation, message, ui_state, limits: Limits, budget=None):
        self.service, self.model, self.tools, self.system, self.dims = service, model, tools, system, dims
        self.conv, self.message, self.ui_state, self.limits, self.budget = conversation, message, ui_state or {}, limits, budget
        self.results = []          # envelope per tool call k (None when the call returned no envelope)
        self.receipts = []
        self.usage = {k: 0 for k in USAGE_KEYS}
        self.rejected_drafts = []

    # -- tool execution ---------------------------------------------------------------------

    def _execute(self, k, call):
        """-> (tool_result content for the model, is_error, [(event, payload)...])."""
        name, payload = call.name, call.input
        if name == MAP_TOOL:
            try:
                action = validate_map_view(payload, self.dims)
            except ToolInputError as exc:
                self.results.append(None)
                return "error: %s" % exc, True, [("refusal", refusal_payload(k, call.id, name, exc))]
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
            return "error: invalid input: %s" % err, True, [("refusal", refusal_payload(k, call.id, name, err))]
        if name == DOWNLOAD_TOOL:
            return self._download(k, call, body)
        try:
            env = self.service.run(G.to_request(body))          # the locked chokepoint
        except E.QueryError as exc:
            self.results.append(None)
            body_text = json.dumps({"error": exc.to_dict(), "error_class": type(exc).__name__}, sort_keys=True)
            return body_text, True, [("refusal", refusal_payload(k, call.id, name, exc))]
        self.results.append(env)
        self.receipts.append(env["receipt"])
        self.conv.receipts.add(env["receipt"])
        result = tool_result_payload(k, call.id, name, env, self.limits.max_cells_for_model)
        return json.dumps(result, sort_keys=True), False, [("tool_result", result)]

    def _download(self, k, call, body):
        self.results.append(None)
        receipt = body.receipt_id
        if body.format and body.format != "csv":
            err = ToolInputError("format %r is not served; the explorer serves csv and RECEIPT.json" % body.format)
            return "error: %s" % err, True, [("refusal", refusal_payload(k, call.id, call.name, err))]
        if receipt not in self.conv.receipts:
            err = ToolInputError("receipt %r was not minted in this conversation; run the query first" % receipt)
            return "error: %s" % err, True, [("refusal", refusal_payload(k, call.id, call.name, err))]
        links = {"csv": "/v1/download/%s.csv" % receipt, "receipt_json": "/v1/download/%s.receipt.json" % receipt}
        result = {"k": k, "id": call.id, "name": call.name, "receipt": receipt, "request_type": "DownloadRequest",
                  "context": {}, "n_values": 0, "cells": [], "limitations_hit": [], "download": links}
        return json.dumps(result, sort_keys=True), False, [("tool_result", result)]

    # -- the loop ---------------------------------------------------------------------------

    def _spend(self, usage):
        for key in USAGE_KEYS:
            self.usage[key] += usage.get(key, 0) or 0
        spent = usage_total(usage)
        self.conv.tokens_spent += spent
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
        while True:
            if self.conv.tokens_spent >= self.limits.conversation_tokens or (self.budget is not None and self.budget.remaining() <= 0):
                yield "error", {"code": "budget_exhausted", "message": "the token budget for this conversation or this day is spent"}
                break
            if turns >= self.limits.max_turns:
                yield "error", {"code": "turn_limit", "message": "the agent made %d model calls without a final answer" % turns}
                break
            turns += 1
            yield "status", {"phase": "model", "turn": turns}
            text_parts, calls, stop = [], [], None
            try:
                for ev in self.model.stream(self.system, messages, self.tools):
                    if ev.kind == "thinking_delta":
                        yield "thinking", {"text": ev.text}
                    elif ev.kind == "text_delta":
                        text_parts.append(ev.text)
                    elif ev.kind == "tool_use":
                        calls.append(ev)
                    elif ev.kind == "stop":
                        stop = ev
            except ModelError as exc:
                log.warning("model error: %s", exc)
                yield "error", {"code": "model_error", "message": str(exc)}
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
                    body, is_error, out = self._execute(k, call)
                    for name, payload in out:
                        yield name, payload
                    tr = {"type": "tool_result", "tool_use_id": call.id, "content": body}
                    if is_error:
                        tr["is_error"] = True
                    tool_results.append(tr)
                messages.append({"role": "user", "content": tool_results})
                continue
            if stop.stop_reason == "max_tokens":
                yield "error", {"code": "model_error", "message": "the answer hit the output token cap"}
                break
            if not text.strip():
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
                rendered, citations = render_multi(text, self.results, allowlist=(self.dims.version, self.dims.release_id))
            except PlaceholderError as exc:
                code = "bare_numbers" if isinstance(exc, BareNumberError) else "placeholder_error"
                self.rejected_drafts.append(text)
                log.info("answer rejected (%s): %s | draft: %r", code, exc, text)
                if not corrected:
                    corrected = True
                    yield "status", {"phase": "correction", "reason": str(exc)}
                    messages.append({"role": "user", "content": PROMPT.correction_message(str(exc))})
                    continue
                yield "error", {"code": code, "message": str(exc)}
                break
            self.conv.append("user", user_text)
            self.conv.append("assistant", rendered)
            yield "answer", {"text": rendered, "receipts": list(dict.fromkeys(self.receipts)), "citations": citations,
                             "elapsed_s": round(time.time() - started, 3)}
            break
        yield self._done()
