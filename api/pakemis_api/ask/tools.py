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
# THE ACTIVITY FILES, AS THE DOWNLOADS PAGE LISTS THEM (2026-11-09). Asked "can I get the activity
# data?", the model copied the prompt's five-bullet example, because nothing told it which files the
# page offers. This tool does, and executes no query. It hands the model each file's TABLE and what
# that table measures - never the page's title or description: the model writes
# {{download:<table>}} per file and the web app draws the title, description and coverage from the
# page's own catalogue, so the text is the page's by construction rather than a paraphrase of it.
CATALOG_TOOL = "list_activity_files"
# THE ARITHMETIC, DONE ON THE SERVER (2026-11; ask/arith.py): add_up sums the rows of a result this
# message already fetched, grouped as the model asks; calculate combines a few numbers exactly.
ADD_UP_TOOL = "add_up"
CALC_TOOL = "calculate"
# The two files that explain the others rather than hold activity. They go with every answer.
ACTIVITY_HELPERS = {
    "fact_activity_source_details": "the technical source fields behind every activity row (source file, row, "
                                    "column, transformation, evidence, whether rows may be combined), joined to "
                                    "the tables on Record ID",
    "dim_activity_columns": "the column guide: what every column of every activity table means, one line per column",
}
# The order of "The activity behind the estimates" on the Downloads page for a release that ships no
# download_catalog of its own (web/src/components/downloads/catalogue.ts, COLLECTIONS, collection
# "activity"); api/tests/test_ask_activity_files.py holds the two in step. A release that ships the
# catalogue is listed in its order instead (activity_file_order).
ACTIVITY_FILE_ORDER = (
    "fact_activity_fuel_sales_national", "fact_activity_fuel_sales_area", "fact_activity_livestock",
    "fact_activity_crops", "fact_activity_fertiliser", "fact_activity_power_plants",
    "fact_activity_power_monthly", "fact_activity_household_fuel", "fact_activity_industry_fuel",
    "fact_activity_industry_production", "fact_activity_gas_supply", "fact_activity_gas_network",
    "fact_activity_waste_services", "fact_activity_waste_flows", "fact_activity_railways",
    "fact_activity_aviation", "fact_activity_source_details", "dim_activity_columns",
    "fact_activity_vehicles",
)
ENGINE_TOOLS = tuple(n for n in FUNCTION_MODEL if n != DOWNLOAD_TOOL)

