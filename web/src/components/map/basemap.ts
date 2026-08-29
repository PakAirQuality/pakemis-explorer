/**
 * The basemap. Primary: Mapbox's light style tiles through MapLibre as a raster source, from
 * NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN (web/.env.local, gitignored; never printed). Fallback:
 * NEXT_PUBLIC_BASEMAP_STYLE, a vector style URL (an OpenFreeMap style, keyless). Otherwise a
 * neutral background and a one-line notice. The token is only ever interpolated into the tile
 * URL the browser requests.
 */
import type { StyleSpecification } from "maplibre-gl";

export type Basemap = { style: string | StyleSpecification; kind: "mapbox" | "style-url" | "none"; notice: string; attribution: string };

export const BOUNDARY_ATTRIBUTION = "Boundaries: geoBoundaries gbOpen · Values: PakEmis API envelopes (tiles carry none)";

export function basemap(): Basemap {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const styleUrl = process.env.NEXT_PUBLIC_BASEMAP_STYLE;
  if (token) {
    const attribution = '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    return {
      kind: "mapbox",
      notice: "",
      attribution,
      style: {
        version: 8,
        sources: {
          "mapbox-light": {
            type: "raster",
            tiles: [`https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/512/{z}/{x}/{y}@2x?access_token=${encodeURIComponent(token)}`],
            tileSize: 512,
            attribution,
            maxzoom: 20,
          },
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": "#eef2f5" } },
          { id: "basemap", type: "raster", source: "mapbox-light", paint: { "raster-opacity": 1 } },
        ],
      },
    };
  }
  if (styleUrl) return { kind: "style-url", notice: "", attribution: BOUNDARY_ATTRIBUTION, style: styleUrl };
  return {
    kind: "none",
    notice: "No basemap: set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in web/.env.local (or NEXT_PUBLIC_BASEMAP_STYLE for a keyless style).",
    attribution: BOUNDARY_ATTRIBUTION,
    style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#eef2f5" } }] },
  };
}
