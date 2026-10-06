"""unallocated_total_short and placed_short: declared derived presentation fields on a spatial
query_emissions envelope whose unallocated block lists provinces with exacts; absent from the
national envelope, from every other function and from the downloads.

rc47 pins: industry left S4 (Wave 4), so the unallocated mass is the three cruise
streams (0.25 Mt) and the placed mass is nearly the whole total (469.39 of 469.64, rc52).
"""
from decimal import Decimal

import pytest

from pakemis_api.presentation import DERIVED, PLACED_FIELD, PRESENTATION_ROUNDING, UNALLOCATED_FIELD, decorate, decorate_unallocated

PREFIX = "/api/v1/emissions"


@pytest.fixture(scope="module")
def adm1(client):
    r = client.post(PREFIX + "/query/emissions", json={"geography_level": "adm1", "group_by": ["province"]})
    assert r.status_code == 200, r.text
    return r.json()


def test_adm1_by_province(adm1):
    assert {k: v for k, v in adm1["derived"].items() if k != "unallocated_by_province_short"} == {"unallocated_total_short": "0.25", "placed_short": "469.39"}
    assert adm1["unallocated"]["total_short"] == "0.25" and adm1["unallocated"]["placed_short"] == "469.39"
    cells = sum(Decimal(c["exact"]) for c in adm1["values"])
    unallocated = sum(Decimal(r["exact"]) for r in adm1["unallocated"]["by_province"])
    assert str(unallocated.quantize(Decimal("0.01"))) == "0.25"
    assert str((cells - unallocated).quantize(Decimal("0.01"))) == "469.39"
    assert str(cells.quantize(Decimal("0.01"))) == "469.64"      # the cells sum to the national total (rc52)


def test_national_has_no_derived(client):
    env = client.post(PREFIX + "/query/emissions", json={}).json()
    assert env["unallocated"] == {} and "derived" not in env


def test_adm1_by_view_and_sector(client):
    env = client.post(PREFIX + "/query/emissions", json={"geography_level": "adm1", "group_by": ["spatial_view"]}).json()
    assert env["derived"]["unallocated_total_short"] == "0.25" and env["derived"]["placed_short"] == "469.39"
    # rc47: fact_unallocated holds AVIATION rows only (industry got its geography at
    # Wave 4; what stays at ADM1 is the cruise share, whose corridors no held evidence
    # can draw). A sector with rows gets both fields, one without gets neither - and
    # industry now sits on the empty side, which is this test's proof the move landed.
    env = client.post(PREFIX + "/query/emissions", json={"geography_level": "adm1", "sectors": ["aviation"]}).json()
    assert set(env["derived"]) == {UNALLOCATED_FIELD, PLACED_FIELD, "unallocated_by_province_short"}
    unallocated = sum(Decimal(r["exact"]) for r in env["unallocated"]["by_province"])
    assert env["derived"][UNALLOCATED_FIELD] == str(unallocated.quantize(Decimal("0.01"))) == "0.25"
    env = client.post(PREFIX + "/query/emissions", json={"geography_level": "adm1", "sectors": ["industry"]}).json()
    assert env["unallocated"]["by_province"] == [] and "derived" not in env


def test_adm2_cells_are_exact_stream_priced(client):
    """Since the stream-priced round the ADM2 CO2e is EXACT (each stream's CH4 origin
    priced before the module aggregation): no interval cell exists anywhere, and the
    previously bounded modules say exact_stream_priced."""
    env = client.post(PREFIX + "/query/emissions", json={"geography_level": "adm2", "group_by": ["module"]}).json()
    assert not any(c.get("exact_high") for c in env["values"]), "no ADM2 cell is an interval any more"
    assert any("exact_stream_priced" in (c.get("exactness") or "") for c in env["values"])
    # with the exact total, the placed share is derivable too - the bounded regime
    # could not state it and omitted it
    assert set(env["derived"]) == {UNALLOCATED_FIELD, "unallocated_by_province_short", "placed_short"}
    assert env["unallocated"]["total_short"] == env["derived"][UNALLOCATED_FIELD]


def test_limit_withholds_placed():
    env = {"request_type": "query_emissions", "request": '{"limit": 2}',
           "values": [{"exact": "10", "unit": "Mt CO2e AR5"}, {"exact": "5", "unit": "Mt CO2e AR5"}],
           "unallocated": {"by_province": [{"province": "A", "exact": "1"}, {"province": "B", "exact": "0.004"}]}}
    decorate_unallocated(env)
    assert env["derived"] == {UNALLOCATED_FIELD: "1.00", "unallocated_by_province_short": {"A": "1.00", "B": "<0.01"}}
    env["request"] = "{}"
    del env["derived"]
    decorate_unallocated(env)
    assert env["derived"] == {UNALLOCATED_FIELD: "1.00", PLACED_FIELD: "14.00", "unallocated_by_province_short": {"A": "1.00", "B": "<0.01"}}   # 15 - 1.004 = 13.996 -> 14.00


