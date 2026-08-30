/**
 * The Explore canvas' state and its one query. The page's controls (Geography, Period,
 * Sector / category, Gas, Measure, Estimate) resolve to an `ExploreState`; `buildQuery` maps
 * that state to exactly one contract call — `query_emissions` with a single `group_by`,
 * `get_timeseries` for a year range, `compare_emissions` for the two estimates — or to a typed
 * refusal the page shows by name (a category filter off the national grain). The breakdown is
 * the control the reader varied last (`transition`): a year range groups by period, a sector
 * by its categories, a category by gas, "By gas" by gas, several places by place, "Compare
 * estimates" by the two configurations. Every function here is pure: the same state makes the
 * same body and therefore the same receipt. Words for the subtitle come from the release's
 * labels through lib/breakdown.ts and lib/labels.ts; no number is written here.
 */
import type { CompareRequest, QueryEmissions, TimeseriesRequest } from "../api";
import type { Refusal } from "../envelope";
import { estimateNoun, gwpWords } from "../breakdown";
import { configLabel, districtName, periodShort, sectorLabel, type Dims as GeoDims } from "../labels";
import type { Labels } from "../release";
import type { ExplorerState, Level } from "../urlState";

export const BREAKDOWNS = ["sector", "category", "gas", "period", "month", "place", "estimate"] as const;
export type Breakdown = (typeof BREAKDOWNS)[number];
export const REPS = ["chart", "table", "map"] as const;
export type Rep = (typeof REPS)[number];
export type Grain = "national" | "adm1" | "adm2";
export type ChartKind = "bars" | "stacked" | "line" | "column" | "grouped";

/** The sentinel of the `geos` URL key: every unit of the level (all provinces, all districts). */
export const ALL_PLACES = "all";

export type ExploreState = {
  /** The grain the query asks at: national, or the level of the places. */
  level: Grain;
  /** The places at that level: none (every unit when `allPlaces`, the nation otherwise), one, or several provinces. */
  geos: string[];
  allPlaces: boolean;
  period: string;
  /** Every fiscal year as a series (Period = Range). */
  range: boolean;
  sector: string | null;
  category: string | null;
  gas: string | null;
  config: string;
  gwp: string;
  view: string;
  by: Breakdown;
  rep: Rep;
  /** Measure = Share of total: the chart labels the server's share_pct_short instead of the value. */
  share: boolean;
};

/** What the release offers the builder: the fiscal years, the reference year, its months, the queryable configurations. */
export type ExploreContext = {
  periods: string[];
  referencePeriod: string;
  monthsOf: (period: string) => string[];
  /** The reference configuration and the survey-based one when the release carries two; the second is null otherwise. */
  reference: string;
  survey: string | null;
  /** Whether the survey configuration covers a period (`configCoversPeriod`). */
  surveyCovers: (period: string) => boolean;
};

/** The URL form: the shared keys of lib/urlState.ts and the page-local ones (`by`, `rep`, `range`, `geos`, `cat`, `share`). */
export type LocalKeys = { by: string | null; rep: string | null; range: boolean | null; geos: string | null; cat: string | null; share: boolean | null };

export type QueryPlan =
  | { kind: "emissions"; body: QueryEmissions; groupBy: string; chart: ChartKind; /** The values the canvas keeps (several provinces out of the ADM1 envelope): a filter, never arithmetic. */ filterTo?: { key: string; ids: string[] } }
  | { kind: "timeseries"; body: TimeseriesRequest; groupBy: "period_id"; chart: "line" }
  | { kind: "compare"; body: CompareRequest; groupBy: string; chart: "grouped" }
  | { kind: "refused"; refusal: Refusal };

function compact<T extends Record<string, unknown>>(body: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as T;
}

// --- resolution ---------------------------------------------------------------------------

function isBreakdown(v: string | null | undefined): v is Breakdown {
  return !!v && (BREAKDOWNS as readonly string[]).includes(v);
}
function isRep(v: string | null | undefined): v is Rep {
  return !!v && (REPS as readonly string[]).includes(v);
}

