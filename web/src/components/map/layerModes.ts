/**
 * The Map page's five layers (URL `layer`), each with its label, the one sentence its legend
 * states ("Colour shows …; this is an inventory allocation, not an observation"), the levels it
 * paints, and the categorical palettes the paint and the legend share. The categories are the
 * server's own field values (spatial_class, allocation_status, placement_class) read off the
 * cells; nothing here derives a number. Hues are used inside the map and its legend only.
 */
import type { Cell } from "@/lib/envelope";
import type { Level, MapLayer } from "@/lib/urlState";
import { NO_CELL, RAMP } from "@/lib/palette";
import { EVIDENCE_CLASS_TEXT } from "@/components/methods/evidenceClassText";

export type LayerDef = { id: MapLayer; label: string; short: string; sentence: string; levels: Level[]; needs?: string };

export const NOT_OBSERVATION = "this is an inventory allocation, not an observation";

export const LAYERS: Record<MapLayer, LayerDef> = {
  magnitude: { id: "magnitude", label: "Emission magnitude", short: "Magnitude", sentence: `Colour shows each province's or district's allocated CO₂e on the release's own scale, darkest at the largest cell; ${NOT_OBSERVATION}.`, levels: ["adm1", "adm2", "grid"] },
  evidence: { id: "evidence", label: "Spatial evidence", short: "Evidence", sentence: `Colour shows the spatial-evidence class (S1 native geometry to S4 population fallback; NA held at province level) of the stream that dominates each district's allocation; ${NOT_OBSERVATION}.`, levels: ["adm2"], needs: "a district-level layer" },
  method: { id: "method", label: "Allocation method", short: "Method", sentence: `Colour shows how each district's rows were matched to its polygon (one-to-one, a shared shape, a missing shape, outside the frame) and hatching marks placement on a diffuse surface rather than a resolved point; ${NOT_OBSERVATION}.`, levels: ["adm2"], needs: "a district-level layer" },
  unallocated: { id: "unallocated", label: "Unallocated mass", short: "Unallocated", sentence: `Colour shows the mass each province retains at province level because the release placed it no finer, districts greyed beneath; ${NOT_OBSERVATION}.`, levels: ["adm1", "adm2"], needs: "a province-level layer" },
  exceptions: { id: "exceptions", label: "Known spatial exceptions", short: "Exceptions", sentence: `Outlines and hatching mark where the release's rows and the map's polygons do not match one to one (the shared 'Other' cell, shapes shared by several census units, units without a polygon, bounded CH₄ modules); ${NOT_OBSERVATION}.`, levels: ["adm1", "adm2"] },
};

export const LAYER_ORDER: MapLayer[] = ["magnitude", "evidence", "method", "unallocated", "exceptions"];

/** The level a layer paints when the current one cannot show it (the switch moves the level with the layer). */
export function levelForLayer(layer: MapLayer, level: Level): Level {
  return LAYERS[layer].levels.includes(level) ? level : LAYERS[layer].levels[0];
}

export type Category = { id: string; label: string; color: string; definition?: string };

/** S1–S4 and NA, darkest for the strongest evidence; the definitions are the release's dim_evidence_class wording. */
export const SPATIAL_CLASSES: Category[] = [
  { id: "S1", label: "S1 · native geometry", color: "#0f3d66", definition: EVIDENCE_CLASS_TEXT.S1.definition },
  { id: "S2", label: "S2 · facility or network proxy", color: "#3f88ad", definition: EVIDENCE_CLASS_TEXT.S2.definition },
  { id: "S3", label: "S3 · administrative statistic", color: "#a8cfd4", definition: EVIDENCE_CLASS_TEXT.S3.definition },
  { id: "S4", label: "S4 · population or area fallback", color: "#e9c46a", definition: EVIDENCE_CLASS_TEXT.S4.definition },
  { id: "NA", label: "NA · held at province level", color: "#c9ced3", definition: EVIDENCE_CLASS_TEXT.NA.definition },
];

/** The allocation statuses the lineage vocabulary carries; a ';'-joined value takes its most exceptional member. */
export const ALLOCATION_STATUSES: Category[] = [
  { id: "one_to_one", label: "one-to-one", color: "#6faec5", definition: "one release row per polygon" },
  { id: "shared_shape", label: "shared shape", color: "#e9c46a", definition: "several census units drawn as one polygon; the polygon shows their sum" },
  { id: "shape_missing", label: "missing shape", color: "#d1495b", definition: "a row whose polygon the boundary file does not draw; its mass is retained at province level" },
  { id: "outside", label: "outside the frame", color: "#8d6a9f", definition: "a row placed outside the district frame" },
];

export const NOT_SERVED: Category = { id: "not_served", label: "not served on this cell", color: NO_CELL, definition: "the envelope carries no such field for this cell" };

/** The exception kinds the exceptions layer draws (fill or outline) and lists. */
export const EXCEPTION_KINDS: Category[] = [
  { id: "other_unit", label: "shared 'Other' cell", color: "#d7e8e4", definition: "territories the release carries as one province row" },
  { id: "shared_shape", label: "shape shared by several census units", color: "#f4e3a1", definition: "one polygon, several rows; the polygon shows their sum" },
  { id: "no_cell", label: "polygon without a release row", color: NO_CELL, definition: "the boundary file draws it; the release has no row placed on it" },
  { id: "bounded", label: "bounded CH₄ module (hatched)", color: RAMP[2], definition: "the cell's CO₂e is an interval, never a midpoint" },
];

export const PLAIN_FILL = RAMP[1];

/** The category a cell falls in on a layer, from the server's field values (a ';'-joined status takes its most exceptional member). */
export function categoryOf(layer: MapLayer, cell: Cell | undefined): string {
  if (!cell) return "none";
  const f = cell as Record<string, unknown>;
  if (layer === "evidence") {
    const c = typeof f.spatial_class === "string" ? f.spatial_class : "";
    return SPATIAL_CLASSES.some((s) => s.id === c) ? c : NOT_SERVED.id;
  }
  if (layer === "method") {
    const s = typeof f.allocation_status === "string" ? f.allocation_status : "";
    if (!s) return NOT_SERVED.id;
    const parts = s.split(";").map((p) => p.trim());
    for (const id of ["outside", "shape_missing", "shared_shape", "one_to_one"]) if (parts.some((p) => p === id || (id === "shape_missing" && p.includes("missing")))) return id;
    return parts[0];
  }
  return "none";
}

/** Whether the method layer hatches a cell: placement on a diffuse surface (the server's placement_class). */
export function diffusePlacement(cell: Cell | undefined): boolean {
  const p = cell ? String((cell as Record<string, unknown>).placement_class ?? "") : "";
  return p.includes("diffuse") || p.includes("proxy") || p.includes("fallback");
}

/** "one_to_one" -> "one-to-one", "diffuse_by_nature" -> "diffuse by nature": a field value as words; ids stay in the title. */
export function statusWords(id: string | null | undefined): string {
  if (!id) return "";
  return id
    .split(";")
    .map((p) => (p.trim() === "one_to_one" ? "one-to-one" : p.trim().replace(/_/g, " ")))
    .join(" + ");
}

export function categoriesOf(layer: MapLayer): Category[] {
  if (layer === "evidence") return SPATIAL_CLASSES;
  if (layer === "method") return ALLOCATION_STATUSES;
  if (layer === "exceptions") return EXCEPTION_KINDS;
  return [];
}

export function colorOf(layer: MapLayer, id: string): string {
  return categoriesOf(layer).find((c) => c.id === id)?.color ?? (id === NOT_SERVED.id ? NOT_SERVED.color : NO_CELL);
}
