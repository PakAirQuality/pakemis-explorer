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
/** The API's one-line statement of what a period's basis means ("a fiscal year runs from July to June"), or "". */
export function periodBasisNote(labels: Labels, id: string): string {
  return labels.periods[id]?.basis_note ?? "";
}
/**
 * "years run July–June": the two month names of the period's own label ("July 2023 – June
 * 2024") as a figure subtitle phrase; "" when the label is not of that shape (a calendar row).
 */
export function periodSpanWords(labels: Labels, id: string): string {
  const m = /^([A-Za-z]+) \d{4} – ([A-Za-z]+) \d{4}$/.exec(labels.periods[id]?.label ?? "");
  return m ? `years run ${m[1]}–${m[2]}` : "";
}
/** "2015–16 to 2023–24": the first and last of the fiscal periods by their short labels. */
export function periodRange(dims: { fiscalPeriods: string[] }, labels: Labels): string {
  const ids = dims.fiscalPeriods;
  if (!ids.length) return "";
  const first = periodShort(labels, ids[0]);
  const last = periodShort(labels, ids[ids.length - 1]);
  return first === last ? first : `${first} to ${last}`;
}

/** The scope in words the identity line carries when the API sends none. */
export const IDENTITY_SCOPE = "public-data reconstruction of Pakistan's non-LULUCF emissions";
/**
 * The sub-header line under every page's title: `/release.identity_line` as the API sends it
 * ("PakEmis · public-data reconstruction of Pakistan's non-LULUCF emissions · 2015–16 to
 * 2023–24"), else the same three parts built from the labels. No version string.
 */
export function identityLine(release: Record<string, unknown> | undefined, dims: { fiscalPeriods: string[] }, labels: Labels): string {
  const sent = release?.identity_line;
  if (typeof sent === "string" && sent.trim()) return sent;
  return ["PakEmis", IDENTITY_SCOPE, periodRange(dims, labels)].filter(Boolean).join(" · ");
}

const MAGNITUDE_WORDS: Record<string, string> = { Mt: "million tonnes", Gg: "thousand tonnes", kt: "thousand tonnes", t: "tonnes" };
const SUBSCRIPT_DIGITS: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉" };
const GWP_TOKEN = /^AR\d$/;
/** The species tokens of a unit with digits subscripted and the GWP basis token dropped. */
function speciesTokens(tokens: string[]): string[] {
  return tokens.filter((t) => !GWP_TOKEN.test(t)).map((t) => t.replace(/\d/g, (d) => SUBSCRIPT_DIGITS[d] ?? d));
}
/**
 * An envelope's unit as words for a figure subtitle: "Mt CO2e AR5" -> "million tonnes CO₂e",
 * "Gg" -> "thousand tonnes", "Gg CO2e AR6" -> "thousand tonnes CO₂e". The magnitude word comes
 * from a four-entry map; the species keeps its letters with digits subscripted; the GWP basis
 * token is dropped (the basis is named once, by the release's labels.gwp, never inside a unit).
 * A unit outside that shape is returned as it is: this names the contract's units, it never
 * changes a value. Mirrors the server's presentation.unit_words.
 */
export function unitWords(unit: string): string {
  const tokens = unit.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || !(tokens[0] in MAGNITUDE_WORDS)) return unit;
  return [MAGNITUDE_WORDS[tokens[0]], ...speciesTokens(tokens.slice(1))].join(" ");
}
/** The unit as a reader sees it beside a number: "Mt CO2e AR5" -> "Mt CO₂e", "t CH4" -> "t CH₄", "Gg" -> "Gg"; mirrors the server's presentation.unit_short. */
export function unitShort(unit: string): string {
  const tokens = unit.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || !(tokens[0] in MAGNITUDE_WORDS)) return unit;
  return [tokens[0], ...speciesTokens(tokens.slice(1))].join(" ");
}
/** A cell's unit for the screen: the server's `unit_short` when it came, else its unit through unitShort. */
export function cellUnit(cell: { unit?: string | null; unit_short?: string } | null | undefined): string {
  if (!cell) return "";
  return cell.unit_short || (cell.unit ? unitShort(cell.unit) : "");
}
/** The unit line of a frame ("Million tonnes CO₂e"): the envelope's first cell's `unit_words` (the server's), else its unit through unitWords, capitalised; "" while there is no envelope. */
export function envelopeUnitLine(env: { values: { unit: string; unit_words?: string }[] } | null | undefined): string {
  const first = env?.values[0];
  if (!first) return "";
  const words = first.unit_words || (first.unit ? unitWords(first.unit) : "");
  return words.replace(/^\w/, (c) => c.toUpperCase());
}
/**
 * A figure's unit line from the envelope's first cell: "Million tonnes CO₂e" (the cell's
 * unit_words, else unitWords; capitalised), with ", excluding land use" appended for a
 * whole-scope figure whose context says LULUCF is excluded (any other status is named as it
 * is). "" while there is no envelope.
 */
