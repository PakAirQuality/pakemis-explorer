/**
 * The magnitude legend's sentence is written from what is on the map: the metric, the level and
 * the scale mode. It was one fixed string about "allocated CO₂e", printed over a PM₂.₅ map.
 */
import { describe, expect, it } from "vitest";
import type { Metric } from "@/lib/selection";
import { LAYERS, layerSentence, magnitudeSentence, NOT_OBSERVATION } from "./layerModes";

const CO2E: Metric = { family: "ghg", gas: null, label: "CO₂e" };
const CH4: Metric = { family: "ghg", gas: "CH4", label: "CH₄" };
const PM25: Metric = { family: "air", pollutant: "PM2.5", label: "PM₂.₅" };
const SO2: Metric = { family: "air", pollutant: "SO2", label: "SO₂" };

describe("the magnitude legend's sentence", () => {
  it("names the metric on the map: a pollutant's legend never says CO₂e", () => {
    for (const metric of [PM25, SO2]) {
      for (const level of ["adm1", "adm2"] as const) {
        for (const scale of ["relative", "absolute"] as const) {
          const s = magnitudeSentence(metric, level, scale);
          expect(s).toContain(`estimated ${metric.label} emissions`);
          expect(s).not.toContain("CO₂e");
          expect(s).not.toContain("allocated");
          // an emissions estimate, explicitly not ambient air quality
          expect(s).toContain("not a measure of air quality");
          expect(s).toContain(level === "adm1" ? "province" : "district");
        }
      }
    }
    expect(magnitudeSentence(CO2E, "adm1", "relative")).toContain("each province's allocated CO₂e");
    expect(magnitudeSentence(CH4, "adm2", "relative")).toContain("each district's allocated CH₄");
    expect(magnitudeSentence(CO2E, "adm1", "relative")).toContain(NOT_OBSERVATION);
    expect(magnitudeSentence(CO2E, "adm1", "relative")).not.toContain("air quality");
  });
  it("says how the colours are assigned, which differs by scale mode", () => {
    // relative: a rank among the places on screen - the same colour is not the same amount elsewhere
    const relative = magnitudeSentence(PM25, "adm2", "relative");
    expect(relative).toContain("by its rank among the districts on screen");
    expect(relative).toContain("the same colour in another year or sector is not the same amount");
    // absolute: proportional to the value between the ends on screen
    expect(magnitudeSentence(SO2, "adm1", "absolute")).toContain("in proportion to its value, between the smallest and the largest province on screen");
    // fixed: one scale, the reference year's all-sector range
    expect(magnitudeSentence(CO2E, "adm1", "fixed")).toContain("fixed to the reference year's all-sector range");
    expect(new Set([relative, magnitudeSentence(PM25, "adm2", "absolute")]).size).toBe(2);
  });
  it("the four evidence layers keep their own sentences", () => {
    for (const layer of ["evidence", "method", "unallocated", "exceptions"] as const) expect(layerSentence(layer, CO2E, "adm2", "relative")).toBe(LAYERS[layer].sentence);
    expect(layerSentence("magnitude", PM25, "adm1", "relative")).toBe(magnitudeSentence(PM25, "adm1", "relative"));
  });
});