/**
 * The reason a breakdown cannot be asked in a state (the option's disabled title), or null
 * when it can. The reasons name what the release answers, never a column id.
 */
export function unavailableReason(s: ExploreState, ctx: ExploreContext, by: Breakdown, labels?: Labels): string | null {
  const ref = labels ? periodShort(labels, ctx.referencePeriod) : ctx.referencePeriod;
  if (s.geos.length > 1 && by !== "place") return "Two provinces are compared side by side; choose one place to see its composition.";
  switch (by) {
    case "sector":
      return s.sector ? "Choose All sectors to compare the sectors." : null;
    case "category":
      if (!s.sector) return "Choose a sector to see its categories.";
      if (s.level !== "national") return "Categories are answered at national grain only in this release.";
      if (s.category) return "Choose the whole sector to compare its categories.";
      return null;
    case "gas":
      return s.gas ? "Choose All gases to compare the gases." : null;
    case "period":
      return s.level !== "national" ? `Province and district results exist for ${ref} only; a series is national.` : null;
    case "month":
      if (s.period !== ctx.referencePeriod) return `Months are published for ${ref} only.`;
      return ctx.monthsOf(s.period).length ? null : "The release carries no months for this year.";
    case "place":
      if (s.level === "national") return "Choose Compare provinces or a district view under Geography.";
      return s.geos.length === 1 ? "One place is chosen; add a second province or compare every province." : null;
    case "estimate":
      if (!ctx.survey) return "This release carries one estimate.";
      return ctx.surveyCovers(s.period) ? null : `The survey-based estimate covers ${ref} only.`;
  }
}

/** The breakdown a state falls back to when the one asked cannot be answered: the composition of what is chosen. */
export function fallbackBreakdown(s: ExploreState, ctx: ExploreContext): Breakdown {
  // several places (every province, two provinces) read side by side first; otherwise the composition of what is chosen
  const order: Breakdown[] = s.allPlaces || s.geos.length > 1 ? ["place", "category", "sector", "gas", "month", "period", "estimate"] : ["category", "sector", "gas", "place", "month", "period", "estimate"];
  for (const b of order) if (!unavailableReason(s, ctx, b)) return b;
  return "sector";
}

/**
 * The state from the URL: the shared keys (level, geo, period, sector, gas, config, gwp, view)
 * and the page-local ones, with the dependent clean-ups (a year range is a series by period; a
 * breakdown the state cannot answer falls back to the composition of what is chosen; a
 * category off the national grain is kept, so the page can refuse it by name).
 */
export function resolveExplore(shared: ExplorerState, local: LocalKeys, ctx: ExploreContext): ExploreState {
  const geosRaw = local.geos ? local.geos.split(",").map((g) => g.trim()).filter(Boolean) : [];
  const allPlaces = geosRaw.length === 1 && geosRaw[0] === ALL_PLACES;
  const geos = allPlaces ? [] : geosRaw.length ? geosRaw : shared.geo ? [shared.geo] : [];
  const urlLevel: Level = shared.level;
  const level: Grain = geos.length || allPlaces ? (urlLevel === "adm2" ? "adm2" : "adm1") : "national";
  const range = !!local.range && ctx.periods.length > 1;
  const s: ExploreState = {
    level,
    geos: level === "adm2" ? geos.slice(0, 1) : geos,
    allPlaces,
    period: ctx.periods.includes(shared.period) ? shared.period : ctx.referencePeriod,
    range,
    sector: shared.sector,
    category: shared.sector ? local.cat : null,
    gas: shared.gas,
    config: shared.config,
    gwp: shared.gwp,
    view: shared.view,
    by: "sector",
    rep: isRep(local.rep) ? local.rep : "chart",
    share: !!local.share,
  };
  if (range) {
    s.by = "period";
    if (unavailableReason(s, ctx, "period")) {
      s.range = false;
      s.by = fallbackBreakdown(s, ctx);
    }
    return s;
  }
  const asked = isBreakdown(local.by) ? local.by : null;
  s.by = asked && asked !== "period" && !unavailableReason(s, ctx, asked) ? asked : fallbackBreakdown(s, ctx);
  return s;
}

