/**
 * The words of the workspace shell (the deck header, the scope chips, the filter panel, the
 * legend capsule and Map settings), in one place so the panels never drift. No number is
 * written here: every figure on the workspace is an envelope's string, and every label of a
 * sector, gas, period, configuration or view comes from the release's own labels.
 */
import type { MapFailure } from "@/components/map/ExplorerMap";

/** The deck's section bar: what the cards below actually hold - how emissions move over time. */
export const DECK_TITLE = "Emissions trends".toUpperCase();
export const DECK_COLLAPSE = "Collapse the insights";
export const DECK_EXPAND = "Show the insights";

/**
 * The pane switch the nav capsule carries under 1280 px, where one pane shows at a time: the
 * insight deck, or the map. Two words, each naming what it shows.
 */
export const PANES = {
  label: "Pane",
  dashboard: "Dashboard",
  map: "Map",
} as const;

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
  // said when NOTHING is being asked: at grid level off the reference year no request exists, and
  // "asking the release…" stood there for good
  gridReferenceOnly: "The grid layer is drawn for the reference year only; provinces and districts are mapped for every year.",
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

/**
 * What stands in the map's place when it cannot be drawn: one sentence saying so and where the
 * same estimates are, the link that carries the selection there, and a retry that is offered a
 * bounded number of times and only for a failure another attempt could cure. The /data canvas
 * says the same sentence over its own chart and offers its two other representations.
 */
export const MAP_FAILURE = {
  /** The browser's own failure, and the sentence for a map that gave no reason; MAP_FAILURE_EXPLANATION has one per reason. */
  explanation: "The map could not load in this browser. You can explore the same estimates in the table or chart.",
  alternative: "Open the table and chart",
  retry: "Try again",
  retrying: "Trying again…",
  chart: "Show the chart",
  table: "Show the table",
} as const;

/** Where the same figures are: the second sentence of every explanation below, whatever the first one says. */
const ELSEWHERE = "You can explore the same estimates in the table or chart.";

/**
 * The sentence for each way the map can fail (map/ExplorerMap.tsx `MapFailure`). Each one says
 * only what is known to be true of that failure, in a reader's words:
 *
 *  · `unsupported`, `webgl` — the browser would not draw it. "In this browser" is the fact, and
 *    the reader's own remedy (another browser, or hardware acceleration) follows from it. A
 *    context the browser took away reads the same.
 *  · `token` — the map service does not serve this address. Nothing about the reader's browser
 *    is wrong and nothing they can do here will change it, so the sentence blames neither and
 *    offers no retry; "in this browser" would send them off to fix something that is not broken.
 *  · `library`, `style` — part of the map was asked for and did not come. It did not finish;
 *    whether the cause was the line or the server is not known, so neither is named.
 *  · `timeout` — nothing was refused; the map is still being waited for and may yet arrive, which
 *    is why this one is in the present tense.
 */
export const MAP_FAILURE_EXPLANATION: Record<MapFailure, string> = {
  unsupported: MAP_FAILURE.explanation,
  webgl: MAP_FAILURE.explanation,
  token: `The map is not available on this address. ${ELSEWHERE}`,
  library: `The map did not finish loading. ${ELSEWHERE}`,
  style: `The map did not finish loading. ${ELSEWHERE}`,
  timeout: `The map is taking too long to load. ${ELSEWHERE}`,
};
