"""GET /claim: the claim record behind one number. The agriculture enteric CH4 national cell
through both selectors (a replayed receipt + cell, a list of result row ids), every section filled
from the payload's tables and registries with strings only, the provenance digests equal to the
manifest's, and the typed 4xx paths."""
import json
import os

import pytest

PREFIX = "/api/v1/emissions"
ENTERIC = {"categories": ["Enteric fermentation"], "gases": ["CH4"]}


@pytest.fixture(scope="module")
def manifest(settings):
    with open(settings.manifest_path, encoding="utf-8") as handle:
        return json.load(handle)


@pytest.fixture(scope="module")
def enteric(client):
    env = client.post(PREFIX + "/query/emissions", json=ENTERIC).json()
    r = client.get(PREFIX + "/claim", params={"receipt": env["receipt"], "cell": 0})
    assert r.status_code == 200, r.text
    return env, r.json()


def leaves(x, path=""):
    if isinstance(x, dict):
        for k, v in x.items():
            yield from leaves(v, "%s.%s" % (path, k))
    elif isinstance(x, list):
        for i, v in enumerate(x):
            yield from leaves(v, "%s[%d]" % (path, i))
    else:
        yield path, x


def test_shape_and_breadcrumb(enteric):
    env, rec = enteric
    assert set(rec) == {"selector", "breadcrumb", "reported", "calculation", "activity", "emission_factors", "method", "monthly_basis",
                        "spatial_basis", "uncertainty", "sources", "validation", "limitations", "completeness", "rows",
                        "class_definitions", "provenance", "missing", "release"}
    assert rec["selector"] == {"receipt": env["receipt"], "cell": 0, "row_ids": None}
    assert [(c["level"], c["id"], c["label"]) for c in rec["breadcrumb"]] == [
        ("sector", "agriculture", "Agriculture"), ("category", "Enteric fermentation", "Enteric fermentation"),
        ("gas", "CH4", "CH₄"), ("geography", "PK", "Pakistan"), ("period", "FY2023-24", "2023–24")]
    assert rec["release"] == {"release": "PakEmis 1.0.0rc58", "version": "1.0.0rc58", "commit": env["context"]["commit"]}
    # only the page-number absence is missing for this cell
    assert [m["section"] for m in rec["missing"]] == ["sources.pages"]
    assert rec["missing"][0]["message"].startswith("not carried by this release")


def test_no_arithmetic_only_strings(enteric):
    _, rec = enteric
    floats = [(p, v) for p, v in leaves(rec) if isinstance(v, float)]
    assert all(".reported.gwp.factors." in p for p, _ in floats), floats[:5]      # the context's factors, copied as they are
    ints = [(p, v) for p, v in leaves(rec) if isinstance(v, int) and not isinstance(v, bool)]
    assert all(p.endswith(("n_rows", ".rows", ".n", "records_cap", ".cell", ".n_streams")) for p, _ in ints), ints[:5]


def test_reported_and_calculation(enteric):
    env, rec = enteric
    cell = env["values"][0]
    rep = rec["reported"]
    assert rep["display_short"] == "151.66" == cell["display_short"] and rep["exact"] == cell["exact"] and rep["display"] == cell["display"]
    assert rep["unit"] == "Mt CO2e AR5" and rep["unit_short"] == "Mt CO₂e" and rep["n_rows"] == 6
    assert rep["gwp"]["basis"] == "AR5" and rep["gwp"]["label"] == "IPCC 2013 (AR5)"
    assert rep["configuration"] == {"id": "REF_2023_24", "label": "Reference estimate", "letter": "L"}
    assert rep["period"] == {"ids": ["FY2023-24"], "labels": ["2023–24"], "months": [], "basis": "fiscal"}
    assert rep["release"]["release"] == "PakEmis 1.0.0rc58"
    calc = rec["calculation"]
    assert calc["sql"] == env["calculation"]["sql"] and calc["table"] == "fact_annual" and calc["column"] == "co2e_Mt_AR5"
    assert calc["rows"] == 6 and calc["result_sha256"] == env["result_sha256"] and calc["receipt"] == env["receipt"]
    assert calc["request"] == env["request"] and calc["request_type"] == "query_emissions"