/** The URL of a state: the shared patch and the local keys, defaults written as null (absent). */
export function toUrl(s: ExploreState): { shared: Partial<ExplorerState>; local: LocalKeys } {
  const several = s.geos.length > 1;
  return {
    shared: {
      level: s.level === "adm2" ? "adm2" : "adm1",
      geo: s.geos.length === 1 ? s.geos[0] : null,
      period: s.period,
      month: null,
      sector: s.sector,
      gas: s.gas,
      config: s.config,
      gwp: s.gwp,
      view: s.view,
    },
    local: {
      by: s.range ? null : s.by === "sector" ? null : s.by,
      rep: s.rep === "chart" ? null : s.rep,
      range: s.range ? true : null,
      geos: s.allPlaces ? ALL_PLACES : several ? s.geos.join(",") : null,
      cat: s.category,
      share: s.share ? true : null,
    },
  };
}

// --- transitions --------------------------------------------------------------------------

export type Action =
  | { control: "geography"; value: "national" | "provinces" | "districts" }
  | { control: "geography"; value: "province" | "district"; id: string }
  | { control: "geography"; value: "second"; id: string | null }
  | { control: "period"; value: "range" | "months" | { period: string } }
  | { control: "sector"; value: string | null }
  | { control: "category"; value: string | null }
  | { control: "gas"; value: "by" | string | null }
  | { control: "measure"; value: "share" | { gwp: string } }
  | { control: "estimate"; value: "compare" | { config: string } }
  | { control: "view"; value: string }
  | { control: "rep"; value: Rep }
  | { control: "by"; value: Breakdown };

/**
 * The next state after a control changes. The breakdown follows the control varied last where
 * the change implies one (a range → period; a sector → its categories; a category → its gases;
 * By gas → gas; two or every places → place; Compare estimates → estimate); otherwise it is kept
 * when still answerable and falls back to the composition of what is chosen when not.
 */
export function transition(s: ExploreState, a: Action, ctx: ExploreContext): ExploreState {
  let n: ExploreState = { ...s };
  const settle = (by?: Breakdown) => {
    if (by) {
      n.by = by;
      n.range = by === "period";
    }
    if (n.by === "period") n.range = true;
    if (n.level !== "national") n.category = null;
    if (unavailableReason(n, ctx, n.by)) {
      n.by = fallbackBreakdown(n, ctx);
      n.range = n.by === "period";
    }
    return n;
  };
  switch (a.control) {
    case "geography":
      if (a.value === "national") {
        n = { ...n, level: "national", geos: [], allPlaces: false };
        return settle();
      }
      if (a.value === "provinces" || a.value === "districts") {
        n = { ...n, level: a.value === "provinces" ? "adm1" : "adm2", geos: [], allPlaces: true, range: false };
        return settle("place");
      }
      if (a.value === "province" || a.value === "district") {
        n = { ...n, level: a.value === "province" ? "adm1" : "adm2", geos: [a.id], allPlaces: false, range: false };
        return settle();
      }
      // a second province beside the first, or none
      if (a.value === "second") {
        n = { ...n, level: "adm1", allPlaces: false, geos: a.id ? [n.geos[0], a.id].filter(Boolean) : n.geos.slice(0, 1), range: false };
        return settle(a.id ? "place" : undefined);
      }
      return n;
    case "period":
      if (a.value === "range") return settle("period");
      if (a.value === "months") {
        n.period = ctx.referencePeriod;
        return settle("month");
      }
      n.period = a.value.period;
      n.range = false;
      if (n.by === "period") n.by = fallbackBreakdown(n, ctx);
      return settle();
    case "sector":
      n.sector = a.value;
      n.category = null;
      if (!a.value) return settle(n.level === "national" || n.geos.length === 1 ? "sector" : "place");
      return settle(n.level === "national" ? "category" : n.geos.length === 1 ? "gas" : "place");
    case "category":
      n.category = a.value;
      return settle(a.value ? "gas" : "category");
    case "gas":
      if (a.value === "by") {
        n.gas = null;
        return settle("gas");
      }
      n.gas = a.value;
      // All gases chosen while grouped by gas: the reader left the gas breakdown, so the composition of what is chosen takes over
      if (!a.value && n.by === "gas") n.by = fallbackBreakdown(n, ctx);
      return settle();
    case "measure":
      if (a.value === "share") n.share = true;
      else {
        n.gwp = a.value.gwp;
        n.share = false;
      }
      return settle();
    case "estimate":
      if (a.value === "compare") return settle("estimate");
      n.config = a.value.config;
      if (n.by === "estimate") n.by = fallbackBreakdown(n, ctx);
      return settle();
    case "view":
      n.view = a.value;
      return n;
    case "rep":
      n.rep = a.value;
      return n;
    case "by":
      return settle(a.value);
  }
}

