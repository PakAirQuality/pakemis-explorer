/**
 * The residual ADM1 unit is derived: the row without a polygon, and as its members every ADM1
 * polygon the boundary file draws that no polygon-bearing row claims. No name is typed here
 * beyond the fixture's own dims and boxes.
 */
import { describe, expect, it } from "vitest";
import type { Adm1Row } from "./release";
import { joinNames, residualMembers, residualRow, residualUnit, unionOf } from "./geography";

const adm1: Adm1Row[] = [
  { geography_id: "ADM1:Balochistan", name: "Balochistan", shape_id: "", has_polygon: "yes" },
  { geography_id: "ADM1:Khyber Pakhtunkhwa", name: "Khyber Pakhtunkhwa", shape_id: "", has_polygon: "yes" },
  { geography_id: "ADM1:Other", name: "Other", shape_id: "", has_polygon: "no" },
  { geography_id: "ADM1:Punjab", name: "Punjab", shape_id: "", has_polygon: "yes" },
  { geography_id: "ADM1:Sindh", name: "Sindh", shape_id: "", has_polygon: "yes" },
];
const box: [number, number, number, number] = [0, 0, 1, 1];
const bboxes = { adm1: { "Azad Kashmir": [73, 33, 75, 35] as [number, number, number, number], Balochistan: box, "Gilgit-Baltistan": [72, 34, 77, 37] as [number, number, number, number], "Islamabad Capital Territory": [72.8, 33.5, 73.4, 33.9] as [number, number, number, number], "Khyber Pakhtunkhwa": box, Punjab: box, Sindh: box }, adm2: {} };

describe("geography", () => {
  it("the residual row is the one without a polygon", () => {
    expect(residualRow({ adm1 })?.name).toBe("Other");
    expect(residualRow({ adm1: adm1.filter((r) => r.has_polygon === "yes") })).toBeUndefined();
  });
  it("the members are the drawn polygons no province row claims, in the boundary file's order", () => {
    expect(residualMembers({ adm1 }, bboxes)).toEqual(["Azad Kashmir", "Gilgit-Baltistan", "Islamabad Capital Territory"]);
    expect(residualUnit({ adm1 }, bboxes)).toEqual({ name: "Other", members: ["Azad Kashmir", "Gilgit-Baltistan", "Islamabad Capital Territory"] });
  });
  it("no residual row, no boxes, or nothing left over: no unit", () => {
    expect(residualMembers({ adm1: adm1.filter((r) => r.has_polygon === "yes") }, bboxes)).toEqual([]);
    expect(residualUnit({ adm1 }, undefined)).toBeNull();
    expect(residualUnit({ adm1 }, { adm1: { Punjab: box, Sindh: box } })).toBeNull();
    expect(residualMembers({ adm1 }, { adm1: undefined })).toEqual([]);
  });
  it("names are joined as a sentence and boxes unioned", () => {
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames([])).toBe("");
    expect(unionOf(bboxes.adm1, ["Azad Kashmir", "Gilgit-Baltistan", "Islamabad Capital Territory"])).toEqual([72, 33, 77, 37]);
    expect(unionOf(bboxes.adm1, ["nowhere"])).toBeNull();
    expect(unionOf(undefined, ["Punjab"])).toBeNull();
  });
});
