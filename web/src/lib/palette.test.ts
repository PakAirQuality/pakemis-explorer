/**
 * lib/palette.ts: the PAQI ramp, the rank encoding that replaced the fixed sector hues, and the
 * gas hues. A colour here is a visual encoding only — a rank picks a stop and is never printed.
 */
import { describe, expect, it } from "vitest";
import { ACCENT, GAS_HUES, NO_CELL, RAMP, gasColor, rampByRank, rampColor, rampStops } from "./palette";

/** "rgb(70, 46, 50)" as "#462e32", so a stop and an interpolation compare. */
function hexOf(rgb: string): string {
  const m = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(rgb);
  if (!m) return rgb;
  return `#${[1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, "0")).join("")}`;
}

describe("the PAQI ramp", () => {
  it("is the five warm stops, light to dark", () => {
    expect([...RAMP]).toEqual(["#fff0b3", "#ffb313", "#e87832", "#b4453f", "#462e32"]);
  });
  it("no stop is blue-dominant and the last is the oxblood primary", () => {
    for (const c of RAMP) {
      const n = parseInt(c.slice(1), 16);
      expect((n & 255) <= Math.max((n >> 16) & 255, (n >> 8) & 255), c).toBe(true);
    }
    expect(RAMP[RAMP.length - 1]).toBe(ACCENT);
  });
  it("no data is the warm grey of --color-no-data", () => {
    expect(NO_CELL).toBe("#d7d5d1");
  });
  it("rampColor walks the stops and clamps outside the domain", () => {
    expect(hexOf(rampColor(0, 0, 4))).toBe(RAMP[0]);
    expect(hexOf(rampColor(4, 0, 4))).toBe(RAMP[4]);
    expect(hexOf(rampColor(2, 0, 4))).toBe(RAMP[2]);
    expect(hexOf(rampColor(-10, 0, 4))).toBe(RAMP[0]);
    expect(hexOf(rampColor(99, 0, 4))).toBe(RAMP[4]);
    // a degenerate domain takes the darkest stop
    expect(rampColor(1, 5, 5)).toBe(RAMP[4]);
  });
  it("rampStops interpolates any length: the five stops between one envelope's own min and max", () => {
    expect(rampStops(0, 100)).toEqual([0, "#fff0b3", 25, "#ffb313", 50, "#e87832", 75, "#b4453f", 100, "#462e32"]);
  });
});

describe("rampByRank", () => {
  it("is darkest first: rank 0 takes the oxblood, the last rank the palest stop", () => {
    expect(hexOf(rampByRank(0, 5))).toBe(RAMP[4]);
    expect(hexOf(rampByRank(4, 5))).toBe(RAMP[0]);
  });
  it("walks the whole ramp when the set is exactly its length", () => {
    expect([0, 1, 2, 3, 4].map((i) => hexOf(rampByRank(i, 5)))).toEqual([...RAMP].reverse());
  });
  it("interpolates for any other count, and is monotone from dark to light", () => {
    const luma = (c: string) => {
      const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(c);
      const [r, g, b] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };
    for (const n of [2, 3, 7, 10]) {
      const ls = Array.from({ length: n }, (_, i) => luma(rampByRank(i, n)));
      for (let i = 1; i < n; i++) expect(ls[i], `count ${n}, rank ${i}`).toBeGreaterThan(ls[i - 1]);
    }
  });
  it("a set of one is the darkest stop, and an index outside the set is clamped", () => {
    expect(rampByRank(0, 1)).toBe(RAMP[4]);
    expect(rampByRank(0, 0)).toBe(RAMP[4]);
    expect(hexOf(rampByRank(-3, 5))).toBe(RAMP[4]);
    expect(hexOf(rampByRank(99, 5))).toBe(RAMP[0]);
  });
  it("says nothing about identity: the same rank in two sets of the same size is the same colour", () => {
    expect(rampByRank(1, 4)).toBe(rampByRank(1, 4));
    expect(rampByRank(1, 4)).not.toBe(rampByRank(1, 9));
  });
});

describe("the gas hues", () => {
  it("stay three distinct hues, all of the PAQI family", () => {
    expect(GAS_HUES).toEqual({ CH4: "#462e32", CO2: "#b4453f", N2O: "#ffb313" });
    expect(new Set(Object.values(GAS_HUES)).size).toBe(3);
    for (const c of Object.values(GAS_HUES)) {
      const n = parseInt(c.slice(1), 16);
      expect((n & 255) <= Math.max((n >> 16) & 255, (n >> 8) & 255), c).toBe(true);
    }
  });
  it("an unknown gas falls back to the primary", () => {
    expect(gasColor("ch4")).toBe(GAS_HUES.CH4);
    expect(gasColor("SF6")).toBe(ACCENT);
    expect(gasColor(null)).toBe(ACCENT);
  });
});
