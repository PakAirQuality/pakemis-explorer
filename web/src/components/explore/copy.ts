/**
 * The words of the Explore page. No number is written here: every figure on the page is an
 * envelope's string.
 */

export const EXPLORE = {
  title: "Explore the inventory",
  dek: "Set the controls; the canvas answers with one query whose every value can show its rows, calculation and sources.",
  controls: {
    geography: "Geography",
    period: "Period",
    sector: "Sector",
    category: "Category",
    gas: "Gas",
    measure: "Measure",
    estimate: "Estimate",
    view: "Spatial view",
    more: "More",
    pakistan: "Pakistan",
    provinces: "Compare provinces",
    districts: "All districts",
    district: "A district…",
    second: "Compare with…",
    none: "—",
    range: "All years",
    months: "Months of",
    allSectors: "All sectors",
    wholeSector: "All of",
    allGases: "All gases",
    byGas: "By gas",
    co2e: "CO₂e",
    share: "Share of total",
    compare: "Compare estimates",
  },
  reps: { chart: "Chart", table: "Table", map: "Map" },
  question: "Explain this result",
  actions: { explain: "Explain", evidence: "Evidence", download: "Download", share: "Share", copied: "Link copied" },
  mapUnavailable: { error: "representation_unavailable", error_class: "RepresentationUnavailable", message: "Map is available for place breakdowns: choose Compare provinces, All districts or two provinces under Geography.", available_at: ["province", "district"] },
  reading: {
    title: "Reading this result",
    notOfficial: { label: "Not an official inventory", text: "This inventory independently reconstructs emissions from public activity data." },
    ne: { label: "Not estimated is not zero", text: "Categories without adequate activity data remain explicitly marked NE." },
    exact: { label: "Exact result available", text: "Every value can expose its data rows, calculation, release and query receipt." },
    filtered: "The two places are drawn from the envelope of every province; the other provinces are hidden, not removed from the receipt.",
  },
} as const;
