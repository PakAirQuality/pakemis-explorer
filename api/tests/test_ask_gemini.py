"""GeminiModel against a scripted google-genai client: every tool schema of the release
translates to a FunctionDeclaration Gemini accepts; a turn's messages round-trip through the
synthesised call ids; scripted chunks give the loop's ModelEvent sequence; the fallback chain
moves only before the first event; provider selection reads names of variables, never values.
No live call is made and no key is read (a dummy string stands in for the variable)."""
import dataclasses
import json
import os
import subprocess

import pytest
from fastapi.testclient import TestClient

from conftest import ROOT
from pakemis_api.ask.gemini import FORBIDDEN_SCHEMA_KEYS, GeminiModel, clean_schema, function_declaration, gemini_tools
from pakemis_api.ask.loop import ModelError
from pakemis_api.ask.tools import Dims, build_tools

types = pytest.importorskip("google.genai.types")
from google.genai import errors  # noqa: E402

CHAIN = ("gemini-3.1-pro-preview", "gemini-2.5-pro", "gemini-2.5-flash")


# --- helpers --------------------------------------------------------------------------------------

def walk(node, out):
    """Schema keywords used anywhere in `node` (property names are not keywords)."""
    if isinstance(node, dict):
        out.update(node.keys())
        for k, v in node.items():
            if k == "properties" and isinstance(v, dict):
                for prop in v.values():
                    walk(prop, out)
            else:
                walk(v, out)
    elif isinstance(node, list):
        for v in node:
            walk(v, out)
    return out


def chunk(parts=(), finish=None, usage=None, block=None):
    candidates = [types.Candidate(content=types.Content(role="model", parts=list(parts)), finish_reason=finish)] if parts or finish else []
    kwargs = {"candidates": candidates}
    if usage:
        kwargs["usage_metadata"] = types.GenerateContentResponseUsageMetadata(**usage)
    if block:
        kwargs["prompt_feedback"] = types.GenerateContentResponsePromptFeedback(block_reason=block)
    return types.GenerateContentResponse(**kwargs)


def api_error(code, status, message="scripted"):
    return errors.ClientError(code, {"error": {"code": code, "status": status, "message": message}})


