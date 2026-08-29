/**
 * Painting an envelope onto the tiles through feature-state: {value, display, unit, has_cell,
 * bounded}. `value` shades (the interpolate stops are rebuilt from the envelope's own min and
 * max value), `display` is the only thing ever printed. The id set comes from bboxes.json so
 * no-cell polygons are marked without waiting for tiles to load. At ADM1 the release's residual
 * unit (lib/geography.ts: one row, several polygons) paints its one cell on every member
 * polygon verbatim with `shared: true` and `shared_with: <row name>`; nothing is divided.
 */
import type { Map as MLMap, ExpressionSpecification } from "mapbox-gl";
import type { Cell, Envelope } from "@/lib/envelope";
import { NO_CELL, rampStops, RAMP } from "@/lib/palette";
import type { Level } from "@/lib/urlState";
import type { Residual } from "@/lib/geography";
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

/** The cell a polygon shows: its own, or at ADM1 the residual unit's cell when the polygon is a member. */
export function cellForFeature(index: CellIndex, level: Level, id: string, residual: Residual | null | undefined): { cell: Cell | undefined; shared: boolean } {
  const own = index.byId.get(id);
  if (own || level !== "adm1" || !residual || !residual.members.includes(id)) return { cell: own, shared: false };
  const shared = index.byId.get(residual.name);
  return { cell: shared, shared: !!shared };
}

/** Whether some polygon of the level still has no cell once the residual unit's members are covered. */
export function anyWithoutCell(index: CellIndex, level: Level, ids: string[], residual: Residual | null | undefined): boolean {
  return ids.some((id) => !cellForFeature(index, level, id, residual).cell);
}

/**
 * Set feature-state for every id of the level (cells and no-cell polygons) and rebuild the fill
 * expression. `residual` (ADM1 only) names the row without a polygon and its member polygons.
 */
export function paintEnvelope(map: MLMap, level: Level, index: CellIndex, ids: string[], residual?: Residual | null) {
  if (level === "grid") return;
  const source = level;
  map.removeFeatureState({ source, sourceLayer: source });
  const seen = new Set<string>();
  for (const id of ids) {
    seen.add(id);
    const { cell: c, shared } = cellForFeature(index, level, id, residual);
    const state: Record<string, unknown> = { value: typeof c?.value === "number" ? c.value : null, display: c?.display ?? null, unit: c?.unit ?? null, has_cell: !!c, bounded: c ? isBoundedCell(c) : false };
    if (shared) {
      state.shared = true;
      state.shared_with = residual!.name;
    }
    map.setFeatureState({ source, sourceLayer: source, id }, state);
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
