"""Presentation rounding (pakemis_api.presentation): the rule on representative exacts, every
golden envelope decorated with display_short and unit_words on every cell while display, exact,
receipt and result_sha256 stand, /release declaring the rule, and the Ask loop's `.short`
placeholder rendering it (with the bare-number gate intact)."""
import json
import re

import pytest
from fastapi.testclient import TestClient

from pakemis_api.ask.render import BareNumberError, render_multi
from pakemis_api.presentation import (AXIS_RULE, CHANGE_RULE, DERIVED, EN_DASH, PARTITION_RULE, PHRASE_RULE,
                                      PRESENTATION_ROUNDING, SCENARIO_LABELS, SHARE_BANDS, axis_ticks, decorate,
                                      decorate_change, interval_short, is_count, ranks, scenario_label, share_phrase,
                                      share_short, short_display, signed_short, tick_short, unit_short, unit_words)
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
    # rc47 pin: rc46's re-base moved the national total (industrial solid fuels activated)
    assert re.match(r"^\d+\.\d\d$", cell["display_short"]) and cell["display_short"] == "469.64"
    assert cell["unit_words"] == "million tonnes CO₂e" and cell["unit_short"] == "Mt CO₂e"


# --- the derived fields: a partition's shares ----------------------------------------------------

def _query_env(group_by, cells, request_type="query_emissions", _type="QueryEmissions"):
    req = {"_type": _type, "group_by": list(group_by), "periods": ["FY2023-24"]}
    return {"receipt": "abc", "result_sha256": "d", "request_type": request_type,
            "request": json.dumps(req, sort_keys=True, separators=(",", ":")), "values": cells}


def _cell(exact, unit=MT, **extra):
    c = {"exact": exact, "display": exact, "unit": unit}
    c.update(extra)
    return c


@pytest.mark.parametrize("part,total,expected", [
    ("223.45447", "452.34662", "49.4"),
    ("50", "100", "50.0"),                # trailing zero kept
    ("1", "8", "12.5"),
    ("0.125", "100", "0.1"),              # 0.125 % -> half even at one decimal
    ("0.15", "100", "0.2"),
    ("0.25", "100", "0.2"),
    ("0.35", "100", "0.4"),
    ("0.04", "100", "<0.1"),              # non-zero below the precision, never 0.0
    ("0.0001", "1000", "<0.1"),
    ("-0.04", "100", ">-0.1"),
    ("0", "100", "0.0"),
    ("100", "100", "100.0"),
])
def test_share_short(part, total, expected):
    from decimal import Decimal
    assert share_short(Decimal(part), Decimal(total)) == expected


def test_decorate_adds_shares_to_a_one_key_partition():
    env = _query_env(["sector_id"], [_cell("60", group={"sector_id": "a"}), _cell("39.96", group={"sector_id": "b"}),
                                     _cell("0.04", group={"sector_id": "c"}), _cell("0", group={"sector_id": "d"})])
    before = json.dumps(env, sort_keys=True)
    out = decorate(env, in_place=False)
    assert json.dumps(env, sort_keys=True) == before
    assert [c["share_pct_short"] for c in out["values"]] == ["60.0", "40.0", "<0.1", "0.0"]
    assert out["partition"] == {"of": "the sum of these cells", "n": 4, "share_field": "share_pct_short", "rule": PARTITION_RULE}
    assert out["receipt"] == "abc" and out["result_sha256"] == "d"
    for c in out["values"]:                                            # the two-decimal field is untouched beside it
        assert c["display_short"] == short_display(c["exact"], MT)


@pytest.mark.parametrize("group_by", [[], ["sector_id", "gas"], ["sector_id", "gas", "period_id"]])
def test_no_shares_unless_exactly_one_key(group_by):
    env = decorate(_query_env(group_by, [_cell("60"), _cell("40")]))
    assert "partition" not in env and all("share_pct_short" not in c for c in env["values"])


