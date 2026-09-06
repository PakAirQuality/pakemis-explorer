"""The engine: DuckDB over the verified tables, every aggregate an exact DECIMAL sum.

Rules the models cannot express alone live here: a request names one basis, one configuration
and one GWP basis; a calendar basis outside agriculture, AR6 at ADM2 and configuration S outside
FY2023-24 are typed refusals; configuration S totals are composed as REF minus residential(REF)
plus residential(S) with the formula stated; a spatial aggregate always reports the unallocated
mass at its level; a bounded ADM2 CO2e cell is an interval, never a midpoint."""
import dataclasses
import os

from pakemis_query import errors as E
from pakemis_query.envelope import envelope, value
from pakemis_query.models import (GEOGRAPHY_LEVELS, VIEWS, QueryAir, QueryEmissions, canonical_json)

DECIMAL = "DECIMAL(38,18)"
REFERENCE_PERIOD = "FY2023-24"


class Engine:
    def __init__(self, release, threads=1):
        import duckdb
        self.release = release
        self.con = duckdb.connect(database=":memory:")
        self.con.execute("SET threads TO %d" % threads)
        self.con.execute("SET preserve_insertion_order = true")
        for name in release.tables:
            path, kind = release.table_path(name)
            reader = "read_parquet" if kind == "parquet" else "read_csv"
            args = "'%s'" % path if kind == "parquet" else "'%s', header=true, all_varchar=true" % path
            self.con.execute("CREATE VIEW %s AS SELECT * FROM %s(%s)" % (name, reader, args))
        self.decimals = release.contract["rounding"]

    # --- defaults and validation --------------------------------------------------------

    def _fill(self, q):
        d = self.release.defaults
        applied = []
        fields = dataclasses.asdict(q)
        for key, default in (("basis", d["basis"]), ("configuration_id", d["configuration_id"]),
                             ("gwp_basis", d["gwp_basis"]), ("geography_level", "national"),
                             ("spatial_view", d["spatial_view"])):
            if not fields[key]:
                fields[key] = default
                applied.append(key)
        if not fields["periods"]:
            fields["periods"] = (d["period_id"],)
            applied.append("periods")
        fields["defaults_applied"] = tuple(applied)
        return QueryEmissions(**fields)

    def _validate(self, q):
        r = self.release
        periods = {p["period_id"]: p for p in r.dim("dim_period")}
        for p in q.periods:
            if p not in periods:
                fiscal = [x for x in periods if x.startswith("FY")]
                raise E.UnknownDimensionValue(
                    "%r is not a period of this release; name a fiscal year (%s..%s) or a "
                    "calendar year CY1990..CY2024 (agriculture only)" % (p, fiscal[0], fiscal[-1]),
                    dimension="period_id", value=p)
            if periods[p]["basis"] != q.basis:
                raise E.MixedBasisError("period %s is on the %s basis; the request names %s"
                                        % (p, periods[p]["basis"], q.basis), period=p)
        if q.basis == "calendar" and (not q.sectors or set(q.sectors) != {"agriculture"}):
            raise E.NotEstimated("calendar-year values exist for agriculture only",
                                 "calendar_basis_ne")
        configurations = {c["configuration_id"]: c for c in r.dim("dim_configuration")}
        if q.configuration_id not in configurations or configurations[q.configuration_id]["queryable"] != "yes":
            raise E.UnknownDimensionValue("%r is not a queryable configuration (REF_2023_24, S_2023_24)"
                                          % q.configuration_id, dimension="configuration_id")
        if q.configuration_id == "S_2023_24" and set(q.periods) != {REFERENCE_PERIOD}:
            raise E.GrainUnavailable("configuration S exists for FY2023-24 only", "config_S_residential_only")
        if q.gwp_basis not in ("AR5", "AR6"):
            raise E.UnknownDimensionValue("%r is not a GWP basis" % q.gwp_basis, dimension="gwp_basis")
        if q.geography_level not in GEOGRAPHY_LEVELS:
            raise E.UnknownDimensionValue("%r is not a geography level" % q.geography_level, dimension="geography_level")
        if q.geography_level == "adm2" and q.gwp_basis == "AR6":
            raise E.NotEstimated("AR6 CO2e is not carried at ADM2", "ar6_adm2_ne")
        # THE SPATIAL LAYER IS NINE YEARS NOW, AT BOTH LEVELS. This block has shed two
        # stale refusals in two releases: first "spatial products exist for FY2023-24
        # only" (true until the by-year district table landed), then "ADM1 is published
        # monthly for FY2023-24" (true until fact_adm1_year landed - the nine-year ADM1
        # product existed in the release all along, and the semantic layer had simply
        # never consumed it; the Explorer's provinces slider is what finally asked).
        # What remains period-limited is the MONTH: the historical periods are published
        # ANNUALLY at both levels, and the year tables carry AR5 only.
        if q.geography_level != "national" and set(q.periods) != {REFERENCE_PERIOD}:
            if q.months:
                raise E.GrainUnavailable(
                    "the historical periods are published ANNUALLY; a monthly request "
                    "outside FY2023-24 is refused rather than computed",
                    "adm2_history_annual_only")
            if q.geography_level == "adm1" and q.gwp_basis == "AR6":
                raise E.NotEstimated(
                    "AR6 CO2e is not carried in the historical ADM1 table", "ar6_adm2_ne")
        if q.spatial_view not in VIEWS:
            raise E.UnknownDimensionValue("%r is not a spatial view" % q.spatial_view, dimension="spatial_view")
        return q

    # --- SQL helpers ----------------------------------------------------------------------

    @staticmethod
    def _in(column, values):
        return "%s IN (%s)" % (column, ", ".join("'%s'" % v.replace("'", "''") for v in values))

    def _filters(self, q, table_alias=""):
        where = []
        if q.gases:
            where.append(self._in("gas", q.gases))
        if q.sectors:
            where.append(self._in("sector_id" if q.geography_level == "national" else "module", q.sectors))
        if q.ipcc_codes and q.geography_level == "national":
            where.append("(" + " OR ".join("ipcc_code = '%s' OR ipcc_code LIKE '%s.%%'" % (c, c) for c in q.ipcc_codes) + ")")
        if q.categories and q.geography_level == "national":
            where.append(self._in("category", q.categories))
        if q.streams:
            where.append(self._in("component_id" if q.geography_level == "national" else "source_stream_id", q.streams))
        return where

    def _fetch(self, sql):
        cur = self.con.execute(sql)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]

    # --- query_emissions ------------------------------------------------------------------

    def query_emissions(self, request):
        q = self._validate(self._fill(request))
        if q.geography_level == "national":
            return self._national(q)
        return self._spatial(q)

    def _national(self, q):
        col = "co2e_Mt_%s" % q.gwp_basis
        if q.basis == "calendar":
            # the FAOSTAT-comparable calendar reconstruction; the reference year's own-basis
            # anchor rows (year_basis fiscal_census_anchor) are a comparison, not a series
            table, where = "fact_annual_calendar", [self._in("period_id", q.periods),
                                                   "year_basis = 'calendar_faostat'"]
            col = "co2e_Mt_AR5"
            if q.gwp_basis == "AR6":
                raise E.NotEstimated("the calendar reconstruction carries AR5 only", "calendar_basis_ne")
            if q.categories:
                where.append(self._in("category", q.categories))
            groups = [g for g in q.group_by if g in ("period_id", "category")]
        else:
            table = "fact_monthly" if q.months else "fact_annual"
            where = [self._in("period_id", q.periods), "geography_id = 'PK'"]
            if q.months:
                where.append(self._in("month", q.months))
            groups = list(q.group_by)
            where += self._filters(q)
        group_sql = ", ".join(groups) if groups else "'all'"
        group_cols = ", ".join(groups) + ", " if groups else ""
        formula = ""
        if q.configuration_id == "S_2023_24" and q.basis == "fiscal":
            # S = REF - residential(REF) + residential(S): the residential atoms of the
            # reference are replaced by the survey's category x gas rows
            where_ref = where + ["configuration_id = 'REF_2023_24'", "sector_id <> 'residential'"]
            where_s = where + ["configuration_id = 'S_2023_24'"]
            sql = ("SELECT %s SUM(CAST(%s AS %s)) AS exact, string_agg(result_row_id, ';' ORDER BY result_row_id) AS ids, COUNT(*) AS n "
                   "FROM (SELECT * FROM %s WHERE %s UNION ALL SELECT * FROM %s WHERE %s) GROUP BY %s"
                   % (group_cols, col, DECIMAL, table, " AND ".join(where_ref), table, " AND ".join(where_s), group_sql))
            formula = "SUM(%s) over REF atoms outside residential + SUM(%s) over the survey's residential rows (S = REF - residential(REF) + residential(S))" % (col, col)
        else:
            if table != "fact_annual_calendar":          # the calendar table carries no configuration
                where.append("configuration_id = '%s'" % q.configuration_id)
            sql = ("SELECT %s SUM(CAST(%s AS %s)) AS exact, string_agg(result_row_id, ';' ORDER BY result_row_id) AS ids, COUNT(*) AS n "
                   "FROM %s WHERE %s GROUP BY %s" % (group_cols, col, DECIMAL, table, " AND ".join(where), group_sql))
            formula = "SUM(%s) over %d %s rows" % (col, 0, table)
        rows = self._fetch(sql + self._order(q))
        decimals = self._decimals_for(q, groups)
        values = []
        for r in rows:
            label = {g: r[g] for g in groups}
            values.append(value(str(r["exact"]), "Mt CO2e %s" % q.gwp_basis, decimals,
                               row_ids=(r["ids"] or "").split(";") if r["ids"] else [],
                               formula=formula.replace("%d", str(r["n"])) if "%d" in formula else formula,
                               group=label, n_rows=r["n"]))
        if not values and not groups:
            values.append(value("0", "Mt CO2e %s" % q.gwp_basis, decimals, formula="no rows in scope"))
        prov = self._provenance([table])
        return envelope(self.release, "query_emissions", canonical_json(q), dataclasses.asdict(q),
                        values, {"kind": "sum", "sql": sql, "table": table, "column": col},
                        prov, uncertainty=self._uncertainty_for(q), completeness=self._completeness_for(q),
                        limitations_hit=self._limitations_for(q), defaults_applied=q.defaults_applied)

    def _spatial(self, q):
        if q.geography_level == "adm1" and set(q.periods) != {REFERENCE_PERIOD}:
            # the nine-year provincial table: period-keyed, exact, AR5 (validated above)
            table, col = "fact_adm1_year", "co2e_Mt_AR5"
            geo_col = "province"
        elif q.geography_level == "adm1":
            table, col = "fact_adm1_month", "co2e_Mt_%s" % q.gwp_basis
            geo_col = "province"
        elif set(q.periods) == {REFERENCE_PERIOD}:
            table, col = "fact_adm2_month", "co2e_Mt_AR5_low"
            geo_col = "shape_id"
        else:
            # The historical periods live in the annual table, keyed on period_id rather than
            # month. Same columns, same closure, same module grain - a different time key.
            table, col = "fact_adm2_year", "co2e_Mt_AR5_low"
            geo_col = "shape_id"
        where = ["configuration_id = '%s'" % q.configuration_id]
        if table in ("fact_adm2_year", "fact_adm1_year"):
            where.append(self._in("period_id", q.periods))
        elif q.months:
            where.append(self._in("month", q.months))
        if q.geography_ids:
            where.append(self._in(geo_col, q.geography_ids))
        if q.spatial_view != "all":
            where.append("spatial_view = '%s'" % q.spatial_view)
        where += self._filters(q)
        groups = list(q.group_by) or [geo_col]
        group_cols = ", ".join(groups)
        if table in ("fact_adm2_month", "fact_adm2_year"):
            sql = ("SELECT %s, SUM(CAST(co2e_Mt_AR5_low AS %s)) AS exact_low, SUM(CAST(co2e_Mt_AR5_high AS %s)) AS exact_high, "
                   "SUM(CAST(emissions_Gg AS %s)) AS gg, string_agg(DISTINCT co2e_exactness, ';') AS exactness, COUNT(*) AS n, "
                   "string_agg(result_row_id, ';' ORDER BY result_row_id) AS ids FROM %s WHERE %s AND emissions_Gg <> '' GROUP BY %s"
                   % (group_cols, DECIMAL, DECIMAL, DECIMAL, table, " AND ".join(where), group_cols))
        else:
            sql = ("SELECT %s, SUM(CAST(%s AS %s)) AS exact_low, SUM(CAST(%s AS %s)) AS exact_high, SUM(CAST(emissions_Gg AS %s)) AS gg, "
                   "'exact' AS exactness, COUNT(*) AS n, string_agg(result_row_id, ';' ORDER BY result_row_id) AS ids "
                   "FROM %s WHERE %s AND %s <> '' GROUP BY %s"
                   % (group_cols, col, DECIMAL, col, DECIMAL, DECIMAL, table, " AND ".join(where), col, group_cols))
        rows = self._fetch(sql + self._order(q, "exact_low"))
        decimals = self.decimals["co2e_Mt"].get(q.geography_level, 4)
        values = []
        for r in rows:
            label = {g: r[g] for g in groups}
            bounded = "bounded" in (r["exactness"] or "")
            v = value(str(r["exact_low"]), "Mt CO2e AR5", decimals,
                      row_ids=(r["ids"] or "").split(";"), formula="SUM(%s) over %d rows" % (col, r["n"]),
                      group=label, n_rows=r["n"], exactness=r["exactness"], gg=str(r["gg"]))
            if bounded:
                v["exact_high"] = str(r["exact_high"])
                v["display"] = "[%s, %s]" % (v["display"], self._disp(str(r["exact_high"]), decimals))
                v["interpretation"] = "an interval: the module mixes fossil and biogenic CH4 at the published grain"
            values.append(v)
        unallocated = self._unallocated_for(q)
        return envelope(self.release, "query_emissions", canonical_json(q), dataclasses.asdict(q),
                        values, {"kind": "sum", "sql": sql, "table": table, "column": col},
                        self._provenance([table, "fact_unallocated"]), unallocated=unallocated,
                        uncertainty=self._uncertainty_for(q), limitations_hit=self._limitations_for(q),
                        defaults_applied=q.defaults_applied)

    @staticmethod
    def _disp(exact, decimals):
        from pakemis_query.envelope import display
        return display(exact, decimals)

    # --- query_air (the air beta) ---------------------------------------------------------

    AIR_GROUPS = ("pollutant", "sector_id", "category", "subitem", "province", "district", "year")
    AIR_SECTORS = ("agriculture", "aviation", "power", "railways", "residential", "transport", "waste")

    def query_air(self, request):
        """Native kt of a named species from the PakEmis-Air beta tables; never CO2e, and
        never a sum across pollutants (the particulate strata contain one another). The
        spatial and timeseries grains are agriculture's alone; every other combination is a
        typed refusal, not a computation."""
        q = request
        applied = []
        if not q.geography_level:
            q = dataclasses.replace(q, geography_level="national"); applied.append("geography_level")
        q = dataclasses.replace(q, defaults_applied=tuple(applied))
        pollutants = {r["pollutant"] for r in self.release.dim("dim_pollutant")}
        for pl in q.pollutants:
            if pl not in pollutants:
                raise E.UnknownDimensionValue("%r is not a pollutant of the air beta (%s)"
                                              % (pl, ", ".join(sorted(pollutants))), dimension="pollutant", value=pl)
        for sec in q.sectors:
            if sec not in self.AIR_SECTORS:
                raise E.NotEstimated("the air beta carries no %s layer; industry, IPPU and "
                                     "fugitives are recorded NE in the completeness ledger" % sec,
                                     "air_sector_ne")
        if q.geography_level not in GEOGRAPHY_LEVELS:
            raise E.UnknownDimensionValue("%r is not a geography level" % q.geography_level, dimension="geography_level")
        bad = [g for g in q.group_by if g not in self.AIR_GROUPS]
        if bad:
            raise E.GrainUnavailable("%r is not a grouping of the air tables (%s)"
                                     % (bad[0], ", ".join(self.AIR_GROUPS)), "grain_unavailable")
        if "pollutant" not in q.group_by and len(q.pollutants) != 1:
            raise E.GrainUnavailable(
                "a sum across pollutants is meaningless (BC is inside PM2.5, PM2.5 inside "
                "PM10); name exactly one pollutant or group by pollutant", "pollutants_not_additive")
        if q.geography_level != "national":
            if q.sectors and set(q.sectors) != {"agriculture"}:
                raise E.GrainUnavailable(
                    "the provincial and district air layers exist for agriculture only; the "
                    "other six sector layers are national", "air_spatial_agriculture_only")
            if q.years:
                raise E.GrainUnavailable("the air timeseries is national only; provinces and "
                                         "districts carry CY2024 alone", "air_history_national_only")
        # table choice
        if q.years:
            table, geo_col = "fact_air_timeseries", ""
            base = [self._in("year", q.years)]
            allowed = ("year", "pollutant", "category")
            bad = [g for g in q.group_by if g not in allowed]
            if bad:
                raise E.GrainUnavailable("%r is not a grouping of the air timeseries (%s); the "
                                         "series is agriculture, national" % (bad[0], ", ".join(allowed)),
                                         "air_history_national_only")
            # the source's own TOTAL rows are its sums; a category grouping must not add them in
            base.append("category <> 'TOTAL'" if ("category" in q.group_by or q.categories) else "category = 'TOTAL'")
        elif q.geography_level == "adm1":
            table, geo_col = "fact_air_adm1", "province"
            base = []
        elif q.geography_level == "adm2":
            table, geo_col = "fact_air_adm2", "district"
            base = []
        else:
            table, geo_col = "fact_air_annual", ""
            base = []
            if q.sectors:
                base.append(self._in("sector_id", q.sectors))
        if q.pollutants:
            base.append(self._in("pollutant", q.pollutants))
        if q.categories:
            base.append(self._in("category", q.categories))
        if q.geography_ids and geo_col:
            base.append(self._in(geo_col, q.geography_ids))
        groups = list(q.group_by) or ([geo_col] if geo_col else ["pollutant"])
        if geo_col and geo_col not in groups and "pollutant" not in groups and len(q.pollutants) != 1:
            groups.append("pollutant")
        group_cols = ", ".join(groups) + ", " if groups else ""
        where = " AND ".join(base) if base else "1=1"
        sql = ("SELECT %sSUM(CAST(emissions_kt AS %s)) AS exact, string_agg(result_row_id, ';' ORDER BY result_row_id) AS ids, "
               "COUNT(*) AS n FROM %s WHERE %s GROUP BY %s"
               % (group_cols, DECIMAL, table, where, ", ".join(groups) if groups else "'all'"))
        rows = self._fetch(sql + self._order(q))
        values = []
        for r in rows:
            label = {g: r[g] for g in groups}
            species = label.get("pollutant") or (q.pollutants[0] if len(q.pollutants) == 1 else "")
            values.append(value(str(r["exact"]), ("kt %s" % species).strip(), 3,
                               row_ids=(r["ids"] or "").split(";") if r["ids"] else [],
                               formula="SUM(emissions_kt) over %d %s rows" % (r["n"], table),
                               group=label, n_rows=r["n"]))
        prov = self._provenance([table])
        limitations = ["air_beta", "lulucf_excluded"]
        if q.geography_level != "national" or not q.sectors:
            limitations.append("air_sector_ne")
        return envelope(self.release, "query_air", canonical_json(q), dataclasses.asdict(q),
                        values, {"kind": "sum", "sql": sql, "table": table, "column": "emissions_kt"},
                        prov, limitations_hit=limitations, defaults_applied=q.defaults_applied)

    def _order(self, q, column="exact"):
        sql = ""
        if q.order_by:
            direction = "DESC" if q.order_by.lower().endswith("desc") else "ASC"
            sql += " ORDER BY %s %s" % (column, direction)
        if q.limit:
            sql += " LIMIT %d" % q.limit
        return sql

    def _decimals_for(self, q, groups):
        d = self.decimals["co2e_Mt"]
        if not groups:
            return d["national_total"] if not (q.sectors or q.ipcc_codes or q.categories or q.streams) else d["sector"]
        if "component_id" in groups or "source_stream_id" in groups:
            return d["stream"]
        if "category" in groups or "ipcc_code" in groups:
            return d["category"]
        return d["sector"]

    # --- the blocks every answer carries ----------------------------------------------------

    def _provenance(self, tables):
        r = self.release
        products = [{"table": t, "path": r.tables[t]["path"], "sha256": r.tables[t]["sha256_csv"]} for t in tables]
        return {"tables": products, "release_manifest": r.contract["release"]["release_manifest"],
                "derived_from": r.tables[tables[0]]["derived_from"][:6]}

    def _uncertainty_for(self, q):
        rows = self._fetch("SELECT category, module, resolution, envelope_low_pct, envelope_high_pct, envelope_kind, aggregation_rule "
                           "FROM fact_uncertainty WHERE resolution = '%s'%s"
                           % ("annual" if q.geography_level == "national" else q.geography_level,
                              (" AND " + self._in("module", q.sectors)) if q.sectors else ""))
        return {"rows": rows[:40], "interpretation": "per-category envelopes (structural, no probability); "
                "they are NEVER combined in quadrature across categories - see aggregation_rule"}

    def _completeness_for(self, q):
        where = []
        if q.ipcc_codes:
            where.append("(" + " OR ".join("code = '%s' OR code LIKE '%s.%%'" % (c, c) for c in q.ipcc_codes) + ")")
        sql = "SELECT code, category, gas, notation_key, gap_id FROM fact_completeness WHERE notation_key <> 'E'"
        if where:
            sql += " AND " + " AND ".join(where)
        return self._fetch(sql)

    def _unallocated_for(self, q):
        where = ["configuration_id = '%s'" % q.configuration_id]
        if q.months:
            where.append(self._in("month", q.months))
        if q.geography_level == "adm1" and q.geography_ids:
            where.append(self._in("province", q.geography_ids))
        if q.sectors:
            where.append(self._in("module", q.sectors))
        rows = self._fetch("SELECT province, SUM(CAST(co2e_Mt_AR5 AS %s)) AS exact, COUNT(*) AS n FROM fact_unallocated WHERE %s GROUP BY province"
                           % (DECIMAL, " AND ".join(where)))
        return {"level": "adm1", "by_province": [{"province": r["province"], "exact": str(r["exact"]), "n_rows": r["n"]} for r in rows],
                "note": "mass retained at ADM1 and placed no finer; part of every closure below it"}

    def _limitations_for(self, q):
        hit = ["lulucf_excluded"]
        if q.geography_level == "adm2":
            hit += ["ar6_adm2_ne", "adm2_co2e_bounded_power_residential", "no_polygon_units"]
        if q.configuration_id == "S_2023_24":
            hit.append("config_S_residential_only")
        if q.basis == "calendar":
            hit.append("calendar_basis_ne")
        return hit
