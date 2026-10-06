"""Which years the release holds at which resolution, read from its own tables and cubes, against
what the API says about them.

A reviewer found the methodology saying the spatial products existed for the reference year alone
while Downloads listed nine fiscal years of them. Both were written by hand, so neither could
notice the other. Nothing here is a typed-in year count: the periods come from dim_period, the
months from dim_month, and every expectation is what the tables themselves carry - so a release
that really does narrow or widen a product moves the expectation with it.

The same reading found the one request the documentation promised and the API could not serve: an
annual grid cell for a historical year, which left as an untyped 500.
"""
import os

import duckdb
import pytest

PREFIX = "/api/v1/emissions"
LAHORE = {"lat": 31.5, "lon": 74.3}
WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten"}


@pytest.fixture(scope="module")
def con():
    return duckdb.connect()


@pytest.fixture(scope="module")
def table(settings):
    return lambda name: os.path.join(settings.semantic_dir, name + ".parquet")


@pytest.fixture(scope="module")
def periods(con, table):
    """(every fiscal period, the reference one) as dim_period states them."""
    rows = con.execute("SELECT period_id, is_reference FROM '%s' WHERE basis = 'fiscal' ORDER BY period_id"
                       % table("dim_period")).fetchall()
    fiscal = [r[0] for r in rows]
    reference = [r[0] for r in rows if str(r[1]).lower() == "true"]
    assert len(fiscal) > 1 and len(reference) == 1, (fiscal, reference)
    return fiscal, reference[0]


def _distinct(con, path, column):
    return {r[0] for r in con.execute("SELECT DISTINCT %s FROM '%s'" % (column, path)).fetchall()}


# --- the tables ----------------------------------------------------------------------------

@pytest.mark.parametrize("name", ["fact_annual", "fact_adm1_year", "fact_adm2_year", "fact_air_panel",
                                  "fact_air_adm1_year", "fact_air_adm2_year"])
def test_the_annual_tables_carry_every_fiscal_year(con, table, periods, name):
    fiscal, _ = periods
    assert _distinct(con, table(name), "period_id") == set(fiscal), name


def test_months_are_national_for_every_year_and_reference_only_below(con, table, periods):
    fiscal, reference = periods
    month_period = dict(con.execute("SELECT month, period_id FROM '%s'" % table("dim_month")).fetchall())
    national = {month_period[m] for m in _distinct(con, table("fact_monthly"), "month")}
    assert national == set(fiscal)
    # fact_adm2_month also carries the annual row under month = 'all'; it is not a month
    for name in ("fact_adm1_month", "fact_adm2_month", "fact_unallocated"):
        months = _distinct(con, table(name), "month") - {"all"}
        assert months and {month_period[m] for m in months} == {reference}, name


def test_the_annual_cubes_carry_every_fiscal_year_and_the_monthly_ones_twelve_months(settings, periods):
    from netCDF4 import Dataset
    fiscal, _ = periods
    outputs = os.path.join(settings.release_dir, "outputs")
    for name in ("pakemis_grid_0p05_annual_ref_fy2015_16_fy2023_24.nc", "pakemis_air_grid_0p05_annual_fy2015_16_fy2023_24.nc"):
        ds = Dataset(os.path.join(outputs, name))
        try:
            assert [str(p) for p in ds["period_id"][:]] == fiscal, name
        finally:
            ds.close()
    for path in (settings.cube_paths["REF_2023_24"], settings.cube_paths["S_2023_24"]):
        ds = Dataset(path)
        try:
            assert len(ds.dimensions["time"]) == 12, path
        finally:
            ds.close()


def test_no_table_flags_own_year_against_carried_back_geography(con, table, client):
    """Why the documentation quotes a limitation instead of a column. If a release ever ships the
    flag, this fails and the prose should start reading it."""
    for name in ("fact_adm1_year", "fact_adm2_year", "fact_air_adm1_year", "fact_air_adm2_year"):
        columns = {r[0] for r in con.execute("DESCRIBE SELECT * FROM '%s'" % table(name)).fetchall()}
        assert not {c for c in columns if "basis" in c or "pattern" in c or "own_year" in c or "backcast" in c}, (name, columns)
    stated = {entry["id"]: entry["message"] for entry in client.get(PREFIX + "/release").json()["known_limitations"]}
    assert "not an observation" in stated["adm2_history_annual_only"]
    assert "adm2_frame_is_fixed" in stated


