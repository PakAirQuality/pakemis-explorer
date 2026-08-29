"""Presentation rounding (pakemis_api.presentation): the rule on representative exacts, every
golden envelope decorated with display_short and unit_words on every cell while display, exact,
receipt and result_sha256 stand, /release declaring the rule, and the Ask loop's `.short`
placeholder rendering it (with the bare-number gate intact)."""
import json
import re

import pytest
from fastapi.testclient import TestClient

from pakemis_api.ask.render import BareNumberError, render_multi
from pakemis_api.presentation import PRESENTATION_ROUNDING, decorate, short_display, unit_kind, unit_words
from test_ask import FakeModel, ask, only, stop, text, tool_use
from test_goldens import GOLDENS, post_golden

MT = "Mt CO2e AR5"


# --- the rule ----------------------------------------------------------------------------------

@pytest.mark.parametrize("exact,expected", [
    ("452.34662", "452.3"),       # >= 100: 1 decimal
    ("63.370", "63.4"),           # 10..100: 1 decimal
    ("228.7168", "228.7"),
    ("9.010", "9.01"),            # 1..10: 2 decimals, trailing zero kept
    ("1.9972", "2.00"),
    ("0.394", "0.394"),           # < 1: three significant figures
    ("0.35006860", "0.350"),
    ("0.00602831", "0.00603"),
    ("0.0589", "0.0589"),
    ("0.000602", "0.000602"),
    ("1.234e-05", "0.0000123"),   # plain notation, never an exponent
    ("0", "0"),
    ("0E-7", "0"),
    ("0.0000", "0"),
    ("-3.4567", "-3.46"),         # a signed difference keeps its sign
    ("-0.0004", "-0.000400"),
    ("0.9996", "1.00"),           # rounding that crosses a band lands in the band's precision
    ("9.996", "10.0"),
    ("99.96", "100.0"),
])
def test_mass_rule(exact, expected):
    assert short_display(exact, MT) == expected
    assert short_display(exact, "Gg") == expected
    assert short_display(exact, "t CO2") == expected


def test_half_even():
    assert short_display("0.125", "percent") == "0.1"
    assert short_display("0.135", "percent") == "0.1"    # binary-free: Decimal half-even on the string
    assert short_display("0.145", "percent") == "0.1"
    assert short_display("0.155", "percent") == "0.2"
    assert short_display("2.345", MT) == "2.34"
    assert short_display("2.355", MT) == "2.36"


def test_percent_share_count_other():
    assert short_display("13.79", "percent") == "13.8"
    assert short_display("-12.3456", "percent") == "-12.3"
    assert short_display("0", "percent") == "0.0"
    assert short_display("100.04", "pct") == "100.0"
    assert short_display("5.45", "%") == "5.4" and short_display("5.55", "%") == "5.6"
    assert short_display("0.123456", "share") == "0.123"
    assert short_display("0.5", "") == "0.500"
    assert short_display("12.3456", "ratio") == "12.3"
    assert short_display("0", "share") == "0"
    assert short_display("12", "rows", display="12") == "12"
    assert short_display("1234.5", "count", display="1234.5") == "1234.5"
    assert short_display("", "notation_key", display="NE") == "NE"
    assert short_display("", "evidence", display="E2 / TE3 / S1") == "E2 / TE3 / S1"
    assert short_display("1.23456", "kg", display="1.23") == "1.23"        # another unit: the display itself
    assert short_display("abc", MT, display="abc") == "abc"                # unparsable: the display itself
    assert [unit_kind(u) for u in (MT, "Gg", "percent", "", "share", "rows", "notation_key")] == \
        ["mass", "mass", "percent", "share", "share", "count", "other"]


def test_bounded_cells():
    # the spec's interval: both ends round to 12.3, widened to two decimals until they differ
    assert short_display("12.2565", MT, "12.2769", "[12.2565, 12.2769]") == "[12.26, 12.28]"
    # ends that differ under the rule need no widening
    assert short_display("12.2565", MT, "13.9", "[12.2565, 13.9000]") == "[12.3, 13.9]"
    # each end under the rule of its own band
    assert short_display("0.9", MT, "1.2", "[0.9000, 1.2000]") == "[0.900, 1.20]"
    # ends that coincide at the contract's own precision: the single value, approximately
    assert short_display("12.25651", MT, "12.25652", "[12.2565, 12.2565]") == "≈12.2565"
    # two exactly equal ends are one value, exactly: no bracket, no prefix ([0.0000, 0.0000] -> 0)
    assert short_display("0.0000", MT, "0.0000", "[0.0000, 0.0000]") == "0"
    assert short_display("4.5", MT, "4.5", "[4.5000, 4.5000]") == "4.50"
    # without a contract display the exacts' own precision is the widening limit
    assert short_display("12.2565", MT, "12.2769") == "[12.26, 12.28]"
    assert short_display("12.25651", MT, "12.25652") == "[12.25651, 12.25652]"
    assert short_display("12.256512", MT, "12.256513", "[12.2565, 12.2565]") == "≈12.2565"


