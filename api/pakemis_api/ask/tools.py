"""The agent's tools: the eleven contract functions from the generated request models, plus
`set_map_view`, which executes nothing.

Schemas come from `models_gen.MODELS[...].model_json_schema()` with `$defs` inlined and titles
stripped; descriptions are the dataclass docstring, the function's docstring, a "when to call"
line and the allowed values of the release's dimensions. Nothing here names a number of the
release: allowed values are ids and names only, so the prompt can never leak a figure.
"""
import copy
import re

from pakemis_api import models_gen as G
from pakemis_query import Engine, functions as F
from pakemis_query.models import GROUPS, VIEWS

# function name (query_contract.functions) -> request model name (models_gen.MODELS)
FUNCTION_MODEL = {
    "query_emissions": "QueryEmissions",
    "query_air": "QueryAir",
    "compare_emissions": "CompareRequest",
    "get_timeseries": "TimeseriesRequest",
    "get_uncertainty": "UncertaintyRequest",
    "get_completeness": "CompletenessRequest",
    "get_evidence": "EvidenceRequest",
    "get_method": "MethodRequest",
    "get_spatial_lineage": "SpatialLineageRequest",
    "get_cross_sector_transfer": "TransferRequest",
    "get_grid_cell": "GridCellRequest",
    "download_query_result": "DownloadRequest",
    "query_activity": "QueryActivity",
}
# A function the query core answers on a release whose contract was written before the function
# existed, with the tables it needs. query_activity reads only release tables (the fact_activity_*
# family, shipped since rc55, and their dictionary), so a release that holds them can answer it;
# offered AFTER the contract's own functions, and not at all once the contract names it.
BACKFILLED = {"query_activity": ("fact_activity_vehicles", "dim_activity_columns")}
MAP_TOOL = "set_map_view"
DOWNLOAD_TOOL = "download_query_result"
ENGINE_TOOLS = tuple(n for n in FUNCTION_MODEL if n != DOWNLOAD_TOOL)

