/**
 * lib/answers.ts against the shapes the API really echoes. Every `echo` below is the canonical
 * request the live service returned for the body beside it on 2026-10-06 (abridged to the fields
 * that matter): the point of the comparison is that it needs no model of the contract's defaults,
 * and these are the defaults it must not trip over.
 */
import { describe, expect, it } from "vitest";
import { AIR_SINGLE_YEAR_TABLES, mismatch, mismatchRefusal } from "./answers";

type Ctx = { periods?: string[] | null; defaults_applied?: string[] };
const env = (echo: unknown, ctx: Ctx = {}, extra: { table?: string | null; units?: string[] } = {}) => ({
  request: typeof echo === "string" ? echo : JSON.stringify(echo),
  context: { release: "r", version: "v", commit: null, lulucf: { status: "excluded", notation_key: "NE", note: "" }, defaults_applied: ctx.defaults_applied ?? [], periods: ctx.periods },
  calculation: extra.table === null ? {} : { table: extra.table ?? "fact_air_panel" },
  values: (extra.units ?? []).map((unit) => ({ exact: "1", value: 1, display: "1", unit, result_row_ids: [], formula: "SUM" })),
});

const EMISSIONS_DEFAULTS = { basis: "fiscal", categories: [], configuration_id: "REF_2023_24", gases: [], geography_ids: [], geography_level: "national", group_by: [], gwp_basis: "AR5", ipcc_codes: [], limit: 0, months: [], order_by: "", periods: ["FY2023-24"], reporting_sectors: [], sectors: [], spatial_view: "all", streams: [] };
const AIR_DEFAULTS = { categories: [], configuration_id: "", geography_ids: [], geography_level: "national", group_by: [], limit: 0, order_by: "", periods: [], pollutants: [], sectors: [], years: [] };

describe("the answer to what was asked", () => {
  it("an empty body is answered by the contract's defaults, all of them reported as such", () => {
    const echo = { _type: "QueryEmissions", ...EMISSIONS_DEFAULTS, defaults_applied: ["basis", "configuration_id", "geography_level", "gwp_basis", "periods", "spatial_view"] };
    expect(mismatch("/query/emissions", {}, env(echo, { periods: ["FY2023-24"], defaults_applied: echo.defaults_applied }))).toBeNull();
  });
  it("what was sent comes back verbatim with the rest filled in", () => {
    const sent = { configuration_id: "REF_2023_24", gwp_basis: "AR5", periods: ["FY2015-16"], geography_level: "adm1", reporting_sectors: ["power"], group_by: ["province"], order_by: "value desc", limit: 3 };
    expect(mismatch("/query/emissions", sent, env({ _type: "QueryEmissions", ...EMISSIONS_DEFAULTS, ...sent }, { periods: ["FY2015-16"], defaults_applied: ["basis"] }))).toBeNull();
  });
  it("a field left as null or an empty string asked for the default and is not compared", () => {
    const sent = { configuration_id: "", gwp_basis: null, periods: ["FY2023-24"] };
    expect(mismatch("/query/emissions", sent, env({ _type: "QueryEmissions", ...EMISSIONS_DEFAULTS }, { periods: ["FY2023-24"], defaults_applied: ["configuration_id", "gwp_basis"] }))).toBeNull();
  });
  it("a series and a comparison are compared inside their wrapped queries, which the API echoes undefaulted", () => {
    const blank = { ...EMISSIONS_DEFAULTS, basis: "", geography_level: "", periods: [], spatial_view: "", gwp_basis: "" };
    const series = { query: { configuration_id: "REF_2023_24", gwp_basis: "AR5" }, step: "annual" };
    expect(mismatch("/query/timeseries", series, env({ _type: "TimeseriesRequest", query: { ...blank, ...series.query }, step: "annual" }, { periods: ["FY2015-16", "FY2023-24"] }))).toBeNull();
    const compare = { left: { configuration_id: "REF_2023_24" }, right: { configuration_id: "S_2023_24" }, mode: "absolute" };
    const answered = { _type: "CompareRequest", left: { ...blank, configuration_id: "REF_2023_24" }, right: { ...blank, configuration_id: "REF_2023_24" }, mode: "absolute" };
    expect(mismatch("/query/compare", compare, env(answered))).toMatchObject({ path: "right.configuration_id", sent: "S_2023_24", answered: "REF_2023_24" });
  });
  it("a grid cell's filled gas is the contract's business; its coordinates are the reader's", () => {
    const echo = { _type: "GridCellRequest", configuration_id: "", gas: "CO2", lat: 31.5, lon: 74.3, month: "", period_id: "", spatial_view: "" };
    expect(mismatch("/spatial/grid", { lat: 31.5, lon: 74.3 }, env(echo, { periods: ["FY2023-24"] }))).toBeNull();
    expect(mismatch("/spatial/grid", { lat: 31.55, lon: 74.3 }, env(echo))).toMatchObject({ path: "lat", sent: 31.55, answered: 31.5 });
  });
  it("a route that is not a typed query is not checked", () => {
    expect(mismatch("/release", {}, env("not json"))).toBeNull();
  });
});

