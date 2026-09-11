"""A group_by key the release has no column for at the request's grain is a typed refusal (422
GrainUnavailable naming the grains that carry it), never a 500."""
import pytest

PREFIX = "/api/v1/emissions"


@pytest.mark.parametrize("key,available", [
    ("month", "national grain with months set or adm1/adm2 grain"),
    ("province", "adm1/adm2 grain"),
    ("shape_id", "adm2 grain"),
    ("module", "adm1/adm2 grain"),
    ("spatial_view", "adm1/adm2 grain"),
])
def test_national_grain_refuses_by_name(client, key, available):
    r = client.post(PREFIX + "/query/emissions", json={"group_by": [key]})
    assert r.status_code == 422, r.text
    body = r.json()
    assert body["error"] == "grain_unavailable" and body["error_class"] == "GrainUnavailable"
    assert body["limitation_id"] == "grain_unavailable"
    assert body["message"] == "%r is not a column the release carries at national grain; available at %s" % (key, available)
    assert body["detail"]["key"] == key and body["detail"]["grain"] == "national"


def test_adm1_answers_the_same_keys(client):
    r = client.post(PREFIX + "/query/emissions", json={"geography_level": "adm1", "group_by": ["spatial_view"]})
    assert r.status_code == 200, r.text
    cells = {c["group"]["spatial_view"]: c["share_pct_short"] for c in r.json()["values"]}
    # rc47: industry's view relabel (accounting -> physical, the metered-at-premises
    # argument) and the cruise split regrouped the partition.
    assert cells == {"physical": "82.9", "accounting": "9.0", "origin": "8.1"}
    r = client.post(PREFIX + "/query/emissions", json={"group_by": ["month"], "months": ["202307"]})
    assert r.status_code == 200, r.text


def test_adm1_refuses_shape_id(client):
    r = client.post(PREFIX + "/query/emissions", json={"geography_level": "adm1", "group_by": ["shape_id"]})
    assert r.status_code == 422
    assert r.json()["message"].endswith("at adm1 grain; available at adm2 grain")


def test_the_known_keys_still_work(client):
    for key in ("sector_id", "ipcc_code", "category", "gas", "component_id", "period_id"):
        r = client.post(PREFIX + "/query/emissions", json={"group_by": [key]})
        assert r.status_code == 200, (key, r.text[:200])


# --- category filters outside national grain (plan defect 1) ------------------------------

@pytest.mark.parametrize("level", ["adm1", "adm2"])
@pytest.mark.parametrize("key,value", [("categories", ["Enteric fermentation"]), ("ipcc_codes", ["3.A"])])
def test_category_filters_are_refused_outside_national_grain(client, level, key, value):
    body = {"geography_level": level, "sectors": ["agriculture"], key: value}
    if level == "adm1":
        body["geography_ids"] = ["Punjab"]
    r = client.post(PREFIX + "/query/emissions", json=body)
    assert r.status_code == 422, r.text
    out = r.json()
    assert out["error"] == "grain_unavailable" and out["error_class"] == "GrainUnavailable"
    assert out["message"] == "category filters are national-grain only in this release"
    assert out["detail"] == {"key": key, "keys": [key], "grain": level, "available_at": ["national"]}
    # the same scope without the category filter answers; the filter at national grain answers
    del body[key]
    assert client.post(PREFIX + "/query/emissions", json=body).status_code == 200
    assert client.post(PREFIX + "/query/emissions", json={key: value}).status_code == 200


def test_category_guard_reaches_compare_and_timeseries(client):
    left = {"geography_level": "adm1", "categories": ["Enteric fermentation"]}
    r = client.post(PREFIX + "/query/compare", json={"left": left, "right": {"geography_level": "adm1"}})
    assert r.status_code == 422 and r.json()["message"] == "category filters are national-grain only in this release"
    r = client.post(PREFIX + "/query/timeseries", json={"query": {"geography_level": "adm2", "ipcc_codes": ["3.A"]}})
    assert r.status_code == 422 and r.json()["detail"]["grain"] == "adm2"
    r = client.post(PREFIX + "/query/timeseries", json={"query": {"categories": ["Enteric fermentation"]}})
    assert r.status_code == 200, r.text
