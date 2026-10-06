/**
 * The pure helpers behind the AnswerCard: which tool result the answer rests on, the applied
 * scope as rows a reader can read, the chart a result's cells call for, and the row counts.
 * Nothing here computes a figure: sizes come from the envelope's `value` (or, before the
 * replay arrives, the numeric reading of the server's `display`, which places a bar and prints
 * nothing); every printed string is one the stream or the envelope carried.
 */
import type { Envelope } from "@/lib/envelope";
import { configLabel, districtName, gasLabel, geographyName, groupText, gwpLabel, inputChips, periodShort, sectorLabel, viewLabel, type Dims, type InputChip } from "@/lib/labels";
import type { Labels } from "@/lib/release";
import type { AnswerScope, TimelineItem, ToolResultCell, ToolResultEvent } from "./types";

export type ToolItem = Extract<TimelineItem, { kind: "tool" }>;

/** The tool result the answer is built on: the one the answer's scope names by k, else the last result with cells. */
export function principalTool(items: TimelineItem[], scope: AnswerScope | undefined): ToolItem | null {
  const tools = items.filter((i): i is ToolItem => i.kind === "tool" && !!i.result && !i.result.download);
  if (scope && typeof scope.k === "number") {
    const named = tools.find((t) => t.k === scope.k);
    if (named) return named;
  }
  for (let i = tools.length - 1; i >= 0; i--) if (tools[i].result!.cells.length > 0) return tools[i];
  return tools.length ? tools[tools.length - 1] : null;
}

/** An uncertainty tool result in the turn (the agent asked "how certain"), if any. */
export function uncertaintyTool(items: TimelineItem[]): ToolItem | null {
  const tools = items.filter((i): i is ToolItem => i.kind === "tool" && !!i.result);
  return tools.find((t) => t.name === "get_uncertainty" || t.result!.request_type === "get_uncertainty") ?? null;
}

/** A download tool result in the turn (the agent produced a CSV), if any. */
export function downloadTool(items: TimelineItem[]): ToolItem | null {
  const tools = items.filter((i): i is ToolItem => i.kind === "tool" && !!i.result?.download);
  return tools.length ? tools[tools.length - 1] : null;
}

/** The tool call's input chips with the GWP basis worded ("IPCC 2013 (AR5)", never the bare id) and its label named. */
export function receiptChips(labels: Labels, dims: Dims, input: Record<string, unknown>): InputChip[] {
  return inputChips(labels, dims, input).map((c) => (c.key.split(".").pop() === "gwp_basis" ? { ...c, label: "Warming potentials", value: gwpLabel(labels, c.raw) } : c));
}

export type ScopeRow = { name: string; value: string; id?: string; muted?: boolean };

const CONTEXT_KEYS = new Set(["basis", "periods", "years", "configuration_id", "gwp_basis", "geography_level", "geography_ids", "spatial_view", "defaults_applied", "reporting_period", "k", "request_type", "receipt", "name"]);
const LEVEL_WORDS: Record<string, string> = { adm1: "province", adm2: "district", national: "national", grid: "grid cell" };

function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * The applied scope and filters as rows: the answer's `scope` (the last tool result's compact
 * context) or, on an older stream, the principal result's `context`; then the filters the tool
 * call's input carried beyond that context (sectors, gases, months, categories, group_by …)
 * through the same chips the tool cards use. Ids are named through the labels; the basis is
 * worded through the release's context bar when it is the release's own.
 */
