"""Activity data the assistant can add up (November 2026): what the model is shown of an activity
result (ask/records.py), the arithmetic done on the server (ask/arith.py), the engine's wider
query_activity (api/vendor/patches/0002), charts (render.py) and figures the model writes itself.

The question that found the gap was "how many vehicles are in Punjab": 288 district rows, of which
the model saw 60, each 900 characters long, and no way to add them up. Every expected figure here is
read from the release's own table, never typed, so the tests follow the release they run against.
"""
import csv
import json
import os
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from test_ask import FakeModel, ask, only, stop, text, tool_use  # first: it puts the query core on the path

from pakemis_api.ask.arith import ArithError, add_up, calculate  # noqa: E402
from pakemis_api.ask.records import activity_view  # noqa: E402
from pakemis_api.ask.render import ChartError, chart_spec, render_multi  # noqa: E402

ROUTE = "/api/v1/emissions/query/activity"
VEHICLES = "fact_activity_vehicles"
REGISTERED = "Registered vehicles"


@pytest.fixture(scope="module")
def vehicle_rows(settings):
    path = os.path.join(settings.semantic_dir, VEHICLES + ".csv")
    with open(path, encoding="utf-8-sig", newline="") as handle:
        return [r for r in csv.DictReader(handle) if r["Measure"] == REGISTERED and r["Location level"] == "District"]


def query(client, **body):
    r = client.post(ROUTE, json=dict({"table": VEHICLES, "measure": REGISTERED}, **body))
    assert r.status_code == 200, r.text[:400]
    return r.json()


def newest(rows, province):
    return max(r["Period"] for r in rows if r["Province"] == province)


# --- the engine: query_activity (patch 0002) ---------------------------------------------------

def test_a_province_is_its_districts_at_the_province_register_date(client, vehicle_rows):
    env = query(client, locations=["Punjab"])
    date = newest(vehicle_rows, "Punjab")
    expected = [r for r in vehicle_rows if r["Province"] == "Punjab" and r["Period"] == date]
    assert len(env["values"]) == len(expected) and {v["period"] for v in env["values"]} == {date}


def test_every_district_is_read_at_its_provinces_date_and_retired_names_are_named_apart(client, vehicle_rows):
    """Khyber Pakhtunkhwa's newest register lists the districts that replaced Chitral and Kohistan;
    reading each place at its own newest date added the old names' last rows (2016-2020) on top."""
    env = query(client, location_level="District")
    for province in {r["Province"] for r in vehicle_rows}:
        dates = {v["period"] for v in env["values"] if v["province"] == province}
        assert dates == {newest(vehicle_rows, province)}, province
    older = {o["location"]: o["latest_period"] for o in env["calculation"]["older_only"]}
    stale = {r["Location"] for r in vehicle_rows} - {v["location"] for v in env["values"]}
    assert stale and set(older) == stale
    for place, latest in older.items():
        assert latest == max(r["Period"] for r in vehicle_rows if r["Location"] == place)


def test_a_place_named_is_read_at_its_own_newest_date(client, vehicle_rows):
    stale = sorted({o["location"] for o in query(client, location_level="District")["calculation"]["older_only"]})[0]
    env = query(client, locations=[stale])
    assert {v["period"] for v in env["values"]} == {max(r["Period"] for r in vehicle_rows if r["Location"] == stale)}


def test_all_periods_reads_the_whole_series(client, vehicle_rows):
    env = query(client, locations=["Lahore"], periods=["all"])
    expected = [r for r in vehicle_rows if r["Location"] == "Lahore"]
    assert len(env["values"]) == len(expected) and not env["calculation"]["older_only"]
    assert "periods" not in env["context"]["defaults_applied"]


def test_categories_filter_any_class_column_and_narrow_together(client):
    table = "fact_activity_fuel_sales_area"
    both = client.post(ROUTE, json={"table": table, "periods": ["2024"],
                                    "categories": ["Petrol / motor spirit (MS)", "Road transport"]}).json()
    assert both["values"]
    assert {v["classes"]["Fuel product"] for v in both["values"]} == {"Petrol / motor spirit (MS)"}
    assert {v["classes"]["Customer group"] for v in both["values"]} == {"Road transport"}
    # a year names its months in a monthly table
    assert {v["period"][:4] for v in both["values"]} == {"2024"}
    # the reporting interval travels with the row: a cumulative report overlaps the monthly ones
    assert all(v.get("reporting_interval") for v in both["values"])


def test_the_row_cap_holds_a_province_series(client, vehicle_rows):
    env = query(client, locations=["Punjab"], periods=["all"])
    assert not env["calculation"]["truncated"]
    assert len(env["values"]) == len([r for r in vehicle_rows if r["Province"] == "Punjab"])


