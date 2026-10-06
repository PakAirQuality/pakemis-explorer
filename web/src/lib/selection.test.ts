/**
 * One selection, said one way: a view is one metric (greenhouse gases or one air pollutant),
 * a place is read at its own grain, the assistant is told the same selection the page shows, and
 * a link or a saved conversation carries the WHOLE of it.
 *
 * Every case here is a way the review of 2026-10-06 found the page disagreeing with itself.
 */
import { describe, expect, it } from "vitest";
import { RELEASE } from "@/__tests__/fixtures";
import type { ReleaseInfo } from "@/lib/envelope";
import { releaseLabels } from "@/lib/release";
import { airDeckBodies, airMapBody, airScopeBody, stateFromRequest } from "./requests";
import { controlsFor, metricOf, placeOf, sameSelection, selectionPatch, uiStateOf } from "./selection";
import { applyPatch, hrefForState, resolveState, type ExplorerState } from "./urlState";

const D = { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" };
const labels = releaseLabels(RELEASE as unknown as ReleaseInfo);
const base: ExplorerState = resolveState({}, D);
const LAHORE = "60131773B12131197496886";

describe("one metric at a time", () => {
  it("entering a pollutant drops the gas and every setting only the greenhouse view understood", () => {
    const ghg = applyPatch(base, { gas: "CH4", month: "202307", layer: "evidence", scale: "fixed", config: "S_2023_24", gwp: "AR6", view: "origin" });
    const air = applyPatch(ghg, { pol: "PM2.5" }, D);
    expect(air).toMatchObject({ pol: "PM2.5", gas: null, month: null, layer: "magnitude", scale: "relative", config: "REF_2023_24" });
    // the greenhouse basis and view are parked, not destroyed: leaving the pollutant finds them as they were
    const back = applyPatch(air, { gas: null }, D);
    expect(back).toMatchObject({ pol: null, gas: null, gwp: "AR6", view: "origin" });
  });
  it("naming a gas - one, or all of them - is choosing the greenhouse metric", () => {
    const air = applyPatch(base, { pol: "SO2" }, D);
    expect(applyPatch(air, { gas: "CO2" }, D)).toMatchObject({ pol: null, gas: "CO2" });
    expect(applyPatch(air, { gas: null }, D)).toMatchObject({ pol: null, gas: null });
    // both in one patch: the pollutant wins, and the two never stand together
    expect(applyPatch(base, { pol: "SO2", gas: "CH4" }, D)).toMatchObject({ pol: "SO2", gas: null });
    // an unrelated patch leaves the metric alone
    expect(applyPatch(air, { period: "FY2020-21" }, D)).toMatchObject({ pol: "SO2", period: "FY2020-21" });
  });
  it("a pollutant has no grid layer: the grid level returns to provinces", () => {
    const grid = applyPatch(base, { level: "grid" }, D);
    expect(applyPatch(grid, { pol: "NOx" }, D)).toMatchObject({ level: "adm1", pol: "NOx", gas: null, raster: false, cell: null });
    expect(applyPatch(applyPatch(base, { pol: "NOx" }, D), { level: "grid" }, D).level).toBe("adm1");
  });
  it("a URL that carries both is read as the pollutant's view, without the greenhouse-only keys", () => {
    const s = resolveState({ pol: "PM2.5", gas: "CH4", month: "202307", layer: "evidence", scale: "fixed", level: "grid" }, D);
    expect(s).toMatchObject({ pol: "PM2.5", gas: null, month: null, layer: "magnitude", scale: "relative", level: "adm1" });
  });
  it("the metric and its controls: a pollutant has no warming potential, month, accounting view, evidence layers, fixed scale or grid", () => {
    expect(metricOf(base, labels)).toEqual({ family: "ghg", gas: null, label: "CO₂e" });
    expect(metricOf({ gas: null, pol: "PM2.5" }, labels)).toEqual({ family: "air", pollutant: "PM2.5", label: "PM₂.₅" });
    expect(Object.values(controlsFor(metricOf({ gas: null, pol: "SO2" }, labels))).every((v) => v === false)).toBe(true);
    expect(Object.values(controlsFor(metricOf(base, labels))).every((v) => v === true)).toBe(true);
  });
});

describe("the place is read at its own grain", () => {
  it("a province stays a province while the map shows its districts", () => {
    expect(placeOf({ geo: "Punjab" })).toEqual({ kind: "province", id: "Punjab" });
    expect(placeOf({ geo: LAHORE })).toEqual({ kind: "district", id: LAHORE });
    expect(placeOf({ geo: null })).toEqual({ kind: "national" });
    const drilled = { ...base, level: "adm2" as const, geo: "Punjab", pol: "PM2.5" };
    expect(airScopeBody(drilled)).toEqual({ pollutants: ["PM2.5"], periods: ["FY2023-24"], geography_level: "adm1", geography_ids: ["Punjab"] });
  });
});

describe("every air request names its fiscal period", () => {
  it("the deck's bodies: total, sources, places and series are the panel's; only agriculture's calendar history names years", () => {
    const s = { pol: "PM2.5", period: "FY2020-21", sector: null, geo: LAHORE };
    const b = airDeckBodies(s, ["FY2020-21", "FY2023-24"])!;
    expect(b.total).toEqual({ pollutants: ["PM2.5"], periods: ["FY2020-21"], geography_level: "adm2", geography_ids: [LAHORE] });
    expect(b.sources).toEqual({ ...b.total, group_by: ["sector_id"], order_by: "value desc" });
    expect(b.series).toMatchObject({ periods: ["FY2020-21", "FY2023-24"], geography_ids: [LAHORE], group_by: ["period_id"] });
    for (const body of [b.total, b.sources, b.places, b.series]) expect(body.periods?.length).toBeGreaterThan(0);
    expect(b.trend).not.toHaveProperty("periods");
    expect(b.trend.years?.length).toBe(35);
    expect(airDeckBodies({ pol: null, period: "FY2023-24", sector: null, geo: null }, [])).toBeNull();
  });
  it("the map asks the same product, with the sector the cards filter on", () => {
    expect(airMapBody({ level: "adm2", pol: "SO2", period: "FY2023-24", sector: "industry" })).toEqual({ pollutants: ["SO2"], periods: ["FY2023-24"], sectors: ["industry"], geography_level: "adm2", group_by: ["shape_id"] });
    expect(airMapBody({ level: "adm1", pol: null, period: "FY2023-24", sector: null })).toBeNull();
  });
});

describe("the assistant is told the selection the page shows", () => {
  it("a pollutant view names the pollutant, its unit and its coverage - and no greenhouse defaults", () => {
    const ui = uiStateOf(applyPatch(base, { pol: "PM2.5", geo: LAHORE, level: "adm2" }, D));
    expect(ui).toMatchObject({ pol: "PM2.5", metric: "air_pollutant", unit: "kt", period: "FY2023-24", geo: LAHORE, place_level: "adm2" });
    expect(String(ui.coverage)).toContain("grid power is a screening scenario outside the total");
    expect(ui).not.toHaveProperty("gwp");
    expect(ui).not.toHaveProperty("view");
    expect(ui).not.toHaveProperty("gas");
  });
  it("a greenhouse view is unchanged but for saying which family it is", () => {
    expect(uiStateOf(base)).toEqual({ level: "adm1", period: "FY2023-24", config: "REF_2023_24", gwp: "AR5", view: "all", metric: "greenhouse_gases" });
    expect(uiStateOf({ ...base, level: "adm2", geo: "Punjab" })).toMatchObject({ geo: "Punjab", place_level: "adm1" });
  });
});

describe("a saved or linked selection is the whole selection", () => {
  it("a conversation about a pollutant is not a greenhouse conversation", () => {
    const air = uiStateOf(applyPatch(base, { pol: "PM2.5" }, D));
    expect(sameSelection(air, uiStateOf(base), D)).toBe(false);
    expect(sameSelection(air, uiStateOf(applyPatch(base, { pol: "PM2.5" }, D)), D)).toBe(true);
    // a conversation saved before the derived keys existed still matches the view it was asked under
    expect(sameSelection({ level: "adm1", period: "FY2023-24", config: "REF_2023_24", gwp: "AR5", view: "all" }, uiStateOf(base), D)).toBe(true);
  });
  it("restoring one sets what it had and CLEARS what it did not", () => {
    const now = applyPatch(base, { sector: "transport", geo: "Sindh", gas: "CH4" }, D);
    const savedAir = uiStateOf(applyPatch(base, { pol: "SO2" }, D));
    expect(applyPatch(now, selectionPatch(savedAir, D), D)).toMatchObject({ pol: "SO2", gas: null, sector: null, geo: null });
    const savedGhg = uiStateOf(applyPatch(base, { sector: "power" }, D));
    const fromAir = applyPatch(base, { pol: "PM2.5", geo: LAHORE, level: "adm2" }, D);
    expect(applyPatch(fromAir, selectionPatch(savedGhg, D), D)).toMatchObject({ pol: null, sector: "power", geo: null, level: "adm1" });
  });
  it("a link to the table or chart carries every part of the selection", () => {
    const s = applyPatch(base, { pol: "PM2.5", geo: "Punjab", period: "FY2020-21", sector: "residential" }, D);
    const href = hrefForState(s, D, "/data");
    const q = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("/data?")).toBe(true);
    expect(Object.fromEntries(q)).toMatchObject({ pol: "PM2.5", geo: "Punjab", period: "FY2020-21", sector: "residential" });
    // and reads back as the same selection
    expect(resolveState(Object.fromEntries(q) as never, D)).toMatchObject({ pol: "PM2.5", geo: "Punjab", period: "FY2020-21", sector: "residential", gas: null });
  });
  it("an air request reads back as an air selection, a greenhouse one as greenhouse", () => {
    const air = stateFromRequest({ name: "query_air", body: { pollutants: ["PM2.5"], periods: ["FY2020-21"], geography_level: "adm2", geography_ids: [LAHORE], sectors: ["residential"] } });
    expect(air).toEqual({ pol: "PM2.5", level: "adm2", period: "FY2020-21", sector: "residential", geo: LAHORE });
    expect(stateFromRequest({ name: "QueryAir", body: { pollutants: ["SO2"], periods: ["FY2023-24"] } })).toMatchObject({ pol: "SO2", sector: null, geo: null });
    // applied over whatever is on screen, each lands on its own metric
    const overAir = applyPatch(applyPatch(base, { pol: "SO2" }, D), stateFromRequest({ name: "query_emissions", body: { periods: ["FY2023-24"], gases: ["CH4"] } }), D);
    expect(overAir).toMatchObject({ pol: null, gas: "CH4" });
    expect(applyPatch(applyPatch(base, { gas: "CH4" }, D), air, D)).toMatchObject({ pol: "PM2.5", gas: null });
  });
});