def test_no_shares_when_the_cells_do_not_partition():
    cells = lambda: [_cell("60", group={"sector_id": "a"}), _cell("40", group={"sector_id": "b"})]
    # a compare, a timeseries, an uncertainty envelope: the request type is not query_emissions
    for rt, ty in (("compare_emissions", "CompareRequest"), ("get_timeseries", "TimeseriesRequest"), ("get_uncertainty", "UncertaintyRequest")):
        env = decorate(_query_env(["sector_id"], cells(), request_type=rt, _type=ty))
        assert "partition" not in env and all("share_pct_short" not in c for c in env["values"]), rt
    # a nested left/right cell, a bounded cell, a non-numeric exact, two units, a count unit, a zero sum, no cells
    bad = [
        cells()[:1] + [dict(cells()[1], left=_cell("1"), right=_cell("2"))],
        cells()[:1] + [dict(cells()[1], exact_high="41")],
        cells()[:1] + [_cell("", unit=MT, display="NE")],
        cells()[:1] + [_cell("40", unit="Gg")],
        [_cell("3", unit="rows"), _cell("4", unit="rows")],
        [_cell("1"), _cell("-1")],
        [],
    ]
    for values in bad:
        env = decorate(_query_env(["sector_id"], values))
        assert "partition" not in env and all("share_pct_short" not in c for c in env["values"]), values
    # a request string that is not JSON is left alone, never raised on
    env = {"request_type": "query_emissions", "request": "not json", "values": cells()}
    assert "partition" not in decorate(env)


def test_sector_breakdown_carries_shares_summing_to_100(client):
    from decimal import Decimal
    golden = dict(GOLDENS)["sector_breakdown_L.json"]
    env = post_golden(client, golden).json()
    assert env["receipt"] == golden["expect_receipt"]                   # the receipt was minted before the shares
    cells = env["values"]
    assert len(cells) > 1 and all(re.match(r"^\d+\.\d$|^<0\.1$", c["share_pct_short"]) for c in cells), cells
    assert env["partition"] == {"of": "the sum of these cells", "n": len(cells), "share_field": "share_pct_short", "rule": PARTITION_RULE}
    top = cells[0]
    # 47.6 at rc52: agriculture's share of a larger total (the +3.72 activation is IPPU's)
    assert top["group"] == {"sector_id": "agriculture"} and top["share_pct_short"] == "47.6"
    shares = [Decimal(c["share_pct_short"]) for c in cells if not c["share_pct_short"].startswith("<")]
    assert abs(sum(shares) - 100) <= Decimal("0.1") + Decimal("0.05") * len(cells), shares
    # each share is the declared arithmetic on the exacts
    total = sum(Decimal(c["exact"]) for c in cells)
    assert all(c["share_pct_short"] == share_short(Decimal(c["exact"]), total) for c in cells)
    # the replay carries the shares; the downloads (the core's products) carry none
    again = client.get("/api/v1/emissions/receipt/%s" % env["receipt"]).json()
    assert again["partition"] == env["partition"] and [c["share_pct_short"] for c in again["values"]] == [c["share_pct_short"] for c in cells]
    csv = client.get("/api/v1/emissions/download/%s.csv" % env["receipt"])
    assert csv.status_code == 200 and "share_pct_short" not in csv.text and "partition" not in csv.text
    receipt = client.get("/api/v1/emissions/download/%s.receipt.json" % env["receipt"])
    assert receipt.status_code == 200 and "share_pct_short" not in receipt.text and "partition" not in receipt.text


def test_two_key_breakdown_carries_no_shares(client):
    r = client.post("/api/v1/emissions/query/emissions", json={"periods": ["FY2023-24"], "group_by": ["sector_id", "gas"]})
    assert r.status_code == 200, r.text
    env = r.json()
    assert len(env["values"]) > 1 and all(len(c["group"]) == 2 for c in env["values"])
    assert "partition" not in env and all("share_pct_short" not in c for c in env["values"])
    r = client.post("/api/v1/emissions/query/emissions", json={"periods": ["FY2023-24"]})
    env = r.json()
    assert "partition" not in env and "share_pct_short" not in env["values"][0]          # no key: one total, no share


@pytest.mark.parametrize("name", ["compare_S_vs_L.json", "timeseries_annual_L.json", "completeness_ne_rows.json"])
def test_compare_timeseries_completeness_carry_no_shares(client, name):
    env = post_golden(client, dict(GOLDENS)[name]).json()
    assert "partition" not in env
    for c in env["values"]:
        assert "share_pct_short" not in c
        for side in ("left", "right"):
            if isinstance(c.get(side), dict):
                assert "share_pct_short" not in c[side]


