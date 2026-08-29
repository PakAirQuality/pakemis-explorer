/**
 * Humanised labels. Every wording comes from /release.labels (built server-side from the
 * dims) or from a dim row; this module only looks ids up and formats compound ids. The one
 * hand-written map is the column-name dictionary (envelope group keys -> column headings),
 * which names fields of the contract, never ids or values.
 */
import type { Labels } from "./release";
import type { Adm2Row, Adm1Row } from "./release";

export type Dims = { adm1: Adm1Row[]; adm2: Adm2Row[] };

export const COLUMN_NAMES: Record<string, string> = {
  province: "Province",
  shape_id: "District",
  module: "Sector",
  sector_id: "Sector",
  gas: "Gas",
  month: "Month",
  period_id: "Period",
  ipcc_code: "IPCC code",
  category: "Category",
  ipcc_category: "IPCC category",
  source_stream_id: "Stream",
  spatial_view: "View",
  allocation_status: "Allocation",
  display: "Value",
  unit: "Unit",
  exact: "Exact",
  exact_high: "Exact (high)",
  n_rows: "Rows",
  configuration_id: "Configuration",
  gwp_basis: "GWP",
  notation_key: "Notation key",
  evidence_class: "Evidence class",
  temporal_class: "Temporal class",
  spatial_class_measured: "Spatial class",
  placement_class: "Placement class",
  allocation_surface: "Allocation surface",
  temporal_evidence_grade: "Timing grade",
  licence_status: "Licence",
  method_id: "Method",
  uncertainty_model_id: "Uncertainty model",
  emissions_Gg: "Gg",
  absence_reason: "Absence reason",
};

