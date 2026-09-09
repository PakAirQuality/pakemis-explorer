"""The public functions of the contract, beyond query_emissions (which lives on the Engine).

Each returns an envelope. They read the dimension and fact tables through the engine's DuckDB
views; none computes a number the release does not carry, except compare (a difference of two
exact sums, stated as such) and the grid cell lookup (a value read from the NetCDF)."""
import dataclasses
import os

from pakemis_query import errors as E
from pakemis_query.engine import DECIMAL, REFERENCE_PERIOD
from pakemis_query.envelope import envelope, value
from pakemis_query.models import (CompareRequest, EvidenceRequest, GridCellRequest, MethodRequest,
                                  QueryEmissions, SpatialLineageRequest, TimeseriesRequest,
                                  TransferRequest, UncertaintyRequest, CompletenessRequest,
                                  canonical_json)


def compare_emissions(engine, req):
    left, right = engine.query_emissions(req.left), engine.query_emissions(req.right)
    ql, qr = engine._fill(req.left), engine._fill(req.right)
    if ql.basis != qr.basis:
        raise E.MixedBasisError("a comparison never crosses bases (%s vs %s)" % (ql.basis, qr.basis))
    if ql.gwp_basis != qr.gwp_basis:
        raise E.MixedGwpError("a comparison never crosses GWP bases")
    from decimal import Decimal
    values = []
    for lv, rv in zip(left["values"], right["values"]):
        a, b = Decimal(lv["exact"]), Decimal(rv["exact"])
        delta = b - a
        if req.mode == "relative":
            exact = str((delta / a * 100).quantize(Decimal("0.000001"))) if a else ""
            values.append(value(exact, "percent", 1, formula="(right - left) / left x 100", left=lv, right=rv))
        else:
            values.append(value(str(delta), lv["unit"], engine.decimals["co2e_Mt"]["sector"],
                                formula="right - left (two exact sums)", left=lv, right=rv))
    fields = dataclasses.asdict(ql)
    fields["periods"] = tuple(sorted(set(ql.periods) | set(qr.periods)))
    fields["configuration_id"] = "%s vs %s" % (ql.configuration_id, qr.configuration_id) if ql.configuration_id != qr.configuration_id else ql.configuration_id
    return envelope(engine.release, "compare_emissions", canonical_json(req), fields, values,
                    {"kind": "difference", "mode": req.mode, "left": left["calculation"], "right": right["calculation"]},
                    left["provenance"], uncertainty=left["uncertainty"],
                    limitations_hit=[l["id"] for l in left["limitations_hit"]] + [l["id"] for l in right["limitations_hit"] if l not in left["limitations_hit"]])


def get_timeseries(engine, req):
    q = engine._fill(req.query)
    periods = tuple(p["period_id"] for p in engine.release.dim("dim_period") if p["basis"] == q.basis)
    if q.basis == "fiscal" and q.configuration_id == "S_2023_24":
        raise E.GrainUnavailable("configuration S exists for FY2023-24 only; a series is the reference's", "config_S_residential_only")
    group = ("month",) if req.step == "monthly" else ("period_id",)
    series = dataclasses.replace(q, periods=periods, group_by=group + tuple(g for g in q.group_by if g not in group),
                                 months=q.months, defaults_applied=q.defaults_applied)
    if req.step == "monthly":
        months = tuple(m["month"] for m in engine.release.dim("dim_month"))
        series = dataclasses.replace(series, months=months)
    out = engine.query_emissions(series)
    out["request_type"] = "get_timeseries"
    out["request"] = canonical_json(req)
    return out


