"""PakEmis Explorer API: FastAPI over pakemis_query, one Engine per process, threads=1.

Every response body is the Envelope exactly as pakemis_query returns it; the service adds no
number and reshapes nothing.  A typed refusal (pakemis_query.errors.QueryError) is HTTP 422 with
the error class name and the limitation id.  The app refuses to start unless
data/verify_release.py passes for the pinned version AND Release.open(verify=True) accepts every
table digest; the mismatch is logged by file name.
"""
import csv
import json
import logging
import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, Response

from pakemis_api import models_gen as G
from pakemis_api.ask.router import install_ask, router as ask_router
from pakemis_api.receipts import ReceiptStore
from pakemis_api.settings import Settings, import_query_core

log = logging.getLogger("pakemis_api")
API_VERSION = "0.1.0"

import_query_core()
from pakemis_query import Engine, Release, download, errors as E, functions as F  # noqa: E402
from pakemis_query.models import canonical_json  # noqa: E402

# OSM-derived allocation surfaces: a table extracted over them is a database under ODbL.
ODBL_SURFACE_MARKERS = ("rail", "road", "osm", "landfill")
SPATIAL_TABLES = ("fact_adm1_month", "fact_adm2_month", "fact_unallocated")


def _verify_module():
    """data/verify_release.py, imported by path so the API and the CLI share one check."""
    import importlib.util
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "verify_release.py")
    spec = importlib.util.spec_from_file_location("verify_release", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class Service:
    """The verified release, the engine, the method registry, the cube paths, the receipts."""

    def __init__(self, settings):
        self.settings = settings
        verify = _verify_module()
        try:
            self.verification = verify.verify(settings.version, settings.releases_root, settings.releases_md, log=log.info)
        except verify.Mismatch as exc:
            log.error("release %s refused: %s", settings.version, exc)
            raise RuntimeError("release %s refused: %s" % (settings.version, exc)) from exc
        try:
            self.release = Release.open(settings.semantic_dir, verify=True, manifest_path=settings.manifest_path)
        except E.IdentityError as exc:
            log.error("release %s refused by pakemis_query: %s", settings.version, exc)
            raise RuntimeError("release %s refused: %s" % (settings.version, exc)) from exc
        self.engine = Engine(self.release, threads=1)
        # one DuckDB connection per process, used by one request at a time: FastAPI runs sync
        # handlers on a threadpool, and a DuckDB connection is not safe under concurrent use
        self._lock = threading.Lock()
        self.method_rows = self._read_methods(settings.method_registry)
        self.cube_paths = settings.cube_paths
        self.receipts = ReceiptStore(settings.receipt_store)
        self.odbl_modules = {r["module"] for r in self.engine._fetch(
            "SELECT DISTINCT module FROM fact_evidence WHERE " + " OR ".join(
                "allocation_surface LIKE '%%%s%%'" % m for m in ODBL_SURFACE_MARKERS))}
        with open(settings.manifest_path, encoding="utf-8") as handle:
            self.manifest = json.load(handle)
        with open(os.path.join(settings.release_dir, "FETCH.json"), encoding="utf-8") as handle:
            self.fetch = json.load(handle)

    @staticmethod
    def _read_methods(path):
        if not os.path.exists(path):
            return []
        with open(path, newline="", encoding="utf-8") as handle:
            lines = [l for l in handle if not l.startswith("#")]
        return list(csv.DictReader(lines))

    # --- dispatch ---------------------------------------------------------------------------

    def run(self, request):
        """One typed request -> one envelope; the receipt is remembered for replay."""
        with self._lock:
            return self._run(request)

    def _run(self, request):
        name = type(request).__name__
        if name == "QueryEmissions":
            env = self.engine.query_emissions(request)
        elif name == "CompareRequest":
            env = F.compare_emissions(self.engine, request)
        elif name == "TimeseriesRequest":
            env = F.get_timeseries(self.engine, request)
        elif name == "UncertaintyRequest":
            env = F.get_uncertainty(self.engine, request)
        elif name == "CompletenessRequest":
            env = F.get_completeness(self.engine, request)
        elif name == "EvidenceRequest":
            env = F.get_evidence(self.engine, request)
        elif name == "MethodRequest":
            env = F.get_method(self.engine, request, self.method_rows)
        elif name == "SpatialLineageRequest":
            env = F.get_spatial_lineage(self.engine, request)
        elif name == "TransferRequest":
            env = F.get_cross_sector_transfer(self.engine, request)
        elif name == "GridCellRequest":
            if request.configuration_id and request.configuration_id not in self.cube_paths:
                raise E.UnknownDimensionValue("%r has no grid cube (REF_2023_24, S_2023_24)" % request.configuration_id,
                                              dimension="configuration_id")
            env = F.get_grid_cell(self.engine, request, self.cube_paths)
        else:
            raise E.QueryError("no function for %s" % name)
        # the CALLER's request is stored (before the engine fills defaults): replaying it
        # re-derives the filled request, and with it the same receipt
        self.receipts.remember(env["receipt"], canonical_json(request))
        return env

    def replay(self, receipt):
        canonical = self.receipts.get(receipt)
        if canonical is None:
            raise HTTPException(404, {"error": "unknown_receipt", "message": "no request is stored for receipt %s; POST the request again to mint it" % receipt})
        env = self.run(G.from_canonical(canonical))
        if env["receipt"] != receipt:
            raise HTTPException(500, {"error": "receipt_not_reproduced", "message": "replaying the stored request gave receipt %s, not %s: the release changed under the receipt" % (env["receipt"], receipt), "expected": receipt, "recomputed": env["receipt"]})
        return env

    def odbl_in_scope(self, env):
        tables = {t.get("table") for t in env.get("provenance", {}).get("tables", [])}
        if not tables & set(SPATIAL_TABLES):
            return False
        req = json.loads(env["request"])
        sectors = set(req.get("sectors") or ())
        return bool(self.odbl_modules) and (not sectors or bool(sectors & self.odbl_modules))

    def release_summary(self):
        c = self.release.contract
        rel = c["release"]
        dims = {}
        for name in c["dimensions"]:
            rows = self.release.dim(name)
            dims[name] = {"rows": len(rows), "columns": c["dimensions"][name]["columns"]}
        dims["dim_gas"]["values"] = sorted(self.release.dim_values("dim_gas", "gas"))
        dims["dim_configuration"]["queryable"] = [
            {k: r[k] for k in ("configuration_id", "display_name", "available_periods", "available_grains", "national_total_Mt", "national_delta_Mt", "note")}
            for r in self.release.dim("dim_configuration") if r["queryable"] == "yes"]
        dims["dim_period"]["values"] = [{"period_id": r["period_id"], "basis": r["basis"], "is_reference": r["is_reference"], "availability": r["availability"]}
                                        for r in self.release.dim("dim_period")]
        dims["dim_geography"]["adm1"] = [{"geography_id": r["geography_id"], "name": r["name"], "shape_id": r["shape_id"], "has_polygon": r["has_polygon"]}
                                         for r in self.release.dim("dim_geography") if r["level"] == "adm1"]
        dims["dim_month"]["values"] = [r["month"] for r in self.release.dim("dim_month")]
        defaults = self.release.defaults
        return {
            "api_version": API_VERSION,
            "release": rel,
            "version": self.release.version,
            "release_id": self.release.release_id,
            "commit": self.release.commit,
            "fetched_from": self.fetch["source"],
            "defaults": defaults,
            "context_bar": {"release": self.release.release_id, "basis": defaults["basis"],
                            "configuration_id": defaults["configuration_id"], "gwp_basis": defaults["gwp_basis"],
                            "geography_id": defaults["geography_id"], "reporting_period": self.manifest.get("reporting_period"),
                            "lulucf": rel["lulucf"]},
            "dims": dims,
            "rounding": c["rounding"],
            "query_contract": c["query_contract"],
            "known_limitations": c["known_limitations"],
            "digests": {"semantic_release_json": self.verification["semantic_release_sha256"],
                        "release_manifest_json": self.verification["release_manifest_sha256"],
                        "tables": {name: t["sha256_csv"] for name, t in self.release.tables.items()},
                        "products": {p["path"]: p["sha256"] for p in self.manifest["products"] if p["path"].endswith(".nc")}},
            "licences": rel["licences"],
            "doi": self.manifest.get("doi"),
            "placeholders": {"auth": "none (declared placeholder)", "postgresql": "none; receipts are an in-memory map mirrored to JSON",
                             "agent": "Ask PakEmis is disabled; it may only call the typed functions listed in query_contract.functions",
                             "object_storage": "none; tiles are built locally and served as static files"},
        }


def refusal(exc):
    body = exc.to_dict()
    body["error_class"] = type(exc).__name__
    return JSONResponse(status_code=422, content=body)


def create_app(settings=None, model_client=None):
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app):
        app.state.service = Service(settings)
        log.info("serving %s from %s", app.state.service.release.release_id, settings.release_dir)
        install_ask(app, app.state.service, settings, model_client)   # ask: sets service.agent_status
        yield

    app = FastAPI(title="PakEmis Explorer API", version=API_VERSION, lifespan=lifespan,
                  description="Deterministic query API over one verified PakEmis semantic release. Every response is a "
                              "pakemis_query Envelope with a replayable receipt; typed refusals are HTTP 422.")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    @app.exception_handler(E.QueryError)
    async def _query_error(request: Request, exc: E.QueryError):
        return refusal(exc)

    app.include_router(ask_router)                                    # ask: POST /v1/ask (SSE)

    def svc() -> Service:
        return app.state.service

    @app.get("/v1/release", tags=["release"])
    def release():
        return svc().release_summary()

    @app.post("/v1/query/emissions", tags=["query"])
    def query_emissions(body: G.QueryEmissionsModel):
        return svc().run(G.to_request(body))

    @app.post("/v1/query/compare", tags=["query"])
    def compare(body: G.CompareRequestModel):
        return svc().run(G.to_request(body))

    @app.post("/v1/query/timeseries", tags=["query"])
    def timeseries(body: G.TimeseriesRequestModel):
        return svc().run(G.to_request(body))

    @app.post("/v1/query/uncertainty", tags=["query"])
    def uncertainty(body: G.UncertaintyRequestModel):
        return svc().run(G.to_request(body))

    @app.post("/v1/query/completeness", tags=["query"])
    def completeness(body: G.CompletenessRequestModel):
        return svc().run(G.to_request(body))

    @app.get("/v1/evidence/{stream_id:path}", tags=["lineage"])
    def evidence(stream_id: str, category: str = "", module: str = ""):
        req = G.to_request(G.EvidenceRequestModel(source_stream_id="" if stream_id == "_" else stream_id, category=category, module=module))
        return svc().run(req)

    @app.get("/v1/method/{method_or_category}", tags=["lineage"])
    def method(method_or_category: str):
        s = svc()
        ids = {r["method_id"] for r in s.method_rows}
        body = G.MethodRequestModel(method_id=method_or_category) if method_or_category in ids else G.MethodRequestModel(category=method_or_category)
        return s.run(G.to_request(body))

    @app.get("/v1/transfers", tags=["lineage"])
    def transfers(ledger_id: str = "", configuration_id: str = ""):
        return svc().run(G.to_request(G.TransferRequestModel(ledger_id=ledger_id, configuration_id=configuration_id)))

    @app.get("/v1/spatial/lineage/{shape_id}", tags=["spatial"])
    def spatial_lineage(shape_id: str, month: str = "", gas: str = "", configuration_id: str = ""):
        s = svc()
        provinces = {r["name"] for r in s.release.dim("dim_geography") if r["level"] == "adm1"}
        if shape_id in provinces:
            body = G.SpatialLineageRequestModel(province=shape_id, month=month, gas=gas, configuration_id=configuration_id)
        else:
            body = G.SpatialLineageRequestModel(shape_id=shape_id, month=month, gas=gas, configuration_id=configuration_id)
        return s.run(G.to_request(body))

    @app.post("/v1/spatial/grid", tags=["spatial"])
    def grid_cell(body: G.GridCellRequestModel):
        return svc().run(G.to_request(body))

    @app.get("/v1/receipt/{receipt}", tags=["receipt"])
    def receipt(receipt: str):
        return svc().replay(receipt)

    @app.get("/v1/download/{receipt}.csv", tags=["download"], response_class=PlainTextResponse)
    def download_csv(receipt: str):
        s = svc()
        env = s.replay(receipt)
        text = download.result_csv(env)
        headers = {"Content-Disposition": 'attachment; filename="pakemis_%s.csv"' % receipt,
                   "X-PakEmis-Receipt": env["receipt"], "X-PakEmis-Result-SHA256": env["result_sha256"],
                   "X-PakEmis-Release": env["context"]["release"]}
        return Response(content=text, media_type="text/csv; charset=utf-8", headers=headers)

    @app.get("/v1/download/{receipt}.receipt.json", tags=["download"])
    def download_receipt(receipt: str):
        s = svc()
        env = s.replay(receipt)
        text = download.receipt_json(env, odbl_in_scope=s.odbl_in_scope(env))
        return Response(content=text, media_type="application/json",
                        headers={"Content-Disposition": 'attachment; filename="RECEIPT_%s.json"' % receipt})

    @app.get("/healthz", include_in_schema=False)
    def healthz():
        s = svc()
        return {"ok": True, "release": s.release.release_id, "receipts": len(s.receipts)}

    return app


app = create_app() if os.environ.get("PAKEMIS_API_LAZY") != "1" else None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("pakemis_api.app:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), workers=1)