def test_unit_words_matches_the_web():
    assert unit_words("Mt CO2e AR5") == "million tonnes CO₂e (AR5)"
    assert unit_words("Gg") == "thousand tonnes"
    assert unit_words("Gg CO2e AR6") == "thousand tonnes CO₂e (AR6)"
    assert unit_words("kt") == "thousand tonnes"
    assert unit_words("t CH4") == "tonnes CH₄"
    for passthrough in ("percent", "", "notation_key", "evidence", "method"):
        assert unit_words(passthrough) == passthrough


def test_decorate_reaches_nested_cells_and_quantiles():
    env = {"receipt": "abc", "result_sha256": "d", "values": [
        {"exact": "452.34662", "display": "452.34662", "value": 452.34662, "unit": MT},
        {"exact": "-3.123456", "display": "-3.1", "unit": "percent", "left": {"exact": "10.5", "display": "10.500", "unit": MT},
         "right": {"exact": "10.172", "display": "10.172", "unit": MT}},
        {"exact": "446.5", "display": "446.500", "unit": MT, "quantiles": {"P2.5": "420.1234", "P97.5": "470.9876"}},
        {"exact": "12.2565", "exact_high": "12.2769", "display": "[12.2565, 12.2769]", "unit": MT},
    ]}
    before = json.dumps(env, sort_keys=True)
    out = decorate(env, in_place=False)
    assert json.dumps(env, sort_keys=True) == before                  # a copy on request
    v = out["values"]
    assert v[0]["display_short"] == "452.3" and v[0]["unit_words"] == "million tonnes CO₂e (AR5)"
    assert v[0]["display"] == "452.34662" and v[0]["exact"] == "452.34662"
    assert v[1]["display_short"] == "-3.1" and v[1]["left"]["display_short"] == "10.5" and v[1]["right"]["display_short"] == "10.2"
    assert v[1]["left"]["unit_words"] == "million tonnes CO₂e (AR5)"
    assert v[2]["quantiles_short"] == {"P2.5": "420.1", "P97.5": "471.0"} and v[2]["quantiles"] == {"P2.5": "420.1234", "P97.5": "470.9876"}
    assert v[3]["display_short"] == "[12.26, 12.28]" and v[3]["display"] == "[12.2565, 12.2769]"
    assert out["receipt"] == "abc" and out["result_sha256"] == "d"
    assert decorate(env) is env                                        # in place by default


# --- through the API ---------------------------------------------------------------------------

def _check_cell(cell):
    assert "display_short" in cell and "unit_words" in cell, cell
    assert cell["display_short"] == short_display(cell.get("exact"), cell.get("unit"), cell.get("exact_high"), cell.get("display"))
    assert cell["unit_words"] == unit_words(cell.get("unit"))
    if cell.get("exact") not in ("", None) and unit_kind(cell.get("unit")) in ("mass", "percent", "share"):
        assert re.match(r"^(≈)?-?\d+(\.\d+)?$|^\[-?\d+(\.\d+)?, -?\d+(\.\d+)?\]$", cell["display_short"]), cell["display_short"]
    for side in ("left", "right"):
        if isinstance(cell.get(side), dict):
            _check_cell(cell[side])
    if isinstance(cell.get("quantiles"), dict):
        assert set(cell["quantiles_short"]) == set(cell["quantiles"])


@pytest.mark.parametrize("name,golden", GOLDENS, ids=[g[0] for g in GOLDENS])
def test_golden_envelopes_are_decorated(client, name, golden):
    r = post_golden(client, golden)
    if golden.get("expect_error"):
        assert r.status_code == 422
        return
    assert r.status_code == 200, r.text
    env = r.json()
    for cell in env["values"]:
        _check_cell(cell)
    for i, exp in enumerate(golden["expect"]):
        got = env["values"][exp.get("cell", i)]
        if "display" in exp:
            assert got["display"] == exp["display"]                    # the contract display stands
    if golden.get("expect_receipt"):
        assert env["receipt"] == golden["expect_receipt"]               # the receipt was minted before the decoration
    # the replay is decorated too and reproduces the receipt; the CSV is the core's, without presentation columns
    again = client.get("/api/v1/emissions/receipt/%s" % env["receipt"]).json()
    assert again["receipt"] == env["receipt"] and again["result_sha256"] == env["result_sha256"]
    assert all("display_short" in c for c in again["values"])
    csv = client.get("/api/v1/emissions/download/%s.csv" % env["receipt"])
    assert csv.status_code == 200 and "display_short" not in csv.text.splitlines()[0]


