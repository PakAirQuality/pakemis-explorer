"""PakEmis Explorer API: FastAPI over pakemis_query, one Engine per process, threads=1.

Every response body is the Envelope as pakemis_query returns it, with one presentation layer on
top: every cell gains `display_short` (the exact decimal at reading precision, under the rule
/release publishes as rounding.presentation) and `unit_words`; the service adds no other number
and reshapes nothing, and the receipt and result_sha256 are the core's, minted before the
decoration.  A typed refusal (pakemis_query.errors.QueryError) is HTTP 422 with
the error class name and the limitation id.  The app refuses to start unless
data/verify_release.py passes for the pinned version AND Release.open(verify=True) accepts every
table digest; the mismatch is logged by file name.

Every route lives under settings.API_PREFIX (/api/v1/emissions), the prefix Firebase Hosting
rewrites to the Cloud Run service; the same router is mounted a second time under the legacy
/v1 prefix, out of the schema, answered with `Deprecation: true`, for one release.  The schema
and the Swagger docs are served under the prefix ({prefix}/openapi.json, {prefix}/docs) and,
for a direct base and `make openapi`, at the root (/openapi.json, /docs).

Three additions sit beside the query surface: the products catalogue and file route
(pakemis_api.products), the citation and identity line on /release, and a typed refusal where the
release has no column for a group_by key at the request's grain (a DuckDB binder error becomes the
core's GrainUnavailable, HTTP 422, naming the grains that carry the key).
"""
import csv
import datetime
import json
import logging
import os
import re
import threading
from contextlib import asynccontextmanager

import duckdb
from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from starlette.middleware.gzip import GZipMiddleware

from pakemis_api import models_gen as G
from pakemis_api.ask.router import install_ask, router as ask_router
from pakemis_api.claim import ClaimError, ClaimStore
from pakemis_api.middleware import HeadAsGetMiddleware, ResponseHeadersMiddleware
from pakemis_api.presentation import PRESENTATION_ROUNDING, decorate
from pakemis_api.products import ProductCatalog, router as products_router
from pakemis_api.receipts import ReceiptStore
from pakemis_api.settings import API_PREFIX, LEGACY_PREFIX, Settings, import_query_core
from pakemis_api.spatial_fields import SpatialFields
from pakemis_api.tiles import TileStore, router as tiles_router

log = logging.getLogger("pakemis_api")
API_VERSION = "0.1.0"

import_query_core()
from pakemis_query import Engine, Release, download, errors as E, functions as F  # noqa: E402
from pakemis_query.models import canonical_json  # noqa: E402

# OSM-derived allocation surfaces: a table extracted over them is a database under ODbL.
ODBL_SURFACE_MARKERS = ("rail", "road", "osm", "landfill")
SPATIAL_TABLES = ("fact_adm1_month", "fact_adm2_month", "fact_unallocated")
# the tables query_emissions reads, by the grain that reads them: a group_by key the release has no
# column for at the request's grain is refused with the grains whose table carries it
GRAIN_TABLES = (("fact_annual", "national", ""), ("fact_monthly", "national", "with months set"),
                ("fact_adm1_month", "adm1", ""), ("fact_adm2_month", "adm2", ""))
BINDER_COLUMN = re.compile(r'Referenced column "([^"]+)"')
# the query core applies `categories` and `ipcc_codes` at national grain only (engine._filters):
# at adm1/adm2 grain a category filter would silently answer with every row of the sector, so
# the service refuses it before the engine runs (a fix in the core is a named follow-up)
CATEGORY_FILTER_KEYS = ("categories", "ipcc_codes")
CATEGORY_GRAIN_MESSAGE = "category filters are national-grain only in this release"
CITATION_AUTHOR = "Ahmad, R."
CITATION_YEAR = "2026"
DOI_NOTE = "DOI to be inserted at release freeze"
SCOPE_WORDS = "public-data reconstruction of Pakistan's non-LULUCF emissions"
MIDDLE_DOT = " \u00b7 "


