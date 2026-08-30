/**
 * The theme as JavaScript reads it: the CSS variables of globals.css' `@theme` block (Tailwind
 * emits them on :root), read at render so ECharts (TrendChart, BarChart) and the Mapbox layer
 * stack (map/layers.ts) follow the theme without carrying a literal colour. Each read has the
 * token's own value as its fallback for environments without a stylesheet (tests, the export
 * build). Colours size nothing and print nothing.
 */
export const FALLBACK: Record<string, string> = {
  "--color-surface": "#0b0d10",
  "--color-surface-2": "#12161b",
  "--color-surface-3": "#181d23",
  "--color-fg": "#e8ecf1",
  "--color-muted": "#9aa4b2",
  "--color-line": "rgba(255, 255, 255, 0.08)",
  "--color-line-strong": "rgba(255, 255, 255, 0.16)",
  "--color-accent": "#34d399",
  "--color-accent-bright": "#4ade80",
  "--color-accent-fill": "#1f6f4a",
  "--color-accent-soft": "rgba(52, 211, 153, 0.14)",
  "--color-amber": "#f59e0b",
  "--color-amber-soft": "#fbbf24",
  "--color-map-outline": "#1b2430",
  "--color-map-halo": "#ffffff",
  "--color-map-hatch": "rgba(27, 36, 48, 0.55)",
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

/** The colours a chart needs, read once per render. */
export function chartTheme() {
  return {
    surface: cssVar("--color-surface-2"),
    fg: cssVar("--color-fg"),
    muted: cssVar("--color-muted"),
    line: cssVar("--color-line-strong"),
    grid: cssVar("--color-line"),
    accent: cssVar("--color-accent-bright"),
    accentSoft: cssVar("--color-accent-soft"),
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
    space: cssVar("--color-surface"),
  };
}
