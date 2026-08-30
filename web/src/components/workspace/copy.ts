/**
 * The words of the workspace shell (the deck header, the scope chips, the filter panel, the
 * legend capsule and Map settings), in one place so the panels never drift. No number is
 * written here: every figure on the workspace is an envelope's string, and every label of a
 * sector, gas, period, configuration or view comes from the release's own labels.
 */

/** The deck's header card: "INSIGHTS · PAKISTAN" (the place is the release's label, upper-cased). */
export const DECK_TITLE = (place: string) => `Insights · ${place}`.toUpperCase();
export const DECK_COLLAPSE = "Collapse the insights";
export const DECK_EXPAND = "Show the insights";

/** The scope chips: what each chip clears back to, said in words. */
export const CHIPS = {
  label: "Current scope",
  clear: (what: string) => `Clear ${what}`,
  sector: "the sector",
  gas: "the gas",
  year: "the year",
} as const;

/** The filter panel. */
export const FILTERS = {
  title: "Filters",
  level: "Level",
  provinces: "Provinces",
  districts: "Districts",
  sector: "Sector",
  gas: "Gas / metric",
  year: "Year",
  reset: "Reset filters",
  collapse: "Collapse the filters",
  expand: "Show the filters",
  showing: "Showing",
  open: "Filters",
  /** A year the release answers nationally but does not map, and which year the map does show. */
  nationalOnly: "Answered nationally",
  mappedYear: (reference: string) => `the map shows ${reference}`,
  asking: "asking the release about this year…",
} as const;

/**
 * The legend capsule's faces. Three for the magnitude layer, one per scale mode; one that
 * names a categorical layer and opens its own panel; and one that carries the release's typed
 * refusal when the year is not mapped. `bands` counts the legend's own rows, not anything of
 * the release's; no other number is written here.
 */
export const LEGEND = {
  label: "Map shading",
  relative: "Relative",
  fixed: "Fixed",
  absolute: "Absolute",
  lower: "Lower",
  higher: "Higher",
  bands: (n: number) => `${n} ${n === 1 ? "band" : "bands"}`,
  relativeNote: "Quantile bands within the current view; exact values on hover and in the cards.",
  fixedNote: "The scale is locked to the reference year's whole map, so choosing a sector or a gas moves the colours without moving the scale.",
  absoluteNote: "The scale follows the places now in view; the breaks are the release's own printed values.",
  notMapped: "Not mapped",
  asking: "asking the release about this year…",
  open: "What the colours mean",
  close: "Close the legend",
} as const;

/** Map settings: the pill, the display choices it owns and the sections that left the filter panel. */
export const SETTINGS = {
  title: "Map settings",
  layer: "Map layer",
  scale: "Scale",
  opacity: "Shading opacity",
  raster: "Grid raster (visual only)",
  basemap: "Basemap",
  boundaries: "Boundaries",
  boundariesNote: "Show the province and district outlines",
  month: "Month",
  monthAll: "The whole year",
  estimate: "Estimate",
  gwp: "Warming potentials",
  view: "Spatial view",
  close: "Close the map settings",
} as const;

/** One line saying what each scale mode does, under its name in Map settings. */
export const SCALE_NOTES: Record<"relative" | "fixed" | "absolute", { label: string; note: string }> = {
  relative: { label: LEGEND.relative, note: "Rank the places now in view against one another." },
  fixed: { label: LEGEND.fixed, note: "Lock the scale to the reference year's whole map." },
  absolute: { label: LEGEND.absolute, note: "Scale by value against the places now in view." },
};

/** The map's own buttons, bottom-right. */
export const MAP_BUTTONS = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  locate: "Frame Pakistan",
  fullscreen: "Full screen",
  exitFullscreen: "Leave full screen",
} as const;
