/**
 * The layer stack (bottom -> top): basemap fills · grid-raster (image) · grid-fill (hit-test
 * only) + grid-line + grid-selected · adm2-fill + adm2-hatch · adm1-fill · adm2-line · adm1-line
 * · adm1-shared (the dotted outline of the residual unit's members) · selected outlines · the
 * basemap's symbol (label) layers. Everything of ours is inserted
 * before the style's first symbol layer so place names stay readable. adm1 keyed by `name`,
 * adm2 by `shape_id`, grid by `cell_id` (promoteId). Visibility follows the URL `level`. Tiles
 * carry geometry and ids only; they reach Mapbox GL as TileJSON from app/tiles/[name].
 */
import type { Map as MBMap, LayerSpecification, FilterSpecification } from "mapbox-gl";
import { NO_CELL, ACCENT, AMBER } from "@/lib/palette";
import type { Level } from "@/lib/urlState";

/** Static tile files (TILES.json, bboxes.json, raster PNGs). */
export const TILES = process.env.NEXT_PUBLIC_TILES_BASE ?? "/tiles";
/** The TileJSON route handlers (app/tiles/[name]), always on this app's origin. */
export const TILEJSON = "/tiles";
export const KEYS: Record<Level, string> = { adm1: "name", adm2: "shape_id", grid: "cell_id" };
export const FILL_LAYER: Record<Level, string> = { adm1: "adm1-fill", adm2: "adm2-fill", grid: "grid-fill" };
export const HATCH_IMAGE = "pakemis-hatch";
export const RASTER_SOURCE = "grid-raster";
export const RASTER_LAYER = "grid-raster";
export const RASTER_OPACITY = 0.75;

function origin(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

/** The TileJSON URL of one archive; absolute so Mapbox GL never resolves it against a style URL. */
export function tileJsonUrl(name: Level): string {
  return `${origin()}${TILEJSON}/${name}`;
}

export function addSources(map: MBMap) {
  for (const name of ["adm1", "adm2", "grid"] as const) if (!map.getSource(name)) map.addSource(name, { type: "vector", url: tileJsonUrl(name), promoteId: KEYS[name] });
}

/** The id of the style's first symbol layer (labels), or undefined when the style has none. */
export function firstSymbolLayerId(map: MBMap): string | undefined {
  return map.getStyle()?.layers?.find((l) => l.type === "symbol")?.id;
}

/** The 8x8 diagonal hatch drawn over bounded ADM2 cells (colour = low; the hatch says "interval"). */
export function hatchImage(): ImageData {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 8, 8);
  ctx.strokeStyle = "rgba(27, 36, 48, 0.55)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-2, 6);
  ctx.lineTo(6, -2);
  ctx.moveTo(2, 10);
  ctx.lineTo(10, 2);
  ctx.stroke();
  return ctx.getImageData(0, 0, 8, 8);
}

const NO_FILL_COLOR = NO_CELL;

export function layerSpecs(): LayerSpecification[] {
  const hoverW = (base: number, hover: number) => ["case", ["boolean", ["feature-state", "hover"], false], hover, base] as unknown as number;
  return [
    { id: "grid-fill", type: "fill", source: "grid", "source-layer": "grid", minzoom: 6, paint: { "fill-color": "#000000", "fill-opacity": 0 } },
    { id: "grid-line", type: "line", source: "grid", "source-layer": "grid", minzoom: 8, paint: { "line-color": "rgba(27,36,48,0.18)", "line-width": 0.5 } },
    { id: "grid-hover", type: "line", source: "grid", "source-layer": "grid", minzoom: 6, paint: { "line-color": ACCENT, "line-width": hoverW(0, 1.5) } },
    { id: "grid-selected", type: "line", source: "grid", "source-layer": "grid", minzoom: 5, filter: ["==", ["get", "cell_id"], ""], paint: { "line-color": AMBER, "line-width": 2.5 } },
    { id: "adm2-fill", type: "fill", source: "adm2", "source-layer": "adm2", paint: { "fill-color": NO_FILL_COLOR, "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.95, 0.82] } },
    { id: "adm2-hatch", type: "fill", source: "adm2", "source-layer": "adm2", paint: { "fill-pattern": HATCH_IMAGE, "fill-opacity": ["case", ["boolean", ["feature-state", "bounded"], false], 1, 0] } },
    { id: "adm1-fill", type: "fill", source: "adm1", "source-layer": "adm1", paint: { "fill-color": NO_FILL_COLOR, "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.95, 0.82] } },
    { id: "adm2-line", type: "line", source: "adm2", "source-layer": "adm2", paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.3, 8, 0.9] } },
    { id: "adm1-line", type: "line", source: "adm1", "source-layer": "adm1", paint: { "line-color": "#1b2430", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.8, 8, 1.6], "line-opacity": 0.7 } },
    // the dotted outline of the polygons sharing the residual unit's one cell (feature-state `shared`, paint.ts)
    { id: "adm1-shared", type: "line", source: "adm1", "source-layer": "adm1", paint: { "line-color": "#1b2430", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.2, 8, 2.2], "line-dasharray": [0.6, 1.6], "line-opacity": ["case", ["boolean", ["feature-state", "shared"], false], 0.95, 0] } },
    { id: "adm2-selected", type: "line", source: "adm2", "source-layer": "adm2", filter: ["==", ["get", "shape_id"], ""], paint: { "line-color": AMBER, "line-width": 2.5 } },
    { id: "adm1-selected", type: "line", source: "adm1", "source-layer": "adm1", filter: ["==", ["get", "name"], ""], paint: { "line-color": AMBER, "line-width": 2.5 } },
  ];
}

