/**
 * The panel moving the reader's map — announced, and reversible.
 *
 * WHAT THIS REPLACED. Every answer about a place or a sector used to move the map by itself and then
 * report it as a block of six internal chips — `Config Reference estimate`, `Gwp IPCC 2013 (AR5)`,
 * `Level Provinces`, `View all three views` — beside a raw URL. None of that helps answer a
 * question; the current scope is already under the composer; and a factual question has no business
 * rearranging the view someone was reading.
 *
 * So the map now moves on a click, or on an explicit "show me X on the map" the agent honoured, and
 * either way it says so quietly and offers the move back.
 */
import type { ExplorerState } from "@/lib/urlState";

/**
 * The keys the panel is ever allowed to move.
 *
 * `config`, `gwp` and `view` ARE DELIBERATELY ABSENT. They were three of the six chips the old
 * "moved the map" block sprayed - "Config Reference estimate", "Gwp IPCC 2013 (AR5)", "View all
 * three views" - and they are the reader's own settings, not part of an answer. An answer may point
 * the map at a place, a period or a sector; it may not quietly re-configure the estimate underneath
 * the reader. `c` is chrome and is not here either.
 */
export const MAP_KEYS = ["level", "geo", "period", "month", "sector", "gas", "pol"] as const;
export type MapKey = (typeof MAP_KEYS)[number];

/**
 * The keys the confirmation NAMES. `level` moves the map but is not something the reader asked for
 * in those words - "Provinces" was another of the chips - so the line reads "Agriculture · 2023–24"
 * rather than "Provinces · Agriculture · 2023–24".
 */
export const WORD_KEYS = ["geo", "sector", "gas", "pol", "month", "period"] as const;

const first = (v: unknown): string => (Array.isArray(v) && typeof v[0] === "string" ? v[0] : "");

/**
 * The map scope a tool call was made at, read off its own input.
 *
 * `lib/requests.ts:stateFromRequest` only maps `query_emissions`, so a completeness or evidence
 * question produced nothing to offer - and it also carries config/gwp/view, which is the chip spray.
 * This reads the six reader-facing fields from any query's input.
 *
 * ⚠ `reporting_sectors` IS READ FIRST. Every builder moved the sector filter onto that field at
 * rc54; reading `sectors` alone silently drops it and the map opens on every sector. Same trap, same
 * fallback order as requests.ts.
 */
/**
 * The tools whose input IS a selection: a query over the inventory. For these the patch is the
 * WHOLE scope of the answer - the metric, the place, the sector and the month are each named,
 * null when the query did not filter on them.
 *
 * ⚠ A PATCH THAT ONLY ADDS IS NOT THE ANSWER'S SCOPE. It used to carry the keys the query set and
 * nothing else, merged over whatever the reader had selected since. So a national PM₂.₅ answer
 * "shown on the map" from a greenhouse view painted CO₂e; a greenhouse answer shown from a PM₂.₅
 * view stayed PM₂.₅; and an answer about the whole country, shown while Lahore was selected,
 * stayed on Lahore. Each looked like the answer and was not. Other tools (completeness, evidence)
 * name a sector or a place in passing and keep the additive patch.
 */
const SCOPED_TOOLS = new Set(["query_emissions", "query_air"]);

export function mapPatchFromInput(input: Record<string, unknown>, tool?: string): Partial<ExplorerState> {
  // A RECORD IS NOT A MAP LAYER. An activity query's `periods` are dates as a register prints them
  // ("2023-06-30", "2023"), and patching one onto the map would set a fiscal year that does not
  // exist; its places are names, not shapes. The map stays where the reader left it.
  if (tool === "query_activity") return {};
  if (tool && SCOPED_TOOLS.has(tool)) {
    const level = typeof input.geography_level === "string" ? input.geography_level : "";
    const whole: Record<string, string | null> = {
      geo: first(input.geography_ids) || null,
      sector: first(input.reporting_sectors) || first(input.sectors) || null,
      gas: tool === "query_air" ? null : first(input.gases) || null,
      pol: tool === "query_air" ? first(input.pollutants) || null : null,
      month: tool === "query_air" ? null : first(input.months) || null,
    };
    if (level === "adm1" || level === "adm2") whole.level = level;
    const period = first(input.periods);
    if (period) whole.period = period;
    return whole as Partial<ExplorerState>;
  }
  const out: Record<string, string> = {};
  const level = typeof input.geography_level === "string" ? input.geography_level : "";
  if (level === "adm1" || level === "adm2") out.level = level;
  const geo = first(input.geography_ids);
  if (geo) out.geo = geo;
  const period = first(input.periods);
  if (period) out.period = period;
  const month = first(input.months);
  if (month) out.month = month;
  const sector = first(input.reporting_sectors) || first(input.sectors);
  if (sector) out.sector = sector;
  const gas = first(input.gases);
  if (gas) out.gas = gas;
  return out as Partial<ExplorerState>;
}

export type MapMove = { patch: Partial<ExplorerState>; previous: Partial<ExplorerState> };

/** The move's own keys, with nothing else along for the ride. */
export function movePatch(source: Record<string, unknown>): Partial<ExplorerState> {
  const patch: Partial<ExplorerState> = {};
  for (const k of MAP_KEYS) {
    const v = source[k];
    if (typeof v === "string" && v) (patch as Record<string, unknown>)[k] = v;
  }
  return patch;
}

/** Whether applying a patch would change anything the reader can see: an offer to move nowhere is not offered. */
export function movesMap(state: ExplorerState, patch: Partial<ExplorerState>): boolean {
  return Object.entries(patch).some(([k, v]) => ((state as unknown as Record<string, unknown>)[k] ?? null) !== (v ?? null));
}

/**
 * What to write to put the map back.
 *
 * ⚠ EVERY KEY THE MOVE TOUCHED IS NAMED, AND AN UNSET ONE IS NAMED AS null. Returning only the keys
 * that had values cannot UNSET anything, so undoing a move onto Agriculture from a state with no
 * sector would silently leave the sector applied — the button would look broken and the map would
 * be wrong. This is the same trap as the saved-scope restore in the conversation history: a patch
 * that omits a key is not the absence of that key.
 */
export function undoPatch(move: MapMove): Partial<ExplorerState> {
  const back: Record<string, unknown> = {};
  for (const k of Object.keys(move.patch)) back[k] = (move.previous as Record<string, unknown>)[k] ?? null;
  return back as Partial<ExplorerState>;
}

/** The previous values of exactly the keys a patch is about to overwrite. */
export function previousOf(state: ExplorerState, patch: Partial<ExplorerState>): Partial<ExplorerState> {
  const prev: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) prev[k] = (state as unknown as Record<string, unknown>)[k] ?? null;
  return prev as Partial<ExplorerState>;
}
