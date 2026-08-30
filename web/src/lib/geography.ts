/**
 * The release's residual ADM1 unit. `dim_geography.adm1` carries one row with `has_polygon:
 * "no"` (the release names it "Other": the territories the district frame draws no province
 * for), while the ADM1 boundary file draws every territory as its own polygon. The members of
 * the residual row are therefore derived, never listed: every ADM1 polygon in bboxes.json whose
 * name is not a `has_polygon: "yes"` row belongs to the residual unit. One envelope cell, several
 * polygons; the map paints the cell on each member and says so.
 */
import type { Adm1Row, Labels } from "./release";
import { geographyName } from "./labels";

export type Adm1Dims = { adm1: Adm1Row[] };
export type Adm1Boxes = { adm1?: Record<string, unknown> } | null | undefined;

/** The ADM1 row without a polygon (the release's residual territories unit), if the release has one. */
export function residualRow(dims: Adm1Dims): Adm1Row | undefined {
  return dims.adm1.find((r) => r.has_polygon === "no");
}

/** The ADM1 polygon names that no `has_polygon: "yes"` row claims: the residual row's members, in the boundary file's order. */
export function residualMembers(dims: Adm1Dims, bboxes: Adm1Boxes): string[] {
  if (!residualRow(dims)) return [];
  const drawn = new Set(dims.adm1.filter((r) => r.has_polygon === "yes").map((r) => r.name));
  const polygons = bboxes && bboxes.adm1 && typeof bboxes.adm1 === "object" ? Object.keys(bboxes.adm1) : [];
  return polygons.filter((name) => !drawn.has(name));
}

/** `name` is the release's own row name (the geography id a query uses); `label` is how it is worded. */
export type Residual = { name: string; label: string; members: string[] };

/** The residual unit as the map consumes it, or null when the release has no such row or the boundary file draws no member. */
export function residualUnit(dims: Adm1Dims, bboxes: Adm1Boxes, labels?: Labels): Residual | null {
  const row = residualRow(dims);
  if (!row) return null;
  const members = residualMembers(dims, bboxes);
  return members.length ? { name: row.name, label: labels ? geographyName(labels, row.name) : row.name, members } : null;
}

/** "A, B and C" from the member names (the sentence is built, not typed). */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The union of the members' boxes, for fitBounds. */
export function unionOf(boxes: Record<string, [number, number, number, number]> | undefined, names: string[]): [number, number, number, number] | null {
  if (!boxes) return null;
  const list = names.map((n) => boxes[n]).filter((b): b is [number, number, number, number] => Array.isArray(b));
  if (!list.length) return null;
  return list.reduce((acc, x) => [Math.min(acc[0], x[0]), Math.min(acc[1], x[1]), Math.max(acc[2], x[2]), Math.max(acc[3], x[3])] as [number, number, number, number]);
}