def test_activity_and_emission_factors(enteric):
    _, rec = enteric
    streams = {a["stream"]: a for a in rec["activity"]}
    assert len(streams) == 6 and all(s.startswith("agriculture|enteric-fermentation|") for s in streams)
    buffalo = streams["agriculture|enteric-fermentation|buffalo|ch4"]
    assert buffalo["activity_parameter_ids"] == ["livestock:buffalo"] and buffalo["native_mass"] == "2625.61024" and buffalo["native_unit"] == "Gg"
    assert buffalo["activity_status"] == "observed" and buffalo["evidence_class"] == "E2" and buffalo["source_id"] == "pbs_agricultural_census_and_economic_survey"
    assert buffalo["source_document_ids"] == ["data/activity/crops_2024.csv", "data/activity/livestock_2024.csv"]
    assert buffalo["method_id"] == "ipcc2006_v4_ch10_eq10.19_enteric_ch4" and buffalo["period_id"] == "FY2023-24"
    assert [u["dependency_group"] for u in buffalo["activity_uncertainty"]] == ["livestock:buffalo"]
    efs = {e["ef_id"]: e for e in rec["emission_factors"]}
    assert set(efs) == {"enteric_buffalo", "enteric_camels", "enteric_dairy_cattle", "enteric_goats", "enteric_other_cattle", "enteric_sheep"}
    ef = efs["enteric_buffalo"]
    assert ef["parameter_id"] == "ef:enteric_buffalo" and ef["value"] == "55" and ef["unit"] == "kg CH4/head/yr" and ef["uncert_pct"] == "40"
    assert ef["vintage"] == "2006" and ef["source"] == "IPCC 2006 V4 Ch10 Table 10.10" and ef["streams"] == ["agriculture|enteric-fermentation|buffalo|ch4"]
    assert ef["found_in"] == ["emission_factors.csv", "national_uncertainty_parameters.csv"]
    assert {u["dependency_group"] for u in ef["uncertainty_parameters"]} == {"ef:enteric_buffalo"}
    assert any(u["uncert_pct_95"] == "40.0" and u["distribution"] == "lognormal" for u in ef["uncertainty_parameters"])


def test_method_monthly_and_spatial_basis(enteric):
    _, rec = enteric
    assert len(rec["method"]) == 1
    m = rec["method"][0]
    assert m["method_id"] == "ipcc2006_v4_ch10_eq10.19_enteric_ch4" and m["tier"] == "T1" and "10.19" in m["equation"]
    assert m["uncertainty_model_id"] == "product_lognormal_activity_x_ef" and m["notes"]
    mb = rec["monthly_basis"]
    assert mb["temporal_class"] == "T4" and mb["temporal_evidence_grade"] == "TE4" and mb["closure_basis"] == "native_mass"
    assert mb["temporal_profile_id"] == "agriculture_t4_flat_the_activity_is_a_livestock_c"
    assert mb["profile"]["basis"] == "flat: the activity is a livestock census enumeration and carries no month" and mb["profile"]["shape"] == "flat"
    assert mb["n_streams"] == 6 and len(mb["by_stream"]) == 6 and mb["by_stream"][0]["monthly"]["n_rows"] == 12
    sb = rec["spatial_basis"]
    assert sb["spatial_class_measured"] == "S3" and sb["allocation_surface"] == "glw_livestock" and sb["placement_class"] == "diffuse_by_nature"
    assert sb["fallback_events"] == "3" and sb["geometry_id"] == "diffuse:adm2_pbs2023" and sb["release_height_class"] == "surface"
    buffalo = next(e for e in sb["by_stream"] if e["stream"].endswith("|buffalo|ch4"))
    assert buffalo["fallback_Mt_AR5"] == "1.238640808902" and buffalo["fallback_Mt_AR5_short"] == "1.24" and len(buffalo["fallbacks"]) == 3
    assert all(f["justification"] for f in buffalo["fallbacks"]) and buffalo["geometry"]["geometry_id"] == "diffuse:adm2_pbs2023"
    assert buffalo["release_height"]["note"] == "animals at ground level"
    assert [r["registry"] for r in sb["rationale"]] == ["stream_geometry.csv"] and sb["rationale"][0]["rationale"] == "census heads by district"
    assert sb["fallback_Mt_AR5"] is None            # six streams: a mass is never summed here


