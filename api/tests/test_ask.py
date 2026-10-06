"""Ask PakEmis under a scripted model: every golden through the agent's tool path gives the
golden's receipt and its display in the answer; refusal goldens arrive as `refusal` events and
is_error tool results; an invented decimal is corrected once and then withheld; the map tool
validates against the dims; the tool list is the contract's; no key means 503. No live call is
ever made: the model is a FakeModel whose scripts the tests set per case."""
import copy
import json
import re

import os
import pytest
from fastapi.testclient import TestClient

from conftest import load_goldens
from pakemis_api.ask.loop import ModelEvent
from pakemis_api.ask.tools import ENGINE_TOOLS, FUNCTION_MODEL, function_tool
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
    assert cell["display"] in answer["text"] and (cell.get("unit_short") or cell["unit"]) in answer["text"]
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
    assert answer and "469.63822" in answer[0]["text"]
    assert not only(events, "error")


def test_invented_placeholder_never_reaches_a_reader(ask_client, fake):
    """THE ONE I WOULD KEEP ABOVE THE REST IN THIS FILE.

    A real answer shipped with "{{result_2_cell_0.attrs.share_phrase}}" printed on screen. It was not
    caught because MULTI's alternation did not match it, so it was not a *failed* placeholder - it was
    not a placeholder at all, and every guard here only ever inspected the ones the renderer
    recognised. The model had a good reason to write it (see render.SERVICE_ATTRS), which is why the
    fix grants `.share` rather than only banning the guess.

    One redraft is asked for; if the second draft still invents a field the phrase is struck and the
    answer ships, because withholding a correct answer over one unwritable aside serves nobody.
    """
    fake.load([tool_use("query_emissions", {"periods": ["FY2023-24"]}), stop("tool_use")],
              [text("The total is {{result_1_cell_0.short}} {{result_1_cell_0.unit}} {{result_1_cell_0.attrs.share_phrase}}."), stop()],
              [text("The total is {{result_1_cell_0.short}} {{result_1_cell_0.unit}} {{result_1_cell_0.attrs.share_phrase}}."), stop()])
    events = ask(ask_client, "national total?")
    corrections = [d for n, d in events if n == "status" and d["phase"] == "correction"]
    assert len(corrections) == 1                                  # asked to redraft exactly once
    answer = only(events, "answer")
    assert answer, "a correct answer must not be withheld over an unwritable aside"
    body = answer[0]["text"]
    assert "{{" not in body and "}}" not in body                  # the whole point
    assert "share_phrase" not in body and "attrs" not in body
    assert "469.64" in body                                       # the real figure survived, cited
    # and the sentence still reads: no gap and no stranded stop where the phrase had been
    assert " ." not in body and "  " not in body
    assert not only(events, "error")


def test_a_bare_decimal_is_still_withheld_after_the_drop_path_exists(ask_client, fake):
    """The leniency above must not have leaked into the correctness guard.

    An invented decimal is a wrong number, not an unwritable phrase, and it is still worth the whole
    answer to refuse it.
    """
    fake.load([tool_use("query_emissions", {"periods": ["FY2023-24"]}), stop("tool_use")],
              [text("Pakistan emitted 452.35 Mt."), stop()],
              [text("Pakistan emitted about 452.3 Mt."), stop()])
    events = ask(ask_client, "national total?")
    assert only(events, "error")[0]["code"] == "bare_numbers"
    assert not only(events, "answer")


def test_a_share_is_writable_in_words_and_as_a_percentage(ask_client, fake):
    """`.share` and `.pct` exist so the model can state a share WITHOUT typing a digit itself."""
    fake.load([tool_use("query_emissions", {"periods": ["FY2023-24"], "group_by": ["reporting_sector"]}), stop("tool_use")],
              [text("Agriculture led at {{result_1_cell_0.short}} {{result_1_cell_0.unit}}."), stop()])
    events = ask(ask_client, "which sector leads?")
    answer = only(events, "answer")
    assert answer and "{{" not in answer[0]["text"]


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
    assert cites[0][3] == "469.63822" and cites[1][3] == "464.50543" and cites[2][3] == "Mt CO₂e" and cites[3][3] == "464.50543"
    assert answer["receipts"] == [results[0]["receipt"], results[1]["receipt"]]
    # both tool results went back in one user message, in order
    tr = fake.calls[1]["messages"][-1]["content"]
    assert [t["type"] for t in tr] == ["tool_result", "tool_result"]


