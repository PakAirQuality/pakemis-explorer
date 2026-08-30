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
import type { Level, MapLayer } from "@/lib/urlState";
import type { Residual } from "@/lib/geography";
import { KEYS, FILL_LAYER } from "./layers";
import { categoriesOf, categoryOf, diffusePlacement, EXCEPTION_KINDS, NOT_SERVED, PLAIN_FILL } from "./layerModes";
import type { ExceptionIndex } from "./exceptions";

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
    const state: Record<string, unknown> = { value: typeof c?.value === "number" ? c.value : null, display: c?.display ?? null, unit: c?.unit ?? null, has_cell: !!c, bounded: c ? isBoundedCell(c) : false, hatch: c ? isBoundedCell(c) : false, cat: "none", outline: null };
    if (shared) {
      state.shared = true;
      state.shared_with = residual!.name;
    }
    map.setFeatureState({ source, sourceLayer: source, id }, state);
  }
  for (const [id, c] of index.byId) if (!seen.has(id)) map.setFeatureState({ source, sourceLayer: source, id }, { value: typeof c.value === "number" ? c.value : null, display: c.display, unit: c.unit, has_cell: true, bounded: isBoundedCell(c), hatch: isBoundedCell(c), cat: "none", outline: null });
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

// ---- the Map page's layers (layerModes.ts): categorical paint through feature-state `cat`

/** A `match` on feature-state `cat` over a layer's categories; a polygon without a cell stays NO_CELL. */
export function categoricalFillExpression(layer: MapLayer): ExpressionSpecification {
  const cats = categoriesOf(layer);
  const pairs: (string | number)[] = [];
  for (const c of cats) pairs.push(c.id, c.color);
  pairs.push(NOT_SERVED.id, NOT_SERVED.color);
  const fallback = layer === "exceptions" ? PLAIN_FILL : NO_CELL;
  const match = ["match", ["coalesce", ["feature-state", "cat"], "none"], ...pairs, fallback] as unknown as ExpressionSpecification;
  return ["case", ["!", ["to-boolean", ["feature-state", "has_cell"]]], NO_CELL, match] as unknown as ExpressionSpecification;
}

/** The unallocated layer's province shade: the ramp over feature-state `u` (the province's retained mass) between the rows' min and max. */
export function unallocatedFillExpression(min: number, max: number): ExpressionSpecification {
  const shade: ExpressionSpecification = max > min ? (["interpolate", ["linear"], ["coalesce", ["feature-state", "u"], min], ...rampStops(min, max)] as unknown as ExpressionSpecification) : (RAMP[3] as unknown as ExpressionSpecification);
  return ["case", ["!", ["to-boolean", ["feature-state", "has_u"]]], NO_CELL, shade] as unknown as ExpressionSpecification;
}

/** The fill expression of a layer at a level: the choropleth ramp, a categorical match, a flat grey (districts under the unallocated layer) or the province shade. */
export function fillExpressionFor(layer: MapLayer, level: Level, index: CellIndex | null, unallocated?: UnallocatedIndex | null): ExpressionSpecification | string {
  if (layer === "magnitude") return index ? fillColorExpression(index.min, index.max) : NO_CELL;
  if (layer === "unallocated") return level === "adm1" ? (unallocated ? unallocatedFillExpression(unallocated.min, unallocated.max) : NO_CELL) : NO_CELL;
  return categoricalFillExpression(layer);
}

export type UnallocatedIndex = { byProvince: Map<string, { exact: string; short: string }>; min: number; max: number };

/** The ADM1 envelope's unallocated.by_province rows indexed by province: `short` is the server's unallocated_short (else the exact string); `u` shades only. */
export function indexUnallocated(env: Envelope | null | undefined): UnallocatedIndex | null {
  const u = env?.unallocated as { by_province?: { province: string; exact: string; unallocated_short?: string }[] } | undefined;
  if (!u?.by_province?.length) return null;
  const byProvince = new Map<string, { exact: string; short: string }>();
  let min = Infinity;
  let max = -Infinity;
  for (const r of u.by_province) {
    byProvince.set(r.province, { exact: r.exact, short: r.unallocated_short ?? r.exact });
    const v = Number(r.exact);
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min)) {
    min = 0;
    max = 0;
  }
  return { byProvince, min, max };
}

