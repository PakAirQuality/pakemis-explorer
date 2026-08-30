/**
 * The words of the public Overview and of the Methods page, in one place so the two never
 * drift: the release's short summary (paper_national/short_summary.txt, verbatim), the Ask
 * dock's own empty-state sentences, the explore / open terms the introduction used, and the
 * Overview's hero, explainer and call-to-action copy from the 2026-08-30 mockups. No number
 * is written here; every figure on the Overview is an envelope's string.
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

/** The hero. */
export const HERO = {
  eyebrow: "Pakistan greenhouse-gas emissions",
  title: "Understand where emissions come from—and how certain we are.",
  dek: "Explore national, monthly and spatial estimates. Every result carries its method, evidence grade, uncertainty and source trail.",
} as const;

/** The national total card. */
export const TOTAL_CARD = {
  title: "Estimated national total",
  intervalLead: "Uncertainty interval: approximately",
} as const;

/** The question box. */
export const QUESTION = {
  placeholder: "Ask a question, such as “What is Pakistan’s largest source?”",
  button: "Ask PakEmis",
} as const;

/** The two figure cards. */
export const SECTORS_CARD = { title: "Where emissions come from", link: "View all sectors →", explain: "Select any sector for a plain-language explanation." } as const;
export const TREND_CARD = { title: "How emissions changed", link: "Explore trend →" } as const;

/** The three explainer cards. */
export const EXPLAINERS = [
  { title: "Estimate, not a live reading", text: "PakEmis reconstructs annual and monthly emissions from activity data and registered methods." },
  { title: "Location has an evidence grade", text: "Some emissions are placed at facilities; others are distributed using administrative data or proxy surfaces." },
  { title: "Every answer is traceable", text: "Inspect the source rows, method, uncertainty, release and exact calculation behind a result." },
] as const;

/** The closing call to action. */
export const DEEPER = {
  title: "Ready to go deeper?",
  text: "Move from the public overview into the map, detailed tables or complete data release.",
  map: "Open map explorer",
  download: "Download data",
} as const;

/** The number words a caption uses for a count of dimension rows ("Nine fiscal years"); digits beyond the list. */
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"] as const;
export function countWords(n: number, noun: string): string {
  const word = Number.isInteger(n) && n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);
  return `${word.replace(/^\w/, (c) => c.toUpperCase())} ${n === 1 ? noun : `${noun}s`}`;
}
