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

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse, ServerSentEvent

from pakemis_api.ask.limits import DailyBudget, Limits, PerIpBucket
from pakemis_api.ask.loop import AnthropicModel, Turn
from pakemis_api.ask.memory import Memory
from pakemis_api.ask.prompt import system_prompt
from pakemis_api.ask.tools import Dims, build_tools

log = logging.getLogger("pakemis_api.ask")
router = APIRouter()


class AskBody(BaseModel):
    conversation_id: str | None = None
    message: str = Field(min_length=1, max_length=4000)
    ui_state: dict = Field(default_factory=dict)
    client_history: list[dict] = Field(default_factory=list)


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
        self.budget = DailyBudget(self.limits.daily_tokens)
        self.per_ip = PerIpBucket(self.limits.per_ip_per_hour)

    def turn(self, body: AskBody):
        conv = self.memory.get_or_create(body.conversation_id, body.client_history)
        return Turn(self.service, self.model, self.tools, self.system, self.dims, conv, body.message, body.ui_state, self.limits, self.budget)


def build_model(settings, on_model_change=None):
    """The provider's client for settings (no key is read here; the SDK reads it on the first call)."""
    limits = Limits.from_env()
    provider = settings.resolved_ask_provider
    model_id = settings.resolved_ask_model
    if provider == "gemini":
        from pakemis_api.ask.gemini import GeminiModel
        return GeminiModel(model_id, max_output_tokens=limits.max_output_tokens, on_model_change=on_model_change)
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
    app.state.ask = AskRuntime(service, model) if model is not None else None
    service.agent_status = {"enabled": model is not None,
                            "model": getattr(model, "model_id", None) if model is not None else None,
                            "provider": provider,
                            "reason": reason}
    if model is not None:
        log.info("Ask PakEmis enabled on %s (%s) with %d tools", service.agent_status["model"], provider, len(app.state.ask.tools))
    else:
        log.info("Ask PakEmis disabled: %s", reason)
    return app.state.ask


def _client_ip(request: Request):
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/ask", tags=["ask"])
def ask(body: AskBody, request: Request):
    runtime = getattr(request.app.state, "ask", None)
    if runtime is None:
        status = getattr(request.app.state.service, "agent_status", {}) or {}
        return JSONResponse(status_code=503, content={"error": "agent_disabled", "reason": status.get("reason") or "no model client"})
    if not runtime.per_ip.allow(_client_ip(request)):
        return JSONResponse(status_code=429, content={"error": "rate_limited", "message": "too many questions from this address; try again in an hour"})
    turn = runtime.turn(body)

    def events():
        try:
            for name, payload in turn.events():
                yield ServerSentEvent(data=json.dumps(payload, ensure_ascii=False, sort_keys=True), event=name)
        except Exception as exc:                              # never let a traceback end the stream silently
            log.exception("ask turn failed")
            yield ServerSentEvent(data=json.dumps({"code": "model_error", "message": "%s: %s" % (type(exc).__name__, exc)}), event="error")
            yield ServerSentEvent(data=json.dumps({"conversation_id": turn.conv.id, "usage": turn.usage, "cost_estimate_usd": None}), event="done")

    return EventSourceResponse(events(), headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
