/**
 * Is this the answer to what was asked?
 *
 * Every result on this site is printed under words that come from the reader's SELECTION - "PM₂.₅
 * in Lahore, 2019-20" - while the numbers come from a response. Nothing tied the two together but
 * the assumption that the server answered the question it was sent. On 2026-10-06 that assumption
 * was false for a whole page: a request without a period was answered from a different air
 * product, with grid power's screening bound inside the total, and shown under the same heading as
 * the card beside it.
 *
 * The envelope says what it answered. `request` is the server's own canonical reading of the body
 * (every field, defaults filled, `_type` named), `context` is what that resolved to, and
 * `calculation.table` is the table it read. This module compares those with the body that was
 * POSTED, and lib/api.ts turns a difference into a typed refusal before the response can be cached
 * or drawn. It is checked at the one place every query passes through, because the map, its legend
 * and the year slider call the client directly and a check in the hooks would miss them.
 *
 * WHAT IS COMPARED, and why it needs no model of the server's defaults:
 *
 *   1. every field the client SENT is in the echo with the same value (lists in the same order,
 *      and inside a timeseries' `query` and a comparison's `left` and `right`). A field the client
 *      did not send is not compared, so whatever the contract fills in is the contract's business;
 *   2. nothing the client sent is reported as defaulted, and the periods the answer is for are the
 *      periods asked for;
 *   3. an air answer was not read from the single-year layers, where grid power's uncontrolled
 *      bound is an ordinary row, and its cells are in the pollutant asked for.
 *
 * Nothing here reads a number. A response that fails is not corrected or relabelled; it is not shown.
 */
import type { Envelope, Refusal } from "./envelope";

export type Mismatch = { path: string; sent: unknown; answered: unknown; why: string };

/** The canonical `_type` each POST route echoes. A route not listed is not checked. */
export const ROUTE_TYPES: Record<string, string> = {
  "/query/emissions": "QueryEmissions",
  "/query/air": "QueryAir",
  "/query/compare": "CompareRequest",
  "/query/timeseries": "TimeseriesRequest",
  "/query/uncertainty": "UncertaintyRequest",
  "/query/completeness": "CompletenessRequest",
  "/spatial/grid": "GridCellRequest",
};

/**
 * The air endpoint's pre-panel layers: one calendar-and-fiscal year, seven sectors, and grid power's
 * uncontrolled screening bound as a row like any other. The site shows the covered-sources panel
 * and nothing else (the decision of 2026-10-06), so an answer read from one of these is not an
 * answer to any question this site asks, whatever heading it would have been given.
 */
export const AIR_SINGLE_YEAR_TABLES = ["fact_air_annual", "fact_air_adm1", "fact_air_adm2"];

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * What a body says on the wire. `undefined` is dropped by JSON; `null` and `""` are how a caller
 * says "the default" for a field, which the server then fills - so neither is something the client
 * asked for, and neither is compared.
 */
const asked = (v: unknown): boolean => v !== undefined && v !== null && v !== "";

/** The first place the echo differs from what was sent, or null. */
function differs(sent: unknown, echo: unknown, path: string): Mismatch | null {
  if (Array.isArray(sent)) {
    if (!Array.isArray(echo) || echo.length !== sent.length) return { path, sent, answered: echo, why: "the list answered is not the list asked for" };
    for (let i = 0; i < sent.length; i += 1) {
      const m = differs(sent[i], echo[i], `${path}[${i}]`);
      // a list is one thing to a reader: report it whole, not its second element
      if (m) return isObject(sent[i]) ? m : { path, sent, answered: echo, why: "the list answered is not the list asked for" };
    }
    return null;
  }
  if (isObject(sent)) {
    if (!isObject(echo)) return { path, sent, answered: echo, why: "the answer does not carry this part of the request" };
    for (const [k, v] of Object.entries(sent)) {
      if (!asked(v)) continue;
      const m = differs(v, echo[k], path ? `${path}.${k}` : k);
      if (m) return m;
    }
    return null;
  }
  return sent === echo ? null : { path, sent, answered: echo, why: "the answer is for a different value" };
}

const sameSet = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * The first way `env` is not the answer to the body `sent` to `route`, or null when it is.
 * `route` is the path posted to ("/query/air"); a route that is not a typed query is not checked.
 */
export function mismatch(route: string, sent: unknown, env: Pick<Envelope, "request" | "context" | "calculation" | "values">): Mismatch | null {
  const type = ROUTE_TYPES[route];
  if (!type) return null;
  // what was actually posted: JSON drops undefined and says a Date as a string
  const body = JSON.parse(JSON.stringify(sent ?? {})) as unknown;
  if (!isObject(body)) return null;

  let echo: unknown;
  try {
    echo = JSON.parse(env.request);
  } catch {
    return { path: "request", sent: type, answered: env.request, why: "the answer does not say which request it answers" };
  }
  if (!isObject(echo) || echo._type !== type) {
    return { path: "_type", sent: type, answered: isObject(echo) ? (echo._type ?? null) : echo, why: "the answer is to a different kind of request" };
  }

  const field = differs(body, echo, "");
  if (field) return field;

  const defaulted = (env.context.defaults_applied ?? []).filter((k) => asked(body[k]) && !(Array.isArray(body[k]) && (body[k] as unknown[]).length === 0));
  if (defaulted.length) return { path: defaulted[0], sent: body[defaulted[0]], answered: "default", why: "the answer used a default where a value was asked for" };

  const periods = body.periods;
  if ((type === "QueryEmissions" || type === "QueryAir") && Array.isArray(periods) && periods.length) {
    const answered = env.context.periods ?? [];
    if (!sameSet(periods, answered)) return { path: "context.periods", sent: periods, answered, why: "the answer is for different years" };
  }

  if (type === "QueryAir") {
    const table = typeof env.calculation.table === "string" ? env.calculation.table : null;
    if (table && AIR_SINGLE_YEAR_TABLES.includes(table)) {
      return { path: "calculation.table", sent: "the covered-sources panel", answered: table, why: "the answer was read from the single-year air layer, which counts a screening scenario for grid power as an estimate" };
    }
    const pollutants = Array.isArray(body.pollutants) ? body.pollutants.filter((p): p is string => typeof p === "string") : [];
    if (pollutants.length) {
      const units = pollutants.map((p) => `kt ${p}`);
      const wrong = env.values.find((c) => c.unit.startsWith("kt ") && !units.includes(c.unit));
      if (wrong) return { path: "values.unit", sent: units, answered: wrong.unit, why: "the answer is in a different pollutant" };
    }
  }
  return null;
}

/**
 * The mismatch as a refusal, so every surface that can show "not available for this selection"
 * shows this the same way. The words are for a reader; the detail is for whoever is debugging.
 */
export function mismatchRefusal(m: Mismatch): Refusal {
  return {
    error: "response_mismatch",
    error_class: "ResponseMismatch",
    message: `The answer that came back is not for the selection on screen (${m.why}), so it is not shown.`,
    limitation_id: null,
    detail: { path: m.path, asked: m.sent, answered: m.answered },
  };
}
