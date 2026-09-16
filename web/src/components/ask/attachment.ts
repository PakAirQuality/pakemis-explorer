/**
 * What a turn shows BESIDE its prose, and what it says about where the prose came from.
 *
 * THE PANEL IS A CHAT AGAIN. Every answer used to arrive with the same apparatus regardless of what
 * it was: a raw Thinking card, a `0 queries · 12.204 s` meta row, a bordered card with eight
 * sections, and a line of token counts. A one-sentence answer and a nine-year series got identical
 * furniture. Now an answer is text, at most ONE attachment, and one line naming its provenance —
 * and most answers carry no attachment at all.
 *
 * Everything here is pure and decided from the stream the panel already receives; nothing new is
 * asked of the server, and nothing here reads a number. `chartKind` in answerParts.ts already
 * classifies a result's cells, so the rule below is a mapping over its answer rather than a second
 * opinion about the same cells.
 */
import { chartKind, groupKeyOf } from "./answerParts";
import type { Dims } from "@/lib/labels";
import type { AnswerEvent, LibrarySource, ToolResultCell, ToolResultEvent } from "./types";
import type { ToolItem } from "./answerParts";
import type { TimelineItem } from "./types";

/**
 * The one thing a turn may show under its prose. `none` is the common case and the point.
 *
 * THIS IS A WHITELIST, AND IT HAS TO BE. Twice now a record-shaped result has been drawn as a table
 * and printed backend rows into the chat: 33 completeness cells reading "NE" under their own
 * multi-sentence justifications, then a method registry row - `ipcc2006_v4_ch10_eq10.19_enteric_ch4`,
 * `product_lognormal_activity_x_ef`, `agriculture · T1`, an unexplained `0`. Each time the fix was a
 * special case and the next record type walked straight past it. So `table` is not a kind any more:
 * only a curated chart, an uncertainty view, a source list and a methodology disclosure may appear,
 * and everything else is `none`.
 *
 * ⚠ THE PREDICATE IS NOT "HAS A UNIT". A method cell's unit is the literal string "method" - a type
 * tag, not a measure - so a unit test would have passed it. What separates a measurement from a
 * record is that a measurement's display is a NUMBER, which is exactly what `chartKind` already
 * decides. Anything it cannot chart is not drawn.
 */
export type AttachmentKind = "none" | "chart" | "uncertainty" | "sources" | "method";

/** The prepared library's turns, which carry structured source records instead of a receipt. */
export function fromLibrary(answer: AnswerEvent): boolean {
  return (answer as { source?: string }).source === "library";
}

export function librarySourcesOf(answer: AnswerEvent): LibrarySource[] {
  return (answer.citations ?? []).filter((c): c is LibrarySource => typeof (c as LibrarySource).source_id === "string");
}

/**
 * At most one attachment, and `none` whenever the prose already carries the whole answer.
 *
 * THE SINGLE FIGURE IS THE WHOLE POINT. A one-cell result used to render as a 30 px number in a
 * bordered card directly under a sentence that had just cited that same number — the figure twice,
 * once as furniture. A lone figure is `chartKind` "figure", and it gets nothing: the number is in
 * the sentence, underlined, linked to its receipt.
 */
/** The turn's method record, wherever it was called. */
export function methodTool(items: TimelineItem[]): ToolItem | null {
  return items.find((i): i is ToolItem =>
    i.kind === "tool" && !!i.result && (i.name === "get_method" || i.result.request_type === "get_method")) ?? null;
}