def test_uncertainty_sources_validation_limitations_completeness(enteric):
    _, rec = enteric
    unc = rec["uncertainty"]
    assert [u["resolution"] for u in unc] == ["annual_adm2", "annual_national", "monthly_adm2", "monthly_national"]
    assert all(u["category"] == "Enteric fermentation" and u["parametric_low_pct"] == "-22.22" and u["parametric_high_pct"] == "29.95" for u in unc)
    assert all(isinstance(v, str) for u in unc for v in u.values())
    sources = {s["data_file"]: s for s in rec["sources"] if s["kind"] == "data_file"}
    assert set(sources) == {"data/activity/crops_2024.csv", "data/activity/livestock_2024.csv"}
    live = sources["data/activity/livestock_2024.csv"]
    assert live["primary_source"] == "PBS 7th Agricultural Census 2024" and live["archival_state"] == "archived" and live["licence_status"] == "undetermined"
    assert live["document_sha256"] and live["how_to_obtain"] and live["found_in"] == ["source_documents.csv", "pakemis_source_register.csv"]
    assert len(live["streams"]) == 6
    val = rec["validation"]
    assert {v["kind"] for v in val} == {"catalog", "sector_scorecard", "benchmark"}
    assert all(v["module"] == "agriculture" for v in val if v["kind"] != "benchmark")
    assert any(v["validation_id"] == "abs-agriculture-timing" and v["calibration_or_validation"] == "declared-absence" for v in val)
    assert all(v["engine_category"] == "Enteric fermentation" for v in val if v["kind"] == "benchmark") and any(v["kind"] == "benchmark" and v["source"] == "FAOSTAT" for v in val)
    assert [l["id"] for l in rec["limitations"]] == ["lulucf_excluded"] and rec["limitations"][0]["notation_key"] == "NE" and rec["limitations"][0]["worded"]
    comp = rec["completeness"]
    assert comp["notation_key"] == "E" and comp["justification"].startswith("Tier 1 EFs") and comp["gap"] is None
    assert [r["code"] for r in comp["rows"]] == ["3.A"] and comp["rows"][0]["claim_class"] == ""     # an empty CSV field stays ""


def test_rows_provenance_and_class_definitions(enteric, manifest, client):
    env, rec = enteric
    cell = env["values"][0]
    rows = rec["rows"]
    assert rows["table"] == "fact_annual" and rows["ids"] == cell["result_row_ids"] and rows["n"] == 6
    assert rows["sha256"] == env["provenance"]["tables"][0]["sha256"]
    assert [r["result_row_id"] for r in rows["records"]] == cell["result_row_ids"] and rows["records"][0]["co2e_Mt_AR5"]
    assert rows["download"]["csv"].endswith(PREFIX + "/download/%s.csv" % env["receipt"]) and rows["download"]["csv"].startswith("http")
    assert client.get(rows["download"]["csv"][rows["download"]["csv"].index(PREFIX):]).status_code == 200
    assert rec["class_definitions"] == {"E2": "published statistic for this source and period, not independently verified",
                                        "S3": "administrative statistic (provincial sales, registrations, census counts)",
                                        "T4": "flat or weakly-informed profile; no monthly evidence for this source"}
    sources = {s["path"]: s["sha256"] for s in manifest["sources"]}
    products = {p["path"]: p["sha256"] for p in manifest["products"]}
    names = {p["name"] for p in rec["provenance"]}
    assert {"fact_annual", "fact_evidence", "fact_uncertainty", "fact_completeness", "dim_stream", "emission_factors",
            "uncertainty_parameters", "method_registry", "temporal_profiles", "source_register", "validation_catalog", "benchmarks"} <= names
    checked = 0
    for p in rec["provenance"]:
        if p["identity"] == "manifest_sources":
            assert sources[p["source_path"]] == p["sha256"], p
            checked += 1
        elif p["identity"] == "manifest_products":
            assert products[p["source_path"]] == p["sha256"], p
            checked += 1
        elif p["identity"] == "contract":
            if p["name"] != "semantic_release":
                assert len(p["sha256"]) == 64
    assert checked >= 12


def test_row_ids_path(enteric, client):
    env, rec = enteric
    ids = env["values"][0]["result_row_ids"][:2]
    r = client.get(PREFIX + "/claim", params={"row_ids": ",".join(ids)})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["selector"] == {"receipt": None, "cell": None, "row_ids": ids}
    assert d["reported"] is None and d["missing"][0]["section"] == "reported"
    assert d["calculation"]["table"] == "fact_annual" and d["calculation"]["rows"] == 2 and d["calculation"]["receipt"] is None
    assert [c["id"] for c in d["breadcrumb"]] == ["agriculture", "Enteric fermentation", "CH4", "PK", "FY2023-24"]
    assert d["rows"]["ids"] == ids and d["rows"]["download"] is None and len(d["activity"]) == 2
    assert {e["ef_id"] for e in d["emission_factors"]} == {"enteric_%s" % a["sub_category"] for a in d["activity"]}


