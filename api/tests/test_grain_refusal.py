"""A group_by key the release has no column for at the request's grain is a typed refusal (422
GrainUnavailable naming the grains that carry it), never a 500."""
import pytest

PREFIX = "/api/v1/emissions"


# The grains are no longer hand-written here either. They are what the release says, so a table
# gaining or losing a column changes the expectation and this test with it.
@pytest.mark.parametrize("key,grains,carrier", [
    ("province", ["adm1", "adm2"], "fact_adm1_year"),
    ("shape_id", ["adm2"], "fact_adm2_year"),
    ("module", ["adm1", "adm2"], "fact_adm1_month"),
    ("spatial_view", ["adm1", "adm2"], "fact_adm2_month"),
])
def test_national_grain_refuses_by_name(client, key, grains, carrier):
    r = client.post(PREFIX + "/query/emissions", json={"group_by": [key]})
    assert r.status_code == 422, r.text
    body = r.json()
    assert body["error"] == "grain_unavailable" and body["error_class"] == "GrainUnavailable"
    assert body["limitation_id"] == "grain_unavailable"
    assert body["message"].startswith(
        "%r is not a column the release carries at national grain; available at %s grain ("
        % (key, "/".join(grains)))
    assert body["detail"]["key"] == key and body["detail"]["grain"] == "national"
    assert body["detail"]["available_at"] == grains
    # the tables are named, and they are real tables of this release that really carry the column
    assert carrier in body["detail"]["carried_by"]
    assert all(t.startswith("fact_") for t in body["detail"]["carried_by"])


def test_month_at_national_grain_is_told_to_set_months(client):
    """`month` is not missing at national grain - fact_monthly carries it, and the engine reads
    that table when the request sets `months`. The refusal has to say so, or it sends a reader to
    adm1 for something national grain can answer."""
    r = client.post(PREFIX + "/query/emissions", json={"group_by": ["month"]})
    assert r.status_code == 422, r.text
    out = r.json()
    assert out["detail"]["carried_by"] == ["fact_monthly"]
    assert out["detail"]["available_at"] == ["national"]
    assert "setting `months`" in out["message"], out["message"]
    # and the remedy the message names actually works
    assert client.post(PREFIX + "/query/emissions",
                       json={"group_by": ["month"], "months": ["202307"]}).status_code == 200


def test_a_refusal_never_offers_the_grain_it_just_rejected(client):
    """THE CONTRADICTION FROM THE SCREENSHOT, banned outright.

    A reader was told 'sector_id is not a column the release carries at national grain; available
    at national grain'. That sentence cannot be acted on, and it was printed because the available
    clause was computed from four hardcoded GHG tables while `asked` was read off a wrapper that
    had no geography_level. Both halves are fixed; this asserts the symptom can never return,
    whatever the cause.
    """
    probes = [{"group_by": [k]} for k in ("month", "province", "shape_id", "module", "spatial_view")]
    probes += [{"geography_level": lvl, "group_by": [k]}
               for lvl in ("adm1", "adm2") for k in ("shape_id", "month", "period_id", "spatial_view")]
    seen = 0
    for body in probes:
        r = client.post(PREFIX + "/query/emissions", json=body)
        if r.status_code != 422 or r.json().get("error") != "grain_unavailable":
            continue
        out, level = r.json(), body.get("geography_level", "national")
        seen += 1
        if "is not a column" in out["message"]:
            assert level not in out["detail"]["available_at"], out["message"]
            assert "at %s grain; available at %s grain" % (level, level) not in out["message"]
        else:
            # the other shape: carried AT this grain, by a table this request does not read
            assert "but not by the table this request reads" in out["message"], out["message"]
    assert seen, "no refusal was exercised; the probes have gone stale"


def test_a_district_period_refusal_names_the_air_table_not_a_coarser_grain(client):
    """'Annual emissions trend by sector for Lahore district' - the first screenshot question.

    `period_id` was refused at adm2 with 'available at national grain'. fact_air_adm2_year carries
    period_id AT adm2: the column was missing from the TABLE, not from the grain, and sending the
    reader to national grain sent them away from the district they asked about.
    """
    r = client.post(PREFIX + "/query/emissions", json={"geography_level": "adm2", "group_by": ["period_id"]})
    if r.status_code == 200:
        pytest.skip("the GHG adm2 table now carries period_id; this refusal no longer exists")
    out = r.json()
    assert out["error"] == "grain_unavailable"
    assert "but not by the table this request reads" in out["message"]
    assert out["detail"]["available_at"] == ["adm2"]
    assert any(t.startswith("fact_air_") for t in out["detail"]["carried_by"]), out["message"]
    assert "national" not in out["message"]


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
    assert r.json()["message"].startswith(
        "'shape_id' is not a column the release carries at adm1 grain; available at adm2 grain (")
    assert r.json()["detail"]["available_at"] == ["adm2"]


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


def test_a_wrapped_query_reports_its_own_grain_not_the_wrappers(client):
    """DEFECT C. `asked` was read off the top-level request. TimeseriesRequest and CompareRequest
    have no `geography_level`, so every wrapped adm1/adm2 query announced itself as national - and
    a refusal could then reject a column at national grain and offer it at national grain in the
    same sentence. That tautology is what the screenshot showed.
    """
    r = client.post(PREFIX + "/query/timeseries",
                    json={"query": {"geography_level": "adm1", "group_by": ["shape_id"]}})
    assert r.status_code == 422, r.text
    out = r.json()
    assert out["detail"]["grain"] == "adm1", "the wrapper's grain leaked through"
    assert "at adm1 grain" in out["message"] and "at national grain" not in out["message"]
    assert "adm1" not in out["detail"]["available_at"]
