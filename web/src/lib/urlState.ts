"use client";
/**
 * The one screen's state lives in the URL (nuqs). `useExplorerState()` resolves the raw
 * parameters against the release's defaults (/v1/release.defaults: period, configuration, GWP,
 * spatial view) so a bare `/` and `/?period=FY2023-24&config=REF_2023_24` are the same state and
 * produce the same request bodies (lib/requests.ts) and therefore the same receipts.
 */
import { useCallback, useMemo } from "react";
import { createParser, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

/** `1` | `0` flags (the plan's `ask=1`, `raster=0`, `view3d=1`); `true`/`false` are read too. */
const parseAsFlag = createParser<boolean>({
  parse: (v) => (v === "1" || v === "true" ? true : v === "0" || v === "false" ? false : null),
  serialize: (v) => (v ? "1" : "0"),
});

export const LEVELS = ["adm1", "adm2", "grid"] as const;
export type Level = (typeof LEVELS)[number];
export const PANELS = ["explore", "inventory", "compare", "evidence"] as const;
export type Panel = (typeof PANELS)[number];

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
  panel: Panel | null;
  ask: boolean;
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
  panel: parseAsStringLiteral(PANELS),
  ask: parseAsFlag,
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
    panel: raw.panel ?? null,
    ask: raw.ask ?? false,
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
    panel: s.panel,
    ask: s.ask ? true : null,
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