def test_release_declares_the_presentation_rule(client):
    rounding = client.get("/api/v1/emissions/release").json()["rounding"]
    assert "rule" in rounding and "co2e_Mt" in rounding                 # the contract's block is intact
    p = rounding["presentation"]
    assert p == PRESENTATION_ROUNDING
    assert p["id"] == "PRESENTATION_ROUNDING" and p["field"] == "display_short" and p["mode"] == "ROUND_HALF_EVEN"
    assert "one decimal" in p["sentence"] and "three significant figures" in p["sentence"]


def test_national_total_short_is_one_decimal(client):
    env = client.post("/api/v1/emissions/query/emissions", json={"periods": ["FY2023-24"]}).json()
    cell = env["values"][0]
    assert re.match(r"^\d+\.\d$", cell["display_short"]) and cell["display"].startswith(cell["display_short"][:-1])
    assert cell["unit_words"] == "million tonnes CO₂e (AR5)"


# --- the Ask loop ------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def fake():
    return FakeModel()


@pytest.fixture(scope="module")
def ask_client(settings, fake):
    from pakemis_api.app import create_app
    with TestClient(create_app(settings, model_client=fake)) as c:
        yield c


def test_short_placeholder_renders_display_short(ask_client, fake):
    fake.load([tool_use("query_emissions", {"periods": ["FY2023-24"]}), stop("tool_use")],
              [text("Pakistan emitted {{result_1_cell_0.short}} {{result_1_cell_0.unit}} in FY2023-24 "
                    "(full precision {{result_1_cell_0}}); receipt {{result_1_cell_0.exact}}."), stop()])
    events = ask(ask_client, "national total?")
    answer = only(events, "answer")[0]
    result = only(events, "tool_result")[0]
    env = ask_client.get("/api/v1/emissions/receipt/%s" % result["receipt"]).json()
    cell = env["values"][0]
    # the SSE cell and the compact result the model saw carry display_short beside display
    assert result["cells"][0]["display_short"] == cell["display_short"] and result["cells"][0]["display"] == cell["display"]
    body = json.loads(fake.calls[1]["messages"][-1]["content"][0]["content"])
    assert body["cells"][0]["display_short"] == cell["display_short"]
    # .short renders display_short, the bare placeholder still renders display
    cites = [(c["attr"], c["text"]) for c in answer["citations"]]
    assert cites[0] == ("short", cell["display_short"]) and cites[2] == ("display", cell["display"])
    assert '<cite k="1" cell="0" receipt="%s">%s</cite>' % (env["receipt"], cell["display_short"]) in answer["text"]
    assert cell["display_short"] != cell["display"]                    # the short form is shorter here


def test_short_keeps_the_bare_number_gate():
    env = {"receipt": "abc", "values": [{"display": "1.50", "display_short": "1.50", "exact": "1.500", "unit": "Mt"}]}
    rendered, cites = render_multi("{{result_1_cell_0.short}} {{result_1_cell_0.unit}}", [env])
    assert rendered.startswith('<cite k="1" cell="0" receipt="abc">1.50</cite> <cite') and rendered.endswith(">Mt</cite>")
    assert cites[0]["attr"] == "short" and cites[0]["text"] == "1.50"
    with pytest.raises(BareNumberError):
        render_multi("about 1.5 Mt ({{result_1_cell_0.short}})", [env])
    with pytest.raises(Exception, match="has 1 cells"):
        render_multi("{{result_1_cell_3.short}}", [env])
    # an envelope without the decoration (a test double) falls back to display
    bare = {"receipt": "abc", "values": [{"display": "1.50", "exact": "1.500", "unit": "Mt"}]}
    assert "1.50" in render_multi("{{result_1_cell_0.short}}", [bare])[0]


def test_prompt_prefers_short(ask_client):
    from pakemis_api.ask import prompt as PROMPT
    assert "{{result_k_cell_n.short}}" in PROMPT.CONTRACT and "full precision" in PROMPT.CONTRACT
    assert "{{result_k_cell_n.short}}" in PROMPT.correction_message("x") and "{{result_k_cell_n.short}}" in PROMPT.empty_answer_message()