@pytest.mark.parametrize("name,golden", GOLDENS, ids=[g[0] for g in GOLDENS])
def test_shares_only_on_one_key_partitions(client, name, golden):
    """Across every golden: the shares appear exactly when the request groups by one key, and no receipt moves."""
    r = post_golden(client, golden)
    if golden.get("expect_error"):
        return
    env = r.json()
    keys = list(golden["request"].get("group_by") or ())
    # the presentation's own rule: one-key groupings partition, for emissions AND air,
    # except an air year/period grouping - a series, not a partition
    one_key = (len(keys) == 1
               and golden["function"] in ("query_emissions", "query_air")
               and not (golden["function"] == "query_air" and keys in (["year"], ["period_id"])))
    assert ("partition" in env) == one_key, name
    assert all(("share_pct_short" in c) == one_key for c in env["values"]), name
    if golden.get("expect_receipt"):
        assert env["receipt"] == golden["expect_receipt"]


# --- the derived fields: an uncertainty cell's interval --------------------------------------

def test_interval_short_and_scenario_label():
    assert interval_short({"P2.5": "400.27", "P97.5": "514.28"}) == "400.27%s514.28" % EN_DASH == "400.27–514.28"
    assert interval_short({"P2.5": "400.27"}) is None and interval_short({}) is None and interval_short(None) is None
    assert scenario_label("time_correlated") == "time-correlated draws"
    assert scenario_label("time_independent") == "time-independent draws"
    assert scenario_label("parameter_typed") == "parameter-typed draws"
    assert scenario_label("cross_sector") == "factors shared across modules"
    assert scenario_label("within_sector") == "factors shared within a module"
    assert scenario_label("something_new") == "something_new"           # unknown: the raw scenario
    cell = {"exact": "446.5", "display": "446.500", "unit": MT, "quantiles": {"P2.5": "420.1234", "P97.5": "470.9876"},
            "kind": "annual_level", "key": "national", "scenario": "time_correlated"}
    out = decorate({"values": [cell]})["values"][0]
    assert out["interval_short"] == "420.12–470.99" and out["scenario_label"] == "time-correlated draws"
    assert out["quantiles"] == {"P2.5": "420.1234", "P97.5": "470.9876"}
    plain = decorate({"values": [{"exact": "1", "display": "1", "unit": MT}]})["values"][0]
    assert "interval_short" not in plain and "scenario_label" not in plain


def test_series_uncertainty_cells_carry_the_interval(client):
    r = client.post("/api/v1/emissions/query/uncertainty", json={"scope": "series", "period_id": "FY2023-24"})
    assert r.status_code == 200, r.text
    env = r.json()
    cells = env["values"]
    assert cells and all("interval_short" in c and "scenario_label" in c for c in cells)
    for c in cells:
        assert c["interval_short"] == "%s%s%s" % (c["quantiles_short"]["P2.5"], EN_DASH, c["quantiles_short"]["P97.5"])
        assert c["scenario_label"] == SCENARIO_LABELS.get(c["scenario"], c["scenario"])
        assert "central_short" not in c                                 # the P50 is the cell's exact / display_short
    levels = [c for c in cells if c["kind"] == "annual_level"]
    assert levels and {c["scenario"] for c in levels} >= {"time_correlated", "time_independent", "parameter_typed"}
    # the three scenarios bound the same total differently: the parameter-typed draws are the widest
    by_scenario = {c["scenario"]: c for c in levels}
    assert len(levels) == 3 and set(by_scenario) == {"time_correlated", "time_independent", "parameter_typed"}
    assert by_scenario["parameter_typed"]["interval_short"] == "417.19–532.17"
    assert by_scenario["time_correlated"]["interval_short"] == "423.66–524.94"
    assert by_scenario["time_independent"]["interval_short"] == "422.91–524.01"
    assert {c["scenario_label"] for c in levels} == {"time-correlated draws", "time-independent draws", "parameter-typed draws"}
    # the MC central sits just under the deterministic 469.64 at rc52 (467.9x-468.0x)
    assert all(c["key"] == "FY2023-24" and re.match(r"^46[78]\.\d\d$", c["display_short"]) for c in levels)
    assert "partition" not in env and all("share_pct_short" not in c for c in cells)
    # the receipt download is the core's envelope, without the derived strings
    receipt = client.get("/api/v1/emissions/download/%s.receipt.json" % env["receipt"])
    assert receipt.status_code == 200 and "interval_short" not in receipt.text and "scenario_label" not in receipt.text


