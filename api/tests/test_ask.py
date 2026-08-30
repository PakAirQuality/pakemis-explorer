"""Ask PakEmis under a scripted model: every golden through the agent's tool path gives the
golden's receipt and its display in the answer; refusal goldens arrive as `refusal` events and
is_error tool results; an invented decimal is corrected once and then withheld; the map tool
validates against the dims; the tool list is the contract's; no key means 503. No live call is
ever made: the model is a FakeModel whose scripts the tests set per case."""
import copy
import json
import re

import pytest
from fastapi.testclient import TestClient

from conftest import load_goldens
from pakemis_api.ask.loop import ModelEvent
from pakemis_api.ask.render import BareNumberError, render_multi
from pakemis_query.placeholders import PlaceholderError

GOLDENS = load_goldens()
CITE = re.compile(r'<cite k="(\d+)" cell="(\d+)" receipt="([0-9a-f]*)">([^<]*)</cite>')


# --- the fake model ------------------------------------------------------------------------

def thinking(text):
    return ModelEvent("thinking_delta", text=text)


def text(t):
    return ModelEvent("text_delta", text=t)


def tool_use(name, payload, call_id=None):
    return ModelEvent("tool_use", id=call_id or "toolu_%s_%d" % (name, abs(hash(json.dumps(payload, sort_keys=True))) % 10000), name=name, input=payload)


def stop(reason="end_turn", **usage):
    return ModelEvent("stop", stop_reason=reason, usage={"input_tokens": usage.get("input_tokens", 100), "output_tokens": usage.get("output_tokens", 20)})


class FakeModel:
    """Each stream() call pops one script (a list of ModelEvents) and records what it was given."""
    model_id = "fake-model"

    def __init__(self, scripts=()):
        self.scripts = list(scripts)
        self.calls = []

    def load(self, *scripts):
        self.scripts = list(scripts)
        self.calls = []

    def stream(self, system, messages, tools):
        self.calls.append({"system": system, "messages": copy.deepcopy(messages), "tools": tools})
        if not self.scripts:
            raise AssertionError("FakeModel has no script left for call %d" % len(self.calls))
        for ev in self.scripts.pop(0):
            yield ev


@pytest.fixture(scope="module")
def fake():
    return FakeModel()


@pytest.fixture(scope="module")
def ask_client(settings, fake):
    from pakemis_api.app import create_app
    with TestClient(create_app(settings, model_client=fake)) as c:
        yield c


def ask(client, message, ui_state=None, conversation_id=None, client_history=None):
    body = {"message": message, "ui_state": ui_state or {}}
    if conversation_id:
        body["conversation_id"] = conversation_id
    if client_history:
        body["client_history"] = client_history
    events = []
    with client.stream("POST", "/api/v1/emissions/ask", json=body) as r:
        assert r.status_code == 200, r.read()
        assert r.headers["content-type"].startswith("text/event-stream")
        name, data = None, []
        for line in r.iter_lines():
            if line.startswith("event:"):
                name = line[6:].strip()
            elif line.startswith("data:"):
                data.append(line[5:].strip())
            elif line == "" and name:
                events.append((name, json.loads("\n".join(data))))
                name, data = None, []
    return events


def only(events, name):
    return [d for n, d in events if n == name]


# --- goldens through the agent ---------------------------------------------------------------

