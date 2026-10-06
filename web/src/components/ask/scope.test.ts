/**
 * An answer's "Show on map" and "Open in Explore" open the ANSWER's scope.
 *
 * Both used to patch the request's own fields over whatever the reader had selected since asking,
 * so a national PM₂.₅ answer shown from a greenhouse view painted CO₂e, a greenhouse answer shown
 * from a pollutant view stayed on the pollutant, and an answer about the whole country stayed on
 * the district on screen. Each looked like the answer and was not.
 */
import { describe, expect, it } from "vitest";
import { stateFromRequest } from "@/lib/requests";
import { applyPatch, hrefForState, resolveState, type ExplorerState } from "@/lib/urlState";
import { MAP_KEYS, mapPatchFromInput, movePatch, movesMap, previousOf, undoPatch } from "./mapMove";

const D = { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" };
const base: ExplorerState = resolveState({}, D);
const LAHORE = "60131773B12131197496886";
const AIR_NATIONAL = { pollutants: ["PM2.5"], periods: ["FY2023-24"], group_by: ["sector_id"] };
const GHG_PUNJAB = { periods: ["FY2020-21"], geography_level: "adm1", geography_ids: ["Punjab"], reporting_sectors: ["agriculture"] };

describe("show on map", () => {
  it("an air answer puts the map on that pollutant, whatever was selected meanwhile", () => {
    const now = applyPatch(base, { gas: "CH4", geo: LAHORE, level: "adm2", sector: "transport", month: "202307" }, D);
    const patch = mapPatchFromInput(AIR_NATIONAL, "query_air");
    expect(patch).toEqual({ geo: null, sector: null, gas: null, pol: "PM2.5", month: null, period: "FY2023-24" });
    expect(applyPatch(now, patch, D)).toMatchObject({ pol: "PM2.5", gas: null, geo: null, sector: null, month: null });
  });
  it("a greenhouse answer leaves a pollutant view, and names its own place and sector", () => {
    const now = applyPatch(base, { pol: "SO2", geo: LAHORE, level: "adm2" }, D);
    const patch = mapPatchFromInput(GHG_PUNJAB, "query_emissions");
    expect(applyPatch(now, patch, D)).toMatchObject({ pol: null, geo: "Punjab", level: "adm1", sector: "agriculture", period: "FY2020-21" });
  });
  it("is offered only when it would change something, and can be undone key for key", () => {
    const patch = mapPatchFromInput(AIR_NATIONAL, "query_air");
    const onIt = applyPatch(base, { pol: "PM2.5" }, D);
    expect(movesMap(onIt, patch)).toBe(false);
    expect(movesMap(base, patch)).toBe(true);
    const from = applyPatch(base, { gas: "CH4", sector: "power" }, D);
    const move = { patch, previous: previousOf(from, patch) };
    expect(applyPatch(applyPatch(from, patch, D), undoPatch(move), D)).toMatchObject({ pol: null, gas: "CH4", sector: "power" });
  });
  it("a tool that only mentions a sector or a place keeps the additive patch it always had", () => {
    expect(mapPatchFromInput({ sectors: ["waste"] }, "get_completeness")).toEqual({ sector: "waste" });
    expect(mapPatchFromInput({ sectors: ["waste"] })).toEqual({ sector: "waste" });
  });
  it("the pollutant is a key the assistant's own map move may carry", () => {
    expect(MAP_KEYS).toContain("pol");
    expect(movePatch({ pol: "SO2", level: "adm2", config: "S_2023_24" })).toEqual({ pol: "SO2", level: "adm2" });
  });
});

describe("open in Explore", () => {
  const href = (name: string, body: Record<string, unknown>) => hrefForState(applyPatch(resolveState({}, D), stateFromRequest({ name, body }), D), D, "/data");
  it("is built from the answer's request on the release's defaults - nothing selected since rides along", () => {
    const air = new URLSearchParams(href("query_air", { ...AIR_NATIONAL, geography_level: "adm2", geography_ids: [LAHORE], periods: ["FY2020-21"] }).split("?")[1]);
    expect(Object.fromEntries(air)).toEqual({ level: "adm2", period: "FY2020-21", pol: "PM2.5", geo: LAHORE });
    const ghg = new URLSearchParams(href("query_emissions", GHG_PUNJAB).split("?")[1]);
    expect(Object.fromEntries(ghg)).toEqual({ period: "FY2020-21", sector: "agriculture", geo: "Punjab" });
    expect(ghg.has("pol")).toBe(false);
  });
});
