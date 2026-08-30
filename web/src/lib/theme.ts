/**
 * The theme as JavaScript reads it: the CSS variables of globals.css' `@theme` block (Tailwind
 * emits them on :root), read at render so ECharts (TrendChart, BarChart, the briefing's
 * charts) and the Mapbox layer stack (map/layers.ts) follow the theme without carrying a
 * literal colour. Each read has the token's own value as its fallback for environments
 * without a stylesheet (tests, the export build). Colours size nothing and print nothing.
 */
export const FALLBACK: Record<string, string> = {
  "--color-ground": "#f9fafb",
  "--color-card": "#ffffff",
  "--color-surface": "#f9fafb",
  "--color-surface-2": "#ffffff",
  "--color-surface-3": "#f3f3f5",
  "--color-fg": "#030213",
  "--color-muted": "#717182",
  "--color-line": "#e5e7eb",
  "--color-line-strong": "#d1d5db",
  "--color-accent": "#2563eb",
  "--color-accent-bright": "#1d4ed8",
  "--color-accent-fill": "#2563eb",
  "--color-accent-soft": "rgba(59, 130, 246, 0.08)",
  "--color-brand-gold": "#ffbb12",
  "--color-amber": "#d97706",
  "--color-amber-soft": "#b45309",
  "--color-map-outline": "#1e293b",
  "--color-map-halo": "#ffffff",
  "--color-map-hatch": "rgba(30, 41, 59, 0.55)",
  "--color-map-hover": "#334155",
  "--color-map-selected": "#0f172a",
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

/** `#2563eb` at an alpha, for an area fill (the accent at 18 %); a non-hex colour is returned as it is. */
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
    font: UI_FONT,
  };
}

/** The colours drawn on the light basemap (map/layers.ts): dark slate strokes, legible on the YlOrRd ramp. */
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