describe("an answer to something else", () => {
  const sent = { pollutants: ["PM2.5"], periods: ["FY2019-20"], geography_level: "adm2", geography_ids: ["PAK.7.17_1"], group_by: ["sector_id"] };
  const echo = { _type: "QueryAir", ...AIR_DEFAULTS, ...sent };
  const ok = { periods: ["FY2019-20"] };

  it("the same request is the answer", () => {
    expect(mismatch("/query/air", sent, env(echo, ok, { table: "fact_air_adm2_year", units: ["kt PM2.5"] }))).toBeNull();
  });
  it.each([
    ["pollutants", { pollutants: ["SO2"] }],
    ["periods", { periods: ["FY2023-24"] }],
    ["geography_ids", { geography_ids: ["PAK.7.18_1"] }],
    ["geography_level", { geography_level: "adm1" }],
    ["group_by", { group_by: ["province"] }],
  ])("a different %s is named as the difference", (path, change) => {
    const m = mismatch("/query/air", sent, env({ ...echo, ...change }, ok));
    expect(m).toMatchObject({ path, sent: (sent as Record<string, unknown>)[path], answered: (change as Record<string, unknown>)[path] });
  });
  it("a list in another order is another request (the canonical form keeps the order sent)", () => {
    const two = { ...sent, group_by: ["sector_id", "pollutant"] };
    expect(mismatch("/query/air", two, env({ ...echo, group_by: ["pollutant", "sector_id"] }, ok))).toMatchObject({ path: "group_by" });
  });
  it("a default where a value was asked for", () => {
    expect(mismatch("/query/air", sent, env(echo, { ...ok, defaults_applied: ["periods"] }))).toMatchObject({ path: "periods", answered: "default" });
  });
  it("the right echo over the wrong years", () => {
    expect(mismatch("/query/air", sent, env(echo, { periods: [] }))).toMatchObject({ path: "context.periods", sent: ["FY2019-20"], answered: [] });
    expect(mismatch("/query/air", sent, env(echo, { periods: null }))).toMatchObject({ path: "context.periods" });
  });
  it.each(AIR_SINGLE_YEAR_TABLES)("an answer read from %s, the layer that counts power's screening bound as a row", (table) => {
    expect(mismatch("/query/air", sent, env(echo, ok, { table }))).toMatchObject({ path: "calculation.table", answered: table });
  });
  it("the trend's own table is not the single-year layer", () => {
    const years = { pollutants: ["SO2"], years: ["2000", "2010"], group_by: ["year"] };
    expect(mismatch("/query/air", years, env({ _type: "QueryAir", ...AIR_DEFAULTS, ...years }, { periods: [], defaults_applied: ["geography_level"] }, { table: "fact_air_timeseries", units: ["kt SO2"] }))).toBeNull();
  });
  it("cells in another pollutant", () => {
    expect(mismatch("/query/air", sent, env(echo, ok, { units: ["kt PM2.5", "kt SO2"] }))).toMatchObject({ path: "values.unit", answered: "kt SO2" });
  });
  it("an echo that cannot be read, is untyped, or is another kind of request", () => {
    expect(mismatch("/query/air", sent, env("{not json", ok))).toMatchObject({ path: "request" });
    expect(mismatch("/query/air", sent, env({}, ok))).toMatchObject({ path: "_type", sent: "QueryAir", answered: null });
    expect(mismatch("/query/air", sent, env({ ...echo, _type: "QueryEmissions" }, ok))).toMatchObject({ path: "_type", answered: "QueryEmissions" });
  });
  it("is worded for a reader and detailed for whoever is debugging", () => {
    const r = mismatchRefusal(mismatch("/query/air", sent, env({ ...echo, periods: ["FY2023-24"] }, ok))!);
    expect(r).toMatchObject({ error: "response_mismatch", error_class: "ResponseMismatch", limitation_id: null, detail: { path: "periods", asked: ["FY2019-20"], answered: ["FY2023-24"] } });
    expect(r.message).toMatch(/not for the selection on screen/);
  });
});
