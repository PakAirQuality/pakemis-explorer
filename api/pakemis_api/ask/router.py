"""POST {API_PREFIX}/ask -> server-sent events, and the runtime create_app installs behind it.

Events (name: data), in the order a turn emits them:
    status        {phase: model|tool|correction|tool_limit, turn?, k?, name?, reason?}
    thinking      {text}                                  summarised reasoning deltas
    tool_call     {k, id, name, input}
    tool_result   {k, id, name, receipt, request_type, context, n_values, cells: [{i, display, display_short, unit, n_rows, group?, exactness?, attrs?}], limitations_hit, uncertainty ({rows, interpretation, source: envelope|fact_uncertainty, resolution?} or null), unallocated?, truncated?, download?}
                  (uncertainty and n_rows are on the event only; the model's tool_result content is unchanged)
    refusal       {k, id, name, error, error_class, limitation_id, message, detail}
    map_action    {level?, geo?, period?, month?, sector?, gas?, config?, gwp?, view?}
    answer        {text, receipts, citations, scope, elapsed_s}   text carries <cite k cell receipt> tags; scope is the last
                  tool result's compact context {basis, periods, configuration_id, gwp_basis, geography_level, ..., k, request_type, receipt, name} or null
    error         {code, message}                          bare_numbers | placeholder_error | empty_answer | turn_limit | budget_exhausted | model_error | model_refusal | agent_disabled
    done          {conversation_id, usage, cost_estimate_usd}
No model client (no provider key and nothing injected) -> HTTP 503 {"error": "agent_disabled"}.
The provider (anthropic | gemini) and model come from settings; `service.agent_status` reports
{enabled, model, provider, reason} with `model` the one actually answering (Gemini's chain may move).
"""
import json
import logging
import os
import time
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse, ServerSentEvent

from pakemis_api.appcheck import AppCheckPolicy, AppCheckVerifier
from pakemis_api.ask.local import Library, LocalTurn
from pakemis_api.ask.limits import Limits, PerIpBucket, build_budget, client_address
from pakemis_api.ask.loop import AnthropicModel, Turn
from pakemis_api.ask.memory import Memory
from pakemis_api.ask.prompt import system_prompt
from pakemis_api.ask.quick import QuickTurn, supported
from pakemis_api.ask.tools import Dims, build_tools

log = logging.getLogger("pakemis_api.ask")
router = APIRouter()


class AskBody(BaseModel):
    conversation_id: str | None = None
    message: str = Field(min_length=1, max_length=4000)
    ui_state: dict = Field(default_factory=dict)
    client_history: list[dict] = Field(default_factory=list)
    intent: Literal["largest_source", "annual_trend"] | None = None


class AskRuntime:
    """Everything one process needs to answer: the tools and prompt for this release, the
    model, the conversations, the caps."""

    def __init__(self, service, model, limits=None):
        self.service = service
        self.model = model
        self.limits = limits or Limits.from_env()
        self.dims = Dims(service)
        self.tools = build_tools(self.dims)
        self.system = system_prompt(self.dims)
        self.memory = Memory()
        self.budget = build_budget(self.limits)
        if hasattr(self.budget, "warm"):                   # a shared budget: open its store before the first reader waits on it
            self.budget.warm()
        self.per_ip = PerIpBucket(self.limits.per_ip_per_hour)
        policy = AppCheckPolicy.from_env()
        self.app_check = AppCheckVerifier(policy) if policy.on else None
        try:
            self.library = Library(dims=self.dims)
        except Exception:                                  # a broken library must not take Ask down
            log.exception("the explanation library failed to load; answering from the model only")
            self.library = None

    def turn(self, body: AskBody):
        conv = self.memory.get_or_create(body.conversation_id, body.client_history)
        if supported(body.intent, body.ui_state):
            return QuickTurn(self.service, self.model, self.tools, self.system, self.dims, conv,
                             body.message, body.ui_state, self.limits, intent=body.intent)
        # LOCAL FIRST. A prepared explanation costs no model call and no budget, and most of what
        # a visitor asks is an explanation rather than a number. The library declines the moment
        # a question is about the SELECTED RESULT, and the loop below takes it - that path holds
        # the typed query functions and mints the receipt, so a number never comes from here.
        # The per-IP limit above still applies: it is abuse protection, not budget.
        if self.library is not None:
            answer = self.library.answer(body.message, body.ui_state, conv.last_card_id())
            if answer:
                return LocalTurn(conv, body.message, answer)
        return Turn(self.service, self.model, self.tools, self.system, self.dims, conv, body.message, body.ui_state, self.limits, self.budget)


def build_model(settings, on_model_change=None):
    """The provider's client for settings (no key is read here; the SDK reads it on the first call)."""
    limits = Limits.from_env()
    provider = settings.resolved_ask_provider
    model_id = settings.resolved_ask_model
    if provider == "gemini":
        from pakemis_api.ask.gemini import GeminiModel, fallbacks_from_env
        return GeminiModel(model_id, max_output_tokens=limits.max_output_tokens, fallbacks=fallbacks_from_env(), on_model_change=on_model_change)
    return AnthropicModel(model_id, max_tokens=limits.max_output_tokens, effort=limits.effort)


