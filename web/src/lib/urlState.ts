"use client";
/**
 * The one screen's state lives in the URL (nuqs). `useExplorerState()` resolves the raw
 * parameters against the release's defaults (/release.defaults: period, configuration, GWP,
 * spatial view) so a bare `/` and `/?period=FY2023-24&config=REF_2023_24` are the same state and
 * produce the same request bodies (lib/requests.ts) and therefore the same receipts. The Map
 * page adds `layer` (its layer switch), `scale` (Map settings' scale mode), `pane` (which of
 * the two panes a narrow window shows) and `tab` (its
 * drawer's tab); the old `panel` and `ask` keys are retired (the Ask drawer lives outside the
 * URL; the filter panel is not state).
 */
import { useCallback, useMemo } from "react";
import { createParser, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

/** `1` | `0` flags (`raster=0`, `view3d=1`); `true`/`false` are read too. */
const parseAsFlag = createParser<boolean>({
  parse: (v) => (v === "1" || v === "true" ? true : v === "0" || v === "false" ? false : null),
  serialize: (v) => (v ? "1" : "0"),
});

export const LEVELS = ["adm1", "adm2", "grid"] as const;
export type Level = (typeof LEVELS)[number];
/** The Map page's drawer tabs (URL `tab`; absent = summary). */
export const MAP_TABS = ["summary", "breakdown", "trend", "evidence", "sources"] as const;
export type MapTab = (typeof MAP_TABS)[number];
/** The Map page's layer switch (URL `layer`; absent = magnitude). */
export const MAP_LAYERS = ["magnitude", "evidence", "method", "unallocated", "exceptions"] as const;
export type MapLayer = (typeof MAP_LAYERS)[number];
/**
 * How the magnitude layer's colour is scaled (URL `scale`; absent = relative), the three modes
 * Map settings offers. `relative` shades by the cell's quantile rank inside the envelope now on
 * screen and prints nothing; `fixed` locks the domain to the level's all-sector, all-gas
 * envelope for the reference year, so choosing a sector or a gas no longer rescales the map;
 * `absolute` scales the value against the current envelope and lets the legend list the
 * server's own break strings. A rank is a colour, never a label (components/map/paint.ts).
 */
export const SCALE_MODES = ["relative", "fixed", "absolute"] as const;
export type ScaleMode = (typeof SCALE_MODES)[number];
/**
 * Which pane a narrow window shows (URL `pane`; absent = map). Under 1280 px the workspace
 * shows ONE pane at a time — the insight deck or the map — and the nav capsule carries the
 * switch between them; at 1280 px and above both are on screen at once and the key is never
 * written, so a wide window's link never carries a pane.
 */
export const PANES = ["dashboard", "map"] as const;
export type Pane = (typeof PANES)[number];

export type ExplorerState = {
  level: Level;
  period: string;
  month: string | null;
  sector: string | null;
  gas: string | null;
  /** One air pollutant (the beta): the metric becomes native kilotonnes via query_air. */
  pol: string | null;
  config: string;
  gwp: string;
  view: string;
  geo: string | null;
  cell: string | null;
  tab: MapTab;
  layer: MapLayer;
  scale: ScaleMode;
  pane: Pane;
  c: string | null;
  cam: string | null;
  raster: boolean;
  view3d: boolean;
};

export type StateDefaults = { period_id: string; configuration_id: string; gwp_basis: string; spatial_view: string; grid_gas: string };

export const parsers = {
  level: parseAsStringLiteral(LEVELS),
  period: parseAsString,
  month: parseAsString,
  sector: parseAsString,
  gas: parseAsString,
  pol: parseAsString,
  config: parseAsString,
  gwp: parseAsString,
  view: parseAsString,
  geo: parseAsString,
  cell: parseAsString,
  tab: parseAsStringLiteral(MAP_TABS),
  layer: parseAsStringLiteral(MAP_LAYERS),
  scale: parseAsStringLiteral(SCALE_MODES),
  pane: parseAsStringLiteral(PANES),
  c: parseAsString,
  cam: parseAsString.withOptions({ history: "replace", throttleMs: 400 }),
  raster: parseAsFlag,
  view3d: parseAsFlag,
};

export type RawState = { [K in keyof typeof parsers]: ReturnType<(typeof parsers)[K]["parse"]> | null };

/**
 * ONE METRIC AT A TIME. A view is either greenhouse gases (all of them as CO₂e, or one gas) or one
 * air pollutant, never both: the two are different quantities in different units from different
 * tables. Until 2026-10 nothing held that - `gas` and `pol` were two independent keys that each
 * call site was trusted to clear, and the ones that forgot produced a view whose cards were one
 * metric and whose legend, summary and assistant were the other. The rule lives here, where a
 * URL is read and where a patch is applied, so no call site can produce the mixed state.
 *
 * A pollutant also has no month and no grid query (its grid is a download, not a map layer), and
 * the layers other than magnitude describe the greenhouse inventory's evidence; a link that
 * carries them beside a pollutant is read without them.
 */
export function resolveState(raw: Partial<RawState>, d: StateDefaults): ExplorerState {
  const pol = raw.pol ?? null;
  const level: Level = pol && raw.level === "grid" ? "adm1" : raw.level ?? "adm1";
  return {
    level,
    period: raw.period ?? d.period_id,
    month: pol ? null : raw.month ?? null,
    sector: raw.sector ?? null,
    gas: pol ? null : raw.gas ?? (level === "grid" ? d.grid_gas : null),
    pol,
    config: raw.config ?? d.configuration_id,
    gwp: raw.gwp ?? d.gwp_basis,
    view: raw.view ?? d.spatial_view,
    geo: raw.geo ?? null,
    cell: pol ? null : raw.cell ?? null,
    tab: raw.tab ?? "summary",
    layer: pol ? "magnitude" : raw.layer ?? "magnitude",
    scale: pol && raw.scale === "fixed" ? "relative" : raw.scale ?? "relative",
    pane: raw.pane ?? "map",
    c: raw.c ?? null,
    cam: raw.cam ?? null,
    raster: raw.raster ?? level === "grid",
    view3d: raw.view3d ?? false,
  };
}

/** The URL form of a resolved state: a value equal to its default is written as null (absent). */
export function rawFromState(s: ExplorerState, d: StateDefaults): RawState {
  return {
    level: s.level === "adm1" ? null : s.level,
    period: s.period === d.period_id ? null : s.period,
    month: s.month,
    sector: s.sector,
    gas: s.gas === (s.level === "grid" ? d.grid_gas : null) ? null : s.gas,
    pol: s.pol,
    config: s.config === d.configuration_id ? null : s.config,
    gwp: s.gwp === d.gwp_basis ? null : s.gwp,
    view: s.view === d.spatial_view ? null : s.view,
    geo: s.geo,
    cell: s.cell,
    tab: s.tab === "summary" ? null : s.tab,
    layer: s.layer === "magnitude" ? null : s.layer,
    scale: s.scale === "relative" ? null : s.scale,
    pane: s.pane === "map" ? null : s.pane,
    c: s.c,
    cam: s.cam,
    raster: s.raster === (s.level === "grid") ? null : s.raster,
    view3d: s.view3d ? true : null,
  };
}

/**
 * Apply a patch with the dependent clean-ups: a new level drops the selection, a new period its
 * month, and a new metric drops the other metric with the settings that only it understood (see
 * resolveState). With the release's defaults in hand, entering a pollutant also returns the
 * estimate to the reference one - the greenhouse survey configuration is not an air configuration,
 * and a scope line that kept saying it would describe an estimate the air tables never made.
 * Leaving a pollutant needs no undoing: the warming-potential basis and the spatial view were
 * never touched, so the greenhouse view comes back as it was left.
 */
export function applyPatch(s: ExplorerState, patch: Partial<ExplorerState>, d?: StateDefaults): ExplorerState {
  const next = { ...s, ...patch };
  // naming a gas - one of them, or "all of them" - is choosing the greenhouse metric
  if (patch.gas !== undefined && patch.pol === undefined) next.pol = null;
  if (patch.level !== undefined && patch.level !== s.level) {
    if (patch.geo === undefined) next.geo = null;
    if (patch.cell === undefined) next.cell = null;
    if (patch.gas === undefined) next.gas = patch.level === "grid" ? (s.gas ?? next.gas) : s.gas;
    if (patch.raster === undefined) next.raster = patch.level === "grid";
  }
  if (patch.period !== undefined && patch.period !== s.period && patch.month === undefined) next.month = null;
  if (patch.geo !== undefined && patch.geo !== null && patch.cell === undefined) next.cell = null;
  if (patch.cell !== undefined && patch.cell !== null && patch.geo === undefined) next.geo = null;
  // last, so nothing above can hand a pollutant view its old gas, month or grid back
  if (next.pol) {
    next.gas = null;
    next.month = null;
    next.cell = null;
    next.layer = "magnitude";
    if (next.scale === "fixed") next.scale = "relative";
    if (next.level === "grid") {
      next.level = "adm1";
      next.raster = false;
    }
    if (d && patch.pol != null && patch.config === undefined) next.config = d.configuration_id;
  }
  return next;
}

export function useExplorerState(defaults: StateDefaults) {
  const [raw, setRaw] = useQueryStates(parsers);
  const state = useMemo(() => resolveState(raw, defaults), [raw, defaults]);
  const setState = useCallback(
    (patch: Partial<ExplorerState>, options?: { history?: "push" | "replace" }) =>
      // FROM THE URL AS IT IS WHEN THE UPDATE RUNS, not as it was at the last render. Two patches in
      // one tick (the assistant's map move and its conversation id arrive in one chunk) were both
      // computed from the same stale `raw` and each wrote every key, so the second undid the first.
      setRaw((current) => {
        const next = applyPatch(resolveState(current, defaults), patch, defaults);
        if (next.level === "grid" && !next.gas && !next.pol) next.gas = defaults.grid_gas;
        return rawFromState(next, defaults);
      }, options),
    [defaults, setRaw],
  );
  return { state, setState } as const;
}

/**
 * The URL of a state on a page: `/?level=adm2&sector=transport` (only the fields that differ
 * from the release's defaults are written, as `rawFromState` writes them). The deck's
 * "Show it on the map", the dock's map chips and the Downloads page's replay link use it; the
 * workspace at `/` is the default path since the map merged into it.
 */
export function hrefForState(s: ExplorerState, d: StateDefaults, path = "/"): string {
  const raw = rawFromState(s, d);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (v !== null && v !== undefined) qs.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  const q = qs.toString();
  return q ? `${path}?${q}` : path;
}
