"use client";
/**
 * TILES.json (the raster block: image coordinates, files, anchor cells) and bboxes.json, fetched
 * once from the API (`{API_BASE}/tiles/meta`, `/tiles/bboxes`); the raster frames are
 * `{API_BASE}/tiles/raster/<config>/<gas>/<frame>.png`. The app reads nothing under /tiles of
 * its own origin any more.
 */
import { useQuery } from "@tanstack/react-query";
import { API_BASE, absoluteApiBase } from "@/lib/api";

export type Anchor = { row: number; col: number; lat: number; lon: number; month_of_max?: string };
export type RasterInfo = {
  visual_only: boolean;
  image_coordinates: [[number, number], [number, number], [number, number], [number, number]];
  files: Record<string, string>;
  months: string[];
  anchor_cells: Record<string, { max: Anchor; median: Anchor; n_nonzero_cells?: number }>;
  colormap: string[];
  note?: string;
  stretch?: string;
};
export type TilesInfo = { version: string; promote_id: Record<string, string>; raster?: RasterInfo };
export type Bboxes = { adm1: Record<string, [number, number, number, number]>; adm2: Record<string, [number, number, number, number]> };

export const tilesMetaUrl = (base: string = API_BASE) => `${base}/tiles/meta`;
export const bboxesUrl = (base: string = API_BASE) => `${base}/tiles/bboxes`;
/** The URL of one raster frame as `rasterFile` names it (`<config>/<gas>/<frame>.png`); absolute for Mapbox GL's image source. */
export const rasterUrl = (name: string, base: string = absoluteApiBase()) => `${base}/tiles/raster/${name}`;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json() as Promise<T>;
}
export const fetchTilesInfo = (base: string = API_BASE) => getJson<TilesInfo>(tilesMetaUrl(base));
export const fetchBboxes = (base: string = API_BASE) => getJson<Bboxes>(bboxesUrl(base));

export function useTilesInfo() {
  return useQuery({ queryKey: ["tiles-info"], queryFn: () => fetchTilesInfo(), staleTime: Infinity });
}
export function useBboxes() {
  return useQuery({ queryKey: ["bboxes"], queryFn: () => fetchBboxes(), staleTime: Infinity });
}

/** The frame name of a raster file for (config, gas, month|annual) as TILES.json lists it, or null if the builder wrote none. */
export function rasterFile(info: RasterInfo | undefined, config: string, gas: string, month: string | null): string | null {
  if (!info) return null;
  // TILES.json keys the frames as `raster/<config>/<gas>/<frame>.png` (relative to the tiles
  // folder); the map builds `rasterUrl(<name>)` = `{API_BASE}/tiles/raster/<name>`, so the prefix is stripped here.
  const strip = (f: string) => f.replace(/^raster\//, "");
  const frames = Object.keys(info.files).map(strip);
  const annual = frames.find((f) => f.startsWith(`${config}/${gas}/`) && !/\/\d{6}\.png$/.test(f));
  const name = month ? `${config}/${gas}/${month}.png` : annual;
  return name && frames.includes(name) ? name : null;
}

export function unionBbox(b: Record<string, [number, number, number, number]>): [number, number, number, number] | null {
  const boxes = Object.values(b);
  if (!boxes.length) return null;
  return boxes.reduce((acc, x) => [Math.min(acc[0], x[0]), Math.min(acc[1], x[1]), Math.max(acc[2], x[2]), Math.max(acc[3], x[3])] as [number, number, number, number]);
}