/** Add the stack, each layer inserted before `before` (the basemap's first symbol layer). */
export function addLayers(map: MBMap, before?: string) {
  if (!map.hasImage(HATCH_IMAGE)) map.addImage(HATCH_IMAGE, hatchImage(), { pixelRatio: 1 });
  for (const spec of layerSpecs()) if (!map.getLayer(spec.id)) map.addLayer(spec, before);
}

/** Which layers show at each level. Lines of the coarser levels stay as context. */
export function applyLevel(map: MBMap, level: Level, raster: boolean) {
  const show = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  show("adm1-fill", level === "adm1");
  show("adm1-selected", level === "adm1");
  show("adm1-shared", level === "adm1");
  show("adm2-fill", level === "adm2");
  show("adm2-hatch", level === "adm2");
  show("adm2-selected", level === "adm2");
  show("adm2-line", level !== "adm1");
  show("adm1-line", true);
  show("grid-fill", level === "grid");
  show("grid-line", level === "grid");
  show("grid-hover", level === "grid");
  show("grid-selected", level === "grid");
  if (map.getLayer(RASTER_LAYER)) map.setPaintProperty(RASTER_LAYER, "raster-opacity", raster ? RASTER_OPACITY : 0);
}

/**
 * The selection outline. `adm1Names` lists the ADM1 polygons that stand for `id` when it is
 * the residual unit (lib/geography.ts); otherwise the polygon named `id` is outlined.
 */
export function setSelected(map: MBMap, level: Level, id: string | null, cell?: { lat: number; lon: number } | null, adm1Names?: string[]) {
  const f = (key: string, v: string | null): FilterSpecification => ["==", ["get", key], v ?? ""] as unknown as FilterSpecification;
  if (map.getLayer("adm1-selected")) {
    const names = level === "adm1" && id ? (adm1Names?.length ? adm1Names : [id]) : [];
    map.setFilter("adm1-selected", (names.length ? ["in", ["get", "name"], ["literal", names]] : f("name", null)) as unknown as FilterSpecification);
  }
  if (map.getLayer("adm2-selected")) map.setFilter("adm2-selected", f("shape_id", level === "adm2" ? id : null));
  if (map.getLayer("grid-selected")) {
    const c = level === "grid" ? cell : null;
    // the tiles carry each cell's centre to 3 dp; a click writes exactly those numbers into `cell`
    map.setFilter("grid-selected", (c ? ["all", ["==", ["get", "lat"], c.lat], ["==", ["get", "lon"], c.lon]] : ["==", ["get", "cell_id"], ""]) as unknown as FilterSpecification);
  }
}

/**
 * The grid raster image source; mounted once (just below grid-fill, itself below the labels),
 * updated per frame, opacity 0 when off. `before` is the fallback insertion point when the
 * vector layers are not mounted yet.
 */
export function ensureRaster(map: MBMap, url: string, coordinates: [[number, number], [number, number], [number, number], [number, number]], opacity: number, before?: string) {
  const src = map.getSource(RASTER_SOURCE) as { updateImage?: (o: { url: string; coordinates: typeof coordinates }) => void } | undefined;
  if (!src) {
    map.addSource(RASTER_SOURCE, { type: "image", url, coordinates });
    const at = map.getLayer("grid-fill") ? "grid-fill" : before;
    map.addLayer({ id: RASTER_LAYER, type: "raster", source: RASTER_SOURCE, paint: { "raster-opacity": opacity, "raster-resampling": "nearest", "raster-fade-duration": 0 } }, at);
  } else {
    src.updateImage?.({ url, coordinates });
    map.setPaintProperty(RASTER_LAYER, "raster-opacity", opacity);
  }
}

/** The ops dashboard's atmosphere (the globe's halo at low zoom, the horizon haze when tilted). */
export const ATMOSPHERE = { range: [0.5, 10] as [number, number], color: "#ffffff", "high-color": "#b8d4e8", "space-color": "#d8f2ff", "horizon-blend": 0.08, "star-intensity": 0 };

/** streets-v12 declares no fog, so v3's globe would show a bare edge; the atmosphere is set once unless the style has its own. */
export function ensureAtmosphere(map: MBMap) {
  if (!map.getFog()) map.setFog(ATMOSPHERE);
}

/** The ops dashboard's 3D recipe: Mapbox terrain, the atmosphere and a tilted camera; off keeps the atmosphere. */
export const DEM_SOURCE = "mapbox-dem";
export function setView3d(map: MBMap, on: boolean) {
  if (on) {
    if (!map.getSource(DEM_SOURCE)) map.addSource(DEM_SOURCE, { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
    map.setTerrain({ source: DEM_SOURCE, exaggeration: ["interpolate", ["linear"], ["zoom"], 0, 1.5, 15, 1.0] });
    map.setFog(ATMOSPHERE);
    map.easeTo({ pitch: 30, bearing: -10, duration: 700 });
  } else {
    map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    if (map.getTerrain()) map.setTerrain(null);
    ensureAtmosphere(map);
  }
}