class FakeModels:
    """generate_content_stream scripted per model id: a list of chunks, an exception to raise
    before the first chunk, or a (chunks, exception) pair raising after the chunks."""

    def __init__(self, scripts):
        self.scripts = scripts
        self.calls = []

    def generate_content_stream(self, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        script = self.scripts[model]
        if isinstance(script, Exception):
            raise script
        chunks, after = (script, None) if isinstance(script, list) else script

        def gen():
            for c in chunks:
                yield c
            if after is not None:
                raise after
        return gen()


class FakeClient:
    def __init__(self, scripts):
        self.models = FakeModels(scripts)


def scripted(monkeypatch, scripts, model_id=CHAIN[0], **kwargs):
    fake = FakeClient(scripts)
    monkeypatch.setattr(GeminiModel, "client", property(lambda self: fake))
    return GeminiModel(model_id, max_output_tokens=1234, **kwargs), fake


@pytest.fixture(scope="module")
def tools(client):
    return build_tools(Dims(client.app.state.service))


# --- schema translation ---------------------------------------------------------------------------

def test_every_tool_schema_translates(tools):
    assert len(tools) == 12
    for tool in tools:
        cleaned = clean_schema(tool["input_schema"])
        keys = walk(cleaned, set())
        assert not keys & set(FORBIDDEN_SCHEMA_KEYS), (tool["name"], keys & set(FORBIDDEN_SCHEMA_KEYS))
        assert "anyOf" not in keys and "$defs" not in keys and "$ref" not in keys
        decl = function_declaration(tool)                      # constructs without error
        assert decl.name == tool["name"] and decl.description == tool["description"]
        assert decl.parameters.type == types.Type.OBJECT
        assert set(decl.parameters.properties) == set(tool["input_schema"]["properties"])
        # enums (string fields only) and required survive the translation
        for name, prop in tool["input_schema"]["properties"].items():
            if prop.get("type") == "string" and "enum" in prop:
                got = decl.parameters.properties[name]
                assert got.enum == [v for v in prop["enum"] if v != ""], (tool["name"], name)   # Gemini rejects "" in an enum
                assert "" not in got.enum and got.default != ""
        assert (decl.parameters.required or []) == tool["input_schema"].get("required", [])
    assert "additionalProperties" in json.dumps(tools[-1]["input_schema"])     # set_map_view carries it in the loop's shape
    assert len(gemini_tools(tools)) == 1 and len(gemini_tools(tools)[0].function_declarations) == 12


def test_clean_schema_rules():
    raw = {"type": "object", "title": "T", "$schema": "x", "additionalProperties": False, "examples": [1],
           "properties": {"a": {"anyOf": [{"type": "string", "enum": ["p", "q"]}, {"type": "null"}], "description": "d", "const": "p", "title": "A"},
                          "e": {"type": "string", "enum": ["x", ""], "default": ""},
                          "n": {"type": "integer", "enum": [1, 2], "format": "int32"},
                          "l": {"type": "array", "items": {"type": "string", "title": "I"}},
                          "u": {"type": ["string", "null"]}},
           "required": ["a"]}
    out = clean_schema(raw)
    assert out == {"type": "object", "required": ["a"],
                   "properties": {"a": {"type": "string", "enum": ["p", "q"], "description": "d", "nullable": True},
                                  "e": {"type": "string", "enum": ["x"]},
                                  "n": {"type": "integer"},
                                  "l": {"type": "array", "items": {"type": "string"}},
                                  "u": {"type": "string", "nullable": True}}}
    types.Schema.model_validate(out)


# --- message translation --------------------------------------------------------------------------

def test_turn_round_trips_through_synthesised_ids():
    m = GeminiModel(CHAIN[0])
    call_id = m._new_id("query_emissions")
    assert call_id == "gcall_1"
    signature = types.Part(text="x", thought_signature=b"\x00sig").model_dump(exclude_none=True, mode="json")["thought_signature"]
    messages = [
        {"role": "user", "content": "earlier"},
        {"role": "assistant", "content": "a plain reply"},
        {"role": "user", "content": "[ui_state] {}\n\nPunjab agriculture?"},
        {"role": "assistant", "content": [{"text": "let me look", "thought": True},
                                          {"text": "Checking.", "thought_signature": signature},
                                          {"function_call": {"name": "query_emissions", "args": {"periods": ["FY2023-24"]}}, "thought_signature": signature}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": call_id, "content": json.dumps({"receipt": "abc", "cells": []})}]},
        {"role": "assistant", "content": [{"type": "text", "text": "synth"}, {"type": "tool_use", "id": "toolu_9", "name": "set_map_view", "input": {"level": "adm1"}}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_9", "content": "error: geo=Kashmir is not a province", "is_error": True}]},
        {"role": "user", "content": "Rejected: bare number"},
    ]
    contents = m.contents(messages)
    assert [c.role for c in contents] == ["user", "model", "user", "model", "user", "model", "user", "user"]
    assert contents[0].parts[0].text == "earlier" and contents[1].parts[0].text == "a plain reply"
    replayed = contents[3].parts
    assert replayed[0].thought is True and replayed[0].text == "let me look"
    assert replayed[1].thought_signature == b"\x00sig" and replayed[1].text == "Checking."
    assert replayed[2].function_call.name == "query_emissions" and replayed[2].function_call.args == {"periods": ["FY2023-24"]}
    assert replayed[2].thought_signature == b"\x00sig"
    fr = contents[4].parts[0].function_response
    assert fr.name == "query_emissions" and fr.response == {"result": {"receipt": "abc", "cells": []}}
    synth = contents[5].parts
    assert synth[0].text == "synth" and synth[1].function_call.name == "set_map_view" and synth[1].function_call.args == {"level": "adm1"}
    err = contents[6].parts[0].function_response
    assert err.name == "set_map_view" and err.response == {"error": "error: geo=Kashmir is not a province"}
    assert contents[7].parts[0].text == "Rejected: bare number"
    # the SDK accepts every content as built
    for c in contents:
        types.Content.model_validate(c.model_dump(exclude_none=True, mode="json"))


def test_empty_assistant_content_becomes_a_blank_part():
    m = GeminiModel(CHAIN[0])
    contents = m.contents([{"role": "assistant", "content": [{"type": "text", "text": ""}]}])
    assert contents[0].role == "model" and contents[0].parts[0].text == " "


# --- the stream against a scripted client ----------------------------------------------------------

def test_scripted_chunks_give_the_loop_events(monkeypatch, tools):
    usage = {"prompt_token_count": 1000, "candidates_token_count": 30, "thoughts_token_count": 12, "cached_content_token_count": 400}
    script = [
        chunk([types.Part(text="plan the call", thought=True)]),
        chunk([types.Part(text="Punjab ")]),
        chunk([types.Part(text="agriculture:", thought_signature=b"\x01")]),
        chunk([types.Part.from_function_call(name="query_emissions", args={"periods": ["FY2023-24"], "sectors": ["agriculture"]})]),
        chunk([types.Part.from_function_call(name="set_map_view", args={"level": "adm1", "geo": "Punjab"})], finish="STOP", usage=usage),
    ]
    m, fake = scripted(monkeypatch, {CHAIN[0]: script})
    events = list(m.stream("SYSTEM", [{"role": "user", "content": "q"}], tools))
    assert [(e.kind, e.text) for e in events[:3]] == [("thinking_delta", "plan the call"), ("text_delta", "Punjab "), ("text_delta", "agriculture:")]
    calls = [e for e in events if e.kind == "tool_use"]
    assert [(c.id, c.name) for c in calls] == [("gcall_1", "query_emissions"), ("gcall_2", "set_map_view")]
    assert calls[0].input == {"periods": ["FY2023-24"], "sectors": ["agriculture"]} and calls[1].input == {"level": "adm1", "geo": "Punjab"}
    stop = events[-1]
    assert stop.kind == "stop" and stop.stop_reason == "tool_use"
    assert stop.usage == {"input_tokens": 1000, "output_tokens": 42, "cache_read_input_tokens": 400, "cache_creation_input_tokens": 0}
    # the replayable content: thought, merged text? no: the signed part stays separate; calls keep their shape
    assert stop.content[0] == {"text": "plan the call", "thought": True}
    assert stop.content[1] == {"text": "Punjab "}
    assert stop.content[2]["text"] == "agriculture:" and stop.content[2]["thought_signature"]
    assert stop.content[3]["function_call"]["name"] == "query_emissions" and stop.content[4]["function_call"]["name"] == "set_map_view"
    assert m.name_for("gcall_1") == "query_emissions" and m.name_for("gcall_2") == "set_map_view"
    # what the client was given: the model, the system instruction, one Tool of twelve declarations, AUTO calling, thoughts on
    call = fake.models.calls[0]
    assert call["model"] == CHAIN[0] and call["contents"][0].role == "user" and call["contents"][0].parts[0].text == "q"
    cfg = call["config"]
    assert cfg.system_instruction == "SYSTEM" and cfg.max_output_tokens == 1234
    assert len(cfg.tools) == 1 and len(cfg.tools[0].function_declarations) == 12
    assert cfg.tool_config.function_calling_config.mode == types.FunctionCallingConfigMode.AUTO
    assert cfg.thinking_config.include_thoughts is True
    assert m.model_id == CHAIN[0]


@pytest.mark.parametrize("finish,expected", [("STOP", "end_turn"), ("MAX_TOKENS", "max_tokens"), ("SAFETY", "refusal"),
                                             ("PROHIBITED_CONTENT", "refusal"), ("BLOCKLIST", "refusal"), ("RECITATION", "refusal")])
def test_finish_reason_mapping(monkeypatch, tools, finish, expected):
    m, _ = scripted(monkeypatch, {CHAIN[0]: [chunk([types.Part(text="t")], finish=finish)]})
    events = list(m.stream("S", [{"role": "user", "content": "q"}], tools))
    assert events[-1].kind == "stop" and events[-1].stop_reason == expected
    assert events[-1].usage == {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}


def test_blocked_prompt_is_a_refusal(monkeypatch, tools):
    m, _ = scripted(monkeypatch, {CHAIN[0]: [chunk(block="SAFETY")]})
    events = list(m.stream("S", [{"role": "user", "content": "q"}], tools))
    assert [e.kind for e in events] == ["stop"] and events[0].stop_reason == "refusal"


# --- the fallback chain ---------------------------------------------------------------------------

def test_fallback_advances_on_pre_stream_429_and_404(monkeypatch, tools):
    moves = []
    m, fake = scripted(monkeypatch, {CHAIN[0]: api_error(429, "RESOURCE_EXHAUSTED", "quota"),
                                     CHAIN[1]: api_error(404, "NOT_FOUND", "no such model"),
                                     CHAIN[2]: [chunk([types.Part(text="from flash")], finish="STOP")]},
                      on_model_change=moves.append)
    events = list(m.stream("S", [{"role": "user", "content": "q"}], tools))
    assert [e.kind for e in events] == ["text_delta", "stop"] and events[0].text == "from flash"
    assert [c["model"] for c in fake.models.calls] == list(CHAIN)
    assert m.active_model == m.model_id == CHAIN[2] and moves == [CHAIN[1], CHAIN[2]]
    # the next call starts where the chain settled
    fake.models.scripts[CHAIN[2]] = [chunk([types.Part(text="again")], finish="STOP")]
    list(m.stream("S", [{"role": "user", "content": "q2"}], tools))
    assert fake.models.calls[-1]["model"] == CHAIN[2] and len(fake.models.calls) == 4


def test_chain_exhausted_is_model_error(monkeypatch, tools):
    m, fake = scripted(monkeypatch, {c: api_error(429, "RESOURCE_EXHAUSTED") for c in CHAIN})
    with pytest.raises(ModelError) as info:
        list(m.stream("S", [{"role": "user", "content": "q"}], tools))
    assert str(info.value).startswith("ClientError: ") and "RESOURCE_EXHAUSTED" in str(info.value)
    assert len(fake.models.calls) == 3 and m.active_model == CHAIN[2]


def test_other_errors_do_not_move_the_chain(monkeypatch, tools):
    m, fake = scripted(monkeypatch, {CHAIN[0]: api_error(400, "INVALID_ARGUMENT", "bad schema")})
    with pytest.raises(ModelError) as info:
        list(m.stream("S", [{"role": "user", "content": "q"}], tools))
    assert "INVALID_ARGUMENT" in str(info.value) and len(fake.models.calls) == 1 and m.active_model == CHAIN[0]


def test_a_begun_stream_is_never_restarted(monkeypatch, tools):
    m, fake = scripted(monkeypatch, {CHAIN[0]: ([chunk([types.Part(text="partial")])], api_error(429, "RESOURCE_EXHAUSTED")),
                                     CHAIN[1]: [chunk([types.Part(text="never")], finish="STOP")]})
    got = []
    with pytest.raises(ModelError):
        for ev in m.stream("S", [{"role": "user", "content": "q"}], tools):
            got.append(ev)
    assert [(e.kind, e.text) for e in got] == [("text_delta", "partial")]
    assert [c["model"] for c in fake.models.calls] == [CHAIN[0]] and m.active_model == CHAIN[0]


# --- provider selection and status ----------------------------------------------------------------

def test_gemini_model_builds_without_a_key(monkeypatch):
    for var in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    m = GeminiModel("gemini-2.5-flash", max_output_tokens=8000)
    assert m.model_id == "gemini-2.5-flash" and m.chain == ("gemini-2.5-flash", "gemini-2.5-pro") and m._client is None
    assert GeminiModel("gemini-3.1-pro-preview").chain == CHAIN


def test_install_ask_reports_gemini(settings, monkeypatch):
    from pakemis_api.app import create_app
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "test")                # a dummy: no call is made, nothing reads it
    monkeypatch.setenv("PAKEMIS_ASK_MODEL", "gemini-2.5-flash")
    s = dataclasses.replace(settings, ask_model="gemini-2.5-flash", ask_provider="auto")
    assert s.resolved_ask_provider == "gemini" and s.resolved_ask_model == "gemini-2.5-flash" and s.ask_enabled
    with TestClient(create_app(s)) as c:
        status = c.app.state.service.agent_status
        assert status == {"enabled": True, "model": "gemini-2.5-flash", "provider": "gemini", "reason": None}
        assert c.get("/v1/release").json()["agent"] == status
        model = c.app.state.ask.model
        assert isinstance(model, GeminiModel) and model.max_output_tokens == c.app.state.ask.limits.max_output_tokens
        assert "test" not in json.dumps(status)
        model.on_model_change("gemini-2.5-pro")               # the chain moved: the status names what answers now
        assert c.get("/v1/release").json()["agent"]["model"] == "gemini-2.5-pro"


def test_provider_auto_rules(settings, monkeypatch):
    base = dataclasses.replace(settings, ask_model="", ask_provider="auto")
    for var in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    assert base.resolved_ask_provider == "anthropic" and base.resolved_ask_model == "claude-sonnet-5" and not base.ask_enabled
    assert base.ask_disabled_reason == "neither ANTHROPIC_API_KEY nor GEMINI_API_KEY is set in the API's environment"
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    assert base.resolved_ask_provider == "gemini" and base.resolved_ask_model == "gemini-3.1-pro-preview" and base.ask_enabled
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    assert base.resolved_ask_provider == "anthropic" and base.ask_enabled          # both set: anthropic unless told otherwise
    assert dataclasses.replace(base, ask_model="gemini-2.5-pro").resolved_ask_provider == "gemini"
    monkeypatch.delenv("ANTHROPIC_API_KEY")
    explicit = dataclasses.replace(base, ask_provider="anthropic")
    assert explicit.resolved_ask_provider == "anthropic" and not explicit.ask_enabled
    assert explicit.ask_disabled_reason == "ANTHROPIC_API_KEY is not set in the API's environment"
    monkeypatch.delenv("GEMINI_API_KEY")
    gem = dataclasses.replace(base, ask_provider="gemini")
    assert not gem.ask_enabled and gem.ask_disabled_reason == "GEMINI_API_KEY or GOOGLE_API_KEY is not set in the API's environment"
    with pytest.raises(RuntimeError):
        dataclasses.replace(base, ask_provider="openai").resolved_ask_provider


def test_prices_for_the_chain():
    from pakemis_api.ask.limits import PRICE_PER_MTOK, cost_estimate_usd
    usage = {"input_tokens": 1_000_000, "output_tokens": 1_000_000, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}
    assert PRICE_PER_MTOK["gemini-2.5-flash"] == (0.30, 2.50) and PRICE_PER_MTOK["gemini-2.5-pro"] == (1.25, 10.0)
    assert cost_estimate_usd("gemini-2.5-pro", usage) == 11.25 and cost_estimate_usd("gemini-3.1-pro-preview", usage) is None


# --- the key never enters the repository ------------------------------------------------------------

def test_no_key_prefix_in_the_diff_or_the_tree():
    prefixes = ("AI" + "za", "pk." + "ey", "sk-" + "ant-")
    diff = subprocess.run(["git", "diff", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    tracked = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split("\0")
    hits = []
    for prefix in prefixes:
        if prefix in diff:
            hits.append("diff:" + prefix)
    for path in tracked:
        full = os.path.join(ROOT, path)
        if not path or not os.path.isfile(full) or path.endswith((".png", ".jpg", ".pmtiles", ".nc", ".parquet")):
            continue
        with open(full, "rb") as handle:
            blob = handle.read()
        for prefix in prefixes:
            if prefix.encode() in blob:
                hits.append("%s:%s" % (path, prefix))
    assert not hits, hits
    assert not os.path.exists(os.path.join(ROOT, "api", ".env")) or subprocess.run(
        ["git", "check-ignore", "-q", "api/.env"], cwd=ROOT).returncode == 0