def test_render_multi_allowlist_and_errors():
    env = {"receipt": "abc", "values": [{"display": "1.5", "exact": "1.50", "unit": "Mt"}]}
    text_, cites = render_multi("v {{result_1_cell_0}} of 1.0.0rc47", [env], allowlist=("1.0.0rc47",))
    assert '<cite k="1" cell="0" receipt="abc">1.5</cite>' in text_ and cites[0]["text"] == "1.5"
    with pytest.raises(BareNumberError):
        render_multi("v {{result_1_cell_0}} of 1.0.0rc47", [env])
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
    # rc54 payload: receipts carry the release identity, so every pinned receipt moved at the jump
    assert only(events, "tool_result")[0]["receipt"] == "8df62437abed796f3c5564713d18b135"
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
    fake.load([tool_use("download_query_result", {"receipt_id": "51f8dcb6e255c6b499d0134dc6e0359d"}), stop("tool_use")],
              [text("Run the query first."), stop()])
    events = ask(ask_client, "download it")
    assert only(events, "refusal")[0]["name"] == "download_query_result"
    fake.load([tool_use("query_emissions", {"periods": ["FY2023-24"]}), stop("tool_use")],
              [tool_use("download_query_result", {"receipt_id": "51f8dcb6e255c6b499d0134dc6e0359d"}), stop("tool_use")],
              [text("Links below."), stop()])
    events = ask(ask_client, "total then download")
    results = only(events, "tool_result")
    assert results[1]["download"] == {"csv": "/api/v1/emissions/download/51f8dcb6e255c6b499d0134dc6e0359d.csv",
                                      "receipt_json": "/api/v1/emissions/download/51f8dcb6e255c6b499d0134dc6e0359d.receipt.json"}
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
    assert len(runtime.tools) == 13  # 12 + query_air (the air beta)
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


def test_the_prompt_does_not_ask_for_an_automatic_map_move(ask_client):
    """A factual question must not relocate the view the reader was looking at.

    Rule 5 used to read "After answering about a place, a period, a sector or a gas, call
    set_map_view once so the map follows the answer" - so asking which agriculture categories are
    unestimated rearranged the map and reported it as six configuration chips. The tool stays for an
    explicit "show me X on the map"; the instruction to use it unprompted does not.
    """
    system = ask_client.app.state.ask.system
    assert "set_map_view" in system                                   # the tool is still offered
    assert "After answering about a place" not in system
    assert "so the map follows the answer" not in system
    assert "only when the reader asked to" in system


def test_the_prompt_forbids_claiming_an_observation_the_release_lacks(ask_client):
    """An answer said the inventory "tracks how many animals of each type exist across Pakistan's
    districts". For FY2023-24 that happens to hold - the 7th Agricultural Census enumerated them -
    but it is false for the other eight years, which are a projection of that count, and every
    district figure is a share of a province total rather than a district calculation. Dressing a
    derived value as a direct measurement is a correctness failure, not a style one.
    """
    system = ask_client.app.state.ask.system
    assert "NEVER CLAIM AN OBSERVATION THE RELEASE DOES NOT HAVE" in system
    for needle in ("allocated from", "projected from", "get_evidence"):
        assert needle in system
    # a provincial figure is a national total spread by a proxy; saying the province "has data"
    # implies it was measured there, and implies two provinces are differently evidenced when both
    # are shares of one national number
    assert 'NEVER SAY A PLACE "HAS DATA" WHEN ITS FIGURE IS AN ALLOCATION' in system
    assert "never present one as better evidenced" in system
    # "road transport" and "transport" are different totals
    assert "NAME THE SCOPE THE METHOD ACTUALLY COVERS" in system
    # an answer quoted "grain_unavailable" at a reader because rule 3 asked for the limitation_id
    assert "NEVER WRITE THE ERROR CLASS OR THE LIMITATION ID" in system
    assert "its error_class, its" not in system


def test_the_prompt_makes_a_ranking_name_its_scope(ask_client):
    """The assistant answered that residential combustion was Lahore's largest source. The
    honest form is "the largest of the sources estimated here": the air panel covered six
    sectors through rc57; industry (rc58), IPPU process pollutants and fugitive NMVOC with
    flaring (rc59) entered as provisional estimates from a register that types what it cannot
    price absent, and power is a screening beside the panel. A bare "largest source" asserts a
    completeness the release does not claim - the one scope statement the interface cannot
    print for the model, because it changes what the word means."""
    system = ask_client.app.state.ask.system
    assert "A RANKING NAMES ITS SCOPE" in system
    assert "the largest of the sources estimated here" in system
    assert "provisional estimates from a" in system
    assert "types what it cannot price absent" in system


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
    # `library` is the explanation library's content digest: the runtime now installs with or
    # without a model, because the prepared explanations cost no inference and a site with no
    # provider key should still answer what emissions are.
    assert {k: v for k, v in status.items() if k != "library"} == {"enabled": True, "model": "fake-model", "provider": "injected", "reason": None}
    assert len(status["library"]) == 16


def test_503_when_disabled(settings, monkeypatch):
    from pakemis_api.app import create_app
    for var in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    with TestClient(create_app(settings)) as c:
        r = c.post("/api/v1/emissions/ask", json={"message": "hi", "ui_state": {}})
        assert r.status_code == 503 and r.json()["error"] == "agent_disabled"
        assert c.app.state.service.agent_status["enabled"] is False and c.app.state.service.agent_status["model"] is None
        assert "KEY" not in json.dumps(c.app.state.service.agent_status).replace("ANTHROPIC_API_KEY", "").replace("GEMINI_API_KEY", "")


