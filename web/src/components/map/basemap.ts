/**
 * The basemap. emissions.web.app's look: Mapbox GL JS v3 rendering `mapbox://styles/mapbox/light-v11`
 * (light grey land, white water, pale borders, few labels; v3's default globe projection and
 * atmosphere at low zoom) with the token from NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN (web/.env.local,
 * gitignored; only ever assigned to mapboxgl.accessToken, never printed).
 * NEXT_PUBLIC_BASEMAP_STYLE overrides the style URL (a Mapbox Studio style or any v8 style
 * URL; the projection is then the style's own).
 *
 * Mapbox GL JS v2+ authenticates every map load and renders nothing at all without a valid
 * token, whatever the style (Map#_revokeAuth clears the canvas), so there is no keyless map:
 * without the token no map is created and a one-line notice says so. The choropleth's numbers
 * live in the legend and the panels either way.
 */
export type BasemapKind = "mapbox-light" | "style-url" | "none";
export type Basemap = { style: string; kind: BasemapKind; token: string | null; notice: string; attribution: string };

export const BOUNDARY_ATTRIBUTION = "Boundaries: geoBoundaries gbOpen · values: PakEmis API envelopes (tiles carry none)";
/** The default style: light-v11, the YlOrRd choropleth over grey land; the streets-v12 look of the first rounds is one env var away. */
export const BASE_STYLE = "mapbox://styles/mapbox/light-v11";
/** @deprecated the old name; the same string as BASE_STYLE. */
export const STREETS_STYLE = BASE_STYLE;
export const NO_TOKEN_NOTICE = "No map: Mapbox GL JS renders nothing without a token. Put NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in web/.env.local (gitignored) and restart the web server.";

export function basemap(): Basemap {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const styleUrl = process.env.NEXT_PUBLIC_BASEMAP_STYLE;
  if (!token) return { kind: "none", token: null, notice: NO_TOKEN_NOTICE, attribution: BOUNDARY_ATTRIBUTION, style: BASE_STYLE };
  if (styleUrl) return { kind: "style-url", token, notice: "", attribution: BOUNDARY_ATTRIBUTION, style: styleUrl };
  return { kind: "mapbox-light", token, notice: "", attribution: BOUNDARY_ATTRIBUTION, style: BASE_STYLE };
}