export function attachmentOf(principal: ToolItem | null, answer: AnswerEvent, items: TimelineItem[] = []): AttachmentKind {
  if (!principal?.result) return fromLibrary(answer) && librarySourcesOf(answer).length > 0 ? "sources" : "none";
  const r = principal.result;
  // "how certain is this" asked directly: the intervals ARE the answer, not a chart of it
  if (principal.name === "get_uncertainty" || r.request_type === "get_uncertainty") return "uncertainty";
  // A METHODOLOGY QUESTION, WHEREVER THE METHOD CALL LANDED. Answering "how is this estimated" well
  // takes two calls - the method record and then get_evidence to check what was actually observed -
  // and the SECOND is the principal. Looking only at the principal skipped the disclosure on exactly
  // the answers that deserved it.
  const method = methodTool(items) ?? (principal.name === "get_method" || r.request_type === "get_method" ? principal : null);
  if (method?.result && methodDisclosure(method.result).method) return "method";
  const kind = chartKind(r.cells);
  // "figure", "table" and "none" alike draw nothing: a lone figure is already cited in the prose,
  // and a table is machine rows, which never print themselves
  return kind === "columns" || kind === "bars" ? "chart" : "none";
}

/** Method tiers, in words. */
const TIER_WORDS: Record<string, string> = { T1: "Tier 1", T2: "Tier 2", T3: "Tier 3" };

/**
 * The methodology disclosure, from the method record's READER-GRADE fields only.
 *
 * `tier` is "T1", `equation` is "2006 V4 Ch10 Eq 10.19/10.20" and `notes` is a sentence a person
 * wrote. The ids - `method_id`, `uncertainty_model_id` - are not here and never will be; they are in
 * View details beside the receipt. If a field is missing its half of the line is omitted rather than
 * filled with the id, the same rule the scope sentence follows.
 *
 * ⚠ "T1" HERE IS NOT THE "T1" OF THE EVIDENCE CLASSES. `dim_evidence_class` uses T1 for "observed
 * monthly activity"; this T1 is an IPCC method tier. They must never share a lookup.
 */
export function methodDisclosure(r: ToolResultEvent): { method: string; basis: string } {
  const a = (r.cells[0]?.attrs ?? {}) as Record<string, string>;
  const parts = [TIER_WORDS[a.tier] ?? "", a.equation ?? ""].filter(Boolean);
  return { method: parts.join(" · "), basis: a.notes ?? "" };
}

const PLACE: Record<string, string> = { national: "National", adm1: "Provincial", adm2: "District", grid: "Grid-cell" };
const SHAPE: Record<string, string> = {
  period_id: "series", month: "monthly series", sector_id: "sector totals", module: "sector totals",
  gas: "gas totals", shape_id: "district totals", category_id: "categories", category: "categories",
  reporting_sector: "sector totals", geography_id: "place totals",
};

/**
 * What the answer rested on, in four or five words: "National series", "Provincial sector
 * breakdown", "District totals". Composed from the result's OWN context and grouping, never from
 * the model's prose and never from a number.
 */
export function restedOn(r: ToolResultEvent, input: Record<string, unknown>): string {
  if (r.request_type === "get_uncertainty" || r.name === "get_uncertainty") return "Uncertainty analysis";
  if (r.request_type === "get_evidence" || r.name === "get_evidence") return "Evidence record";
  if (r.request_type === "get_method" || r.name === "get_method") return "Method record";
  if (r.request_type === "get_completeness" || r.name === "get_completeness") return "Completeness ledger";
  const level = typeof r.context?.geography_level === "string" ? r.context.geography_level : "national";
  const place = PLACE[level] ?? "National";
  const shape = shapeWord(r, input);
  return `${place} ${shape}`;
}

function shapeWord(r: ToolResultEvent, input: Record<string, unknown>): string {
  const by = Array.isArray(input.group_by) ? input.group_by.filter((x): x is string => typeof x === "string") : [];
  const key = groupKeyOf(r.cells) ?? by[0] ?? null;
  return key ? SHAPE[key] ?? `${key.replace(/_/g, " ")} totals` : r.cells.length > 1 ? "totals" : "total";
}

/**
 * What the WHOLE TURN rested on, in one phrase: "National categories and sector totals".
 *
 * Naming only the principal result under-reported the work. An answer that asked for the leading
 * category and then the sector totals rested on two queries, and the line said one of them - so a
 * reader following it to the sources found more than the line had admitted to.
 */
