/**
 * URL state round trips: the request bodies are pure functions of the state and
 * `stateFromRequest` recovers every field a request carries, contradicting nothing.
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { withNuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { applyPatch, hrefForState, rawFromState, resolveState, useExplorerState, type ExplorerState, type StateDefaults } from "./urlState";
import { adm1Body, adm2Body, detailBodies, gridCellBody, requestFromState, stateFromEnvelopeRequest, stateFromRequest } from "./requests";

const D: StateDefaults = { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" };

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, pol: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, tab: "summary", layer: "magnitude", scale: "relative", pane: "map", c: null, cam: null, raster: false, view3d: false };

const CASES: ExplorerState[] = [
  base,
  { ...base, level: "adm2", sector: "power", geo: "60131773B12131197496886" },
  { ...base, level: "adm2", gwp: "AR6" },
  { ...base, period: "FY2020-21", month: "202007", gas: "CH4", pol: null, config: "S_2023_24", view: "physical", geo: "Punjab" },
  { ...base, level: "grid", gas: "CH4", month: "202401", cell: "24.925,67.075", raster: true },
  { ...base, level: "grid", gas: "N2O", raster: true },
];

describe("stateFromRequest(requestFromState(s))", () => {
  for (const s of CASES) {
    it(`recovers ${JSON.stringify(s)}`, () => {
      const req = requestFromState(s);
      const back = stateFromRequest(req);
      expect({ ...s, ...back }).toEqual(s);
      // and a second pass is stable
      expect(requestFromState({ ...s, ...back })).toEqual(req);
    });
  }
  it("recovers the level, geography and filters from an envelope's canonical request", () => {
    const request = JSON.stringify({ _type: "QueryEmissions", periods: ["FY2023-24"], configuration_id: "S_2023_24", gwp_basis: "AR5", geography_level: "adm2", geography_ids: ["60131773B12131197496886"], sectors: ["power"], gases: [], months: [], spatial_view: "origin", group_by: ["module"] });
    expect(stateFromEnvelopeRequest(request)).toMatchObject({ level: "adm2", geo: "60131773B12131197496886", sector: "power", gas: null, month: null, config: "S_2023_24", view: "origin" });
    const grid = JSON.stringify({ _type: "GridCellRequest", configuration_id: "REF_2023_24", gas: "CH4", lat: 24.925, lon: 67.075, month: "annual" });
    expect(stateFromEnvelopeRequest(grid)).toEqual({ level: "grid", gas: "CH4", month: null, config: "REF_2023_24", cell: "24.925,67.075" });
    const lineage = JSON.stringify({ _type: "SpatialLineageRequest", configuration_id: "", gas: "", month: "202307", province: "Punjab", shape_id: "" });
    expect(stateFromEnvelopeRequest(lineage)).toEqual({ level: "adm1", geo: "Punjab", month: "202307" });
  });
});

describe("request bodies", () => {
  it("omit unset filters and carry the state's words", () => {
    expect(adm1Body(base)).toEqual({ periods: ["FY2023-24"], configuration_id: "REF_2023_24", gwp_basis: "AR5", geography_level: "adm1", spatial_view: "all", group_by: ["province"] });
    expect(adm2Body({ ...base, level: "adm2", sector: "power", gas: "CH4", month: "202307" })).toMatchObject({ geography_level: "adm2", sectors: ["power"], gases: ["CH4"], months: ["202307"], group_by: ["shape_id"] });
    expect(gridCellBody({ ...base, level: "grid", gas: "CH4", cell: "24.925,67.075" })).toEqual({ lat: 24.925, lon: 67.075, gas: "CH4", month: "annual", configuration_id: "REF_2023_24" });
  });
  it("detail bodies scope to the geography and lineage takes one month for a province", () => {
    const months = ["202307", "202308"];
    const d = detailBodies({ ...base, geo: "Punjab" }, months);
    expect(d.kind).toBe("province");
    if (d.kind !== "province") return;
    expect(d.total).toMatchObject({ geography_level: "adm1", geography_ids: ["Punjab"] });
    expect(d.byModule.group_by).toEqual(["module"]);
    expect(d.byMonth.months).toEqual(months);
    expect(d.lineage).toEqual({ id: "Punjab", params: { month: "202307", configuration_id: "REF_2023_24" } });
    const e = detailBodies({ ...base, level: "adm2", geo: "60131773B12131197496886" }, months);
    expect(e.kind).toBe("district");
    if (e.kind === "district") expect(e.lineage.params).toEqual({ configuration_id: "REF_2023_24" });
    expect(detailBodies({ ...base, level: "grid", cell: "1,2", gas: "CO2" }, months).kind).toBe("cell");
    expect(detailBodies(base, months).kind).toBe("none");
  });
});

describe("resolve / raw / patch", () => {
  it("defaults are absent from the URL and restored on read", () => {
    expect(resolveState({}, D)).toEqual({ ...base });
    expect(rawFromState(base, D)).toEqual({ level: null, period: null, month: null, sector: null, gas: null, pol: null, config: null, gwp: null, view: null, geo: null, cell: null, tab: null, layer: null, scale: null, pane: null, c: null, cam: null, raster: null, view3d: null });
    const grid = resolveState({ level: "grid" }, D);
    expect(grid.gas).toBe("CO2");
    expect(grid.raster).toBe(true);
    expect(rawFromState(grid, D).gas).toBeNull();
    expect(rawFromState(grid, D).raster).toBeNull();
  });
  it("the map's `layer` and the drawer's `tab` round-trip: absent at magnitude / summary, written otherwise, kept by hrefForState, and retired keys are ignored", () => {
    expect(resolveState({}, D)).toMatchObject({ layer: "magnitude", tab: "summary" });
    expect(resolveState({ layer: "evidence", tab: "sources" }, D)).toMatchObject({ layer: "evidence", tab: "sources" });
    const s = { ...base, level: "adm2" as const, layer: "exceptions" as const, tab: "evidence" as const, geo: "60131773B12131197496886" };
    expect(rawFromState(s, D)).toMatchObject({ layer: "exceptions", tab: "evidence" });
    expect(hrefForState(s, D)).toBe("/?level=adm2&geo=60131773B12131197496886&tab=evidence&layer=exceptions"); // the workspace is the default path
    expect(hrefForState(s, D, "/data")).toBe("/data?level=adm2&geo=60131773B12131197496886&tab=evidence&layer=exceptions");
    expect(resolveState(rawFromState(s, D), D)).toEqual(s);
    // a level change keeps the layer and the tab (the selection is dropped, as before)
    expect(applyPatch(s, { level: "adm1" })).toMatchObject({ level: "adm1", geo: null, layer: "exceptions", tab: "evidence" });
    expect(Object.keys(rawFromState(base, D))).not.toContain("panel");
    expect(Object.keys(rawFromState(base, D))).not.toContain("ask");
  });
  it("the map's `scale` round-trips: relative by default and absent from the URL, written when Map settings changes it, and kept across a level change", () => {
    expect(resolveState({}, D).scale).toBe("relative");
    expect(rawFromState(base, D).scale).toBeNull();
    for (const mode of ["fixed", "absolute"] as const) {
      const s = { ...base, scale: mode };
      expect(resolveState({ scale: mode }, D).scale).toBe(mode);
      expect(rawFromState(s, D).scale).toBe(mode);
      expect(resolveState(rawFromState(s, D), D)).toEqual(s);
      expect(hrefForState(s, D)).toBe(`/?scale=${mode}`);
      expect(applyPatch(s, { level: "adm2" }).scale).toBe(mode);
    }
    // an unknown mode is not a mode: the parser drops it and the default stands
    expect(resolveState({ scale: null }, D).scale).toBe("relative");
  });
  it("the narrow window's `pane` round-trips: the map by default and absent from the URL, written when the switch chooses the dashboard, and kept across a level change", () => {
    expect(resolveState({}, D).pane).toBe("map");
    expect(rawFromState(base, D).pane).toBeNull();
    expect(hrefForState(base, D)).toBe("/");
    const s = { ...base, pane: "dashboard" as const };
    expect(resolveState({ pane: "dashboard" }, D).pane).toBe("dashboard");
    expect(rawFromState(s, D).pane).toBe("dashboard");
    expect(resolveState(rawFromState(s, D), D)).toEqual(s);
    expect(hrefForState(s, D)).toBe("/?pane=dashboard");
    expect(applyPatch(s, { level: "adm2" }).pane).toBe("dashboard");
    // an unknown pane is not a pane: the parser drops it and the map stands
    expect(resolveState({ pane: null }, D).pane).toBe("map");
  });
  it("view3d is a flag: absent when off, `1` when on, and survives a level change", () => {
    expect(resolveState({ view3d: true }, D).view3d).toBe(true);
    expect(rawFromState({ ...base, view3d: true }, D).view3d).toBe(true);
    expect(rawFromState(base, D).view3d).toBeNull();
    expect(applyPatch({ ...base, view3d: true }, { level: "adm2" }).view3d).toBe(true);
  });
  it("a level change drops the selection; a period change drops the month", () => {
    const s = { ...base, geo: "Punjab", month: "202307" };
    expect(applyPatch(s, { level: "adm2" })).toMatchObject({ level: "adm2", geo: null, cell: null, month: "202307" });
    expect(applyPatch(s, { period: "FY2020-21" })).toMatchObject({ period: "FY2020-21", month: null, geo: "Punjab" });
    expect(applyPatch({ ...base, level: "grid", gas: "CO2", cell: "1,2", raster: true }, { level: "adm1" })).toMatchObject({ level: "adm1", cell: null, raster: false });
  });
});

describe("useExplorerState with the nuqs testing adapter", () => {
  it("reads the URL and writes only non-default values", async () => {
    const updates: Parameters<OnUrlUpdateFunction>[0][] = [];
    const wrapper = withNuqsTestingAdapter({ searchParams: "?level=adm2&sector=power&geo=60131773B12131197496886", onUrlUpdate: (e) => updates.push(e) });
    const { result } = renderHook(() => useExplorerState(D), { wrapper });
    expect(result.current.state).toMatchObject({ level: "adm2", sector: "power", geo: "60131773B12131197496886", period: "FY2023-24", config: "REF_2023_24" });
    await act(async () => {
      await result.current.setState({ gwp: "AR6", period: "FY2023-24" });
    });
    expect(result.current.state.gwp).toBe("AR6");
    const last = updates[updates.length - 1];
    expect(last.queryString).toContain("gwp=AR6");
    expect(last.queryString).not.toContain("period=");
    expect(last.queryString).not.toContain("config=");
    await act(async () => {
      await result.current.setState({ level: "grid" });
    });
    expect(result.current.state).toMatchObject({ level: "grid", geo: null, gas: "CO2", raster: true });
    expect(updates[updates.length - 1].queryString).not.toContain("gas=");
    await act(async () => {
      await result.current.setState({ view3d: true });
    });
    expect(result.current.state.view3d).toBe(true);
    expect(updates[updates.length - 1].queryString).toContain("view3d=1");
  });
});
