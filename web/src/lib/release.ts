"use client";
/**
 * GET /v1/release, read once and shared: the dims (periods, months by period, geography rows,
 * sectors, gases), the humanised labels the server built from the dims, the defaults and the
 * agent block. Every list a control shows comes from here; nothing is typed in the client.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { ReleaseInfo } from "./envelope";

export type Adm2Row = { geography_id: string; name: string; shape_id: string; shape_name: string; parent_id: string; has_polygon: "yes" | "no"; status: string; unit_kind: string };
export type Adm1Row = { geography_id: string; name: string; shape_id: string; has_polygon: "yes" | "no" };
export type PeriodRow = { period_id: string; basis: string; is_reference: string; availability: string };
export type ConfigLabel = { label: string; letter: string; kind: string; display_name: string; queryable: boolean; axis: string; module: string; note: string };
export type PeriodLabel = { label: string; short: string; start: string; end: string; basis: string; availability: string; is_reference: boolean; note: string };
export type Labels = {
  configurations: Record<string, ConfigLabel>;
  periods: Record<string, PeriodLabel>;
  months: Record<string, string>;
  views: Record<string, string>;
  limitations: Record<string, string>;
  gases: Record<string, string>;
  sectors: Record<string, string>;
  geographies: Record<string, string>;
};
export type Defaults = { basis: string; configuration_id: string; gwp_basis: string; period_id: string; spatial_view: string; geography_id: string };

export function useRelease() {
  return useQuery({ queryKey: ["release"], queryFn: api.release, staleTime: Infinity });
}

/** Typed views over the release summary. Each accessor returns [] or {} when the block is absent. */
export function releaseDims(r: ReleaseInfo | undefined) {
  const dims = (r?.dims ?? {}) as Record<string, Record<string, unknown>>;
  const geography = dims.dim_geography ?? {};
  const monthDim = dims.dim_month ?? {};
  const periodRows = ((dims.dim_period?.values as PeriodRow[] | undefined) ?? []);
  return {
    adm1: (geography.adm1 as Adm1Row[] | undefined) ?? [],
    adm2: (geography.adm2 as Adm2Row[] | undefined) ?? [],
    periods: periodRows,
    fiscalPeriods: periodRows.filter((p) => p.basis === "fiscal").map((p) => p.period_id),
    monthsByPeriod: (monthDim.by_period as Record<string, string[]> | undefined) ?? {},
    sectors: (dims.sectors as unknown as string[] | undefined) ?? [],
    gases: (dims.dim_gas?.values as string[] | undefined) ?? [],
    configurations: ((dims.dim_configuration?.queryable as { configuration_id: string }[] | undefined) ?? []).map((c) => c.configuration_id),
  };
}

export function releaseLabels(r: ReleaseInfo | undefined): Labels {
  const l = (r as unknown as { labels?: Partial<Labels> } | undefined)?.labels ?? {};
  return {
    configurations: l.configurations ?? {},
    periods: l.periods ?? {},
    months: l.months ?? {},
    views: l.views ?? {},
    limitations: l.limitations ?? {},
    gases: l.gases ?? {},
    sectors: l.sectors ?? {},
    geographies: l.geographies ?? {},
  };
}

export function releaseDefaults(r: ReleaseInfo | undefined): Defaults | undefined {
  const d = r?.defaults as Partial<Defaults> | undefined;
  if (!d || !d.configuration_id || !d.gwp_basis || !d.period_id) return undefined;
  return { basis: d.basis ?? "", configuration_id: d.configuration_id, gwp_basis: d.gwp_basis, period_id: d.period_id, spatial_view: d.spatial_view ?? "all", geography_id: d.geography_id ?? "" };
}

export function releaseAgent(r: ReleaseInfo | undefined): { enabled: boolean; model: string; reason: string } {
  const a = (r as unknown as { agent?: { enabled?: boolean; model?: string; reason?: string } } | undefined)?.agent;
  return { enabled: !!a?.enabled, model: a?.model ?? "", reason: a?.reason ?? "not mounted" };
}