/** The exception kind of a polygon on the exceptions layer, in precedence order. */
export function exceptionKindOf(level: Level, id: string, cell: Cell | undefined, shared: boolean, ex: ExceptionIndex | null | undefined): string {
  if (!cell) return "no_cell";
  if (level === "adm1") return shared ? "other_unit" : isBoundedCell(cell) ? "bounded" : "none";
  if (ex?.otherShapes.has(id)) return "other_unit";
  if (ex?.sharedShapes.has(id) || String((cell as Record<string, unknown>).allocation_status ?? "").includes("shared_shape")) return "shared_shape";
  return isBoundedCell(cell) ? "bounded" : "none";
}

const OUTLINE: Record<string, string> = { other_unit: "#242128", shared_shape: "#8a5a0c", no_cell: "#c04a3a" };

export type LayerPaint = { layer: MapLayer; index: CellIndex | null; ids: string[]; residual?: Residual | null; exceptions?: ExceptionIndex | null; unallocated?: UnallocatedIndex | null; adm1Ids?: string[] };

/**
 * Paint a layer at a level: every polygon's feature-state carries its cell (value, display,
 * unit, has_cell, bounded) plus the layer's `cat`, `hatch` and `outline`; the fill expression
 * follows the layer. The unallocated layer paints the province fill (feature-state `u`, the
 * server's by_province rows) at either level and greys the district fill.
 */
export function paintLayer(map: MLMap, level: Level, p: LayerPaint) {
  if (level === "grid") return;
  const { layer, index, ids, residual, exceptions, unallocated } = p;
  const source = level;
  map.removeFeatureState({ source, sourceLayer: source });
  if (layer === "magnitude") {
    if (index) paintEnvelope(map, level, index, ids, residual);
    else clearPaint(map, level);
    return;
  }
  if (layer === "unallocated") {
    // provinces shaded by their retained mass; districts a flat grey beneath
    if (map.getLayer("adm2-fill")) map.setPaintProperty("adm2-fill", "fill-color", NO_CELL);
    map.removeFeatureState({ source: "adm1", sourceLayer: "adm1" });
    if (unallocated) {
      for (const id of p.adm1Ids ?? []) {
        const name = residual && residual.members.includes(id) ? residual.name : id;
        const row = unallocated.byProvince.get(name);
        map.setFeatureState({ source: "adm1", sourceLayer: "adm1", id }, { u: row ? Number(row.exact) : null, display: row?.short ?? null, has_u: !!row, shared: !!row && name !== id, shared_with: name !== id ? name : null });
      }
    }
    if (map.getLayer("adm1-fill")) map.setPaintProperty("adm1-fill", "fill-color", fillExpressionFor("unallocated", "adm1", null, unallocated));
    return;
  }
  const seen = new Set<string>();
  const stateFor = (id: string, c: Cell | undefined, shared: boolean) => {
    const bounded = c ? isBoundedCell(c) : false;
    const st: Record<string, unknown> = { value: typeof c?.value === "number" ? c.value : null, display: c?.display ?? null, unit: c?.unit ?? null, has_cell: !!c, bounded, hatch: false, cat: "none", outline: null };
    if (shared) {
      st.shared = true;
      st.shared_with = residual!.name;
    }
    if (layer === "evidence") st.cat = categoryOf("evidence", c);
    else if (layer === "method") {
      st.cat = categoryOf("method", c);
      st.hatch = !!c && diffusePlacement(c);
      st.outline = st.cat === "shared_shape" ? OUTLINE.shared_shape : null;
    } else if (layer === "exceptions") {
      const kind = exceptionKindOf(level, id, c, shared, exceptions);
      st.cat = kind;
      st.hatch = bounded;
      st.outline = OUTLINE[kind] ?? null;
      if (kind === "bounded") st.cat = "none";
    }
    return st;
  };
  if (index) {
    for (const id of ids) {
      seen.add(id);
      const { cell: c, shared } = cellForFeature(index, level, id, residual);
      map.setFeatureState({ source, sourceLayer: source, id }, stateFor(id, c, shared));
    }
    for (const [id, c] of index.byId) if (!seen.has(id)) map.setFeatureState({ source, sourceLayer: source, id }, stateFor(id, c, false));
  }
  map.setPaintProperty(FILL_LAYER[level], "fill-color", index ? fillExpressionFor(layer, level, index) : NO_CELL);
}

/** The exception kinds present on a level, for the legend (a bounded cell is hatched, not filled). */
export function exceptionKindsPresent(level: Level, index: CellIndex | null, ids: string[], residual: Residual | null | undefined, ex: ExceptionIndex | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!index) return out;
  for (const id of ids) {
    const { cell, shared } = cellForFeature(index, level, id, residual);
    out.add(exceptionKindOf(level, id, cell, shared, ex));
  }
  for (const k of out) if (!EXCEPTION_KINDS.some((e) => e.id === k)) out.delete(k);
  return out;
}
