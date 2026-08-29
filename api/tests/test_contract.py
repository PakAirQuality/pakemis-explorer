"""openapi.json freshness, generated models mirror the dataclasses, receipts are deterministic
across two app instances, refusals map to 422 with the class named."""
import dataclasses
import os
import sys

import pytest

from conftest import API_DIR, load_goldens


def test_openapi_json_is_fresh():
    sys.path.insert(0, API_DIR)
    import export_openapi
    committed = open(os.path.join(API_DIR, "openapi.json"), encoding="utf-8").read()
    assert committed == export_openapi.schema_text(), "api/openapi.json is stale: run `make openapi`"


def test_models_mirror_dataclasses():
    from pakemis_api import models_gen as G
    for dc in G.REQUEST_TYPES:
        model = G.MODELS[dc.__name__]
        expected = [f.name for f in dataclasses.fields(dc) if f.compare]
        assert list(model.model_fields) == expected, dc.__name__
        # a minimal body (nested requests empty) round-trips to the dataclass's own defaults
        minimal = {f.name: {} for f in dataclasses.fields(dc) if dataclasses.is_dataclass(f.type)}
        req = G.to_request(model.model_validate(minimal))
        for f in dataclasses.fields(dc):
            if f.compare and not dataclasses.is_dataclass(f.type):
                assert getattr(req, f.name) == f.default, (dc.__name__, f.name)
    q = G.to_request(G.QueryEmissionsModel(periods=["FY2023-24"], gases=["CH4"]))
    assert q.periods == ("FY2023-24",) and q.gases == ("CH4",) and q.defaults_applied == ()


def test_receipts_deterministic_across_instances(settings, tmp_path):
    from fastapi.testclient import TestClient
    from pakemis_api.app import create_app
    from pakemis_api.settings import Settings
    other = Settings(query_path=settings.query_path, releases_root=settings.releases_root, version=settings.version,
                     receipt_store=str(tmp_path / "other_receipts.json"), releases_md=settings.releases_md)
    bodies = [{"periods": ["FY2023-24"]}, {"periods": ["FY2023-24"], "configuration_id": "S_2023_24"},
              {"periods": ["FY2023-24"], "group_by": ["sector_id", "gas"], "order_by": "value desc"},
              {"periods": ["FY2023-24"], "geography_level": "adm1"}]
    with TestClient(create_app(settings)) as a, TestClient(create_app(other)) as b:
        for body in bodies:
            ea, eb = a.post("/v1/query/emissions", json=body).json(), b.post("/v1/query/emissions", json=body).json()
            assert ea["receipt"] == eb["receipt"]
            assert ea["result_sha256"] == eb["result_sha256"]
            assert [v["display"] for v in ea["values"]] == [v["display"] for v in eb["values"]]
            # the receipt is content-addressed: b can replay what it minted, and the replay agrees with a
            assert b.get("/v1/receipt/%s" % ea["receipt"]).json()["result_sha256"] == ea["result_sha256"]


@pytest.mark.parametrize("body,error_class,error", [
    ({"periods": ["FY2023-24"], "geography_level": "adm2", "gwp_basis": "AR6"}, "NotEstimated", "not_estimated"),
    ({"periods": ["2024"]}, "UnknownDimensionValue", "unknown_dimension_value"),
    ({"periods": ["FY2023-24", "CY2023"]}, "MixedBasisError", "mixed_basis"),
    ({"periods": ["FY2020-21"], "configuration_id": "S_2023_24"}, "GrainUnavailable", "grain_unavailable"),
    ({"periods": ["CY2020"], "basis": "calendar", "sectors": ["power"]}, "NotEstimated", "not_estimated"),
    ({"periods": ["FY2023-24"], "configuration_id": "power_with_kelectric"}, "UnknownDimensionValue", "unknown_dimension_value"),
])
def test_refusals_are_422_with_class(client, body, error_class, error):
    r = client.post("/v1/query/emissions", json=body)
    assert r.status_code == 422
    assert r.json()["error_class"] == error_class and r.json()["error"] == error


def test_compare_refuses_mixed_gwp(client):
    r = client.post("/v1/query/compare", json={"left": {"periods": ["FY2023-24"]}, "right": {"periods": ["FY2023-24"], "gwp_basis": "AR6"}})
    assert r.status_code == 422 and r.json()["error_class"] == "MixedGwpError"


def test_unknown_receipt_is_404(client):
    assert client.get("/v1/receipt/0000").status_code == 404


def test_grid_cell_reads_the_cube(client):
    r = client.post("/v1/spatial/grid", json={"lat": 31.5, "lon": 74.3, "month": "202307", "gas": "CO2"})
    assert r.status_code == 200
    v = r.json()["values"][0]
    assert v["unit"] == "Gg" and v["display"] and r.json()["limitations_hit"][0]["id"] == "grid_not_tabular"


def test_envelope_is_not_reshaped(client):
    env = client.post("/v1/query/emissions", json={"periods": ["FY2023-24"]}).json()
    assert set(env) == {"request_type", "request", "context", "values", "calculation", "provenance", "uncertainty",
                        "evidence", "unallocated", "completeness", "limitations_hit", "citation", "result_sha256", "receipt"}
    assert set(env["values"][0]) >= {"exact", "value", "display", "unit", "result_row_ids", "formula"}


def test_goldens_present():
    assert len(load_goldens()) >= 16
