/**
 * The drawer's scope line and its suggested questions, both pure functions of the URL state
 * and the release's labels. The questions are templates keyed on which scope keys are set
 * (geo, sector, period, level, month, gas): with Punjab · agriculture · 2023–24 they read
 * "Why is Punjab's estimate high?", "How much comes from livestock?", "Which parts are
 * proxy-allocated?", "Compare Punjab with Sindh", "Download the rows used here."; on the
 * national default "What is Pakistan's largest source?", "How certain is this estimate?",
 * "Which categories are not estimated?", "How have emissions changed since 2015–16?". Every
 * name in them is a label from the release (never an id, never "FY"); no question carries a
 * number. The sector focus words are the only hand-written content: a question's subject, not
 * a claim, and the engine answers it.
 */
import type { Labels } from "@/lib/release";
import type { ExplorerState, StateDefaults } from "@/lib/urlState";
import { configWords, districtName, gasLabel, geographyName, gwpIsDefault, gwpLabel, monthLabel, periodShort, sectorLabel, type Dims } from "@/lib/labels";
import { geoGrain } from "@/lib/geography";
import { metricOf } from "@/lib/selection";
import type { AskIntent } from "./types";

export type ScopeDims = Dims & { fiscalPeriods: string[] };

/** A button action, never a classifier for a visitor's typed question. */
export function suggestionIntent(question: string, s: ExplorerState): AskIntent | undefined {
  if (s.pol || s.month || s.cell || s.level === "grid") return undefined;
  if (!s.sector && /^What is .+'s largest source\?$/.test(question)) return "largest_source";
  if (/^How (?:have emissions|has .+) changed (?:since .+|over the nine years)\?$/.test(question)) return "annual_trend";
  return undefined;
}

/** The subject each sector's "How much comes from …?" names; a sector outside the map asks for its largest category. */
export const SECTOR_FOCUS: Record<string, string> = {
  agriculture: "livestock",
  power: "coal-fired generation",
  transport: "road vehicles",
  waste: "landfills",
  residential: "cooking fuels",
  fugitives: "gas leakage",
  ippu: "cement",
  industry: "manufacturing fuels",
  railways: "diesel traction",
  aviation: "domestic flights",
};

function lowerInitial(text: string): string {
  return text.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
}

/** "Punjab", "Lahore" or "Pakistan": the place the scope names. */
export function placeName(labels: Labels, dims: Dims, s: Pick<ExplorerState, "geo" | "level">): string {
  // by the id's own grain, not the map's level: a province stays selected while its districts
  // are on screen, and reading `level` there named a province as though it were a district
  if (!s.geo) return "Pakistan";
  return geoGrain(s.geo) === "adm2" ? districtName(dims, s.geo) : geographyName(labels, s.geo);
}

/**
 * The scope as its parts: the place, the sector (lower-cased in running text), the gas, the
 * period, the month, the configuration, and the GWP basis only when it is not the release's
 * default. Each carries an `id` so the panel can render them as pills and still say the same
 * words as the line — ONE source, because a chip row and a scope line that can disagree will.
 *
 * Every part is a release LABEL. Nothing here prints a number.
 */
/**
 * `primary` marks the parts a reader CHOSE - the place, the sector, the gas, the period, the month.
 * The configuration and the GWP basis qualify the answer rather than select it, and they are
 * always on: a panel that put "reference estimate" beside "Pakistan" as though the two were the
 * same kind of choice would wrap its scope row onto a second line to say something the reader
 * never touched. They stay in the scope LINE, which is the full statement of what is being asked.
 */
export type ScopePart = { id: string; label: string; primary: boolean };

export function scopeChips(labels: Labels, dims: Dims, s: ExplorerState, defaults?: Pick<StateDefaults, "gwp_basis">): ScopePart[] {
  const parts: ScopePart[] = [{ id: "place", label: placeName(labels, dims, s), primary: true }];
  if (s.sector) parts.push({ id: "sector", label: lowerInitial(sectorLabel(labels, s.sector)), primary: true });
  // THE METRIC CHIP IS THE METRIC. It printed gasLabel(s.gas) whatever was selected, so a PM₂.₅
  // view read "All gases" here - and the same omission, one function away, told the model so.
  const metric = metricOf(s, labels);
  parts.push({ id: "gas", label: metric.family === "air" ? `${metric.label} emissions` : gasLabel(labels, s.gas), primary: true });
  parts.push({ id: "period", label: periodShort(labels, s.period), primary: true });
  if (s.month) parts.push({ id: "month", label: monthLabel(labels, s.month), primary: true });
  parts.push({ id: "config", label: configWords(labels, s.config), primary: false });
  if (metric.family !== "air" && !gwpIsDefault(labels, s.gwp, defaults?.gwp_basis)) parts.push({ id: "gwp", label: gwpLabel(labels, s.gwp), primary: false });
  return parts;
}

/** "Punjab · agriculture · 2023–24 · reference estimate": scopeChips, joined. */
export function scopeLine(labels: Labels, dims: Dims, s: ExplorerState, defaults?: Pick<StateDefaults, "gwp_basis">): string {
  // the gas part is unconditional in the chips (a pill reading "All gases (CO₂e)" is informative);
  // in running prose an unset gas is better left unsaid, which is what this line always did
  return scopeChips(labels, dims, s, defaults).filter((p) => p.id !== "gas" || s.gas || s.pol).map((p) => p.label).join(" · ");
}

/** The province after `place` in the release's ADM1 list (cyclic, polygons only): Punjab → Sindh. */
export function comparisonProvince(dims: Dims, place: string): string | null {
  const names = dims.adm1.filter((r) => r.has_polygon !== "no").map((r) => r.name);
  if (names.length < 2) return null;
  const i = names.indexOf(place);
  if (i === -1) return names[0] === place ? names[1] ?? null : names[0];
  return names[(i + 1) % names.length];
}

/**
 * The questions for a pollutant view. They are about THAT pollutant's emissions and they stay
 * inside what the air tables can answer: no uncertainty question (the interval function is the
 * greenhouse inventory's), no month, and nothing that splices in a CO₂e figure - the certainty
 * question on a PM₂.₅ view used to quote the national greenhouse total.
 */
function airQuestions(labels: Labels, dims: ScopeDims, s: ExplorerState, pollutant: string): string[] {
  const place = placeName(labels, dims, s);
  const sector = s.sector ? lowerInitial(sectorLabel(labels, s.sector)) : null;
  const firstPeriod = dims.fiscalPeriods[0] ? periodShort(labels, dims.fiscalPeriods[0]) : null;
  const out: string[] = [];
  out.push(s.geo ? `What are ${place}'s largest sources of ${pollutant}?` : `What are Pakistan's largest sources of ${pollutant}?`);
  if (sector) out.push(`How much ${pollutant} does ${sector} emit${s.geo ? ` in ${place}` : ""}?`);
  else if (!s.geo) out.push(`Which provinces emit the most ${pollutant}?`);
  out.push(`Which sources of ${pollutant} are not estimated?`);
  if (firstPeriod && firstPeriod !== periodShort(labels, s.period)) out.push(`How have ${pollutant} emissions changed since ${firstPeriod}?`);
  else out.push(`How have ${pollutant} emissions changed over the nine years?`);
  out.push("Is this a measure of air quality?");
  return out.slice(0, 5);
}

export function suggestedQuestions(labels: Labels, dims: ScopeDims, s: ExplorerState): string[] {
  const metric = metricOf(s, labels);
  if (metric.family === "air") return airQuestions(labels, dims, s, metric.label);
  const place = placeName(labels, dims, s);
  const sector = s.sector ? lowerInitial(sectorLabel(labels, s.sector)) : null;
  const focus = s.sector ? SECTOR_FOCUS[s.sector] : null;
  const firstPeriod = dims.fiscalPeriods[0] ? periodShort(labels, dims.fiscalPeriods[0]) : null;
  const out: string[] = [];
  if (s.geo) {
    out.push(`Why is ${place}'s estimate high?`);
    if (s.sector) out.push(focus ? `How much comes from ${focus}?` : `What makes up ${sector} in ${place}?`);
    else if (s.gas) out.push(`Where does ${place}'s ${gasLabel(labels, s.gas)} come from?`);
    else out.push(`What is ${place}'s largest source?`);
    out.push("Which parts are proxy-allocated?");
    const grain = geoGrain(s.geo);
    const other = grain === "adm1" ? comparisonProvince(dims, place) : null;
    if (other) out.push(`Compare ${place} with ${other}`);
    else if (grain === "adm2") out.push("How was this district's share allocated?");
    out.push("Download the rows used here.");
    return out.slice(0, 5);
  }
  if (s.sector) {
    out.push(focus ? `How much comes from ${focus}?` : `What makes up ${sector}?`);
    out.push(`How certain is the ${sector} estimate?`);
    if (firstPeriod && firstPeriod !== periodShort(labels, s.period)) out.push(`How has ${sector} changed since ${firstPeriod}?`);
    out.push(`Which parts of ${sector} are not estimated?`);
    if (s.month) out.push(`What drives the ${monthLabel(labels, s.month)} figure?`);
    out.push("Download the rows used here.");
    return out.slice(0, 5);
  }
  if (s.gas) out.push(`Where does Pakistan's ${gasLabel(labels, s.gas)} come from?`);
  else out.push("What is Pakistan's largest source?");
  out.push("How certain is this estimate?");
  out.push("Which categories are not estimated?");
  if (s.month) out.push(`What drives the ${monthLabel(labels, s.month)} figure?`);
  else if (firstPeriod && firstPeriod !== periodShort(labels, s.period)) out.push(`How have emissions changed since ${firstPeriod}?`);
  else out.push("How have emissions changed over the nine years?");
  if (s.level === "grid") out.push("What does the grid raster show, and what is a cell's value?");
  return out.slice(0, 5);
}