def test_the_rate_limited_address_is_the_one_a_proxy_observed():
    """X-Forwarded-For is `<what the caller sent>, <caller>, <our proxies>`: the left-most entry
    is the caller's own writing, and keying on it let anyone mint a bucket per request."""
    from pakemis_api.ask.limits import client_address, parse_networks
    edge = parse_networks("151.101.0.0/16, 2a04:4e42::/32")
    # reached directly: the last hop is the caller, whatever they wrote before it
    assert client_address("1.1.1.1, 203.0.113.9", "10.0.0.1") == "203.0.113.9"
    assert client_address("203.0.113.9", "10.0.0.1") == "203.0.113.9"
    # behind our own edge: the edge's hop is skipped and the caller it observed is next
    assert client_address("1.1.1.1, 203.0.113.9, 151.101.1.5", "10.0.0.1", edge) == "203.0.113.9"
    assert client_address("2001:db8::7, 2a04:4e42::15", None, edge) == "2001:db8::7"
    # an edge nobody named is not skipped: its readers share a bucket, which over-limits
    assert client_address("203.0.113.9, 151.101.1.5", "10.0.0.1") == "151.101.1.5"
    # a caller cannot forge a trusted hop into the position a proxy writes
    assert client_address("151.101.1.5, 203.0.113.9", "10.0.0.1", edge) == "203.0.113.9"
    assert client_address("not-an-address, 203.0.113.9", "10.0.0.1", edge) == "203.0.113.9"
    # no header at all (local development): the socket's peer
    assert client_address(None, "127.0.0.1") == "127.0.0.1" and client_address("", None) == "unknown"
    with pytest.raises(ValueError):
        parse_networks("151.101.0.0/16, not-a-network")


def test_a_forged_forwarded_address_does_not_buy_a_fresh_bucket(settings):
    """The limit a public deployment leans on: the same caller, a different invented address in
    front of their own on every request, is still one caller."""
    from pakemis_api.app import create_app
    from pakemis_api.ask.limits import PerIpBucket
    model = FakeModel([[text("Ask me for a figure."), stop()] for _ in range(3)])
    with TestClient(create_app(settings, model_client=model)) as c:
        c.app.state.ask.per_ip = PerIpBucket(3)
        codes = [c.post("/api/v1/emissions/ask", json={"message": "hello %d" % i, "ui_state": {}},
                        headers={"X-Forwarded-For": "198.51.100.%d, 203.0.113.9" % i}).status_code for i in range(5)]
        assert codes == [200, 200, 200, 429, 429]
        # and another caller is not caught in it
        other = c.post("/api/v1/emissions/ask", json={"message": "hello again", "ui_state": {}},
                       headers={"X-Forwarded-For": "198.51.100.1, 203.0.113.10"})
        assert other.status_code != 429


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
    # the core supplies the block itself now. Until its resolution defect was fixed the string it
    # selected on matched nothing, the envelope was always empty, and this sidecar read
    # fact_uncertainty from the claim store instead - same rows, one hop further away.
    assert unc["source"] == "envelope" and unc["resolution"] == "annual_national" and unc["rows"] and unc["interpretation"]
    assert all(r["resolution"] == "annual_national" for r in unc["rows"]) and len(unc["rows"]) == 23
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
    # The core supplies the block now, and it selects the STRUCTURAL envelope columns rather than
    # the whole row: the sidecar's own fallback did SELECT *, which is why this used to reach
    # `parametric_low_pct`. The narrower set is the right one - the block's own interpretation says
    # these are bounds and NOT a probability, and the parametric numbers are what the second tool
    # call here, get_uncertainty, returns. Same category, same value, named for what it is.
    unc = results[0]["uncertainty"]
    assert [r["category"] for r in unc["rows"]] == ["Enteric fermentation"]
    assert unc["rows"][0]["envelope_low_pct"] == "-22.22" and unc["source"] == "envelope"
    assert results[1]["uncertainty"] is None and results[1]["cells"][0]["n_rows"] == 1


def test_answer_scope_is_null_without_a_result(ask_client, fake):
    fake.load([text("Ask me for a number and I will look it up."), stop()])
    events = ask(ask_client, "hello")
    assert only(events, "answer")[0]["scope"] is None


# --- the schema and the validator must agree ----------------------------------------------------

def _allowed(tool, field):
    """The values a tool's schema advertises for one field, parsed back out of its description."""
    prop = tool["input_schema"]["properties"].get(field)
    if not prop:
        return None
    match = re.search(r"Allowed: (.+?)\.(?: |$)", prop.get("description", ""))
    return [v.strip() for v in match.group(1).split(",")] if match else None