def test_release_declares_the_derived_fields(client):
    p = client.get("/api/v1/emissions/release").json()["rounding"]["presentation"]
    d = p["derived"]
    assert d == DERIVED and set(d) == {"share_pct_short", "interval_short", "unallocated_total_short", "placed_short",
                                       "axis_ticks_short", "change_short", "share_phrase", "unallocated_short", "spatial_class"}
    assert d["share_pct_short"]["decimals"] == 1 and d["share_pct_short"]["mode"] == "ROUND_HALF_EVEN"
    assert d["share_pct_short"]["sentence"] == PARTITION_RULE and "exactly one key" in PARTITION_RULE and "<0.1" in PARTITION_RULE
    assert "applies_to" in d["share_pct_short"] and "applies_to" in d["interval_short"]
    assert d["interval_short"]["decimals"] == 2 and d["interval_short"]["derived_from"] == "quantiles_short"
    assert EN_DASH in d["interval_short"]["sentence"] and d["interval_short"]["scenario_labels"] == SCENARIO_LABELS
    # the briefing's three: an axis, a change, a phrase, each with a sentence and its companions named
    assert d["axis_ticks_short"]["sentence"] == AXIS_RULE and d["axis_ticks_short"]["steps"] == ["1", "2", "2.5", "5"]
    assert d["axis_ticks_short"]["ticks"] == {"min": 4, "max": 6, "target": 5, "finest_step": "0.01"}
    assert d["change_short"]["sentence"] == CHANGE_RULE and "endpoints" in CHANGE_RULE
    assert d["change_short"]["companion_fields"] == ["change_pct_short", "direction"] and d["change_short"]["pct_decimals"] == 1
    assert d["share_phrase"]["sentence"] == PHRASE_RULE and d["share_phrase"]["companion_fields"] == ["rank"]
    assert [(b["from"], b["phrase"]) for b in d["share_phrase"]["bands"]] == [(format(lo, "f"), ph) for lo, ph in SHARE_BANDS]
    assert [b["phrase"] for b in d["share_phrase"]["bands"]] == ["almost all", "most", "over half", "nearly half", "about a third",
                                                                 "about a quarter", "about a tenth", "a small share", "a marginal share"]


# --- the derived fields: an axis, a change, a phrase and a rank --------------------------------

@pytest.mark.parametrize("low,high,expected", [
    ("0", "452.34662", ["0", "100", "200", "300", "400", "500"]),     # the national total
    ("0", "223.45", ["0", "50", "100", "150", "200", "250"]),        # the largest sector
    ("0", "63.37", ["0", "20", "40", "60", "80"]),                    # power
    ("0", "9.01", ["0", "2.5", "5", "7.5", "10"]),                    # a 2.5 step, rendered without a trailing zero
    ("0", "0.9", ["0", "0.25", "0.5", "0.75", "1"]),                  # a small range
    ("0", "1", ["0", "0.25", "0.5", "0.75", "1"]),
    ("0", "100", ["0", "25", "50", "75", "100"]),
    ("0", "200", ["0", "50", "100", "150", "200"]),
    ("0", "0.03", ["0", "0.01", "0.02", "0.03"]),                     # the finest step is the two-decimal rule
    ("-5.13", "0", ["-6", "-4", "-2", "0"]),                          # a compare: the difference is negative
    ("-20", "35", ["-20", "0", "20", "40"]),                          # both signs, zero on the axis
])
def test_axis_ticks(low, high, expected):
    from decimal import Decimal
    ticks = axis_ticks(Decimal(low), Decimal(high))
    assert [tick_short(t) for t in ticks] == expected
    assert 4 <= len(ticks) <= 6 and ticks[0] <= min(Decimal(low), 0) and ticks[-1] >= Decimal(high)
    steps = {ticks[i + 1] - ticks[i] for i in range(len(ticks) - 1)}
    assert len(steps) == 1                                             # one even step
    assert all(re.match(r"^-?\d+(\.\d{1,2})?$", t) and not t.endswith("0") or t == "0" or not "." in t for t in expected)


