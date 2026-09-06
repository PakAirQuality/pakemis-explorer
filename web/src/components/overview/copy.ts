/**
 * The words of the public Overview (the country briefing) and of the Methods page, in one
 * place so the two never drift: the release's short summary (paper_national/short_summary.txt,
 * verbatim), the Ask dock's own empty-state sentences, the explore / open terms the
 * introduction used, and the briefing's fixed copy (eyebrow, header actions, deck pills, section
 * ids, widget titles).
 * No number is written here; every figure on the Overview is an envelope's string. Tone rule
 * for every sentence: the period first, numbers bold, present-tense facts, no adjective
 * beyond estimated / reconstructed / allocated.
 */

/** The opening paragraph of the release's short summary, verbatim but for its opening noun phrase, which named the dataset (the name belongs to the citation, not to the chrome); /methods quotes it. */
export const SHORT_SUMMARY =
  "This is an open dataset of Pakistan's greenhouse-gas emissions, rebuilt from public documents rather than taken from a single official report. It covers nine fiscal years, every sector except land use and forestry, and gives each emission by month and by district as well as by year. Every number is graded by the strength of the evidence behind it, and every one can be traced back to the document and the code that produced it, so others can check, reuse and improve it.";

/** The Ask dock's own empty-state sentences (AskDock.tsx), quoted by /methods so the two never drift. */
export const ASK_SENTENCES = [
  "Ask about a place, a sector, a year or a method. The agent can only call the release's typed functions; every number it says is a placeholder the server fills from an envelope with a receipt, and a scope the release cannot answer is refused by name.",
  "Tool calls, results and refusals are shown as they happen. Click a cited number to see the call it came from.",
] as const;

/** The four dimensions the dataset can be explored along. */
export const EXPLORE_TERMS = [
  ["Geography", "National, provincial, district and gridded views"],
  ["Time", "Annual and monthly estimates"],
  ["Sector", "Compare emissions across sectors and gases"],
  ["Sources", "Trace estimates back to the underlying records"],
] as const;

/** The four things the release publishes. */
export const OPEN_TERMS = [
  ["Data", "Tables can be downloaded in machine-readable formats."],
  ["Sources", "Estimates retain links to the records from which they were derived."],
  ["Methods", "Harmonisation rules, emission factors and assumptions are documented."],
  ["Code", "The processing pipeline used to build each release is public."],
] as const;

export const QUERY_CLOSING = "Queries do not create a separate dataset; they provide another way to inspect the published estimates.";
export const VERSIONED_LINE = "Releases are versioned so that published results can be reproduced.";


/** The place card: the eyebrow, the dek, the country, the province select and the utility row. */
export const HEADER = {
  eyebrow: "Pakistan Emissions Explorer",
  dek: "Explore emissions by place, sector and year.",
  country: "Pakistan",
  reset: "Reset map",
  selectProvince: "Select a province",
  allProvinces: "All provinces",
  share: "Share",
  shared: "Link copied",
  download: "Download",
} as const;

/** The deck controls: the section count (a count of cards, never a data number) and the collapse-all toggle. */
export const DECK = {
  sections: (n: number) => `Sections (${n})`,
  collapseAll: "Collapse all sections",
  expandAll: "Expand all sections",
  collapseAllShort: "Collapse all",
  expandAllShort: "Expand all",
} as const;

/** The muted line under the opening statement, and the footer's. */
export const INDEPENDENT_LINE = "This is an independent public-data reconstruction, not an official inventory; every figure carries its method, evidence grade and source.";

/**
 * The insight cards' titles. The default is the card's own; a scope that reads better with its
 * own words overrides it under "{scope}.{card}". One rule per card — what is selected · what
 * explains it · how it compares — so a title says what the card answers, never what it holds.
 * Which cards a scope shows is workspace/cards.ts; these are only their words.
 */
export const CARD_TITLES: Record<string, string> = {
  snapshot: "Overview",
  sectors: "Emission sources",
  categories: "Category breakdown",
  trend: "Change over time",
  places: "Spatial distribution",
  composition: "Composition",
  peers: "Peer comparison",
  placement: "Spatial placement",
  evidence: "Evidence",
  sources: "Sources",
  "national.snapshot": "National overview",
  "sector.snapshot": "Sector overview",
  "gas.snapshot": "Gas overview",
  "gas.sectors": "Contributing sectors",
  "province.snapshot": "Province overview",
  "district.snapshot": "District overview",
};

/** The title of a card in a scope: the scope's own words where it has them, else the card's. */
export function cardTitle(scopeKind: string, card: string): string {
  return CARD_TITLES[`${scopeKind}.${card}`] ?? CARD_TITLES[card] ?? card;
}

/** The words the snapshot uses for a value's standing in its partition. */
export const SNAPSHOT = {
  /** "49.4 % from agriculture": the saffron chip on the national snapshot. */
  from: (share: string, what: string) => `${share} % from ${what}`,
  /** The share and rank a partition gives a selected value; both are the server's own strings. */
  rankOf: (rank: string, n: string, what: string) => `${rank} of ${n} ${what}`,
} as const;

/** The words the two district cards use for the release's placement vocabulary. */
export const EVIDENCE = {
  fields: "Spatial evidence of this district",
  lineage: "Allocation status of the lineage rows",
  fallbacks: "Fallbacks and absences",
  classes: "Spatial placement classes",
  none: "The served envelope carries no spatial-evidence fields for this cell.",
  class: "Class",
  basis: "Basis",
  stream: "Dominant stream",
  placement: "Placement",
  allocation: "Allocation",
} as const;

export const SOURCES = {
  lineage: "Lineage rows",
  product: "Product and tables",
  release: "Release",
  noTables: "The envelope lists no tables.",
  releaseLine: "The served release, its manifest digests and the citation are on",
} as const;

/** The peers card's own line: the selected place is marked in the ranking, never re-ordered here. */
export const PEERS = { selected: "the selection", provinces: "provinces", districts: "districts in the same province" } as const;

/** The gas ids as words for running text (a naming dictionary, like COLUMN_NAMES; the release's labels give the formulae). */
export const GAS_WORDS: Record<string, string> = { CH4: "Methane", CO2: "Carbon dioxide", N2O: "Nitrous oxide" };

export const LINKS = {
  openMap: "Show it on the map →",
  inventory: "Explore the inventory →",
  details: "Result details",
  claim: "Claim record",
} as const;

export const FOOTER = { product: "A Pakistan Air Quality Initiative product", repository: "Repository", methods: "Methods & evidence", downloads: "Downloads", api: "API" } as const;

/**
 * The deck's footer in one line, from the release's own licence fields: "Data/text CC-BY-4.0 ·
 * code MIT · OSM data ODbL". The identifiers are the release's strings, never hard-coded here,
 * so a release that changes a licence changes this line.
 */
export function licenceLine(l: { data_and_text: string; code: string; odbl_carveouts: readonly unknown[] }): string {
  return [l.data_and_text ? `Data/text ${l.data_and_text}` : "", l.code ? `code ${l.code}` : "", l.odbl_carveouts.length ? "OSM data ODbL" : ""].filter(Boolean).join(" · ");
}
