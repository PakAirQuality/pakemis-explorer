/**
 * The layer stack (bottom -> top): basemap · grid-raster (image) · grid-fill (hit-test only) +
 * grid-line + grid-selected · adm2-fill + adm2-hatch · adm1-fill · adm2-line · adm1-line ·
 * selected outlines. adm1 keyed by `name`, adm2 by `shape_id`, grid by `cell_id` (promoteId).
 * Visibility follows the URL `level`. Tiles carry geometry and ids only.
 */
import type { Map as MLMap, LayerSpecification, FilterSpecification } from "maplibre-gl";
import { NO_CELL, ACCENT, AMBER } from "@/lib/palette";
import type { Level } from "@/lib/urlState";

export const TILES = process.env.NEXT_PUBLIC_TILES_BASE ?? "/tiles";
export const KEYS: Record<Level, string> = { adm1: "name", adm2: "shape_id", grid: "cell_id" };
export const FILL_LAYER: Record<Level, string> = { adm1: "adm1-fill", adm2: "adm2-fill", grid: "grid-fill" };
export const HATCH_IMAGE = "pakemis-hatch";
export const RASTER_SOURCE = "grid-raster";
export const RASTER_LAYER = "grid-raster";
export const RASTER_OPACITY = 0.75;

function origin(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function addSources(map: MLMap) {
  const o = origin();
  map.addSource("adm1", { type: "vector", url: `pmtiles://${o}${TILES}/adm1.pmtiles`, promoteId: KEYS.adm1 });
  map.addSource("adm2", { type: "vector", url: `pmtiles://${o}${TILES}/adm2.pmtiles`, promoteId: KEYS.adm2 });
  map.addSource("grid", { type: "vector", url: `pmtiles://${o}${TILES}/grid.pmtiles`, promoteId: KEYS.grid });
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
    { id: "adm2-selected", type: "line", source: "adm2", "source-layer": "adm2", filter: ["==", ["get", "shape_id"], ""], paint: { "line-color": AMBER, "line-width": 2.5 } },
    { id: "adm1-selected", type: "line", source: "adm1", "source-layer": "adm1", filter: ["==", ["get", "name"], ""], paint: { "line-color": AMBER, "line-width": 2.5 } },
  ];
}

export function addLayers(map: MLMap) {
  if (!map.hasImage(HATCH_IMAGE)) map.addImage(HATCH_IMAGE, hatchImage(), { pixelRatio: 1 });
  for (const spec of layerSpecs()) if (!map.getLayer(spec.id)) map.addLayer(spec);
}

/** Which layers show at each level. Lines of the coarser levels stay as context. */
export function applyLevel(map: MLMap, level: Level, raster: boolean) {
  const show = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  show("adm1-fill", level === "adm1");
  show("adm1-selected", level === "adm1");
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

export function setSelected(map: MLMap, level: Level, id: string | null, cell?: { lat: number; lon: number } | null) {
  const f = (key: string, v: string | null): FilterSpecification => ["==", ["get", key], v ?? ""] as unknown as FilterSpecification;
  if (map.getLayer("adm1-selected")) map.setFilter("adm1-selected", f("name", level === "adm1" ? id : null));
  if (map.getLayer("adm2-selected")) map.setFilter("adm2-selected", f("shape_id", level === "adm2" ? id : null));
  if (map.getLayer("grid-selected")) {
    const c = level === "grid" ? cell : null;
    // the tiles carry each cell's centre to 3 dp; a click writes exactly those numbers into `cell`
    map.setFilter("grid-selected", (c ? ["all", ["==", ["get", "lat"], c.lat], ["==", ["get", "lon"], c.lon]] : ["==", ["get", "cell_id"], ""]) as unknown as FilterSpecification);
  }
}

/** The grid raster image source; mounted once, updated per frame, opacity 0 when off. */
export function ensureRaster(map: MLMap, url: string, coordinates: [[number, number], [number, number], [number, number], [number, number]], opacity: number) {
  const src = map.getSource(RASTER_SOURCE) as { updateImage?: (o: { url: string; coordinates: typeof coordinates }) => void } | undefined;
  if (!src) {
    map.addSource(RASTER_SOURCE, { type: "image", url, coordinates });
    const before = map.getLayer("grid-fill") ? "grid-fill" : undefined;
    map.addLayer({ id: RASTER_LAYER, type: "raster", source: RASTER_SOURCE, paint: { "raster-opacity": opacity, "raster-resampling": "nearest", "raster-fade-duration": 0 } }, before);
  } else {
    src.updateImage?.({ url, coordinates });
    map.setPaintProperty(RASTER_LAYER, "raster-opacity", opacity);
  }
}
