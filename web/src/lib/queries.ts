"use client";
/** react-query wrappers over the typed client; a typed refusal is an error the caller shows by name (no retry). */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type CompareRequest, type GridCellRequest, type QueryEmissions, type TimeseriesRequest, type UncertaintyRequest, type CompletenessRequest } from "./api";
import { deckBodies, sectorSeriesBody, seriesBody, type LineageRequest } from "./requests";
import { provinceOfShape } from "./labels";
import type { ExplorerState } from "./urlState";
import { useExplorer } from "@/components/ExplorerContext";

const opts = { retry: false as const, staleTime: 5 * 60 * 1000 };

export function useEmissions(body: QueryEmissions | null | undefined, enabled = true) {
  return useQuery({ queryKey: ["emissions", body], queryFn: () => api.queryEmissions(body!), enabled: enabled && !!body, ...opts });
}
export function useCompare(body: CompareRequest | null | undefined, enabled = true) {
  return useQuery({ queryKey: ["compare", body], queryFn: () => api.compare(body!), enabled: enabled && !!body, ...opts });
}
export function useTimeseries(body: TimeseriesRequest | null | undefined, enabled = true) {
  return useQuery({ queryKey: ["timeseries", body], queryFn: () => api.timeseries(body!), enabled: enabled && !!body, ...opts });
}
export function useLineage(req: LineageRequest | null | undefined, enabled = true) {
  return useQuery({ queryKey: ["lineage", req], queryFn: () => api.lineage(req!.id, req!.params), enabled: enabled && !!req, ...opts });
}
export function useGridCell(body: GridCellRequest | null | undefined, enabled = true) {
  return useQuery({ queryKey: ["grid-cell", body], queryFn: () => api.gridCell(body!), enabled: enabled && !!body, ...opts });
}
export function useUncertainty(body: UncertaintyRequest | null | undefined, enabled = true) {
  return useQuery({ queryKey: ["uncertainty", body], queryFn: () => api.uncertainty(body!), enabled: enabled && !!body, ...opts });
}
export function useCompleteness(body: CompletenessRequest | null | undefined, enabled = true) {
  return useQuery({ queryKey: ["completeness", body], queryFn: () => api.completeness(body!), enabled: enabled && !!body, ...opts });
}
export function useEvidence(streamId: string, params: { module?: string; category?: string } = {}, enabled = true) {
  return useQuery({ queryKey: ["evidence", streamId, params], queryFn: () => api.evidence(streamId, params), enabled, ...opts });
}
export function useMethod(methodOrCategory: string, enabled = true) {
  return useQuery({ queryKey: ["method", methodOrCategory], queryFn: () => api.method(methodOrCategory), enabled: enabled && !!methodOrCategory, ...opts });
}

/** Whether a queryable configuration's `available_periods` ("FY2023-24" or "FY2015-16..FY2023-24") covers a period. */
export function configCoversPeriod(availablePeriods: string | undefined, period: string, fiscalPeriods: string[]): boolean {
  if (!availablePeriods) return false;
  if (availablePeriods === period) return true;
  const [a, b] = availablePeriods.split("..");
  if (!b) return false;
  const i = fiscalPeriods.indexOf(period);
  const ia = fiscalPeriods.indexOf(a);
  const ib = fiscalPeriods.indexOf(b);
  return i >= 0 && ia >= 0 && ib >= 0 && i >= ia && i <= ib;
}

/** The national annual series under the reference configuration and the reported GWP basis, unfiltered (the Overview's trend). */
export function useNationalSeries() {
  const { defaults } = useExplorer();
  const body = useMemo(() => seriesBody({ config: defaults.configuration_id, gwp: defaults.gwp_basis, sector: null, gas: null }), [defaults.configuration_id, defaults.gwp_basis]);
  return useTimeseries(body);
}

/** One sector's annual series under the same configuration and basis, every gas. */
export function useSectorSeries(sector: string | null | undefined) {
  const { defaults } = useExplorer();
  const body = useMemo(() => (sector ? sectorSeriesBody({ config: defaults.configuration_id, gwp: defaults.gwp_basis }, sector) : null), [defaults.configuration_id, defaults.gwp_basis, sector]);
  return useTimeseries(body, !!sector);
}

/** The reference period's id: the dim row flagged is_reference, else the last fiscal period. */
export function useReferencePeriod(): string {
  const { dims } = useExplorer();
  return dims.periods.find((p) => String(p.is_reference).toLowerCase() === "true")?.period_id ?? dims.fiscalPeriods[dims.fiscalPeriods.length - 1] ?? "";
}

/**
 * The series uncertainty of one period: `get_uncertainty(scope="series", period_id)`, whose
 * `annual_level` cells bound the same national total the KPI shows, one per scenario. Kept
 * for the Explore page; the Overview shows the national (parametric) interval instead.
 */
export function useSeriesUncertainty(periodId: string | null | undefined) {
  return useUncertainty(periodId ? { scope: "series", period_id: periodId } : null, !!periodId);
}

/** The release's headline parametric uncertainty: `get_uncertainty(scope="national")`, one cell per scenario. */
export function useNationalUncertainty(enabled = true) {
  return useUncertainty({ scope: "national" }, enabled);
}

/**
 * Which of the deck's envelopes are wanted right now. A collapsed card renders nothing and must
 * ask for nothing, so the deck passes what its open cards need and every other query stays
 * disabled. An absent flag means "wanted": a caller that does not gate gets the whole plan.
 */
export type DeckWants = { total?: boolean; ranked?: boolean; breakdown?: boolean; provinces?: boolean; peers?: boolean; series?: boolean };

const wanted = (w: DeckWants, k: keyof DeckWants) => w[k] !== false;

/**
 * The insight deck's envelopes for a state: the selected thing's total, the partition its share
 * and rank come from, what it is made of, the provinces, the district's peers and the annual
 * series — every body from lib/requests.ts `deckBodies`, nothing computed here. The two
 * district-only cards ask for their lineage themselves (`useLineage`, off `bodies.lineage`).
 *
 * The peer partition is read from the release's own dims: the ADM2 shapes whose parent is the
 * selected district's province, so the server ranks the district against its own province.
 */
export function useDeck(state: ExplorerState, wants: DeckWants = {}) {
  const { dims } = useExplorer();
  const months = dims.monthsByPeriod[state.period];
  const peers = useMemo(() => {
    if (state.level !== "adm2" || !state.geo) return [];
    const province = provinceOfShape(dims, state.geo);
    if (!province) return [];
    return Array.from(new Set(dims.adm2.filter((r) => r.parent_id === `ADM1:${province}`).map((r) => r.shape_id).filter(Boolean)));
  }, [dims, state.level, state.geo]);
  const bodies = useMemo(() => deckBodies(state, { months: months ?? [], peers }), [state, months, peers]);
  return {
    bodies,
    total: useEmissions(bodies.total, wanted(wants, "total")),
    ranked: useEmissions(bodies.ranked?.body, wanted(wants, "ranked") && !!bodies.ranked),
    breakdown: useEmissions(bodies.breakdown.body, wanted(wants, "breakdown")),
    provinces: useEmissions(bodies.provinces, wanted(wants, "provinces")),
    peers: useEmissions(bodies.peers, wanted(wants, "peers") && !!bodies.peers),
    series: useTimeseries(bodies.series, wanted(wants, "series")),
  };
}
export type Deck = ReturnType<typeof useDeck>;
