"use client";
/**
 * Everything a legend needs about the map now on screen, gathered once: the level's envelope,
 * its cell index, the province rows the unallocated layer reads, the known spatial exceptions,
 * the residual ADM1 unit, the raster block and the scope line. Every request goes out under the
 * SAME react-query key the map itself uses (`["map", body]`, lib/requests.ts), so a legend
 * rendered beside the map costs no second network call — it reads the map's own answer, refusal
 * included.
 *
 * It also fetches the FIXED scale's envelope: the level's all-sector, all-gas envelope for the
 * reference year, whose lowest and highest cells give the legend capsule its two end strings.
 * Those strings are the server's (`display_short`, else `display`); the browser derives none.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useExplorer } from "@/components/ExplorerContext";
import type { Cell, Envelope } from "@/lib/envelope";
import { shown } from "@/lib/envelope";
import { residualUnit } from "@/lib/geography";
import { adm1Body, mapBody } from "@/lib/requests";
import { gasLabel, monthLabel, scopeWords, sectorWords, viewLabel } from "@/lib/labels";
import { exceptionIndex, exceptionItems } from "./exceptions";
import type { LayerLegendProps } from "./LayerLegend";
import { anyWithoutCell, exceptionKindsPresent, indexCells, indexUnallocated } from "./paint";
import { useBboxes, useTilesInfo } from "./tiles";

const LEVEL_WORD = { adm1: "Provinces", adm2: "Districts", grid: "Grid" } as const;

/** The two ends of an envelope, as the server printed them: the lowest and the highest cell. */
export function envelopeEnds(env: Envelope | null | undefined): { low: string; high: string } | null {
  const cells = (env?.values ?? []).filter((c) => typeof c.value === "number") as (Cell & { value: number })[];
  if (cells.length < 2) return null;
  const sorted = [...cells].sort((a, b) => a.value - b.value);
  return { low: shown(sorted[0]), high: shown(sorted[sorted.length - 1]) };
}

export type LegendData = LayerLegendProps & {
  /** The FIXED scale's own envelope (the reference year, every sector, every gas) and its two end strings. */
  fixed: { env: Envelope | null | undefined; ends: { low: string; high: string } | null };
};

export function useLayerLegendData(): LegendData {
  const { state, labels, dims, release, defaults } = useExplorer();
  const bboxes = useBboxes();
  const tiles = useTilesInfo();

  const body = useMemo(() => mapBody(state), [state]);
  const mapQ = useQuery({ queryKey: ["map", body], queryFn: () => api.queryEmissions(body!), enabled: !!body, retry: false });
  const index = useMemo(() => (mapQ.data && state.level !== "grid" ? indexCells(mapQ.data, state.level) : null), [mapQ.data, state.level]);

  const provinceBody = useMemo(() => adm1Body(state), [state]);
  const provinceQ = useQuery({ queryKey: ["map", provinceBody], queryFn: () => api.queryEmissions(provinceBody), enabled: state.layer === "unallocated", retry: false });
  const unallocIdx = useMemo(() => (state.layer === "unallocated" ? indexUnallocated(provinceQ.data) : null), [state.layer, provinceQ.data]);

  const referencePeriod = useMemo(() => dims.periods.find((r) => String(r.is_reference).toLowerCase() === "true")?.period_id ?? state.period, [dims.periods, state.period]);
  const fixedBody = useMemo(() => (state.scale === "fixed" ? mapBody({ ...state, sector: null, gas: null, month: null, period: referencePeriod }) : null), [state, referencePeriod]);
  const fixedQ = useQuery({ queryKey: ["map", fixedBody], queryFn: () => api.queryEmissions(fixedBody!), enabled: !!fixedBody, retry: false });

  const residual = useMemo(() => residualUnit(dims, bboxes.data), [dims, bboxes.data]);
  const exIdx = useMemo(() => exceptionIndex(dims, residual?.name ?? null), [dims, residual]);
  const exItems = useMemo(() => (exIdx ? exceptionItems(release, exIdx, residual) : []), [exIdx, release, residual]);
  const ids = useMemo(() => (state.level === "adm1" ? Object.keys(bboxes.data?.adm1 ?? {}) : state.level === "adm2" ? Object.keys(bboxes.data?.adm2 ?? {}) : []), [state.level, bboxes.data]);
  const exPresent = useMemo(() => (state.layer === "exceptions" ? exceptionKindsPresent(state.level, index, ids, residual, exIdx) : new Set<string>()), [state.layer, state.level, index, ids, residual, exIdx]);

  const sharedCell = index && residual && state.level === "adm1" ? index.byId.get(residual.name) : undefined;
  const scope = [LEVEL_WORD[state.level], scopeWords(labels, state, defaults.gwp_basis, sectorWords(labels, state.sector), state.gas ? gasLabel(labels, state.gas) : null, state.month ? monthLabel(labels, state.month) : null, state.view !== "all" ? viewLabel(labels, state.view).split(":")[0] : null)].join(" · ");

  return {
    state,
    scope,
    env: mapQ.data,
    index,
    error: mapQ.error,
    isLoading: mapQ.isLoading,
    raster: tiles.data?.raster,
    hasCells: !!index && anyWithoutCell(index, state.level, ids, residual),
    shared: sharedCell && residual ? { ...residual, cell: sharedCell } : null,
    unallocated: { env: provinceQ.data, index: unallocIdx, error: provinceQ.error, isLoading: provinceQ.isLoading },
    exceptions: { present: exPresent, items: exItems },
    fixed: { env: fixedQ.data, ends: envelopeEnds(fixedQ.data) },
  };
}