@pytest.mark.parametrize("name,golden", GOLDENS, ids=[g[0] for g in GOLDENS])
def test_golden_through_agent(ask_client, fake, name, golden):
    fn, req = golden["function"], golden["request"]
    if golden.get("expect_error"):
        fake.load([thinking("check the scope"), tool_use(fn, req), stop("tool_use")],
                  [text("That scope is refused; ask for the national total of the reference year instead."), stop()])
        events = ask(ask_client, "question for %s" % name)
        refusals = only(events, "refusal")
        assert len(refusals) == 1, events
        r = refusals[0]
        assert r["error"] == golden["expect_error"] and r["k"] == 1 and r["name"] == fn
        assert r["error_class"] and r["message"]
        if golden.get("expect_limitation"):
            assert r["limitation_id"] == golden["expect_limitation"]
        assert not only(events, "tool_result")
        # the model saw an is_error tool_result carrying the typed refusal
        second = fake.calls[1]["messages"]
        tr = second[-1]["content"][0]
        assert second[-1]["role"] == "user" and tr["type"] == "tool_result" and tr["is_error"] is True
        assert golden["expect_error"] in tr["content"]
        assert only(events, "answer") and only(events, "done")
        return
    if not golden.get("expect"):                    # a golden that freezes an empty result (no cell to cite)
        fake.load([tool_use(fn, req), stop("tool_use")], [text("That scope carries no rows in this release."), stop()])
        events = ask(ask_client, "question for %s" % name)
        results = only(events, "tool_result")
        assert len(results) == 1 and results[0]["receipt"] == golden["expect_receipt"] and results[0]["n_values"] == 0
        assert only(events, "answer")[0]["receipts"] == [golden["expect_receipt"]]
        return
    fake.load([tool_use(fn, req), stop("tool_use")],
              [text("The value is {{result_1_cell_0}} {{result_1_cell_0.unit}} (receipt {{result_1_cell_0.exact}} aside)."), stop()])
    events = ask(ask_client, "question for %s" % name)
    results = only(events, "tool_result")
    assert len(results) == 1 and results[0]["receipt"] == golden["expect_receipt"], events
    assert results[0]["k"] == 1 and results[0]["name"] == fn and results[0]["n_values"] >= 1
    assert "release" not in results[0]["context"]
    answer = only(events, "answer")[0]
    env = ask_client.get("/api/v1/emissions/receipt/%s" % golden["expect_receipt"]).json()
    cell = env["values"][0]
    assert cell["display"] in answer["text"] and cell["unit"] in answer["text"]
    cites = CITE.findall(answer["text"])
    assert cites[0] == ("1", "0", golden["expect_receipt"], cell["display"])
    assert answer["receipts"] == [golden["expect_receipt"]]
    assert answer["citations"][0]["receipt"] == golden["expect_receipt"]
    done = only(events, "done")[0]
    assert done["usage"]["input_tokens"] == 200 and done["conversation_id"]
    # the model was given the compact result, not the envelope, and no version string
    tr = fake.calls[1]["messages"][-1]["content"][0]
    assert tr["type"] == "tool_result" and "is_error" not in tr
    body = json.loads(tr["content"])
    assert body["receipt"] == golden["expect_receipt"] and "cells" in body and "1.0.0rc" not in tr["content"]
    # beyond display/unit, a cell hands the model identifying strings only, never a second figure
    for c in body["cells"]:
        assert set(c) <= {"i", "display", "display_short", "unit", "group", "exactness", "interpretation", "attrs"}
        for key, val in c.get("attrs", {}).items():       # "1.A.2" is a code; "6977.44" is a figure
            assert isinstance(val, str) and (key in ("month", "period_id") or not re.match(r"^[-+]?(\d+[.,]?\d*|\.\d+)([eE][-+]?\d+)?$", val)), c


# --- the rendering gate ----------------------------------------------------------------------

def test_bare_decimal_is_corrected_once_then_withheld(ask_client, fake):
    fake.load([tool_use("query_emissions", {"periods": ["FY2023-24"]}), stop("tool_use")],
              [text("Pakistan emitted 452.35 Mt CO2e in FY2023-24."), stop()],
              [text("Pakistan emitted about 452.3 Mt."), stop()])
    events = ask(ask_client, "national total?")
    names = [n for n, _ in events]
    assert "answer" not in names
    err = only(events, "error")
    assert err and err[0]["code"] == "bare_numbers"
    corrections = [d for n, d in events if n == "status" and d["phase"] == "correction"]
    assert len(corrections) == 1
    # the third model call carried the correction turn
    assert len(fake.calls) == 3
    last = fake.calls[2]["messages"][-1]
    assert last["role"] == "user" and last["content"].startswith("Rejected:")
    assert only(events, "done")


