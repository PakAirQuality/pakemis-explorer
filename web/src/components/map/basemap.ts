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
/** The default style: light-v11, the PAQI ramp over grey land. */
export const BASE_STYLE = "mapbox://styles/mapbox/light-v11";
/** The other basemap Map settings offers: streets-v12, the look of the first rounds, for reading the map against roads and places. */
export const STREETS_STYLE = "mapbox://styles/mapbox/streets-v12";

/** The two basemaps Map settings switches between (a local display setting: no env var, nothing in the URL). */
export type BasemapChoice = "light" | "streets";
export const BASEMAP_CHOICES: { id: BasemapChoice; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "streets", label: "Streets" },
];
export const BASEMAP_DEFAULT: BasemapChoice = "light";

/**
 * The style URL for a choice: the release's own style (which NEXT_PUBLIC_BASEMAP_STYLE may
 * override) for Light, Mapbox streets-v12 for Streets. The choice never reaches the URL or an
 * env var — it is chrome, like the opacity.
 */
export function styleFor(bm: Basemap, choice: BasemapChoice = BASEMAP_DEFAULT): string {
  return choice === "streets" ? STREETS_STYLE : bm.style;
}
export const NO_TOKEN_NOTICE = "No map: Mapbox GL JS renders nothing without a token. Put NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in web/.env.local (gitignored) and restart the web server.";

export function basemap(): Basemap {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const styleUrl = process.env.NEXT_PUBLIC_BASEMAP_STYLE;
  if (!token) return { kind: "none", token: null, notice: NO_TOKEN_NOTICE, attribution: BOUNDARY_ATTRIBUTION, style: BASE_STYLE };
  if (styleUrl) return { kind: "style-url", token, notice: "", attribution: BOUNDARY_ATTRIBUTION, style: styleUrl };
  return { kind: "mapbox-light", token, notice: "", attribution: BOUNDARY_ATTRIBUTION, style: BASE_STYLE };
}