def _verify_module():
    """data/verify_release.py, imported by path so the API and the CLI share one check."""
    import importlib.util
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "verify_release.py")
    spec = importlib.util.spec_from_file_location("verify_release", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# --- humanised labels, built from the dims (never a hard-coded list) --------------------------
MONTH_ABBR = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
MONTH_NAMES = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")
EN_DASH = "\u2013"
# the basis prefix of a period id / dim label ("FY2023-24", "CY1990"): dropped from every label a
# person reads; the id itself stays the key (URLs, requests, receipts)
BASIS_PREFIX = re.compile(r"^(FY|CY)")
BASIS_NOTES = {"fiscal": "a fiscal year runs from July to June", "calendar": "a calendar year runs from January to December"}
SUBSCRIPT_DIGITS = str.maketrans("0123456789", "\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089")
ACRONYMS = {"ippu": "IPPU"}   # the one sector id that is an acronym; every other label is title-cased
# the three placements, worded as the release's spatial products contract words them
# (docs/spatial_products_contract.md, "what a placement claims to be"); "all" adds the three
VIEW_MEANINGS = {
    "all": "all three views",
    "physical": "physical: where it is emitted",
    "origin": "origin: where the generating activity originates (waste at the people, not at the landfill)",
    "accounting": "accounting: where the statistic is booked (road and industrial fuel at the province of sale)",
}


def humanise(token):
    """'observed_household_demand' -> 'Observed household demand'."""
    text = str(token).replace("_", " ").replace("-", " ").strip()
    return text[:1].upper() + text[1:]


def date_label(iso):
    """'2023-07-01' -> '1 Jul 2023'; an unparsable string is returned as it is."""
    try:
        d = datetime.date.fromisoformat(iso)
    except (TypeError, ValueError):
        return iso
    return "%d %s %d" % (d.day, MONTH_ABBR[d.month - 1], d.year)


def month_year(iso):
    """'2023-07-01' -> 'July 2023'; an unparsable string is returned as it is."""
    try:
        d = datetime.date.fromisoformat(iso)
    except (TypeError, ValueError):
        return iso
    return "%s %d" % (MONTH_NAMES[d.month - 1], d.year)


def period_short(label):
    """The dim label without its basis prefix, the year pair joined by an en dash:
    'FY2023-24' -> '2023–24', 'CY1990' -> '1990'."""
    return BASIS_PREFIX.sub("", str(label)).replace("-", EN_DASH)


def period_labels(row):
    """`short` is what a chip, rail or axis prints; `label` spells the months out ('July 2023 –
    June 2024' for a fiscal row, 'calendar year 1990' for a calendar row) and is the tooltip;
    `basis_note` says once what the basis means, so no label needs a prefix to say it."""
    basis = row["basis"]
    if basis == "fiscal":
        label = "%s %s %s" % (month_year(row["period_start"]), EN_DASH, month_year(row["period_end"]))
    elif basis == "calendar":
        label = "calendar year %s" % period_short(row["label"])
    else:
        label = "%s (%s %s %s)" % (row["label"], date_label(row["period_start"]), EN_DASH, date_label(row["period_end"]))
    return {"label": label, "short": period_short(row["label"]), "basis_note": BASIS_NOTES.get(basis, "")}


# the two queryable kinds worded for a reader; every other kind keeps its display_name humanised
KIND_LABELS = {"reference": "Reference estimate", "survey": "Survey-based estimate"}
# the IPCC assessment reports a GWP basis id can name: publication year and ordinal (a fact about
# the IPCC, not about the release; the factors themselves are read from the release)
ASSESSMENT_REPORTS = {"AR4": ("2007", "Fourth"), "AR5": ("2013", "Fifth"), "AR6": ("2021", "Sixth")}
# the species a GWP tooltip quotes, in this order, with the wording a reader sees
GWP_SPECIES = (("CH4", "CH\u2084"), ("CH4_fossil", "fossil CH\u2084"), ("N2O", "N\u2082O"))
BASIS_LABELS = {"fiscal": "July\u2013June years", "calendar": "January\u2013December years"}


def configuration_label(row, baseline_letter):
    """The label a reader sees ('Reference estimate' for the reference kind, 'Survey-based
    estimate' for the survey kind, else display_name humanised) and the configuration's letter:
    the baseline letter for the reference row, else the single-letter prefix of the id
    ('S_2023_24' -> 'S') when there is one. The letter stays an id for URLs and receipts."""
    prefix = row["configuration_id"].split("_", 1)[0]
    letter = baseline_letter if row["kind"] == "reference" else (prefix if len(prefix) == 1 else "")
    return KIND_LABELS.get(row["kind"], humanise(row["display_name"])), letter


def _factor_text(x):
    """28.0 -> '28', 29.8 -> '29.8'."""
    try:
        f = float(x)
    except (TypeError, ValueError):
        return str(x)
    return str(int(f)) if f == int(f) else ("%g" % f)


def gwp_labels(gwp_bases, default_basis):
    """One entry per basis in the release's gwp_bases.factors: label 'IPCC 2013 (AR5)', short
    'AR5', compact 'IPCC AR5', a tooltip sentence quoting the release's own factors (a species
    absent from the factors is left out of the sentence), and is_default from the defaults."""
    out = {}
    for basis in sorted((gwp_bases or {}).get("factors") or {}):
        factors = gwp_bases["factors"][basis] or {}
        year, ordinal = ASSESSMENT_REPORTS.get(basis, ("", ""))
        label = "IPCC %s (%s)" % (year, basis) if year else "IPCC %s" % basis
        report = "the IPCC %s Assessment Report's" % ordinal if ordinal else "the IPCC %s" % basis
        quoted = ", ".join("%s \u00d7 %s" % (word, _factor_text(factors[key])) for key, word in GWP_SPECIES if key in factors)
        tooltip = "CO\u2082-equivalent using %s 100-year warming potentials" % report + (" (%s)" % quoted if quoted else "")
        out[basis] = {"label": label, "short": basis, "compact": "IPCC %s" % basis, "tooltip": tooltip, "is_default": basis == default_basis}
    return out


def lulucf_labels(lulucf):
    """'excludes land use and forestry' (short) for the excluded status, 'land use and forestry
    <status>' otherwise; the compact form for a pill; the release's note as the tooltip."""
    status = (lulucf or {}).get("status", "")
    short = "excludes land use and forestry" if status == "excluded" else ("land use and forestry %s" % status if status else "")
    compact = "land use %s" % status if status else ""
    return {"short": short, "compact": compact, "status": status, "notation_key": (lulucf or {}).get("notation_key", ""), "tooltip": (lulucf or {}).get("note", "")}


class Service:
    """The verified release, the engine, the method registry, the cube paths, the receipts."""

    # an `ask` module sets this when it mounts ({"enabled", "model", "reason"}, never a key);
    # release_summary() reports it, or the "not mounted" block when nothing has set it
    agent_status: "dict | None" = None

    def __init__(self, settings):
        self.settings = settings
        self.agent_status = None
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
        # the downloadable products: an allowlist built from the contract, the manifest and the verification
        self.products = ProductCatalog(self.release, self.manifest, self.verification, settings.release_dir)
        # the registry's sector column: /method/{sector} pre-filters the rows by it
        self.method_sectors = sorted({r["sector"] for r in self.method_rows if r.get("sector")})
        # the claim record's joins: the registries under data/registries and the fact tables in a
        # private read-only DuckDB session (never the engine's connection)
        self.claims = ClaimStore(self.release, settings.registries_dir, self.fetch.get("files") or {}, self.method_rows, self.labels(), settings.manifest_path)
        # the map's per-cell evidence fields on adm2 envelopes (the dominant stream per module, from the same session)
        self.spatial_fields = SpatialFields(self.claims)
        # the map's tiles: one reader per archive, the outputs proven against TILES.json's digests
        self.tiles = TileStore(settings.tiles_dir, settings.version)
        if self.tiles.available:
            try:
                self.tiles.verify()
            except TileStore.Mismatch as exc:
                log.error("tiles of %s refused: %s", settings.version, exc)
                raise RuntimeError("tiles of %s refused: %s" % (settings.version, exc)) from exc
        else:
            log.warning("no tiles under %s (run tiles/build_tiles.py); /tiles/* answers 404", settings.tiles_dir)

    @staticmethod
    def _read_methods(path):
        if not os.path.exists(path):
            return []
        with open(path, newline="", encoding="utf-8") as handle:
            lines = [l for l in handle if not l.startswith("#")]
        return list(csv.DictReader(lines))

    # --- dispatch ---------------------------------------------------------------------------

    def run(self, request, decorate_cells=True, method_rows=None):
        """One typed request -> one envelope; the receipt is remembered for replay. The envelope
        leaves with display_short and unit_words on every cell (added after the core minted the
        receipt and result_sha256, so both stand); decorate_cells=False hands out the core's
        envelope untouched, for the downloads. `method_rows` (a MethodRequest only) hands
        get_method a pre-filtered registry (/method/{sector}); such an envelope's receipt is the
        core's for the unfiltered request and is not stored for replay."""
        self.category_grain_guard(request)
        with self._lock:
            try:
                env = self._run(request, method_rows)
            except (duckdb.BinderException, duckdb.CatalogException) as exc:
                raise self.grain_refusal(exc, request) from exc
        if not decorate_cells:
            return env
        return self.spatial_fields.decorate(decorate(env))

    @staticmethod
    def category_grain_guard(request):
        """A QueryEmissions (alone, or inside a compare or timeseries) that carries `categories` or
        `ipcc_codes` with a non-national geography_level is refused as the core's GrainUnavailable:
        engine._filters drops both keys outside national grain, and a Punjab request for one category
        would otherwise answer with every row of the sector."""
        queries = [request] + [getattr(request, a) for a in ("left", "right", "query") if getattr(request, a, None) is not None]
        for q in queries:
            if type(q).__name__ != "QueryEmissions":
                continue
            level = getattr(q, "geography_level", "") or "national"
            if level == "national":
                continue
            keys = [k for k in CATEGORY_FILTER_KEYS if getattr(q, k, ())]
            if keys:
                raise E.GrainUnavailable(CATEGORY_GRAIN_MESSAGE, "grain_unavailable", key=keys[0], keys=keys, grain=level, available_at=["national"])

    def grain_refusal(self, exc, request):
        """A DuckDB binder or catalog error under a request is the release having no column for a
        key at the request's grain: the core's GrainUnavailable, naming the key, the grain asked
        for and the grains whose table carries the key (read from the contract's columns)."""
        level = getattr(request, "geography_level", "") or "national"
        months = getattr(request, "months", None)
        asked = "%s grain%s" % (level, " with months set" if months else "")
        match = BINDER_COLUMN.search(str(exc))
        if not match:
            first = str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__
            return E.GrainUnavailable("the release cannot answer this request at %s: %s" % (asked, first), "grain_unavailable", grain=level)
        key = match.group(1)
        carriers = [(lvl, note) for table, lvl, note in GRAIN_TABLES if key in (self.release.tables.get(table) or {}).get("columns", ())]
        parts = []
        national = [note for lvl, note in carriers if lvl == "national"]
        if national:
            parts.append("national grain" + ("" if "" in national else " " + national[0]))
        adm = [lvl for lvl, _ in carriers if lvl != "national"]
        if adm:
            parts.append("/".join(adm) + " grain")
        available = " or ".join(parts) if parts else "no grain of this release"
        return E.GrainUnavailable("%r is not a column the release carries at %s; available at %s" % (key, asked, available),
                                  "grain_unavailable", key=key, grain=level, available_at=[lvl for lvl, _ in carriers])

    def _run(self, request, method_rows=None):
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
            env = F.get_method(self.engine, request, self.method_rows if method_rows is None else method_rows)
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
        if method_rows is None:
            self.receipts.remember(env["receipt"], canonical_json(request))
        return env

    def method_by_sector(self, sector):
        """/method/{sector}: the registry rows of one sector through get_method with an empty
        request (the core filters on method_id and category only); the context names the sector."""
        rows = [r for r in self.method_rows if r.get("sector") == sector]
        env = self.run(G.to_request(G.MethodRequestModel()), method_rows=rows)
        env["context"]["sector"] = sector
        env["context"]["sector_filter"] = ("the %d registry rows with sector = %s, selected by the service before get_method ran; "
                                           "the receipt is the core's for an unfiltered method request and is not stored for replay" % (len(rows), sector))
        return env

    def claim(self, receipt="", cell=0, row_ids="", base_url=""):
        """/claim: the record behind cell `cell` of a replayed receipt, or behind a list of result
        row ids; a ClaimError is the route's typed 4xx."""
        ids = [i.strip() for i in (row_ids or "").split(",") if i.strip()]
        if receipt and ids:
            raise ClaimError(422, "one_selector", "give either receipt (with cell) or row_ids, not both")
        if receipt:
            env = self.replay(receipt)
            return self.claims.record(env=env, cell=cell, base_url=base_url)
        if ids:
            return self.claims.record(row_ids=ids, base_url=base_url)
        raise ClaimError(422, "missing_selector", "give receipt=<receipt>&cell=<n> or row_ids=<a,b,c>")

    def replay(self, receipt, decorate_cells=True):
        canonical = self.receipts.get(receipt)
        if canonical is None:
            raise HTTPException(404, {"error": "unknown_receipt", "message": "no request is stored for receipt %s; POST the request again to mint it" % receipt})
        env = self.run(G.from_canonical(canonical), decorate_cells=decorate_cells)
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
        # --- the map's additions: every value below is read from a dim row, none is typed here
        dims["dim_geography"]["adm2"] = [
            {k: r[k] for k in ("geography_id", "name", "shape_id", "shape_name", "parent_id", "has_polygon", "status", "unit_kind")}
            for r in self.release.dim("dim_geography") if r["level"] == "adm2"]
        dims["sectors"] = sorted(self.release.dim_values("dim_stream", "module"))
        by_period = {}
        for r in self.release.dim("dim_month"):
            by_period.setdefault(r["period_id"], []).append(r["month"])
        dims["dim_month"]["by_period"] = {k: sorted(v) for k, v in sorted(by_period.items())}
        defaults = self.release.defaults
        labels = self.labels()
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
                            "lulucf": rel["lulucf"],
                            # the same three ids worded for a reader (labels.* holds every value)
                            "basis_label": BASIS_LABELS.get(defaults["basis"], defaults["basis"]),
                            "configuration_label": labels["configurations"].get(defaults["configuration_id"], {}).get("label", defaults["configuration_id"]),
                            "gwp_label": labels["gwp"].get(defaults["gwp_basis"], {}).get("label", defaults["gwp_basis"])},
            "dims": dims,
            # the contract's rounding, plus the presentation rule this service applies on top (display_short)
            "rounding": dict(c["rounding"], presentation=dict(PRESENTATION_ROUNDING)),
            "query_contract": c["query_contract"],
            "known_limitations": c["known_limitations"],
            "labels": labels,
            "agent": dict(self.agent_status) if self.agent_status else {"enabled": False, "model": "", "provider": None, "reason": "not mounted"},
            "registries": self.claims.summary(),
            "digests": {"semantic_release_json": self.verification["semantic_release_sha256"],
                        "release_manifest_json": self.verification["release_manifest_sha256"],
                        "tables": {name: t["sha256_csv"] for name, t in self.release.tables.items()},
                        "products": {p["path"]: p["sha256"] for p in self.manifest["products"] if p["path"].endswith(".nc")}},
            "licences": rel["licences"],
            "doi": self.manifest.get("doi"),
            "citation": self.citation(),
            "identity_line": self.identity_line(),
            "placeholders": {"auth": "none (declared placeholder)", "postgresql": "none; receipts are an in-memory map mirrored to JSON",
                             "agent": "Ask PakEmis is disabled; it may only call the typed functions listed in query_contract.functions",
                             "object_storage": "none; tiles are built locally into the release payload and served by this API"},
        }

    def period_span(self):
        """'2015–24' as the dims carry it: the first and last fiscal period's short labels,
        joined by 'to' ('2015–16 to 2023–24')."""
        fiscal = sorted((r for r in self.release.dim("dim_period") if r["basis"] == "fiscal"), key=lambda r: r["period_start"])
        if not fiscal:
            return ""
        first, last = period_short(fiscal[0]["label"]), period_short(fiscal[-1]["label"])
        return first if first == last else "%s to %s" % (first, last)

    def identity_line(self):
        """'PakEmis · public-data reconstruction of Pakistan's non-LULUCF emissions · 2015–16 to
        2023–24': the product's name, the scope in words, the reporting window from the dims; no
        version string (the web's sub-header)."""
        product = self.manifest.get("product") or {}
        return MIDDLE_DOT.join(p for p in (product.get("name") or "PakEmis", SCOPE_WORDS, self.period_span()) if p)

    def citation(self):
        """APA and BibTeX for the served release, from the manifest's product.cite_as, version,
        product.repository and git.describes_commit, the reporting window from the dims, the year
        and the author. A data DOI in the manifest is cited; while the slots are empty the strings
        carry no DOI and doi_note says so."""
        product = self.manifest.get("product") or {}
        git = self.manifest.get("git") or {}
        doi = str(((self.manifest.get("doi") or {}).get("data") or "")).strip()
        version = self.release.version
        commit = git.get("describes_commit") or ""
        repository = product.get("repository") or ""
        name = product.get("name") or "PakEmis"
        span = self.period_span()
        title = "%s: %s, %s" % (name, SCOPE_WORDS, span) if span else "%s: %s" % (name, SCOPE_WORDS)
        locator = "https://doi.org/%s" % doi if doi else repository
        apa = "%s (%s). %s (Version %s) [Data set]. %s" % (CITATION_AUTHOR, CITATION_YEAR, title, version, locator)
        if commit and not doi:
            apa += " (commit %s)" % commit[:12]
        note = ("commit %s" % commit[:12]) if commit else ""
        if not doi:
            note = "; ".join(n for n in (note, DOI_NOTE) if n)
        key = "%s%s%s" % (CITATION_AUTHOR.split(",")[0].lower(), CITATION_YEAR, name.lower())
        lines = ["@dataset{%s," % key,
                 "  author  = {%s}," % CITATION_AUTHOR,
                 "  title   = {%s}," % title.replace(EN_DASH, "--"),
                 "  year    = {%s}," % CITATION_YEAR,
                 "  version = {%s}," % version]
        if doi:
            lines.append("  doi     = {%s}," % doi)
        if repository:
            lines.append("  url     = {%s}," % repository)
        if note:
            lines.append("  note    = {%s}," % note)
        lines[-1] = lines[-1].rstrip(",")
        lines.append("}")
        return {"apa": apa, "bibtex": "\n".join(lines), "doi": doi, "doi_note": "" if doi else DOI_NOTE,
                "cite_as": product.get("cite_as") or "%s %s" % (name, version), "version": version,
                "author": CITATION_AUTHOR, "year": CITATION_YEAR, "title": title, "repository": repository,
                "commit": commit, "period_span": span}

    def labels(self):
        """Humanised labels for every id the dims carry, built server-side so the web client and
        the agent share one wording; the ids stay the keys."""
        c = self.release.contract
        baseline = c["release"].get("baseline_configuration", "")
        configurations = {}
        for r in self.release.dim("dim_configuration"):
            label, letter = configuration_label(r, baseline)
            configurations[r["configuration_id"]] = {
                "label": label, "letter": letter, "kind": r["kind"], "display_name": r["display_name"], "tooltip": r["note"],
                "queryable": r["queryable"] == "yes", "axis": r["axis"], "module": r["module"], "note": r["note"]}
        periods = {}
        for r in self.release.dim("dim_period"):
            periods[r["period_id"]] = dict(period_labels(r), start=r["period_start"], end=r["period_end"], basis=r["basis"],
                                           availability=r["availability"], is_reference=r["is_reference"] == "True", note=r["note"])
        months = {}
        for r in self.release.dim("dim_month"):
            months[r["month"]] = "%s %s" % (MONTH_ABBR[int(r["calendar_month"]) - 1], r["calendar_year"])
        # a limitation message that names a period by its id ("... for FY2023-24 only") is worded
        # here with the period's short label; the contract's own text stays verbatim in known_limitations
        id_to_short = sorted(((pid, e["short"]) for pid, e in periods.items()), key=lambda kv: -len(kv[0]))

        def worded(message):
            for pid, short in id_to_short:
                message = message.replace(pid, short)
            return message

        return {
            "configurations": configurations,
            "periods": periods,
            "months": months,
            "gwp": gwp_labels(c["release"].get("gwp_bases"), self.release.defaults.get("gwp_basis")),
            "lulucf": lulucf_labels(c["release"].get("lulucf")),
            "views": dict(VIEW_MEANINGS),
            "limitations": {l["id"]: worded(l["message"]) for l in c["known_limitations"]},
            "gases": {g: g.translate(SUBSCRIPT_DIGITS) for g in sorted(self.release.dim_values("dim_gas", "gas"))},
            "sectors": {m: ACRONYMS.get(m, humanise(m)) for m in sorted(self.release.dim_values("dim_stream", "module"))},
            "geographies": {r["geography_id"]: r["name"] for r in self.release.dim("dim_geography")},
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
                  # the schema and the docs live under the prefix too: behind the hosting rewrite only
                  # the prefix reaches the service; the root copies below keep a direct base working
                  openapi_url=API_PREFIX + "/openapi.json", docs_url=API_PREFIX + "/docs", redoc_url=None,
                  description="Deterministic query API over one verified PakEmis semantic release. Every response is a "
                              "pakemis_query Envelope with a replayable receipt; typed refusals are HTTP 422. "
                              "Routes live under %s; the same routes under %s are a deprecated alias for one release." % (API_PREFIX, LEGACY_PREFIX))
    # add_middleware wraps outermost-last: gzip innermost, then the headers, HEAD->GET, CORS on the outside
    app.add_middleware(GZipMiddleware, minimum_size=1024)          # skips text/event-stream and pre-encoded (tile) bodies
    app.add_middleware(ResponseHeadersMiddleware, prefix=API_PREFIX, legacy_prefix=LEGACY_PREFIX)
    app.add_middleware(HeadAsGetMiddleware)
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.allowed_origins), allow_methods=["*"], allow_headers=["*"],
                       expose_headers=["Content-Disposition", "X-PakEmis-Receipt", "X-PakEmis-Result-SHA256", "X-PakEmis-Release", "Deprecation", "Link"])

    @app.exception_handler(E.QueryError)
    async def _query_error(request: Request, exc: E.QueryError):
        return refusal(exc)

    api = APIRouter()
    api.include_router(ask_router)                                    # ask: POST {prefix}/ask (SSE)
    api.include_router(tiles_router)                                  # tiles: GET {prefix}/tiles/*
    api.include_router(products_router)                               # products: GET {prefix}/products, {prefix}/products/{name}.{ext}

    def svc() -> Service:
        return app.state.service

    @api.get("/release", tags=["release"])
    def release():
        return svc().release_summary()

    @api.post("/query/emissions", tags=["query"])
    def query_emissions(body: G.QueryEmissionsModel):
        return svc().run(G.to_request(body))

    @api.post("/query/compare", tags=["query"])
    def compare(body: G.CompareRequestModel):
        return svc().run(G.to_request(body))

    @api.post("/query/timeseries", tags=["query"])
    def timeseries(body: G.TimeseriesRequestModel):
        return svc().run(G.to_request(body))

    @api.post("/query/uncertainty", tags=["query"])
    def uncertainty(body: G.UncertaintyRequestModel):
        return svc().run(G.to_request(body))

    @api.post("/query/completeness", tags=["query"])
    def completeness(body: G.CompletenessRequestModel):
        return svc().run(G.to_request(body))

    @api.get("/evidence/{stream_id:path}", tags=["lineage"])
    def evidence(stream_id: str, category: str = "", module: str = ""):
        req = G.to_request(G.EvidenceRequestModel(source_stream_id="" if stream_id == "_" else stream_id, category=category, module=module))
        return svc().run(req)

    @api.get("/method/{method_or_category_or_sector}", tags=["lineage"])
    def method(method_or_category_or_sector: str):
        """get_method by method_id or category (the core's two filters), or every rule of one sector
        when the path names a sector of the registry (agriculture, power, ...)."""
        s = svc()
        x = method_or_category_or_sector
        ids = {r["method_id"] for r in s.method_rows}
        if x in ids:
            return s.run(G.to_request(G.MethodRequestModel(method_id=x)))
        if x in s.method_sectors:
            return s.method_by_sector(x)
        return s.run(G.to_request(G.MethodRequestModel(category=x)))

    @api.get("/claim", tags=["lineage"])
    def claim(request: Request, receipt: str = "", cell: int = 0, row_ids: str = ""):
        """The claim record behind one number: `?receipt=<r>&cell=<n>` replays the receipt and takes
        cell n; `?row_ids=<a,b,c>` names result rows directly. Every value is a string from a table of
        the release; sections with nothing to show are null and listed under `missing`."""
        from pakemis_api.tiles import request_origin
        try:
            return svc().claim(receipt=receipt, cell=cell, row_ids=row_ids, base_url=request_origin(request))
        except ClaimError as exc:
            raise HTTPException(exc.status, {"error": exc.error, "message": exc.message})

    @api.get("/transfers", tags=["lineage"])
    def transfers(ledger_id: str = "", configuration_id: str = ""):
        return svc().run(G.to_request(G.TransferRequestModel(ledger_id=ledger_id, configuration_id=configuration_id)))

    @api.get("/spatial/lineage/{shape_id}", tags=["spatial"])
    def spatial_lineage(shape_id: str, month: str = "", gas: str = "", configuration_id: str = ""):
        s = svc()
        provinces = {r["name"] for r in s.release.dim("dim_geography") if r["level"] == "adm1"}
        if shape_id in provinces:
            body = G.SpatialLineageRequestModel(province=shape_id, month=month, gas=gas, configuration_id=configuration_id)
        else:
            body = G.SpatialLineageRequestModel(shape_id=shape_id, month=month, gas=gas, configuration_id=configuration_id)
        return s.run(G.to_request(body))

    @api.post("/spatial/grid", tags=["spatial"])
    def grid_cell(body: G.GridCellRequestModel):
        return svc().run(G.to_request(body))

    @api.get("/receipt/{receipt}", tags=["receipt"])
    def receipt(receipt: str):
        return svc().replay(receipt)

    @api.get("/download/{receipt}.csv", tags=["download"], response_class=PlainTextResponse)
    def download_csv(receipt: str):
        s = svc()
        env = s.replay(receipt, decorate_cells=False)      # the CSV is the core's data product, no presentation columns
        text = download.result_csv(env)
        headers = {"Content-Disposition": 'attachment; filename="pakemis_%s.csv"' % receipt,
                   "X-PakEmis-Receipt": env["receipt"], "X-PakEmis-Result-SHA256": env["result_sha256"],
                   "X-PakEmis-Release": env["context"]["release"]}
        return Response(content=text, media_type="text/csv; charset=utf-8", headers=headers)

    @api.get("/download/{receipt}.receipt.json", tags=["download"])
    def download_receipt(receipt: str):
        s = svc()
        env = s.replay(receipt, decorate_cells=False)
        text = download.receipt_json(env, odbl_in_scope=s.odbl_in_scope(env))
        return Response(content=text, media_type="application/json",
                        headers={"Content-Disposition": 'attachment; filename="RECEIPT_%s.json"' % receipt})

    @api.get("/healthz", include_in_schema=False)
    def healthz():
        s = svc()
        return {"ok": True, "release": s.release.release_id, "receipts": len(s.receipts)}

    app.include_router(api, prefix=API_PREFIX)                           # the canonical paths (the schema)
    app.include_router(api, prefix=LEGACY_PREFIX, include_in_schema=False)   # the alias, `Deprecation: true` via the middleware
    app.add_api_route("/healthz", healthz, include_in_schema=False)      # the container's health check, outside both prefixes

    async def openapi_root():
        return JSONResponse(app.openapi())

    async def docs_root():
        return get_swagger_ui_html(openapi_url=app.openapi_url, title=app.title + " - Swagger UI")

    app.add_api_route("/openapi.json", openapi_root, include_in_schema=False)   # the root copies: `make openapi`, a direct base
    app.add_api_route("/docs", docs_root, include_in_schema=False)

    return app


app = create_app() if os.environ.get("PAKEMIS_API_LAZY") != "1" else None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("pakemis_api.app:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), workers=1)