WHEN_TO_CALL = {
    "query_activity": "ACTIVITY RECORDS, not emissions: how many vehicles are registered in a district and of "
                      "what class, how many animals of a species, how much fuel was sold to a customer group, "
                      "how much electricity a plant generated, what area a crop covered. Call this for any "
                      "question about a COUNT, a STOCK, a QUANTITY SOLD or PRODUCED, or an AREA - never "
                      "query_emissions, which would answer with an emission. Name the `table` and the `measure`. "
                      "`locations`: the place named in the question; a province name selects its districts. "
                      "`categories`: values of ANY class column - several from different columns narrow together "
                      "(\"Petrol / motor spirit (MS)\" and \"Road transport\"). `periods`: empty for the newest of "
                      "each place (a province's districts at the province register's date); a period or a year "
                      "(\"2023\" is its dates and months; a fiscal year \"FY 2023-24\" is its row and its months "
                      "July to June); [\"all\"] for every period held - a series or a change "
                      "over time. The result comes back as a TABLE: `shared` (what every row has in common), "
                      "`columns` and `rows` (the first column `i` is the row's cell number), the use notes and the "
                      "release's rules for adding rows (`notes`, `rules`), and `older_only` (places whose records "
                      "stop earlier and are not in the rows). A large selection comes back as `rows_not_sent` with "
                      "each column's values: add it up with add_up rather than narrowing it to fit. Report the use "
                      "note's qualification with a figure (a register is a stock, not traffic). A refusal that names "
                      "the span of periods held is the answer to a question about a year outside it: give the newest "
                      "figure and say nothing later is held. To add rows up, call add_up - never add many numbers "
                      "yourself; never convert a count into an emission, and never answer a count from memory.",
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
    CATALOG_TOOL: "ACTIVITY FILES ON THE DOWNLOADS PAGE, not figures: call this whenever a question asks what "
                  "activity data there is, or how to get, download, find, check or reuse it (vehicles, livestock, "
                  "crops, fertiliser, fuel sales, gas, power plants, household and industry fuel, waste, railways, "
                  "aviation - the records the estimates are calculated from). It runs no query and takes no input. "
                  "It returns every activity file the Downloads section \"The activity behind the estimates\" offers, "
                  "in the page's order, each with what it measures so you can tell which ones the question is about. "
                  "Write each file you list as {{download:<table>}} on a bullet line of its own; never write its title "
                  "or description yourself.",
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
        self.activity_file_order = activity_file_order(getattr(getattr(service, "products", None), "download_catalog", None))
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


def activity_file_order(download_catalog=None):
    """The tables of the Downloads page's activity section, in the page's order: the release's own
    catalogue when it ships one (the page then reads the same), else ACTIVITY_FILE_ORDER."""
    for collection in (download_catalog or {}).get("collections") or ():
        if collection.get("id") == "activity":
            tables = [f.rsplit(".", 1)[0] for item in collection.get("downloads") or ()
                      if not item.get("pending") for f in (item.get("files") or ())[:1]]
            if tables:
                return tuple(dict.fromkeys(tables))
    return ACTIVITY_FILE_ORDER


def activity_files(dims, served):
    """What list_activity_files hands the model: one entry per activity file the release serves as a
    CSV, in the page's order, each saying what it holds (from the release's own tables, never the
    page's wording). An activity table the page does not list yet follows the listed ones, so nothing
    the release serves is hidden; a listed table the release does not serve is left out."""
    def entry(table):
        if table in ACTIVITY_HELPERS:
            return {"table": table, "kind": "guide to the other files", "holds": ACTIVITY_HELPERS[table]}
        info = dims.activity_catalog.get(table) or {}
        out = {"table": table, "kind": "activity records",
               "measures": info.get("measures") or [], "classed_by": info.get("class_columns") or [],
               "location_levels": info.get("levels") or []}
        if info.get("classes"):
            out["classes"] = info["classes"]
        return out
    known = set(dims.activity_tables) | set(ACTIVITY_HELPERS)
    order = list(dims.activity_file_order) + sorted(known - set(dims.activity_file_order))
    return [entry(t) for t in order if t in served]


def catalog_tool(dims):
    """list_activity_files: no input. For Gemini the declaration leaves an empty parameter object
    out altogether (gemini.function_declaration), the documented form of a function with no input."""
    return {"name": CATALOG_TOOL, "description": WHEN_TO_CALL[CATALOG_TOOL],
            "input_schema": {"type": "object", "properties": {}}}


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
        values["periods"] = (["as printed: a date (2023-06-30), a fiscal year FY 2023-24 (with its months), a year 2023 (with its dates and months), or a survey round (HIES 2024-25)"],
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


def add_up_tool():
    return {
        "name": ADD_UP_TOOL,
        "description": (
            "ADD UP THE ROWS OF A RESULT, EXACTLY, ON THE SERVER. Call this for every total, breakdown, share or "
            "ranking that needs more than two or three numbers added: vehicles in a province by class "
            "(group_by [\"Vehicle class\"]), every province's total (group_by [\"Province\"]), the largest districts "
            "(group_by [\"Location\"]), a series by year (group_by [\"Period\"]), fuel sold in a year (the months "
            "added). `result` is the number of an earlier tool call of this message (1-based, counted like "
            "{{result_k_...}}); you may call add_up in the SAME message right after the query_activity it adds up, "
            "naming that call's number. `group_by` and `where` take the result's column names (Location, Province, "
            "Period, Location level, Measure, Evidence, Unit and the table's class columns, such as \"Vehicle class\"). "
            "`where` keeps only rows whose column holds one of the values. It never adds different units or measures "
            "together (they come back apart), skips rows with no value, and returns each group's sum, row count and "
            "share of the total (and its own date, when the groups' dates differ), the totals, what the sums "
            "cover, and `check_before_reporting`: the release's rules "
            "for adding these rows and any overlap (stocks added across dates, printed totals with their parts, "
            "national rows with district rows). Read those before you report a sum, and redo the call with `where` "
            "or `group_by` when one says the sum is not meaningful."),
        "input_schema": {
            "type": "object",
            "properties": {
                "result": {"type": "integer", "description": "the tool call number whose rows to add up"},
                "group_by": {"type": "array", "items": {"type": "string"},
                             "description": "column names to group by; empty -> one sum (per measure and unit)"},
                "where": {"type": "array", "description": "keep only the rows matching every entry",
                          "items": {"type": "object",
                                    "properties": {"column": {"type": "string"},
                                                   "values": {"type": "array", "items": {"type": "string"}}},
                                    "required": ["column", "values"]}},
            },
            "required": ["result"],
        },
    }


def calculate_tool():
    return {
        "name": CALC_TOOL,
        "description": (
            "EXACT ARITHMETIC ON A FEW NUMBERS: a difference, a ratio, a percentage, a growth rate. Call this "
            "instead of working a figure out yourself, whenever you report a number no result printed (a change "
            "from 2015 to 2023, a share, an average annual growth). Each expression uses numbers, + - * / ** and "
            "parentheses, and may use the name of an earlier expression in the same call: "
            "[{name: \"change\", expression: \"18434072 - 9563120\"}, {name: \"pct\", expression: \"change / 9563120 * 100\"}]. "
            "Results come back rounded to six decimals; round them as a reader would when you write them."),
        "input_schema": {
            "type": "object",
            "properties": {
                "expressions": {"type": "array", "items": {"type": "object",
                                                           "properties": {"name": {"type": "string"},
                                                                          "expression": {"type": "string"}},
                                                           "required": ["name", "expression"]}},
            },
            "required": ["expressions"],
        },
    }


def build_tools(dims):
    """The tool list in contract order: query_contract.functions, any BACKFILLED function the release's
    tables can answer, list_activity_files when the release holds activity tables, then add_up,
    calculate and set_map_view."""
    catalog = [catalog_tool(dims)] if dims.activity_tables else []
    return ([function_tool(name, dims) for name in dims.functions] + catalog
            + [add_up_tool(), calculate_tool(), map_view_tool(dims)])
