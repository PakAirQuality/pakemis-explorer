/**
 * An answer that rests on an ACTIVITY RECORD: a count, a stock or a quantity as its source printed
 * it ("how many cars are registered in Lahore"), not an emission estimate.
 *
 * ⚠ EVERYTHING UNDER AN ANSWER WAS WRITTEN FOR AN ESTIMATE. The scope sentence says "These are
 * national estimates for 2023–24, using AR5 warming potentials. The release excludes land use and
 * forestry", the details list a gas basis and a configuration, "Show on map" patches the request's
 * `periods` onto the map, and the follow-up offers an uncertainty interval. Under a vehicle count
 * every one of those is about something else - the map's gas and year, not the register's place and
 * date. A record has its own scope, and it travels on the cells: the measure, the place, the date,
 * the source series and the use note. This module says that scope and nothing else.
 *
 * Nothing here computes or formats a figure. Every string is one the release printed; the only
 * words added are the fixed ones that join them.
 */
import type { ScopeRow } from "./answerParts";
import type { ToolResultCell, ToolResultEvent } from "./types";

export const ACTIVITY_TOOL = "query_activity";

export function isActivity(r: ToolResultEvent | null | undefined, name?: string): boolean {
  return !!r && (r.request_type === ACTIVITY_TOOL || r.name === ACTIVITY_TOOL || name === ACTIVITY_TOOL);
}

/** The distinct non-empty values of one attribute, in first-seen order. */
function distinct(cells: ToolResultCell[], key: string): string[] {
  const out: string[] = [];
  for (const c of cells) {
    const v = c.attrs?.[key];
    if (typeof v === "string" && v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** "Lahore", "Lahore, Karachi and Multan", or the first three and "others": names, never a count. */
function listed(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, 3).join(", ")} and others`;
}

/** One date, or the first and last of several as the release words them. */
function span(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels[0]} to ${labels[labels.length - 1]}`;
}

/** The first sentence of the release's use note: what the figure may not be read as. */
function firstSentence(note: string): string {
  const cut = note.indexOf(". ");
  return cut < 0 ? note : note.slice(0, cut + 1);
}

/** A cell the server computed as a sum of the rows above it (query_activity's `total`). */
export function isComputedTotal(cell: ToolResultCell | undefined): boolean {
  return (cell?.attrs?.derived ?? "") === "sum";
}

export const RECORD_LEAD = "This is a source record, not an emission estimate";
export const TOTAL_NOTE = "The total is the sum of the classes this release holds, computed here; it is not a figure the source printed.";

/**
 * The warnings on a record answer, said once: what the figure is not. "This is a source record, not
 * an emission estimate. Registered stock at 30 June is not traffic and not an active fleet."
 *
 * The scope that used to follow the lead ("Registered vehicles · Lahore · 30 June 2023 · Provincial
 * vehicle registrations") is gone from this line: the answer names the record's place and date in
 * its own sentence, and "View details" lists record, place, date, source and evidence
 * (activityScopeRows below).
 */
export function activityNote(r: ToolResultEvent): string {
  const cells = r.cells;
  let out = `${RECORD_LEAD}.`;
  const notes = distinct(cells, "use_note");
  if (notes.length === 1) out += ` ${firstSentence(notes[0])}`;
  if (cells.some(isComputedTotal)) out += ` ${TOTAL_NOTE}`;
  return out;
}

/** The details' "Applied to" pills for a record: its own scope, with no gas, basis or configuration. */
export function activityScopeRows(r: ToolResultEvent): ScopeRow[] {
  const cells = r.cells;
  const rows: ScopeRow[] = [];
  const push = (name: string, value: string) => { if (value) rows.push({ name, value }); };
  push("Record", listed(distinct(cells, "measure")));
  push("Place", listed(distinct(cells, "location")));
  const types = distinct(cells, "period_type");
  push(types.length === 1 && types[0] === "Snapshot date" ? "Date" : "Period", span(distinct(cells, "period_label")));
  push("Source", listed(distinct(cells, "source_series")));
  push("Evidence", listed(distinct(cells, "evidence")));
  const defaults = Array.isArray(r.context?.defaults_applied) ? (r.context.defaults_applied as unknown[]) : [];
  if (defaults.includes("periods")) rows.push({ name: "Period chosen", value: "the newest held", muted: true });
  return rows;
}

/** The sources and qualifications of a record, for the details: the reference as the release prints it, and the whole use note. */
export function activitySources(r: ToolResultEvent): { reference: string; note: string } {
  return { reference: distinct(r.cells, "source_reference").join(" · "), note: distinct(r.cells, "use_note").join(" ") };
}