def get_uncertainty(engine, req):
    r = engine.release
    if req.scope == "series":
        rows = engine._fetch("SELECT * FROM fact_uncertainty_series WHERE kind IN ('annual_level','trend_pair')"
                             + (" AND period_or_pair = '%s'" % req.period_id if req.period_id else ""))
        table = "fact_uncertainty_series"
    elif req.scope == "national":
        rows = engine._fetch("SELECT * FROM fact_uncertainty_series WHERE kind = 'parametric_reference' AND scope = 'national'")
        table = "fact_uncertainty_series"
    else:
        where = []
        if req.category:
            where.append("category = '%s'" % req.category.replace("'", "''"))
        if req.module:
            where.append("module = '%s'" % req.module)
        if req.resolution:
            where.append("resolution = '%s'" % req.resolution)
        rows = engine._fetch("SELECT * FROM fact_uncertainty" + (" WHERE " + " AND ".join(where) if where else ""))
        table = "fact_uncertainty"
    values = []
    for row in rows:
        if table == "fact_uncertainty_series":
            values.append(value(row["P50_Mt"], "Mt CO2e AR5", 3, row_ids=[row["result_row_id"]],
                                formula="P50 of the draws", quantiles={"P2.5": row["P2.5_Mt"], "P97.5": row["P97.5_Mt"]},
                                kind=row["kind"], key=row["key"], scenario=row["scenario"]))
        else:
            values.append(value(row["estimate_Mt"], "Mt CO2e AR5", 3, row_ids=[row["result_row_id"]],
                                formula="the category's published estimate with its envelope",
                                envelope={"low_pct": row["envelope_low_pct"], "high_pct": row["envelope_high_pct"],
                                          "kind": row["envelope_kind"]},
                                category=row["category"], module=row["module"], resolution=row["resolution"],
                                aggregation_rule=row["aggregation_rule"]))
    fields = {"basis": "fiscal", "periods": (req.period_id or REFERENCE_PERIOD,),
              "configuration_id": req.configuration_id or r.defaults["configuration_id"], "gwp_basis": "AR5"}
    return envelope(r, "get_uncertainty", canonical_json(req), fields, values,
                    {"kind": "lookup", "table": table}, engine._provenance([table]),
                    uncertainty={"interpretation": "quantiles of draws for the series; per-category envelopes "
                                                   "(structural, no probability) for the joint table - never quadrature"})


