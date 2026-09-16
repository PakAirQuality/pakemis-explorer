"""The reporting-sector axis over the API: where IPCC 2006 files a stream, beside the module.

Every sector bar in the product is drawn on this axis now, so the API must serve it at every grain,
keep it additive with the module grouping, and return the SAME number for the same question however
deep the reader has drilled. rc53 refused it at district grain, which was honest while the district
mass really was module-resolved and wrong to leave standing, because it left the product saying
"industry" twice with two different meanings.
"""
from decimal import Decimal

PREFIX = "/api/v1/emissions"


def cells(client, key, **body):
    env = client.post(PREFIX + "/query/emissions", json={"periods": ["FY2023-24"], "group_by": [key], **body}).json()
    return {c["group"][key]: c for c in env["values"]}, env


def test_the_two_groupings_sum_to_the_same_total(client):
    mods, _ = cells(client, "sector_id")
    reps, env = cells(client, "reporting_sector")
    self_sum = sum(Decimal(c["exact"]) for c in mods.values())
    assert self_sum == sum(Decimal(c["exact"]) for c in reps.values())
    assert "reporting_sector_view" in [l["id"] for l in env["limitations_hit"]]


def test_captive_generation_reports_under_industry(client):
    mods, _ = cells(client, "sector_id")
    reps, _ = cells(client, "reporting_sector")
    assert reps["industry"]["display_short"] == "28.13"
    assert reps["power"]["display_short"] == "57.82"
    assert mods["industry"]["display_short"] == "22.58"
    assert mods["power"]["display_short"] == "63.37"
    gained = Decimal(reps["industry"]["exact"]) - Decimal(mods["industry"]["exact"])
    lost = Decimal(mods["power"]["exact"]) - Decimal(reps["power"]["exact"])
    assert gained == lost > 0


def test_the_start_year_too_so_the_change_is_comparable(client):
    env = client.post(PREFIX + "/query/emissions",
                      json={"periods": ["FY2015-16"], "group_by": ["reporting_sector"]}).json()
    by = {c["group"]["reporting_sector"]: c["display_short"] for c in env["values"]}
    assert by["industry"] == "41.76"
    assert by["power"] == "44.94"


def test_the_filter_is_answerable_and_matches_the_group_cell(client):
    reps, _ = cells(client, "reporting_sector")
    env = client.post(PREFIX + "/query/emissions",
                      json={"periods": ["FY2023-24"], "reporting_sectors": ["industry"]}).json()
    assert Decimal(env["values"][0]["exact"]) == Decimal(reps["industry"]["exact"])


def test_the_economic_aggregate_is_the_two_reporting_sectors(client):
    reps, _ = cells(client, "reporting_sector")
    econ, _ = cells(client, "economic_sector")
    assert (Decimal(econ["industrial"]["exact"])
            == Decimal(reps["industry"]["exact"]) + Decimal(reps["ippu"]["exact"]))


def test_every_grain_returns_the_same_sector_numbers(client):
    """The consistency this axis exists for, and which rc53 did not deliver: the same category,
    the same filters, the same coverage - the same answer, on every page. rc53 REFUSED the axis at
    district grain because the district tables were module-resolved; rc54 removed that ground
    instead of the refusal, so there is nothing left to route around."""
    national, _ = cells(client, "reporting_sector")
    for level in ("adm1", "adm2"):
        env = client.post(PREFIX + "/query/emissions",
                          json={"periods": ["FY2023-24"], "geography_level": level,
                                "group_by": ["reporting_sector"]}).json()
        by = {c["group"]["reporting_sector"]: Decimal(c["exact"]) for c in env["values"]}
        for sector in ("industry", "power"):
            # the district products print at the spatial layer's own precision, so the grains
            # agree to it rather than bit-for-bit (every spatial closure test does the same)
            assert abs(by[sector] / Decimal(national[sector]["exact"]) - 1) < Decimal("1e-7")


def test_the_district_partition_moves_the_measured_captive_vector(client):
    """Not a proportional share of the power module's districts: captive generation's own point
    allocation over its geocoded plants. The release already quantifies that a surface-based
    substitute would sit more than five percentage points away from it."""
    env = client.post(PREFIX + "/query/emissions",
                      json={"periods": ["FY2023-24"], "geography_level": "adm2",
                            "group_by": ["module", "reporting_sector"]}).json()
    by = {(c["group"]["module"], c["group"]["reporting_sector"]): Decimal(c["exact"])
          for c in env["values"]}
    assert ("power", "industry") in by
    assert by[("power", "industry")] > 0
    assert by[("power", "power")] > by[("power", "industry")]


def test_the_labels_name_the_boundary_and_where_it_is_computed(client):
    labels = client.get(PREFIX + "/release").json()["labels"]
    assert labels["reporting_sectors"]["industry"].startswith("Industrial fuel use incl. captive generation")
    assert labels["reporting_sector_modules"]["industry"] == ["industry", "power"]
    assert labels["reporting_sector_modules"]["power"] == ["power"]