export function restedOnTurn(items: TimelineItem[], fallback = ""): string {
  const tools = items.filter((i): i is ToolItem =>
    i.kind === "tool" && !!i.result && !i.result.download && i.name !== "set_map_view" && i.result.cells.length > 0);
  if (tools.length === 0) return fallback;
  const level = tools.map((t) => (typeof t.result!.context?.geography_level === "string" ? t.result!.context.geography_level : "national"));
  // one place prefix when every query shares a grain; otherwise none, because "National district
  // totals" would be a lie about one of them
  const place = new Set(level).size === 1 ? PLACE[level[0]] ?? "National" : "";
  const shapes: string[] = [];
  for (const t of tools) {
    const special = SPECIAL[t.result!.request_type ?? t.name];
    const w = special ?? shapeWord(t.result!, t.input);
    if (!shapes.includes(w)) shapes.push(w);
  }
  const joined = shapes.length <= 1 ? shapes[0] ?? "" : `${shapes.slice(0, -1).join(", ")} and ${shapes[shapes.length - 1]}`;
  return place ? `${place} ${joined}` : joined.charAt(0).toUpperCase() + joined.slice(1);
}

/**
 * The scope, said ONCE, by the interface.
 *
 * THE MODEL USED TO SAY THIS, AND SAID IT TWICE. Its rule 4 read "state the scope with every
 * figure", so an answer with two figures carried the caveat twice, and `lulucf_excluded` is on every
 * envelope so "(note that land use and forestry are excluded)" arrived on every reply. None of it
 * was the model's to write: the place, the period, the basis and the exclusion are properties of the
 * release and the query, known exactly, and the release even supplies its own wording for the last
 * one. Nothing here is generated; every clause is a lookup.
 */
export function scopeNote(r: ToolResultEvent, words: { period: (id: string) => string; gwp: (id: string) => string; place: (r: ToolResultEvent) => string; lulucf: string }): string {
  const span = periodSpan(r, words.period);
  const basis = typeof r.context?.gwp_basis === "string" ? words.gwp(r.context.gwp_basis) : "";
  const parts = [`These are ${words.place(r)} estimates`];
  if (span) parts.push(`for ${span}`);
  let out = parts.join(" ");
  if (basis) out += `, using ${basis} warming potentials`;
  out += ".";
  if (words.lulucf) out += ` The release ${words.lulucf}.`;
  return out;
}

const SPECIAL: Record<string, string> = {
  get_uncertainty: "uncertainty analysis", get_evidence: "evidence records",
  get_method: "method records", get_completeness: "the completeness ledger",
};

/** The constant second half of the provenance line: it is the published release, and nothing else. */
export const PROVENANCE_GROUND = "Published release";

/**
 * The chart's heading: the place and what is being measured, e.g. "National greenhouse-gas
 * emissions". Read off the result's own geography and the unit of its cells — a chart may not be
 * titled by the model, because a title is a claim about what the cells are.
 */
export function attachmentTitle(r: ToolResultEvent): string {
  const level = typeof r.context?.geography_level === "string" ? r.context.geography_level : "national";
  const place = PLACE[level] ?? "National";
  const unit = r.cells[0]?.unit ?? "";
  if (/co2e/i.test(unit)) return `${place} greenhouse-gas emissions`;
  return `${place} emissions`;
}

/**
 * The periods a result spans, as the release words them: "2015–16 to 2023–24", or one label. The
 * panel may never print a raw period id — `periodShort` is what keeps "FY" off this line, which
 * three tests assert.
 */
export function periodSpan(r: ToolResultEvent, short: (id: string) => string): string {
  const ps = r.context?.periods;
  const ids = Array.isArray(ps) ? ps.filter((p): p is string => typeof p === "string") : [];
  if (ids.length === 0) {
    const label = r.context?.reporting_period;
    return typeof label === "string" ? short(label) : "";
  }
  if (ids.length === 1) return short(ids[0]);
  return `${short(ids[0])} to ${short(ids[ids.length - 1])}`;
}