export function scopeRows(labels: Labels, dims: Dims, context: Record<string, unknown> | null | undefined, input: Record<string, unknown> | undefined, basisLabel?: { basis: string; label: string }): ScopeRow[] {
  const c = context ?? {};
  const rows: ScopeRow[] = [];
  const periods = strs(c.periods);
  if (periods.length) rows.push({ name: periods.length === 1 ? "Period" : "Periods", value: periods.map((p) => periodShort(labels, p)).join(", "), id: periods.join(", ") });
  // AN ANSWER OVER CALENDAR YEARS HAS NO PERIOD, and the context's `reporting_period` is the
  // RELEASE's (its reference year), not the answer's: falling back to it captioned a 1990-2024
  // ammonia trend "Period: 2023-24". The years are the request's own, so they are said from it.
  else if (strs(input?.years).length) rows.push({ name: "Years", value: yearSpan(strs(input?.years)), id: strs(input?.years).join(", ") });
  else if (str(c.reporting_period)) rows.push({ name: "Period", value: periodShort(labels, str(c.reporting_period)), id: str(c.reporting_period) });
  const level = str(c.geography_level);
  const ids = strs(c.geography_ids);
  const names = ids.map((g) => (level === "adm2" ? districtName(dims, g) : geographyName(labels, g)));
  if (ids.length) rows.push({ name: "Geography", value: `${names.join(", ")} (${LEVEL_WORDS[level] ?? level})`, id: ids.join(", ") });
  else if (level && level !== "national") rows.push({ name: "Geography", value: `every ${LEVEL_WORDS[level] ?? level}` });
  else if ("geography_level" in c || periods.length) rows.push({ name: "Geography", value: "Pakistan (national)" });
  const config = str(c.configuration_id);
  if (config) rows.push({ name: "Estimate", value: configLabel(labels, config), id: config });
  const gwp = str(c.gwp_basis);
  if (gwp) rows.push({ name: "Warming potentials", value: gwpLabel(labels, gwp), id: gwp });
  const view = str(c.spatial_view);
  if (view) rows.push({ name: "Spatial view", value: viewLabel(labels, view).split(":")[0], id: view });
  const basis = str(c.basis);
  if (basis) rows.push({ name: "Basis", value: basisLabel && basisLabel.basis === basis ? basisLabel.label : basis, id: basis });
  const filters: InputChip[] = input ? inputChips(labels, dims, input).filter((ch) => !CONTEXT_KEYS.has(ch.key.split(".").pop() ?? ch.key) && !CONTEXT_KEYS.has(ch.key)) : [];
  for (const f of filters) rows.push({ name: f.label, value: f.value, id: f.raw !== f.value ? f.raw : undefined });
  const defaults = strs(c.defaults_applied);
  if (defaults.length) rows.push({ name: "Filled by default", value: defaults.map((d) => d.replace(/_/g, " ")).join(", "), muted: true });
  return rows;
}

/** "1990–2024" for a run of consecutive calendar years, else the years as listed. */
function yearSpan(years: string[]): string {
  const n = years.map(Number);
  const run = n.length > 2 && n.every((y, i) => Number.isInteger(y) && (i === 0 || y === n[i - 1] + 1));
  return run ? `${years[0]}–${years[years.length - 1]}` : years.join(", ");
}

const NUMERIC = /^[-+]?\d+(\.\d+)?$/;

export type ChartKind = "figure" | "bars" | "columns" | "table" | "none";

/** The one group key the cells share, or null (no group, or more than one key). */
export function groupKeyOf(cells: ToolResultCell[]): string | null {
  const keys = new Set<string>();
  for (const c of cells) for (const k of Object.keys(c.group ?? {})) keys.add(k);
  return keys.size === 1 ? Array.from(keys)[0] : null;
}

/**
 * How the principal result is shown: one ungrouped numeric cell is a figure; numeric cells on
 * one key are columns over periods or months and bars over anything else; a bounded or
 * non-numeric display (an interval "[a, b]", a notation key) or several keys is a table.
 */
export function chartKind(cells: ToolResultCell[]): ChartKind {
  if (!cells.length) return "none";
  const numeric = cells.every((c) => typeof c.display === "string" && NUMERIC.test(c.display.trim()));
  if (!numeric) return "table";
  const key = groupKeyOf(cells);
  if (cells.length === 1 && !key) return "figure";
  if (!key) return "table";
  return key === "period_id" || key === "month" ? "columns" : "bars";
}

/** The number that places a cell's bar: the replayed envelope's `value`, else the numeric reading of the display; 0 when neither is a number. */
export function sizeOf(cell: ToolResultCell, env: Envelope | null): number {
  const v = env?.values[cell.i]?.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(cell.display);
  return Number.isFinite(n) ? n : 0;
}

