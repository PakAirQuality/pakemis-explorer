/**
 * The Explore page's "Break down by" control: the single-key `group_by` values of the contract
 * that the release answers at national grain (sector_id, category, gas; month with the period's
 * twelve months), and the one it cannot (province needs a geography level: the API refuses it
 * with a typed `grain_unavailable`, so the option is offered disabled with that reason). The
 * request body is a pure function of the URL state (`by` beside lib/urlState.ts's keys), so the
 * same URL makes the same request and the same receipt. The "Showing:" sentence is built from
 * the release's labels only; nothing here is an id a reader sees.
 */
import type { QueryEmissions } from "./api";
import { configWords, gwpLabel, periodShort, sectorWords } from "./labels";
import type { Labels } from "./release";
import type { ExplorerState } from "./urlState";
import { scopeBody } from "./requests";

export const BREAKDOWNS = ["sector", "ipcc", "gas", "month", "province"] as const;
export type Breakdown = (typeof BREAKDOWNS)[number];

export type BreakdownMeta = {
  /** The option's label. */
  label: string;
  /** The contract's group key. */
  groupBy: string;
  /** "grouped by sector": the words of the Showing sentence. */
  words: string;
  /** The result card's title. */
  title: string;
  /** The row noun of the caption ("sector"). */
  noun: string;
  /** Set when the release refuses the key at national grain; the option is disabled with this reason. */
  unavailable?: string;
};

export const PROVINCE_REASON = "The release carries no province column at national grain; provinces are answered on the Map, which asks at province level.";

export const BREAKDOWN_META: Record<Breakdown, BreakdownMeta> = {
  sector: { label: "Sector", groupBy: "sector_id", words: "grouped by sector", title: "Emissions by sector", noun: "sector" },
  ipcc: { label: "IPCC category", groupBy: "category", words: "grouped by IPCC category", title: "Emissions by IPCC category", noun: "category" },
  gas: { label: "Gas", groupBy: "gas", words: "grouped by gas", title: "Emissions by gas", noun: "gas" },
  month: { label: "Month", groupBy: "month", words: "grouped by month", title: "Emissions by month", noun: "month" },
  province: { label: "Province", groupBy: "province", words: "grouped by province", title: "Emissions by province", noun: "province", unavailable: PROVINCE_REASON },
};

/**
 * The breakdown's request: the scope's filters (period, configuration, GWP basis, sector, gas)
 * grouped by the one key, ordered by value; a month breakdown sends the period's month list
 * (the contract's `months`) and the month filter is dropped so the twelve cells partition the
 * year. Null for a key the release refuses at this grain.
 */
export function breakdownBody(s: Pick<ExplorerState, "period" | "config" | "gwp" | "sector" | "gas" | "month">, by: Breakdown, months: string[]): QueryEmissions | null {
  const meta = BREAKDOWN_META[by];
  if (meta.unavailable) return null;
  const base = scopeBody(by === "month" ? { ...s, month: null } : s);
  if (by === "month") {
    if (!months.length) return null;
    return { ...base, months, group_by: [meta.groupBy], order_by: "value desc" };
  }
  return { ...base, group_by: [meta.groupBy], order_by: "value desc" };
}

/** The sector breakdown of the whole scope (every sector), for the "Largest sector" card. */
export function sectorsBody(s: Pick<ExplorerState, "period" | "config" | "gwp" | "sector" | "gas" | "month">): QueryEmissions {
  return { ...scopeBody({ ...s, sector: null }), group_by: ["sector_id"], order_by: "value desc" };
}

/** One sector's categories, ordered: the breakdown the page runs after a sector row is selected. */
export function categoriesBody(s: Pick<ExplorerState, "period" | "config" | "gwp" | "sector" | "gas" | "month">, sector: string): QueryEmissions {
  return { ...scopeBody({ ...s, sector }), group_by: ["category"], order_by: "value desc" };
}

/** "reference emissions": the configuration's words with "estimate" read as "emissions". */
export function estimateNoun(labels: Labels, config: string): string {
  return configWords(labels, config).replace(/\bestimate\b/, "emissions");
}

/** "IPCC 2013": the basis label without its parenthetical short form. */
export function gwpWords(labels: Labels, gwp: string): string {
  return gwpLabel(labels, gwp).replace(/\s*\([^)]*\)\s*$/, "");
}

/**
 * "Pakistan's 2023–24 reference emissions, all sectors, grouped by sector, using IPCC 2013
 * warming factors." Every phrase is a label of the release; the gas, when one is chosen, is
 * named after the sector.
 */
export function showingSentence(labels: Labels, s: Pick<ExplorerState, "period" | "config" | "gwp" | "sector" | "gas">, by: Breakdown, gasName?: string): string {
  const parts = [`Pakistan's ${periodShort(labels, s.period)} ${estimateNoun(labels, s.config)}`, sectorWords(labels, s.sector).toLowerCase()];
  if (s.gas && gasName) parts.push(`${gasName} only`);
  parts.push(BREAKDOWN_META[by].words);
  return `${parts.join(", ")}, using ${gwpWords(labels, s.gwp)} warming factors.`;
}
