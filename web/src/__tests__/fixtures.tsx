/** Shared test fixtures: a /release summary and an envelope factory. Displays are arbitrary strings; nothing derives them. */
import { vi } from "vitest";
import { ROUTE_TYPES } from "@/lib/answers";

export const RELEASE = {
  api_version: "0.1.0",
  version: "1.0.0rc42",
  release_id: "PakEmis 1.0.0rc42",
  commit: "bc1716d6",
  defaults: { basis: "fiscal", configuration_id: "REF_2023_24", gwp_basis: "AR5", period_id: "FY2023-24", spatial_view: "all", geography_id: "PK" },
  context_bar: {
    release: "PakEmis 1.0.0rc42",
    basis: "fiscal",
    configuration_id: "REF_2023_24",
    gwp_basis: "AR5",
    geography_id: "PK",
    reporting_period: { label: "FY2023-24", start: "2023-07-01", end: "2024-06-30" },
    lulucf: { status: "excluded", notation_key: "NE", note: "" },
    basis_label: "July–June years",
    configuration_label: "Reference estimate",
    gwp_label: "IPCC 2013 (AR5)",
  },
  dims: {
    dim_period: { values: [{ period_id: "FY2020-21", basis: "fiscal", is_reference: "False", availability: "all_sectors" }, { period_id: "FY2023-24", basis: "fiscal", is_reference: "True", availability: "all_sectors" }] },
    dim_month: { values: [], by_period: { "FY2023-24": ["202307", "202308"], "FY2020-21": ["202007", "202008"] } },
    dim_gas: { values: ["CH4", "CO2", "N2O"] },
    dim_configuration: { queryable: [{ configuration_id: "REF_2023_24", available_periods: "all" }, { configuration_id: "S_2023_24", available_periods: "FY2023-24" }] },
    dim_geography: {
      adm1: [
        { geography_id: "ADM1:Balochistan", name: "Balochistan", shape_id: "", has_polygon: "yes" },
        { geography_id: "ADM1:Khyber Pakhtunkhwa", name: "Khyber Pakhtunkhwa", shape_id: "", has_polygon: "yes" },
        { geography_id: "ADM1:Other", name: "Other", shape_id: "", has_polygon: "no" },
        { geography_id: "ADM1:Punjab", name: "Punjab", shape_id: "", has_polygon: "yes" },
        { geography_id: "ADM1:Sindh", name: "Sindh", shape_id: "", has_polygon: "yes" },
      ],
      adm2: [
        { geography_id: "ADM2:pb_lahore", name: "Lahore District", shape_id: "60131773B12131197496886", shape_name: "Lahore", parent_id: "ADM1:Punjab", has_polygon: "yes", status: "active", unit_kind: "census_district" },
        { geography_id: "ADM2:pb_lahore_city", name: "Lahore City", shape_id: "60131773B12131197496886", shape_name: "Lahore", parent_id: "ADM1:Punjab", has_polygon: "yes", status: "superseded", unit_kind: "legacy_aggregate" },
      ],
    },
    sectors: ["agriculture", "power", "residential"],
    reporting_sectors: ["agriculture", "power", "residential"],
  },
  labels: {
    configurations: {
      REF_2023_24: { label: "Reference estimate", letter: "L", kind: "reference", display_name: "inventory_reference", queryable: true, axis: "", module: "", note: "every axis at its reference setting; residential dung on the ledger basis (L)", tooltip: "every axis at its reference setting; residential dung on the ledger basis (L)" },
      S_2023_24: { label: "Survey-based estimate", letter: "S", kind: "survey", display_name: "observed_household_demand", queryable: true, axis: "", module: "residential", note: "the residential module re-run on observed household demand", tooltip: "the residential module re-run on observed household demand" },
    },
    gwp: {
      AR5: { label: "IPCC 2013 (AR5)", short: "AR5", compact: "IPCC AR5", tooltip: "CO₂-equivalent using the IPCC Fifth Assessment Report's 100-year warming potentials (CH₄ × 28, fossil CH₄ × 30, N₂O × 265)", is_default: true },
      AR6: { label: "IPCC 2021 (AR6)", short: "AR6", compact: "IPCC AR6", tooltip: "CO₂-equivalent using the IPCC Sixth Assessment Report's 100-year warming potentials (CH₄ × 27, fossil CH₄ × 29.8, N₂O × 273)", is_default: false },
    },
    lulucf: { short: "excludes land use and forestry", compact: "land use excluded", status: "excluded", notation_key: "NE", tooltip: "an exploratory Tier-1 module publishes a provisional sink outside every total" },
    periods: {
      "FY2023-24": { label: "July 2023 – June 2024", short: "2023–24", basis_note: "a fiscal year runs from July to June", start: "2023-07-01", end: "2024-06-30", basis: "fiscal", availability: "all_sectors", is_reference: true, note: "" },
      "FY2020-21": { label: "July 2020 – June 2021", short: "2020–21", basis_note: "a fiscal year runs from July to June", start: "2020-07-01", end: "2021-06-30", basis: "fiscal", availability: "all_sectors", is_reference: false, note: "" },
    },
    months: { "202307": "Jul 2023", "202308": "Aug 2023", "202007": "Jul 2020", "202008": "Aug 2020" },
    views: { all: "all three views", physical: "physical: where it is emitted", origin: "origin: where the generating activity originates", accounting: "accounting: where the statistic is booked" },
    limitations: {
      lulucf_excluded: "LULUCF is excluded",
      // CARRIED SO THE GUARD IS NOT VACUOUS. The release publishes this and the API serves it; no
      // Explorer surface may render it (see SectorRoute). A fixture without it would let the guard
      // pass by accident.
      industry_reported_fuel_series: "REPORTED-FUEL: the industry series is under reconciliation",
      ar6_adm2_ne: "AR6 CO2e is not carried at ADM2",
      no_polygon_units: "the residual territories row carries mass at ADM1",
      calendar_basis_ne: "a calendar request is refused, never computed",
      adm2_co2e_bounded_power_residential: "their CO2e is a bounded interval, never a midpoint",
      config_S_residential_only: "configuration S substitutes the residential module for the reference year only",
      grid_not_tabular: "the map tiles are visual only",
    },
    gases: { CH4: "CH₄", CO2: "CO₂", N2O: "N₂O" },
    sectors: { agriculture: "Agriculture", power: "Power", residential: "Residential", industry: "Industrial fuel use — covered sources" },
    sectors_short: { industry: "Industrial fuel use" },
    economic_sectors: { industrial: "Industrial (covered direct sources)" },
    economic_sectors_short: { industrial: "Industrial" },
    reporting_sectors: { agriculture: "Agriculture", power: "Power (grid generation)", residential: "Residential", transport: "Transport", waste: "Waste", industry: "Industrial fuel use incl. captive generation — covered sources" },
    reporting_sectors_short: { industry: "Industrial fuel use", power: "Power" },
    reporting_sector_modules: { industry: ["industry", "power"], power: ["power"] },
    geographies: { "ADM1:Punjab": "Punjab", "ADM1:Other": "ICT, AJK & Gilgit-Baltistan (combined)" },
  },
  release: {
    release_id: "PakEmis 1.0.0rc42",
    reporting_period: { label: "FY2023-24", start: "2023-07-01", end: "2024-06-30", harmonised: true, note: "every sector reports the same twelve months, so the national total is a single-period inventory" },
    lulucf: { status: "excluded", notation_key: "NE", note: "an exploratory Tier-1 module publishes a provisional sink outside every total" },
    gwp_bases: { reported: "AR5", secondary: "AR6", factors: { AR5: {}, AR6: {} } },
    licences: { code: "MIT", data_and_text: "CC-BY-4.0", odbl_carveouts: ["data/gis/rail/pak_rail_network.geojson"], odbl_note: "OpenStreetMap (c) contributors. A produced work needs attribution only; an extracted geometry or coordinate TABLE stays a database under ODbL.", undetermined: "UNEP MARS plume observations carry no licence declaration in the record." },
  },
  agent: { enabled: false, model: "", reason: "not mounted", library: "", usable: false },
  doi: { data: "", documentation: "", software: "" },
  identity_line: "PakEmis · public-data reconstruction of Pakistan's emissions, excluding land use and forestry · 2020–21 to 2023–24",
  citation: {
    apa: "Ahmad, R. (2026). PakEmis: public-data reconstruction of Pakistan's emissions, excluding land use and forestry, 2020–21 to 2023–24 (Version 1.0.0rc42) [Data set]. https://github.com/example/pakemis (commit bc1716d6df79)",
    bibtex: "@dataset{ahmad2026pakemis,\n  author  = {Ahmad, R.},\n  title   = {PakEmis: public-data reconstruction of Pakistan's emissions, excluding land use and forestry, 2020--21 to 2023--24},\n  year    = {2026},\n  version = {1.0.0rc42},\n  url     = {https://github.com/example/pakemis},\n  note    = {commit bc1716d6df79; DOI to be inserted at release freeze}\n}",
    doi: "",
    doi_note: "DOI to be inserted at release freeze",
    cite_as: "PakEmis 1.0.0rc42",
    version: "1.0.0rc42",
    repository: "https://github.com/example/pakemis",
    commit: "bc1716d6df797d3232daf95122197eaee25fa8bd",
    period_span: "2020–21 to 2023–24",
  },
  digests: { semantic_release_json: "0d612d2e19ec055cf7768f86cb5dffd2b803a0856a22a9e36c0a9af03ef28d4d", release_manifest_json: "630d1122", tables: { fact_annual: "8e14" }, products: {} },
  known_limitations: [],
  query_contract: { functions: ["query_emissions", "compare_emissions", "get_timeseries", "get_grid_cell"], placeholder_rule: "a consumer may print only {{result_cell_n}} values the server inserts" },
  licences: {},
  placeholders: { auth: "none" },
};