def install_ask(app, service, settings, model_client=None):
    """Build the runtime on app.state.ask and record the agent status on the service."""
    model = model_client
    reason = None
    provider = "injected" if model is not None else None

    def on_model_change(model_id):                  # Gemini's fallback chain moved: the status follows
        if service.agent_status:
            service.agent_status["model"] = model_id

    if model is None:
        if getattr(settings, "ask_enabled", False):
            model = build_model(settings, on_model_change)
            provider = getattr(model, "provider", settings.resolved_ask_provider)
        else:
            reason = getattr(settings, "ask_disabled_reason", None) or "no provider key is set in the API's environment"
            provider = getattr(settings, "resolved_ask_provider", None)
    # THE RUNTIME INSTALLS WITHOUT A MODEL. The prepared explanations are the reason: they cost no
    # inference, and a site with no provider key should still be able to say what emissions are,
    # what methane does and what drives a sector's estimate. Only a question the library declines -
    # one about the selected data - needs the loop, and that is the one that answers 503.
    runtime = AskRuntime(service, model)
    app.state.ask = runtime if (model is not None or runtime.library is not None) else None
    service.agent_status = {"enabled": model is not None,
                            "model": getattr(model, "model_id", None) if model is not None else None,
                            "provider": provider,
                            "reason": reason,
                            "library": runtime.library.digest[:16] if runtime.library is not None else None}
    if model is not None:
        log.info("Ask PakEmis enabled on %s (%s) with %d tools", service.agent_status["model"], provider, len(app.state.ask.tools))
    else:
        log.info("Ask PakEmis disabled: %s", reason)
    return app.state.ask


def _client_ip(request: Request, trusted=()):
    return client_address(request.headers.get("x-forwarded-for"), request.client.host if request.client else None, trusted)


@router.post("/ask", tags=["ask"])
def ask(body: AskBody, request: Request):
    started = time.monotonic()
    runtime = getattr(request.app.state, "ask", None)
    status = getattr(request.app.state.service, "agent_status", {}) or {}
    if runtime is None:
        return JSONResponse(status_code=503, content={"error": "agent_disabled", "reason": status.get("reason") or "no model client"})
    address = _client_ip(request, runtime.limits.trusted_proxies)
    # whether this came from the site's own page in a browser (appcheck.py); "off" when not asked for
    check = runtime.app_check.verdict(request.headers) if runtime.app_check is not None else "off"
    check_ms = (time.monotonic() - started) * 1000
    log.info("ask admission app_check_ms=%.1f verdict=%s", check_ms, check)
    # the chain as it arrived, beside the address chosen from it: the only way to see that the
    # trusted ranges still describe the edge in front of this service (%r: a caller writes part of it)
    log.info("ask from %s forwarded=%r edge-client=%r app-check=%s", address, (request.headers.get("x-forwarded-for") or "")[:200],
             (request.headers.get("fastly-client-ip") or "")[:64], check)
    if check not in ("off", "ok") and runtime.app_check.policy.enforced:
        return JSONResponse(status_code=401, content={"error": "app_check_failed", "message": "This page could not confirm it is the site itself. Reload the page and ask again."})
    if not runtime.per_ip.allow(address):
        log.warning("ask from %s refused: over %d requests in the hour", address, runtime.limits.per_ip_per_hour)
        return JSONResponse(status_code=429, content={"error": "rate_limited", "message": "too many questions from this address; try again in an hour"})
    turn = runtime.turn(body)
    # the library answered nothing and there is no model to ask: this question needed the data
    if runtime.model is None and not isinstance(turn, (LocalTurn, QuickTurn)):
        return JSONResponse(status_code=503, content={"error": "agent_disabled", "reason": status.get("reason") or "no model client",
                                                      "message": "This question needs the inventory query, which needs the assistant's model. Explanations of the concepts and methods still work."})

    def events():
        first = True
        try:
            for name, payload in turn.events():
                if first:
                    log.info("ask first_event elapsed_s=%.3f path=%s", time.monotonic() - started, type(turn).__name__)
                    first = False
                if name == "answer":
                    log.info("ask answer elapsed_s=%.3f path=%s", time.monotonic() - started, type(turn).__name__)
                yield ServerSentEvent(data=json.dumps(payload, ensure_ascii=False, sort_keys=True), event=name)
        except Exception as exc:                              # never let a traceback end the stream silently
            log.exception("ask turn failed")
            yield ServerSentEvent(data=json.dumps({"code": "model_error", "message": "%s: %s" % (type(exc).__name__, exc)}), event="error")
            yield ServerSentEvent(data=json.dumps({"conversation_id": turn.conv.id, "usage": turn.usage, "cost_estimate_usd": None}), event="done")
        finally:
            log.info("ask finished elapsed_s=%.3f path=%s", time.monotonic() - started, type(turn).__name__)

    return EventSourceResponse(events(), headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