WHEN_TO_CALL = {
    "query_activity": "ACTIVITY RECORDS, not emissions: how many vehicles are registered in a district and of "
                      "what class, how many animals of a species, how much fuel was sold to a customer group, "
                      "how much electricity a plant generated, what area a crop covered. Call this for any "
                      "question about a COUNT, a STOCK, a QUANTITY SOLD or PRODUCED, or an AREA - never "
                      "query_emissions, which would answer with an emission. Name the `table` and the `measure`; "
                      "leave `periods` empty for the newest figure of each place and class; filter `locations` "
                      "by the place named in the question. Every value comes back with its measure, class, "
                      "place, period, unit, evidence, source series and use note: report those with the figure, "
                      "and report the use note's qualification (a register is a stock, not traffic). For "
                      "\"altogether\" or \"in total\" set `total` true with ONE place, ONE measure and periods "
                      "empty or one period: the LAST cell is then the sum of the classes held, computed by the "
                      "server and marked so - say it is the sum of the classes listed, not a figure the source "
                      "printed. A refusal that names the span of periods held is the answer to a question about "
                      "a year outside it: give the newest figure and say nothing later is held. "
                      "{{result_k_cell_n}} prints the figure as the source printed it and "
                      "{{result_k_cell_n.short}} the same figure as a reader says it. Never add rows yourself, "
                      "never convert a count into an emission, and never answer a count from memory.",
    "query_air": "AIR POLLUTANT EMISSIONS (NOx, SO2, CO, NMVOC, PM2.5, BC, NH3) in native kilotonnes for a fiscal "
                 "period - never CO2e, never a concentration or a measure of air quality, never summed across "
                 "pollutants. ALWAYS give `periods` (the fiscal year in question): that selects the covered-sources "
                 "panel, the sectors the release estimates, nationally and by province and district for all nine "
                 "fiscal years. Grid power is NOT in that panel: it comes back beside the result as a screening "
                 "range (`completeness`: a controlled and an uncontrolled scenario) and must never be added to the "
                 "total, ranked or given a share - say it is outside the total. `years` (1990-2024) asks for "
                 "agriculture's calendar-year history instead; anything else is a typed refusal",
    "query_emissions": "Call this for any emissions figure: a national, provincial (adm1) or district (adm2) total, "
                       "a breakdown by sector, category, gas, month, IPCC code or stream, a filtered sum, or the top-N "
                       "of a grouping. It is the default tool; one call returns one envelope of cells.",
    "compare_emissions": "Call this to difference two scopes stated as two QueryEmissions: two periods, or the two "
                         "configurations (REF_2023_24 vs S_2023_24) of FY2023-24. The cell is the exact difference "
                         "(or ratio in relative mode), never a number you compute yourself.",
    "get_timeseries": "Call this for a series over the fiscal years (step=annual) or over the months (step=monthly) "
                      "of the scope in `query`; the cells are ordered in time and grouped by period_id or month.",
    "get_uncertainty": "Call this for the uncertainty interval of the national total, a category or a series, "
                       "at a resolution (annual, monthly, adm1, adm2, grid).",
    "get_completeness": "Call this for what the inventory does NOT estimate: the notation-key ledger (NE, IE, NO, NA) "
                        "by IPCC code, optionally filtered.",
    "get_evidence": "Call this for the provenance of a source stream, a category or a module: evidence classes, "
                    "source documents, temporal and spatial classes.",
    "get_method": "Call this for the method behind a method_id or a category (equation, tier, parameters).",
    "get_spatial_lineage": "Call this to explain how a district (shape_id) or a province total was allocated: "
                           "allocation status per module, gas and month, and the mass left unallocated.",
    "get_cross_sector_transfer": "Call this for a cross-sector transfer ledger (mass moved between sectors, for "
                                 "example dung, crop residue, delivered gas); empty ledger_id lists every ledger.",
    "get_grid_cell": "Call this for the value of one 0.05-degree grid cell at a latitude/longitude, for a month "
                     "(YYYYMM) or 'annual' and one gas; the grid is a visual product and its cells are native "
                     "gas mass in Gg, not CO2e.",
    "download_query_result": "Call this when the user asks to download or export a result you already obtained "
                             "in this conversation: it returns the CSV and RECEIPT.json links for that receipt. "
                             "It runs no query.",
}

_AUTO_DOC = re.compile(r"^\w+\(.*\)$", re.S)


def _docstring(obj):
    doc = (getattr(obj, "__doc__", "") or "").strip()
    if not doc or _AUTO_DOC.match(doc):        # dataclasses without a docstring get their signature
        return ""
    return " ".join(doc.split())


def inline_schema(schema):
    """Resolve every `$ref` into `$defs` in place, drop `$defs`, strip `title` everywhere."""
    schema = copy.deepcopy(schema)
    defs = schema.pop("$defs", {})

    def walk(node):
        if isinstance(node, dict):
            if "$ref" in node:
                name = node["$ref"].rsplit("/", 1)[-1]
                target = copy.deepcopy(defs[name])
                extra = {k: v for k, v in node.items() if k != "$ref"}
                target.update(extra)
                return walk(target)
            node.pop("title", None)
            if _AUTO_DOC.match(node.get("description", "") or ""):
                node.pop("description")
            return {k: walk(v) for k, v in node.items()}
        if isinstance(node, list):
            return [walk(v) for v in node]
        return node
    return walk(schema)