def test_adm2_cell_streams_by_module_and_gas(client):
    env = client.post(PREFIX + "/query/emissions", json={"geography_level": "adm2", "group_by": ["shape_id", "module"], "sectors": ["agriculture"], "limit": 1}).json()
    r = client.get(PREFIX + "/claim", params={"receipt": env["receipt"], "cell": 0})
    assert r.status_code == 200, r.text
    d = r.json()
    crumbs = {c["level"]: c for c in d["breadcrumb"]}
    assert crumbs["sector"]["id"] == "agriculture" and crumbs["category"]["id"] is None and crumbs["category"]["label"] == "All categories"
    assert crumbs["geography"]["id"].startswith("ADM2:") and crumbs["geography"]["label"] and crumbs["period"]["id"] == "FY2023-24"
    assert d["calculation"]["table"] == "fact_adm2_month" and d["rows"]["n"] == env["values"][0]["n_rows"]
    assert d["spatial_basis"]["stream_basis"].startswith("the module x gas streams of dim_stream")
    assert all(a["module"] == "agriculture" for a in d["activity"]) and d["spatial_basis"]["n_streams"] == len({a["stream"] for a in d["activity"]})
    assert [l["id"] for l in d["limitations"]][:3] == ["lulucf_excluded", "ar6_adm2_ne", "no_polygon_units"]
    assert d["reported"]["geography"]["level"] == "adm2" and d["reported"]["exactness"] == "exact_stream_priced"


def test_monthly_cell_carries_weights(client):
    env = client.post(PREFIX + "/query/emissions", json={"months": ["202307"], "group_by": ["month"], "categories": ["Rice cultivation"]}).json()
    d = client.get(PREFIX + "/claim", params={"receipt": env["receipt"], "cell": 0}).json()
    mb = d["monthly_basis"]
    assert mb["temporal_class"] == "T3" and mb["n_streams"] == 1 and mb["profile"]["profile_id"] == "agriculture_t3_rice_cultivation_area_days"
    weights = mb["by_stream"][0]["weights"]
    assert len(weights) == 12 and weights[0]["month"] == "202307" and isinstance(weights[0]["weight"], str)
    assert d["reported"]["period"]["months"] == ["202307"] and d["calculation"]["table"] == "fact_monthly"


def test_typed_errors(enteric, client):
    env, _ = enteric
    cases = [
        ({"receipt": env["receipt"], "cell": 9}, 422, "unknown_cell"),
        ({"row_ids": "zz"}, 422, "invalid_row_id"),
        ({"row_ids": "0" * 24}, 404, "unknown_rows"),
        ({}, 422, "missing_selector"),
        ({"receipt": env["receipt"], "row_ids": "0" * 24}, 422, "one_selector"),
        ({"receipt": "nope"}, 404, "unknown_receipt"),
    ]
    for params, status, error in cases:
        r = client.get(PREFIX + "/claim", params=params)
        assert r.status_code == status and r.json()["detail"]["error"] == error, (params, r.text)
    cmp = client.post(PREFIX + "/query/compare", json={"left": {}, "right": {"configuration_id": "S_2023_24"}}).json()
    r = client.get(PREFIX + "/claim", params={"receipt": cmp["receipt"], "cell": 0})
    assert r.status_code == 422 and r.json()["detail"]["error"] == "no_rows"       # a difference cell sums no rows of its own


def test_release_lists_the_registries(client, settings):
    reg = client.get(PREFIX + "/release").json()["registries"]
    assert len(reg) == 22 and "method_registry" in reg
    # 424 at rc47 (four factor rows arrived with the release's new streams)
    assert reg["emission_factors"]["identity"] == "manifest_sources" and reg["emission_factors"]["rows"] == 424
    assert reg["uncertainty_parameters"]["identity"] == "fetch"
    assert all(os.path.exists(os.path.join(settings.release_dir, r["path"])) for r in reg.values())


def test_the_formula_states_the_rows_it_summed(client):
    """The core's cell formula reads "over 0 fact_annual rows" (its count substitution never runs);
    the claim record's formula names the count that `rows` reports."""
    env = client.post(PREFIX + "/query/emissions", json=dict(ENTERIC, group_by=["gas"])).json()
    rec = client.get(PREFIX + "/claim", params={"receipt": env["receipt"], "cell": 0}).json()
    calc = rec["calculation"]
    assert calc["rows"] == len(env["values"][0]["result_row_ids"]) > 0
    assert " over 0 " not in calc["formula"]
    assert (" over %d " % calc["rows"]) in calc["formula"]
