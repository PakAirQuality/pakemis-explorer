/** Shared test fixtures: a /release summary and an envelope factory. Displays are arbitrary strings; nothing derives them. */
import { vi } from "vitest";

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
  },
  labels: {
    configurations: { REF_2023_24: { label: "Inventory reference (L)", letter: "L", kind: "reference", display_name: "inventory_reference", queryable: true, axis: "", module: "", note: "" }, S_2023_24: { label: "Observed household demand (S)", letter: "S", kind: "survey", display_name: "observed_household_demand", queryable: true, axis: "", module: "residential", note: "" } },
    periods: {
      "FY2023-24": { label: "July 2023 – June 2024", short: "2023–24", basis_note: "a fiscal year runs from July to June", start: "2023-07-01", end: "2024-06-30", basis: "fiscal", availability: "all_sectors", is_reference: true, note: "" },
      "FY2020-21": { label: "July 2020 – June 2021", short: "2020–21", basis_note: "a fiscal year runs from July to June", start: "2020-07-01", end: "2021-06-30", basis: "fiscal", availability: "all_sectors", is_reference: false, note: "" },
    },
    months: { "202307": "Jul 2023", "202308": "Aug 2023", "202007": "Jul 2020", "202008": "Aug 2020" },
    views: { all: "all three views", physical: "physical: where it is emitted", origin: "origin: where the generating activity originates", accounting: "accounting: where the statistic is booked" },
    limitations: {
      lulucf_excluded: "LULUCF is excluded",
      ar6_adm2_ne: "AR6 CO2e is not carried at ADM2",
      no_polygon_units: "the residual territories row carries mass at ADM1",
      calendar_basis_ne: "a calendar request is refused, never computed",
      adm2_co2e_bounded_power_residential: "their CO2e is a bounded interval, never a midpoint",
      config_S_residential_only: "configuration S substitutes the residential module for the reference year only",
      grid_not_tabular: "the map tiles are visual only",
    },
    gases: { CH4: "CH₄", CO2: "CO₂", N2O: "N₂O" },
    sectors: { agriculture: "Agriculture", power: "Power", residential: "Residential" },
    geographies: { "ADM1:Punjab": "Punjab", "ADM1:Other": "Other" },
  },
  release: {
    release_id: "PakEmis 1.0.0rc42",
    reporting_period: { label: "FY2023-24", start: "2023-07-01", end: "2024-06-30", harmonised: true, note: "every sector reports the same twelve months, so the national total is a single-period inventory" },
    lulucf: { status: "excluded", notation_key: "NE", note: "an exploratory Tier-1 module publishes a provisional sink outside every total" },
    gwp_bases: { reported: "AR5", secondary: "AR6", factors: { AR5: {}, AR6: {} } },
    licences: { code: "MIT", data_and_text: "CC-BY-4.0", odbl_carveouts: ["data/gis/rail/pak_rail_network.geojson"], odbl_note: "OpenStreetMap (c) contributors. A produced work needs attribution only; an extracted geometry or coordinate TABLE stays a database under ODbL.", undetermined: "UNEP MARS plume observations carry no licence declaration in the record." },
  },
  agent: { enabled: false, model: "", reason: "not mounted" },
  digests: { semantic_release_json: "0d612d2e19ec055cf7768f86cb5dffd2b803a0856a22a9e36c0a9af03ef28d4d", release_manifest_json: "630d1122", tables: { fact_annual: "8e14" }, products: {} },
  known_limitations: [],
  query_contract: { functions: ["query_emissions", "compare_emissions", "get_timeseries", "get_grid_cell"], placeholder_rule: "a consumer may print only {{result_cell_n}} values the server inserts" },
  licences: {},
  placeholders: { auth: "none" },
};

export type MockCell = { display: string; display_short?: string; unit_words?: string; group?: Record<string, string>; exactness?: string; exact_high?: string; unit?: string; extra?: Record<string, unknown>; value?: number };

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

export type MockBody = { group_by?: string[]; configuration_id?: string; periods?: string[]; geography_level?: string; geography_ids?: string[]; sectors?: string[]; gases?: string[]; months?: string[]; [k: string]: unknown };
export function mockFetch(route: (url: string, body: MockBody | undefined) => unknown) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    const payload = route(String(url), body as MockBody | undefined);
    return { ok: true, status: 200, statusText: "OK", json: async () => payload } as Response;
  });
}