def test_a_fiscal_year_finds_its_row_and_its_months(client):
    # urea: a printed row for FY 2023-24 and the producers' months July 2023 to June 2024
    body = {"table": "fact_activity_fertiliser", "categories": ["Urea"]}
    spaced = client.post(ROUTE, json=dict(body, periods=["FY 2023-24"])).json()
    unspaced = client.post(ROUTE, json=dict(body, periods=["FY2023-24"])).json()
    assert [v["record_id"] for v in spaced["values"]] == [v["record_id"] for v in unspaced["values"]]
    periods = {v["period"] for v in spaced["values"]}
    assert "FY 2023-24" in periods
    assert {p for p in periods if p != "FY 2023-24"} == {"2023-%02d" % m for m in range(7, 13)} | {"2024-%02d" % m for m in range(1, 7)}
    # the annual row and its months are not added up as one: add_up says so
    warnings = add_up(spaced, [])["check_before_reporting"]
    assert any("period types" in w for w in warnings)
    # a fiscal-year table is untouched: one row per year, as before
    petrol = client.post(ROUTE, json={"table": "fact_activity_fuel_sales_national", "periods": ["FY2023-24"],
                                      "categories": ["Petrol / motor spirit (MS)", "All domestic sales total"]}).json()
    assert [v["period"] for v in petrol["values"]] == ["FY 2023-24"]


# --- the model's view of a result ----------------------------------------------------------------

def test_the_model_reads_an_activity_result_as_a_table_with_every_definition_once(client):
    env = query(client, locations=["Punjab"], total=True)
    view = activity_view(env, 60_000)
    assert view["columns"] == ["i", "Location", "Vehicle class", "Value"]
    assert len(view["rows"]) == len(env["values"]) - 1
    assert view["shared"]["Measure"] == REGISTERED and view["shared"]["Province"] == "Punjab"
    assert list(view["notes"]) == ["all rows"] and "not traffic" in view["notes"]["all rows"]
    assert list(view["rules"]) == ["all rows"]
    text_ = json.dumps(view)
    for dropped in ("Record ID", "record_id", "source_reference", "display_words"):
        assert dropped not in text_
    # each row's i is its cell, so a placeholder still quotes it exactly
    i, place, cls, value = view["rows"][0]
    cell = env["values"][i]
    assert (cell["location"], cell["classes"]["Vehicle class"]) == (place, cls)
    assert Decimal(cell["exact"]) == Decimal(value)
    assert view["server_total"]["value"] == env["values"][-1]["exact"]
    # 288 rows in a few thousand tokens, against 900 characters a row before
    assert len(text_) < 60_000


def test_a_selection_too_large_to_read_stays_on_the_server(client):
    env = query(client, location_level="District")
    view = activity_view(env, 2_000)
    assert "rows" not in view and "add_up" in view["rows_not_sent"]
    assert view["columns_held"]["Province"]["distinct"] == len({v["province"] for v in env["values"]})
    assert view["older_only"]["places"]


def test_codes_stand_for_notes_that_differ_by_row(client):
    env = client.post(ROUTE, json={"table": "fact_activity_crops", "location_level": "District",
                                   "categories": ["Wheat"], "measure": "Crop production"}).json()
    view = activity_view(env, 60_000)
    if "Note" in view["columns"]:
        codes = {row[view["columns"].index("Note")] for row in view["rows"]}
        assert codes <= set(view["notes"]) and len(view["notes"]) > 1


# --- add_up and calculate --------------------------------------------------------------------------

def test_add_up_by_class_is_the_exact_sum_of_the_districts(client, vehicle_rows):
    env = query(client, locations=["Punjab"])
    date = newest(vehicle_rows, "Punjab")
    out = add_up(env, ["Vehicle class"])
    expected = {}
    for r in vehicle_rows:
        if r["Province"] == "Punjab" and r["Period"] == date:
            expected[r["Vehicle class"]] = expected.get(r["Vehicle class"], Decimal(0)) + Decimal(r["Value"])
    assert {g["Vehicle class"]: Decimal(g["sum"]) for g in out["groups"]} == expected
    assert Decimal(out["totals"][0]["sum"]) == sum(expected.values())
    districts = len({r["Location"] for r in vehicle_rows if r["Province"] == "Punjab" and r["Period"] == date})
    assert max(g["rows"] for g in out["groups"]) == districts
    assert sum(Decimal(g["share_pct"]) for g in out["groups"]) == pytest.approx(100, abs=0.5)
    # ordered largest first
    sums = [Decimal(g["sum"]) for g in out["groups"]]
    assert sums == sorted(sums, reverse=True)