def test_axis_ticks_skip_an_empty_or_sub_precision_range():
    from decimal import Decimal
    assert axis_ticks(Decimal(0), Decimal(0)) is None
    assert axis_ticks(Decimal("0"), Decimal("0.004")) is None         # no step at or above 0.01 gives four ticks
    assert tick_short(Decimal("100.00")) == "100" and tick_short(Decimal("0.250")) == "0.25" and tick_short(Decimal("0E-7")) == "0"
    assert tick_short(Decimal("-0.004")) == "0"                        # never -0


def test_decorate_adds_an_axis_when_every_cell_carries_a_number():
    env = _query_env(["sector_id"], [_cell("223.45447"), _cell("63.37"), _cell("0.3")])
    out = decorate(env)
    assert out["axis"] == {"ticks_short": ["0", "50", "100", "150", "200", "250"], "min_short": "0.30", "max_short": "223.45",
                           "unit_short": "Mt CO₂e", "note": AXIS_RULE}
    # a bounded cell's high end and an uncertainty cell's quantiles are inside the range
    env = _query_env([], [_cell("12.2565", exact_high="12.2769"), _cell("446.5", quantiles={"P2.5": "420.1", "P97.5": "530.9"})])
    assert decorate(env)["axis"]["ticks_short"] == ["0", "200", "400", "600"] and decorate(env)["axis"]["max_short"] == "530.90"
    # a compare: one negative cell
    env = _query_env([], [_cell("-5.132797", left=_cell("452.35"), right=_cell("447.21"))], request_type="compare_emissions",
                     _type="CompareRequest")
    assert decorate(env)["axis"]["ticks_short"] == ["-6", "-4", "-2", "0"] and decorate(env)["axis"]["min_short"] == "-5.13"
    # no axis: a cell without a number, a count, two units, all zeros
    for cells in ([_cell("", display="NE", unit="notation_key")], [_cell("12", unit="rows")], [_cell("1"), _cell("2", unit="Gg")],
                  [_cell("0"), _cell("0.000")], [_cell("1"), _cell("abc")]):
        assert "axis" not in decorate(_query_env([], cells)), cells
    assert "axis" not in decorate({"values": []})


@pytest.mark.parametrize("x,q,expected", [
    ("79.949848", "0.01", "+79.95"), ("-5.132797", "0.01", "-5.13"), ("0", "0.01", "0.00"), ("0.001", "0.01", "<0.01"),
    ("-0.001", "0.01", ">-0.01"), ("21.4688", "0.1", "+21.5"), ("-1.05", "0.1", "-1.0"), ("0", "0.1", "0.0"), ("0.04", "0.1", "<0.1"),
])
def test_signed_short(x, q, expected):
    from decimal import Decimal
    assert signed_short(Decimal(x), Decimal(q)) == expected


def _series_env(step, cells):
    req = {"_type": "TimeseriesRequest", "query": {}, "step": step}
    return {"receipt": "abc", "result_sha256": "d", "request_type": "get_timeseries",
            "request": json.dumps(req, sort_keys=True, separators=(",", ":")), "values": cells}


def test_decorate_change_on_an_air_period_series():
    import json as _json
    env = {"request_type": "query_air",
           "request": _json.dumps({"_type": "QueryAir", "pollutants": ["BC"], "group_by": ["period_id"]}),
           "values": [_cell("45.83", unit="kt BC", group={"period_id": "FY2015-16"}),
                      _cell("56.33", unit="kt BC", group={"period_id": "FY2023-24"})]}
    out = decorate_change(env)
    assert out["change"]["from_short"] == "45.83" and out["change"]["to_short"] == "56.33"
    assert out["change"]["change_pct_short"] == "+22.9" and out["change"]["direction"] == "rose"
    # a year-grouped air series (the 1990 trend) stays without a change block
    left = decorate_change({"request_type": "query_air",
                            "request": _json.dumps({"_type": "QueryAir", "group_by": ["year"]}),
                            "values": [_cell("1", unit="kt BC", group={"year": "1990"})]})
    assert "change" not in left