// --- the one query -------------------------------------------------------------------------

/** The filters every form of the query shares: period, configuration, GWP basis, sector, gas, category, and the place when one is chosen. */
function scopeOf(s: ExploreState): QueryEmissions {
  return compact({
    periods: [s.period],
    configuration_id: s.config,
    gwp_basis: s.gwp,
    sectors: s.sector ? [s.sector] : [],
    gases: s.gas ? [s.gas] : [],
    categories: s.category ? [s.category] : [],
    ...(s.level === "national" ? {} : { geography_level: s.level, geography_ids: s.geos.length === 1 ? s.geos : [], spatial_view: s.view }),
  });
}

/** The key a sector breakdown groups by: `sector_id` nationally, `module` at province or district grain (the release carries `sector_id` at national grain only). */
export function sectorKey(level: Grain): "sector_id" | "module" {
  return level === "national" ? "sector_id" : "module";
}

/** The composition key the two estimates are compared over: the sector's categories, a category's gases, else the sectors. */
function compositionKey(s: ExploreState): string {
  if (s.sector && !s.category && s.level === "national") return "category";
  if (s.sector) return "gas";
  return sectorKey(s.level);
}

export const CATEGORY_GRAIN_REFUSAL: Refusal = {
  error: "grain_unavailable",
  error_class: "GrainUnavailable",
  message: "category filters are national-grain only in this release",
  limitation_id: "grain_unavailable",
  detail: { key: "categories", grain: "adm1", available_at: ["national"] },
};

/** The one contract call of a state; see the module note. */
export function buildQuery(s: ExploreState, ctx: ExploreContext): QueryPlan {
  if (s.category && s.level !== "national") return { kind: "refused", refusal: { ...CATEGORY_GRAIN_REFUSAL, detail: { ...CATEGORY_GRAIN_REFUSAL.detail, grain: s.level } } };
  const scope = scopeOf(s);
  switch (s.by) {
    case "period": {
      const { periods: _periods, ...rest } = scope; // eslint-disable-line @typescript-eslint/no-unused-vars
      return { kind: "timeseries", body: { query: compact(rest), step: "annual" }, groupBy: "period_id", chart: "line" };
    }
    case "sector": {
      const key = sectorKey(s.level);
      return { kind: "emissions", body: compact({ ...scope, group_by: [key], order_by: "value desc" }), groupBy: key, chart: "bars" };
    }
    case "category":
      return { kind: "emissions", body: compact({ ...scope, group_by: ["category"], order_by: "value desc" }), groupBy: "category", chart: "bars" };
    case "gas":
      return { kind: "emissions", body: compact({ ...scope, group_by: ["gas"], order_by: "value desc" }), groupBy: "gas", chart: "stacked" };
    case "month":
      return { kind: "emissions", body: compact({ ...scope, months: ctx.monthsOf(s.period), group_by: ["month"] }), groupBy: "month", chart: "column" };
    case "place": {
      const key = s.level === "adm2" ? "shape_id" : "province";
      const { geography_ids: _ids, ...rest } = scope; // eslint-disable-line @typescript-eslint/no-unused-vars
      return { kind: "emissions", body: compact({ ...rest, group_by: [key], order_by: "value desc" }), groupBy: key, chart: "bars", ...(s.geos.length > 1 ? { filterTo: { key, ids: s.geos } } : {}) };
    }
    case "estimate": {
      const key = compositionKey(s);
      const side = (config: string) => compact({ ...scope, configuration_id: config, group_by: [key], order_by: "value desc" });
      return { kind: "compare", body: { left: side(ctx.reference), right: side(ctx.survey ?? ctx.reference), mode: "absolute" }, groupBy: key, chart: "grouped" };
    }
  }
}

