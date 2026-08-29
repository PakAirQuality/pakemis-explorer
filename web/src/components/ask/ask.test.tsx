/**
 * The Ask dock over a scripted SSE body built from the API's real event shapes (the
 * `adm1_punjab_agriculture` golden's receipt and display, the `refuse_ar6_adm2` golden's
 * refusal, the set_map_view action of api/tests/test_ask.py): the timeline renders in arrival
 * order, the cited number is the tool result's display, the refusal is a RefusalCard, the map
 * action reaches setState, a 503 is the DisabledCard, and the parser survives chunk boundaries.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { RELEASE } from "@/__tests__/fixtures";
import { AskDock } from "./AskDock";
import { createSseParser, parseSse } from "./useAskStream";
import { timelineOf } from "./timeline";
import { STORE_PREFIX } from "./store";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const RECEIPT = "8328128a5bd1eca6b1a29ad79cf6d910";
const DISPLAY = "123.3050";
const SHORT = "123.31";
const UNIT = "Mt CO2e AR5";
const CID = "c0ffee00deadbeef";

/** The turn as the server streams it (payloads sort_keys=True, as router.py writes them). */
const EVENTS: [string, unknown][] = [
  ["status", { phase: "model", turn: 1 }],
  ["thinking", { text: "The user asks for Punjab's agriculture in FY2023-24;" }],
  ["thinking", { text: " query_emissions at adm1 answers it." }],
  ["tool_call", { id: "toolu_01", input: { geography_ids: ["Punjab"], geography_level: "adm1", periods: ["FY2023-24"], sectors: ["agriculture"] }, k: 1, name: "query_emissions" }],
  ["status", { k: 1, name: "query_emissions", phase: "tool" }],
  [
    "tool_result",
    {
      cells: [{ display: DISPLAY, display_short: SHORT, group: { province: "Punjab" }, i: 0, unit: UNIT }],
      context: { basis: "fiscal", configuration_id: "REF_2023_24", defaults_applied: ["basis", "configuration_id", "gwp_basis", "spatial_view"], geography_ids: ["Punjab"], geography_level: "adm1", gwp_basis: "AR5", periods: ["FY2023-24"], spatial_view: "all" },
      id: "toolu_01",
      k: 1,
      limitations_hit: ["lulucf_excluded"],
      n_values: 1,
      name: "query_emissions",
      receipt: RECEIPT,
      request_type: "query_emissions",
    },
  ],
  ["status", { phase: "model", turn: 2 }],
  ["tool_call", { id: "toolu_02", input: { geo: "Punjab", level: "adm1", period: "FY2023-24", sector: "agriculture" }, k: 2, name: "set_map_view" }],
  ["status", { k: 2, name: "set_map_view", phase: "tool" }],
  ["map_action", { geo: "Punjab", level: "adm1", period: "FY2023-24", sector: "agriculture" }],
  ["status", { phase: "model", turn: 3 }],
  ["tool_call", { id: "toolu_03", input: { geography_level: "adm2", gwp_basis: "AR6", periods: ["FY2023-24"] }, k: 3, name: "query_emissions" }],
  ["status", { k: 3, name: "query_emissions", phase: "tool" }],
  ["refusal", { detail: { notation_key: "NE" }, error: "not_estimated", error_class: "NotEstimated", id: "toolu_03", k: 3, limitation_id: "ar6_adm2_ne", message: "AR6 CO2e is not carried at ADM2", name: "query_emissions" }],
  ["status", { phase: "model", turn: 4 }],
  [
    "answer",
    {
      citations: [
        { attr: "display", cell: 0, k: 1, receipt: RECEIPT, text: DISPLAY },
        { attr: "unit", cell: 0, k: 1, receipt: RECEIPT, text: UNIT },
      ],
      elapsed_s: 4.213,
      receipts: [RECEIPT],
      text: `Punjab's agriculture emitted <cite k="1" cell="0" receipt="${RECEIPT}">${DISPLAY}</cite> <cite k="1" cell="0" receipt="${RECEIPT}">${UNIT}</cite> in FY2023-24 (reference configuration, AR5, LULUCF excluded).\n\nAR6 by district is **not estimated** (limitation ar6_adm2_ne), so no district figure on that basis can be given.`,
    },
  ],
  ["done", { conversation_id: CID, cost_estimate_usd: 0.0031, usage: { cache_creation_input_tokens: 0, cache_read_input_tokens: 0, input_tokens: 400, output_tokens: 80 } }],
];