export function figureUnitLine(env: { values: { unit: string; unit_words?: string }[]; context: { lulucf: { status: string } } } | null | undefined, withLulucf = false): string {
  const first = env?.values[0];
  if (!env || !first?.unit) return "";
  const words = (first.unit_words || unitWords(first.unit)).replace(/^\w/, (c) => c.toUpperCase());
  if (!withLulucf) return words;
  const status = env.context.lulucf.status;
  const lulucf = status === "excluded" ? "excluding land use" : status ? `land use ${status}` : "";
  return lulucf ? `${words}, ${lulucf}` : words;
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
/** "Reference estimate" / "Survey-based estimate" (the server's label), else the id. */
export function configLabel(labels: Labels, id: string): string {
  return labels.configurations[id]?.label ?? id;
}
/** The configuration in running text: "reference estimate" (the label with its initial lowered). */
export function configWords(labels: Labels, id: string): string {
  return lowerInitial(configLabel(labels, id));
}
/** The configuration's note as a tooltip, else its label. */
export function configTooltip(labels: Labels, id: string): string {
  const c = labels.configurations[id];
  return c?.tooltip || c?.note || configLabel(labels, id);
}
export function configLetter(labels: Labels, id: string): string {
  return labels.configurations[id]?.letter || labels.configurations[id]?.label || id;
}
/**
 * The context pill (bottom right of the map): "July–June years · reference estimate · IPCC AR5 ·
 * land use excluded", and its tooltip with the long forms and the LULUCF note. No version and
 * no commit: the release identity lives on /data and under About's "Release".
 */
export function contextPill(labels: Labels, cb: { basis: string; basis_label?: string }, s: { config: string; gwp: string }): { words: string; title: string } {
  const basis = cb.basis_label ?? cb.basis;
  const words = [basis, configWords(labels, s.config), gwpCompact(labels, s.gwp), lulucfCompact(labels)].filter(Boolean).join(" · ");
  const lulucf = lulucfTooltip(labels) ? `${lulucfShort(labels)}: ${lulucfTooltip(labels)}` : lulucfShort(labels);
  const title = [basis, configLabel(labels, s.config), gwpLabel(labels, s.gwp), lulucf].filter(Boolean).join(" · ");
  return { words, title };
}
/** "IPCC 2013 (AR5)": the GWP basis as a reader sees it, else the id. */
export function gwpLabel(labels: Labels, id: string): string {
  return labels.gwp[id]?.label ?? id;
}
/** "IPCC AR5": the GWP basis for a pill. */
export function gwpCompact(labels: Labels, id: string): string {
  return labels.gwp[id]?.compact ?? id;
}
/** The sentence saying what the basis means, quoting the release's own factors; "" when the release has no such label. */
export function gwpTooltip(labels: Labels, id: string): string {
  return labels.gwp[id]?.tooltip ?? "";
}
/** Whether a GWP basis is the release's default (the one every scope line leaves unsaid); the caller's default decides when the labels are silent. */
export function gwpIsDefault(labels: Labels, id: string, fallbackDefault?: string): boolean {
  const entry = labels.gwp[id];
  return entry ? entry.is_default : id === fallbackDefault;
}
/** "excludes land use and forestry". */
export function lulucfShort(labels: Labels): string {
  return labels.lulucf.short;
}
/** "land use excluded", for a pill. */
export function lulucfCompact(labels: Labels): string {
  return labels.lulucf.compact;
}
export function lulucfTooltip(labels: Labels): string {
  return labels.lulucf.tooltip;
}
/** The sector in running text: "all sectors" when none is chosen. */
export function sectorWords(labels: Labels, id: string | null | undefined): string {
  return id ? sectorLabel(labels, id) : "all sectors";
}
function lowerInitial(text: string): string {
  return text.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
}
/**
 * The scope of a figure or legend as words: "2023–24 · reference estimate", then the GWP basis
 * ("IPCC 2021 (AR6)") ONLY when it is not the release's default, then whatever the caller adds
 * (a sector, a gas, a month). Every phrase comes from the release's labels.
 */
export function scopeWords(labels: Labels, s: { period: string; config: string; gwp: string }, defaultGwp?: string, ...more: (string | null | undefined)[]): string {
  const parts: (string | null | undefined)[] = [periodShort(labels, s.period), configWords(labels, s.config)];
  if (!gwpIsDefault(labels, s.gwp, defaultGwp)) parts.push(gwpLabel(labels, s.gwp));
  return [...parts, ...more].filter((p): p is string => !!p).join(" · ");
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
