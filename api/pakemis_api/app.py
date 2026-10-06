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
import dataclasses
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
from pakemis_api.assets import ReleaseAssets
from pakemis_api.ask.router import install_ask, router as ask_router
from pakemis_api.claim import ClaimError, ClaimStore
from pakemis_api.auth import AuthGateMiddleware
from pakemis_api.middleware import HeadAsGetMiddleware, ResponseHeadersMiddleware
from pakemis_api.presentation import PRESENTATION_ROUNDING, decorate
from pakemis_api.unallocated import OwnUnallocated
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
# WHICH TABLES CARRY A COLUMN, DERIVED FROM THE CONTRACT RATHER THAN LISTED HERE.
#
# This was a hardcoded four-tuple of greenhouse-gas tables: fact_annual, fact_monthly,
# fact_adm1_month, fact_adm2_month. The release carries 42 facts, including ten air facts and the
# two GHG *_year tables, and none of those were in it. So the "available at ..." clause was
# computed from four tables and was simply false for anything else - it told a reader that
# `period_id` lives at national grain only, when fact_adm2_year, fact_air_adm2_year and seven more
# carry it, and it did so while REJECTING that same column. A list maintained by hand beside a
# contract that already knows the answer is a list that drifts.
#
# A table's grain is read off its own spatial key columns, for the same reason: nothing has to be
# kept in step.
SPATIAL_KEYS = (("adm2", ("shape_id", "adm2_ids")), ("adm1", ("province",)))
# A TABLE YOU CAN GROUP EMISSIONS BY IS ONE THAT HOLDS EMISSIONS. fact_evidence and
# fact_uncertainty both carry `module`, and naming them as the place to group by module would be
# true and useless - neither holds a quantity to group. `fact_` was the wrong predicate; carrying a
# measure is the right one, and it is a property of the contract rather than a list of names.
MEASURE_PREFIXES = ("co2e_", "emissions_")
# how many carrier tables to name before the message stops being readable
CARRIERS_SHOWN = 4
BINDER_COLUMN = re.compile(r'Referenced column "([^"]+)"')
# the query core applies `categories` and `ipcc_codes` at national grain only (engine._filters):
# at adm1/adm2 grain a category filter would silently answer with every row of the sector, so
# the service refuses it before the engine runs (a fix in the core is a named follow-up)
CATEGORY_FILTER_KEYS = ("categories", "ipcc_codes")
CATEGORY_GRAIN_MESSAGE = "category filters are national-grain only in this release"
CITATION_AUTHOR = "Ahmad, R."
CITATION_YEAR = "2026"
DOI_NOTE = "DOI to be inserted at release freeze"
PUBLISHER = "Pakistan Air Quality Initiative"
SCOPE_WORDS = "public-data reconstruction of Pakistan's emissions, excluding land use and forestry"
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
# 2026-09-11: the industry MODULE is IPCC 1.A.2 direct industrial fuels only (the official HDIP coal
# allocation, OGRA industrial gas, OCAC industry liquids) - not Pakistan's industrial sector. Its
# label says so on every surface: the FULL label where there is room (bar tooltip, explainer eyebrow,
# tables, Ask), the SHORT one mid-sentence and on a chart axis. Captive generation (1.A.2, computed
# by the power module) and cement process CO2 (2.A.1) belong to the ECONOMIC sector 'industrial',
# served as a second grouping of the same atoms (group_by economic_sector; engine.ECONOMIC_SECTOR_SQL)
# and labelled "covered direct industrial sources" until every screened industrial category
# back-casts to FY2015-16. Words only; no number moves.
SECTOR_LABEL_OVERRIDES = {"industry": "Industrial fuel use \u2014 covered sources"}
SECTOR_SHORT_LABELS = {"industry": "Industrial fuel use"}
ECONOMIC_SECTOR_LABELS = {"industrial": "Industrial (covered direct sources)"}
ECONOMIC_SECTOR_SHORT_LABELS = {"industrial": "Industrial"}
# 2026-09-12 (rc53): the REPORTING-SECTOR axis. The release now declares, per stream, the sector
# IPCC 2006 files it under, beside the module that computed it (data/stream_reporting_sector.csv).
# One stream moves: captive gas self-generation is 1.A.2 autoproducer generation, computed in the
# power module and reported under industry. The axis is additive - the power bar loses exactly what
# the industry bar gains - so these labels name a BOUNDARY, not a bigger number, and the industry
# label keeps its covered-sources caveat because the boundary is still only the priced part.
REPORTING_SECTOR_LABELS = {
    "industry": "Industrial fuel use incl. captive generation \u2014 covered sources",
    "power": "Power (grid generation)",
}
REPORTING_SECTOR_SHORT_LABELS = {"industry": "Industrial fuel use", "power": "Power"}