class Dims:
    """The allowed values of the release, read once from the service."""

    def __init__(self, service):
        rel = service.release
        self.release_id = rel.release_id
        self.version = rel.version
        self.defaults = dict(rel.defaults)
        periods = rel.dim("dim_period")
        self.fiscal_periods = [p["period_id"] for p in periods if p["basis"] == "fiscal"]
        self.calendar_periods = [p["period_id"] for p in periods if p["basis"] == "calendar"]
        self.reference_period = next((p["period_id"] for p in periods if p.get("is_reference") in ("yes", "true", "1", True)), None) \
            or self.defaults.get("period_id")
        confs = [c for c in rel.dim("dim_configuration") if c["queryable"] == "yes"]
        self.configurations = [c["configuration_id"] for c in confs]
        self.configuration_names = {c["configuration_id"]: c["display_name"] for c in confs}
        self.gases = sorted(rel.dim_values("dim_gas", "gas"))
        self.gwp_bases = ["AR5", "AR6"]
        self.views = list(VIEWS)
        self.groups = list(GROUPS)
        # THE AIR TABLES GROUP DIFFERENTLY, AND THE SCHEMA USED TO SAY OTHERWISE. Every request
        # model was enriched with the GHG `GROUPS`, so the query_air tool advertised `gas`,
        # `module`, `spatial_view` and five more the air validator rejects, and omitted
        # `pollutant`, `subitem` and `year`, which it requires. A model that passed `gas` for an
        # air question was following the schema it was given. Read from the engine that does the
        # validating, never re-typed here: a second copy of this list is how the drift started.
        self.air_groups = list(Engine.AIR_GROUPS)
        self.pollutants = sorted(rel.dim_values("dim_pollutant", "pollutant"))
        self.sectors = sorted({s["module"] for s in rel.dim("dim_stream")})
        geo = rel.dim("dim_geography")
        self.adm1_names = sorted(g["name"] for g in geo if g["level"] == "adm1")
        self.adm1_with_polygon = sorted(g["name"] for g in geo if g["level"] == "adm1" and str(g.get("has_polygon", "")).lower() in ("yes", "true", "1"))
        self.adm2 = sorted(({"name": g["name"], "shape_id": g["shape_id"], "geography_id": g["geography_id"],
                             "parent": g.get("parent_id", "")} for g in geo if g["level"] == "adm2" and g["shape_id"]),
                           key=lambda r: r["name"])
        self.adm2_shape_ids = {r["shape_id"] for r in self.adm2}
        self.adm2_by_name = {r["name"]: r["shape_id"] for r in self.adm2}
        months = [m["month"] for m in rel.dim("dim_month")]
        self.months = months
        self.month_min, self.month_max = months[0], months[-1]
        self.spatial_months = [m["month"] for m in rel.dim("dim_month") if m["period_id"] == self.reference_period]
        self.categories = sorted({c["category"] for c in rel.dim("dim_category")})
        self.ipcc_codes = sorted({c["ipcc_code"] for c in rel.dim("dim_category") if c.get("ipcc_code")})
        self.notation_keys = sorted({n["notation_key"] for n in rel.dim("dim_notation_key")}) if "dim_notation_key" in rel.tables else []
        self.method_ids = sorted({r["method_id"] for r in service.method_rows})
        try:
            self.ledger_ids = sorted(r["ledger_id"] for r in service.engine._fetch("SELECT DISTINCT ledger_id FROM fact_transfer"))
        except Exception:           # the table is optional in older releases
            self.ledger_ids = []
        self.limitations = {k: v for k, v in rel.limitations.items() if not k.startswith("completeness:")}
        self.activity_tables = sorted(n for n in rel.tables
                                      if n.startswith("fact_activity_") and n != "fact_activity_source_details")
        self.activity_catalog = activity_catalog(service.engine, self.activity_tables)
        self.activity_levels = sorted({level for entry in self.activity_catalog.values() for level in entry["levels"]})
        self.functions = list(rel.contract["query_contract"]["functions"])
        self.backfilled = [name for name, tables in BACKFILLED.items()
                           if name not in self.functions and all(t in rel.tables for t in tables)]
        self.functions += self.backfilled
        missing = [f for f in self.functions if f not in FUNCTION_MODEL]
        if missing:
            raise RuntimeError("query_contract names functions this agent has no model for: %s" % missing)


# a class column is listed value by value only when a reader could hold the list in mind
ACTIVITY_CLASS_LIST_MAX = 12