def test_empty_final_text_is_asked_for_once_then_named(ask_client, fake):
    """A tool-call turn's text is not the answer; a final turn with no text gets one nudge."""
    fake.load([text("Punjab: {{result_1_cell_0}}"), tool_use("set_map_view", {"level": "adm1", "geo": "Punjab"}), stop("tool_use")],
              [stop()],
              [text("Punjab agriculture: {{result_1_cell_0}} {{result_1_cell_0.unit}}."), stop()])
    fake.scripts.insert(0, [tool_use("query_emissions", {"periods": ["FY2023-24"], "geography_level": "adm1", "geography_ids": ["Punjab"], "sectors": ["agriculture"]}), stop("tool_use")])
    events = ask(ask_client, "Punjab agriculture, show it")
    corrections = [d for n, d in events if n == "status" and d["phase"] == "correction"]
    assert len(corrections) == 1 and "without an answer" in corrections[0]["reason"]
    assert fake.calls[3]["messages"][-1]["content"].startswith("Your last message carried no text")
    answer = only(events, "answer")
    assert answer and "123.3050" in answer[0]["text"] and only(events, "map_action")
    fake.load([stop()], [stop()])
    events = ask(ask_client, "say nothing")
    assert only(events, "error") == [{"code": "empty_answer", "message": "the model ended the turn without an answer"}]
    assert not only(events, "answer") and only(events, "done")


def test_correction_turn_can_succeed(ask_client, fake):
    fake.load([tool_use("query_emissions", {"periods": ["FY2023-24"]}), stop("tool_use")],
              [text("It is 452.35 Mt."), stop()],
              [text("It is {{result_1_cell_0}} {{result_1_cell_0.unit}}."), stop()])
    events = ask(ask_client, "national total?")
    answer = only(events, "answer")
    assert answer and "452.34662" in answer[0]["text"]
    assert not only(events, "error")


def test_unknown_placeholder_is_placeholder_error(ask_client, fake):
    fake.load([tool_use("query_emissions", {"periods": ["FY2023-24"]}), stop("tool_use")],
              [text("See {{result_1_cell_7}}."), stop()],
              [text("See {{result_2_cell_0}}."), stop()])
    events = ask(ask_client, "national total?")
    err = only(events, "error")
    assert err and err[0]["code"] == "placeholder_error" and not only(events, "answer")


def test_multi_result_placeholders(ask_client, fake):
    fake.load([tool_use("query_emissions", {"periods": ["FY2023-24"]}),
               tool_use("query_emissions", {"periods": ["FY2023-24"], "configuration_id": "S_2023_24"}), stop("tool_use")],
              [text("REF {{result_1_cell_0}} vs S {{result_2_cell_0}} {{result_2_cell_0.unit}}; legacy {{result_cell_0}}."), stop()])
    events = ask(ask_client, "compare")
    results = only(events, "tool_result")
    assert [r["k"] for r in results] == [1, 2]
    answer = only(events, "answer")[0]
    cites = CITE.findall(answer["text"])
    assert [c[0] for c in cites] == ["1", "2", "2", "2"]        # value, value, unit, legacy (= last result)
    assert cites[0][3] == "452.34662" and cites[1][3] == "447.21383" and cites[2][3] == "Mt CO2e AR5" and cites[3][3] == "447.21383"
    assert answer["receipts"] == [results[0]["receipt"], results[1]["receipt"]]
    # both tool results went back in one user message, in order
    tr = fake.calls[1]["messages"][-1]["content"]
    assert [t["type"] for t in tr] == ["tool_result", "tool_result"]


def test_render_multi_allowlist_and_errors():
    env = {"receipt": "abc", "values": [{"display": "1.5", "exact": "1.50", "unit": "Mt"}]}
    text_, cites = render_multi("v {{result_1_cell_0}} of 1.0.0rc42", [env], allowlist=("1.0.0rc42",))
    assert '<cite k="1" cell="0" receipt="abc">1.5</cite>' in text_ and cites[0]["text"] == "1.5"
    with pytest.raises(BareNumberError):
        render_multi("v {{result_1_cell_0}} of 1.0.0rc42", [env])
    with pytest.raises(PlaceholderError):
        render_multi("{{result_1_cell_0}}", [None])
    with pytest.raises(PlaceholderError):
        render_multi("{{result_cell_0}}", [])
    assert render_multi("{{result_cell_0.exact}}", [env])[0].endswith(">1.50</cite>")


# --- the map tool -----------------------------------------------------------------------------

