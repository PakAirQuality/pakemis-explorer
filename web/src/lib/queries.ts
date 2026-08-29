"use client";
/** react-query wrappers over the typed client; a typed refusal is an error the caller shows by name (no retry). */
import { useQuery } from "@tanstack/react-query";
import { api, type CompareRequest, type GridCellRequest, type QueryEmissions, type TimeseriesRequest, type UncertaintyRequest, type CompletenessRequest } from "./api";
import type { LineageRequest } from "./requests";

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