def test_other_envelopes_untouched(client):
    for route, body in (("/query/uncertainty", {"scope": "national"}), ("/query/completeness", {}),
                        ("/query/timeseries", {"geography_level": "adm1"})):
        r = client.post(PREFIX + route, json=body)
        if r.status_code == 200:
            assert "derived" not in r.json(), route
    env = {"request_type": "get_spatial_lineage", "values": [], "unallocated": {"by_module_gas": [{"exact": "1"}]}}
    assert "derived" not in decorate_unallocated(dict(env))
    env = {"request_type": "query_emissions", "request": "{}", "values": [], "unallocated": {"by_province": [{"exact": "x"}]}}
    assert "derived" not in decorate(env)


def test_downloads_carry_neither(client, adm1):
    r = client.get(PREFIX + "/download/%s.csv" % adm1["receipt"])
    assert r.status_code == 200 and "placed_short" not in r.text and "unallocated_total_short" not in r.text
    r = client.get(PREFIX + "/download/%s.receipt.json" % adm1["receipt"])
    assert r.status_code == 200 and "placed_short" not in r.text
    replay = client.get(PREFIX + "/receipt/%s" % adm1["receipt"]).json()
    assert replay["derived"] == adm1["derived"] and replay["result_sha256"] == adm1["result_sha256"]


def test_declared_on_release(client):
    presentation = client.get(PREFIX + "/release").json()["rounding"]["presentation"]
    assert presentation == PRESENTATION_ROUNDING
    for field in (UNALLOCATED_FIELD, PLACED_FIELD):
        d = DERIVED[field]
        assert d["field"] == field and d["decimals"] == 2 and d["mode"] == "ROUND_HALF_EVEN"
        assert "never to a download" in d["sentence"]
    assert "0.25" in DERIVED[UNALLOCATED_FIELD]["sentence"] and "465.67" in DERIVED[PLACED_FIELD]["sentence"]


# --- the block is for the scope ASKED: its year, its gases, its view (unallocated.py) --------------
#
# Until 2026-10-06 every assertion in this file was a reference-year one, and so was the block: the
# core attaches the reference year's unallocated table, whole, to an answer for any year, any gas
# and any spatial view. These are the cases that were wrong and unnoticed.

PERIODS = ["FY2015-16", "FY2016-17", "FY2017-18", "FY2018-19", "FY2019-20", "FY2020-21", "FY2021-22", "FY2022-23", "FY2023-24"]