def activity_catalog(engine, tables):
    """table -> {measures, class_columns, levels, classes}: what each activity table holds, read from
    the release so the tool names real measures, levels and classes and never a remembered one.
    `classes` is the first class column's values, listed only when there are few of them."""
    out = {}
    for table in tables:
        columns = [r["column_name"] for r in engine._fetch("DESCRIBE %s" % table)]
        if "Measure" not in columns or "Value" not in columns:
            continue
        class_columns = columns[columns.index("Measure") + 1:columns.index("Value")]
        entry = {"class_columns": class_columns,
                 "measures": sorted(r["m"] for r in engine._fetch('SELECT DISTINCT "Measure" AS m FROM %s' % table)),
                 "levels": sorted(r["l"] for r in engine._fetch('SELECT DISTINCT "Location level" AS l FROM %s' % table)),
                 "classes": []}
        if class_columns:
            classes = sorted(r["c"] for r in engine._fetch('SELECT DISTINCT "%s" AS c FROM %s' % (class_columns[0], table))
                             if r["c"])
            if len(classes) <= ACTIVITY_CLASS_LIST_MAX:
                entry["classes"] = classes
        out[table] = entry
    return out


def activity_catalog_text(catalog):
    """One line per table for the tool description: its measures, how it is classed, where it reaches."""
    lines = ["THE ACTIVITY TABLES (measures | classed by | location levels):"]
    for table, entry in catalog.items():
        line = "%s: %s | %s | %s" % (table, "; ".join(entry["measures"]), ", ".join(entry["class_columns"]) or "unclassed",
                                     ", ".join(entry["levels"]))
        if entry["classes"]:
            line += " | %s = %s" % (entry["class_columns"][0], "; ".join(entry["classes"]))
        lines.append(line)
    return "\n".join(lines)


def _field_values(dims, model_name=None):
    """field name -> (allowed values, note) used to enrich the schemas; ids and names only.

    `model_name` exists because the allowed values are NOT global. The air family and the
    greenhouse-gas family share field NAMES and not field VOCABULARIES, and enriching both from one
    dictionary is what told the model to group an air query by `gas`.
    """
    values = {
        "periods": (dims.fiscal_periods + ["CY1990..CY2024 (calendar basis, agriculture only)"], "period ids"),
        "basis": (["fiscal", "calendar"], "calendar only with sectors=[agriculture]"),
        "configuration_id": (dims.configurations, "queryable configurations; S_2023_24 exists for %s only" % dims.reference_period),
        "gwp_basis": (dims.gwp_bases, "AR6 is not carried at adm2"),
        "gases": (dims.gases, ""),
        "sectors": (dims.sectors, "sector ids (modules)"),
        # THE SAME FALSE RESTRICTION THE SYSTEM PROMPT CARRIED, in a second place. The prompt
        # said adm1 was reference-year-only, the engine serves every fiscal year
        # (fact_adm1_year, nine periods; Punjab FY2015-16 is 220.77 Mt), and four of
        # thirty-four evaluation answers refused a historical provincial figure WITHOUT
        # calling a tool - quoting the prompt. The prompt was corrected and this was not, so
        # the model could still read the restriction off the tool schema. A correction that
        # reaches one of two statements of the same fact has not been made.
        "geography_level": (["national", "adm1", "adm2"],
                            "all three carry every fiscal year; the GRID is the reference "
                            "year only, which is a property of that product"),
        "geography_ids": (dims.adm1_names, "province names at adm1; ADM2 shape_ids (see the system prompt) at adm2"),
        "months": (["%s..%s" % (dims.month_min, dims.month_max)], "YYYYMM; adm1/adm2 months %s..%s" % (dims.spatial_months[0], dims.spatial_months[-1]) if dims.spatial_months else "YYYYMM"),
        "spatial_view": (dims.views, ""),
        "group_by": (dims.groups, ""),
        "order_by": (["value desc", "value asc", ""], ""),
        "step": (["annual", "monthly"], ""),
        "mode": (["absolute", "relative"], ""),
        "scope": (["national", "category", "series"], ""),
        "resolution": (["annual", "monthly", "adm1", "adm2", "grid"], ""),
        "notation_keys": (dims.notation_keys, ""),
        "gas": (dims.gases, ""),
        "month": (["%s..%s" % (dims.spatial_months[0], dims.spatial_months[-1]) if dims.spatial_months else "YYYYMM", "annual"], "YYYYMM, or annual (grid) / empty (lineage: the year)"),
        "province": (dims.adm1_names, ""),
        "shape_id": (["an ADM2 shape_id from the system prompt"], ""),
        "ledger_id": (dims.ledger_ids, "empty -> every ledger"),
        "method_id": (dims.method_ids, ""),
        "format": (["csv"], "the explorer serves CSV and RECEIPT.json"),
        "module": (dims.sectors, ""),
    }
    if model_name == "QueryActivity":
        values["table"] = (dims.activity_tables, "one activity table per call; the tool description lists what "
                           "each one measures, how it is classed and which location levels it reaches")
        values["locations"] = (["Pakistan"] + dims.adm1_names + ["district names as printed (e.g. Lahore)"],
                               "place names as the source prints them; empty -> every place")
        values["location_level"] = (dims.activity_levels, "empty -> any level")
        values["periods"] = (["as printed: a date (2023-06-30), FY2023-24, 2023, or a survey round"],
                             "empty -> the latest period of each place and class, which is what a 'how many' "
                             "question wants")
        values["measure"] = (["a measure of the chosen table, exactly as the tool description lists it "
                              "(e.g. 'Registered vehicles')"],
                             "empty -> every measure; a table holding several (vehicles also holds distance and "
                             "fuel-share assumptions) is read one measure at a time")
        values["categories"] = (["values of the table's FIRST class column, exactly as listed or as a previous "
                                 "result printed them (e.g. 'Small cars (4W1)', 'Two-wheelers (2W)')"],
                                "empty -> every class")
        values["geography_level"] = ([], "")
        values["geography_ids"] = ([], "")
    if model_name == "QueryAir":
        values["group_by"] = (dims.air_groups,
                              "the AIR tables; they do not carry gas, module, spatial_view, "
                              "ipcc_code, component_id, month, configuration_id or reporting_sector")
        values["pollutants"] = (dims.pollutants,
                                "air species; the air tables carry `pollutant`, never `gas`. "
                                "Empty -> every pollutant, grouped")
    return values