def get_completeness(engine, req):
    where = []
    if req.notation_keys:
        where.append(engine._in("notation_key", req.notation_keys))
    if req.ipcc_codes:
        where.append("(" + " OR ".join("code = '%s' OR code LIKE '%s.%%'" % (c, c) for c in req.ipcc_codes) + ")")
    rows = engine._fetch("SELECT * FROM fact_completeness" + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY code, gas")
    values = [value("", "notation_key", 0, row_ids=[r["result_row_id"]], formula="completeness.csv row",
                    code=r["code"], category=r["category"], gas=r["gas"], notation_key=r["notation_key"],
                    justification=r["justification"], gap_id=r["gap_id"]) for r in rows]
    for v in values:
        v["display"] = v["notation_key"]
    return envelope(engine.release, "get_completeness", canonical_json(req), {"basis": "fiscal", "periods": (REFERENCE_PERIOD,)},
                    values, {"kind": "lookup", "table": "fact_completeness"}, engine._provenance(["fact_completeness"]))


def get_evidence(engine, req):
    where = []
    if req.source_stream_id:
        where.append("e.source_stream_id = '%s'" % req.source_stream_id.replace("'", "''"))
    if req.module:
        where.append("e.module = '%s'" % req.module)
    if req.category:
        where.append("s.ipcc_category = '%s'" % req.category.replace("'", "''"))
    rows = engine._fetch("SELECT e.*, s.ipcc_code, s.ipcc_category, s.sub_category, s.methane_origin, s.source_id, s.source_document_ids "
                         "FROM fact_evidence e JOIN dim_stream s USING (source_stream_id)"
                         + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY e.source_stream_id")
    values = [value("", "evidence", 0, row_ids=[r["result_row_id"]], formula="stream lineage row", **{k: r[k] for k in r if k != "result_row_id"}) for r in rows]
    for v in values:
        v["display"] = "%s / %s / %s" % (v["evidence_class"], v["temporal_class"], v["spatial_class_measured"])
    return envelope(engine.release, "get_evidence", canonical_json(req), {"basis": "fiscal", "periods": (REFERENCE_PERIOD,)},
                    values, {"kind": "lookup", "table": "fact_evidence"}, engine._provenance(["fact_evidence", "dim_stream"]),
                    evidence={"grades": "E (activity evidence), TE (timing), S (placement); see dim_evidence_class"})


def get_method(engine, req, method_rows):
    """method_rows: data/method_registry.csv rows handed in by the service (the registry is a
    data file the semantic release lists among its products)."""
    rows = [r for r in method_rows if (not req.method_id or r["method_id"] == req.method_id)
            and (not req.category or r["category"] == req.category)]
    values = [value("", "method", 0, formula=r.get("equation", ""), **r) for r in rows]
    for v in values:
        v["display"] = v.get("method_id", "")
    return envelope(engine.release, "get_method", canonical_json(req), {"basis": "fiscal", "periods": (REFERENCE_PERIOD,)},
                    values, {"kind": "lookup", "table": "data/method_registry.csv"},
                    {"tables": [{"path": "data/method_registry.csv", "sha256": engine.release.product_digest("data/method_registry.csv")}]})


def get_spatial_lineage(engine, req):
    conf = req.configuration_id or engine.release.defaults["configuration_id"]
    where = ["configuration_id = '%s'" % conf]
    if req.shape_id:
        where.append("shape_id = '%s'" % req.shape_id)
    if req.province:
        where.append("province = '%s'" % req.province.replace("'", "''"))
    if req.month:
        where.append("month = '%s'" % req.month)
    if req.gas:
        where.append("gas = '%s'" % req.gas)
    rows = engine._fetch("SELECT * FROM fact_adm2_month WHERE %s ORDER BY module, gas, month, spatial_view" % " AND ".join(where))
    geo = [g for g in engine.release.dim("dim_geography") if g["shape_id"] == req.shape_id] if req.shape_id else []
    values = [value(r["co2e_Mt_AR5"], "Mt CO2e AR5", 4, row_ids=[r["result_row_id"]],
                    formula="ADM2 module x gas x month row", module=r["module"], gas=r["gas"], month=r["month"],
                    spatial_view=r["spatial_view"], allocation_status=r["allocation_status"],
                    absence_reason=r["absence_reason"], emissions_Gg=r["emissions_Gg"],
                    exactness=r["co2e_exactness"]) for r in rows]
    unalloc = engine._fetch("SELECT module, gas, SUM(CAST(co2e_Mt_AR5 AS %s)) AS exact FROM fact_unallocated WHERE configuration_id = '%s'%s GROUP BY module, gas"
                            % (DECIMAL, conf, (" AND province = '%s'" % (req.province or (geo[0]["parent_id"].split(":")[1] if geo else "")).replace("'", "''")) if (req.province or geo) else ""))
    fields = {"basis": "fiscal", "periods": (REFERENCE_PERIOD,), "configuration_id": conf, "gwp_basis": "AR5",
              "geography_level": "adm2" if req.shape_id else "adm1", "geography_ids": (req.shape_id or req.province,), "spatial_view": "all"}
    return envelope(engine.release, "get_spatial_lineage", canonical_json(req), fields, values,
                    {"kind": "lookup", "table": "fact_adm2_month"}, engine._provenance(["fact_adm2_month", "fact_unallocated"]),
                    evidence={"geography": geo}, unallocated={"by_module_gas": [{"module": r["module"], "gas": r["gas"], "exact": str(r["exact"])} for r in unalloc]},
                    limitations_hit=["no_polygon_units", "ar6_adm2_ne"])


def get_cross_sector_transfer(engine, req):
    where = []
    if req.ledger_id:
        where.append("ledger_id = '%s'" % req.ledger_id)
    if req.configuration_id:
        where.append("configuration_id = '%s'" % req.configuration_id)
    rows = engine._fetch("SELECT * FROM fact_transfer" + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY ledger_id, configuration_id, row_id")
    values = [value(r["value"], r["units"], 4, row_ids=[r["result_row_id"]], formula="%s#%s#%s" % (r["source_file"], r["row_key"], r["value_column"]),
                    ledger_id=r["ledger_id"], row_id=r["row_id"], kind=r["kind"], status=r["status"],
                    origin=r["origin_sector"], destination=r["destination_sector"], configuration_id=r["configuration_id"]) for r in rows]
    return envelope(engine.release, "get_cross_sector_transfer", canonical_json(req), {"basis": "fiscal", "periods": (REFERENCE_PERIOD,), "configuration_id": req.configuration_id or "all"},
                    values, {"kind": "ledger", "closure": "control == transfers + unresolved, per ledger and configuration"}, engine._provenance(["fact_transfer"]))


def _time_origin(variable):
    """The epoch a cube's time axis is counted from, READ from the file.

    This used to be the literal date(2023, 7, 1). That was correct for the monthly cube and
    only for it - the annual cube counts days since 1970-01-01 - so the constant would have
    returned a confidently wrong month the first time the lookup was pointed at history. A CF
    time variable states its own origin; there is no reason to guess it.
    """
    from datetime import date
    units = getattr(variable, "units", "")
    if "since" not in units:
        raise E.GrainUnavailable(
            "the cube's time axis declares no origin (units=%r), so a month cannot be "
            "resolved against it" % units, "grid_not_tabular")
    stamp = units.split("since", 1)[1].strip().split()[0]
    return date.fromisoformat(stamp)


def get_grid_cell(engine, req, cube_paths):
    """cube_paths: {"REF_2023_24": path, "S_2023_24": path, "ANNUAL": path} to the products.

    Three refusals live here rather than in a caller, because a lookup that answers anyway is
    worse than one that declines: a point outside the grid, a survey configuration outside the
    year it was surveyed, and a historical MONTH. The last is the honest shape of the products -
    eight of the nine years have annual cells and no monthly ones, because a historical month's
    seasonal geography is not evidenced and will not be invented to satisfy a query.
    """
    try:
        from netCDF4 import Dataset
    except ImportError as exc:
        raise E.GrainUnavailable("the grid needs netCDF4: %s" % exc, "grid_not_tabular")
    conf = req.configuration_id or engine.release.defaults["configuration_id"]
    period = req.period_id or REFERENCE_PERIOD
    historical = period != REFERENCE_PERIOD

    if historical and conf != "REF_2023_24":
        raise E.NotEstimated(
            "configuration %s exists for %s alone: it is a survey that was run in the "
            "reference year, and there is no historical survey to configure %s from"
            % (conf, REFERENCE_PERIOD, period), "configuration_s_reference_year_only")
    if historical and req.month and req.month != "annual":
        raise E.GrainUnavailable(
            "the monthly grain is the reference year's alone; %s is published annually on the "
            "grid (a historical month's seasonal geography is not evidenced)" % period,
            "grid_monthly_reference_year_only")

    path = cube_paths["ANNUAL"] if historical else cube_paths[conf]
    ds = Dataset(path)
    try:
        lats, lons = ds["lat"][:], ds["lon"][:]
        # A DOMAIN CHECK, BECAUSE argmin ALWAYS SUCCEEDS. Without this, a query for Delhi or
        # for the middle of the Arabian Sea snaps to the nearest edge cell and is returned with
        # a receipt, a digest and four decimal places. Half a cell is the tolerance: outside it
        # the point is not in this grid and the honest answer is that there is no cell.
        half = float(abs(lats[1] - lats[0])) / 2.0
        if (req.lat > float(lats.max()) + half or req.lat < float(lats.min()) - half
                or req.lon > float(lons.max()) + half or req.lon < float(lons.min()) - half):
            raise E.UnknownDimensionValue(
                "(%.4f, %.4f) is outside the Pakistan grid domain (lat %.2f..%.2f, lon "
                "%.2f..%.2f)" % (req.lat, req.lon, float(lats.min()), float(lats.max()),
                                 float(lons.min()), float(lons.max())), "grid_domain")
        i = int(abs(lats - req.lat).argmin()); j = int(abs(lons - req.lon).argmin())

        if historical:
            var = ds["%s_emissions" % req.gas.lower()]
            periods = [str(p) for p in ds["period_id"][:]]
            if period not in periods:
                raise E.UnknownDimensionValue(
                    "%s is not one of the nine gridded periods %s" % (period, periods),
                    "grid_period")
            k = periods.index(period)
            views = [str(v) for v in ds["spatial_view"][:]]
            if req.spatial_view:
                if req.spatial_view not in views:
                    raise E.UnknownDimensionValue(
                        "%s is not a spatial view %s" % (req.spatial_view, views), "grid_view")
                cell = var[k, views.index(req.spatial_view), i, j]
            else:
                cell = var[k, :, i, j].sum()
            # A masked cell is OUTSIDE PAKISTAN, which is a different claim from zero.
            import numpy as _np
            if _np.ma.is_masked(cell):
                raise E.NotEstimated(
                    "(%.4f, %.4f) is inside the grid but outside Pakistan: the cube masks "
                    "non-national cells rather than calling them zero" % (req.lat, req.lon),
                    "grid_outside_country")
            val = float(cell)
        else:
            var = ds["%s_Gg" % req.gas.lower()]
            if req.spatial_view:
                raise E.GrainUnavailable(
                    "the monthly cube carries no spatial_view dimension; views are published "
                    "on the annual grid", "grid_not_tabular")
            if req.month and req.month != "annual":
                from datetime import date
                origin = _time_origin(ds["time"])
                t = int((date(int(req.month[:4]), int(req.month[4:]), 1) - origin).days)
                axis = [int(x) for x in ds["time"][:]]
                if t not in axis:
                    raise E.UnknownDimensionValue(
                        "%s is not a month of %s" % (req.month, REFERENCE_PERIOD), "grid_month")
                val = float(var[axis.index(t), i, j])
            else:
                val = float(var[:, i, j].sum())
        conservation = getattr(ds, "conservation", "")
    finally:
        ds.close()
    v = value(repr(val), "Gg", engine.decimals["emissions_Gg"], formula="cell value read from %s" % os.path.basename(path),
              lat=float(lats[i]), lon=float(lons[j]), row=i, col=j, month=req.month or "annual",
              period_id=period, spatial_view=req.spatial_view or "all (the three views sum)")
    return envelope(engine.release, "get_grid_cell", canonical_json(req),
                    {"basis": "fiscal", "periods": (period,), "configuration_id": conf, "gwp_basis": "native", "geography_level": "grid"},
                    [v], {"kind": "lookup", "table": os.path.basename(path), "conservation": conservation},
                    {"tables": [{"path": "outputs/" + os.path.basename(path), "sha256": engine.release.product_digest("outputs/" + os.path.basename(path))}]},
                    limitations_hit=["grid_not_tabular"])
