/**
 * The choropleth's paint logic against a fake map: feature-state carries {value, display,
 * unit, has_cell, bounded, hatch, cat, outline}; the residual ADM1 unit's members (Gilgit-Baltistan, Azad Kashmir,
 * Islamabad Capital Territory) carry the "Other" cell verbatim with `shared`, and without the
 * unit are marked has_cell false; a province never gets `shared`; the fill expression's stops
 * are the envelope's own min and max; the legend's five swatches are the display strings of
 * real cells at ranks 0, n/4, n/2, 3n/4, n-1.
 */
import { describe, expect, it } from "vitest";
import type { Envelope } from "@/lib/envelope";
import { RAMP, NO_CELL } from "@/lib/palette";
import { anyWithoutCell, categoricalFillExpression, cellForFeature, exceptionKindOf, exceptionKindsPresent, fillColorExpression, fillExpressionFor, indexCells, indexUnallocated, magnitudeFillExpression, paintEnvelope, paintLayer, clearPaint, RANK_BANDS, rankBand, rankBands, rankFillExpression } from "./paint";
import { SPATIAL_CLASSES, ALLOCATION_STATUSES, categoryOf, statusWords } from "./layerModes";
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
    getLayer(id: string) {
      return { id };
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

const ADM1_IDS = ["Punjab", "Sindh", "Balochistan", "Khyber Pakhtunkhwa", "Gilgit-Baltistan", "Azad Kashmir", "Islamabad Capital Territory"];
const OTHER = { name: "Other", members: ["Azad Kashmir", "Gilgit-Baltistan", "Islamabad Capital Territory"] };

describe("paint", () => {
  it("paints the residual unit's one cell on each member polygon, verbatim and marked shared", () => {
    const idx = indexCells(ADM1, "adm1");
    const map = fakeMap();
    paintEnvelope(map as never, "adm1", idx, ADM1_IDS, OTHER);
    const other = { value: 1.997204043148, display: "1.9972", unit: "Mt CO2e AR5", has_cell: true, bounded: false, hatch: false, rank: 0, cat: "none", outline: null, shared: true, shared_with: "Other" };
    expect(map.states.get("adm1:Gilgit-Baltistan")).toEqual(other);
    expect(map.states.get("adm1:Azad Kashmir")).toEqual(other);
    expect(map.states.get("adm1:Islamabad Capital Territory")).toEqual(other);
    // provinces never carry `shared`
    for (const p of ["Punjab", "Sindh", "Balochistan", "Khyber Pakhtunkhwa"]) expect(map.states.get(`adm1:${p}`)).not.toHaveProperty("shared");
    expect(map.states.get("adm1:Punjab")).toEqual({ value: 228.716826597061, display: "228.7168", unit: "Mt CO2e AR5", has_cell: true, bounded: false, hatch: false, rank: 4, cat: "none", outline: null });
    expect(cellForFeature(idx, "adm1", "Gilgit-Baltistan", OTHER)).toEqual({ cell: idx.byId.get("Other"), shared: true });
    expect(cellForFeature(idx, "adm1", "Punjab", OTHER)).toEqual({ cell: idx.byId.get("Punjab"), shared: false });
    expect(anyWithoutCell(idx, "adm1", ADM1_IDS, OTHER)).toBe(false);
    expect(anyWithoutCell(idx, "adm1", [...ADM1_IDS, "Nowhere"], OTHER)).toBe(true);
  });
  it("without the residual unit's cell in the envelope the members have no cell", () => {
    const noOther = { ...ADM1, values: ADM1.values.filter((c) => c.group?.province !== "Other") } as Envelope;
    const idx = indexCells(noOther, "adm1");
    const map = fakeMap();
    paintEnvelope(map as never, "adm1", idx, ADM1_IDS, OTHER);
    expect(map.states.get("adm1:Gilgit-Baltistan")).toEqual({ value: null, display: null, unit: null, has_cell: false, bounded: false, hatch: false, rank: null, cat: "none", outline: null });
    expect(anyWithoutCell(idx, "adm1", ADM1_IDS, OTHER)).toBe(true);
  });
  it("indexes by province and marks polygons without a cell", () => {
    const idx = indexCells(ADM1, "adm1");
    expect(idx.min).toBe(1.997204043148);
    expect(idx.max).toBe(228.716826597061);
    expect(idx.unit).toBe("Mt CO2e AR5");
    const map = fakeMap();
    paintEnvelope(map as never, "adm1", idx, ["Punjab", "Sindh", "Balochistan", "Khyber Pakhtunkhwa", "Gilgit-Baltistan", "Azad Kashmir", "Islamabad Capital Territory"]);
    expect(map.states.get("adm1:Punjab")).toEqual({ value: 228.716826597061, display: "228.7168", unit: "Mt CO2e AR5", has_cell: true, bounded: false, hatch: false, rank: 4, cat: "none", outline: null });
    expect(map.states.get("adm1:Gilgit-Baltistan")).toEqual({ value: null, display: null, unit: null, has_cell: false, bounded: false, hatch: false, rank: null, cat: "none", outline: null });
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
    expect(map.states.get("adm2:A")).toMatchObject({ bounded: true, hatch: true, display: "[0.5865, 0.5866]", has_cell: true });
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
  it("the magnitude ramp is the PAQI five, light to dark, in order, and the interpolate expression walks it", () => {
    expect([...RAMP]).toEqual(["#fff0b3", "#ffb313", "#e87832", "#b4453f", "#5e1a2a"]);
    const expr = fillColorExpression(0, 4) as unknown[];
    const interp = expr[3] as unknown[];
    const colours = interp.slice(3).filter((_, i) => i % 2 === 1);
    expect(colours).toEqual([...RAMP]);
    const stops = interp.slice(3).filter((_, i) => i % 2 === 0);
    expect(stops).toEqual([0, 1, 2, 3, 4]);
    // the categorical layers keep their own palettes: none of their classes is a ramp colour
    for (const c of [...SPATIAL_CLASSES, ...ALLOCATION_STATUSES]) expect((RAMP as readonly string[]).includes(c.color), c.id).toBe(false);
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

describe("the three scale modes (URL `scale`, Map settings)", () => {
  const idx = indexCells(ADM1, "adm1");
  it("relative: the ramp matched against feature-state `rank`, no domain and no number anywhere in the expression", () => {
    const expr = rankFillExpression() as unknown[];
    expect(expr[0]).toBe("case");
    expect(expr[2]).toBe(NO_CELL);
    const match = expr[3] as unknown[];
    expect(match[0]).toBe("match");
    expect(match[1]).toEqual(["coalesce", ["feature-state", "rank"], 0]);
    // one band per ramp stop, in order, and the fallback is the palest
    expect(match.slice(2, 2 + RANK_BANDS * 2)).toEqual([0, RAMP[0], 1, RAMP[1], 2, RAMP[2], 3, RAMP[3], 4, RAMP[4]]);
    expect(match[match.length - 1]).toBe(RAMP[0]);
    // no envelope value reaches the expression: the browser ranks, the server's numbers stay in the cards
    expect(JSON.stringify(expr)).not.toContain("228.7");
    expect(JSON.stringify(expr)).not.toContain("interpolate");
  });
  it("the bands are quantile positions: darkest for the largest cell, palest for the smallest, and equal values share a band", () => {
    expect(rankBand(0, 5)).toBe(0);
    expect(rankBand(4, 5)).toBe(4);
    expect(rankBand(0, 1)).toBe(RANK_BANDS - 1);
    expect(rankBand(0, 3)).toBe(0);
    expect(rankBand(2, 3)).toBe(4);
    const bands = rankBands(idx);
    expect(bands.get("Punjab")).toBe(4);
    expect(bands.get("Other")).toBe(0);
    expect(bands.get("Sindh")).toBe(3);
    expect([...bands.values()].every((b) => Number.isInteger(b) && b >= 0 && b < RANK_BANDS)).toBe(true);
    const tied = indexCells(envelope([
      { display: "1.0", group: { province: "A" }, value: 1 },
      { display: "1.0", group: { province: "B" }, value: 1 },
      { display: "9.0", group: { province: "C" }, value: 9 },
    ]) as unknown as Envelope, "adm1");
    const t = rankBands(tied);
    expect(t.get("A")).toBe(t.get("B"));
    expect(t.get("C")).toBeGreaterThan(t.get("A")!);
  });
  it("paintEnvelope writes the band on every polygon and paints the rank match in relative mode", () => {
    const map = fakeMap();
    paintEnvelope(map as never, "adm1", idx, ADM1_IDS, OTHER, { mode: "relative" });
    expect(map.states.get("adm1:Punjab")).toMatchObject({ rank: 4 });
    expect(map.states.get("adm1:Balochistan")).toMatchObject({ rank: 1 });
    // the residual unit's members take its band, as they take its cell
    expect(map.states.get("adm1:Azad Kashmir")).toMatchObject({ rank: 0, shared: true });
    const expr = map.paints.get("adm1-fill.fill-color") as unknown[];
    expect((expr[3] as unknown[])[0]).toBe("match");
  });
  it("fixed: the domain handed in wins over the envelope's own, so a sector or a gas no longer rescales the map", () => {
    const domain = { min: 0, max: 500 };
    const fixed = magnitudeFillExpression(idx, { mode: "fixed", domain }) as unknown[];
    const interp = fixed[3] as unknown[];
    expect(interp[0]).toBe("interpolate");
    expect(interp[3]).toBe(0);
    expect(interp[interp.length - 2]).toBe(500);
    // one sector's envelope is a different envelope; under the same domain it paints the same expression
    const narrow = indexCells(envelope([
      { display: "3.0", group: { province: "Punjab" }, value: 3 },
      { display: "1.0", group: { province: "Sindh" }, value: 1 },
    ]) as unknown as Envelope, "adm1");
    expect(magnitudeFillExpression(narrow, { mode: "fixed", domain })).toEqual(fixed);
    // and differs from the same envelope in absolute mode, which follows its own min and max
    expect(magnitudeFillExpression(narrow, { mode: "absolute" })).not.toEqual(fixed);
    // while the domain is still unknown the envelope's own stands in
    expect(magnitudeFillExpression(idx, { mode: "fixed", domain: null })).toEqual(fillColorExpression(idx.min, idx.max));
  });
  it("absolute: the envelope's own min and max, which is what the legend's break strings describe, and the mode reaches paintLayer", () => {
    expect(magnitudeFillExpression(idx, { mode: "absolute" })).toEqual(fillColorExpression(idx.min, idx.max));
    expect(magnitudeFillExpression(idx)).toEqual(fillColorExpression(idx.min, idx.max));
    expect(fillExpressionFor("magnitude", "adm1", idx, null, { mode: "relative" })).toEqual(rankFillExpression());
    const map = fakeMap();
    paintLayer(map as never, "adm1", { layer: "magnitude", index: idx, ids: ADM1_IDS, residual: OTHER, scale: { mode: "absolute" } });
    expect(((map.paints.get("adm1-fill.fill-color") as unknown[])[3] as unknown[])[0]).toBe("interpolate");
    paintLayer(map as never, "adm1", { layer: "magnitude", index: idx, ids: ADM1_IDS, residual: OTHER, scale: { mode: "relative" } });
    expect(((map.paints.get("adm1-fill.fill-color") as unknown[])[3] as unknown[])[0]).toBe("match");
  });
});

/** The ADM2 envelope as the API decorates it at district grain: spatial_class, allocation_status, placement_class on every cell. */
const ADM2_FIELDS = envelope([
  { display: "[12.2565, 12.2769]", group: { shape_id: "A" }, value: 12.25645493286, exactness: "exact;bounded_mixed_ch4_origin", exact_high: "12.276921009840000000", extra: { allocation_status: "one_to_one", spatial_class: "S3", placement_class: "diffuse_by_nature", allocation_surface: "builtup" } },
  { display: "0.8700", group: { shape_id: "B" }, value: 0.87, exactness: "exact", extra: { allocation_status: "one_to_one;shared_shape", spatial_class: "S1", placement_class: "point_resolved", allocation_surface: "grid_station_points+builtup_fallback" } },
  { display: "0.1200", group: { shape_id: "C" }, value: 0.12, exactness: "exact", extra: { allocation_status: "one_to_one", spatial_class: "S2", placement_class: "point_partial" } },
  { display: "0.0500", group: { shape_id: "E" }, value: 0.05, exactness: "exact" },
]) as unknown as Envelope;
const EX = { sharedShapes: new Set(["B"]), otherShapes: new Set(["C"]), sharedGroups: [], noPolygon: [], otherRows: [] };

describe("the Map page's layers", () => {
  it("categories come from the cells' own fields: spatial_class on the evidence layer, the most exceptional allocation_status on the method layer", () => {
    const [a, b, c, e] = ADM2_FIELDS.values;
    expect(categoryOf("evidence", a)).toBe("S3");
    expect(categoryOf("evidence", e)).toBe("not_served");
    expect(categoryOf("method", b)).toBe("shared_shape");
    expect(categoryOf("method", c)).toBe("one_to_one");
    expect(categoryOf("method", e)).toBe("not_served");
    expect(categoryOf("method", undefined)).toBe("none");
    expect(statusWords("one_to_one;shared_shape")).toBe("one-to-one + shared shape");
    expect(statusWords("diffuse_by_nature")).toBe("diffuse by nature");
  });
  it("the evidence layer paints a match over S1–S4/NA; the magnitude layer an interpolate; the switch changes the paint mode", () => {
    const idx = indexCells(ADM2_FIELDS, "adm2");
    const magnitude = fillExpressionFor("magnitude", "adm2", idx) as unknown[];
    expect((magnitude[3] as unknown[])[0]).toBe("interpolate");
    const evidence = categoricalFillExpression("evidence") as unknown[];
    const match = evidence[3] as unknown[];
    expect(match[0]).toBe("match");
    for (const s of SPATIAL_CLASSES) expect(match).toContain(s.color);
    const method = fillExpressionFor("method", "adm2", idx) as unknown[];
    for (const s of ALLOCATION_STATUSES) expect(method[3] as unknown[]).toContain(s.color);
    expect(fillExpressionFor("magnitude", "adm2", idx)).not.toEqual(fillExpressionFor("evidence", "adm2", idx));
  });
  it("paintLayer writes cat / hatch / outline per polygon on the evidence, method and exceptions layers", () => {
    const idx = indexCells(ADM2_FIELDS, "adm2");
    const ids = ["A", "B", "C", "D", "E"];
    const map = fakeMap();
    paintLayer(map as never, "adm2", { layer: "evidence", index: idx, ids, exceptions: EX });
    expect(map.states.get("adm2:A")).toMatchObject({ cat: "S3", has_cell: true, hatch: false, display: "[12.2565, 12.2769]" });
    expect(map.states.get("adm2:E")).toMatchObject({ cat: "not_served" });
    expect(map.states.get("adm2:D")).toMatchObject({ cat: "none", has_cell: false });
    paintLayer(map as never, "adm2", { layer: "method", index: idx, ids, exceptions: EX });
    expect(map.states.get("adm2:A")).toMatchObject({ cat: "one_to_one", hatch: true }); // diffuse placement is hatched
    expect(map.states.get("adm2:B")).toMatchObject({ cat: "shared_shape", hatch: false });
    expect(typeof (map.states.get("adm2:B") as { outline: unknown }).outline).toBe("string");
    paintLayer(map as never, "adm2", { layer: "exceptions", index: idx, ids, exceptions: EX });
    expect(map.states.get("adm2:A")).toMatchObject({ cat: "none", hatch: true }); // bounded: hatched, plain fill
    expect(map.states.get("adm2:B")).toMatchObject({ cat: "shared_shape" });
    expect(map.states.get("adm2:C")).toMatchObject({ cat: "other_unit" });
    expect(map.states.get("adm2:D")).toMatchObject({ cat: "no_cell", has_cell: false });
    expect(exceptionKindOf("adm2", "A", ADM2_FIELDS.values[0], false, EX)).toBe("bounded");
    expect(Array.from(exceptionKindsPresent("adm2", idx, ids, null, EX)).sort()).toEqual(["bounded", "no_cell", "other_unit", "shared_shape"]);
    // the magnitude layer restores the choropleth
    paintLayer(map as never, "adm2", { layer: "magnitude", index: idx, ids });
    expect((map.paints.get("adm2-fill.fill-color") as unknown[])[3]).toMatchObject({ 0: "interpolate" });
  });
  it("the unallocated layer shades provinces by the server's by_province rows (unallocated_short shown, exact shading) and greys districts", () => {
    const env = envelope([{ display: "228.7168", group: { province: "Punjab" } }], { unallocated: { level: "adm1", by_province: [{ province: "Punjab", exact: "4.837161474822386761", n_rows: 285, unallocated_short: "4.84" }, { province: "Sindh", exact: "3.447244381222043967", n_rows: 285, unallocated_short: "3.45" }, { province: "Other", exact: "0.016309890151288562", n_rows: 285 }] } }) as unknown as Envelope;
    const u = indexUnallocated(env)!;
    expect(u.byProvince.get("Punjab")).toEqual({ exact: "4.837161474822386761", short: "4.84" });
    expect(u.byProvince.get("Other")!.short).toBe("0.016309890151288562"); // no short: the exact string is shown, never a rounding of it
    expect(u.min).toBe(0.016309890151288562);
    expect(u.max).toBe(4.837161474822386761);
    const map = fakeMap();
    paintLayer(map as never, "adm2", { layer: "unallocated", index: null, ids: ["A"], residual: OTHER, unallocated: u, adm1Ids: ADM1_IDS });
    expect(map.paints.get("adm2-fill.fill-color")).toBe(NO_CELL);
    expect(map.states.get("adm1:Punjab")).toMatchObject({ u: 4.837161474822386761, display: "4.84", has_u: true });
    expect(map.states.get("adm1:Gilgit-Baltistan")).toMatchObject({ display: "0.016309890151288562", has_u: true, shared: true, shared_with: "Other" });
    expect(map.states.get("adm1:Balochistan")).toMatchObject({ has_u: false });
    const expr = map.paints.get("adm1-fill.fill-color") as unknown[];
    expect((expr[3] as unknown[])[0]).toBe("interpolate");
    expect(indexUnallocated(envelope([{ display: "1" }]) as unknown as Envelope)).toBeNull();
  });
});