def _enrich(schema, dims, values):
    """Append allowed values to field descriptions (and an enum for scalar fields with a closed set)."""
    for name, prop in schema.get("properties", {}).items():
        if name in values:
            allowed, note = values[name]
            if allowed:
                text = "Allowed: %s." % ", ".join(str(a) for a in allowed)
                if note:
                    text += " " + note + "."
                prop["description"] = (prop.get("description", "") + " " + text).strip()
                closed = name in ("basis", "gwp_basis", "geography_level", "spatial_view", "step", "mode", "scope", "gas", "table", "location_level")
                if closed and prop.get("type") == "string":
                    enum = list(allowed)
                    if prop.get("default", None) == "" and "" not in enum:
                        enum.append("")
                    prop["enum"] = enum
        if prop.get("type") == "object" and "properties" in prop:
            _enrich(prop, dims, values)
    return schema


def function_tool(name, dims):
    model = G.MODELS[FUNCTION_MODEL[name]]
    schema = _enrich(inline_schema(model.model_json_schema()), dims, _field_values(dims, FUNCTION_MODEL[name]))
    schema.pop("description", None)
    fn = getattr(F, name, None)
    # Request-class prose repeats the field descriptions and WHEN_TO_CALL (especially the
    # activity and air contracts). Keep operational instructions and function-specific notes.
    parts = [p for p in (WHEN_TO_CALL[name], _docstring(fn) if fn else "") if p]
    if name == "query_activity":
        parts.append(activity_catalog_text(dims.activity_catalog))
    return {"name": name, "description": "\n".join(parts), "input_schema": schema}


