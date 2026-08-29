"""/v1/release carries what the map needs: the ADM2 rows, the sectors, months by period and
server-built labels for every id; the agent block reports "not mounted" until an ask module
mounts and overwrites Service.agent_status."""
import pytest


@pytest.fixture(scope="module")
def release(client):
    return client.get("/v1/release").json()


def test_adm2_rows(release):
    adm2 = release["dims"]["dim_geography"]["adm2"]
    assert len(adm2) == 152
    assert set(adm2[0]) == {"geography_id", "name", "shape_id", "shape_name", "parent_id", "has_polygon", "status", "unit_kind"}
    with_polygon = [r for r in adm2 if r["has_polygon"] == "yes"]
    assert len({r["shape_id"] for r in with_polygon}) == 126
    assert all(r["shape_id"] for r in with_polygon)
    assert all(not r["shape_id"] for r in adm2 if r["has_polygon"] != "yes")
    # the existing adm1 key is unchanged
    assert {r["name"] for r in release["dims"]["dim_geography"]["adm1"]} >= {"Punjab", "Sindh", "Other"}


def test_sectors(release):
    sectors = release["dims"]["sectors"]
    assert len(sectors) == 10 and sectors == sorted(sectors)
    assert {"agriculture", "power", "ippu"} <= set(sectors)


def test_months_by_period(release):
    by_period = release["dims"]["dim_month"]["by_period"]
    periods = {r["period_id"] for r in release["dims"]["dim_period"]["values"]}
    assert set(by_period) <= periods
    # dim_month holds the nine fiscal years of the monthly panel, twelve months each; the
    # calendar-year periods (agriculture reconstruction) have no months and no key here
    assert by_period["FY2023-24"] == ["2023%02d" % m for m in (7, 8, 9, 10, 11, 12)] + ["2024%02d" % m for m in (1, 2, 3, 4, 5, 6)]
    assert all(len(v) == 12 for v in by_period.values())
    assert all(v == sorted(v) for v in by_period.values())
    assert set(by_period) == {p for p in periods if p.startswith("FY")}
    assert sum(len(v) for v in by_period.values()) == len(release["dims"]["dim_month"]["values"])


def test_labels_cover_every_id(release):
    labels = release["labels"]
    dims = release["dims"]
    for c in dims["dim_configuration"]["queryable"]:
        entry = labels["configurations"][c["configuration_id"]]
        assert entry["label"] and entry["kind"] and "note" in entry
    assert labels["configurations"]["REF_2023_24"]["letter"] == "L"
    assert labels["configurations"]["REF_2023_24"]["label"].endswith("(L)")
    assert labels["configurations"]["S_2023_24"]["letter"] == "S"
    assert labels["configurations"]["S_2023_24"]["label"].endswith("(S)")
    for p in dims["dim_period"]["values"]:
        entry = labels["periods"][p["period_id"]]
        assert entry["start"] and entry["end"] and entry["basis"] == p["basis"]
    assert labels["periods"]["FY2023-24"]["label"] == "FY2023-24 (1 Jul 2023 – 30 Jun 2024)"
    assert labels["periods"]["FY2023-24"]["is_reference"] is True
    for m in dims["dim_month"]["values"]:
        assert m in labels["months"]
    assert labels["months"]["202307"] == "Jul 2023"
    assert labels["months"]["202406"] == "Jun 2024"
    assert set(labels["views"]) == {"all", "physical", "origin", "accounting"}
    assert set(labels["limitations"]) == {l["id"] for l in release["known_limitations"]}
    assert labels["gases"] == {"CH4": "CH₄", "CO2": "CO₂", "N2O": "N₂O"}
    assert set(labels["sectors"]) == set(dims["sectors"])
    assert labels["sectors"]["ippu"] == "IPPU" and labels["sectors"]["agriculture"] == "Agriculture"
    assert labels["geographies"]["ADM1:Punjab"] == "Punjab"


def test_agent_block_reports_the_ask_module(release):
    """The ask module is mounted; without ANTHROPIC_API_KEY in the API's environment it
    reports itself disabled with the configured model and a reason that names the
    variable (never its value)."""
    agent = release["agent"]
    assert set(agent) == {"enabled", "model", "reason"}
    assert agent["enabled"] is False
    assert agent["model"] == "claude-sonnet-5"
    assert "ANTHROPIC_API_KEY" in agent["reason"]
    assert len(agent["reason"]) < 200


def test_agent_status_hook(client):
    """An ask module overwrites Service.agent_status; the summary reports it verbatim."""
    service = client.app.state.service
    before = service.agent_status
    try:
        service.agent_status = {"enabled": True, "model": "test-model", "reason": ""}
        assert client.get("/v1/release").json()["agent"] == {"enabled": True, "model": "test-model", "reason": ""}
    finally:
        service.agent_status = before
    assert client.get("/v1/release").json()["agent"]["enabled"] is False


def test_existing_keys_unchanged(release):
    for key in ("api_version", "release", "version", "release_id", "commit", "fetched_from", "defaults", "context_bar",
                "dims", "rounding", "query_contract", "known_limitations", "digests", "licences", "doi", "placeholders"):
        assert key in release, key
    assert release["dims"]["dim_gas"]["values"] == ["CH4", "CO2", "N2O"]
    assert len(release["dims"]["dim_configuration"]["queryable"]) == 2
