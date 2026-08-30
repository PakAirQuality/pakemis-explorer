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
    assert cells == {"physical": "80.4", "accounting": "11.3", "origin": "8.4"}
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