def map_view_tool(dims):
    return {
        "name": MAP_TOOL,
        "description": "Move the explorer's map to the scope you just answered about. Executes no query and returns "
                       "no cells: it only tells the interface which level, place, period, month, sector, gas, "
                       "configuration, GWP basis and view to show. Call it once, after your data tool calls, whenever "
                       "the answer concerns a place, a period, a sector or a gas. Every field is optional; omit what "
                       "should not change.",
        "input_schema": {
            "type": "object",
            "properties": {
                "level": {"type": "string", "enum": ["adm1", "adm2", "grid"], "description": "map level: provinces, districts, or the 0.05-degree grid"},
                "geo": {"type": "string", "description": "a province name (%s) or an ADM2 shape_id" % ", ".join(dims.adm1_with_polygon or dims.adm1_names)},
                "period": {"type": "string", "enum": dims.fiscal_periods, "description": "fiscal year; provinces and districts are painted for every fiscal year, the grid raster and any month for %s only" % dims.reference_period},
                "month": {"type": "string", "description": "YYYYMM within %s..%s, or 'annual'" % ((dims.spatial_months[0], dims.spatial_months[-1]) if dims.spatial_months else ("", ""))},
                "sector": {"type": "string", "enum": dims.sectors},
                "gas": {"type": "string", "enum": dims.gases},
                "pol": {"type": "string", "enum": dims.pollutants, "description": "an air pollutant: the map shows its emissions (kt) instead of greenhouse gases; give it INSTEAD OF gas, never with it"},
                "config": {"type": "string", "enum": dims.configurations},
                "gwp": {"type": "string", "enum": dims.gwp_bases},
                "view": {"type": "string", "enum": dims.views},
            },
            "additionalProperties": False,
        },
    }


class ToolInputError(ValueError):
    pass


def validate_map_view(payload, dims):
    """-> the map_action dict (only the fields given), or ToolInputError naming the bad field."""
    if not isinstance(payload, dict):
        raise ToolInputError("set_map_view takes an object")
    allowed = {"level": ("adm1", "adm2", "grid"), "sector": dims.sectors, "gas": dims.gases, "pol": dims.pollutants,
               "config": dims.configurations, "gwp": dims.gwp_bases, "view": dims.views, "period": dims.fiscal_periods}
    action = {}
    for key, value in payload.items():
        if value in (None, ""):
            continue
        if key in allowed:
            if value not in allowed[key]:
                raise ToolInputError("%s=%r is not one of %s" % (key, value, ", ".join(allowed[key])))
            action[key] = value
        elif key == "month":
            if value != "annual" and value not in dims.spatial_months and value not in dims.months:
                raise ToolInputError("month=%r is not a month of the release (%s..%s) or 'annual'" % (value, dims.month_min, dims.month_max))
            action[key] = value
        elif key == "geo":
            if value in dims.adm1_names:
                action[key] = value
                action.setdefault("level", "adm1")
            elif value in dims.adm2_shape_ids:
                action[key] = value
                action.setdefault("level", "adm2")
            elif value in dims.adm2_by_name:
                action[key] = dims.adm2_by_name[value]
                action.setdefault("level", "adm2")
            else:
                raise ToolInputError("geo=%r is neither a province (%s) nor an ADM2 shape_id" % (value, ", ".join(dims.adm1_names)))
        else:
            raise ToolInputError("set_map_view has no field %r" % key)
    # one metric: a pollutant and a gas are different quantities, and a pollutant has no grid layer or month
    if "pol" in action:
        for key in ("gas", "month"):
            if key in action:
                raise ToolInputError("set_map_view takes pol OR %s, not both: an air pollutant is not a greenhouse gas and has no monthly layer" % key)
        if action.get("level") == "grid":
            raise ToolInputError("level='grid' has no air-pollutant layer; use adm1 or adm2 with pol")
    if action.get("level") == "grid" and "gas" not in action:
        action["gas"] = dims.gases[0] if "CO2" not in dims.gases else "CO2"
    return action


def build_tools(dims):
    """The tool list in contract order: query_contract.functions, any BACKFILLED function the release's
    tables can answer, then set_map_view."""
    return [function_tool(name, dims) for name in dims.functions] + [map_view_tool(dims)]