// --- words -----------------------------------------------------------------------------------

/** "Punjab", "Punjab and Sindh", "the provinces", "Lahore", "the districts", "Pakistan". */
export function placeWords(s: ExploreState, dims: GeoDims): string {
  if (s.level === "national") return "Pakistan";
  const names = s.geos.map((g) => (s.level === "adm2" ? districtName(dims, g) : g));
  if (names.length) return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return s.level === "adm2" ? "the districts" : "the provinces";
}

/** "grouped by sector", "by year, 2015–16 to 2023–24", "reference and survey-based estimates side by side". */
export function groupedWords(s: ExploreState, ctx: ExploreContext, labels: Labels): string {
  switch (s.by) {
    case "sector":
      return "grouped by sector";
    case "category":
      return "grouped by IPCC category";
    case "gas":
      return "grouped by gas";
    case "month":
      return "grouped by month";
    case "place":
      return s.level === "adm2" ? "grouped by district" : "grouped by province";
    case "period":
      return `by year, ${periodShort(labels, ctx.periods[0])} to ${periodShort(labels, ctx.periods[ctx.periods.length - 1])}`;
    case "estimate":
      return `${configLabel(labels, ctx.reference).toLowerCase()} and ${configLabel(labels, ctx.survey ?? ctx.reference).toLowerCase()} side by side`;
  }
}

/**
 * "Punjab's 2023–24 allocated reference emissions, agriculture, grouped by IPCC category,
 * using IPCC 2013 warming factors." — every phrase a label of the release.
 */
/** "Pakistan's", "the provinces'". */
export function possessive(place: string): string {
  return /s$/.test(place) ? `${place}'` : `${place}'s`;
}

export function showingWords(s: ExploreState, ctx: ExploreContext, labels: Labels, dims: GeoDims): string {
  const place = placeWords(s, dims);
  const owner = possessive(place);
  const when = s.by === "period" ? "" : `${periodShort(labels, s.period)} `;
  const allocated = s.level === "national" ? "" : "allocated ";
  const estimate = s.by === "estimate" ? "emissions" : estimateNoun(labels, s.config);
  const parts = [`${owner} ${when}${allocated}${estimate}`, s.category ? `${sectorLabel(labels, s.sector).toLowerCase()} · ${s.category.toLowerCase()}` : s.sector ? sectorLabel(labels, s.sector).toLowerCase() : "all sectors"];
  if (s.gas) parts.push(`${labels.gases[s.gas] ?? s.gas} only`);
  parts.push(groupedWords(s, ctx, labels));
  return `${parts.join(", ")}, using ${gwpWords(labels, s.gwp)} warming factors.`;
}

/** The canvas title: "Emissions by sector", "Allocated emissions by province", "Emissions over time", "Two estimates by sector". */
export function canvasTitle(s: ExploreState): string {
  const noun = s.level === "national" ? "Emissions" : "Allocated emissions";
  switch (s.by) {
    case "sector":
      return `${noun} by sector`;
    case "category":
      return `${noun} by IPCC category`;
    case "gas":
      return `${noun} by gas`;
    case "month":
      return `${noun} by month`;
    case "place":
      return `${noun} by ${s.level === "adm2" ? "district" : "province"}`;
    case "period":
      return `${noun} over time`;
    case "estimate":
      return "Two estimates side by side";
  }
}
