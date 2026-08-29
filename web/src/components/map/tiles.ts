"use client";
/** TILES.json (the raster block: image coordinates, files, anchor cells) and bboxes.json, fetched once. */
import { useQuery } from "@tanstack/react-query";
import { TILES } from "./layers";

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

export function useTilesInfo() {
  return useQuery({ queryKey: ["tiles-info"], queryFn: async () => (await fetch(`${TILES}/TILES.json`)).json() as Promise<TilesInfo>, staleTime: Infinity });
}
export function useBboxes() {
  return useQuery({ queryKey: ["bboxes"], queryFn: async () => (await fetch(`${TILES}/bboxes.json`)).json() as Promise<Bboxes>, staleTime: Infinity });
}

/** The frame name of a raster file for (config, gas, month|annual) as TILES.json lists it, or null if the builder wrote none. */
export function rasterFile(info: RasterInfo | undefined, config: string, gas: string, month: string | null): string | null {
  if (!info) return null;
  // TILES.json keys the frames as `raster/<config>/<gas>/<frame>.png` (relative to the tiles
  // folder); the map builds `${TILES}/raster/<name>`, so the prefix is stripped here.
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
