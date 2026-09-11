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
    { id: "shared", label: "What matters for both?" },
    { id: "sensitivity", label: "How certain is it?" },
  ],
  settings: {
    view: "Sector grouping",
    viewIpcc: "IPCC sectors",
    viewEconomic: "Economic sectors",
    viewIpccTitle: "Each sector is the module that computed it: industry is direct industrial fuel use (1.A.2), captive generation sits in power, cement process CO\u2082 in IPPU.",
    viewEconomicTitle: "The same sources regrouped by what the IPCC code says the activity is: industrial = 1.A.2 fuel use including captive generation, plus the 2.x process categories. Covered direct industrial sources only.",
    eyebrow: "Analysis settings",
    geography: "Geography",
    metric: "Metric",
    from: "From",
    to: "To",
    reset: "Reset",
    allGases: "All gases (CO₂e)",
  },
  change: {
    title: "How the total changed",
    plainLanguage: "In plain language",
    sectorContributions: "Sector contributions",
    selectHint: "Select any bar to explain that sector.",
    overallBack: "‹ Overall change",
    loading: "Comparing the two years…",
    download: "Download chart",
    keyFinding: "Key finding",
    overallChange: "Overall change",
    largestOffset: "Largest offset",
    back: "‹ All sectors",
    caution: "Small year-to-year shifts should be interpreted with caution.",
    // 2026-09-11 (words only, no number). The server's own limitation strings are preferred once the
    // next release payload carries them; these are the same wording until then.
    industryCaveat: "Covered industrial-combustion emissions fell, reflecting lower recorded fuel use. This does not mean Pakistan's total industrial emissions declined; several industrial sources are reported elsewhere or remain outside the inventory. The estimated decline is strongly influenced by the official industrial-coal series, whose magnitude has not yet been independently reconciled with production and fuel-supply evidence and should not be interpreted as a verified reduction from mitigation or efficiency improvements.",
    economicNote: "The economic-sector view regroups the same sources by what the IPCC code says the activity is: industrial = manufacturing fuel use (including captive generation, which the power module computes) plus the industrial process categories. It is additive with the IPCC view. Its industrial aggregate covers direct industrial sources only: cement, ammonia, iron and steel and lubricant use are inside it as nine-year series; nitric acid (a pair), HFCs, lime, glass, soda ash and industrial wastewater are screened or absent and are not; each enters only as a full 2015\u201316 to 2023\u201324 series, never in the latest year alone.",
  },
  explainer: {
    mainContributor: "Main contributor",
    itsChange: "Its change",
    envelopeRow: "Estimate envelope",
    footer: "Attribution to activity or emission factors needs year-by-year activity data the release does not yet publish; this card says where the change sits.",
    methods: "View sources and method",
  },
  shared: {
    eyebrow: "Climate + clean air",
    title: "Which sources matter for both?",
    teaser: "See how different sectors contribute to the change in emissions and to current levels, and identify candidates for climate and clean-air co-benefits.",
    cta: "Explore co-benefits",
    hide: "Hide source contributions",
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
    teaser: "Test how sensitive the result is to alternative assumptions, data sources, and methodological choices.",
    cta: "Explore robustness",
    hide: "Hide robustness detail",
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

/**
 * A COARSE VERBAL BAND for the ratio of two server values - the same idea as the
 * server's own share_phrase ("nearly half"): words wide enough to invent no
 * precision, never a computed digit.
 */
export function fractionWords(part: number, total: number): string | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total === 0) return null;
  const r = Math.abs(part) / Math.abs(total);
  if (r >= 1.05) return "more than the whole";
  if (r >= 0.9) return "almost all";
  if (r >= 0.78) return "nearly four-fifths";
  if (r >= 0.7) return "about three-quarters";
  if (r >= 0.6) return "nearly two-thirds";
  if (r >= 0.45) return "about half";
  if (r >= 0.28) return "about a third";
  if (r >= 0.18) return "about a quarter";
  return null;
}

/** A label lowercased for mid-sentence use, leaving acronyms (IPPU) alone. */
export function midSentence(label: string): string {
  if (/^[A-Z]{2,}/.test(label)) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** "power, IPPU and waste" - an English list of mid-sentence names. */
export function nameList(labels: string[]): string {
  const l = labels.map(midSentence);
  if (l.length <= 1) return l[0] ?? "";
  return `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`;
}