/** "How certain is this?" — the one follow-up that already existed, kept as the exported constant. */
export const UNCERTAINTY_FOLLOW_UP = "How certain is this?";
const CHANGE_FOLLOW_UP = "What drove this change?";
const COMPARE_FOLLOW_UP = "Compare with another province";

/**
 * Two chips at most, decided by what the turn DID.
 *
 * DIRECTION-NEUTRAL BY CONSTRUCTION. The mockup offered "What drove the increase?", which asserts a
 * direction — and the browser could only know it was an increase by reading the numbers off the
 * cells, which is exactly the arithmetic this panel forbids itself. "What drove this change?" says
 * the same thing and claims nothing.
 */
export function followUps(principal: ToolItem | null, answer: AnswerEvent, turnHasUncertainty: boolean, dims?: Dims): string[] {
  if (fromLibrary(answer) || !principal?.result) return [];
  const r = principal.result;
  const out: string[] = [];
  if (chartKind(r.cells) === "columns") out.push(CHANGE_FOLLOW_UP);
  if (!turnHasUncertainty) out.push(UNCERTAINTY_FOLLOW_UP);
  if (out.length < 2 && r.context?.geography_level === "adm1") {
    const ids = r.context?.geography_ids;
    if (Array.isArray(ids) && ids.length === 1 && (dims?.adm1?.length ?? 0) > 1) out.push(COMPARE_FOLLOW_UP);
  }
  return out.slice(0, 2);
}


/**
 * Is this figure MODELLED — a national total allocated downward — rather than observed here?
 *
 * ⚠ THE READER WAS SHOWN PUNJAB 27.49 AND SINDH 8.36 AS THOUGH BOTH WERE PROVINCIAL DATA. Both are
 * a national fuel total spread by a road-density proxy. The panel could not say so because province
 * cells carried no evidence fields at all — `spatial_fields.decorate` was gated to districts. With
 * that gate opened, the test is the release's own placement class, and it is the same predicate the
 * map already uses (`layerModes.diffusePlacement`).
 *
 * There is NO limitation row for this. `engine._limitations_for` has no adm1 branch and none of the
 * release's 46 known limitations covers spatial allocation, so "No limitation recorded" was
 * literally true and entirely misleading. The S-class IS the limitation.
 */
export function isModelled(cell: ToolResultCell | undefined): boolean {
  const p = String((cell?.attrs ?? {}).placement_class ?? "");
  return p.includes("diffuse") || p.includes("proxy") || p.includes("fallback");
}

export type Disclosure = { estimate: string; data: string; proxies: string; method: string };

/**
 * The compact disclosure under an answer, every line from the release's own fields and omitted when
 * the field is absent. Never an id, never a source filename — `source_documents.csv` gives OCAC's
 * title as "OCAC_FY2016_17.pdf", a filename and the wrong fiscal year, so the readable account of
 * the activity data is the method registry's own note instead.
 */
export function disclosureOf(
  cells: ToolResultCell[],
  method: { method: string; basis: string } | null,
  words: { surface: (s: string) => string; plainClass: (c: string) => string; level: string },
): Disclosure {
  const modelled = cells.filter(isModelled);
  const where = words.level === "adm1" ? "provincial" : words.level === "adm2" ? "district" : "";
  const surfaces = Array.from(new Set(modelled.map((c) => words.surface(String((c.attrs ?? {}).allocation_surface ?? "")))
    .filter(Boolean)));
  return {
    estimate: modelled.length ? `Modelled ${where} allocation`.replace("  ", " ").trim() : "",
    data: method?.basis ?? "",
    proxies: surfaces.join(" · "),
    method: method?.method ?? "",
  };
}