export type MockCell = { display: string; display_short?: string; unit_words?: string; unit_short?: string; group?: Record<string, string>; exactness?: string; exact_high?: string; unit?: string; extra?: Record<string, unknown>; value?: number };

let counter = 0;
export function envelope(cells: MockCell[], overrides: Record<string, unknown> = {}) {
  counter += 1;
  const receipt = (counter.toString(16).padStart(32, "0")).slice(0, 32);
  return {
    request_type: "query_emissions",
    request: "{}",
    context: { release: "PakEmis 1.0.0rc42", version: "1.0.0rc42", commit: "bc1716d6", basis: "fiscal", configuration_id: "REF_2023_24", gwp_basis: "AR5", lulucf: { status: "excluded", notation_key: "NE", note: "" }, defaults_applied: [] },
    values: cells.map((c, i) => ({
      exact: c.display.replace(/[\[\],]/g, "") + "000",
      value: c.value ?? (Number.parseFloat(c.display.replace(/^\[/, "")) || 0),
      display: c.display,
      unit: c.unit ?? "Mt CO2e AR5",
      result_row_ids: [`r${i}`],
      formula: "SUM",
      group: c.group ?? {},
      ...(c.display_short ? { display_short: c.display_short } : {}),
      ...(c.unit_words ? { unit_words: c.unit_words } : {}),
      ...(c.unit_short ? { unit_short: c.unit_short } : {}),
      ...(c.exactness ? { exactness: c.exactness } : {}),
      ...(c.exact_high ? { exact_high: c.exact_high } : {}),
      ...(c.extra ?? {}),
    })),
    calculation: { kind: "sum", sql: "SELECT 1" },
    provenance: { tables: [{ table: "fact_annual", path: "outputs/semantic/fact_annual.csv", sha256: "8e14" }] },
    uncertainty: {},
    evidence: {},
    unallocated: {},
    completeness: [],
    limitations_hit: [{ id: "lulucf_excluded", message: "LULUCF is excluded" }],
    citation: `Ahmad, R. (2026). PakEmis 1.0.0rc42; query receipt ${receipt}`,
    result_sha256: "abc",
    receipt,
    ...overrides,
  };
}

export type MockBody = { group_by?: string[]; configuration_id?: string; periods?: string[]; geography_level?: string; geography_ids?: string[]; sectors?: string[]; reporting_sectors?: string[]; gases?: string[]; months?: string[]; [k: string]: unknown };
/** A typed refusal the mocked API answers with a 422 (`mockFetch` reads the marker). */
export function refusal(error: string, error_class: string, message: string, limitation_id: string | null = null) {
  return { __status: 422, body: { error, error_class, message, limitation_id, detail: {} } };
}
/**
 * What the real API does that a canned envelope does not: say which request it answers. The client
 * shows a response only when its `request` echoes the body posted and its `context.periods` are the
 * periods asked for (lib/answers.ts), so a fixture built with `envelope()` - whose request is "{}" -
 * is stamped here with the body it is being returned for. A payload that sets its own `request` is
 * left exactly as written: that is how a test hands back the WRONG answer on purpose.
 */
export function echoing(url: string, body: Record<string, unknown> | undefined, payload: unknown): unknown {
  const type = Object.entries(ROUTE_TYPES).find(([route]) => url.endsWith(route))?.[1];
  if (!type || !body || !payload || typeof payload !== "object") return payload;
  const p = payload as { request?: unknown; context?: Record<string, unknown> };
  if (p.request !== "{}" || !p.context) return payload;
  const context = Array.isArray(body.periods) && p.context.periods === undefined ? { ...p.context, periods: body.periods } : p.context;
  return { ...p, request: JSON.stringify({ _type: type, ...body }), context };
}

export function mockFetch(route: (url: string, body: MockBody | undefined) => unknown) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    const payload = echoing(String(url), body, route(String(url), body as MockBody | undefined));
    if (payload && typeof payload === "object" && "__status" in payload) {
      const p = payload as { __status: number; body: unknown };
      return { ok: false, status: p.__status, statusText: "Unprocessable Entity", json: async () => p.body } as Response;
    }
    return { ok: true, status: 200, statusText: "OK", json: async () => payload } as Response;
  });
}

/**
 * jsdom answers every media query `false`, which would put the workspace into its narrow layout;
 * this stubs `matchMedia` for a window `width` px across, so `(min-width: N)` matches when the
 * window is at least N and `(max-width: N)` when it is at most N. `stubWideViewport()` is the
 * desktop frame the workspace tests assert (both panes, no pane switch); `stubNarrowViewport()`
 * is the split-screen window that shows one pane at a time.
 */
export function stubViewport(width: number) {
  vi.stubGlobal("matchMedia", (query: string) => {
    const min = /min-width:\s*(\d+)/.exec(query);
    const max = /max-width:\s*(\d+)/.exec(query);
    return {
      matches: min ? width >= Number(min[1]) : max ? width <= Number(max[1]) : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  });
}

/** A wide window: both panes, no pane switch (the workspace's `(min-width: 1280px)` matches). */
export function stubWideViewport() {
  stubViewport(1600);
}

/** A split-screen window under 1280 px: one pane at a time, the switch in the nav capsule. */
export function stubNarrowViewport() {
  stubViewport(1100);
}