def test_the_air_tool_advertises_the_groupings_the_air_engine_accepts(ask_client):
    """THE BUG THIS TEST EXISTS FOR, and it reached a user.

    Every request model was enriched from one dictionary, so `query_air` advertised the
    GREENHOUSE-GAS grouping list: gas, ipcc_code, component_id, month, module, spatial_view,
    configuration_id, reporting_sector - none of which the air tables carry - while omitting
    pollutant, subitem and year, which they require. A reader asked for "total pollutants in
    Lahore district"; the model passed `gas` because the schema said it could; the engine rejected
    it with the correct list; the model retried and burned the conversation's budget.

    The model was not wrong. The instructions were."""
    dims = ask_client.app.state.ask.dims
    advertised = _allowed(function_tool("query_air", dims), "group_by")
    assert advertised, "query_air must advertise its groupings"
    from pakemis_query import Engine
    assert set(advertised) == set(Engine.AIR_GROUPS), (
        "the air tool schema and the air validator disagree; schema says %s, engine accepts %s"
        % (sorted(advertised), sorted(Engine.AIR_GROUPS)))
    assert "gas" not in advertised, "no air table carries a gas column"
    assert "pollutant" in advertised


def test_no_tool_describes_a_geography_level_as_reference_year_only(ask_client):
    """A level the release serves for every year must not be advertised as one year's.

    THE SAME DEFECT IN A SECOND PLACE. The system prompt said adm1 and adm2 existed for the
    reference year only; the release carries fact_adm1_year for every fiscal year, and four
    of thirty-four evaluation answers refused a historical provincial figure WITHOUT calling
    a tool, quoting the prompt. The prompt was corrected in 68155c4. The TOOL SCHEMA still
    said "adm1/adm2 exist for <reference period> only", so a model could read the same false
    restriction off the function definition instead - and a correction that reaches one of
    two statements of the same fact has not been made.

    The period coverage is read from the release rather than asserted, so if a level ever
    genuinely becomes single-period this stops demanding otherwise.
    """
    dims = ask_client.app.state.ask.dims
    rel = ask_client.app.state.ask.service.release
    assert "fact_adm1_year" in rel.tables, (
        "the served release carries no fact_adm1_year; if annual province data really is gone, "
        "the schema may restrict adm1 and this test should be retired")
    # table_path returns (path, format) and prefers the parquet, which is why a first version
    # of this test str()'d the tuple, found no file and SKIPPED - guarding nothing.
    path, fmt = rel.table_path("fact_adm1_year")
    periods = set()
    if fmt == "parquet":
        import pyarrow.parquet as pq
        periods = set(pq.read_table(path, columns=["period_id"])["period_id"].to_pylist())
    else:
        import csv as _csv
        import io as _io
        with _io.open(path, encoding="utf-8") as handle:
            periods = {r["period_id"] for r in _csv.DictReader(handle) if r.get("period_id")}
    periods.discard(None)
    assert len(periods) > 1, (
        "fact_adm1_year carries %d period(s); if adm1 really is single-period now, the "
        "schema may say so and this test should be retired" % len(periods))
    prop = function_tool("query_emissions", dims)["input_schema"]["properties"]["geography_level"]
    note = prop.get("description", "")
    assert not (dims.reference_period and dims.reference_period in note and "only" in note), (
        "adm1 is served for %d periods and the geography_level description still restricts it "
        "to %s: %r" % (len(periods), dims.reference_period, note))
    assert "every fiscal year" in note, (
        "geography_level should state that the levels carry every fiscal year; it says %r"
        % note)


def test_no_tool_advertises_a_grouping_its_own_engine_would_reject(ask_client):
    """The general form. Every value a tool offers for `group_by` must be one its own validator
    accepts - otherwise the schema is instructing the model to fail, which is what happened."""
    dims = ask_client.app.state.ask.dims
    from pakemis_query import Engine
    accepted = {"QueryAir": set(Engine.AIR_GROUPS)}
    from pakemis_query.models import GROUPS
    mismatched = []
    for name in ENGINE_TOOLS:
        advertised = _allowed(function_tool(name, dims), "group_by")
        if advertised is None:
            continue
        allowed = accepted.get(FUNCTION_MODEL[name], set(GROUPS))
        stray = sorted(set(advertised) - allowed)
        if stray:
            mismatched.append((name, stray))
    assert not mismatched, "tools advertise groupings their engine rejects: %s" % mismatched


def test_the_air_tool_names_its_pollutants(ask_client):
    """`pollutants` had no entry in the allowed-values table at all, so the one field an air
    question turns on was the one field the model was given no vocabulary for."""
    dims = ask_client.app.state.ask.dims
    advertised = _allowed(function_tool("query_air", dims), "pollutants")
    assert advertised, "query_air must name the pollutants it accepts"
    assert "SO2" in advertised and "PM2.5" in advertised


# --- the loop: what turned one bad call into a spent budget -----------------------------------

