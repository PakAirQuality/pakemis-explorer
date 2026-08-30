/**
 * The design system's colours: one 5-stop sequential ramp, PAQI's warm civic identity (pale
 * saffron → saffron → ember → clay → oxblood), shared by the choropleth at every level, the
 * legend's swatches and gradient bar, the Overview's briefing map and — by RANK, not by
 * identity — every set of bars, segments and swatches in the interface. The ten fixed sector
 * hues retired with the blue palette: a sector is told apart by its label, and its colour says
 * only where it stands in the order the envelope returned. The grid raster carries its own
 * colormap (TILES.json.raster.colormap, written by tiles/build_tiles.py); the raster legend
 * reads that list, not this one.
 * Colours size nothing and print nothing; a cell's `value` (or its rank) may only pick a colour
 * here, and a rank is never printed.
 */

/** The primary family (globals.css `--color-accent*` / `--color-primary*`): `ACCENT` is the oxblood of links, chart strokes and the filled button, `ACCENT_BRIGHT` its hover, `ACCENT_FILL` the same oxblood (kept for callers), `ACCENT_SOFT` the 8 % tint behind it. */
export const ACCENT = "#462e32";
export const ACCENT_BRIGHT = "#5a3c40";
export const ACCENT_FILL = "#462e32";
export const ACCENT_SOFT = "rgba(70, 46, 50, 0.08)";
/** The saffron accent (`--color-brand-gold` / `--color-amber`): the reference-year marker and small marks. */
export const AMBER = "#ffb313";
/** A polygon or a cell the release has no row for (`--color-no-data`), drawn hatched. */
export const NO_CELL = "#d7d5d1";
/** The PAQI ramp, light to dark: the magnitude layer's ramp at every level and the rank ramp of every chart. */
export const RAMP = ["#fff0b3", "#ffb313", "#e87832", "#b4453f", "#462e32"] as const;

/** The three gases' hues, used inside charts only (the stacked gas bar): distinct, and all three of the PAQI family. */
export const GAS_HUES: Record<string, string> = { CH4: "#462e32", CO2: "#b4453f", N2O: "#ffb313" };
export function gasColor(id: string | null | undefined): string {
  return (id && GAS_HUES[id.toUpperCase()]) || ACCENT;
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

/**
 * The colour of the mark at `index` in a set of `count`: the ramp interpolated across the set,
 * DARKEST FIRST — rank 0 takes the oxblood, the last the pale saffron. The rank is the cell's
 * order in the envelope (the requests order by value descending); where an envelope is not
 * ordered the caller ranks by the cell's own value. A visual encoding only: no rank is ever
 * printed, and the same id may take a different colour in a different set.
 */
export function rampByRank(index: number, count: number): string {
  const n = Math.max(1, count);
  const i = Math.min(n - 1, Math.max(0, index));
  return rampColor(n - 1 - i, 0, n - 1);
}

/** The stops of a Mapbox GL `interpolate` expression for one envelope's own min and max `value`. */
export function rampStops(min: number, max: number): (number | string)[] {
  const out: (number | string)[] = [];
  RAMP.forEach((c, i) => out.push(i === RAMP.length - 1 ? max : i === 0 ? min : min + ((max - min) * i) / (RAMP.length - 1), c));
  return out;
}
