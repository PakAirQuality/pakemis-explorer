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
    assert labels["configurations"]["REF_2023_24"]["label"] == "Reference estimate"
    assert labels["configurations"]["S_2023_24"]["letter"] == "S"
    assert labels["configurations"]["S_2023_24"]["label"] == "Survey-based estimate"
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
    # the 2026-09-10 interim disclosure: industry is labelled a reported-fuel estimate on every surface
    assert labels["sectors"]["industry"] == "Industry: reported-fuel estimate"
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


# --- the reader's labels: no raw id (AR5, L, NE, LULUCF) reaches a screen -----------------------

def test_configuration_labels_are_worded_by_kind(release):
    """The two queryable kinds are worded for a reader, with the note as the tooltip and the
    letter kept as the id it is; a structural alternative keeps its display_name humanised."""
    labels = release["labels"]["configurations"]
    rows = {r["configuration_id"]: r for r in release["dims"]["dim_configuration"]["queryable"]}
    ref, survey = labels["REF_2023_24"], labels["S_2023_24"]
    assert (ref["kind"], ref["label"], ref["letter"]) == ("reference", "Reference estimate", "L")
    assert (survey["kind"], survey["label"], survey["letter"]) == ("survey", "Survey-based estimate", "S")
    assert ref["tooltip"] == rows["REF_2023_24"]["note"] and survey["tooltip"] == rows["S_2023_24"]["note"]
    for cid, entry in labels.items():
        assert "(" not in entry["label"], (cid, entry["label"])
        assert entry["tooltip"] == entry["note"]
        if entry["kind"] not in ("reference", "survey"):
            assert entry["label"] == entry["display_name"].replace("_", " ").capitalize()


def test_gwp_labels_quote_the_release_factors(release):
    """labels.gwp has one entry per basis in gwp_bases.factors; the tooltip quotes the release's
    own factors (never typed in the service) and is_default follows defaults.gwp_basis."""
    from pakemis_api.app import gwp_labels
    gwp = release["labels"]["gwp"]
    bases = release["release"]["gwp_bases"]
    assert set(gwp) == set(bases["factors"])
    assert gwp["AR5"]["label"] == "IPCC 2013 (AR5)" and gwp["AR5"]["short"] == "AR5" and gwp["AR5"]["compact"] == "IPCC AR5"
    assert gwp["AR6"]["label"] == "IPCC 2021 (AR6)" and gwp["AR6"]["short"] == "AR6"
    assert gwp["AR5"]["tooltip"].startswith("CO₂-equivalent using the IPCC Fifth Assessment Report's 100-year warming potentials (")
    assert gwp["AR6"]["tooltip"].startswith("CO₂-equivalent using the IPCC Sixth Assessment Report's 100-year warming potentials (")
    for basis, entry in gwp.items():
        f = bases["factors"][basis]
        ch4 = f["CH4"]
        n2o = f["N2O"]
        assert ("CH₄ × %d" % ch4 if ch4 == int(ch4) else "CH₄ × %g" % ch4) in entry["tooltip"]
        assert ("N₂O × %d" % n2o if n2o == int(n2o) else "N₂O × %g" % n2o) in entry["tooltip"]
        assert entry["is_default"] is (basis == release["defaults"]["gwp_basis"])
    assert sum(1 for e in gwp.values() if e["is_default"]) == 1
    # a factor absent from the release is left out of the sentence, never invented
    partial = gwp_labels({"factors": {"AR5": {"N2O": 265.0}}}, "AR5")
    assert partial["AR5"]["tooltip"].endswith("(N₂O × 265)") and "CH₄" not in partial["AR5"]["tooltip"]
    assert gwp_labels({"factors": {"AR9": {}}}, "AR5")["AR9"] == {"label": "IPCC AR9", "short": "AR9", "compact": "IPCC AR9", "tooltip": "CO₂-equivalent using the IPCC AR9 100-year warming potentials", "is_default": False}
    assert gwp_labels(None, "AR5") == {}


def test_lulucf_label_is_worded(release):
    lu = release["labels"]["lulucf"]
    rel = release["release"]["lulucf"]
    assert lu["status"] == rel["status"] == "excluded" and lu["notation_key"] == rel["notation_key"]
    assert lu["short"] == "excludes land use and forestry" and lu["compact"] == "land use excluded"
    assert lu["tooltip"] == rel["note"] and lu["tooltip"]
    from pakemis_api.app import lulucf_labels
    assert lulucf_labels({"status": "partial", "notation_key": "", "note": "n"}) == {"short": "land use and forestry partial", "compact": "land use partial", "status": "partial", "notation_key": "", "tooltip": "n"}
    assert lulucf_labels(None)["short"] == ""


def test_context_bar_carries_the_worded_labels(release):
    cb = release["context_bar"]
    labels = release["labels"]
    assert cb["basis"] == "fiscal" and cb["basis_label"] == "July–June years"
    assert cb["configuration_label"] == labels["configurations"][cb["configuration_id"]]["label"] == "Reference estimate"
    assert cb["gwp_label"] == labels["gwp"][cb["gwp_basis"]]["label"] == "IPCC 2013 (AR5)"
    # the ids stay beside the labels: the URL, the request and the receipt still speak them
    assert cb["configuration_id"] == "REF_2023_24" and cb["gwp_basis"] == "AR5"


def test_the_residual_adm1_unit_is_named_by_its_members(client, release):
    """The payload names its fifth ADM1 unit "Other"; the label names the territories it holds.
    The membership is asserted here, so a release that changes it fails rather than mislabels."""
    service = client.app.state.service
    labels = release["labels"]["geographies"]
    residual = service.residual_adm1_id()
    assert residual == "ADM1:Other"
    assert labels[residual] == service.RESIDUAL_LABEL == "ICT, AJK & Gilgit-Baltistan (combined)"
    families = sorted({r["geography_id"].split(":", 1)[1].split("_", 1)[0] for r in service.release.dim("dim_geography") if r.get("parent_id") == residual and r.get("unit_kind") != "residual"})
    assert tuple(families) == service.RESIDUAL_FAMILIES        # ajk, gb, ict: the label's three
    assert labels["ADM2:other_residual"] == service.RESIDUAL_LABEL
    # every other geography keeps the payload's own name
    assert labels["ADM1:Punjab"] == "Punjab"