def reporting_sector_modules(release):
    """{reporting_sector: [modules that compute it]}, read from the stream dimension.

    The axis moves a stream's REPORTING home without moving where it was COMPUTED, and a reader of
    a sector table is owed both: "industrial fuel use" includes captive generation, and captive
    generation is computed in the power module. Derived rather than hard-coded so a future
    declaration in data/stream_reporting_sector.csv reaches the surfaces without an API edit."""
    pairs = {}
    for row in release.dim("dim_stream"):
        pairs.setdefault(row["reporting_sector"], set()).add(row["module"])
    return {k: sorted(v) for k, v in sorted(pairs.items())}
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
            # verify.verify above already checked every CSV AND canonical Parquet twin.
            # Reuse that completed audit instead of re-reading the entire payload.
            self.release = Release.open(settings.semantic_dir, verify=False, manifest_path=settings.manifest_path)
            self.release.verified = dict(self.verification["semantic_tables"])
        except E.IdentityError as exc:
            log.error("release %s refused by pakemis_query: %s", settings.version, exc)
            raise RuntimeError("release %s refused: %s" % (settings.version, exc)) from exc
        self.engine = Engine(self.release, threads=1)
        self.own_unallocated = OwnUnallocated(self.engine)
        # one DuckDB connection per process, used by one request at a time: FastAPI runs sync
        # handlers on a threadpool, and a DuckDB connection is not safe under concurrent use
        self._lock = threading.Lock()
        self.assets = ReleaseAssets(self.release.contract, settings.release_dir)
        methods = self.assets.bound("method_registry")
        self.method_rows = self.assets.rows(methods) if methods else self._read_methods(settings.method_registry)
        self.cube_paths = settings.cube_paths
        self.receipts = ReceiptStore(settings.receipt_store)
        self.odbl_modules = {r["module"] for r in self.engine._fetch(
            "SELECT DISTINCT module FROM fact_evidence WHERE " + " OR ".join(
                "allocation_surface LIKE '%%%s%%'" % m for m in ODBL_SURFACE_MARKERS))}
        with open(settings.manifest_path, encoding="utf-8") as handle:
            self.manifest = json.load(handle)
        self.manifest_digests = {p["path"]: p["sha256"] for p in self.manifest.get("products", []) if p.get("path") and p.get("sha256")}
        with open(os.path.join(settings.release_dir, "FETCH.json"), encoding="utf-8") as handle:
            self.fetch = json.load(handle)
        # the downloadable products: an allowlist built from the contract, the manifest and the verification
        self.products = ProductCatalog(self.release, self.manifest, self.verification, settings.release_dir, self.fetch.get("files") or {})
        # the registry's sector column: /method/{sector} pre-filters the rows by it
        self.method_sectors = sorted({r["sector"] for r in self.method_rows if r.get("sector")})
        # the claim record's joins: the registries under data/registries and the fact tables in a
        # private read-only DuckDB session (never the engine's connection)
        self.claims = ClaimStore(self.release, settings.registries_dir, self.fetch.get("files") or {}, self.method_rows, self.labels(), settings.manifest_path, assets=self.assets)
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
        request, defaulted = self.air_period_default(request)
        with self._lock:
            try:
                env = self._run(request, method_rows)
            except (duckdb.BinderException, duckdb.CatalogException) as exc:
                raise self.grain_refusal(exc, request) from exc
        if defaulted:
            # said in the envelope, beside the defaults the core applied itself (the core rewrites
            # the request's own defaults_applied, so it cannot be carried in on the request)
            context = env.get("context") or {}
            context["defaults_applied"] = list(context.get("defaults_applied") or []) + ["periods"]
            env["context"] = context
        # the unallocated block for the periods, gases and view ASKED (unallocated.py): the core
        # attaches the reference year's, whole, to every spatial answer. Outside the result digest,
        # so the receipt stands; done before the downloads' early return so a receipt file for
        # another year does not carry the reference year's block either.
        env = self.own_unallocated.apply(env)
        self.product_digests(env)
        if not decorate_cells:
            return env
        return self.spatial_fields.decorate(decorate(env))

    def product_digests(self, env):
        """A provenance entry for a release PRODUCT (a grid cube) carries the product's digest.

        The core looks a product's digest up in the semantic contract, whose product list holds no
        NetCDF file, so a grid-cell answer named its cube with `sha256: null` - the one provenance
        entry in the API a reader could not check. The release manifest hashes every cube, and this
        service already publishes those digests under /release; the same value is written here.
        Only a null is filled, and only from the manifest: a digest the core did find stands."""
        tables = (env.get("provenance") or {}).get("tables")
        if not isinstance(tables, list):
            return
        for entry in tables:
            if isinstance(entry, dict) and entry.get("sha256") is None and entry.get("path") in self.manifest_digests:
                entry["sha256"] = self.manifest_digests[entry["path"]]

    def air_period_default(self, request):
        """An air request that names neither a period nor calendar years is answered for the
        reference fiscal period - and says so in the envelope's `defaults_applied`.

        THE CORE HAS NO DEFAULT HERE, AND WHAT IT DOES INSTEAD IS CHOOSE A DIFFERENT PRODUCT.
        `engine.query_air` routes on the presence of `periods`: with it, the nine-year
        covered-sources panel (fact_air_panel and its province and district marginals), in which
        grid power is deliberately absent and travels beside the result as a screening pair;
        without it, the pre-rc48 single-year layers (fact_air_annual, fact_air_adm1/2), in which
        power's UNCONTROLLED SCREENING BOUND is an ordinary row. The envelope does not say which
        answered - `context.periods` is simply empty - and this service then computes
        share_pct_short over whatever cells came back. So a caller who left the period out was
        told power is 85 % of national SO2, on a number the engine's own documentation calls
        "not an estimate" and forbids summing with the covered total. The web's data page did
        exactly that for a month.

        The fall-through is the core's and the core is vendored, so it is closed here, at the one
        chokepoint both the HTTP route and the assistant's tool pass through. A request for the
        calendar-year agriculture history (`years`) is untouched; the single-year layers remain
        what they are in the release's downloads. To be removed when the core defaults for itself.
        Returns the request and whether a period was supplied for it."""
        if type(request).__name__ != "QueryAir" or request.periods or request.years:
            return request, False
        # A SERIES IS NOT DEFAULTED TO ONE YEAR. Grouping by period (or by calendar year) with no
        # periods named is a request for a trend; the core refuses it and says how to ask ("name
        # the fiscal periods"). Supplying the reference year here would answer a question about
        # nine years with one of them and no refusal to say so.
        if {"period_id", "year"} & set(request.group_by or ()):
            return request, False
        reference = self.release.defaults.get("period_id")
        if not reference:
            return request, False
        return dataclasses.replace(request, periods=(reference,)), True

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

    @staticmethod
    def _table_grain(columns):
        """The grain a fact table is cut at, from the spatial keys it carries."""
        for grain, keys in SPATIAL_KEYS:
            if any(k in columns for k in keys):
                return grain
        return "national"

    def _carriers(self, key):
        """[(table, grain)] for every FACT in the release that carries this column.

        Only tables that hold a measure. dim_geography carries shape_id and fact_uncertainty carries
        module, but naming either here would answer "where can I group emissions by this?" with a
        table that holds no emissions - a true sentence that sends the reader nowhere.
        """
        out = []
        for table, meta in sorted((self.release.tables or {}).items()):
            columns = (meta or {}).get("columns") or ()
            if key not in columns or not any(c.startswith(MEASURE_PREFIXES) for c in columns):
                continue
            out.append((table, self._table_grain(columns)))
        return out

    @staticmethod
    def _name_tables(tables):
        shown = ", ".join(tables[:CARRIERS_SHOWN])
        return shown + (" and %d more" % (len(tables) - CARRIERS_SHOWN) if len(tables) > CARRIERS_SHOWN else "")

    @staticmethod
    def _asked_grain(request):
        """The grain actually asked for, looking INSIDE a compare or timeseries wrapper.

        `geography_level` was read off the top-level request. CompareRequest and TimeseriesRequest
        do not have that field, so every wrapped adm1/adm2 query reported itself as national - and
        a refusal could then say a column was missing at national grain and available at national
        grain in one sentence. That tautology is what a reader saw.
        """
        for q in [request] + [getattr(request, a, None) for a in ("query", "left", "right")]:
            level = getattr(q, "geography_level", "") if q is not None else ""
            if level:
                return level, getattr(q, "months", None)
        return "national", getattr(request, "months", None)

    def grain_refusal(self, exc, request):
        """A DuckDB binder or catalog error under a request is the release having no column for a
        key in the table this request reads: the core's GrainUnavailable, naming the key, the grain
        asked for, and the tables that DO carry it (read from the contract, never from a list kept
        alongside it)."""
        level, months = self._asked_grain(request)
        asked = "%s grain%s" % (level, " with months set" if months else "")
        match = BINDER_COLUMN.search(str(exc))
        if not match:
            first = str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__
            return E.GrainUnavailable("the release cannot answer this request at %s: %s" % (asked, first), "grain_unavailable", grain=level)
        key = match.group(1)
        carriers = self._carriers(key)
        # SAME-GRAIN CARRIERS COME FIRST, and this ordering is the fix for the screenshot. Asking
        # for `period_id` by district was refused with "available at national grain" - but
        # fact_air_adm2_year carries period_id AT adm2. The column was not missing from the grain,
        # it was missing from the TABLE this request reads, and the remedy is a different query
        # (the air family), not a coarser geography. Reporting the other grains first threw that
        # away and sent the reader to the one place that could not answer the question they asked.
        same = [t for t, g in carriers if g == level]
        if same:
            # HOW to reach the table, not just its name. The old hardcoded tuple carried a written
            # note, "with months set", for exactly this case - fact_monthly holds `month` at
            # national grain and the engine reads it only when the request sets `months`. The note
            # is derivable: if every table that could answer is a monthly one and this request set
            # no months, setting them IS the remedy.
            how = ""
            if not months and all("month" in ((self.release.tables.get(t) or {}).get("columns") or ())
                                  for t in same):
                how = ", which this request reaches by setting `months`"
            return E.GrainUnavailable(
                "%r is carried at %s by %s%s, but not by the table this request reads; ask one of "
                "those instead of changing grain" % (key, asked, self._name_tables(same), how),
                "grain_unavailable", key=key, grain=level, available_at=[level], carried_by=same)
        # NEVER offer the grain that was just refused. The request failed in a table at this grain,
        # so naming that grain as the remedy is the contradiction this method used to print.
        elsewhere = [(t, g) for t, g in carriers if g != level]
        if elsewhere:
            available = "%s grain (%s)" % ("/".join(sorted({g for _, g in elsewhere})),
                                           self._name_tables([t for t, _ in elsewhere]))
        else:
            available = "no fact table of this release"
        return E.GrainUnavailable("%r is not a column the release carries at %s; available at %s" % (key, asked, available),
                                  "grain_unavailable", key=key, grain=level,
                                  available_at=sorted({g for _, g in elsewhere}),
                                  carried_by=[t for t, _ in elsewhere])

    def _run(self, request, method_rows=None):
        name = type(request).__name__
        if name == "QueryEmissions":
            env = self.engine.query_emissions(request)
        elif name == "QueryAir":
            env = self.engine.query_air(request)
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
            # cube_paths also holds the annual cube under the core's own key, which is not a
            # configuration: naming it as one is still refused, never read as the monthly cube
            if request.configuration_id and request.configuration_id not in self.settings.cube_configurations:
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
        # THE AXIS A SECTOR SELECTOR SHOULD OFFER (rc54). The two vocabularies are the same ten
        # ids, so a client that enumerated the module list and sent the choice on the reporting
        # field would look right and be right by coincidence. Publishing both means a surface can
        # say which axis it is on, and a future divergent id cannot pass unnoticed.
        dims["reporting_sectors"] = sorted(self.release.dim_values("dim_stream", "reporting_sector"))
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
        """'Pakistan Air Quality Initiative · public-data reconstruction of Pakistan's emissions,
        excluding land use and forestry · 2015–16 to 2023–24': the publisher, the scope in words
        and the reporting window from the dims; no version string and not the dataset's short
        name (the web prints this as its sub-header, where the product is the inventory and the
        brand is the initiative; the dataset's own name lives in the citation)."""
        return MIDDLE_DOT.join(p for p in (PUBLISHER, SCOPE_WORDS, self.period_span()) if p)

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

    # The release's ADM1 frame reports five units, the fifth a residual the payload names "Other":
    # the territories its provincial sources do not separate. "Other" tells a reader nothing, so
    # the label names them. The membership is the payload's own — the residual's ADM2 children are
    # the AJK, GB and ICT rows (RESIDUAL_FAMILIES, their id prefixes) — and a test asserts it, so a
    # release that changes the membership fails rather than mislabels.
    RESIDUAL_LABEL = "ICT, AJK & Gilgit-Baltistan (combined)"
    RESIDUAL_FAMILIES = ("ajk", "gb", "ict")

    def residual_adm1_id(self):
        """The ADM1 row the release draws no polygon for, if it has one."""
        for r in self.release.dim("dim_geography"):
            if (r.get("level") or "").lower() == "adm1" and r.get("has_polygon") == "no":
                return r["geography_id"]
        return None

    def geography_labels(self):
        """Every geography id worded: the payload's own names, except the residual ADM1 unit and
        the residual ADM2 row, which are named by their members rather than "Other"."""
        residual = self.residual_adm1_id()
        out = {}
        for r in self.release.dim("dim_geography"):
            gid, name = r["geography_id"], r["name"]
            if gid == residual or r.get("unit_kind") == "residual":
                name = self.RESIDUAL_LABEL
            out[gid] = name
        return out

    def word(self, message):
        """A message that names a period or a configuration by its id, worded with the release's
        labels ("FY2023-24" -> "2023\u201324", "S_2023_24" -> "the survey-based estimate"). The
        contract's own text stays verbatim beside it; this is a presentation field."""
        labels = self.labels()
        pairs = [(pid, e["short"]) for pid, e in labels["periods"].items()]
        for cid, e in labels["configurations"].items():
            if e.get("label"):
                pairs.append((cid, "the %s" % e["label"].lower()))
                if e.get("letter"):
                    pairs.append(("configuration %s" % e["letter"], "the %s" % e["label"].lower()))
        for ident, words in sorted(pairs, key=lambda kv: -len(kv[0])):
            message = message.replace(ident, words)
        return message

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
            "sectors": {m: SECTOR_LABEL_OVERRIDES.get(m, ACRONYMS.get(m, humanise(m))) for m in sorted(self.release.dim_values("dim_stream", "module"))},
            # the mid-sentence / axis forms; a sector absent here reads its full label
            "sectors_short": dict(SECTOR_SHORT_LABELS),
            # the economic-sector view's own ids (every other economic sector IS a module and reads its label)
            "economic_sectors": dict(ECONOMIC_SECTOR_LABELS),
            "economic_sectors_short": dict(ECONOMIC_SECTOR_SHORT_LABELS),
            "reporting_sectors": {r: REPORTING_SECTOR_LABELS.get(r, ACRONYMS.get(r, humanise(r)))
                                  for r in sorted(self.release.dim_values("dim_stream", "reporting_sector"))},
            "reporting_sectors_short": dict(REPORTING_SECTOR_SHORT_LABELS),
            # which MODULES compute each reporting sector, so a surface can say where a number was
            # computed without a second request: {"industry": ["industry", "power"], ...}
            "reporting_sector_modules": reporting_sector_modules(self.release),
            "geographies": self.geography_labels(),
        }