def test_set_map_view_valid_emits_map_action(ask_client, fake):
    fake.load([tool_use("query_emissions", {"periods": ["FY2023-24"], "geography_level": "adm1", "geography_ids": ["Punjab"], "sectors": ["agriculture"]}),
               stop("tool_use")],
              [tool_use("set_map_view", {"level": "adm1", "geo": "Punjab", "period": "FY2023-24", "sector": "agriculture"}), stop("tool_use")],
              [text("Punjab agriculture: {{result_1_cell_0}} {{result_1_cell_0.unit}}."), stop()])
    events = ask(ask_client, "Punjab agriculture, show it", ui_state={"level": "adm1", "period": "FY2023-24"})
    actions = only(events, "map_action")
    assert actions == [{"level": "adm1", "geo": "Punjab", "period": "FY2023-24", "sector": "agriculture"}]
    assert only(events, "tool_result")[0]["receipt"] == "8328128a5bd1eca6b1a29ad79cf6d910"
    assert [c["k"] for c in only(events, "tool_call")] == [1, 2]
    assert only(events, "answer")
    # ui_state was prepended to the user message
    first_user = fake.calls[0]["messages"][-1]["content"]
    assert first_user.startswith("[ui_state] {") and first_user.endswith("Punjab agriculture, show it")


def test_set_map_view_invalid_province_is_error(ask_client, fake):
    fake.load([tool_use("set_map_view", {"level": "adm1", "geo": "Kashmir Valley"}), stop("tool_use")],
              [text("There is no such province; the provinces are listed in the tools."), stop()])
    events = ask(ask_client, "show Kashmir Valley")
    assert not only(events, "map_action")
    refusal = only(events, "refusal")
    assert refusal and refusal[0]["name"] == "set_map_view" and "Kashmir Valley" in refusal[0]["message"]
    tr = fake.calls[1]["messages"][-1]["content"][0]
    assert tr["is_error"] is True


def test_set_map_view_district_name_resolves_to_shape_id(ask_client, fake):
    dims = ask_client.app.state.ask.dims
    name, shape = next(iter(dims.adm2_by_name.items()))
    fake.load([tool_use("set_map_view", {"geo": name, "gas": "CH4"}), stop("tool_use")], [text("done"), stop()])
    events = ask(ask_client, "show %s" % name)
    assert only(events, "map_action") == [{"geo": shape, "level": "adm2", "gas": "CH4"}]


# --- download and receipts ---------------------------------------------------------------------

def test_download_only_for_receipts_the_conversation_holds(ask_client, fake):
    fake.load([tool_use("download_query_result", {"receipt_id": "5eb40940d01be992a296f658fb91ab9e"}), stop("tool_use")],
              [text("Run the query first."), stop()])
    events = ask(ask_client, "download it")
    assert only(events, "refusal")[0]["name"] == "download_query_result"
    fake.load([tool_use("query_emissions", {"periods": ["FY2023-24"]}), stop("tool_use")],
              [tool_use("download_query_result", {"receipt_id": "5eb40940d01be992a296f658fb91ab9e"}), stop("tool_use")],
              [text("Links below."), stop()])
    events = ask(ask_client, "total then download")
    results = only(events, "tool_result")
    assert results[1]["download"] == {"csv": "/api/v1/emissions/download/5eb40940d01be992a296f658fb91ab9e.csv",
                                      "receipt_json": "/api/v1/emissions/download/5eb40940d01be992a296f658fb91ab9e.receipt.json"}
    assert ask_client.get(results[1]["download"]["csv"]).status_code == 200


def test_invalid_tool_input_is_error_not_crash(ask_client, fake):
    fake.load([tool_use("query_emissions", {"periods": "FY2023-24", "limit": "many"}), stop("tool_use")],
              [text("Let me restate that."), stop()])
    events = ask(ask_client, "bad input")
    refusal = only(events, "refusal")
    assert refusal and refusal[0]["error"] == "invalid_input" and refusal[0]["error_class"] == "ToolInputError"
    assert only(events, "answer")


# --- the tool list -----------------------------------------------------------------------------

