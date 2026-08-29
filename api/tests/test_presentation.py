"""Presentation rounding (pakemis_api.presentation): the rule on representative exacts, every
golden envelope decorated with display_short and unit_words on every cell while display, exact,
receipt and result_sha256 stand, /release declaring the rule, and the Ask loop's `.short`
placeholder rendering it (with the bare-number gate intact)."""
import json
import re

import pytest
from fastapi.testclient import TestClient

from pakemis_api.ask.render import BareNumberError, render_multi
from pakemis_api.presentation import PRESENTATION_ROUNDING, decorate, is_count, short_display, unit_short, unit_words
from test_ask import FakeModel, ask, only, stop, text, tool_use
from test_goldens import GOLDENS, post_golden

MT = "Mt CO2e AR5"


# --- the rule ----------------------------------------------------------------------------------

@pytest.mark.parametrize("exact,expected", [
    ("452.34662", "452.35"),
    ("63.370", "63.37"),
    ("9.010", "9.01"),
    ("0.394", "0.39"),
    ("0.30", "0.30"),             # trailing zero kept
    ("0.35006860", "0.35"),
    ("248.7468", "248.75"),
    ("228.7168", "228.72"),
    ("1.9972", "2.00"),
    ("1.234e-05", "<0.01"),       # non-zero below the precision, never 0.00 and never an exponent
    ("0.004", "<0.01"),
    ("-0.004", ">-0.01"),         # its negative twin: -0.00 is never printed
    ("0.005", "<0.01"),           # half to even: 0.005 -> 0.00 -> below precision
    ("0.015", "0.02"),
    ("0", "0.00"),
    ("0E-7", "0.00"),
    ("0.0000", "0.00"),
    ("-5.13", "-5.13"),           # a signed difference keeps its sign
    ("-5.125", "-5.12"),
    ("-5.135", "-5.14"),
    ("99.996", "100.00"),
])
def test_two_decimals_every_numeric_unit(exact, expected):
    for unit in ("Mt CO2e AR5", "Gg", "t CO2", "percent", "pct", "%", "share", "ratio", "", "kg"):
        assert short_display(exact, unit) == expected, unit


def test_half_even():
    assert short_display("2.345", "Mt") == "2.34"
    assert short_display("2.355", "Mt") == "2.36"
    assert short_display("0.125", "percent") == "0.12"
    assert short_display("0.135", "percent") == "0.14"    # binary-free: Decimal half-even on the string


def test_counts_and_non_numeric_unchanged():
    assert short_display("12", "rows", display="12") == "12"
    assert short_display("1234.5", "count", display="1234.5") == "1234.5"
    assert short_display("", "notation_key", display="NE") == "NE"
    assert short_display("", "evidence", display="E2 / TE3 / S1") == "E2 / TE3 / S1"
    assert short_display("abc", "Mt", display="abc") == "abc"                # unparsable: the display itself
    assert short_display("", "Mt") == ""
    assert [is_count(u) for u in ("rows", "count", "Mt CO2e AR5", "", "percent")] == [True, True, False, False, False]


def test_bounded_cells():
    assert short_display("12.2565", "Mt CO2e AR5", "12.2769", "[12.2565, 12.2769]") == "[12.26, 12.28]"
    assert short_display("12.2565", "Mt CO2e AR5", "13.9") == "[12.26, 13.90]"
    # ends that round equal print the single value: no bracket
    assert short_display("12.251", "Mt CO2e AR5", "12.254", "[12.2510, 12.2540]") == "12.25"
    assert short_display("0.0000", "Mt CO2e AR5", "0.0000", "[0.0000, 0.0000]") == "0.00"
    assert short_display("0.001", "Mt CO2e AR5", "0.002") == "<0.01"
    assert short_display("0.001", "Mt CO2e AR5", "0.02") == "[<0.01, 0.02]"


def test_unit_words_matches_the_web():
    """The unit as words carries no GWP basis token: the basis is named once, by labels.gwp."""
    assert unit_words("Mt CO2e AR5") == "million tonnes CO₂e"
    assert unit_words("Gg") == "thousand tonnes"
    assert unit_words("Gg CO2e AR6") == "thousand tonnes CO₂e"
    assert unit_words("kt") == "thousand tonnes"
    assert unit_words("t CH4") == "tonnes CH₄"
    for words in (unit_words("Mt CO2e AR5"), unit_words("Gg CO2e AR6")):
        assert "AR" not in words and "(" not in words
    for passthrough in ("percent", "", "notation_key", "evidence", "method"):
        assert unit_words(passthrough) == passthrough


def test_unit_short_is_the_unit_a_reader_sees():
    """unit_short keeps the magnitude symbol, subscripts the species and drops the basis token."""
    assert unit_short("Mt CO2e AR5") == "Mt CO₂e"
    assert unit_short("Mt CO2e AR6") == "Mt CO₂e"
    assert unit_short("Gg CO2e AR5") == "Gg CO₂e"
    assert unit_short("Gg") == "Gg"
    assert unit_short("t CH4") == "t CH₄"
    for passthrough in ("rows", "count", "", "percent", "kg CO2e"):
        assert unit_short(passthrough) == passthrough
    assert unit_short(None) is None


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
    assert v[0]["display_short"] == "452.35" and v[0]["unit_words"] == "million tonnes CO₂e" and v[0]["unit_short"] == "Mt CO₂e"
    assert v[0]["display"] == "452.34662" and v[0]["exact"] == "452.34662"
    assert v[1]["display_short"] == "-3.12" and v[1]["left"]["display_short"] == "10.50" and v[1]["right"]["display_short"] == "10.17"
    assert v[1]["left"]["unit_words"] == "million tonnes CO₂e" and v[1]["left"]["unit_short"] == "Mt CO₂e"
    assert v[2]["quantiles_short"] == {"P2.5": "420.12", "P97.5": "470.99"} and v[2]["quantiles"] == {"P2.5": "420.1234", "P97.5": "470.9876"}
    assert v[3]["display_short"] == "[12.26, 12.28]" and v[3]["display"] == "[12.2565, 12.2769]"
    assert out["receipt"] == "abc" and out["result_sha256"] == "d"
    assert decorate(env) is env                                        # in place by default


# --- through the API ---------------------------------------------------------------------------

def _check_cell(cell):
    assert "display_short" in cell and "unit_words" in cell and "unit_short" in cell, cell
    assert cell["display_short"] == short_display(cell.get("exact"), cell.get("unit"), cell.get("exact_high"), cell.get("display"))
    assert cell["unit_words"] == unit_words(cell.get("unit"))
    assert cell["unit_short"] == unit_short(cell.get("unit"))
    if cell.get("exact") not in ("", None) and not is_count(cell.get("unit")):
        num = r"(-?\d+\.\d\d|<0\.01|>-0\.01)"
        assert re.match(r"^%s$|^\[%s, %s\]$" % (num, num, num), cell["display_short"]), cell["display_short"]
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
    assert p["id"] == "PRESENTATION_ROUNDING" and p["field"] == "display_short" and p["mode"] == "ROUND_HALF_EVEN" and p["decimals"] == 2
    assert "two decimal places" in p["sentence"] and "<0.01" in p["sentence"]


def test_national_total_short_is_two_decimals(client):
    env = client.post("/api/v1/emissions/query/emissions", json={"periods": ["FY2023-24"]}).json()
    cell = env["values"][0]
    assert re.match(r"^\d+\.\d\d$", cell["display_short"]) and cell["display_short"] == "452.35"
    assert cell["unit_words"] == "million tonnes CO₂e" and cell["unit_short"] == "Mt CO₂e"


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
