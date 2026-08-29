/**
 * The choropleth's paint logic against a fake map: feature-state carries {value, display,
 * unit, has_cell, bounded}; polygons without a cell (Gilgit-Baltistan) are marked has_cell
 * false; the fill expression's stops are the envelope's own min and max; the legend's five
 * swatches are the display strings of real cells at ranks 0, n/4, n/2, 3n/4, n-1.
 */
import { describe, expect, it } from "vitest";
import type { Envelope } from "@/lib/envelope";
import { RAMP, NO_CELL } from "@/lib/palette";
import { fillColorExpression, indexCells, paintEnvelope, clearPaint } from "./paint";
import { legendRanks } from "./Legend";
import { envelope } from "@/__tests__/fixtures";

type FS = { source: string; sourceLayer?: string; id?: string | number };

function fakeMap() {
  const states = new Map<string, Record<string, unknown>>();
  const paints = new Map<string, unknown>();
  return {
    states,
    paints,
    setFeatureState(f: FS, s: Record<string, unknown>) {
      states.set(`${f.source}:${f.id}`, { ...(states.get(`${f.source}:${f.id}`) ?? {}), ...s });
    },
    removeFeatureState(f: FS) {
      for (const k of [...states.keys()]) if (k.startsWith(`${f.source}:`)) states.delete(k);
    },
    setPaintProperty(layer: string, prop: string, v: unknown) {
      paints.set(`${layer}.${prop}`, v);
    },
  };
}

const ADM1 = envelope([
  { display: "30.8471", group: { province: "Balochistan" }, value: 30.847144491259 },
  { display: "56.0600", group: { province: "Khyber Pakhtunkhwa" }, value: 56.05995760742 },
  { display: "1.9972", group: { province: "Other" }, value: 1.997204043148 },
  { display: "228.7168", group: { province: "Punjab" }, value: 228.716826597061 },
  { display: "134.7255", group: { province: "Sindh" }, value: 134.725492797539 },
]) as unknown as Envelope;

const ADM2 = envelope([
  { display: "[0.5865, 0.5866]", group: { shape_id: "A" }, value: 0.58649844412, exactness: "bounded_mixed_ch4_origin;exact", exact_high: "0.586608357020000000" },
  { display: "0.0074", group: { shape_id: "B" }, value: 0.00741643403, exactness: "exact" },
  { display: "0.1200", group: { shape_id: "C" }, value: 0.12, exactness: "exact" },
]) as unknown as Envelope;

describe("paint", () => {
  it("indexes by province and marks polygons without a cell", () => {
    const idx = indexCells(ADM1, "adm1");
    expect(idx.min).toBe(1.997204043148);
    expect(idx.max).toBe(228.716826597061);
    expect(idx.unit).toBe("Mt CO2e AR5");
    const map = fakeMap();
    paintEnvelope(map as never, "adm1", idx, ["Punjab", "Sindh", "Balochistan", "Khyber Pakhtunkhwa", "Gilgit-Baltistan", "Azad Kashmir", "Islamabad Capital Territory"]);
    expect(map.states.get("adm1:Punjab")).toEqual({ value: 228.716826597061, display: "228.7168", unit: "Mt CO2e AR5", has_cell: true, bounded: false });
    expect(map.states.get("adm1:Gilgit-Baltistan")).toEqual({ value: null, display: null, unit: null, has_cell: false, bounded: false });
    const expr = map.paints.get("adm1-fill.fill-color") as unknown[];
    expect(expr[0]).toBe("case");
    expect(expr[2]).toBe(NO_CELL);
    const interp = expr[3] as unknown[];
    expect(interp[0]).toBe("interpolate");
    expect(interp[3]).toBe(1.997204043148);
    expect(interp[4]).toBe(RAMP[0]);
    expect(interp[interp.length - 2]).toBe(228.716826597061);
    expect(interp[interp.length - 1]).toBe(RAMP[RAMP.length - 1]);
  });
  it("marks bounded ADM2 cells for the hatch layer", () => {
    const idx = indexCells(ADM2, "adm2");
    expect(idx.anyBounded).toBe(true);
    const map = fakeMap();
    paintEnvelope(map as never, "adm2", idx, ["A", "B", "C", "D"]);
    expect(map.states.get("adm2:A")).toMatchObject({ bounded: true, display: "[0.5865, 0.5866]", has_cell: true });
    expect(map.states.get("adm2:B")).toMatchObject({ bounded: false });
    expect(map.states.get("adm2:D")).toMatchObject({ has_cell: false });
  });
  it("a refusal clears the level to outlines", () => {
    const map = fakeMap();
    paintEnvelope(map as never, "adm1", indexCells(ADM1, "adm1"), ["Punjab"]);
    clearPaint(map as never, "adm1");
    expect(map.states.size).toBe(0);
    expect(map.paints.get("adm1-fill.fill-color")).toBe(NO_CELL);
  });
  it("a constant colour when every value is equal", () => {
    const expr = fillColorExpression(3, 3) as unknown[];
    expect(expr[3]).toBe(RAMP[RAMP.length - 1]);
  });
  it("the legend labels are real cells' displays at ranks 0, n/4, n/2, 3n/4, n-1", () => {
    expect(legendRanks(ADM1.values).map((c) => c.display)).toEqual(["1.9972", "30.8471", "56.0600", "134.7255", "228.7168"]);
    expect(legendRanks(ADM2.values).map((c) => c.display)).toEqual(["0.0074", "0.1200", "[0.5865, 0.5866]"]);
  });
});
