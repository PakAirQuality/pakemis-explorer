"""GET /claim: the claim record behind one number.

A claim record is the structured evidence for one cell of one envelope (`?receipt=&cell=n`, the
receipt replayed through the service) or for a set of result rows (`?row_ids=a,b,c`): the
breadcrumb (sector -> category -> gas -> place -> period), the reported estimate, the calculation
that produced it, and then every joinable fact of the release about the rows summed: the streams'
activity descriptors (dim_stream, fact_annual), the emission factors behind them
(data/registries/emission_factors.csv joined on dim_stream.factor_parameter_ids with the `ef:`
prefix stripped, national_uncertainty_parameters.csv by dependency_group, parameters.csv), the
method rules (data/method_registry.csv), the monthly allocation basis (fact_evidence,
temporal_profiles.csv, fact_monthly's closure basis), the spatial allocation basis (fact_evidence,
stream_geometry.csv, stream_grid_proxy.csv, geometry_sets.csv, release_heights.csv,
pakemis_grid_fallbacks.csv with allowed_grid_fallbacks.csv), the uncertainty rows
(fact_uncertainty, every resolution of the category), the source documents (source_documents.csv,
pakemis_source_register.csv, public_documents.csv), the validation rows (the validation catalogue,
the sector scorecard, benchmarks.csv), the limitations and the completeness ledger
(fact_completeness, data_gaps.csv), the exact rows, and a provenance list naming every file read
with its digest.

Everything is a string straight from a table: the record performs no arithmetic (the only
renderings are the presentation layer's two-decimal `_short` twins beside an exact). The joins run
in this module's own read-only DuckDB session over the fact tables (loaded as text, so a value
leaves exactly as the CSV carries it) and Python indexes over the registries; the query core is not
touched (the `get_method` pattern). A section with nothing to show is `null` and named in
`missing` with the sentence "not carried by this release".

The same session serves the map's per-cell spatial fields (spatial_fields.py).
"""
import csv
import os
import re
import threading

import duckdb

from pakemis_api.presentation import round_value
from pakemis_api.settings import API_PREFIX

NOT_CARRIED = "not carried by this release"
ROW_ID = re.compile(r"^[0-9a-f]{24}$")
FACT_TABLES = ("fact_annual", "fact_monthly", "fact_adm1_month", "fact_adm2_month", "fact_annual_calendar")
RECORDS_CAP = 100
SPLIT = ";"

# registry name -> file under data/registries/ (the fetch's basenames)
REGISTRY_FILES = {
    "emission_factors": "emission_factors.csv",
    "parameters": "parameters.csv",
    "uncertainty_parameters": "national_uncertainty_parameters.csv",
    "source_documents": "source_documents.csv",
    "source_register": "pakemis_source_register.csv",
    "public_documents": "public_documents.csv",
    "temporal_profiles": "temporal_profiles.csv",
    "temporal_profile_weights": "pakemis_temporal_profiles.csv",
    "stream_grid_proxy": "stream_grid_proxy.csv",
    "stream_geometry": "stream_geometry.csv",
    "allowed_grid_fallbacks": "allowed_grid_fallbacks.csv",
    "geometry_sets": "geometry_sets.csv",
    "release_heights": "release_heights.csv",
    "grid_fallbacks": "pakemis_grid_fallbacks.csv",
    "validation_catalog": "pakemis_validation_catalog.csv",
    "validation_catalog_declared": "validation_catalog.csv",
    "validation_scorecard": "pakemis_validation_scorecard.csv",
    "validation_sector_scorecard": "pakemis_validation_sector_scorecard.csv",
    "benchmarks": "benchmarks.csv",
    "data_gaps": "data_gaps.csv",
    "source_streams": "pakemis_source_streams.csv",
}
LEVEL_WORDS = {"sector": "All sectors", "category": "All categories", "gas": "All gases", "geography": "Pakistan", "period": "All periods"}


def read_rows(path):
    """A registry's rows as dicts of strings; `#` comment lines (the registries' headers) skipped."""
    with open(path, newline="", encoding="utf-8") as handle:
        lines = [l for l in handle if not l.startswith("#")]
    return list(csv.DictReader(lines))


def split_ids(text):
    return [t for t in (text or "").split(SPLIT) if t]


def strip_prefix(token, prefix):
    return token[len(prefix):] if token.startswith(prefix) else token


def single(values):
    """The one distinct value, else None."""
    distinct = sorted({v for v in values if v not in ("", None)})
    return distinct[0] if len(distinct) == 1 else None


def quoted(ids):
    return ", ".join("'%s'" % i for i in ids)


class ClaimError(Exception):
    def __init__(self, status, error, message):
        super().__init__(message)
        self.status, self.error, self.message = status, error, message


