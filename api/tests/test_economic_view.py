"""The economic-sector view through the API: `group_by: ["economic_sector"]` is the query core's
derived key over the same atoms - additive with the IPCC view every period, and its 'industrial'
aggregate is the release's own covered direct industrial boundary (industry module + the captive
generation the power module computes + cement process CO2), printed as the presentation layer
prints every sector cell."""
from decimal import Decimal

BASE = "/api/v1/emissions/query"
PERIODS = ["FY2015-16", "FY2023-24"]


def _cells(client, key):
    r = client.post(BASE + "/emissions", json={"periods": PERIODS, "group_by": ["period_id", key]})
    assert r.status_code == 200, r.text
    env = r.json()
    return {(c["group"]["period_id"], c["group"][key]): c for c in env["values"]}, env


def test_both_views_sum_to_the_same_total_and_industrial_is_the_covered_boundary(client):
    ipcc, _ = _cells(client, "sector_id")
    econ, env = _cells(client, "economic_sector")
    for p in PERIODS:
        a = sum(Decimal(c["exact"]) for (pp, _), c in ipcc.items() if pp == p)
        b = sum(Decimal(c["exact"]) for (pp, _), c in econ.items() if pp == p)
        assert a == b, p
    assert econ[("FY2023-24", "industrial")]["display_short"] == "53.67"   # rc52: + ammonia, steel, lubricants
    assert econ[("FY2015-16", "industrial")]["display_short"] == "62.58"
    assert "industry" not in {k[1] for k in econ} and "ippu" not in {k[1] for k in econ}
    # the derived key names its limitation (the pinned payload may not yet word it; the id is there)
    assert "economic_sector_view" in {l["id"] for l in env["limitations_hit"]}


def test_compare_regroups_by_the_economic_key(client):
    body = {"left": {"periods": ["FY2015-16"], "group_by": ["economic_sector"]},
            "right": {"periods": ["FY2023-24"], "group_by": ["economic_sector"]}, "mode": "absolute"}
    r = client.post(BASE + "/compare", json=body)
    assert r.status_code == 200, r.text
    cells = {c["left"]["group"]["economic_sector"]: c for c in r.json()["values"]}
    assert cells["industrial"]["display_short"] == "-8.91"
    assert cells["industrial"]["left"]["display_short"] == "62.58" and cells["industrial"]["right"]["display_short"] == "53.67"


def test_the_industrial_drill_is_the_ipcc_code_filter(client):
    # what a bar click sends for the economic aggregate: 1.A.2 exact-or-children plus every 2.x
    r = client.post(BASE + "/emissions", json={"periods": ["FY2023-24"], "ipcc_codes": ["1.A.2", "2"], "group_by": ["sector_id"]})
    assert r.status_code == 200, r.text
    by = {c["group"]["sector_id"]: Decimal(c["exact"]) for c in r.json()["values"]}
    assert set(by) == {"industry", "power", "ippu"}          # railways' '1.A.2/1.A.4.c' is not swept in
    econ, _ = _cells(client, "economic_sector")
    assert sum(by.values()) == Decimal(econ[("FY2023-24", "industrial")]["exact"])
