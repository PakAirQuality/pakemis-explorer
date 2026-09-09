"""Every golden of the emissions checkout replayed through the HTTP surface gives the same display
values and the same receipts the golden froze; every refusal golden is a 422 of the right class."""
from decimal import Decimal

import pytest

from conftest import load_goldens

ROUTES = {
    "query_emissions": "/api/v1/emissions/query/emissions",
    "query_air": "/api/v1/emissions/query/air",
    "compare_emissions": "/api/v1/emissions/query/compare",
    "get_timeseries": "/api/v1/emissions/query/timeseries",
    "get_uncertainty": "/api/v1/emissions/query/uncertainty",
    "get_completeness": "/api/v1/emissions/query/completeness",
}

GOLDENS = load_goldens()
assert GOLDENS, "no goldens found; set PAKEMIS_QUERY_PATH to <emissions>/src"


def post_golden(client, golden):
    fn, req = golden["function"], golden["request"]
    if fn in ROUTES:
        return client.post(ROUTES[fn], json=req)
    if fn == "get_evidence":
        return client.get("/api/v1/emissions/evidence/%s" % (req.get("source_stream_id") or "_"),
                          params={k: v for k, v in req.items() if k != "source_stream_id"})
    if fn == "get_spatial_lineage":
        return client.get("/api/v1/emissions/spatial/lineage/%s" % (req.get("shape_id") or req.get("province")),
                          params={k: v for k, v in req.items() if k not in ("shape_id", "province")})
    if fn == "get_cross_sector_transfer":
        return client.get("/api/v1/emissions/transfers", params=req)
    raise KeyError(fn)


@pytest.mark.parametrize("name,golden", GOLDENS, ids=[g[0] for g in GOLDENS])
def test_golden(client, name, golden):
    r = post_golden(client, golden)
    if golden.get("expect_error"):
        assert r.status_code == 422, r.text
        body = r.json()
        assert body["error"] == golden["expect_error"]
        assert "error_class" in body
        if golden.get("expect_limitation"):
            assert body["limitation_id"] == golden["expect_limitation"]
        return
    assert r.status_code == 200, r.text
    env = r.json()
    values = env["values"]
    for i, exp in enumerate(golden["expect"]):
        idx = exp.get("cell", i)
        assert idx < len(values), "cell %d absent" % idx
        got = values[idx]
        if "group" in exp:
            assert got.get("group") == exp["group"]
        if "exact" in exp:
            tol = Decimal(str(exp.get("tolerance", "0")))
            assert abs(Decimal(got["exact"]) - Decimal(exp["exact"])) <= tol
        if "display" in exp:
            assert got["display"] == exp["display"]
    for k, v in golden.get("expect_context", {}).items():
        assert env["context"].get(k) == v
    if golden.get("expect_receipt"):
        assert env["receipt"] == golden["expect_receipt"], "receipt %s != frozen %s" % (env["receipt"], golden["expect_receipt"])
    # the receipt replays to the same envelope, and the download restates it
    again = client.get("/api/v1/emissions/receipt/%s" % env["receipt"])
    assert again.status_code == 200
    assert again.json()["result_sha256"] == env["result_sha256"]
    csv = client.get("/api/v1/emissions/download/%s.csv" % env["receipt"])
    assert csv.status_code == 200 and csv.headers["x-pakemis-receipt"] == env["receipt"]
    assert csv.text.startswith("display,exact,unit,formula,result_row_ids")
