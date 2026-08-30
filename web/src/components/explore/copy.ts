/**
 * The words of the Explore page, from the 2026-08-30 mockups. No number is written here: every
 * figure on the page is an envelope's string.
 */

export const EXPLORE = {
  title: "Explore the inventory",
  dek: "Build a clear national result, compare sectors and inspect the exact data behind every value.",
  ask: "Ask about this view",
  /** What follows the Showing sentence in the seeded question. */
  askSuffix: "Explain this view.",
  controls: { period: "Period", by: "Break down by", measure: "Measure", sector: "Sector", more: "More settings", estimate: "Estimate", gwp: "Warming potentials", view: "Spatial view" },
  measure: "CO₂-equivalent",
  stats: {
    national: { label: "National estimate", caption: "Land-use change is excluded" },
    largestSector: "Largest sector",
    largestCategory: "Largest category",
    interval: { label: "95% uncertainty interval", caption: "Structural alternatives shown separately" },
  },
  result: {
    unitLine: "Million tonnes CO₂-equivalent",
    selectSector: "Select the sector to examine its categories, evidence and sources.",
    showCalculation: "Show calculation",
    inspectEvidence: "Inspect evidence",
    download: "Download these rows",
  },
  interpret: {
    title: "Interpret this result",
    dek: "Important context before reuse",
    notOfficial: { label: "Not an official inventory", text: "PakEmis independently reconstructs emissions from public activity data." },
    ne: { label: "Not estimated is not zero", text: "Categories without adequate activity data remain explicitly marked NE." },
    exact: { label: "Exact result available", text: "Every value can expose its data rows, calculation, release and query receipt." },
  },
} as const;
