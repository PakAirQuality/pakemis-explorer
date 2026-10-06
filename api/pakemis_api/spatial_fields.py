"""The map's per-cell evidence fields on an ADM1 or ADM2 query_emissions envelope.

Every cell of an envelope at province or district grain gains, beside the core's `exactness`:

    allocation_status   the distinct allocation_status values of the rows the cell sums
                        (fact_adm2_month), joined by ';' in alphabetical order
    spatial_class       the spatial_class_measured of the cell's dominant stream (fact_evidence)
    placement_class     that stream's placement_class
    allocation_surface  that stream's allocation_surface
    dominant_module     the module the class is read from
    dominant_stream     the stream the class is read from
    spatial_class_basis one sentence stating the rule applied to this cell

The rule (SPATIAL_CLASS_RULE, published under /release rounding.presentation.derived.spatial_class):
the cell's module is the one its group names, else the one sector the request filters, else the
module whose rows sum to the largest co2e_Mt_AR5 among the cell's rows (a server-side sum used
only to choose, never printed); the module's dominant stream is the stream (of the cell's gas when
the cell names one) with the largest fact_annual co2e_Mt_AR5 at the reference period and
configuration, compared as decimals; the class is that stream's fact_evidence row. The fields are
labels about the evidence behind an allocation, not observations of the district: a cell that
sums several modules carries the class of one of them and says which.

The lookups run in the claim store's read-only DuckDB session (the fact tables as text) and add
no number to the envelope; the receipt and result_sha256 were minted before this runs.
"""
import json
from decimal import Decimal

import pyarrow as pa

from pakemis_api.presentation import SPATIAL_CLASS_FIELD, SPATIAL_CLASS_RULE, SPATIAL_COMPANIONS