export function columnLabel(key: string): string {
  return COLUMN_NAMES[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function periodLabel(labels: Labels, id: string): string {
  return labels.periods[id]?.label ?? id;
}
export function periodShort(labels: Labels, id: string): string {
  return labels.periods[id]?.short ?? id;
}
export function monthLabel(labels: Labels, id: string | null | undefined): string {
  if (!id) return "Annual";
  return labels.months[id] ?? id;
}
/** "Jul 23" for the rail. */
export function monthTiny(labels: Labels, id: string): string {
  const full = labels.months[id];
  if (!full) return id;
  const [mon, year] = full.split(" ");
  return `${mon} ${year?.slice(2) ?? ""}`.trim();
}
export function configLabel(labels: Labels, id: string): string {
  return labels.configurations[id]?.label ?? id;
}
export function configLetter(labels: Labels, id: string): string {
  return labels.configurations[id]?.letter || labels.configurations[id]?.label || id;
}
export function sectorLabel(labels: Labels, id: string | null | undefined): string {
  if (!id) return "All sectors";
  return labels.sectors[id] ?? id;
}
export function gasLabel(labels: Labels, id: string | null | undefined): string {
  if (!id) return "All gases";
  return labels.gases[id] ?? labels.gases[id.toUpperCase()] ?? id;
}
export function viewLabel(labels: Labels, id: string): string {
  return labels.views[id] ?? id;
}
export function limitationText(labels: Labels, id: string): string {
  return labels.limitations[id] ?? id;
}
export function geographyName(labels: Labels, id: string): string {
  return labels.geographies[id] ?? labels.geographies[`ADM1:${id}`] ?? id;
}

/** The dim rows sharing an ADM2 shape (several census units draw one polygon). */
export function adm2RowsForShape(dims: Dims, shapeId: string): Adm2Row[] {
  return dims.adm2.filter((r) => r.shape_id === shapeId);
}
export function districtName(dims: Dims, shapeId: string): string {
  const rows = adm2RowsForShape(dims, shapeId);
  if (!rows.length) return shapeId;
  return rows[0].shape_name || rows.map((r) => r.name).join(" / ");
}
export function provinceOfShape(dims: Dims, shapeId: string): string {
  const row = adm2RowsForShape(dims, shapeId)[0];
  return row ? row.parent_id.replace(/^ADM1:/, "") : "";
}

/** "agriculture › enteric fermentation › buffalo › CH₄" from "agriculture|enteric-fermentation|buffalo|ch4". */
export function streamLabel(labels: Labels, streamId: string): string {
  return streamId
    .split("|")
    .map((part, i, arr) => {
      if (i === arr.length - 1) {
        const gas = labels.gases[part.toUpperCase()];
        if (gas) return gas;
      }
      if (i === 0 && labels.sectors[part]) return labels.sectors[part];
      return part.replace(/[-_]/g, " ");
    })
    .join(" › ");
}

/** A group value as a human reads it; the id stays available as secondary text. */
export function groupValueLabel(labels: Labels, dims: Dims, key: string, value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  switch (key) {
    case "shape_id":
      return districtName(dims, value);
    case "module":
    case "sector_id":
      return labels.sectors[value] ?? value;
    case "gas":
      return labels.gases[value] ?? value;
    case "month":
      return labels.months[value] ?? value;
    case "period_id":
      return labels.periods[value]?.short ?? value;
    case "configuration_id":
      return labels.configurations[value]?.label ?? value;
    case "spatial_view":
      return (labels.views[value] ?? value).split(":")[0];
    case "source_stream_id":
      return streamLabel(labels, value);
    default:
      return value;
  }
}

/** "query_emissions" -> "Query emissions": a contract function name as a card title (the id stays as secondary text). */
export function functionLabel(name: string): string {
  return name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export type InputChip = { key: string; label: string; value: string; raw: string };

function geoName(labels: Labels, dims: Dims, id: string): string {
  return labels.geographies[id] ?? labels.geographies[`ADM1:${id}`] ?? (adm2RowsForShape(dims, id).length ? districtName(dims, id) : id);
}

function humanValue(labels: Labels, dims: Dims, key: string, v: unknown): string {
  const one = (x: unknown): string => {
    if (typeof x !== "string") return typeof x === "object" && x !== null ? JSON.stringify(x) : String(x);
    switch (key) {
      case "periods":
      case "period":
        return periodShort(labels, x);
      case "sectors":
      case "sector":
      case "module":
        return sectorLabel(labels, x);
      case "gases":
      case "gas":
        return gasLabel(labels, x);
      case "geography_ids":
      case "geo":
      case "province":
        return geoName(labels, dims, x);
      case "shape_id":
        return districtName(dims, x);
      case "configuration_id":
      case "config":
        return configLabel(labels, x);
      case "months":
      case "month":
        return labels.months[x] ?? x;
      case "spatial_view":
      case "view":
        return (labels.views[x] ?? x).split(":")[0];
      case "group_by":
        return columnLabel(x);
      case "receipt_id":
        return x.slice(0, 8);
      case "source_stream_id":
      case "stream_id":
        return streamLabel(labels, x);
      case "limitation_id":
        return limitationText(labels, x);
      default:
        return x;
    }
  };
  return Array.isArray(v) ? v.map(one).join(", ") : one(v);
}

/**
 * A tool call's input (or a map action) as chips: the contract's field name humanised through
 * COLUMN_NAMES and its value through the release's labels; nested request objects (a compare's
 * left/right, a timeseries' query) are flattened with a prefix. Empty values are skipped.
 */
export function inputChips(labels: Labels, dims: Dims, input: Record<string, unknown>, prefix = ""): InputChip[] {
  const out: InputChip[] = [];
  for (const [key, v] of Object.entries(input ?? {})) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      out.push(...inputChips(labels, dims, v as Record<string, unknown>, `${prefix}${key}.`));
      continue;
    }
    out.push({ key: prefix + key, label: prefix ? `${prefix}${columnLabel(key).toLowerCase()}` : columnLabel(key), value: humanValue(labels, dims, key, v), raw: typeof v === "string" ? v : JSON.stringify(v) });
  }
  return out;
}

/** A tool-result cell's group as one label: "Punjab › Agriculture › CH₄". */
export function groupText(labels: Labels, dims: Dims, group: Record<string, string | null> | undefined): string {
  return Object.entries(group ?? {})
    .map(([k, v]) => groupValueLabel(labels, dims, k, v))
    .filter((s) => s.length > 0)
    .join(" › ");
}
