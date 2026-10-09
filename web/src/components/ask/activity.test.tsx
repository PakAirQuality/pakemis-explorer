/**
 * An answer that rests on a source record, and the failure that hid the first one.
 *
 * "How many cars are in Lahore?" was asked from a map showing Sindh and methane. The stream died at
 * the hosting edge and the panel printed "http 502 / 502 502 / http_502"; when it did answer, the
 * card under a record would have said "These are national estimates … using AR5 warming potentials.
 * The release excludes land use and forestry", offered an uncertainty interval, and offered to move
 * the map to a "period" that is a register's date. Each of those is the map's scope or an
 * estimate's furniture under something that is neither.
 *
 * Every figure below is a fixture string the "server" sent. Nothing here types a number the
 * component is expected to compute, because it computes none.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import { stateFromRequest } from "@/lib/requests";
import { resolveState, type ExplorerState } from "@/lib/urlState";
import type { ReleaseInfo } from "@/lib/envelope";
import { RELEASE, envelope } from "@/__tests__/fixtures";
import { AskDock } from "./AskDock";
import { RECORD_LEAD, TOTAL_NOTE, activityNote, activityScopeRows, isActivity, isComputedTotal } from "./activity";
import { chartKind } from "./answerParts";
import { attachmentOf, followUps, restedOn } from "./attachment";
import { MAP_KEYS, mapPatchFromInput, movesMap } from "./mapMove";
import { ERROR_TITLES, RETRYABLE, errorTitle } from "./ReasoningTimeline";
import { timelineOf } from "./timeline";
import type { AnswerEvent, AskEvent, TimelineItem, ToolResultEvent } from "./types";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const RECEIPT = "41026d900e9d37abb4710b35a105c696";
const CID = "c0ffee00deadbeef";
const USE_NOTE = "Registered stock at 30 June is not traffic and not an active fleet. Distance and fuel-share rows are declared assumptions. Cumulative registered stock at 30 June: a scrapped vehicle stays in the total until deregistered.";
const SHARED = {
  evidence: "Reported", location: "Lahore", location_level: "District", measure: "Registered vehicles",
  period: "2023-06-30", period_label: "30 June 2023", period_type: "Snapshot date", province: "Punjab",
  source_reference: "Provincial Bureaux of Statistics registered-vehicle tables (cumulative stock)",
  source_series: "Provincial vehicle registrations", use_note: USE_NOTE,
};
const CARS = { i: 0, display: "1,561,386", display_short: "1.56 million", unit: "vehicles", n_rows: 1, attrs: { ...SHARED, category: "Small cars (4W1)" } };
const BIKES = { i: 1, display: "4,822,762", display_short: "4.82 million", unit: "vehicles", n_rows: 1, attrs: { ...SHARED, category: "Two-wheelers (2W)" } };
const TOTAL = { i: 2, display: "6,384,148", display_short: "6.38 million", unit: "vehicles", n_rows: 2, interpretation: "Computed here as the sum of the vehicle class rows this release holds for this place and period.", attrs: { ...SHARED, category: "Every class held, summed", derived: "sum", classes_summed: "Small cars (4W1); Two-wheelers (2W)" } };
const CONTEXT = { basis: "as printed", configuration_id: "", defaults_applied: ["periods"], geography_ids: ["Lahore"], geography_level: "", gwp_basis: "", periods: ["2023-06-30"], reporting_period: "FY2023-24", spatial_view: "" };
const INPUT = { table: "fact_activity_vehicles", locations: ["Lahore"], measure: "Registered vehicles", categories: ["Small cars (4W1)"] };

function result(cells: unknown[] = [CARS], context: Record<string, unknown> = CONTEXT): ToolResultEvent {
  return { cells, context, id: "toolu_01", k: 1, limitations_hit: [], n_values: cells.length, name: "query_activity", receipt: RECEIPT, request_type: "query_activity" } as unknown as ToolResultEvent;
}
function stream(cells: unknown[], text: string, input: Record<string, unknown> = INPUT): [string, unknown][] {
  return [
    ["status", { phase: "model", turn: 1 }],
    ["tool_call", { id: "toolu_01", input, k: 1, name: "query_activity" }],
    ["status", { k: 1, name: "query_activity", phase: "tool" }],
    ["tool_result", result(cells)],
    ["status", { phase: "model", turn: 2 }],
    ["answer", { citations: [], elapsed_s: 1, receipts: [RECEIPT], scope: { ...CONTEXT, k: 1, name: "query_activity", receipt: RECEIPT, request_type: "query_activity" }, text }],
    ["done", { conversation_id: CID, cost_estimate_usd: 0, usage: { input_tokens: 1, output_tokens: 1 } }],
  ];
}
const items = (events: [string, unknown][]): TimelineItem[] => timelineOf(events.map(([name, data]): AskEvent => ({ name, data }))).items;
const principalOf = (events: [string, unknown][]) => {
  const tool = items(events).find((i) => i.kind === "tool");
  if (tool?.kind !== "tool") throw new Error("no tool item");
  return tool;
};
const cite = (cell: number, textOf: string) => `<cite k="1" cell="${cell}" receipt="${RECEIPT}">${textOf}</cite>`;
const ONE = stream([CARS], `Lahore's register held ${cite(0, CARS.display)} small cars on 30 June 2023.`);

// --- the scope of a record -----------------------------------------------------------------------

describe("a record's scope is its own", () => {
  it("is recognised by its request type or its tool name, and nothing else is", () => {
    expect(isActivity(result())).toBe(true);
    expect(isActivity({ ...result(), request_type: null, name: "x" } as ToolResultEvent, "query_activity")).toBe(true);
    expect(isActivity({ ...result(), request_type: "query_emissions", name: "query_emissions" } as ToolResultEvent)).toBe(false);
    expect(isActivity(null)).toBe(false);
  });

  it("says what was counted, where, when and by whom, then what the figure is not", () => {
    const note = activityNote(result());
    expect(note).toBe(`${RECORD_LEAD}: Registered vehicles · Lahore · 30 June 2023 · Provincial vehicle registrations. Registered stock at 30 June is not traffic and not an active fleet.`);
    // the estimate's furniture is gone: no basis, no warming potentials, no land-use exclusion, no fiscal year
    for (const word of ["warming", "AR5", "land use", "estimates for", "FY", "2023-24", "2023–24"]) expect(note).not.toContain(word);
  });

  it("names a computed total as computed, and only when there is one", () => {
    expect(isComputedTotal(TOTAL as never)).toBe(true);
    expect(isComputedTotal(CARS as never)).toBe(false);
    expect(activityNote(result([CARS, BIKES, TOTAL]))).toContain(TOTAL_NOTE);
    expect(activityNote(result([CARS, BIKES]))).not.toContain(TOTAL_NOTE);
  });

  it("lists places by name and spans several dates, never with a count of its own", () => {
    const karachi = { ...CARS, i: 1, attrs: { ...CARS.attrs, location: "Karachi", period: "2021-06-30", period_label: "30 June 2021" } };
    const note = activityNote(result([karachi, CARS]));
    expect(note).toContain("Karachi and Lahore");
    expect(note).toContain("30 June 2021 to 30 June 2023");
  });

  it("gives the details the record's own rows, with no gas, basis or configuration", () => {
    const rows = activityScopeRows(result());
    expect(rows.map((r) => r.name)).toEqual(["Record", "Place", "Date", "Source", "Evidence", "Period chosen"]);
    expect(rows.find((r) => r.name === "Place")?.value).toBe("Lahore");
    expect(rows.find((r) => r.name === "Date")?.value).toBe("30 June 2023");
    expect(rows.find((r) => r.name === "Period chosen")).toMatchObject({ value: "the newest held", muted: true });
    // a period the reader named is not "chosen" for them, and a fiscal series is a Period, not a Date
    const named = activityScopeRows(result([{ ...CARS, attrs: { ...CARS.attrs, period_type: "Fiscal year", period_label: "FY2023-24" } }], { ...CONTEXT, defaults_applied: [] }));
    expect(named.map((r) => r.name)).toEqual(["Record", "Place", "Period", "Source", "Evidence"]);
    for (const r of rows) expect(r.value).not.toMatch(/fact_activity|_/);
  });
});

// --- the cards beside a record ---------------------------------------------------------------------

describe("nothing unrelated is attached to a record", () => {
  const answer = { text: "", citations: [], receipts: [RECEIPT] } as unknown as AnswerEvent;

  it("draws no chart, for one row or for many", () => {
    for (const cells of [[CARS], [CARS, BIKES], [CARS, BIKES, TOTAL]]) {
      const events = stream(cells, "x");
      expect(attachmentOf(principalOf(events), answer, items(events))).toBe("none");
    }
    // and not by the accident of a comma in the display: a small ungrouped count is refused a chart too
    const small = [{ ...CARS, display: "812", display_short: "812", group: { category: "a" } }, { ...BIKES, display: "640", display_short: "640", group: { category: "b" } }];
    expect(chartKind(small as never)).toBe("bars");
    const events = stream(small, "x");
    expect(attachmentOf(principalOf(events), answer, items(events))).toBe("none");
  });

  it("does not offer an uncertainty interval a register does not have", () => {
    expect(followUps(principalOf(ONE), answer, false)).toEqual([]);
  });

  it("is named a source record, not a national total", () => {
    expect(restedOn(result(), INPUT)).toBe("Source record");
  });

  it("offers no map move: a register's date is not a fiscal year and its place is a name", () => {
    const state: ExplorerState = resolveState({ gas: "CH4", geo: "Sindh", level: "adm1" }, D);
    for (const input of [INPUT, { ...INPUT, periods: ["2023"] }, { ...INPUT, periods: ["2023-06-30"], total: true }]) {
      expect(mapPatchFromInput(input, "query_activity")).toEqual({});
      expect(movesMap(state, mapPatchFromInput(input, "query_activity"))).toBe(false);
    }
    expect(stateFromRequest({ name: "query_activity", body: { ...INPUT, periods: ["2023"] } })).toEqual({});
  });
});

// --- on screen -------------------------------------------------------------------------------------

const D = { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" };
const release = RELEASE as unknown as ReleaseInfo;
function ctx(setState: ExplorerContextValue["setState"], state: ExplorerState): ExplorerContextValue {
  return { state, setState, release, labels: releaseLabels(release), dims: releaseDims(release), defaults: D, contract: undefined, agent: { enabled: true, model: "test", reason: "", library: "lib", usable: true }, isMobile: false };
}
function sse(events: [string, unknown][]): Response {
  const text = events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
  const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } });
  return { ok: true, status: 200, statusText: "OK", headers: new Headers({ "content-type": "text/event-stream" }), body } as unknown as Response;
}
function mount(setState = vi.fn(), state: ExplorerState = resolveState({ gas: "CH4", geo: "Sindh", level: "adm1" }, D)) {
  render(
    <Providers>
      <ExplorerContext.Provider value={ctx(setState as unknown as ExplorerContextValue["setState"], state)}>
        <AskDock />
      </ExplorerContext.Provider>
    </Providers>,
  );
  return setState;
}
async function askQuestion(text: string) {
  const box = screen.getByTestId("question") as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: text } });
  await act(async () => { fireEvent.keyDown(box, { key: "Enter" }); });
  await waitFor(() => expect(["done", "failed"]).toContain(screen.getByTestId("turn").getAttribute("data-status")));
}

describe("the Lahore question, on screen", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("answers with the record's scope while the map shows somewhere else", async () => {
    const replay = envelope([{ display: CARS.display, display_short: CARS.display_short }], { receipt: RECEIPT });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).endsWith("/ask")) return sse(ONE);
      if (String(url).includes("/receipt/")) return { ok: true, status: 200, statusText: "OK", json: async () => replay } as unknown as Response;
      throw new Error(`unexpected fetch ${url}`);
    }));
    const setState = mount();
    await askQuestion("How many cars are in Lahore?");
    const card = screen.getByTestId("answer-card");
    expect(within(card).getByTestId("answer-part-answer")).toHaveTextContent("1,561,386");
    const note = within(card).getByTestId("scope-note");
    expect(note).toHaveTextContent("Lahore");
    expect(note).toHaveTextContent("30 June 2023");
    expect(note).toHaveTextContent("Provincial vehicle registrations");
    expect(note).toHaveTextContent("not traffic");
    // nothing of the map's scope, and nothing of an estimate's
    for (const word of ["Sindh", "Methane", "CH₄", "warming", "land use", "national"]) expect(note.textContent).not.toContain(word);
    expect(within(card).queryByTestId("answer-attachment")).toBeNull();
    expect(within(card).queryByTestId("show-on-map")).toBeNull();
    expect(within(card).queryByTestId("follow-ups")).toBeNull();
    // the map was not moved: whatever the dock wrote to the URL state, it wrote none of the map's keys
    const written = setState.mock.calls.flatMap((call) => Object.keys((call[0] ?? {}) as Record<string, unknown>));
    for (const key of MAP_KEYS) expect(written).not.toContain(key);
    // the details: the record's scope, its source, the whole use note, and the way to reproduce it
    fireEvent.click(within(card).getByTestId("provenance-action"));
    const detail = within(card).getByTestId("evidence-detail");
    expect(within(detail).getAllByTestId("scope-row").map((el) => el.textContent)).toEqual(
      ["Record Registered vehicles", "Place Lahore", "Date 30 June 2023", "Source Provincial vehicle registrations", "Evidence Reported", "Period chosen the newest held"]);
    expect(within(detail).getByTestId("detail-record-source")).toHaveTextContent("Provincial Bureaux of Statistics");
    expect(within(detail).getByTestId("detail-record-note")).toHaveTextContent("a scrapped vehicle stays in the total");
    expect(within(detail).getByTestId("reproduce-link")).toBeInTheDocument();
    expect(within(detail).queryByTestId("explore-permalink")).toBeNull();
    expect(detail.textContent).not.toMatch(/fact_activity|query_activity/);
  });

  it("a timeout at the hosting edge reads as a sentence and can be asked again", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).endsWith("/ask")) {
        calls += 1;
        if (calls === 1) return { ok: false, status: 502, statusText: "", headers: new Headers({ "content-type": "text/html" }), json: async () => { throw new Error("html"); } } as unknown as Response;
        return sse(ONE);
      }
      return { ok: true, status: 200, statusText: "OK", json: async () => envelope([], { receipt: RECEIPT }) } as unknown as Response;
    }));
    mount();
    await askQuestion("How many cars are in Lahore?");
    const error = screen.getByTestId("error-card");
    expect(error.getAttribute("data-code")).toBe("upstream_unavailable");
    expect(error).toHaveTextContent(ERROR_TITLES.upstream_unavailable);
    expect(error).toHaveTextContent("The question was not lost: try again.");
    // the three raw forms the reader was shown
    expect(error.textContent).not.toMatch(/http_502|502 502|http 502|upstream_unavailable/);
    // the question is still there, and one click asks it again
    expect(screen.getByTestId("user-message")).toHaveTextContent("How many cars are in Lahore?");
    await act(async () => { fireEvent.click(within(error).getByTestId("error-retry")); });
    await waitFor(() => expect(screen.getAllByTestId("answer-card")).toHaveLength(1));
    expect(calls).toBe(2);
    expect(screen.getByTestId("answer-card")).toHaveTextContent("1,561,386");
  });
});

describe("which errors are worth asking again", () => {
  it("offers a retry when the question was fine and never when it was the problem", () => {
    for (const code of ["upstream_unavailable", "turn_timeout", "network_error", "stream_ended"]) expect(RETRYABLE.has(code)).toBe(true);
    expect(errorTitle("turn_timeout")).toBe(ERROR_TITLES.turn_timeout);
    for (const code of ["bare_numbers", "agent_disabled", "budget_exhausted", "turn_limit", "model_refusal"]) expect(RETRYABLE.has(code)).toBe(false);
    expect(errorTitle("upstream_unavailable")).not.toMatch(/\d|http/i);
  });
});
