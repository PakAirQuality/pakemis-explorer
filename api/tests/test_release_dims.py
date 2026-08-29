"""/api/v1/emissions/release carries what the map needs: the ADM2 rows, the sectors, months by period and
server-built labels for every id; the agent block reports "not mounted" until an ask module
mounts and overwrites Service.agent_status."""
import pytest


@pytest.fixture(scope="module")
def release(client):
    return client.get("/api/v1/emissions/release").json()


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
    assert labels["periods"]["FY2023-24"]["label"] == "July 2023 – June 2024"
    assert labels["periods"]["FY2023-24"]["short"] == "2023–24"
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
    """The ask module is mounted; without a provider key in the API's environment it
    reports itself disabled with a reason that names the missing variable(s) (never a value)."""
    agent = release["agent"]
    assert set(agent) == {"enabled", "model", "provider", "reason"}
    assert agent["enabled"] is False
    assert agent["model"] in (None, "")                       # no model is built without the key
    assert agent["provider"] in ("anthropic", "gemini")
    assert "ANTHROPIC_API_KEY" in agent["reason"] or "GEMINI_API_KEY" in agent["reason"]
    assert len(agent["reason"]) < 200


def test_agent_status_hook(client):
    """An ask module overwrites Service.agent_status; the summary reports it verbatim."""
    service = client.app.state.service
    before = service.agent_status
    try:
        service.agent_status = {"enabled": True, "model": "test-model", "provider": "test", "reason": ""}
        assert client.get("/api/v1/emissions/release").json()["agent"] == {"enabled": True, "model": "test-model", "provider": "test", "reason": ""}
    finally:
        service.agent_status = before
    assert client.get("/api/v1/emissions/release").json()["agent"]["enabled"] is False


def test_existing_keys_unchanged(release):
    for key in ("api_version", "release", "version", "release_id", "commit", "fetched_from", "defaults", "context_bar",
                "dims", "rounding", "query_contract", "known_limitations", "digests", "licences", "doi", "placeholders"):
        assert key in release, key
    assert release["dims"]["dim_gas"]["values"] == ["CH4", "CO2", "N2O"]
    assert len(release["dims"]["dim_configuration"]["queryable"]) == 2


def test_period_labels_carry_no_basis_prefix(release):
    """A person reads '2023–24', never 'FY2023-24': the prefix stays in the id (the key), the
    basis is said once in `basis_note`, and the tooltip label spells the months out."""
    periods = release["labels"]["periods"]
    assert len(periods) == len(release["dims"]["dim_period"]["values"])
    for pid, entry in periods.items():
        assert not entry["short"].startswith("FY") and not entry["short"].startswith("CY"), pid
        assert "FY" not in entry["label"] and "CY" not in entry["label"], pid
        assert entry["short"] and entry["label"] and entry["basis_note"], pid
    fiscal = {pid: e for pid, e in periods.items() if e["basis"] == "fiscal"}
    calendar = {pid: e for pid, e in periods.items() if e["basis"] == "calendar"}
    assert len(fiscal) == 9 and len(calendar) == 35
    for pid, e in fiscal.items():
        assert pid.startswith("FY")
        assert e["short"] == pid[2:].replace("-", "–")               # FY2015-16 -> 2015–16 (en dash)
        assert e["label"].startswith("July ") and " – June " in e["label"]
        assert e["basis_note"] == "a fiscal year runs from July to June"
    assert fiscal["FY2015-16"]["label"] == "July 2015 – June 2016"
    for pid, e in calendar.items():
        assert pid.startswith("CY")
        assert e["short"] == pid[2:]                                   # CY1990 -> 1990
        assert e["label"] == "calendar year " + pid[2:]
        assert e["basis_note"] == "a calendar year runs from January to December"
    assert calendar["CY1990"] == dict(calendar["CY1990"], short="1990", label="calendar year 1990")


def test_period_label_helpers():
    from pakemis_api.app import period_labels, period_short
    assert period_short("FY2023-24") == "2023–24" and period_short("CY1990") == "1990" and period_short("2001") == "2001"
    other = period_labels({"basis": "other", "label": "X1", "period_start": "2001-01-01", "period_end": "2001-03-31"})
    assert other == {"label": "X1 (1 Jan 2001 – 31 Mar 2001)", "short": "X1", "basis_note": ""}


def test_limitation_labels_name_periods_by_their_short_label(release):
    """labels.limitations is the wording a person reads: a period id inside a message becomes the
    short label; the contract's known_limitations keep the message verbatim."""
    labels = release["labels"]
    raw = {l["id"]: l["message"] for l in release["known_limitations"]}
    assert set(labels["limitations"]) == set(raw)
    ids = set(labels["periods"])
    for lid, message in labels["limitations"].items():
        assert not any(pid in message for pid in ids), (lid, message)
    assert "FY2023-24" in raw["config_S_residential_only"]
    assert "2023–24" in labels["limitations"]["config_S_residential_only"] and "FY" not in labels["limitations"]["config_S_residential_only"]
    assert labels["limitations"]["config_S_residential_only"] == raw["config_S_residential_only"].replace("FY2023-24", "2023–24")