def refusal(exc, service=None):
    body = exc.to_dict()
    body["error_class"] = type(exc).__name__
    if service is not None:
        body["message_worded"] = service.word(body["message"])
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
    # the sign-in gate, when the deployment asks for one (PAKEMIS_REQUIRE_AUTH): inside the header
    # and CORS layers, so its 401 carries both, and outside nothing else - no route runs unsigned
    policy = settings.auth_policy
    if policy.on:
        app.add_middleware(AuthGateMiddleware, policy=policy)
    app.add_middleware(ResponseHeadersMiddleware, prefix=API_PREFIX, legacy_prefix=LEGACY_PREFIX)
    app.add_middleware(HeadAsGetMiddleware)
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.allowed_origins), allow_methods=["*"], allow_headers=["*"],
                       expose_headers=["Content-Disposition", "X-PakEmis-Receipt", "X-PakEmis-Result-SHA256", "X-PakEmis-Release", "Deprecation", "Link"])

    @app.exception_handler(E.QueryError)
    async def _query_error(request: Request, exc: E.QueryError):
        return refusal(exc, getattr(request.app.state, "service", None))

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

    @api.post("/query/air", tags=["query"])
    def air(body: G.QueryAirModel):
        """Air-pollutant EMISSIONS: native kilotonnes of a named pollutant for a fiscal period,
        never CO2e and never a concentration. The covered-sources panel: the sectors the release
        estimates, nationally and by province and district for the nine fiscal years, with grid
        power kept out of every total and returned beside it as a screening pair (`completeness`).
        `years` asks for agriculture's 1990-2024 calendar history instead. A request that names
        neither is answered for the reference fiscal period (see `context.defaults_applied`)."""
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


def _log_to_stderr():
    """uvicorn configures its own loggers and no others, so every `log.info` in this package went
    nowhere on the running service: the root logger has no handler and Python's last resort prints
    warnings only. The served process (never a test or a script, which import lazily) gets one."""
    package = logging.getLogger("pakemis_api")
    if not package.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
        package.addHandler(handler)
        package.propagate = False
    package.setLevel(logging.INFO)


if os.environ.get("PAKEMIS_API_LAZY") != "1":
    _log_to_stderr()
app = create_app() if os.environ.get("PAKEMIS_API_LAZY") != "1" else None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("pakemis_api.app:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), workers=1)
