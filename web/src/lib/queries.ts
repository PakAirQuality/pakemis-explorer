"use client";
/** react-query wrappers over the typed client; a typed refusal is an error the caller shows by name (no retry). */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type CompareRequest, type GridCellRequest, type QueryEmissions, type TimeseriesRequest, type UncertaintyRequest, type CompletenessRequest } from "./api";
import { briefingBodies, sectorSeriesBody, seriesBody, type LineageRequest } from "./requests";
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
 * The Overview briefing's envelopes for a scope (`geo`: a province name, or null for
 * Pakistan): the total, the sector and gas breakdowns, every province and the annual series
 * (refused by the release off the national scope). Bodies from lib/requests.ts
 * briefingBodies; nothing here computes. The interval, completeness and evidence envelopes
 * are no longer asked here (their widgets left the Overview); Explore and Methods ask them.
 */
export function useBriefing(geo: string | null) {
  const { state } = useExplorer();
  const bodies = useMemo(() => briefingBodies(state, geo), [state, geo]);
  return {
    bodies,
    total: useEmissions(bodies.total),
    bySector: useEmissions(bodies.bySector),
    byGas: useEmissions(bodies.byGas),
    provinces: useEmissions(bodies.provinces),
    series: useTimeseries(bodies.series),
  };
}
export type Briefing = ReturnType<typeof useBriefing>;
