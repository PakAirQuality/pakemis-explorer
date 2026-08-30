/**
 * The Map page's dark chrome: the theme's tokens re-valued on the page's wrapper (Tailwind's
 * utilities read `var(--color-*)`, so the nav, the filter panel, the timeline and the legend
 * turn dark without a second stylesheet), and the light values restored on the drawer, whose
 * charts read the root tokens. The map itself stays the light streets-v12 basemap; the
 * Mapbox layer colours are read from the document root (lib/theme.ts), not from here.
 */
import type { CSSProperties } from "react";
import { FALLBACK } from "@/lib/theme";

/** The page's title: the map shows allocated emissions, never bare "emissions". */
export const MAP_PAGE_TITLE = "Map allocated emissions";

export const DARK_CHROME = {
  "--color-ground": "#14181c",
  "--color-card": "#1c2126",
  "--color-surface": "#14181c",
  "--color-surface-2": "#1c2126",
  "--color-surface-3": "#262c33",
  "--color-fg": "#eef1f4",
  "--color-muted": "#9aa5b1",
  "--color-line": "#2b323a",
  "--color-line-strong": "#3a424b",
  "--color-accent": "#5cc39a",
  "--color-accent-bright": "#7ad4ae",
  "--color-accent-fill": "#1f7a5c",
  "--color-on-accent": "#ffffff",
  "--color-accent-soft": "rgba(92, 195, 154, 0.16)",
  "--color-note-bg": "#2a2410",
  "--color-note-border": "#6b5416",
  "--color-note-text": "#f0c36d",
  "--color-refusal": "#2d1c17",
  "--color-warn": "#f0a06a",
  "--color-amber": "#f59e0b",
  "--color-panel": "rgba(28, 33, 38, 0.92)",
  colorScheme: "dark",
} as CSSProperties;

/** The light tokens, for the drawer inside the dark page. */
export const LIGHT_CHROME = {
  ...Object.fromEntries(Object.entries(FALLBACK).filter(([k]) => !k.startsWith("--color-map"))),
  "--color-on-accent": "#ffffff",
  "--color-note-bg": "#fff8e6",
  "--color-note-border": "#f0c36d",
  "--color-note-text": "#7a4b00",
  "--color-refusal": "#fff1ec",
  "--color-warn": "#9a4a0c",
  "--color-panel": "rgba(255, 255, 255, 0.9)",
  colorScheme: "light",
} as CSSProperties;