# --- what the API says about them ----------------------------------------------------------

def test_the_spatial_family_is_not_described_as_one_year(client, con, table, periods):
    fiscal, _ = periods
    spatial = {f["id"]: f for f in client.get(PREFIX + "/products").json()["families"]}["spatial"]
    assert {"fact_adm1_year", "fact_adm2_year"} <= set(spatial["tables"])
    carried = {t: _distinct(con, table(t), "period_id") for t in ("fact_adm1_year", "fact_adm2_year")}
    assert all(p == set(fiscal) for p in carried.values()), carried
    description = spatial["description"]
    assert not description.startswith("Reference-year")
    assert "annual for every fiscal year" in description and "monthly for the reference year only" in description
    assert "not an observation" in description


def test_the_air_family_counts_the_sectors_the_panel_holds(client, con, table):
    sectors = _distinct(con, table("fact_air_panel"), "sector_id")
    air = {f["id"]: f for f in client.get(PREFIX + "/products").json()["families"]}["air"]
    assert "panel of %s sectors" % WORDS[len(sectors)] in air["description"], (sorted(sectors), air["description"])
    assert "power" not in sectors and "grid power is a screening scenario" in air["description"]


def test_the_prompt_and_the_map_tool_do_not_restrict_the_map_to_one_year():
    from pakemis_api.ask import prompt, tools
    import inspect
    for source in (prompt.CONTRACT, inspect.getsource(tools.map_view_tool)):
        assert "paints the reference year" not in source
        assert "the map paints %s only" not in source


# --- the grid: a historical year -----------------------------------------------------------

def test_a_historical_annual_grid_cell_is_served(client, settings, periods):
    """The 500. `cube_paths` held the two monthly cubes and not the annual one the query core opens
    for any period but the reference year, so every such request died on a KeyError. The cube is in
    the payload; the cell is read from it and compared with the file, period by period."""
    from netCDF4 import Dataset
    fiscal, reference = periods
    annual = settings.cube_paths["ANNUAL"]
    assert os.path.exists(annual)
    ds = Dataset(annual)
    try:
        held = [str(p) for p in ds["period_id"][:]]
        lats, lons = ds["lat"][:], ds["lon"][:]
        i, j = int(abs(lats - LAHORE["lat"]).argmin()), int(abs(lons - LAHORE["lon"]).argmin())
        expected = {p: float(ds["co2_emissions"][held.index(p), :, i, j].sum()) for p in fiscal if p != reference}
    finally:
        ds.close()
    assert expected
    for period, cell in expected.items():
        r = client.post(PREFIX + "/spatial/grid", json=dict(LAHORE, gas="CO2", period_id=period))
        assert r.status_code == 200, (period, r.text)
        env = r.json()
        value = env["values"][0]
        assert env["context"]["periods"] == [period] and value["period_id"] == period
        assert env["calculation"]["table"] == os.path.basename(annual)
        assert value["unit"] == "Gg" and value["display"]
        assert value["value"] == pytest.approx(cell, rel=1e-9), period
        # and it replays, like any other answer
        assert client.get(PREFIX + "/receipt/" + env["receipt"]).json()["result_sha256"] == env["result_sha256"]


def test_what_the_grid_does_not_hold_for_a_historical_year_is_refused_by_name(client, periods):
    fiscal, reference = periods
    historical = next(p for p in fiscal if p != reference)
    probes = [
        (dict(LAHORE, gas="CO2", period_id=historical, month="20" + historical[4:6] + "07"), "GrainUnavailable"),
        (dict(LAHORE, gas="CO2", period_id=historical, configuration_id="S_2023_24"), "NotEstimated"),
        (dict(LAHORE, gas="CO2", period_id="FY1999-00"), "UnknownDimensionValue"),
        # the annual cube's key is the core's own, not a configuration a caller may name
        (dict(LAHORE, gas="CO2", configuration_id="ANNUAL"), "UnknownDimensionValue"),
        (dict(LAHORE, gas="CO2", period_id=historical, configuration_id="ANNUAL"), "UnknownDimensionValue"),
    ]
    for body, error_class in probes:
        r = client.post(PREFIX + "/spatial/grid", json=body)
        assert r.status_code == 422, (body, r.status_code, r.text)
        assert r.json()["error_class"] == error_class, (body, r.json())
