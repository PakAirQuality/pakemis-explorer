/**
 * The design system's colours. Ten fixed sector hues (one per module of dim_stream) and one
 * 7-stop sequential ramp shared by the choropleth, the legend swatches and the grid raster
 * (tiles/build_tiles.py writes the same seven stops into TILES.json.raster.colormap).
 * Colours size nothing and print nothing; a cell's `value` may only pick a colour here.
 */
export const SECTOR_HUES: Record<string, string> = {
  agriculture: "#4C9F70",
  power: "#D1495B",
  transport: "#3A86FF",
  waste: "#8D6A9F",
  residential: "#F4A261",
  fugitives: "#E9C46A",
  ippu: "#2A9D8F",
  industry: "#6C757D",
  railways: "#A0522D",
  aviation: "#48CAE4",
};

/** The accent family (globals.css, light): `ACCENT` is the green of links, chart strokes and the filled button, `ACCENT_BRIGHT` its hover, `ACCENT_FILL` the same green (kept for callers), `ACCENT_SOFT` the tint behind it. */
export const ACCENT = "#1f7a5c";
export const ACCENT_BRIGHT = "#27956f";
export const ACCENT_FILL = "#1f7a5c";
export const ACCENT_SOFT = "#e6f4ee";
export const AMBER = "#d97706";
export const NO_CELL = "#e2e6ea";
export const RAMP = ["#f1f5f4", "#d7e8e4", "#a8cfd4", "#6faec5", "#3f88ad", "#23618f", "#0f3d66"] as const;

/** The three gases' hues, used inside charts only (the stacked gas bar). */
export const GAS_HUES: Record<string, string> = { CH4: "#1f7a5c", CO2: "#4c6a8a", N2O: "#c98a2b" };
export function gasColor(id: string | null | undefined): string {
  return (id && GAS_HUES[id.toUpperCase()]) || ACCENT;
}

export function sectorColor(id: string | null | undefined): string {
  return (id && SECTOR_HUES[id]) || ACCENT;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The ramp colour of `value` between `min` and `max`, linear in sRGB like Mapbox GL's `interpolate`. */
export function rampColor(value: number, min: number, max: number): string {
  if (!(max > min)) return RAMP[RAMP.length - 1];
  const t = Math.min(1, Math.max(0, (value - min) / (max - min))) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t));
  const f = t - i;
  const a = hexToRgb(RAMP[i]);
  const b = hexToRgb(RAMP[i + 1]);
  const c = a.map((x, k) => Math.round(x + (b[k] - x) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** The stops of a Mapbox GL `interpolate` expression for one envelope's own min and max `value`. */
export function rampStops(min: number, max: number): (number | string)[] {
  const out: (number | string)[] = [];
  RAMP.forEach((c, i) => out.push(i === RAMP.length - 1 ? max : i === 0 ? min : min + ((max - min) * i) / (RAMP.length - 1), c));
  return out;
}
