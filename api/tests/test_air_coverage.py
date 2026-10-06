"""One air product, one coverage rule - asserted against the pinned release, not a fixture.

The site showed two national PM2.5 totals for a month: 771.87 kt with residential at 81.9 % on the
workspace, and a table with residential at 77.0 % and power as its third-largest row on the data
page. They were two products behind one endpoint, chosen by whether the request carried `periods`
(app.Service.air_period_default tells the story). These tests hold the rule that resolves it:

  - a sector partition of an air total contains the sources the release ESTIMATES, and grid power
    is not one of them: it is returned beside the values as a screening pair, never as a cell;
  - every share is over the cells returned, and the ungrouped total is their sum - no total row is
    counted again beside its components;
  - leaving the period out is answered for the reference fiscal period, on the same product, and
    the envelope says a default was applied.

No expected NUMBER is written here. The reviewer's figures were a snapshot of one release; what is
asserted is that the representations agree with each other, whatever the release says.
"""
import pytest

AIR = "/api/v1/emissions/query/air"
BY_SECTOR = {"group_by": ["sector_id"], "order_by": "value desc"}


def air(client, **body):
    r = client.post(AIR, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def reference(client):
    return client.get("/api/v1/emissions/release").json()["defaults"]["period_id"]


def numeric(env):
    return [c for c in env["values"] if isinstance(c.get("value"), (int, float))]


@pytest.mark.parametrize("pollutant", ["PM2.5", "SO2", "NOx"])
def test_power_is_beside_an_air_total_never_inside_it(client, pollutant):
    period = reference(client)
    env = air(client, pollutants=[pollutant], periods=[period], **BY_SECTOR)
    sectors = [c["group"]["sector_id"] for c in numeric(env)]
    assert sectors and "power" not in sectors, sectors
    assert env["calculation"]["table"] == "fact_air_panel"
    assert "air_covered_sources" in {l["id"] for l in env["limitations_hit"]}
    # the screening pair travels in `completeness`: two scenario ends, as strings, for this period
    pairs = [r for r in env["completeness"] if r.get("sector_id") == "power" and r.get("pollutant") == pollutant]
    assert len(pairs) == 1 and pairs[0]["period_id"] == period
    assert pairs[0]["scenario_controlled_kt"] and pairs[0]["scenario_uncontrolled_kt"]
    # and neither end is among the values
    shown = {c.get("display") for c in env["values"]} | {c.get("display_short") for c in env["values"]}
    assert pairs[0]["scenario_uncontrolled_kt"] not in shown


@pytest.mark.parametrize("pollutant", ["PM2.5", "SO2"])
def test_shares_are_over_the_cells_shown_and_the_total_is_their_sum(client, pollutant):
    period = reference(client)
    parts = numeric(air(client, pollutants=[pollutant], periods=[period], **BY_SECTOR))
    total = numeric(air(client, pollutants=[pollutant], periods=[period]))
    assert len(total) == 1
    # no total row counted again beside its components: the ungrouped figure IS the sum of the parts
    assert sum(c["value"] for c in parts) == pytest.approx(total[0]["value"], rel=1e-6)
    # every share has the same denominator as that total (documented rounding: one decimal per cell)
    # a share below the presentation floor is printed as "<0.1", a string and not a number
    tiny = [c for c in parts if c["share_pct_short"].startswith("<")]
    priced = [c for c in parts if c not in tiny]
    shares = [float(c["share_pct_short"]) for c in priced]
    slack = 0.05 * len(shares) + 0.05
    assert 100.0 - 0.1 * len(tiny) - slack <= sum(shares) <= 100.0 + slack
    for c, share in zip(priced, shares):
        assert share == pytest.approx(100.0 * c["value"] / total[0]["value"], abs=0.051)
    for c in tiny:
        assert 100.0 * c["value"] / total[0]["value"] < 0.1


@pytest.mark.parametrize("extra", [{}, {"geography_level": "adm1", "group_by": ["province"]}, {"geography_level": "adm2", "group_by": ["shape_id"]}])
def test_a_request_without_a_period_gets_the_reference_year_and_says_so(client, extra):
    period = reference(client)
    body = dict({"pollutants": ["PM2.5"]}, **({"group_by": ["sector_id"]} if not extra else extra))
    defaulted = air(client, **body)
    explicit = air(client, periods=[period], **body)
    # the same product and the same result as naming the reference period...
    assert defaulted["receipt"] == explicit["receipt"]
    assert defaulted["calculation"]["table"] == explicit["calculation"]["table"]
    assert defaulted["calculation"]["table"] in ("fact_air_panel", "fact_air_adm1_year", "fact_air_adm2_year")
    assert defaulted["context"]["periods"] == [period]
    assert [c.get("display") for c in defaulted["values"]] == [c.get("display") for c in explicit["values"]]
    # ...and the envelope discloses that the period was supplied for the caller
    assert "periods" in defaulted["context"]["defaults_applied"]
    assert "periods" not in explicit["context"]["defaults_applied"]
    # the single-year layers, with power as a row, are no longer what an omitted period means
    assert "power" not in {c["group"].get("sector_id") for c in defaulted["values"]}


def test_a_series_without_periods_is_refused_not_answered_with_one_year(client):
    r = client.post(AIR, json={"pollutants": ["PM2.5"], "group_by": ["period_id"]})
    assert r.status_code == 422, r.text
    assert "name the fiscal periods" in r.json()["message"]


def test_the_calendar_history_is_untouched_by_the_default(client):
    env = air(client, pollutants=["PM2.5"], years=["2024"])
    assert env["calculation"]["table"] == "fact_air_timeseries"
    assert env["context"]["periods"] == [] and "periods" not in env["context"]["defaults_applied"]


def _province_and_district(client):
    period = reference(client)
    provinces = numeric(air(client, pollutants=["PM2.5"], periods=[period], geography_level="adm1", group_by=["province"], order_by="value desc"))
    districts = numeric(air(client, pollutants=["PM2.5"], periods=[period], geography_level="adm2", group_by=["shape_id"], order_by="value desc"))
    return period, provinces[0]["group"]["province"], districts[0]["group"]["shape_id"]


def test_a_selected_place_is_answered_for_that_place_by_sector(client):
    """What the data page must send for one chosen province or district: the place id IN the
    request, grouped by sector. The rows are sectors of that place and they sum to its total -
    not every province, and not the nation."""
    period, province, district = _province_and_district(client)
    for level, place in (("adm1", province), ("adm2", district)):
        scope = {"pollutants": ["PM2.5"], "periods": [period], "geography_level": level, "geography_ids": [place]}
        rows = numeric(air(client, **scope, **BY_SECTOR))
        total = numeric(air(client, **scope))
        assert rows and all(set(c["group"]) == {"sector_id"} for c in rows)
        assert "power" not in {c["group"]["sector_id"] for c in rows}
        assert len(total) == 1 and sum(c["value"] for c in rows) == pytest.approx(total[0]["value"], rel=1e-6)
        echoed = air(client, **scope)["context"]
        assert echoed["geography_level"] == level and echoed["geography_ids"] == [place]
    # the place's total is less than the nation's: it is the place, not a fallback to everything
    national = numeric(air(client, pollutants=["PM2.5"], periods=[period]))[0]["value"]
    assert numeric(air(client, pollutants=["PM2.5"], periods=[period], geography_level="adm1", geography_ids=[province]))[0]["value"] < national
