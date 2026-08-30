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

export type ScopeDims = Dims & { fiscalPeriods: string[] };

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
  if (!s.geo) return "Pakistan";
  return s.level === "adm2" ? districtName(dims, s.geo) : geographyName(labels, s.geo);
}

/**
 * "Punjab · agriculture · 2023–24 · reference estimate": the place, the sector (lower-cased
 * in running text), the gas, the period, the month, the configuration, and the GWP basis only
 * when it is not the release's default.
 */
export function scopeLine(labels: Labels, dims: Dims, s: ExplorerState, defaults?: Pick<StateDefaults, "gwp_basis">): string {
  const parts: string[] = [placeName(labels, dims, s)];
  if (s.sector) parts.push(lowerInitial(sectorLabel(labels, s.sector)));
  if (s.gas) parts.push(gasLabel(labels, s.gas));
  parts.push(periodShort(labels, s.period));
  if (s.month) parts.push(monthLabel(labels, s.month));
  parts.push(configWords(labels, s.config));
  if (!gwpIsDefault(labels, s.gwp, defaults?.gwp_basis)) parts.push(gwpLabel(labels, s.gwp));
  return parts.join(" · ");
}

/** The province after `place` in the release's ADM1 list (cyclic, polygons only): Punjab → Sindh. */
export function comparisonProvince(dims: Dims, place: string): string | null {
  const names = dims.adm1.filter((r) => r.has_polygon !== "no").map((r) => r.name);
  if (names.length < 2) return null;
  const i = names.indexOf(place);
  if (i === -1) return names[0] === place ? names[1] ?? null : names[0];
  return names[(i + 1) % names.length];
}

export function suggestedQuestions(labels: Labels, dims: ScopeDims, s: ExplorerState): string[] {
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
    const other = s.level === "adm1" ? comparisonProvince(dims, place) : null;
    if (other) out.push(`Compare ${place} with ${other}`);
    else if (s.level === "adm2") out.push("How was this district's share allocated?");
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