def test_decorate_change_on_an_annual_series():
    cells = [_cell("452.34662438", group={"period_id": "FY2023-24"}), _cell("372.39677601", group={"period_id": "FY2015-16"}),
             _cell("400", group={"period_id": "FY2019-20"})]
    out = decorate(_series_env("annual", cells))
    assert out["change"] == {"from_period": "FY2015-16", "to_period": "FY2023-24", "from_short": "372.40", "to_short": "452.35",
                             "change_short": "+79.95", "change_pct_short": "+21.5", "direction": "rose", "unit_short": "Mt CO₂e",
                             "note": "compares the first and last period only"}          # the endpoints by period, whatever the order
    fell = decorate_change(_series_env("annual", [_cell("10", group={"period_id": "FY2015-16"}), _cell("9", group={"period_id": "FY2016-17"})]))
    assert fell["change"]["change_short"] == "-1.00" and fell["change"]["change_pct_short"] == "-10.0" and fell["change"]["direction"] == "fell"
    flat = decorate_change(_series_env("annual", [_cell("10", group={"period_id": "FY2015-16"}), _cell("10.000", group={"period_id": "FY2016-17"})]))
    assert flat["change"]["change_short"] == "0.00" and flat["change"]["change_pct_short"] == "0.0" and flat["change"]["direction"] == "unchanged"
    zero = decorate_change(_series_env("annual", [_cell("0", group={"period_id": "FY2015-16"}), _cell("1", group={"period_id": "FY2016-17"})]))
    assert zero["change"]["change_pct_short"] is None and zero["change"]["change_short"] == "+1.00"
    # no change: a monthly step, one cell, a cell without a period or a number, two units, not a timeseries
    assert "change" not in decorate_change(_series_env("monthly", cells))
    assert "change" not in decorate_change(_series_env("annual", cells[:1]))
    assert "change" not in decorate_change(_series_env("annual", cells + [_cell("1")]))
    assert "change" not in decorate_change(_series_env("annual", cells + [_cell("x", group={"period_id": "FY2020-21"})]))
    assert "change" not in decorate_change(_series_env("annual", cells + [_cell("1", unit="Gg", group={"period_id": "FY2020-21"})]))
    assert "change" not in decorate(_query_env(["period_id"], cells))


def test_national_annual_series_carries_axis_and_change(client):
    golden = dict(GOLDENS)["timeseries_annual_L.json"]
    env = post_golden(client, golden).json()
    assert env["receipt"] == golden["expect_receipt"]                   # the receipt was minted before the decoration
    # rc47 pins: the rc46 re-base moved the whole series (the activation exists in
    # every year of the window), so both endpoints and the change moved with it.
    # rc50 pins: the clinker re-base moved the EIGHT HISTORICAL years (+3.96..+5.57 Mt of
    # 2.A.1 on the census-implied fraction) and not the reference year, so the FROM endpoint
    # rose (394.09 -> 398.05), the TO endpoint held (465.92), and the change narrowed
    # (+71.83 -> +67.87, +18.2 -> +17.0 percent); the series peak FY2021-22 rose to 493.98.
    # rc52: ammonia, steel and lubricants entered every year (+3.04..+3.80): 401.09 -> 469.64,
    # +68.55 (+17.1 percent), peak 497.77.
    assert env["change"] == {"from_period": "FY2015-16", "to_period": "FY2023-24", "from_short": "401.09", "to_short": "469.64",
                             "change_short": "+68.55", "change_pct_short": "+17.1", "direction": "rose", "unit_short": "Mt CO₂e",
                             "note": "compares the first and last period only"}
    assert env["axis"]["ticks_short"] == ["0", "100", "200", "300", "400", "500"] and env["axis"]["unit_short"] == "Mt CO₂e"
    # the axis max is the SERIES peak - FY2021-22 since the rc46 re-base, not the last year
    assert env["axis"]["max_short"] == "497.77" and env["axis"]["min_short"] == min(c["display_short"] for c in env["values"])
    # the replay carries both; the downloads carry neither
    again = client.get("/api/v1/emissions/receipt/%s" % env["receipt"]).json()
    assert again["change"] == env["change"] and again["axis"] == env["axis"] and again["result_sha256"] == env["result_sha256"]
    for ext in ("csv", "receipt.json"):
        r = client.get("/api/v1/emissions/download/%s.%s" % (env["receipt"], ext))
        assert r.status_code == 200 and "ticks_short" not in r.text and "change_short" not in r.text and "change_pct_short" not in r.text


def test_compare_carries_a_negative_axis_and_no_change(client):
    env = post_golden(client, dict(GOLDENS)["compare_S_vs_L.json"]).json()
    assert env["axis"]["ticks_short"] == ["-6", "-4", "-2", "0"] and env["axis"]["min_short"] == "-5.13" and env["axis"]["max_short"] == "-5.13"
    assert "change" not in env


