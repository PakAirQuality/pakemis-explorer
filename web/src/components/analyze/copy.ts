/**
 * The words of the Analyze page (round 3, the mockup layout). PLAIN LANGUAGE FIRST:
 * the hero says what the page is for, every card teaches its own chart, and the
 * precise inventory caveats live behind "More about this analysis". No number is
 * written here: every figure is an envelope's own string, and findings are templates
 * the cards fill with server strings - never arithmetic.
 */
export const ANALYZE = {
  title: "Analyze",
  dek: "Understand what changed, which sources matter, and how robust the result is.",
  moreLabel: "More about this analysis",
  questions: [
    { id: "change", label: "What changed?" },
    { id: "shared", label: "Climate and clean air" },
    { id: "sensitivity", label: "Does it hold?" },
  ],
  settings: {
    eyebrow: "Analysis settings",
    geography: "Geography",
    metric: "Metric",
    from: "From",
    to: "To",
    reset: "Reset",
    allGases: "All gases (CO₂e)",
  },
  change: {
    eyebrow: "What changed",
    title: "What drove the change",
    download: "Download chart",
    keyFinding: "Key finding",
    overallChange: "Overall change",
    largestOffset: "Largest offset",
    back: "‹ All sectors",
    caution: "Read the chart as a guide to where the change sits; small year-to-year movements remain uncertain.",
    more: "Each bar is the exact difference between that source's totals in the two chosen years, computed by the release's own compare function; the bars sum to the change in the national total by construction. A dark bar pushed emissions up, a gold bar pulled them down; click a bar to open the source. These are contributions to change, not attributions to activity, technology or efficiency - separating those needs year-by-year activity data the release does not yet publish. Air pollutants are not offered as the metric because the release serves no cross-year comparison for them yet.",
  },
  shared: {
    eyebrow: "Climate + clean air",
    title: "Which sources matter for both?",
    dekOf: (from: string, to: string) => `Selected sectors and their estimated contributions to the ${from} to ${to} change (Mt CO₂e).`,
    tagBoth: "both",
    tagClimate: "climate",
    tagAir: "air quality",
    matrixLabel: "Full matrix: share of each covered total",
    scatter: "Climate share against air share",
    scatterDek: "Each dot is a sector: far to the right means a big share of climate emissions, high up means a big share of the chosen pollutant. Dots toward the top-right corner matter for both goals at once.",
    ne: "NE",
    neTitle: "Not estimated - the release carries no air layer for this source. The absence-screening ledger prices what the gap plausibly holds (scenario ends, published beside the panel, never added into it).",
    more: "A source is tagged \"climate\" when it carries at least 5 % of the CO₂e total in the To year, \"air quality\" when it carries at least 5 % of any pollutant's covered total, and \"both\" when both hold. Every column of the full matrix has its own denominator - shares are never comparable across columns, only within one - and black carbon and PM₂.₅ are never added together. An NE cell is missing evidence, not zero. Shared sources identify candidates for intervention research; the actual co-benefit of any measure depends on the measure.",
  },
  sensitivity: {
    eyebrow: "Robustness",
    title: "Does the conclusion hold?",
    dek: "Estimated overall change with uncertainty range (Mt CO₂e).",
    robust: "Direction is robust",
    uncertain: "Direction is uncertain",
    noPair: "No uncertainty interval is served for this pair of years - the release prices adjacent years and the full 2015–16 to 2023–24 span.",
    configs: "Reference (L) against survey-based (S), reference year",
    envelopes: "How far could each estimate move",
    envelopesDek: "The tick is the published estimate; the band is the release's stated envelope around it.",
    more: "The range is the release's own joint-draw interval for this pair of years under the typed-parameter correlation scenario; the other two scenarios (time-correlated, time-independent) are listed below, and \"robust\" means every scenario's interval keeps the same sign as the central estimate. L and S are the release's two queryable configurations; the category bands are structural envelopes with no probability attached, and rankings are each envelope's own server-computed ranks.",
  },
} as const;