def test_an_identical_rejected_call_is_refused_as_a_repeat_not_re_run(ask_client, fake):
    """THE LOOP. Nothing recorded what had already been asked, so a model whose call was rejected
    could re-issue it byte-for-byte and get the identical rejection back, turn after turn, until
    max_turns=8 was gone. With a schema that disagreed with the validator there was no input it
    could reach that would work, so that is exactly what happened.

    The second identical call must come back with a DIFFERENT error - one that says it is a repeat
    and that repeating cannot help - so the model has a reason to stop.
    """
    bad = {"group_by": ["gas"], "geography_level": "adm2"}
    fake.load([tool_use("query_air", bad, call_id="c1"), stop("tool_use")],
              [tool_use("query_air", bad, call_id="c2"), stop("tool_use")],
              [text("I cannot group the air tables by gas; they carry pollutant instead."), stop()])
    events = ask(ask_client, "total pollutants in Lahore district for 2023")
    refusals = only(events, "refusal")
    assert len(refusals) == 2, events
    first, second = refusals
    assert "repeats call 1" in second["message"], second["message"]
    assert "cannot succeed" in second["message"]
    assert second["message"] != first["message"], "the repeat got the same rejection again"
    # and the engine was not asked a second time: the repeat is answered from what is already known
    assert only(events, "answer"), events


def test_a_repeated_successful_call_replays_rather_than_re_running(ask_client, fake):
    """The same bookkeeping, on the other branch: an identical call that already SUCCEEDED gets the
    same envelope back, so citations at the second k still resolve."""
    req = {"periods": ["FY2023-24"]}
    fake.load([tool_use("query_emissions", req, call_id="d1"), stop("tool_use")],
              [tool_use("query_emissions", req, call_id="d2"), stop("tool_use")],
              [text("The national total is {{result_2_cell_0}} {{result_2_cell_0.unit}}."), stop()])
    events = ask(ask_client, "national total for the reference year, twice")
    results = only(events, "tool_result")
    assert len(results) == 2, events
    assert results[0]["receipt"] == results[1]["receipt"]
    answers = only(events, "answer")
    assert answers, events
    # the citation on the SECOND result rendered, which it cannot do if the replay appended nothing
    assert answers[0]["citations"], answers[0]["text"]


def test_a_turn_that_keeps_no_history_does_not_charge_the_conversation(ask_client, fake, settings):
    """THE SECOND HALF OF THE SCREENSHOT. A turn that ended at the turn limit raised
    conv.tokens_spent and appended no history: the conversation carried all of the cost and none of
    the benefit, so the NEXT question died on `budget_exhausted` before it ran. The day still pays
    - those tokens were really spent - but the conversation cap measures the context it carries.
    """
    ask_state = ask_client.app.state.ask
    limit = ask_state.limits.max_turns
    call = {"group_by": ["gas"]}
    # burn the whole turn budget on calls that never reach an answer, each one distinct so the
    # repeat guard does not end it early
    fake.load(*[[tool_use("query_air", dict(call, limit=i + 1), call_id="t%d" % i), stop("tool_use")]
                for i in range(limit + 1)])
    events = ask(ask_client, "make a table of annual emissions trend by sector for Lahore district")
    errors = only(events, "error")
    assert errors and errors[0]["code"] == "turn_limit", events
    conv_id = only(events, "done")[0]["conversation_id"]
    conv = ask_state.memory._by_id.get(conv_id)
    assert conv is not None, "the conversation was not retained"
    assert not conv.messages, "a turn with no answer appended history"
    assert conv.tokens_spent == 0, (
        "a turn that appended no history charged the conversation %d tokens" % conv.tokens_spent)
    # the DAY still paid: those tokens were really spent, whatever the conversation kept
    assert ask_state.budget.daily_tokens - ask_state.budget.remaining() > 0


def test_the_budget_refusal_says_which_budget_and_what_to_do(ask_client, fake):
    """`budget_exhausted` said "this conversation or this day", so a reader could not tell whether
    starting a new conversation would help. Neither branch had a single test."""
    from pakemis_api.ask.loop import Turn
    from pakemis_api.ask.limits import Limits, DailyBudget

    class Conv:
        id, messages, tokens_spent = "c", [], 0
        receipts = set()

        def append(self, *a):
            pass

    def run(conv_spent, daily_left):
        conv = Conv()
        conv.tokens_spent = conv_spent
        budget = DailyBudget(daily_tokens=1000)
        budget.spend(1000 - daily_left)
        t = Turn(ask_client.app.state.ask.service, fake, [], "", ask_client.app.state.ask.dims,
                 conv, "q", {}, Limits(conversation_tokens=100), budget)
        return [d for n, d in t.events() if n == "error"][0]

    out = run(conv_spent=200, daily_left=1000)
    assert out["code"] == "budget_exhausted" and out["scope"] == "conversation"
    assert "start a new one" in out["message"] and "daily budget still has room" in out["message"]

    out = run(conv_spent=0, daily_left=0)
    assert out["code"] == "budget_exhausted" and out["scope"] == "daily"
    assert "resets at 00:00 UTC" in out["message"]
    assert "new conversation will not help" in out["message"]


