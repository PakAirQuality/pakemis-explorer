"""The unallocated block of a province or district answer, for the scope that was ASKED.

A spatial query_emissions envelope carries, beside its cells, the mass the release keeps at
province level and places no finer - today the cruise share of domestic aviation, whose corridors
no held evidence can draw. The core builds that block in `engine._unallocated_for`, and the block
it builds is the REFERENCE YEAR'S, WHOLE:

  * `fact_unallocated` has no period column - it is the reference year's table, 180 rows - and the
    core attaches it to a request for any year. A FY2015-16 answer therefore said 0.25 Mt retained
    where that year's own figure is 0.40 Mt, and this service then derived "400.84 placed" from it
    where 400.69 is right. Every year read 0.25; Punjab read 0.04 in a year it was 0.07.
  * it filters on configuration, months, province and sector, and NOT on gas or spatial view. A
    methane-only answer still carried the all-gas 0.25 (methane's share is 0.00005), and so did an
    answer restricted to the `physical` view, in which no retained mass exists at all - every
    unallocated row is in the `accounting` view.

The selected year's figure needs no new data. The streams `fact_unallocated` names are ordinary
rows of the province tables (`fact_adm1_year` for the back years), and the release's own closure
is that ADM1 equals ADM2 plus exactly those rows, per gas, per view and per period - which
tests/test_derived_unallocated.py asserts for all nine. So the block is rebuilt here from:

    reference year, AR5        fact_unallocated                    (the core's rows, unchanged)
    reference year, other GWP  fact_adm1_month, the cells' column  (the block in the cells' basis)
    any other year             fact_adm1_year, the request's periods

each filtered by everything the request filtered its cells by. `Service.run` is the one path the
HTTP route and the assistant's tool both take, and the core is vendored, so this is where it is
closed; the same repair belongs in the engine (`_unallocated_for`) and this module goes when the
vendored core carries it.

It adds no cell and changes none: `unallocated` is outside the result digest, so the receipt and
`result_sha256` the core minted stand. A scope with no retained mass gets an EMPTY list, as it
always has - never a zero row - and so no derived strings.
"""
import json

from pakemis_query.engine import DECIMAL, REFERENCE_PERIOD, REPORTING_SECTOR_KEY

SOURCE_TABLE = "fact_unallocated"
YEAR_TABLES = ("fact_adm1_year", "fact_adm2_year")
MONTH_TABLES = ("fact_adm1_month", "fact_adm2_month")
AR5 = "co2e_Mt_AR5"


class OwnUnallocated:
    def __init__(self, engine):
        self.engine = engine

    def apply(self, env):
        """Replaces the core's unallocated block on an adm1 / adm2 query_emissions envelope with
        the block for the request's own periods, gases and spatial view; leaves every other
        envelope alone. Returns the envelope."""
        if env.get("request_type") != "query_emissions":
            return env
        block = env.get("unallocated")
        if not isinstance(block, dict) or "by_province" not in block:
            return env
        try:
            req = json.loads(env.get("request") or "")
        except (TypeError, ValueError):
            return env
        calculation = env.get("calculation") or {}
        table = calculation.get("table")
        if not isinstance(req, dict) or table not in YEAR_TABLES + MONTH_TABLES:
            return env
        source, column, time = self._source(req, table, calculation.get("column") or AR5)
        e = self.engine
        configuration = "configuration_id = '%s'" % str(req.get("configuration_id") or "").replace("'", "''")
        where = [configuration] + time
        if source != SOURCE_TABLE:
            # the streams the release retains at ADM1 are the ones its unallocated table names
            where.append("source_stream_id IN (SELECT DISTINCT source_stream_id FROM %s WHERE %s)" % (SOURCE_TABLE, configuration))
        if req.get("geography_level") == "adm1" and req.get("geography_ids"):
            where.append(e._in("province", req["geography_ids"]))
        for key, col in (("sectors", "module"), ("reporting_sectors", REPORTING_SECTOR_KEY), ("gases", "gas"), ("streams", "source_stream_id")):
            if req.get(key):
                where.append(e._in(col, req[key]))
        view = req.get("spatial_view") or "all"
        if view != "all":
            where.append("spatial_view = '%s'" % str(view).replace("'", "''"))
        rows = e._fetch("SELECT province, SUM(CAST(%s AS %s)) AS exact, COUNT(*) AS n FROM %s WHERE %s AND %s <> '' GROUP BY province ORDER BY province"
                        % (column, DECIMAL, source, " AND ".join(where), column))
        block["by_province"] = [{"province": r["province"], "exact": str(r["exact"]), "n_rows": r["n"]} for r in rows]
        # what the block is OF, so no reader has to assume it is the year on screen
        block["periods"] = list(req.get("periods") or ())
        block["table"] = source
        self._provenance(env, source)
        return env

    def _source(self, req, table, cells_column):
        """(table, mass column, time filters) the block is read from."""
        e_in = self.engine._in
        if table in YEAR_TABLES:
            return "fact_adm1_year", AR5, [e_in("period_id", req.get("periods") or (REFERENCE_PERIOD,))]
        time = [e_in("month", req["months"])] if req.get("months") else []
        # a province answer in another warming-potential basis: the block in that basis, from the
        # table its cells came from. District cells are AR5 whatever was asked (the core refuses
        # anything else), and AR5 is the unallocated table's own unit.
        if table == "fact_adm1_month" and cells_column != AR5:
            return "fact_adm1_month", cells_column, time
        return SOURCE_TABLE, AR5, time

    def _provenance(self, env, source):
        provenance = env.get("provenance")
        if not isinstance(provenance, dict) or not isinstance(provenance.get("tables"), list):
            return
        if any(isinstance(t, dict) and t.get("table") == source for t in provenance["tables"]):
            return
        provenance["tables"].extend(self.engine._provenance([source])["tables"])
