/**
 * The words of the Analyze page. No number is written here: every figure on the page is an
 * envelope's own string, and the finding sentences are templates the sections fill with
 * server strings (names, display_short, share_pct_short, ranks) — never with arithmetic.
 */
export const ANALYZE = {
  title: "Analyze",
  dek: "Explain what changed, find sources that matter for climate and clean air at once, and test whether the conclusion survives the assumptions.",
  questions: [
    { id: "change", label: "What changed?" },
    { id: "shared", label: "Climate and clean air" },
    { id: "sensitivity", label: "Does it hold?" },
  ],
  change: {
    title: "What changed, and which sources did it",
    dek: "Two years compared: each step is one source's contribution to the difference between the totals. Click a step to open it.",
    from: "From",
    to: "To",
    back: "‹ All sectors",
    limitationNote: "Year-on-year differences are smaller than the estimate's uncertainty for most pairs; treat single steps as composition, not as resolved trends.",
  },
  shared: {
    title: "Sources that matter for climate and clean air",
    dek: "Each column is its own covered total; a cell is that source's share of it. An NE cell is a typed absence, not a zero — the screening ledger prices what it plausibly holds.",
    matrix: "Share of each covered total",
    scatter: "Climate share against air share",
    scatterDek: "One point per sector: its share of the CO₂e total against its share of the chosen pollutant's covered total.",
    ne: "NE",
    neTitle: "Typed absence — no air layer is estimated for this source; the absence-screening ledger ships scenario ends beside the panel, never inside it.",
    subrowNote: "Sub-rows are shares of the sector's own covered total for that column.",
  },
  sensitivity: {
    title: "Does the conclusion hold under the assumptions",
    dek: "The reference estimate beside the survey-based configuration, and each category's published envelope. Scenario endpoints, never probabilities.",
    configs: "Reference (L) against survey-based (S) — the release's two queryable configurations, reference year",
    envelopes: "The categories' published envelopes",
    envelopesDek: "Structural envelopes around each category's estimate (no probability attaches); the joint table's own bounds.",
  },
} as const;