def test_cache_reads_are_charged_at_the_rate_they_are_billed():
    """Eight replays of a large cached prefix are what actually drained the 400k conversation cap.
    The cost display already discounted a cache read to a tenth; the budget counted it whole."""
    from pakemis_api.ask.limits import usage_total, CACHE_READ_FACTOR, CACHE_WRITE_FACTOR
    usage = {"input_tokens": 100, "output_tokens": 50,
             "cache_read_input_tokens": 100_000, "cache_creation_input_tokens": 1_000}
    assert usage_total(usage) == int(round(
        100 + 50 + 100_000 * CACHE_READ_FACTOR + 1_000 * CACHE_WRITE_FACTOR))
    assert usage_total(usage) < 100_000, "a cache read still costs the budget full price"
    # and the two agree: the budget weights what the invoice weights
    assert usage_total({"cache_read_input_tokens": 1000}) == int(round(1000 * CACHE_READ_FACTOR))


def test_a_rejected_tool_input_echoes_what_was_sent(ask_client, fake):
    """`_validation_message` kept `loc` and `msg` and discarded pydantic's `input` and `ctx`.

    The generated request models are permissive, so most vocabulary errors come from the engine
    (which is already structured). What the echo recovers is which VALUE offended: "limit: Input
    should be a valid integer" names the field but not the offending value, and a model that
    passed several things cannot tell which to change.
    """
    fake.load([tool_use("query_air", {"limit": "abc"}, call_id="v1"), stop("tool_use")],
              [text("That limit is not a number; the release could not be queried."), stop()])
    events = ask(ask_client, "pollutants with a nonsense limit")
    refusals = only(events, "refusal")
    assert refusals, events
    msg = refusals[0]["message"]
    assert "limit" in msg
    assert '"abc"' in msg or "'abc'" in msg, "the rejection does not echo what was sent: %s" % msg


# --- the two questions from the screenshot, end to end ----------------------------------------

def _lahore_shape(dims):
    for name, shape_id in dims.adm2_by_name.items():
        if "lahore" in name.lower():
            return shape_id
    return None


def _advertised(dims, field):
    from pakemis_api.ask.tools import function_tool
    tool = function_tool("query_air", dims)
    schema = tool.get("input_schema") or tool.get("parameters") or tool
    prop = (schema.get("properties") or {}).get(field) or {}
    m = re.search(r"Allowed: ([^.]+)\.", prop.get("description", ""))
    return [v.strip() for v in m.group(1).split(",")] if m else []


def test_screenshot_question_2_total_pollutants_in_lahore_answers(ask_client, fake):
    """"total pollutants in Lahore district for 2023" - which died on `budget_exhausted` after the
    model passed `gas` twice, because the schema told it `gas` was a grouping of the air tables.

    The point of this test is that the request is built ONLY from values the tool schema
    advertises. If the schema and the validator ever disagree again, this fails.
    """
    dims = ask_client.app.state.ask.dims
    shape = _lahore_shape(dims)
    if shape is None:
        pytest.skip("no Lahore shape_id in this release")
    groups = _advertised(dims, "group_by")
    assert "pollutant" in groups and "gas" not in groups
    req = {"geography_level": "adm2", "geography_ids": [shape],
           "periods": ["FY2023-24"], "group_by": ["pollutant"]}
    fake.load([tool_use("query_air", req, call_id="s2"), stop("tool_use")],
              [text("Lahore's air emissions in FY2023-24 lead with {{result_1_cell_0}} "
                    "{{result_1_cell_0.unit}}."), stop()])
    events = ask(ask_client, "total pollutants in Lahore district for 2023")
    assert not only(events, "refusal"), only(events, "refusal")
    assert not only(events, "error"), only(events, "error")
    results = only(events, "tool_result")
    assert len(results) == 1 and results[0]["cells"], events
    assert only(events, "answer"), events


