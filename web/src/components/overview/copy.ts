/**
 * The words of the public Overview (the country briefing) and of the Methods page, in one
 * place so the two never drift: the release's short summary (paper_national/short_summary.txt,
 * verbatim), the Ask dock's own empty-state sentences, the explore / open terms the
 * introduction used, and the briefing's fixed copy (eyebrow, tabs, widget titles).
 * No number is written here; every figure on the Overview is an envelope's string. Tone rule
 * for every sentence: the period first, numbers bold, present-tense facts, no adjective
 * beyond estimated / reconstructed / allocated.
 */

/** The opening paragraph of the release's short summary, verbatim; /methods quotes it. */
export const SHORT_SUMMARY =
  "PakEmis is an open dataset of Pakistan's greenhouse-gas emissions, rebuilt from public documents rather than taken from a single official report. It covers nine fiscal years, every sector except land use and forestry, and gives each emission by month and by district as well as by year. Every number is graded by the strength of the evidence behind it, and every one can be traced back to the document and the code that produced it, so others can check, reuse and improve it.";

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

/** Where "View methodology" goes: the methods section of /methods. */
export const METHODS_HREF = "/methods#methods";

/** The header block. */
export const HEADER = {
  eyebrow: "Pakistan's explainable emissions inventory",
  country: "Pakistan",
  selectProvince: "Select a province",
  allProvinces: "Pakistan (all provinces)",
  share: "Share",
  shared: "Link copied",
  download: "Download",
} as const;

/** The muted line under the opening statement, and the footer's. */
export const INDEPENDENT_LINE = "PakEmis is an independent public-data reconstruction, not an official inventory; every figure carries its method, evidence grade and source.";

/** The anchor tabs, in order. */
export const TABS = [
  ["summary", "Summary"],
  ["sectors", "Sectors"],
  ["trend", "Trend"],
  ["gases", "Gases"],
  ["places", "Places"],
] as const;
export type TabId = (typeof TABS)[number][0];

/** The widget titles (small caps); the place is appended where the widget re-scopes. */
export const WIDGETS = {
  sectors: "Emissions by sector",
  trend: "Emissions over time",
  gases: "Emissions by gas",
  places: "Where emissions are placed",
} as const;

/** The gas ids as words for running text (a naming dictionary, like COLUMN_NAMES; the release's labels give the formulae). */
export const GAS_WORDS: Record<string, string> = { CH4: "Methane", CO2: "Carbon dioxide", N2O: "Nitrous oxide" };

export const LINKS = {
  openMap: "Open the map →",
} as const;

export const FOOTER = { product: "A Pakistan Air Quality Initiative product", repository: "Repository", methods: "Methods & evidence", downloads: "Downloads", api: "API" } as const;