/** sse-starlette's wire form: `\r\n` line ends, a `: ping` comment between events. */
function sseBody(events: [string, unknown][]): string {
  return events.map(([name, data], i) => `${i === 3 ? ": ping\r\n\r\n" : ""}event: ${name}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`).join("");
}

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

function sseResponse(text: string, chunkSize = 37): Response {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));
  return { ok: true, status: 200, statusText: "OK", headers: new Headers({ "content-type": "text/event-stream" }), body: streamOf(chunks) } as unknown as Response;
}

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, panel: null, ask: true, c: null, cam: null, raster: false, view3d: false };

function ctx(setState = vi.fn(), agent = { enabled: true, model: "claude-sonnet-5", reason: "" }, state = base): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState, release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: undefined, agent, isMobile: false };
}

function mount(value: ExplorerContextValue) {
  return render(
    <Providers>
      <ExplorerContext.Provider value={value}>
        <AskDock />
      </ExplorerContext.Provider>
    </Providers>,
  );
}

async function askQuestion(text: string) {
  const box = screen.getByTestId("question") as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(box, { key: "Enter" });
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("SSE parser", () => {
  it("reassembles an event split across chunks, joins multi-line data and skips keep-alives", () => {
    const p = createSseParser();
    const a = p.feed(": ping\r\n\r\nevent: tool_re");
    expect(a).toEqual([]);
    const b = p.feed('sult\r\ndata: {"k": 1,\r\ndata:  "display": "123.3050"}\r\n\r');
    expect(b).toEqual([]);
    const c = p.feed("\nevent: done\ndata: {}\n\n");
    expect(c).toEqual([
      { name: "tool_result", data: '{"k": 1,\n "display": "123.3050"}' },
      { name: "done", data: "{}" },
    ]);
    expect(JSON.parse(c[0].data)).toEqual({ k: 1, display: "123.3050" });
    expect(p.end()).toEqual([]);
    expect(parseSse("data: last").map((e) => e.name)).toEqual(["message"]);
  });
  it("parses the whole scripted body into the server's event sequence", () => {
    const events = parseSse(sseBody(EVENTS));
    expect(events.map((e) => e.name)).toEqual(EVENTS.map(([n]) => n));
    const tl = timelineOf(events.map((e) => ({ name: e.name, data: JSON.parse(e.data) })));
    expect(tl.items.map((i) => i.kind)).toEqual(["thinking", "tool", "tool", "map_action", "tool", "answer"]);
    expect(tl.done?.conversation_id).toBe(CID);
  });
});

describe("AskDock", () => {
  it("streams a turn: thinking, tool call, result, map action, refusal, answer with cites, usage", async () => {
    const fetchSpy = vi.fn(async () => sseResponse(sseBody(EVENTS)));
    vi.stubGlobal("fetch", fetchSpy);
    const setState = vi.fn();
    mount(ctx(setState));
    expect(screen.getAllByTestId("suggestion").length).toBeGreaterThan(2);
    expect(screen.getByText("What is Pakistan's largest sector in 2023–24?")).toBeTruthy(); // the release's short label, never the id
    await askQuestion("How much did Punjab's agriculture emit in FY2023-24, and show it on the map");
    await waitFor(() => expect(screen.getByTestId("turn").getAttribute("data-status")).toBe("done"));
    // the request carried ui_state = the URL scope and no history on the first turn
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith("/ask")).toBe(true);
    const body = JSON.parse(String(init.body));
    expect(body.ui_state).toEqual({ level: "adm1", period: "FY2023-24", config: "REF_2023_24", gwp: "AR5", view: "all" });
    expect(body.client_history).toEqual([]);
    // arrival order
    const turn = screen.getByTestId("turn");
    const kinds = Array.from(turn.querySelectorAll("[data-testid]"))
      .map((el) => el.getAttribute("data-testid"))
      .filter((t) => ["thinking-card", "tool-card", "map-action", "refusal-card", "answer-bubble", "usage-line"].includes(t ?? ""));
    expect(kinds).toEqual(["thinking-card", "tool-card", "tool-card", "map-action", "tool-card", "refusal-card", "answer-bubble", "usage-line"]);
    // thinking merged from two deltas, collapsed
    expect(screen.getByTestId("thinking-card")).toHaveTextContent("The user asks for Punjab's agriculture in FY2023-24; query_emissions at adm1 answers it.");
    // the tool card: humanised name, chips through the labels, the result's display and unit verbatim, the Result details line
    const cards = screen.getAllByTestId("tool-card");
    expect(cards[0]).toHaveTextContent("Query emissions");
    expect(within(cards[0]).getByText("Agriculture")).toBeTruthy();
    const cell = within(cards[0]).getByTestId("result-cell");
    expect(cell).toHaveTextContent(`${SHORT} ${UNIT}`); // the card shows display_short; the display is its title
    expect(cell.textContent).not.toContain(DISPLAY);
    expect(cell).toHaveTextContent("Punjab");
    expect(within(cards[0]).getByText("LULUCF is excluded")).toBeTruthy();
    expect(within(cards[0]).getByTestId("receipt-footer")).toHaveTextContent("Result details");
    expect(within(cards[0]).getByTestId("receipt-footer")).toHaveAttribute("data-receipt", RECEIPT);
    expect(within(cards[0]).getByTestId("receipt-footer").textContent).not.toContain(RECEIPT.slice(0, 8));
    // the cited number is the tool result's display, and hovering it highlights that card and cell
    const cites = screen.getAllByTestId("cite");
    expect(cites.map((c) => c.textContent)).toEqual([DISPLAY, UNIT]);
    expect(cites[0].getAttribute("data-k")).toBe("1");
    expect(cites[0].getAttribute("data-receipt")).toBe(RECEIPT);
    fireEvent.mouseEnter(cites[0]);
    expect(cards[0].className).toContain("border-accent");
    expect(cell.className).toContain("bg-accent-soft");
    fireEvent.mouseLeave(cites[0]);
    expect(cards[0].className).not.toContain("border-accent");
    // the refusal is the shared RefusalCard with error_class and limitation_id
    const refusal = screen.getByTestId("refusal-card");
    expect(refusal).toHaveTextContent("Refused: NotEstimated");
    expect(refusal).toHaveTextContent("not_estimated");
    expect(refusal.getAttribute("data-limitation")).toBe("ar6_adm2_ne");
    expect(refusal).toHaveTextContent("AR6 CO2e is not carried at ADM2");
    // the map action reached setState with the URL keys, and is shown as a chip
    expect(setState).toHaveBeenCalledWith({ geo: "Punjab", level: "adm1", period: "FY2023-24", sector: "agriculture" });
    expect(screen.getByTestId("map-action")).toHaveTextContent("moved the map");
    // the conversation id went to the URL and the log to localStorage
    expect(setState).toHaveBeenCalledWith({ c: CID }, { history: "replace" });
    const stored = JSON.parse(window.localStorage.getItem(STORE_PREFIX + CID) ?? "null");
    expect(stored.turns).toHaveLength(1);
    expect(stored.turns[0].events.map((e: { name: string }) => e.name)).toEqual(EVENTS.map(([n]) => n));
    // usage and elapsed as received
    expect(screen.getByTestId("usage-line")).toHaveTextContent("in 400 · out 80 · ≈ $0.0031 · 4.213 s");
    // "Show on map" maps the call's input to URL state through stateFromRequest
    fireEvent.click(within(cards[0]).getByTestId("show-on-map"));
    expect(setState).toHaveBeenLastCalledWith(expect.objectContaining({ level: "adm1", period: "FY2023-24", geo: "Punjab", sector: "agriculture" }));
    // every decimal on screen is a string the stream carried
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const tokens: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) tokens.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
    expect(tokens.length).toBeGreaterThan(0);
    for (const t of tokens) expect([DISPLAY, SHORT, "0.0031", "4.213"]).toContain(t);
  });

  it("restores a conversation from the c parameter and sends it as client_history", async () => {
    const fetchSpy = vi.fn(async () => sseResponse(sseBody(EVENTS)));
    vi.stubGlobal("fetch", fetchSpy);
    mount(ctx());
    await askQuestion("first question");
    await waitFor(() => expect(screen.getByTestId("turn").getAttribute("data-status")).toBe("done"));
    // a fresh mount with ?c=<id> replays the stored log without a request
    const { unmount } = mount(ctx(vi.fn(), undefined, { ...base, c: CID }));
    expect(screen.getAllByTestId("answer-bubble").length).toBeGreaterThanOrEqual(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("shows the DisabledCard with the API's reason on a 503, listing the contract's functions", async () => {
    const reason = "ANTHROPIC_API_KEY is not set in the API's environment";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, statusText: "Service Unavailable", json: async () => ({ error: "agent_disabled", reason }) }) as unknown as Response));
    mount(ctx());
    await askQuestion("hello");
    const card = await screen.findByTestId("disabled-card");
    expect(card).toHaveTextContent(reason);
    expect(within(card).getByText("query_emissions")).toBeTruthy();
    expect(within(card).getByText("compare_emissions")).toBeTruthy();
    expect(screen.queryByTestId("turn")).toBeNull();
  });

  it("renders the DisabledCard without a request when the release says the agent is disabled", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mount(ctx(vi.fn(), { enabled: false, model: "", reason: "not mounted" }));
    expect(screen.getByTestId("disabled-card")).toHaveTextContent("not mounted");
    expect((screen.getByTestId("question") as HTMLTextAreaElement).disabled).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows a server error event as an inline error card with the code humanised", async () => {
    const events: [string, unknown][] = [
      ["status", { phase: "model", turn: 1 }],
      ["tool_call", { id: "toolu_01", input: { periods: ["FY2023-24"] }, k: 1, name: "query_emissions" }],
      ["tool_result", { cells: [{ display: "452.34662", i: 0, unit: UNIT }], context: {}, id: "toolu_01", k: 1, limitations_hit: [], n_values: 1, name: "query_emissions", receipt: "5eb40940d01be992a296f658fb91ab9e", request_type: "query_emissions" }],
      ["status", { phase: "correction", reason: "bare number 452.35" }],
      ["error", { code: "bare_numbers", message: "bare number 452.3" }],
      ["done", { conversation_id: CID, cost_estimate_usd: null, usage: { input_tokens: 300, output_tokens: 40 } }],
    ];
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(sseBody(events))));
    mount(ctx());
    await askQuestion("national total?");
    const err = await screen.findByTestId("error-card");
    expect(err).toHaveTextContent("Answer withheld: the draft typed a number that was not a placeholder");
    expect(err.getAttribute("data-code")).toBe("bare_numbers");
    expect(screen.getByTestId("correction")).toHaveTextContent("Draft rejected by the server");
    expect(screen.queryByTestId("answer-bubble")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("usage-line")).toHaveTextContent("in 300 · out 40"));
  });
});