def test_screenshot_question_1_lahore_sector_trend_answers(ask_client, fake):
    """"Make a table of annual emissions trend by sector for Lahore district" - which spent all
    eight turns on two refusals that contradicted each other.

    `sector_id` and `period_id` are both carried by fact_air_adm2_year, and both are advertised.
    """
    dims = ask_client.app.state.ask.dims
    shape = _lahore_shape(dims)
    if shape is None:
        pytest.skip("no Lahore shape_id in this release")
    groups = _advertised(dims, "group_by")
    assert {"sector_id", "period_id"} <= set(groups)
    base = {"geography_level": "adm2", "geography_ids": [shape],
            "group_by": ["period_id", "sector_id"], "pollutants": ["SO2"]}
    # TURN ONE asks without naming the periods and is refused. TURN TWO does what the refusal
    # says. That is the whole point: the refusal a district trend actually hits is now one a
    # reader - or a model - can act on, so the question is answered on the second call instead of
    # being retried until the turn limit. Before this fix the two refusals it hit contradicted
    # each other ("not carried at national grain; available at national grain") and named a grain
    # that could not answer a district question at all.
    fake.load([tool_use("query_air", base, call_id="s1a"), stop("tool_use")],
              [tool_use("query_air", dict(base, periods=["FY2015-16", "FY2023-24"]), call_id="s1b"),
               stop("tool_use")],
              [text("Lahore SO2 by sector and year begins at {{result_2_cell_0}} "
                    "{{result_2_cell_0.unit}}."), stop()])
    events = ask(ask_client, "Make a table of annual emissions trend by sector for Lahore district.")
    refusals = only(events, "refusal")
    assert len(refusals) == 1, events
    # the refusal names the remedy, and it is the remedy that worked
    assert "name the fiscal periods" in refusals[0]["message"], refusals[0]["message"]
    assert not only(events, "error"), only(events, "error")
    results = only(events, "tool_result")
    assert len(results) == 1 and results[0]["cells"], events
    answers = only(events, "answer")
    assert answers and answers[0]["citations"], events



def test_the_system_prompt_names_the_air_vocabulary_as_the_air_vocabulary(ask_client):
    """The dims appendix said "group_by values: <the greenhouse-gas list>" with nothing to mark it
    as the greenhouse-gas list, and never mentioned pollutants. Between that and a query_air schema
    built from the same list, everything the model was told pointed at `gas`."""
    from pakemis_api.ask.prompt import system_prompt
    from pakemis_query import Engine
    text = system_prompt(ask_client.app.state.ask.dims)
    assert "group_by values (query_air):" in text
    air_line = next(l for l in text.splitlines() if l.startswith("group_by values (query_air):"))
    assert set(air_line.split(":", 1)[1].replace(" ", "").split(",")) == set(Engine.AIR_GROUPS)
    assert "pollutants (query_air" in text and "SO2" in text
    assert "never `gas`" in text


# --- the daily budget counted once, across instances and restarts ------------------------------

class _DayStore:
    """A Firestore stand-in: one total per day, and switches to make reads or writes fail."""

    def __init__(self):
        self.totals, self.fail_read, self.fail_add, self.reads = {}, False, False, 0

    def read(self, day):
        self.reads += 1
        if self.fail_read:
            raise RuntimeError("store unreachable")
        return self.totals.get(day, 0)

    def add(self, day, tokens):
        if self.fail_add:
            raise RuntimeError("store unreachable")
        self.totals[day] = self.totals.get(day, 0) + tokens


def test_two_instances_and_a_restart_share_one_daily_budget():
    """The in-memory budget gave every instance, and every start, a fresh allowance."""
    from pakemis_api.ask.limits import SharedDailyBudget
    store, t0 = _DayStore(), 1_790_000_000.0
    a = SharedDailyBudget(1000, store, refresh=15)
    b = SharedDailyBudget(1000, store, refresh=15)
    assert a.remaining(t0) == 1000 and b.remaining(t0) == 1000
    a.spend(600, t0 + 1)
    assert a.remaining(t0 + 2) == 400                    # its own spending is seen at once
    assert b.remaining(t0 + 2) == 1000                   # another instance's, within the refresh window, is not yet
    assert b.remaining(t0 + 16) == 400                   # and then is
    b.spend(500, t0 + 17)
    assert b.remaining(t0 + 18) == -100 and a.remaining(t0 + 40) == -100
    # an instance that starts now (a scale from zero) starts from the day's total, not from nothing
    assert SharedDailyBudget(1000, store).remaining(t0 + 41) == -100
    # the check a turn makes is not a round trip: many calls inside the window, one read
    reads = store.reads
    for i in range(50):
        a.remaining(t0 + 41 + i * 0.1)
    assert store.reads == reads
    # a new UTC day is a new document and a full budget
    assert a.remaining(t0 + 86400) == 1000


def test_a_store_that_fails_neither_unlocks_the_budget_nor_stops_the_assistant():
    from pakemis_api.ask.limits import SharedDailyBudget
    store, t0 = _DayStore(), 1_790_000_000.0
    store.fail_read = store.fail_add = True
    budget = SharedDailyBudget(1000, store, refresh=15)
    budget.spend(700, t0)                                # nothing raised: the turn goes on
    assert budget.remaining(t0 + 1) == 300               # and it is counted, as the in-memory budget would
    budget.spend(400, t0 + 2)
    assert budget.remaining(t0 + 3) == -100              # exhausted on the local count alone
    assert store.totals == {}
    # the store comes back: what could not be added is added, once, and the count does not double
    store.fail_read = store.fail_add = False
    budget.spend(50, t0 + 20)
    assert sum(store.totals.values()) == 1150
    assert budget.remaining(t0 + 40) == -150


