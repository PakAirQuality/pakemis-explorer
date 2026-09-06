"""unallocated_total_short and placed_short: declared derived presentation fields on a spatial
query_emissions envelope whose unallocated block lists provinces with exacts; absent from the
national envelope, from every other function and from the downloads.

rc47 pins: industry left S4 (Wave 4), so the unallocated mass is the three cruise
streams (0.25 Mt) and the placed mass is nearly the whole total (465.67 of 465.92).
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
    assert {k: v for k, v in adm1["derived"].items() if k != "unallocated_by_province_short"} == {"unallocated_total_short": "0.25", "placed_short": "465.67"}
    assert adm1["unallocated"]["total_short"] == "0.25" and adm1["unallocated"]["placed_short"] == "465.67"
    cells = sum(Decimal(c["exact"]) for c in adm1["values"])
    unallocated = sum(Decimal(r["exact"]) for r in adm1["unallocated"]["by_province"])
    assert str(unallocated.quantize(Decimal("0.01"))) == "0.25"
    assert str((cells - unallocated).quantize(Decimal("0.01"))) == "465.67"
    assert str(cells.quantize(Decimal("0.01"))) == "465.92"      # the cells sum to the national total


def test_national_has_no_derived(client):
    env = client.post(PREFIX + "/query/emissions", json={}).json()
    assert env["unallocated"] == {} and "derived" not in env


def test_adm1_by_view_and_sector(client):
    env = client.post(PREFIX + "/query/emissions", json={"geography_level": "adm1", "group_by": ["spatial_view"]}).json()
    assert env["derived"]["unallocated_total_short"] == "0.25" and env["derived"]["placed_short"] == "465.67"
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


def test_adm2_bounded_cells_get_the_total_only(client):
    env = client.post(PREFIX + "/query/emissions", json={"geography_level": "adm2", "group_by": ["module"]}).json()
    assert any(c.get("exact_high") for c in env["values"]), "adm2 power/residential cells are bounded"
    assert set(env["derived"]) == {UNALLOCATED_FIELD, "unallocated_by_province_short"} and env["unallocated"]["total_short"] == env["derived"][UNALLOCATED_FIELD]
    assert "placed_short" not in env["unallocated"]


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
