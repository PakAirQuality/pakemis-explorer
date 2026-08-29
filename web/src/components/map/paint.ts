/**
 * Painting an envelope onto the tiles through feature-state: {value, display, unit, has_cell,
 * bounded}. `value` shades (the interpolate stops are rebuilt from the envelope's own min and
 * max value), `display` is the only thing ever printed. The id set comes from bboxes.json so
 * no-cell polygons are marked without waiting for tiles to load.
 */
import type { Map as MLMap, ExpressionSpecification } from "maplibre-gl";
import type { Cell, Envelope } from "@/lib/envelope";
import { NO_CELL, rampStops, RAMP } from "@/lib/palette";
import type { Level } from "@/lib/urlState";
import { KEYS, FILL_LAYER } from "./layers";

export type CellIndex = { byId: Map<string, Cell>; min: number; max: number; unit: string; anyBounded: boolean };

export function isBoundedCell(c: Cell): boolean {
  return !!c.exactness && c.exactness.includes("bounded");
}

/** Index an envelope's cells by the feature id of the level (province name or shape_id). */
export function indexCells(env: Envelope, level: Level): CellIndex {
  const key = level === "adm1" ? "province" : "shape_id";
  const byId = new Map<string, Cell>();
  let min = Infinity;
  let max = -Infinity;
  let anyBounded = false;
  for (const c of env.values) {
    const id = c.group?.[key];
    if (!id) continue;
    byId.set(id, c);
    if (typeof c.value === "number") {
      if (c.value < min) min = c.value;
      if (c.value > max) max = c.value;
    }
    if (isBoundedCell(c)) anyBounded = true;
  }
  if (!Number.isFinite(min)) {
    min = 0;
    max = 0;
  }
  return { byId, min, max, unit: env.values[0]?.unit ?? "", anyBounded };
}

export function fillColorExpression(min: number, max: number): ExpressionSpecification {
  const shade: ExpressionSpecification = max > min ? (["interpolate", ["linear"], ["coalesce", ["feature-state", "value"], min], ...rampStops(min, max)] as unknown as ExpressionSpecification) : (RAMP[RAMP.length - 1] as unknown as ExpressionSpecification);
  return ["case", ["!", ["to-boolean", ["feature-state", "has_cell"]]], NO_CELL, shade] as unknown as ExpressionSpecification;
}

/** Set feature-state for every id of the level (cells and no-cell polygons) and rebuild the fill expression. */
export function paintEnvelope(map: MLMap, level: Level, index: CellIndex, ids: string[]) {
  if (level === "grid") return;
  const source = level;
  map.removeFeatureState({ source, sourceLayer: source });
  const seen = new Set<string>();
  for (const id of ids) {
    seen.add(id);
    const c = index.byId.get(id);
    map.setFeatureState({ source, sourceLayer: source, id }, { value: typeof c?.value === "number" ? c.value : null, display: c?.display ?? null, unit: c?.unit ?? null, has_cell: !!c, bounded: c ? isBoundedCell(c) : false });
  }
  for (const [id, c] of index.byId) if (!seen.has(id)) map.setFeatureState({ source, sourceLayer: source, id }, { value: typeof c.value === "number" ? c.value : null, display: c.display, unit: c.unit, has_cell: true, bounded: isBoundedCell(c) });
  map.setPaintProperty(FILL_LAYER[level], "fill-color", fillColorExpression(index.min, index.max));
}

/** Clear every value from the level (a refused request paints nothing: outlines only). */
export function clearPaint(map: MLMap, level: Level) {
  if (level === "grid") return;
  map.removeFeatureState({ source: level, sourceLayer: level });
  map.setPaintProperty(FILL_LAYER[level], "fill-color", NO_CELL);
}

export function featureKey(level: Level): string {
  return KEYS[level];
}