def test_tools_are_the_contract_functions_plus_set_map_view(ask_client):
    from pakemis_api import models_gen as G
    from pakemis_api.ask.tools import FUNCTION_MODEL, inline_schema
    runtime = ask_client.app.state.ask
    contract = ask_client.get("/api/v1/emissions/release").json()["query_contract"]["functions"]
    assert [t["name"] for t in runtime.tools] == contract + ["set_map_view"]
    assert len(runtime.tools) == 12
    for tool in runtime.tools:
        assert tool["description"] and tool["input_schema"]["type"] == "object"
        assert "$defs" not in json.dumps(tool) and '"title"' not in json.dumps(tool)
        if tool["name"] == "set_map_view":
            continue
        model = G.MODELS[FUNCTION_MODEL[tool["name"]]]
        plain = inline_schema(model.model_json_schema())
        assert set(tool["input_schema"]["properties"]) == set(plain["properties"]) == set(model.model_fields)
        assert tool["input_schema"].get("required", []) == plain.get("required", [])
        # every enum keeps the model's default valid, and a minimal body round-trips the model
        for name, prop in tool["input_schema"]["properties"].items():
            if "enum" in prop and "default" in prop:
                assert prop["default"] in prop["enum"], (tool["name"], name)
        minimal = {n: {} for n, p in tool["input_schema"]["properties"].items() if p.get("type") == "object"}
        assert G.to_request(model.model_validate(minimal))


def test_system_prompt_names_no_version_and_carries_dims(ask_client):
    runtime = ask_client.app.state.ask
    version = ask_client.app.state.service.release.version
    assert version not in runtime.system
    for needle in ("{{result_k_cell_n}}", "set_map_view", "FY2023-24", "Punjab", "agriculture", "ar6_adm2_ne",
                   "WHAT PAKEMIS IS", "PakEmis is an open dataset of Pakistan's greenhouse-gas emissions"):
        assert needle in runtime.system
    # the project paragraph carries no digit: "what is this project about?" needs no tool and prints no figure
    what = runtime.system.split("WHAT PAKEMIS IS")[1].split("RULES (binding)")[0]
    assert not re.search(r"\d", what)


# --- caps, memory, status ----------------------------------------------------------------------

def test_turn_cap(ask_client, fake):
    limits = ask_client.app.state.ask.limits
    fake.load(*[[tool_use("query_emissions", {"periods": ["FY2023-24"], "limit": i + 1}, call_id="t%d" % i), stop("tool_use")]
                for i in range(limits.max_turns + 2)])
    events = ask(ask_client, "loop forever")
    err = only(events, "error")
    assert err == [{"code": "turn_limit", "message": "the agent made %d model calls without a final answer" % limits.max_turns}]
    assert len(fake.calls) == limits.max_turns and not only(events, "answer") and only(events, "done")


def test_conversation_memory_and_client_history(ask_client, fake):
    fake.load([text("Ask me for a figure."), stop()])
    events = ask(ask_client, "hello")
    cid = only(events, "done")[0]["conversation_id"]
    fake.load([text("Still here."), stop()])
    ask(ask_client, "second", conversation_id=cid)
    msgs = fake.calls[0]["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant", "user"] and msgs[1]["content"] == "Ask me for a figure."
    fake.load([text("Seeded."), stop()])
    ask(ask_client, "third", conversation_id="unknown-id", client_history=[{"role": "user", "content": "earlier"}, {"role": "assistant", "content": "reply"}])
    msgs = fake.calls[0]["messages"]
    assert msgs[0]["content"] == "earlier" and msgs[1]["content"] == "reply" and msgs[2]["content"] == "third"


def test_agent_status_and_release_flag(ask_client):
    status = ask_client.app.state.service.agent_status
    assert status == {"enabled": True, "model": "fake-model", "provider": "injected", "reason": None}


def test_503_when_disabled(settings, monkeypatch):
    from pakemis_api.app import create_app
    for var in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    with TestClient(create_app(settings)) as c:
        r = c.post("/api/v1/emissions/ask", json={"message": "hi", "ui_state": {}})
        assert r.status_code == 503 and r.json()["error"] == "agent_disabled"
        assert c.app.state.service.agent_status["enabled"] is False and c.app.state.service.agent_status["model"] is None
        assert "KEY" not in json.dumps(c.app.state.service.agent_status).replace("ANTHROPIC_API_KEY", "").replace("GEMINI_API_KEY", "")


def test_anthropic_model_builds_without_a_key(monkeypatch):
    """Construction reads no key; only a live call would (and none is made here)."""
    from pakemis_api.ask.loop import AnthropicModel
    m = AnthropicModel("claude-sonnet-5", max_tokens=8000, effort="medium")
    assert m.model_id == "claude-sonnet-5" and m._thinking == {"type": "adaptive", "display": "summarized"}


