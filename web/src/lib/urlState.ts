"use client";
/**
 * The one screen's state lives in the URL (nuqs). `useExplorerState()` resolves the raw
 * parameters against the release's defaults (/release.defaults: period, configuration, GWP,
 * spatial view) so a bare `/` and `/?period=FY2023-24&config=REF_2023_24` are the same state and
 * produce the same request bodies (lib/requests.ts) and therefore the same receipts. The Map
 * page adds `layer` (its layer switch) and `tab` (its drawer's tab); the old `panel` and `ask`
 * keys are retired (the Ask drawer lives outside the URL; the filter panel is not state).
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

export type ExplorerState = {
  level: Level;
  period: string;
  month: string | null;
  sector: string | null;
  gas: string | null;
  config: string;
  gwp: string;
  view: string;
  geo: string | null;
  cell: string | null;
  tab: MapTab;
  layer: MapLayer;
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
  config: parseAsString,
  gwp: parseAsString,
  view: parseAsString,
  geo: parseAsString,
  cell: parseAsString,
  tab: parseAsStringLiteral(MAP_TABS),
  layer: parseAsStringLiteral(MAP_LAYERS),
  c: parseAsString,
  cam: parseAsString.withOptions({ history: "replace", throttleMs: 400 }),
  raster: parseAsFlag,
  view3d: parseAsFlag,
};

export type RawState = { [K in keyof typeof parsers]: ReturnType<(typeof parsers)[K]["parse"]> | null };

export function resolveState(raw: Partial<RawState>, d: StateDefaults): ExplorerState {
  const level: Level = raw.level ?? "adm1";
  return {
    level,
    period: raw.period ?? d.period_id,
    month: raw.month ?? null,
    sector: raw.sector ?? null,
    gas: raw.gas ?? (level === "grid" ? d.grid_gas : null),
    config: raw.config ?? d.configuration_id,
    gwp: raw.gwp ?? d.gwp_basis,
    view: raw.view ?? d.spatial_view,
    geo: raw.geo ?? null,
    cell: raw.cell ?? null,
    tab: raw.tab ?? "summary",
    layer: raw.layer ?? "magnitude",
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
    config: s.config === d.configuration_id ? null : s.config,
    gwp: s.gwp === d.gwp_basis ? null : s.gwp,
    view: s.view === d.spatial_view ? null : s.view,
    geo: s.geo,
    cell: s.cell,
    tab: s.tab === "summary" ? null : s.tab,
    layer: s.layer === "magnitude" ? null : s.layer,
    c: s.c,
    cam: s.cam,
    raster: s.raster === (s.level === "grid") ? null : s.raster,
    view3d: s.view3d ? true : null,
  };
}

/** Apply a patch with the dependent clean-ups: a new level drops the selection, a new period its month. */
export function applyPatch(s: ExplorerState, patch: Partial<ExplorerState>): ExplorerState {
  const next = { ...s, ...patch };
  if (patch.level !== undefined && patch.level !== s.level) {
    if (patch.geo === undefined) next.geo = null;
    if (patch.cell === undefined) next.cell = null;
    if (patch.gas === undefined) next.gas = patch.level === "grid" ? (s.gas ?? next.gas) : s.gas;
    if (patch.raster === undefined) next.raster = patch.level === "grid";
  }
  if (patch.period !== undefined && patch.period !== s.period && patch.month === undefined) next.month = null;
  if (patch.geo !== undefined && patch.geo !== null && patch.cell === undefined) next.cell = null;
  if (patch.cell !== undefined && patch.cell !== null && patch.geo === undefined) next.geo = null;
  return next;
}

export function useExplorerState(defaults: StateDefaults) {
  const [raw, setRaw] = useQueryStates(parsers);
  const state = useMemo(() => resolveState(raw, defaults), [raw, defaults]);
  const setState = useCallback(
    (patch: Partial<ExplorerState>, options?: { history?: "push" | "replace" }) => {
      const next = applyPatch(resolveState(raw, defaults), patch);
      const gasDefault = next.level === "grid" ? defaults.grid_gas : null;
      if (next.level === "grid" && !next.gas) next.gas = gasDefault;
      return setRaw(rawFromState(next, defaults), options);
    },
    [raw, defaults, setRaw],
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
