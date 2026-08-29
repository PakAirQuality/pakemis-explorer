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
from pakemis_query import functions as F
from pakemis_query.models import GROUPS, VIEWS

# function name (query_contract.functions) -> request model name (models_gen.MODELS)
FUNCTION_MODEL = {
    "query_emissions": "QueryEmissions",
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
}
MAP_TOOL = "set_map_view"
DOWNLOAD_TOOL = "download_query_result"
ENGINE_TOOLS = tuple(n for n in FUNCTION_MODEL if n != DOWNLOAD_TOOL)

WHEN_TO_CALL = {
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
        self.functions = list(rel.contract["query_contract"]["functions"])
        missing = [f for f in self.functions if f not in FUNCTION_MODEL]
        if missing:
            raise RuntimeError("query_contract names functions this agent has no model for: %s" % missing)


def _field_values(dims):
    """field name -> (allowed values, note) used to enrich the schemas; ids and names only."""
    return {
        "periods": (dims.fiscal_periods + ["CY1990..CY2024 (calendar basis, agriculture only)"], "period ids"),
        "basis": (["fiscal", "calendar"], "calendar only with sectors=[agriculture]"),
        "configuration_id": (dims.configurations, "queryable configurations; S_2023_24 exists for %s only" % dims.reference_period),
        "gwp_basis": (dims.gwp_bases, "AR6 is not carried at adm2"),
        "gases": (dims.gases, ""),
        "sectors": (dims.sectors, "sector ids (modules)"),
        "geography_level": (["national", "adm1", "adm2"], "adm1/adm2 exist for %s only" % dims.reference_period),
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
                closed = name in ("basis", "gwp_basis", "geography_level", "spatial_view", "step", "mode", "scope", "gas")
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
    schema = _enrich(inline_schema(model.model_json_schema()), dims, _field_values(dims))
    schema.pop("description", None)
    dc = G.BY_NAME[FUNCTION_MODEL[name]]
    fn = getattr(F, name, None)
    parts = [p for p in (_docstring(dc), _docstring(fn) if fn else "", WHEN_TO_CALL[name]) if p]
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
                "period": {"type": "string", "enum": dims.fiscal_periods, "description": "fiscal year; the map paints %s only and shows a refusal for other years" % dims.reference_period},
                "month": {"type": "string", "description": "YYYYMM within %s..%s, or 'annual'" % ((dims.spatial_months[0], dims.spatial_months[-1]) if dims.spatial_months else ("", ""))},
                "sector": {"type": "string", "enum": dims.sectors},
                "gas": {"type": "string", "enum": dims.gases},
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
    allowed = {"level": ("adm1", "adm2", "grid"), "sector": dims.sectors, "gas": dims.gases, "config": dims.configurations,
               "gwp": dims.gwp_bases, "view": dims.views, "period": dims.fiscal_periods}
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
    if action.get("level") == "grid" and "gas" not in action:
        action["gas"] = dims.gases[0] if "CO2" not in dims.gases else "CO2"
    return action


def build_tools(dims):
    """The tool list in contract order: query_contract.functions, then set_map_view."""
    return [function_tool(name, dims) for name in dims.functions] + [map_view_tool(dims)]