# --- the answer card's additions: answer.scope, tool_result.uncertainty and n_rows -------------

def test_answer_scope_and_tool_result_additions(ask_client, fake):
    fake.load([tool_use("query_emissions", {"group_by": ["sector_id"]}), stop("tool_use")],
              [text("Agriculture is {{result_1_cell_0.short}} of the total."), stop()])
    events = ask(ask_client, "what makes up the total?")
    results = only(events, "tool_result")
    assert len(results) == 1
    tr = results[0]
    unc = tr["uncertainty"]
    assert unc["source"] == "fact_uncertainty" and unc["resolution"] == "annual_national" and unc["rows"] and unc["interpretation"]
    assert all(r["resolution"] == "annual_national" for r in unc["rows"]) and len(unc["rows"]) == 20
    row = unc["rows"][0]
    assert {"category", "module", "resolution", "envelope_low_pct", "envelope_high_pct", "envelope_kind", "aggregation_rule"} <= set(row)
    assert all(isinstance(v, str) for v in row.values())
    assert all(isinstance(c["n_rows"], int) and c["n_rows"] > 0 for c in tr["cells"])
    assert sum(c["n_rows"] for c in tr["cells"]) == sum(len(v["result_row_ids"]) for v in ask_client.get("/api/v1/emissions/receipt/%s" % tr["receipt"]).json()["values"])
    answer = only(events, "answer")[0]
    assert answer["scope"]["k"] == 1 and answer["scope"]["request_type"] == "query_emissions" and answer["scope"]["receipt"] == tr["receipt"]
    assert answer["scope"]["name"] == "query_emissions"
    assert {k: v for k, v in answer["scope"].items() if k in tr["context"]} == tr["context"]
    assert answer["scope"]["configuration_id"] == "REF_2023_24" and answer["scope"]["geography_level"] == "national"
    # the model's view of the tool result is unchanged: no uncertainty block, no n_rows
    seen = fake.calls[1]["messages"][-1]["content"][0]["content"]
    assert '"uncertainty"' not in seen and '"n_rows"' not in seen
    assert json.loads(seen)["k"] == 1


def test_answer_scope_is_the_last_result(ask_client, fake):
    fake.load([tool_use("query_emissions", {}), stop("tool_use")],
              [tool_use("query_emissions", {"geography_level": "adm1", "group_by": ["province"]}), stop("tool_use")],
              [text("Punjab leads with {{result_2_cell_0.short}}."), stop()])
    events = ask(ask_client, "which province leads?")
    results = only(events, "tool_result")
    assert [r["k"] for r in results] == [1, 2]
    scope = only(events, "answer")[0]["scope"]
    assert scope["k"] == 2 and scope["geography_level"] == "adm1" and scope["receipt"] == results[1]["receipt"]
    assert results[0]["uncertainty"]["rows"] and results[1]["cells"][0]["n_rows"] > 100
    assert results[1]["uncertainty"]["resolution"] is None and "no adm1 resolution" in results[1]["uncertainty"]["interpretation"]
    # a category query narrows the rows to the category; a get_uncertainty result carries none (its cells are the uncertainty)
    fake.load([tool_use("query_emissions", {"categories": ["Enteric fermentation"]}), stop("tool_use")],
              [tool_use("get_uncertainty", {"scope": "category", "category": "Enteric fermentation"}), stop("tool_use")],
              [text("Enteric fermentation is {{result_1_cell_0.short}}."), stop()])
    events = ask(ask_client, "how uncertain is enteric fermentation?")
    results = only(events, "tool_result")
    assert [r["category"] for r in results[0]["uncertainty"]["rows"]] == ["Enteric fermentation"] and results[0]["uncertainty"]["rows"][0]["parametric_low_pct"] == "-22.22"
    assert results[1]["uncertainty"] is None and results[1]["cells"][0]["n_rows"] == 1


def test_answer_scope_is_null_without_a_result(ask_client, fake):
    fake.load([text("Ask me for a number and I will look it up."), stop()])
    events = ask(ask_client, "hello")
    assert only(events, "answer")[0]["scope"] is None