class SpatialFields:
    """Built once at startup from the claim store: the dominant stream per module and per
    module x gas, with its evidence row."""

    def __init__(self, store):
        self.store = store
        release = store.release
        self.period = release.defaults["period_id"]
        self.configuration = release.defaults["configuration_id"]
        rows = store._fetch("SELECT source_stream_id, sector_id AS module, gas, co2e_Mt_AR5 FROM fact_annual "
                            "WHERE period_id = '%s' AND configuration_id = '%s' AND geography_id = 'PK' AND co2e_Mt_AR5 <> ''"
                            % (self.period, self.configuration))
        self.by_module = {}
        self.by_module_gas = {}
        for r in rows:
            key = (r["source_stream_id"], Decimal(r["co2e_Mt_AR5"]))
            self._keep(self.by_module, r["module"], key)
            self._keep(self.by_module_gas, (r["module"], r["gas"]), key)

    @staticmethod
    def _keep(index, key, candidate):
        stream, mass = candidate
        held = index.get(key)
        if held is None or mass > held[1] or (mass == held[1] and stream < held[0]):
            index[key] = candidate

    def dominant(self, module, gas=""):
        found = self.by_module_gas.get((module, gas)) if gas else None
        if found is None:
            found = self.by_module.get(module)
        return found[0] if found else None

    def decorate(self, env):
        """Adds the fields to every cell of an adm1 or adm2 query_emissions envelope; leaves any
        other envelope alone.

        ⚠ ADM1 WAS EXCLUDED, AND THAT WAS THE GAP THAT MATTERED. A district cell carried its
        spatial class, placement class and allocation surface; a PROVINCE cell carried nothing. So a
        reader shown "Punjab 27.49 Mt CO2e" had no way to learn - and no interface had any way to
        say - that the figure is a national fuel total allocated downward by a road-density proxy,
        not an observation of Punjab. Every consumer that wanted to mark a number as modelled was
        blind at exactly the grain people ask about most.

        This adds no number and changes no receipt: the receipt and result_sha256 are minted before
        it runs.
        """
        if env.get("request_type") != "query_emissions":
            return env
        try:
            req = json.loads(env.get("request") or "")
        except (TypeError, ValueError):
            return env
        level = req.get("geography_level") if isinstance(req, dict) else None
        if level not in ("adm1", "adm2"):
            return env
        cells = env.get("values") or []
        if not cells:
            return env
        sectors = list(req.get("sectors") or ())
        gases = list(req.get("gases") or ())
        pairs = [(i, rid) for i, c in enumerate(cells) for rid in (c.get("result_row_ids") or ()) if rid]
        by_cell = self._rows_by_cell(pairs, level)
        for i, cell in enumerate(cells):
            group = cell.get("group") or {}
            rows = by_cell.get(i, [])
            statuses = sorted({r["allocation_status"] for r in rows if r["allocation_status"]})
            module, how = None, ""
            if group.get("module"):
                module, how = group["module"], "the cell's module"
            elif len(sectors) == 1:
                module, how = sectors[0], "the request's one sector"
            elif rows:
                sums = {}
                for r in rows:
                    sums[r["module"]] = sums.get(r["module"], Decimal(0)) + Decimal(r["co2e_Mt_AR5"] or "0")
                module = sorted(sums, key=lambda m: (-sums[m], m))[0]
                how = "the module whose rows sum to the largest co2e_Mt_AR5 among the %d rows summed (%d modules)" % (len(rows), len(sums))
            gas = group.get("gas") or (gases[0] if len(gases) == 1 else "")
            stream = self.dominant(module, gas) if module else None
            ev = self.store.evidence_by_stream.get(stream) if stream else None
            cell["allocation_status"] = ";".join(statuses)
            cell[SPATIAL_CLASS_FIELD] = ev["spatial_class_measured"] if ev else None
            cell["placement_class"] = ev["placement_class"] if ev else None
            cell["allocation_surface"] = ev["allocation_surface"] if ev else None
            cell["dominant_module"] = module
            cell["dominant_stream"] = stream
            if ev:
                cell["spatial_class_basis"] = ("%s of %s, the %s stream with the largest reference-year mass in %s (%s)"
                                               % (ev["spatial_class_measured"], stream, gas or "any-gas", module, how))
            elif not rows and not module and env.get("calculation", {}).get("table") in ("fact_adm1_year", "fact_adm2_year"):
                # an earlier year's cell with no one sector named: the class registry is the
                # reference year's and its rows are keyed to the reference year's tables, so there
                # is nothing to read a dominant stream FROM - which is not the same as failing to
                # read one, and the sentence used to say the latter
                cell["spatial_class_basis"] = ("the release classes placement for the reference year (%s); this cell is another year's "
                                               "and names no single sector, so no class is given rather than the reference year's borrowed"
                                               % self.period)
            else:
                cell["spatial_class_basis"] = "no dominant stream could be read for this cell" + (" (module %s)" % module if module else "")
        env["spatial_fields"] = {"rule": SPATIAL_CLASS_RULE, "reference": {"period_id": self.period, "configuration_id": self.configuration},
                                 "fields": [SPATIAL_CLASS_FIELD] + SPATIAL_COMPANIONS}
        return env

    # the fact table a grain's result_row_ids live in. `allocation_status` is an ADM2 allocation-ledger
    # column and has no ADM1 counterpart, so the province query selects a literal empty string for it
    # rather than pretending the concept exists there.
    # Only the tables the claim store registers (claim.FACT_TABLES) may be named here. `fact_adm1_year`
    # is NOT among them, so an annual province result finds no rows and falls back to the request's
    # one sector for its module - which is the common shape of the question that needs this most
    # ("how much transport in Punjab"). A cell that names no single module carries no class, and says
    # so, rather than borrowing one.
    _ROW_SOURCE = {
        "adm2": "SELECT result_row_id, module, allocation_status, co2e_Mt_AR5 FROM fact_adm2_month",
        "adm1": "SELECT result_row_id, module, '' AS allocation_status, co2e_Mt_AR5 FROM fact_adm1_month",
    }

    def _rows_by_cell(self, pairs, level="adm2"):
        """{cell index: [{module, allocation_status, co2e_Mt_AR5}]} in one query over the cells' rows."""
        if not pairs or level not in self._ROW_SOURCE:
            return {}
        table = pa.table({"cell": pa.array([p[0] for p in pairs], pa.int32()), "result_row_id": pa.array([p[1] for p in pairs], pa.string())})
        with self.store._lock:
            con = self.store.con
            con.register("cell_rows", table)
            try:
                cur = con.execute("SELECT c.cell, f.module, f.allocation_status, f.co2e_Mt_AR5 FROM cell_rows c "
                                  "JOIN (%s) f ON f.result_row_id = c.result_row_id" % self._ROW_SOURCE[level])
                fetched = cur.fetchall()
            finally:
                con.unregister("cell_rows")
        out = {}
        for cell, module, status, low in fetched:
            out.setdefault(cell, []).append({"module": module or "", "allocation_status": status or "", "co2e_Mt_AR5": low or ""})
        return out
