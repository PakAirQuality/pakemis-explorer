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
} as const;

/** The legend capsule: the default relative face and what its ⓘ says. */
export const LEGEND = {
  mode: "Relative",
  lower: "Lower",
  higher: "Higher",
  note: "Shading ranks the places in view against one another; exact values are in the cards and on hover.",
  label: "Map shading",
} as const;

/** Map settings: the pill and the sections that left the filter panel. */
export const SETTINGS = {
  title: "Map settings",
  estimate: "Estimate",
  gwp: "Warming potentials",
  view: "Spatial view",
  layer: "Map layer",
  opacity: "Shading opacity",
  raster: "Grid raster (visual only)",
  close: "Close the map settings",
} as const;

/** The map's own buttons, bottom-right. */
export const MAP_BUTTONS = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  locate: "Frame Pakistan",
  fullscreen: "Full screen",
  exitFullscreen: "Leave full screen",
} as const;