@pytest.mark.parametrize("share,expected", [
    ("100", "almost all"), ("90", "almost all"), ("89.99", "most"), ("60", "most"), ("59.99", "over half"), ("55", "over half"),
    ("54.99", "nearly half"), ("49.4", "nearly half"), ("45", "nearly half"), ("44.99", "about a third"), ("30", "about a third"),
    ("29.99", "about a quarter"), ("20", "about a quarter"), ("19.99", "about a tenth"), ("10", "about a tenth"),
    ("9.99", "a small share"), ("5", "a small share"), ("4.99", "a marginal share"), ("0", "a marginal share"), ("-1", None),
])
def test_share_phrase_bands(share, expected):
    from decimal import Decimal
    assert share_phrase(Decimal(share), Decimal(100)) == expected
    assert share_phrase(Decimal(share) * 3, Decimal(300)) == expected                   # from the unrounded share


def test_ranks():
    from decimal import Decimal
    assert ranks([Decimal(3), Decimal(5), Decimal(5), Decimal(1)]) == [3, 1, 2, 4]      # equal exacts keep their order
    assert ranks([Decimal(1)]) == [1] and ranks([]) == []


def test_partition_cells_carry_phrase_and_rank():
    env = _query_env(["sector_id"], [_cell("10"), _cell("49.4"), _cell("0.6"), _cell("40")])
    cells = decorate(env)["values"]
    assert [c["share_phrase"] for c in cells] == ["about a tenth", "nearly half", "a marginal share", "about a third"]
    assert [c["rank"] for c in cells] == [3, 1, 4, 2]
    # exactly the cells that carry a share: a two-key breakdown carries neither
    env = _query_env(["sector_id", "gas"], [_cell("1"), _cell("2")])
    assert all("share_phrase" not in c and "rank" not in c for c in decorate(env)["values"])


def test_sector_breakdown_carries_phrases_and_ranks(client):
    from decimal import Decimal
    golden = dict(GOLDENS)["sector_breakdown_L.json"]
    env = post_golden(client, golden).json()
    assert env["receipt"] == golden["expect_receipt"]
    cells = env["values"]
    assert [c["rank"] for c in cells] == list(range(1, len(cells) + 1)) and len(cells) == 10   # value desc: ranks 1..10 in order
    assert cells[0]["group"] == {"sector_id": "agriculture"} and cells[0]["share_phrase"] == "nearly half"
    assert cells[1]["group"] == {"sector_id": "power"} and cells[1]["share_phrase"] == "about a tenth"
    total = sum(Decimal(c["exact"]) for c in cells)
    assert all(c["share_phrase"] == share_phrase(Decimal(c["exact"]), total) for c in cells)
    assert env["axis"]["ticks_short"] == ["0", "50", "100", "150", "200", "250"] and env["axis"]["max_short"] == "223.45"
    csv = client.get("/api/v1/emissions/download/%s.csv" % env["receipt"])
    assert csv.status_code == 200 and "share_phrase" not in csv.text and "rank" not in csv.text.splitlines()[0] and "ticks_short" not in csv.text
    receipt = client.get("/api/v1/emissions/download/%s.receipt.json" % env["receipt"])
    assert receipt.status_code == 200 and "share_phrase" not in receipt.text and "ticks_short" not in receipt.text


@pytest.mark.parametrize("name,golden", GOLDENS, ids=[g[0] for g in GOLDENS])
def test_phrase_and_rank_only_beside_the_share(client, name, golden):
    r = post_golden(client, golden)
    if golden.get("expect_error"):
        return
    env = r.json()
    for c in env["values"]:
        assert ("share_phrase" in c) == ("share_pct_short" in c) == ("rank" in c), name
    change_eligible = (golden["function"] == "get_timeseries" and golden["request"].get("step") == "annual") or (
        golden["function"] == "query_air" and list(golden["request"].get("group_by") or ()) == ["period_id"] and len(env["values"]) >= 2)
    assert ("change" in env) == change_eligible, name
    if "axis" in env:
        assert 4 <= len(env["axis"]["ticks_short"]) <= 6 and set(env["axis"]) == {"ticks_short", "min_short", "max_short", "unit_short", "note"}
    if golden.get("expect_receipt"):
        assert env["receipt"] == golden["expect_receipt"]


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
