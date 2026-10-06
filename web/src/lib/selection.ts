/**
 * What the reader has selected, said ONE way.
 *
 * `ExplorerState` (lib/urlState.ts) is the selection; it always was. What went wrong in the
 * review of 2026-10-06 was everything that re-derived a piece of it for itself: the assistant's
 * context copied five optional keys and not the pollutant, so a PM₂.₅ view was described to the
 * model as "all gases" and answered in CO₂e; two summary lines, two legend scope lines and the
 * data page's measure selector each wrote "CO₂e" from their own reading of `gas`. This module is
 * the reading they now share:
 *
 *   metricOf        which quantity is on screen - greenhouse gases or one air pollutant - and what
 *                   it is called;
 *   controlsFor     which controls mean anything for that quantity (a pollutant has no warming
 *                   potential, no month and no accounting view);
 *   uiStateOf       the selection as the assistant is told it, and selectionPatch, its inverse;
 *   placeOf         the selected place AT ITS OWN GRAIN (lib/geography.ts geoGrain), because the
 *                   map's level is where the reader is looking, not what `geo` is: a province
 *                   stays selected while its districts are on screen.
 *
 * Nothing here computes a number or invents a label: names are the release's, and a unit is said
 * only as the family the API's own air tables are in.
 */
import { POLLUTANT_LABELS } from "./explore/query";
import { geoGrain } from "./geography";
import { districtName, gasLabel, geographyName, type Dims } from "./labels";
import type { Labels } from "./release";
import type { ExplorerState, StateDefaults } from "./urlState";

export type Metric =
  | { family: "ghg"; gas: string | null; label: string }
  | { family: "air"; pollutant: string; label: string };

/** The quantity a selection is about. A pollutant wins: urlState never lets both stand. */
export function metricOf(s: Pick<ExplorerState, "gas" | "pol">, labels: Labels): Metric {
  if (s.pol) return { family: "air", pollutant: s.pol, label: POLLUTANT_LABELS[s.pol] ?? s.pol };
  return { family: "ghg", gas: s.gas, label: s.gas ? gasLabel(labels, s.gas) : "CO₂e" };
}

/**
 * The air tables are EMISSION MASS in kilotonnes for a fiscal year - what was released, not what
 * is in the air. The words are here once so no view can call it air quality or a concentration.
 */
export const AIR_QUANTITY = "emissions estimate, kilotonnes";
export const AIR_NOT_AMBIENT = "An estimate of what was emitted, in kilotonnes for the year. It is not a measurement of the air people breathe.";

export type Controls = {
  /** Warming-potential basis: greenhouse gases only. */
  gwp: boolean;
  /** Month within the period: the air tables are annual. */
  month: boolean;
  /** Spatial accounting view (where it is emitted / originates / is accounted): greenhouse only. */
  view: boolean;
  /** The evidence, method, unallocated and exceptions layers describe the greenhouse inventory. */
  layers: boolean;
  /** The fixed colour scale is locked to the greenhouse envelope's ends. */
  fixedScale: boolean;
  /** The 0.05° grid is a map layer for greenhouse gases and a download for pollutants. */
  grid: boolean;
  /** The second (survey-based) estimate offered beside the reference one. */
  survey: boolean;
};

export function controlsFor(metric: Metric): Controls {
  const ghg = metric.family === "ghg";
  return { gwp: ghg, month: ghg, view: ghg, layers: ghg, fixedScale: ghg, grid: ghg, survey: ghg };
}

/** Why a control is not offered, in the reader's words. */
export const NOT_FOR_AIR = "Does not apply to an air pollutant";

export type Place = { kind: "national" } | { kind: "province"; id: string } | { kind: "district"; id: string };

/** The selected place at its own grain; a grid cell is not a place the tables are keyed on. */
export function placeOf(s: Pick<ExplorerState, "geo">): Place {
  if (!s.geo) return { kind: "national" };
  return geoGrain(s.geo) === "adm1" ? { kind: "province", id: s.geo } : { kind: "district", id: s.geo };
}

/** "Punjab", "Lahore" or "Pakistan", from the id's own grain. */
export function placeWords(labels: Labels, dims: Dims, s: Pick<ExplorerState, "geo">): string {
  const place = placeOf(s);
  if (place.kind === "national") return "Pakistan";
  return place.kind === "district" ? districtName(dims, place.id) : geographyName(labels, place.id);
}

/** The selection keys - what a result is OF. The rest of ExplorerState is chrome (tab, layer, camera…). */
export const SELECTION_KEYS = ["level", "period", "month", "sector", "gas", "pol", "config", "gwp", "view", "geo", "cell"] as const;
export type SelectionKey = (typeof SELECTION_KEYS)[number];
const OPTIONAL: readonly SelectionKey[] = ["month", "sector", "gas", "pol", "geo", "cell"];

/**
 * The selection as the assistant is told it (`ui_state` on POST /ask), and as a conversation
 * remembers the scope it was asked under.
 *
 * A POLLUTANT VIEW IS DESCRIBED AS ONE. It names the pollutant and says what family, unit and
 * coverage that implies, and it leaves out the warming-potential basis and the accounting view,
 * which are greenhouse settings: sending them beside a pollutant is how a model is talked into
 * answering in CO₂e. `place_level` says what `geo` is, since `level` only says what the map shows.
 */
export function uiStateOf(s: ExplorerState): Record<string, unknown> {
  const out: Record<string, unknown> = { level: s.level, period: s.period, config: s.config };
  if (s.pol) {
    out.pol = s.pol;
    out.metric = "air_pollutant";
    out.unit = "kt";
    out.coverage = "covered sources only; grid power is a screening scenario outside the total";
  } else {
    out.gwp = s.gwp;
    out.view = s.view;
    out.metric = "greenhouse_gases";
  }
  for (const k of ["month", "sector", "gas", "geo", "cell"] as const) if (s[k]) out[k] = s[k];
  if (s.geo) out.place_level = geoGrain(s.geo);
  return out;
}

/**
 * A saved `ui_state` as a WHOLE selection. It is not a patch: an optional key that is absent was
 * UNSET when the question was asked, so it is written as null - otherwise a conversation about a
 * pollutant, reopened over a greenhouse view, would keep the gas, and one asked with no sector
 * would keep the sector now on screen. Settings a pollutant view never carried (warming potential,
 * accounting view) fall back to the release's defaults.
 */
export function selectionPatch(ui: Record<string, unknown>, d: StateDefaults): Partial<ExplorerState> {
  const text = (k: string) => (typeof ui[k] === "string" && ui[k] !== "" ? (ui[k] as string) : null);
  const patch: Record<string, unknown> = {
    level: (text("level") as ExplorerState["level"] | null) ?? "adm1",
    period: text("period") ?? d.period_id,
    config: text("config") ?? d.configuration_id,
    gwp: text("gwp") ?? d.gwp_basis,
    view: text("view") ?? d.spatial_view,
  };
  for (const k of OPTIONAL) patch[k] = text(k);
  return patch as Partial<ExplorerState>;
}

/** Whether two `ui_state`s name the same selection (derived keys such as `unit` do not count). */
export function sameSelection(a: Record<string, unknown>, b: Record<string, unknown>, d: StateDefaults): boolean {
  const pa = selectionPatch(a, d) as Record<string, unknown>;
  const pb = selectionPatch(b, d) as Record<string, unknown>;
  // a pollutant view carries no warming-potential basis or accounting view to compare
  const skip = pa.pol || pb.pol ? new Set(["gwp", "view"]) : new Set<string>();
  return SELECTION_KEYS.every((k) => skip.has(k) || pa[k] === pb[k]);
}