def _post(client, **body):
    r = client.post(PREFIX + "/query/emissions", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _cells(env):
    return sum(Decimal(c["exact"]) for c in env["values"])


def _retained(env):
    return sum(Decimal(r["exact"]) for r in env["unallocated"]["by_province"])


def test_an_earlier_year_carries_its_own_unallocated_mass(client):
    env = _post(client, geography_level="adm1", group_by=["province"], periods=["FY2015-16"])
    assert env["calculation"]["table"] == "fact_adm1_year"
    assert env["unallocated"]["periods"] == ["FY2015-16"] and env["unallocated"]["table"] == "fact_adm1_year"
    assert env["derived"]["unallocated_total_short"] == "0.40", "FY2015-16 retained 0.40 Mt, not the reference year's 0.25"
    assert env["derived"]["placed_short"] == "400.69"
    assert env["derived"]["unallocated_by_province_short"] == {"Balochistan": "0.03", "Khyber Pakhtunkhwa": "0.01", "Other": "0.12", "Punjab": "0.07", "Sindh": "0.17"}
    assert {c["group"]["province"]: c.get("unallocated_short") for c in env["values"]}["Punjab"] == "0.07"
    # the table the block was read from is in the provenance, with the release's digest
    assert "fact_adm1_year" in [t["table"] for t in env["provenance"]["tables"]]
    one = _post(client, geography_level="adm1", geography_ids=["Punjab"], periods=["FY2015-16"])
    assert one["derived"]["unallocated_total_short"] == "0.07" and [r["province"] for r in one["unallocated"]["by_province"]] == ["Punjab"]


@pytest.mark.parametrize("period", PERIODS)
def test_every_year_closes_on_its_own_block(client, period):
    """THE RELEASE'S OWN IDENTITY, per period: what the provinces hold is what the districts hold
    plus what is retained at province level. It is the test of the block - a block that is another
    year's cannot close a year - and it is why the block needs no table of its own."""
    adm1 = _post(client, geography_level="adm1", group_by=["province"], periods=[period])
    adm2 = _post(client, geography_level="adm2", group_by=["province"], periods=[period])
    assert adm1["unallocated"]["periods"] == adm2["unallocated"]["periods"] == [period]
    assert _retained(adm1) == _retained(adm2) > 0
    assert abs(_cells(adm1) - _cells(adm2) - _retained(adm1)) < Decimal("0.00005"), period
    # the years differ: FY2016-17 is the largest (0.43), FY2019-20 the smallest (0.24)
    assert adm1["derived"]["unallocated_total_short"] == {"FY2015-16": "0.40", "FY2016-17": "0.43", "FY2017-18": "0.40", "FY2018-19": "0.34", "FY2019-20": "0.24",
                                                          "FY2020-21": "0.25", "FY2021-22": "0.30", "FY2022-23": "0.27", "FY2023-24": "0.25"}[period]


def test_the_reference_year_block_is_the_cores_rows_unchanged(client, adm1):
    # the reference year keeps reading fact_unallocated, digit for digit
    assert adm1["unallocated"]["table"] == "fact_unallocated" and adm1["unallocated"]["periods"] == ["FY2023-24"]
    assert {r["province"]: (r["exact"], r["n_rows"]) for r in adm1["unallocated"]["by_province"]}["Punjab"] == ("0.044445483172940045", 36)


def test_district_grain_places_what_its_cells_sum_to(client):
    """District cells never held the retained mass, so `placed` is their sum. It used to be that
    sum less the retained mass a second time: 469.14, where the districts hold 469.39."""
    adm1 = _post(client, geography_level="adm1", group_by=["province"])
    adm2 = _post(client, geography_level="adm2", group_by=["province"])
    assert adm2["derived"]["placed_short"] == adm1["derived"]["placed_short"] == "469.39"
    assert str(_cells(adm2).quantize(Decimal("0.01"))) == "469.39"
    old = _post(client, geography_level="adm2", group_by=["province"], periods=["FY2015-16"])
    assert old["derived"]["placed_short"] == "400.69" and old["derived"]["unallocated_total_short"] == "0.40"


def test_the_block_is_for_the_gas_and_the_view_asked(client):
    # methane's retained mass is 0.00005 Mt; the block used to say the all-gas 0.25 beside a methane total
    ch4 = _post(client, geography_level="adm1", group_by=["province"], gases=["CH4"])
    assert ch4["derived"]["unallocated_total_short"] == "<0.01"
    assert abs(_cells(ch4) - _retained(ch4) - _cells(_post(client, geography_level="adm2", group_by=["province"], gases=["CH4"]))) < Decimal("0.00005")
    co2 = _post(client, geography_level="adm1", group_by=["province"], gases=["CO2"], periods=["FY2015-16"])
    assert co2["derived"]["unallocated_total_short"] == "0.40"
    # every retained row is in the accounting view: the physical view retains nothing, and says nothing
    physical = _post(client, geography_level="adm1", group_by=["province"], spatial_view="physical")
    assert physical["unallocated"]["by_province"] == [] and "derived" not in physical
    accounting = _post(client, geography_level="adm1", group_by=["province"], spatial_view="accounting")
    assert accounting["derived"]["unallocated_total_short"] == "0.25"
    for period in ("FY2015-16", "FY2023-24"):
        for view in ("physical", "origin", "accounting"):
            a = _post(client, geography_level="adm1", group_by=["province"], spatial_view=view, periods=[period])
            b = _post(client, geography_level="adm2", group_by=["province"], spatial_view=view, periods=[period])
            assert abs(_cells(a) - _cells(b) - _retained(a)) < Decimal("0.00005"), (period, view)


def test_another_warming_potential_basis_gets_the_block_in_that_basis(client):
    env = _post(client, geography_level="adm1", group_by=["province"], gwp_basis="AR6")
    assert env["calculation"]["column"] == "co2e_Mt_AR6" and env["unallocated"]["table"] == "fact_adm1_month"
    ar5 = _post(client, geography_level="adm1", group_by=["province"])
    assert _retained(env) != _retained(ar5) and env["derived"]["unallocated_total_short"] == "0.25"


def test_the_receipt_is_untouched(client):
    """`unallocated` and `derived` are outside the result digest: the receipt for an earlier year is
    the core's, and replays to the same corrected block."""
    env = _post(client, geography_level="adm1", group_by=["province"], periods=["FY2015-16"])
    from pakemis_query.models import QueryEmissions
    # the core, asked the same thing directly (the caller's request, not the filled echo)
    core = client.app.state.service.engine.query_emissions(QueryEmissions(geography_level="adm1", group_by=("province",), periods=("FY2015-16",)))
    assert core["receipt"] == env["receipt"] and core["result_sha256"] == env["result_sha256"]
    assert core["unallocated"]["by_province"] != env["unallocated"]["by_province"], "the core still attaches the reference year's block"
    replay = client.get(PREFIX + "/receipt/%s" % env["receipt"]).json()
    assert replay["result_sha256"] == env["result_sha256"] and replay["derived"] == env["derived"] and replay["unallocated"] == env["unallocated"]
