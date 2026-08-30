/**
 * The theme as JavaScript reads it: the CSS variables of globals.css' `@theme` block (Tailwind
 * emits them on :root), read at render so ECharts (TrendChart, BarChart, the briefing's
 * charts) and the Mapbox layer stack (map/layers.ts) follow the theme without carrying a
 * literal colour. Each read has the token's own value as its fallback for environments
 * without a stylesheet (tests, the export build). Colours size nothing and print nothing.
 */
export const FALLBACK: Record<string, string> = {
  "--color-ground": "#f6f4f1",
  "--color-card": "#ffffff",
  "--color-surface": "#f6f4f1",
  "--color-surface-2": "#ffffff",
  "--color-surface-3": "#efece7",
  "--color-fg": "#242128",
  "--color-muted": "#666677",
  "--color-line": "#e5e1da",
  "--color-line-strong": "#d7d5d1",
  "--color-primary": "#5e1a2a",
  "--color-primary-bright": "#7a2436",
  "--color-primary-soft": "rgba(94, 26, 42, 0.08)",
  "--color-accent": "#5e1a2a",
  "--color-accent-bright": "#7a2436",
  "--color-accent-fill": "#5e1a2a",
  "--color-on-accent": "#ffffff",
  "--color-accent-soft": "rgba(94, 26, 42, 0.08)",
  "--color-brand-gold": "#ffb313",
  "--color-nav": "#fdf6e3",
  "--color-nav-fg": "#242128",
  "--color-nav-line": "#efdfb4",
  "--color-accent-2": "#ffb313",
  "--color-on-accent-2": "#242128",
  "--color-no-data": "#d7d5d1",
  "--color-note-bg": "#fff6e2",
  "--color-note-border": "#f0c36d",
  "--color-note-text": "#6b4a12",
  "--color-refusal": "#fdefe9",
  "--color-warn": "#8a3b12",
  "--color-amber": "#ffb313",
  "--color-amber-soft": "#8a5a0c",
  "--color-panel": "rgba(255, 255, 255, 0.92)",
  "--color-map-outline": "#6b5b57",
  "--color-map-halo": "#ffffff",
  "--color-map-hatch": "rgba(94, 26, 42, 0.5)",
  "--color-map-hover": "#5e1a2a",
  "--color-map-selected": "#242128",
};

/** The UI type: the system stack of globals.css (`--font-sans`), read by ECharts, which takes a font-family string, not a class. */
export const UI_FONT = '-apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** One token's current value (`--color-fg`), or its fallback. */
export function cssVar(name: string): string {
  if (typeof window !== "undefined" && typeof getComputedStyle === "function") {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (v) return v;
    } catch {
      /* no stylesheet: the fallback */
    }
  }
  return FALLBACK[name] ?? "";
}

/** `#5e1a2a` at an alpha, for an area fill (the accent at 18 %); a non-hex colour is returned as it is. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The colours a chart needs, read once per render: gridlines on the line token (drawn dashed), axis text muted, the area fill the oxblood at 18 %, the reference mark the saffron. */
export function chartTheme() {
  const accent = cssVar("--color-accent");
  return {
    surface: cssVar("--color-card"),
    fg: cssVar("--color-fg"),
    muted: cssVar("--color-muted"),
    line: cssVar("--color-line-strong"),
    grid: cssVar("--color-line"),
    accent,
    accentSoft: withAlpha(accent, 0.18),
    accentBright: cssVar("--color-accent-bright"),
    amber: cssVar("--color-amber"),
    amberSoft: cssVar("--color-amber-soft"),
    font: UI_FONT,
  };
}

/** The colours drawn on the light basemap (map/layers.ts): a warm-grey outline and the oxblood / charcoal strokes, legible over the PAQI ramp. */
export function mapTheme() {
  return {
    outline: cssVar("--color-map-outline"),
    halo: cssVar("--color-map-halo"),
    hatch: cssVar("--color-map-hatch"),
    hover: cssVar("--color-map-hover"),
    selected: cssVar("--color-map-selected"),
    space: cssVar("--color-ground"),
  };
}