def test_add_up_where_and_by_period_reads_a_series(client, vehicle_rows):
    env = query(client, locations=["Punjab"], periods=["all"])
    out = add_up(env, ["Period"], [{"column": "vehicle class", "values": ["Two-wheelers (2W)"]}])
    periods = [g["Period"] for g in out["groups"]]
    assert periods == sorted(periods) and "share_pct" not in out["groups"][0]
    first = out["groups"][0]
    expected = sum(Decimal(r["Value"]) for r in vehicle_rows
                   if r["Province"] == "Punjab" and r["Period"] == first["Period"] and r["Vehicle class"] == "Two-wheelers (2W)")
    assert Decimal(first["sum"]) == expected


def test_add_up_says_when_a_sum_runs_across_dates(client):
    # every district once, each province at its own register date: a fair sum, said with its dates
    env = query(client, location_level="District")
    out = add_up(env, ["Province"])
    warnings = out["check_before_reporting"]
    assert any("different dates" in w and "each place once" in w for w in warnings)
    assert not any("once per date" in w for w in warnings)
    assert "Period" in out["covers"]
    # each province's sum carries its own register's date, so no second call is needed for it
    dates = {g["Province"]: g["Period"] for g in out["groups"]}
    assert len(set(dates.values())) > 1
    for province, date in dates.items():
        assert date == max(v["period"] for v in env["values"] if v.get("province") == province)
    # one province's register at every date: the same vehicles counted once per date
    env = query(client, locations=["Punjab"], periods=["all"])
    warnings = add_up(env, [])["check_before_reporting"]
    assert any("once per date" in w for w in warnings)
    assert not any("each place once" in w for w in warnings)


def test_add_up_never_adds_different_units(client):
    env = client.post(ROUTE, json={"table": "fact_activity_crops", "location_level": "National",
                                   "categories": ["Cotton"], "periods": ["all"]}).json()
    out = add_up(env, [])
    units = {(t["Measure"], t["unit"]) for t in out["totals"]}
    assert len(units) == len({(v["measure"], v["unit"]) for v in env["values"] if v.get("exact")})
    assert "kept_apart" in out


def test_add_up_names_what_it_cannot_find(client):
    env = query(client, locations=["Lahore"])
    with pytest.raises(ArithError, match="its columns are"):
        add_up(env, ["Colour"])
    with pytest.raises(ArithError, match="it holds"):
        add_up(env, [], [{"column": "Vehicle class", "values": ["Spaceships"]}])


def test_add_up_warns_of_printed_totals_beside_their_parts(client):
    env = client.post(ROUTE, json={"table": "fact_activity_fuel_sales_national", "periods": ["FY 2023-24"]}).json()
    out = add_up(env, [])
    assert any("printed totals" in w for w in out.get("check_before_reporting", []))


def test_calculate_is_exact_and_refuses_anything_but_arithmetic():
    out = calculate([{"name": "change", "expression": "18,434,072 - 9563120"},
                     {"name": "pct", "expression": "change / 9563120 * 100"}])["results"]
    assert out[0]["result"] == "8870952"
    assert Decimal(out[1]["result"]) == (Decimal(8870952) / Decimal(9563120) * 100).quantize(Decimal("0.000001"))
    for bad in ("__import__('os').system('x')", "open('f')", "a.b", "1/0", "2 ** 1000", "[1, 2]"):
        with pytest.raises(ArithError):
            calculate([{"name": "x", "expression": bad}])


# --- charts and typed figures -----------------------------------------------------------------------

def test_an_instruction_echoed_at_the_start_never_reaches_the_reader():
    # eval D20, 12 November 2026: told to answer before the deadline, the model began its answer
    # with its own paraphrase of prompt rule 10
    leaked = " Write your answer in full, as its own message.In 2023-24, 35,505.3 million cubic metres."
    text_, _ = render_multi(leaked, [], check_numbers=False)
    assert text_ == "In 2023-24, 35,505.3 million cubic metres."
    # an answer that merely starts with a similar word is left alone, and so is a later sentence
    for kept in ("Answer: 401 Mt in 2015-16.", "Giving the answer in full needs two figures.",
                 "Pakistan emitted 469 Mt. Write your answer in full, as its own message."):
        assert render_multi(kept, [], check_numbers=False)[0] == kept


CHART = ('```chart\n{"type": "bar", "title": "Vehicles by class", "unit": "vehicles", "labels": ["A", "B"], '
         '"series": [{"name": "Registered", "values": [18434072, "2,068,471"]}]}\n```')