class ClaimStore:
    """Built once at startup: the registries under data/registries/ indexed in Python, the fact
    tables in a private read-only DuckDB session as text, the dims from the release."""

    def __init__(self, release, registries_dir, fetch_files, method_rows, labels, manifest_path):
        self.release = release
        self.labels = labels
        self.method_rows = method_rows
        self.manifest_path = manifest_path
        self._lock = threading.Lock()
        self.registries = {}
        self.digests = {}
        for name, filename in REGISTRY_FILES.items():
            rel = "data/registries/%s" % filename
            path = os.path.join(registries_dir, filename)
            if not os.path.exists(path):
                continue
            self.registries[name] = read_rows(path)
            rec = fetch_files.get(rel) or {}
            self.digests[name] = {"path": rel, "sha256": rec.get("sha256"), "identity": rec.get("identity"), "source_path": rec.get("source_path", rel)}
        method_rec = fetch_files.get("data/method_registry.csv") or {}
        self.digests["method_registry"] = {"path": "data/method_registry.csv", "sha256": method_rec.get("sha256"), "identity": "fetch", "source_path": "data/method_registry.csv"}
        self._index()
        self.con = duckdb.connect(database=":memory:")
        self.con.execute("SET threads TO 1")
        for name in FACT_TABLES + ("fact_evidence", "fact_uncertainty", "fact_completeness", "fact_completeness_mass"):
            path = os.path.join(release.directory, os.path.basename(release.tables[name]["path"]))
            self.con.execute("CREATE TABLE %s AS SELECT * FROM read_csv(?, header=true, all_varchar=true)" % name, [path])
        self.stream_by_id = {r["source_stream_id"]: r for r in release.dim("dim_stream")}
        self.category_by_code = {r["ipcc_code"]: r for r in release.dim("dim_category")}
        self.geo_by_id = {r["geography_id"]: r for r in release.dim("dim_geography")}
        self.geo_by_shape = {r["shape_id"]: r for r in release.dim("dim_geography") if r["shape_id"]}
        self.period_by_month = {r["month"]: r["period_id"] for r in release.dim("dim_month")}
        self.class_definitions = {r["class_id"]: r["definition"] for r in release.dim("dim_evidence_class")}
        self.evidence_by_stream = {r["source_stream_id"]: r for r in self._fetch("SELECT * FROM fact_evidence")}
        self.limitations = release.limitations

    # --- indexes over the registries -------------------------------------------------------

    def rows(self, name):
        return self.registries.get(name) or []

    def _index(self):
        self.ef_by_id = {r["ef_id"]: r for r in self.rows("emission_factors")}
        self.param_by_id = {r["param"]: r for r in self.rows("parameters")}
        self.uparams_by_group = {}
        self.uparams_by_id = {}
        for r in self.rows("uncertainty_parameters"):
            self.uparams_by_group.setdefault(r["dependency_group"], []).append(r)
            self.uparams_by_id.setdefault(r["parameter_id"], []).append(r)
        self.source_by_file = {r["data_file"]: r for r in self.rows("source_documents")}
        self.register_by_file = {r["data_file"]: r for r in self.rows("source_register")}
        self.profile_by_id = {r["profile_id"]: r for r in self.rows("temporal_profiles")}
        self.weights_by_stream_year = {}
        for r in self.rows("temporal_profile_weights"):
            self.weights_by_stream_year.setdefault((r["component_id"], r["fiscal_year"]), []).append(r)
        self.geometry_by_id = {r["geometry_id"]: r for r in self.rows("geometry_sets")}
        self.height_by_key = {(r["module"], r["category"]): r for r in self.rows("release_heights")}
        self.fallbacks_by_stream = {}
        for r in self.rows("grid_fallbacks"):
            self.fallbacks_by_stream.setdefault(r["source_stream_id"], []).append(r)
        self.allowed_by_key = {(r["scope"], r["declared"], r["used"]): r for r in self.rows("allowed_grid_fallbacks")}
        self.gap_by_id = {r["gap_id"]: r for r in self.rows("data_gaps")}
        self.method_by_id = {}
        for r in self.method_rows:
            self.method_by_id.setdefault(r["method_id"], []).append(r)

    def _fetch(self, sql):
        """Rows as dicts of strings; an empty CSV field (DuckDB's NULL) comes back as the empty
        string the CSV carries."""
        with self._lock:
            cur = self.con.execute(sql)
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, ("" if v is None else v for v in row))) for row in cur.fetchall()]

    # --- the rows ----------------------------------------------------------------------------

    def find_rows(self, ids, table=None):
        """The fact rows for `ids` (validated 24-hex), in the named table or the first fact table
        that carries them all."""
        bad = [i for i in ids if not ROW_ID.match(i)]
        if bad:
            raise ClaimError(422, "invalid_row_id", "result row ids are 24 hex characters; not %r" % bad[0])
        for name in ([table] if table in FACT_TABLES else FACT_TABLES):
            rows = self._fetch("SELECT * FROM %s WHERE result_row_id IN (%s)" % (name, quoted(ids)))
            if rows and (len(rows) == len(ids) or table):
                by_id = {r["result_row_id"]: r for r in rows}
                missing = [i for i in ids if i not in by_id]
                if missing:
                    raise ClaimError(404, "unknown_rows", "%d of %d row ids are not rows of %s (first: %s)" % (len(missing), len(ids), name, missing[0]))
                return name, [by_id[i] for i in ids]
        raise ClaimError(404, "unknown_rows", "no fact table of this release carries these %d row ids together" % len(ids))

    # --- the record --------------------------------------------------------------------------

    def record(self, env=None, cell=None, row_ids=None, base_url=""):
        touched = set()
        if env is not None:
            values = env.get("values") or []
            if cell < 0 or cell >= len(values):
                raise ClaimError(422, "unknown_cell", "cell %d is not one of the %d cells of receipt %s" % (cell, len(values), env.get("receipt")))
            value = values[cell]
            ids = list(value.get("result_row_ids") or [])
            if not ids:
                raise ClaimError(422, "no_rows", "cell %d of receipt %s sums no rows (%s)" % (cell, env.get("receipt"), value.get("formula")))
            table, rows = self.find_rows(ids, (env.get("calculation") or {}).get("table"))
        else:
            value = None
            ids = list(row_ids)
            table, rows = self.find_rows(ids)
        touched.add(table)
        scope = self._scope(table, rows, env, value)
        touched.add("dim_stream")
        record = {"selector": {"receipt": env.get("receipt") if env else None, "cell": cell if env else None, "row_ids": ids if env is None else None},
                  "breadcrumb": self._breadcrumb(scope, env, value, touched)}
        missing = []

        def section(name, content, reason=NOT_CARRIED):
            empty = content is None or content == [] or content == {}
            record[name] = None if empty else content
            if empty:
                missing.append({"section": name, "message": reason})

        section("reported", self._reported(env, value, scope), "no receipt and cell were given; the rows carry their own values under rows.records")
        section("calculation", self._calculation(env, value, table, rows, ids))
        section("activity", self._activity(scope, table, rows, touched))
        section("emission_factors", self._emission_factors(scope, touched))
        section("method", self._method(scope, touched))
        section("monthly_basis", self._monthly_basis(scope, table, rows, touched))
        section("spatial_basis", self._spatial_basis(scope, touched))
        section("uncertainty", self._uncertainty(scope, touched))
        section("sources", self._sources(scope, touched))
        section("validation", self._validation(scope, touched))
        section("limitations", self._limitations(scope, env, touched))
        section("completeness", self._completeness(scope, touched))
        record["rows"] = self._rows(table, rows, ids, env, base_url)
        record["class_definitions"] = self._class_definitions(scope)
        record["provenance"] = self._provenance(touched)
        if record.get("sources"):
            missing.append({"section": "sources.pages", "message": "%s: no register carries page numbers; pages appear only as prose in the notes" % NOT_CARRIED})
        record["missing"] = missing
        record["release"] = {"release": self.release.release_id, "version": self.release.version, "commit": self.release.commit}
        return record

    # --- scope: what the rows are about -------------------------------------------------------

    def _scope(self, table, rows, env, value):
        col = lambda name: [r.get(name, "") for r in rows]  # noqa: E731
        modules = sorted({m for m in col("sector_id") + col("module") if m})
        gases = sorted({g for g in col("gas") if g})
        stream_ids = sorted({s for s in col("source_stream_id") + col("component_id") if s})
        if stream_ids:
            stream_basis = "the rows' own source_stream_id / component_id"
        else:
            # fact_adm2_month and fact_annual_calendar carry no stream column: the streams are the
            # modules' streams (narrowed to the rows' gases when the table carries one)
            stream_ids = sorted(s for s, r in self.stream_by_id.items()
                                if r["module"] in modules and (not gases or r["gas"] in gases))
            stream_basis = "the module x gas streams of dim_stream (%s carries no stream column)" % table
        streams = [self.stream_by_id[s] for s in stream_ids if s in self.stream_by_id]
        categories = sorted({c for c in col("category") + col("ipcc_category") if c} or {s["ipcc_category"] for s in streams})
        codes = sorted({c for c in col("ipcc_code") if c} or {s["ipcc_code"] for s in streams})
        periods = sorted({p for p in col("period_id") if p} or {self.period_by_month.get(m, "") for m in col("month") if m} - {""})
        months = sorted({m for m in col("month") if m})
        context = (env or {}).get("context") or {}
        configuration = single(col("configuration_id")) or context.get("configuration_id") or self.release.defaults["configuration_id"]
        if table == "fact_annual":
            geographies = sorted({g for g in col("geography_id") if g})
            level = "national"
        elif table == "fact_adm1_month":
            geographies = sorted({"ADM1:%s" % p for p in col("province") if p})
            level = "adm1"
        elif table == "fact_adm2_month":
            geographies = sorted({(self.geo_by_shape.get(s) or {}).get("geography_id", s) for s in col("shape_id") if s})
            level = "adm2"
        else:
            geographies, level = ["PK"], "national"
        return {"table": table, "modules": modules, "gases": gases, "streams": streams, "stream_basis": stream_basis,
                "categories": categories, "codes": codes, "periods": periods or [self.release.defaults["period_id"]],
                "months": months, "configuration": configuration, "geographies": geographies, "level": level,
                "gwp": context.get("gwp_basis") or self.release.defaults["gwp_basis"], "context": context}

    def _crumb(self, level, values, label_of):
        if len(values) == 1:
            return {"level": level, "id": values[0], "label": label_of(values[0])}
        return {"level": level, "id": None, "label": LEVEL_WORDS[level], "n": len(values), "ids": list(values)}

    def _breadcrumb(self, scope, env, value, touched):
        touched.update({"dim_category", "dim_geography", "dim_period"})
        sectors = self.labels["sectors"]
        gases = self.labels["gases"]
        geographies = self.labels["geographies"]
        periods = self.labels["periods"]
        geo_values = scope["geographies"]
        if scope["level"] == "national":
            geo_values = ["PK"]
        return [
            self._crumb("sector", scope["modules"], lambda m: sectors.get(m, m)),
            self._crumb("category", scope["categories"], lambda c: c),
            self._crumb("gas", scope["gases"], lambda g: gases.get(g, g)),
            self._crumb("geography", geo_values, lambda g: "Pakistan" if g == "PK" else geographies.get(g, (self.geo_by_id.get(g) or {}).get("name", g))),
            self._crumb("period", scope["periods"], lambda p: (periods.get(p) or {}).get("short", p)),
        ]

    # --- the sections --------------------------------------------------------------------------

    def _reported(self, env, value, scope):
        if env is None:
            return None
        context = env.get("context") or {}
        conf = self.labels["configurations"].get(context.get("configuration_id")) or {}
        gwp = self.labels["gwp"].get(context.get("gwp_basis")) or {}
        period_ids = list(context.get("periods") or scope["periods"])
        group = value.get("group") or {}
        out = {
            "display": value.get("display"), "display_short": value.get("display_short"), "exact": value.get("exact"),
            "exact_high": value.get("exact_high"), "unit": value.get("unit"), "unit_short": value.get("unit_short"), "unit_words": value.get("unit_words"),
            "exactness": value.get("exactness") or value.get("co2e_exactness"), "interpretation": value.get("interpretation"),
            "group": group, "n_rows": value.get("n_rows"),
            "gwp": {"basis": context.get("gwp_basis"), "label": gwp.get("label"), "factors": context.get("gwp_factors")},
            "configuration": {"id": context.get("configuration_id"), "label": conf.get("label"), "letter": conf.get("letter")},
            "period": {"ids": period_ids, "labels": [(self.labels["periods"].get(p) or {}).get("short", p) for p in period_ids],
                       "months": list(scope["months"]), "basis": context.get("basis")},
            "geography": {"level": context.get("geography_level"), "ids": list(context.get("geography_ids") or []), "spatial_view": context.get("spatial_view")},
            "release": {"release": context.get("release"), "version": context.get("version"), "commit": context.get("commit")},
            "lulucf": context.get("lulucf"),
            "request_type": env.get("request_type"),
        }
        for key in ("share_pct_short", "share_phrase", "rank", "interval_short", "quantiles_short"):
            if key in value:
                out[key] = value[key]
        return out

    def _calculation(self, env, value, table, rows, ids):
        calc = dict((env or {}).get("calculation") or {})
        out = {"kind": calc.get("kind", "rows"), "sql": calc.get("sql"), "table": table, "column": calc.get("column"),
               "formula": (value or {}).get("formula"), "rows": len(ids),
               "result_sha256": (env or {}).get("result_sha256"), "receipt": (env or {}).get("receipt"),
               "request": (env or {}).get("request"), "request_type": (env or {}).get("request_type")}
        return out

    def _stream_rows(self, scope, stream_id):
        """The stream's fact_annual rows for the scope's periods and configuration (the atoms
        behind a spatial or monthly cell)."""
        return self._fetch("SELECT * FROM fact_annual WHERE source_stream_id = '%s' AND period_id IN (%s) AND configuration_id = '%s' AND geography_id = 'PK' ORDER BY period_id"
                           % (stream_id.replace("'", "''"), quoted(scope["periods"]), scope["configuration"]))

    def _activity(self, scope, table, rows, touched):
        touched.update({"fact_annual", "uncertainty_parameters"})
        out = []
        by_stream = {}
        if table == "fact_annual":
            for r in rows:
                by_stream.setdefault(r["source_stream_id"], []).append(r)
        for s in scope["streams"]:
            sid = s["source_stream_id"]
            atoms = by_stream.get(sid) or self._stream_rows(scope, sid)
            activity_ids = split_ids(s["activity_parameter_ids"])
            entry_base = {
                "stream": sid, "module": s["module"], "ipcc_code": s["ipcc_code"], "category": s["ipcc_category"],
                "sub_category": s["sub_category"], "process": s["process"], "gas": s["gas"], "methane_origin": s["methane_origin"],
                "notation_key": s["notation_key"], "evidence_class": s["evidence_class"],
                "activity_parameter_ids": activity_ids, "conversion_parameter_ids": split_ids(s["conversion_parameter_ids"]),
                "source_id": s["source_id"], "source_document_ids": split_ids(s["source_document_ids"]),
                "scenario_id": s["scenario_id"],
                "activity_uncertainty": [self._uparam(u) for a in activity_ids for u in self.uparams_by_group.get(a, [])],
            }
            if not atoms:
                out.append(dict(entry_base, period_id=None, native_mass=None, native_unit=None, activity_status=None, estimate_status=None, method_id=None,
                                note="no fact_annual row for this stream in %s / %s" % (", ".join(scope["periods"]), scope["configuration"])))
                continue
            for a in atoms:
                out.append(dict(entry_base, period_id=a["period_id"], configuration_id=a["configuration_id"], native_mass=a["native_mass"],
                                native_unit=a["native_unit"], activity_status=a["activity_status"], estimate_status=a["estimate_status"],
                                method_id=a["method_id"], uncertainty_model_id=a["uncertainty_model_id"],
                                co2e_Mt_AR5=a["co2e_Mt_AR5"], co2e_Mt_AR6=a["co2e_Mt_AR6"], result_row_id=a["result_row_id"]))
        scope["atoms"] = out
        return out

    @staticmethod
    def _uparam(u):
        return {k: u.get(k) for k in ("parameter_id", "module", "kind", "value", "unit", "distribution", "uncert_pct_95",
                                      "confidence_interpretation", "dependency_group", "source", "note")}

    def _emission_factors(self, scope, touched):
        touched.update({"emission_factors", "uncertainty_parameters", "parameters"})
        seen = {}
        for s in scope["streams"]:
            for token in split_ids(s["factor_parameter_ids"]):
                if token in seen:
                    seen[token]["streams"].append(s["source_stream_id"])
                    continue
                bare = strip_prefix(strip_prefix(token, "ef:"), "factor:")
                ef = self.ef_by_id.get(strip_prefix(token, "ef:"))
                uparams = self.uparams_by_group.get(token, []) or self.uparams_by_id.get(token, [])
                param = self.param_by_id.get(bare)
                entry = {"ef_id": strip_prefix(token, "ef:"), "parameter_id": token, "streams": [s["source_stream_id"]],
                         "value": None, "unit": None, "uncert_pct": None, "vintage": None, "source": None, "note": None, "found_in": []}
                if ef:
                    entry.update({"value": ef["value"], "unit": ef["unit"], "uncert_pct": ef["uncert_pct"], "vintage": ef["vintage"],
                                  "source": ef["source"], "note": ef["note"], "category": ef["category"], "item": ef["item"]})
                    entry["found_in"].append("emission_factors.csv")
                if uparams:
                    entry["uncertainty_parameters"] = [self._uparam(u) for u in uparams]
                    entry["found_in"].append("national_uncertainty_parameters.csv")
                    if entry["value"] is None:
                        entry.update({"value": uparams[0]["value"], "unit": uparams[0]["unit"], "uncert_pct": uparams[0]["uncert_pct_95"], "source": uparams[0]["source"], "note": uparams[0]["note"]})
                if param:
                    entry["parameter"] = dict(param)
                    entry["found_in"].append("parameters.csv")
                    if entry["value"] is None:
                        entry.update({"value": param["value"], "unit": param["unit"], "source": param["source"], "note": param["note"]})
                if not entry["found_in"]:
                    entry["note"] = "%s: %s is named by dim_stream.factor_parameter_ids but no registry carries it" % (NOT_CARRIED, token)
                seen[token] = entry
        return list(seen.values())

    def _method(self, scope, touched):
        touched.add("method_registry")
        method_ids = []
        for a in scope.get("atoms") or []:
            if a.get("method_id") and a["method_id"] not in method_ids:
                method_ids.append(a["method_id"])
        out = []
        for mid in method_ids:
            for r in self.method_by_id.get(mid, []):
                out.append({"method_id": mid, "sector": r.get("sector"), "category": r.get("category"), "subitem_prefix": r.get("subitem_prefix"),
                            "gas": r.get("gas"), "tier": r.get("tier"), "uncertainty_model_id": r.get("uncertainty_model_id"),
                            "equation": r.get("equation"), "notes": r.get("notes")})
            if mid not in self.method_by_id:
                out.append({"method_id": mid, "tier": None, "equation": None, "notes": "%s: %s is not a row of data/method_registry.csv" % (NOT_CARRIED, mid)})
        return out

    def _monthly_basis(self, scope, table, rows, touched):
        touched.update({"fact_evidence", "fact_monthly", "temporal_profiles", "temporal_profile_weights", "dim_month"})
        by_stream = []
        monthly_rows = rows if table == "fact_monthly" else None
        for s in scope["streams"]:
            sid = s["source_stream_id"]
            ev = self.evidence_by_stream.get(sid) or {}
            if monthly_rows is not None:
                mine = [r for r in monthly_rows if r["component_id"] == sid]
            else:
                mine = self._fetch("SELECT closure_basis, temporal_evidence_class, timing_target, temporal_status, profile_id, source_id, borrowed_from_year "
                                   "FROM fact_monthly WHERE component_id = '%s' AND period_id IN (%s) AND configuration_id = '%s' AND geography_id = 'PK'"
                                   % (sid.replace("'", "''"), quoted(scope["periods"]), scope["configuration"]))
            profile_id = ev.get("temporal_profile_id") or s["temporal_profile_id"]
            profile = self.profile_by_id.get(profile_id)
            entry = {
                "stream": sid, "temporal_class": ev.get("temporal_class") or s["temporal_class"], "temporal_profile_id": profile_id,
                "temporal_evidence_grade": ev.get("temporal_evidence_grade"), "flatness_class": ev.get("flatness_class"),
                "profile": {k: profile.get(k) for k in ("profile_id", "sector", "temporal_class", "profile_source", "profile_period", "shape", "basis")} if profile else None,
                "closure_basis": single(r.get("closure_basis") for r in mine),
                "monthly": {"n_rows": len(mine), "closure_basis": sorted({r.get("closure_basis", "") for r in mine} - {""}),
                            "temporal_evidence_class": sorted({r.get("temporal_evidence_class", "") for r in mine} - {""}),
                            "timing_target": sorted({r.get("timing_target", "") for r in mine} - {""}),
                            "temporal_status": sorted({r.get("temporal_status", "") for r in mine} - {""}),
                            "profile_id": sorted({r.get("profile_id", "") for r in mine} - {""}),
                            "source_id": sorted({r.get("source_id", "") for r in mine} - {""}),
                            "borrowed_from_year": sorted({r.get("borrowed_from_year", "") for r in mine} - {""})},
            }
            if len(scope["streams"]) == 1 and len(scope["periods"]) == 1:
                weights = self.weights_by_stream_year.get((sid, scope["periods"][0]), [])
                entry["weights"] = [{k: w.get(k) for k in ("month", "weight", "temporal_evidence_class", "timing_target", "temporal_behavior", "behavior_basis", "temporal_status", "source_id", "observed_month_count", "borrowed_from_year", "basis")} for w in weights] or None
            by_stream.append(entry)
        if not by_stream:
            return None
        return {
            "temporal_class": single(e["temporal_class"] for e in by_stream),
            "temporal_profile_id": single(e["temporal_profile_id"] for e in by_stream),
            "profile": next((e["profile"] for e in by_stream if e["profile"]), None) if single(e["temporal_profile_id"] for e in by_stream) else None,
            "temporal_evidence_grade": single(e["temporal_evidence_grade"] for e in by_stream),
            "closure_basis": single(e["closure_basis"] for e in by_stream),
            "classes": sorted({e["temporal_class"] for e in by_stream if e["temporal_class"]}),
            "grades": sorted({e["temporal_evidence_grade"] for e in by_stream if e["temporal_evidence_grade"]}),
            "n_streams": len(by_stream), "stream_basis": scope["stream_basis"], "by_stream": by_stream,
            "note": "the top-level fields carry the one value the streams share, null where they differ; by_stream carries each",
        }

    def _rationale(self, s, name, touched):
        touched.add(name)
        out = []
        for r in self.rows(name):
            if r["module"] != s["module"] or r["category"] != s["ipcc_category"]:
                continue
            prefix = r.get("subitem_prefix", "")
            if prefix and not s["sub_category"].startswith(prefix):
                continue
            out.append(dict(r, registry=REGISTRY_FILES[name]))
        return out

    def _spatial_basis(self, scope, touched):
        touched.update({"fact_evidence", "geometry_sets", "release_heights", "grid_fallbacks", "allowed_grid_fallbacks"})
        by_stream = []
        rationale = []
        seen_rationale = set()
        for s in scope["streams"]:
            sid = s["source_stream_id"]
            ev = self.evidence_by_stream.get(sid) or {}
            geometry_id = ev.get("geometry_id") or s["geometry_id"]
            geometry = self.geometry_by_id.get(geometry_id)
            height = self.height_by_key.get((s["module"], s["ipcc_category"]))
            fallbacks = []
            for f in self.fallbacks_by_stream.get(sid, []):
                allowed = self.allowed_by_key.get((f["scope"], f["declared"], f["used"]))
                fallbacks.append(dict(f, justification=allowed["justification"] if allowed else None, affected_Mt_AR5_short=self._short(f.get("affected_Mt_AR5"))))
            for name in ("stream_geometry", "stream_grid_proxy"):
                for r in self._rationale(s, name, touched):
                    key = (name, tuple(sorted(r.items())))
                    if key not in seen_rationale:
                        seen_rationale.add(key)
                        rationale.append(r)
            by_stream.append({
                "stream": sid, "spatial_class": ev.get("spatial_class") or s["spatial_class"], "spatial_class_measured": ev.get("spatial_class_measured") or s["spatial_class_measured"],
                "placement_class": ev.get("placement_class"), "allocation_surface": ev.get("allocation_surface"),
                "located_mass_fraction": ev.get("located_mass_fraction"), "unresolved_Mt_AR5": ev.get("unresolved_Mt_AR5"),
                "unresolved_Mt_AR5_short": self._short(ev.get("unresolved_Mt_AR5")),
                "fallback_events": ev.get("fallback_events"), "fallback_Mt_AR5": ev.get("fallback_Mt_AR5"), "fallback_Mt_AR5_short": self._short(ev.get("fallback_Mt_AR5")),
                "spatial_view": s["spatial_view"], "spatial_profile_id": s["spatial_profile_id"], "geometry_id": geometry_id,
                "geometry": dict(geometry) if geometry else None,
                "release_height_class": ev.get("release_height_class") or s["release_height_class"],
                "release_height": dict(height) if height else None,
                "fallbacks": fallbacks,
            })
        if not by_stream:
            return None
        return {
            "spatial_class_measured": single(e["spatial_class_measured"] for e in by_stream),
            "spatial_class": single(e["spatial_class"] for e in by_stream),
            "placement_class": single(e["placement_class"] for e in by_stream),
            "allocation_surface": single(e["allocation_surface"] for e in by_stream),
            "geometry_id": single(e["geometry_id"] for e in by_stream),
            "release_height_class": single(e["release_height_class"] for e in by_stream),
            "fallback_events": single(e["fallback_events"] for e in by_stream),
            "fallback_Mt_AR5": by_stream[0]["fallback_Mt_AR5"] if len(by_stream) == 1 else None,
            "fallback_Mt_AR5_short": by_stream[0]["fallback_Mt_AR5_short"] if len(by_stream) == 1 else None,
            "classes": sorted({e["spatial_class_measured"] for e in by_stream if e["spatial_class_measured"]}),
            "placement_classes": sorted({e["placement_class"] for e in by_stream if e["placement_class"]}),
            "rationale": rationale,
            "n_streams": len(by_stream), "stream_basis": scope["stream_basis"], "by_stream": by_stream,
            "note": "the top-level fields carry the one value the streams share, null where they differ (a mass only for a single stream); by_stream carries each",
        }

    @staticmethod
    def _short(text):
        from decimal import Decimal, InvalidOperation
        if text in ("", None):
            return None
        try:
            return round_value(Decimal(str(text)))
        except InvalidOperation:
            return None

    def _uncertainty(self, scope, touched):
        touched.add("fact_uncertainty")
        if scope["categories"]:
            where = "category IN (%s)" % quoted(c.replace("'", "''") for c in scope["categories"])
        elif scope["modules"]:
            where = "module IN (%s)" % quoted(scope["modules"])
        else:
            return None
        return self._fetch("SELECT * FROM fact_uncertainty WHERE %s ORDER BY category, resolution" % where)

    def _sources(self, scope, touched):
        touched.update({"source_documents", "source_register", "public_documents"})
        out = []
        seen = {}
        for s in scope["streams"]:
            for doc in split_ids(s["source_document_ids"]):
                if doc in seen:
                    seen[doc]["streams"].append(s["source_stream_id"])
                    continue
                src = self.source_by_file.get(doc) or {}
                reg = self.register_by_file.get(doc) or {}
                entry = {"kind": "data_file", "data_file": doc, "streams": [s["source_stream_id"]],
                         "primary_source": reg.get("primary_source") or src.get("primary_source"),
                         "archival_state": reg.get("archival_state") or src.get("archival_state"),
                         "archived_path": reg.get("archived_path") or src.get("archived_path"),
                         "licence_status": src.get("licence_status"), "gap_id": src.get("gap_id"), "note": src.get("note"),
                         "document_sha256": reg.get("document_sha256"), "how_to_obtain": reg.get("how_to_obtain"),
                         "inbound_use": reg.get("inbound_use"), "outbound_redistribution": reg.get("outbound_redistribution"),
                         "document_in_deposit": reg.get("document_in_deposit"), "document_not_deposited_because": reg.get("document_not_deposited_because"),
                         "found_in": [n for n, hit in (("source_documents.csv", src), ("pakemis_source_register.csv", reg)) if hit]}
                if not entry["found_in"]:
                    entry["note"] = "%s: %s is named by dim_stream.source_document_ids but no register carries it" % (NOT_CARRIED, doc)
                seen[doc] = entry
                out.append(entry)
        for p in self.rows("public_documents"):
            if any(m in (p.get("read_by") or "") for m in scope["modules"]):
                out.append({"kind": "public_document", "path": p.get("path"), "document_sha256": p.get("sha256"), "licence_status": p.get("licence_status"),
                            "publisher": p.get("publisher"), "source_url": p.get("source_url"), "statement": p.get("statement"), "read_by": p.get("read_by"),
                            "found_in": ["public_documents.csv"]})
        return out

    def _validation(self, scope, touched):
        touched.update({"validation_catalog", "validation_sector_scorecard", "benchmarks"})
        out = []
        for r in self.rows("validation_catalog"):
            if r.get("module") in scope["modules"]:
                out.append(dict(r, kind="catalog"))
        for r in self.rows("validation_sector_scorecard"):
            if r.get("module") in scope["modules"]:
                out.append(dict(r, kind="sector_scorecard"))
        for r in self.rows("benchmarks"):
            if r.get("engine_category") in scope["categories"]:
                out.append(dict(r, kind="benchmark"))
        return out

    def _limitations(self, scope, env, touched):
        touched.add("semantic_release")
        ids = []
        for l in (env or {}).get("limitations_hit") or []:
            if isinstance(l, dict) and l.get("id") and l["id"] not in ids:
                ids.append(l["id"])
        if scope["level"] == "adm2":
            for l in ("ar6_adm2_ne", "adm2_co2e_bounded_power_residential", "no_polygon_units"):
                if l not in ids:
                    ids.append(l)
        if "lulucf_excluded" not in ids:
            ids.append("lulucf_excluded")
        for row in scope.get("completeness_rows") or self._completeness_rows(scope, touched):
            lid = "completeness:%s" % row.get("gap_id") if row.get("gap_id") else ""
            if lid and lid in self.limitations and lid not in ids:
                ids.append(lid)
        worded = self.labels["limitations"]
        return [dict(self.limitations.get(i, {"id": i, "message": i, "notation_key": None, "scope": None}), worded=worded.get(i)) for i in ids]

    def _completeness_rows(self, scope, touched):
        touched.add("fact_completeness")
        if "completeness_rows" in scope:
            return scope["completeness_rows"]
        if not scope["codes"]:
            scope["completeness_rows"] = []
            return []
        rows = self._fetch("SELECT * FROM fact_completeness WHERE code IN (%s) ORDER BY code, category, gas" % quoted(scope["codes"]))
        scope["completeness_rows"] = rows
        return rows

    def _completeness(self, scope, touched):
        touched.update({"fact_completeness", "fact_completeness_mass", "data_gaps"})
        rows = self._completeness_rows(scope, touched)
        if not rows:
            return None
        rows = [dict(r, gap=dict(self.gap_by_id[r["gap_id"]]) if r.get("gap_id") in self.gap_by_id else None) for r in rows]
        exact = [r for r in rows if r["category"] in scope["categories"] and (not scope["gases"] or r["gas"] in scope["gases"])]
        head = exact[0] if len(exact) == 1 else None
        mass = self._fetch("SELECT * FROM fact_completeness_mass WHERE ipcc_code IN (%s) ORDER BY ipcc_code, stream" % quoted(scope["codes"])) if scope["codes"] else []
        return {"notation_key": head["notation_key"] if head else None, "justification": head["justification"] if head else None,
                "claim_class": head["claim_class"] if head else None, "gap": head["gap"] if head else None,
                "rows": rows, "mass_rows": mass,
                "note": "the top-level fields are the one ledger row for the scope's category and gas, null when the scope spans several; rows lists every row under the scope's IPCC codes"}

    def _rows(self, table, rows, ids, env, base_url):
        t = self.release.tables[table]
        out = {"table": table, "path": t["path"], "sha256": t["sha256_csv"], "columns": list(t["columns"]), "ids": ids, "n": len(ids),
               "records": rows[:RECORDS_CAP], "records_cap": RECORDS_CAP, "records_truncated": len(rows) > RECORDS_CAP,
               "download": None}
        if env is not None and env.get("receipt"):
            out["download"] = {"csv": "%s%s/download/%s.csv" % (base_url, API_PREFIX, env["receipt"]),
                               "receipt_json": "%s%s/download/%s.receipt.json" % (base_url, API_PREFIX, env["receipt"]),
                               "replay": "%s%s/receipt/%s" % (base_url, API_PREFIX, env["receipt"])}
        return out

    def _class_definitions(self, scope):
        ids = set()
        for s in scope["streams"]:
            ev = self.evidence_by_stream.get(s["source_stream_id"]) or {}
            for key in ("evidence_class", "temporal_class", "spatial_class", "spatial_class_measured"):
                ids.add(ev.get(key) or s.get(key))
            grade = ev.get("temporal_evidence_grade") or ""
            if grade.startswith("TE"):
                ids.add("T" + grade[2:])
        return {i: self.class_definitions[i] for i in sorted(ids) if i in self.class_definitions}

    def _provenance(self, touched):
        out = []
        for name in sorted(touched):
            if name in self.release.tables:
                t = self.release.tables[name]
                out.append({"name": name, "path": t["path"], "sha256": t["sha256_csv"], "identity": "contract"})
            elif name == "semantic_release":
                out.append({"name": name, "path": "outputs/semantic/semantic_release.json", "sha256": None, "identity": "contract"})
            elif name in self.digests:
                d = self.digests[name]
                out.append({"name": name, "path": d["path"], "sha256": d["sha256"], "identity": d["identity"], "source_path": d["source_path"]})
        return out

    def summary(self):
        """For /release: which registries the payload carries, with digests."""
        return {name: dict(self.digests[name], rows=len(self.registries.get(name) or [])) for name in sorted(self.digests) if name == "method_registry" or name in self.registries}