/** The label printed at a bar's end: the server's display_short (else display) and, when the replayed envelope carries it, the share. */
export function barLabel(cell: ToolResultCell, env: Envelope | null): string {
  const shown = cell.display_short ?? cell.display ?? "";
  const share = (env?.values[cell.i] as Record<string, unknown> | undefined)?.share_pct_short;
  return typeof share === "string" && share ? `${shown} · ${share} %` : shown;
}

/** A cell's name in a chart or table: its group through the labels, else its identifying attrs, else "all". */
/**
 * A machine id: lower-case words joined by underscores, sometimes with dots.
 * `ipcc2006_v2_ch3_eq3.2.1_road_co2`, `lognormal_ef_normal_activity_uniform_split`, `road_density`.
 */
const MACHINE_ID = /^[a-z0-9]+([_.][a-z0-9.+|]+)+$/;

/** The attributes that are a NAME. Anything else is a field, a note or an id. */
const READABLE_ATTRS = ["scenario_label", "category", "sub_category", "kind", "key", "name", "label"] as const;

/**
 * What to call a cell.
 *
 * ⚠ THIS IS THE LINE THAT LEAKED TWICE. It used to end
 * `|| Object.values(a).join(" · ") || "all"` - so a cell with no `group` was labelled with EVERY
 * attribute it carried, ids included. That is where
 * "Enteric fermentation · 2006 V4 Ch10 Eq 10.19/10.20 · ipcc2006_v4_ch10_eq10.19_enteric_ch4 · …"
 * came from, and then "ipcc2006_v2_ch3_eq3.2.1_road_co2 · lognormal_ef_normal_activity_uniform_split".
 * Both times it looked like a problem with the tool that had been called; it was never that. It is
 * this fallback, and any record-shaped cell walks into it.
 *
 * So: named readable attributes only, never a join of everything, and never a value that reads as an
 * id. With nothing readable to say it returns "" and the caller omits the label rather than invents
 * one - the same rule the scope sentence and the method disclosure follow.
 */
export function cellName(labels: Labels, dims: Dims, cell: ToolResultCell): string {
  const g = groupText(labels, dims, cell.group);
  if (g) return g;
  const a = cell.attrs ?? {};
  for (const k of READABLE_ATTRS) {
    const v = a[k];
    if (typeof v === "string" && v && !MACHINE_ID.test(v)) return v;
  }
  return "";
}

/** The distinct exactness words the cells carry ("exact", "bounded …"), in first-seen order. */
export function exactnessWords(cells: ToolResultCell[]): string[] {
  const out: string[] = [];
  for (const c of cells) if (c.exactness && !out.includes(c.exactness)) out.push(c.exactness);
  return out;
}

/** The row count of a cell: the event's n_rows, else the replayed envelope's result_row_ids length; null when neither is known. */
export function rowsOf(cell: ToolResultCell, env: Envelope | null): number | null {
  if (typeof cell.n_rows === "number") return cell.n_rows;
  const ids = env?.values[cell.i]?.result_row_ids;
  return Array.isArray(ids) ? ids.length : null;
}

/** The words for a result's function ("Query emissions"), with the sector/gas of the request when the input names one, for the card's caption. */
export function resultCaption(labels: Labels, r: ToolResultEvent, input: Record<string, unknown>): string {
  const parts: string[] = [];
  const sectors = strs(input.sectors);
  if (sectors.length) parts.push(sectors.map((s) => sectorLabel(labels, s)).join(", "));
  const gases = strs(input.gases);
  if (gases.length) parts.push(gases.map((g) => gasLabel(labels, g)).join(", "));
  const by = strs(input.group_by);
  const key = by[0];
  if (key) parts.push(`by ${key === "shape_id" ? "district" : key === "sector_id" || key === "module" ? "sector" : key === "period_id" ? "period" : key.replace(/_/g, " ")}`);
  const n = r.n_values;
  parts.push(`${String(n)} ${n === 1 ? "cell" : "cells"}`);
  return parts.join(" · ");
}
