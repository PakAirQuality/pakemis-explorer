/**
 * The words of the Analyze page - PLAIN LANGUAGE FIRST (round 2): every dek says how
 * to read its chart in ordinary words, and the precise inventory caveats live in each
 * card's "More about this analysis" line, not in the reader's way. No number is
 * written here: every figure on the page is an envelope's own string, and the finding
 * sentences are templates the sections fill with server strings - never arithmetic.
 */
export const ANALYZE = {
  title: "Analyze",
  dek: "Three questions the map alone cannot answer: what drove the change, which sources matter for climate and clean air at once, and whether the conclusion survives the assumptions.",
  moreLabel: "More about this analysis",
  questions: [
    { id: "change", label: "What changed?" },
    { id: "shared", label: "Climate and clean air" },
    { id: "sensitivity", label: "Does it hold?" },
  ],
  change: {
    title: "What drove the change",
    dek: "Pick two years. The chart walks from the first year's total to the second, one source at a time — a dark bar pushed emissions up, a gold bar pulled them down, and the steps add up exactly to the difference between the totals. Click a bar to see what happened inside that source; the map beside you follows it.",
    from: "From",
    to: "To",
    back: "‹ All sectors",
    caution: "A caution: the uncertainty around any single year's total is wider than most year-to-year moves, so read this chart as where the change sits, not as a precise measurement of each small step. The direction of the big multi-year moves is robust.",
    more: "Each step is the exact difference between the source's two annual totals, computed by the release's own compare function — the steps sum to the change in the national total by construction. Steps are contributions to change, not attributions to activity, technology or efficiency: separating those needs year-by-year activity data the release does not yet publish. The release's longitudinal uncertainty statement applies to every pair of years.",
  },
  shared: {
    title: "Sources that matter for climate and clean air",
    dek: "Some sources matter mostly for the climate, some mostly for the air people breathe, and a few matter for both. Each column ranks the sources for one thing — the CO₂e total, or one pollutant — and a cell shows the source's share of that column's total. Darker means a bigger share. An NE cell means the release has not estimated that source's air emissions: missing evidence, not zero.",
    matrix: "Share of each covered total",
    scatter: "Climate share against air share",
    scatterDek: "Each dot is a sector: far to the right means a big share of climate emissions, high up means a big share of the chosen pollutant. Dots toward the top-right corner matter for both goals at once.",
    ne: "NE",
    neTitle: "Not estimated — the release carries no air layer for this source. The absence-screening ledger prices what the gap plausibly holds (scenario ends, published beside the panel, never added into it).",
    more: "Every column has its own denominator: the CO₂e column's shares sum over the ten sectors, each pollutant's shares sum over its own covered sectors only, so shares are never comparable across columns — only within one. Black carbon and PM₂.₅ stay separate columns and are never added together. Shared shares identify candidates for intervention research; the actual co-benefit of any measure depends on the measure.",
  },
  sensitivity: {
    title: "Does the conclusion hold under the assumptions",
    dek: "The release estimates emissions two ways — the reference way (L), and a re-run of household energy on survey data (S). A source that keeps its rank both ways is a sturdy conclusion. The bands below show how far each big category's estimate could reasonably move under the release's stated uncertainty.",
    configs: "Reference (L) against survey-based (S), reference year",
    envelopes: "How far could each estimate move",
    envelopesDek: "The dark tick is the published estimate; the band is the release's stated envelope around it. A wide band means a weakly constrained estimate.",
    more: "L and S are the release's two queryable configurations; scenario endpoints beyond them live in the release's ledgers (screenings, completeness-mass bounds) and are endpoints, not distributions. The category bands are structural envelopes — no probability attaches to any point inside one, and rankings are each envelope's own server-computed ranks, never re-derived here.",
  },
} as const;
