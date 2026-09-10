"use client";
/**
 * GET /release, read once and shared: the dims (periods, months by period, geography rows,
 * sectors, gases), the humanised labels the server built from the dims, the defaults and the
 * agent block. Every list a control shows comes from here; nothing is typed in the client.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { ReleaseInfo } from "./envelope";

export type Adm2Row = { geography_id: string; name: string; shape_id: string; shape_name: string; parent_id: string; has_polygon: "yes" | "no"; status: string; unit_kind: string };
export type Adm1Row = { geography_id: string; name: string; shape_id: string; has_polygon: "yes" | "no" };
export type PeriodRow = { period_id: string; basis: string; is_reference: string; availability: string };
/** `label` is what a reader sees ("Reference estimate", "Survey-based estimate"); `letter` and the id stay for URLs and receipts; `tooltip` is the dim row's note. */
export type ConfigLabel = { label: string; letter: string; kind: string; display_name: string; queryable: boolean; axis: string; module: string; note: string; tooltip?: string };
/** A GWP basis worded: `label` "IPCC 2013 (AR5)", `short` "AR5", `compact` "IPCC AR5", `tooltip` the sentence quoting the release's factors, `is_default` from the release's defaults. */
export type GwpLabel = { label: string; short: string; compact: string; tooltip: string; is_default: boolean };
/** The LULUCF status worded: `short` "excludes land use and forestry", `compact` "land use excluded", `tooltip` the release's note. */
export type LulucfLabel = { short: string; compact: string; status: string; notation_key: string; tooltip: string };
/** `short` is what a chip, rail or axis prints ("2023–24"); `label` spells the months out ("July 2023 – June 2024"), the tooltip; `basis_note` says once what the basis means. */
export type PeriodLabel = { label: string; short: string; start: string; end: string; basis: string; availability: string; is_reference: boolean; note: string; basis_note?: string };
export type Labels = {
  configurations: Record<string, ConfigLabel>;
  periods: Record<string, PeriodLabel>;
  months: Record<string, string>;
  views: Record<string, string>;
  limitations: Record<string, string>;
  gases: Record<string, string>;
  sectors: Record<string, string>;
  /** Mid-sentence / axis forms; a sector absent here reads its full label. */
  sectors_short: Record<string, string>;
  /** The economic-sector view's own ids ('industrial'); every other economic sector is a module. */
  economic_sectors: Record<string, string>;
  economic_sectors_short: Record<string, string>;
  geographies: Record<string, string>;
  gwp: Record<string, GwpLabel>;
  lulucf: LulucfLabel;
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
    sectors_short: l.sectors_short ?? {},
    economic_sectors: l.economic_sectors ?? {},
    economic_sectors_short: l.economic_sectors_short ?? {},
    geographies: l.geographies ?? {},
    gwp: l.gwp ?? {},
    lulucf: l.lulucf ?? { short: "", compact: "", status: "", notation_key: "", tooltip: "" },
  };
}

export function releaseDefaults(r: ReleaseInfo | undefined): Defaults | undefined {
  const d = r?.defaults as Partial<Defaults> | undefined;
  if (!d || !d.configuration_id || !d.gwp_basis || !d.period_id) return undefined;
  return { basis: d.basis ?? "", configuration_id: d.configuration_id, gwp_basis: d.gwp_basis, period_id: d.period_id, spatial_view: d.spatial_view ?? "all", geography_id: d.geography_id ?? "" };
}

export type ReleaseFacts = {
  reportingPeriod: { label: string; start: string; end: string; note: string } | null;
  lulucf: { status: string; notation_key: string; note: string };
  gwp: { reported: string; secondary: string; bases: string[] };
  licences: { code: string; data_and_text: string; odbl_note: string; odbl_carveouts: string[]; undetermined: string };
};

/**
 * The release's own statements the explainer quotes: the reporting period and its note, the
 * LULUCF status and note, the GWP bases (reported / secondary) and the licences. All from the
 * nested `release` block of /release (the semantic release), with the context bar as the
 * fallback for the period and LULUCF; nothing here is typed in the client.
 */
export function releaseFacts(r: ReleaseInfo | undefined): ReleaseFacts {
  const nested = ((r as unknown as { release?: Record<string, unknown> } | undefined)?.release ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const rp = (nested.reporting_period ?? r?.context_bar?.reporting_period ?? null) as Record<string, unknown> | null;
  const lu = (nested.lulucf ?? r?.context_bar?.lulucf ?? {}) as Record<string, unknown>;
  const gw = (nested.gwp_bases ?? {}) as Record<string, unknown>;
  const li = (nested.licences ?? r?.licences ?? {}) as Record<string, unknown>;
  return {
    reportingPeriod: rp ? { label: str(rp.label), start: str(rp.start), end: str(rp.end), note: str(rp.note) } : null,
    lulucf: { status: str(lu.status), notation_key: str(lu.notation_key), note: str(lu.note) },
    gwp: { reported: str(gw.reported), secondary: str(gw.secondary), bases: Object.keys((gw.factors as Record<string, unknown> | undefined) ?? {}) },
    licences: { code: str(li.code), data_and_text: str(li.data_and_text), odbl_note: str(li.odbl_note), odbl_carveouts: Array.isArray(li.odbl_carveouts) ? (li.odbl_carveouts as unknown[]).map(String) : [], undetermined: str(li.undetermined) },
  };
}

/** `/release.citation`: APA and BibTeX for the served release with the DOI slot's note; null while the API has none. The version legitimately appears inside these strings and nowhere else on a page. */
export type Citation = { apa: string; bibtex: string; doi: string; doi_note: string; cite_as?: string; repository?: string; commit?: string; period_span?: string };
export function releaseCitation(r: ReleaseInfo | undefined): Citation | null {
  const c = (r as unknown as { citation?: Partial<Citation> } | undefined)?.citation;
  if (!c || typeof c.apa !== "string" || typeof c.bibtex !== "string") return null;
  return { apa: c.apa, bibtex: c.bibtex, doi: c.doi ?? "", doi_note: c.doi_note ?? "", cite_as: c.cite_as, repository: c.repository, commit: c.commit, period_span: c.period_span };
}

/** `/release.doi`: the three DOI slots of the manifest (empty strings until the release freeze). */
export function releaseDoi(r: ReleaseInfo | undefined): { data: string; documentation: string; software: string } {
  const d = ((r as unknown as { doi?: Record<string, unknown> } | undefined)?.doi ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return { data: str(d.data), documentation: str(d.documentation), software: str(d.software) };
}

export function releaseAgent(r: ReleaseInfo | undefined): { enabled: boolean; model: string; reason: string } {
  const a = (r as unknown as { agent?: { enabled?: boolean; model?: string; reason?: string } } | undefined)?.agent;
  return { enabled: !!a?.enabled, model: a?.model ?? "", reason: a?.reason ?? "not mounted" };
}
