/**
 * The theme as JavaScript reads it: the CSS variables of globals.css' `@theme` block (Tailwind
 * emits them on :root), read at render so ECharts (TrendChart, BarChart, the briefing's
 * charts) and the Mapbox layer stack (map/layers.ts) follow the theme without carrying a
 * literal colour. Each read has the token's own value as its fallback for environments
 * without a stylesheet (tests, the export build). Colours size nothing and print nothing.
 */
export const FALLBACK: Record<string, string> = {
  "--color-ground": "#faf8f4",
  "--color-card": "#ffffff",
  "--color-surface": "#faf8f4",
  "--color-surface-2": "#ffffff",
  "--color-surface-3": "#f1eee8",
  "--color-fg": "#161a1d",
  "--color-muted": "#5c6670",
  "--color-line": "#e7e3dc",
  "--color-line-strong": "#d6d1c8",
  "--color-accent": "#1f7a5c",
  "--color-accent-bright": "#27956f",
  "--color-accent-fill": "#1f7a5c",
  "--color-accent-soft": "#e6f4ee",
  "--color-amber": "#d97706",
  "--color-amber-soft": "#b45309",
  "--color-map-outline": "#161a1d",
  "--color-map-halo": "#ffffff",
  "--color-map-hatch": "rgba(22, 26, 29, 0.55)",
};

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

/** `#1f7a5c` at an alpha, for an area fill (the accent at 18 %); a non-hex colour is returned as it is. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The colours a chart needs, read once per render: gridlines on the line token (drawn dashed), axis text muted, the area fill the accent at 18 %. */
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
    font: "var(--font-inter), Inter, system-ui, sans-serif",
  };
}

/** The colours drawn on the light basemap (map/layers.ts). */
export function mapTheme() {
  return {
    outline: cssVar("--color-map-outline"),
    halo: cssVar("--color-map-halo"),
    hatch: cssVar("--color-map-hatch"),
    hover: cssVar("--color-accent-fill"),
    selected: cssVar("--color-amber"),
    space: cssVar("--color-ground"),
  };
}