def test_a_chart_block_becomes_a_checked_tag_in_a_paragraph_of_its_own():
    out, _ = render_multi("Headline 22.2 million.\n" + CHART + "\nAfter.", [], check_numbers=False)
    assert "```" not in out and "\n\n<pchart>" in out and "</pchart>\n\n" in out
    spec = chart_spec(CHART.split("\n")[1])
    assert spec["series"][0]["values"] == [18434072, 2068471]


@pytest.mark.parametrize("bad", [
    '{"type": "radar", "labels": ["a"], "series": [{"name": "x", "values": [1]}]}',
    '{"type": "bar", "labels": ["a", "b"], "series": [{"name": "x", "values": [1]}]}',
    '{"type": "pie", "labels": ["a"], "series": [{"name": "x", "values": [1]}, {"name": "y", "values": [2]}]}',
    '{"type": "bar", "labels": ["{{result_1_cell_0}}"], "series": [{"name": "x", "values": [1]}]}',
    '{"type": "bar", "labels": ["a"], "series": [{"name": "x", "values": ["12 vehicles"]}]}',
    'not json',
])
def test_a_chart_that_does_not_check_is_refused_then_struck(bad):
    block = "```chart\n%s\n```" % bad
    with pytest.raises(ChartError):
        render_multi("Text.\n" + block, [], check_numbers=False)
    out, _ = render_multi("Text.\n" + block, [], check_numbers=False, drop_unknown=True)
    assert "pchart" not in out and "```" not in out and out.strip() == "Text."


def test_an_unclosed_chart_is_refused():
    with pytest.raises(ChartError, match="not closed"):
        render_multi('Text.\n```chart\n{"type": "bar"}', [], check_numbers=False)


def test_typed_figures_pass_and_the_gate_can_be_restored():
    render_multi("22.2 million vehicles, 83.0% of them two-wheelers", [], check_numbers=False)
    with pytest.raises(Exception):
        render_multi("22.2 million vehicles", [])


# --- a whole turn ---------------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def fake():
    return FakeModel()


@pytest.fixture(scope="module")
def ask_client(settings, fake):
    from pakemis_api.app import create_app
    with TestClient(create_app(settings, model_client=fake)) as c:
        yield c


def test_punjab_by_class_in_one_turn(ask_client, fake, vehicle_rows):
    """query_activity and add_up in the same message, then an answer with typed figures and a chart."""
    fake.load([tool_use("query_activity", {"table": VEHICLES, "measure": REGISTERED, "locations": ["Punjab"]}),
               tool_use("add_up", {"result": 1, "group_by": ["Vehicle class"]}), stop("tool_use")],
              [text("Punjab's registers held 22.2 million vehicles.\n\n" + CHART + "\n"), stop()])
    events = ask(ask_client, "How many vehicles are in Punjab, by class?")
    assert not only(events, "error") and not only(events, "refusal")
    results = fake.calls[1]["messages"][-1]["content"]
    table = json.loads(results[0]["content"])
    assert table["columns"] == ["i", "Location", "Vehicle class", "Value"] and "cells" not in table
    sums = json.loads(results[1]["content"])
    date = newest(vehicle_rows, "Punjab")
    expected = sum(Decimal(r["Value"]) for r in vehicle_rows if r["Province"] == "Punjab" and r["Period"] == date)
    assert Decimal(sums["totals"][0]["sum"]) == expected and sums["result"] == 1
    # the reader's event still carries the cells the answer card reads
    assert only(events, "tool_result")[0]["cells"][0]["attrs"]["use_note"]
    answer = only(events, "answer")[0]["text"]
    assert "22.2 million" in answer and "<pchart>" in answer
    # the chart streamed whole, never as JSON a line at a time
    deltas = [e["text"] for e in only(events, "answer_delta")]
    assert any("<pchart>" in d for d in deltas) and not any('"series"' in d and "<pchart>" not in d for d in deltas)


def test_add_up_of_a_call_with_no_rows_is_refused_in_words(ask_client, fake):
    fake.load([tool_use("add_up", {"result": 1}), stop("tool_use")], [text("Nothing to add."), stop()])
    events = ask(ask_client, "add it up")
    refusal = only(events, "refusal")[0]
    assert refusal["name"] == "add_up" and "returned no rows" in refusal["message"]


def test_the_tools_offer_add_up_and_calculate(ask_client):
    names = [t["name"] for t in ask_client.app.state.ask.tools]
    assert "add_up" in names and "calculate" in names and names[-1] == "set_map_view"