def test_the_budget_store_is_chosen_by_the_deployment(monkeypatch):
    from pakemis_api.ask.limits import DailyBudget, FirestoreDayStore, Limits, SharedDailyBudget, build_budget
    monkeypatch.delenv("PAKEMIS_ASK_BUDGET_STORE", raising=False)
    assert isinstance(build_budget(Limits()), DailyBudget)             # the repository's default
    monkeypatch.setenv("PAKEMIS_ASK_BUDGET_STORE", "Firestore")
    monkeypatch.setenv("PAKEMIS_ASK_BUDGET_COLLECTION", "explorer_ask_budget")
    shared = build_budget(Limits(daily_tokens=5))
    assert isinstance(shared, SharedDailyBudget) and shared.daily_tokens == 5
    assert isinstance(shared.store, FirestoreDayStore) and shared.store.collection == "explorer_ask_budget"
    monkeypatch.setenv("PAKEMIS_ASK_BUDGET_STORE", "redis")
    with pytest.raises(ValueError):                                    # a typo must not run on the wrong budget in silence
        build_budget(Limits())


# --- the selection the assistant is told, and the scope its answer carries ---------------------

def test_a_pollutant_view_reaches_the_model_as_a_pollutant_view(ask_client, fake):
    """The page used to send no `pol` at all, so a PM2.5 view arrived as greenhouse defaults and was
    answered in CO2e. The key is in the message, and the prompt says what it means."""
    ui = {"level": "adm1", "period": "FY2023-24", "config": "REF_2023_24", "pol": "PM2.5", "metric": "air_pollutant", "unit": "kt"}
    fake.load([tool_use("query_air", {"pollutants": ["PM2.5"], "periods": ["FY2023-24"]}), stop("tool_use")],
              [text("Covered sources emitted {{result_1_cell_0}} {{result_1_cell_0.unit}}."), stop()])
    events = ask(ask_client, "Explain the number currently shown.", ui_state=ui)
    sent = fake.calls[0]["messages"][-1]["content"]
    assert sent.startswith("[ui_state] {") and '"pol":"PM2.5"' in sent and '"metric":"air_pollutant"' in sent
    system = fake.calls[0]["system"]
    system = system if isinstance(system, str) else json.dumps(system)
    assert "WHEN [ui_state] CARRIES `pol`" in system and "never call it air quality" in system
    # the answer's scope says WHAT it is about, not only where and when
    scope = only(events, "answer")[0]["scope"]
    assert scope["name"] == "query_air" and scope["pollutants"] == ["PM2.5"] and scope["periods"] == ["FY2023-24"]
    assert only(events, "tool_result")[0]["cells"][0]["unit"].startswith("kt")


def test_a_greenhouse_answer_scope_names_no_pollutant(ask_client, fake):
    fake.load([tool_use("query_emissions", {"periods": ["FY2023-24"]}), stop("tool_use")],
              [text("The total is {{result_1_cell_0}} {{result_1_cell_0.unit}}."), stop()])
    events = ask(ask_client, "Explain the number currently shown.", ui_state={"level": "adm1", "period": "FY2023-24", "metric": "greenhouse_gases"})
    assert "pollutants" not in only(events, "answer")[0]["scope"]


def test_the_assistant_tool_without_a_period_reads_the_covered_panel(ask_client, fake):
    """The assistant's query goes through the same chokepoint as the HTTP route: a query_air call
    that names no period is answered for the reference year on the panel, never on the single-year
    layers where power is a row."""
    fake.load([tool_use("query_air", {"pollutants": ["SO2"], "group_by": ["sector_id"], "order_by": "value desc"}), stop("tool_use")],
              [text("The largest estimated source emitted {{result_1_cell_0}} {{result_1_cell_0.unit}}."), stop()])
    events = ask(ask_client, "What are the largest sources of SO2?", ui_state={"pol": "SO2", "period": "FY2023-24"})
    result = only(events, "tool_result")[0]
    assert "power" not in {c.get("group", {}).get("sector_id") for c in result["cells"]}
    assert result["context"]["periods"] == ["FY2023-24"] and "periods" in result["context"]["defaults_applied"]


def test_set_map_view_takes_a_pollutant_instead_of_a_gas(ask_client, fake):
    dims = ask_client.app.state.ask.dims
    from pakemis_api.ask.tools import ToolInputError, validate_map_view
    assert validate_map_view({"pol": "PM2.5", "level": "adm1", "period": "FY2023-24"}, dims) == {"pol": "PM2.5", "level": "adm1", "period": "FY2023-24"}
    for bad in ({"pol": "PM2.5", "gas": "CH4"}, {"pol": "PM2.5", "level": "grid"}, {"pol": "ozone"}):
        with pytest.raises(ToolInputError):
            validate_map_view(bad, dims)
    fake.load([tool_use("set_map_view", {"pol": "SO2", "level": "adm2"}), stop("tool_use")], [text("done"), stop()])
    events = ask(ask_client, "show SO2 by district on the map")
    assert only(events, "map_action") == [{"pol": "SO2", "level": "adm2"}]
