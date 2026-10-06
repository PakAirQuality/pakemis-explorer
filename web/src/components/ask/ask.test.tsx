/**
 * The Ask dock over a scripted SSE body built from the API's real event shapes (the
 * `adm1_punjab_agriculture` golden's receipt and display, the `refuse_ar6_adm2` golden's
 * refusal, the set_map_view action of api/tests/test_ask.py): the timeline renders in arrival
 * order, the cited number is the tool result's display, the refusal is a RefusalCard, the map
 * action reaches setState, a 503 is the DisabledCard, and the parser survives chunk boundaries.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import type { ReleaseInfo } from "@/lib/envelope";
import { resolveState, type ExplorerState } from "@/lib/urlState";
import { RELEASE } from "@/__tests__/fixtures";
import { AskDock } from "./AskDock";
import { createSseParser, parseSse } from "./useAskStream";
import { timelineOf } from "./timeline";
import { STORE_PREFIX } from "./store";

const pathname = vi.hoisted(() => ({ value: "/" })); // the workspace carries the map
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

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

/** The /ask stream; the answer card's replay of a receipt (GET /receipt/{r}) is answered 404 so only the stream's strings reach the screen. */
function askFetch(events: [string, unknown][]) {
  return vi.fn(async (url: string) => {
    if (String(url).endsWith("/ask")) return sseResponse(sseBody(events));
    return { ok: false, status: 404, statusText: "Not Found", json: async () => ({ error: "unknown_receipt", error_class: "UnknownReceipt", message: "no such receipt", limitation_id: null, detail: {} }) } as unknown as Response;
  });
}
function askCalls(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter((c) => String(c[0]).endsWith("/ask"));
}

function sseResponse(text: string, chunkSize = 37): Response {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));
  return { ok: true, status: 200, statusText: "OK", headers: new Headers({ "content-type": "text/event-stream" }), body: streamOf(chunks) } as unknown as Response;
}

const DEFAULTS = { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" };
const base: ExplorerState = resolveState({}, DEFAULTS);

function ctx(setState = vi.fn(), agent = { enabled: true, model: "claude-sonnet-5", reason: "", library: "lib", usable: true }, state = base): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState, release, labels: releaseLabels(release), dims: releaseDims(release), defaults: DEFAULTS, contract: undefined, agent, isMobile: false };
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
  it("a pollutant view is shown, suggested and SENT as a pollutant view, and the answer keeps the scope it was asked under", async () => {
    // The panel said "All gases" over a PM₂.₅ view, offered "How certain is the 469.64 Mt CO₂e
    // estimate?", and sent a ui_state with no pollutant in it - so the model answered in CO₂e.
    const fetchSpy = vi.fn(async (url: string) => (String(url).endsWith("/ask") ? sseResponse(sseBody(EVENTS)) : ({ ok: true, status: 200, statusText: "OK", json: async () => ({}) } as Response)));
    vi.stubGlobal("fetch", fetchSpy);
    const pm25 = resolveState({ pol: "PM2.5" }, DEFAULTS);
    const view = mount(ctx(vi.fn(), undefined, pm25));
    expect(screen.getAllByTestId("ask-scope-chip").map((c) => c.textContent)).toEqual(["Pakistan", "PM₂.₅ emissions", "2023–24"]);
    const offered = screen.getAllByTestId("suggestion").map((s) => s.textContent ?? "");
    expect(offered[0]).toBe("What are Pakistan's largest sources of PM₂.₅?");
    for (const q of offered) {
      expect(q).not.toContain("CO₂e");
      expect(q).not.toMatch(/How certain/);
      expect(q).not.toMatch(/\d+\.\d+/);
    }
    // no greenhouse total is fetched to decorate a question on a pollutant view
    expect((fetchSpy.mock.calls as unknown as [string][]).some((c) => String(c[0]).includes("/query/emissions"))).toBe(false);
    await askQuestion("Explain the number currently shown.");
    await waitFor(() => expect(screen.getByTestId("turn").getAttribute("data-status")).toBe("done"));
    const ask = (fetchSpy.mock.calls as unknown as [string, RequestInit][]).find((c) => String(c[0]).endsWith("/ask"))!;
    const body = JSON.parse(String(ask[1].body));
    expect(body.ui_state).toEqual({ level: "adm1", period: "FY2023-24", config: "REF_2023_24", pol: "PM2.5", metric: "air_pollutant", unit: "kt", coverage: "covered sources only; grid power is a screening scenario outside the total" });
    expect(screen.getByTestId("turn-scope")).toHaveTextContent("Asked about Pakistan · PM₂.₅ emissions · 2023–24");
    // THE READER CHANGES THE FILTERS. The context row follows them - it is the next question's -
    // and the answer already given keeps saying what IT was about.
    view.rerender(
      <Providers>
        <ExplorerContext.Provider value={ctx(vi.fn(), undefined, resolveState({ period: "FY2020-21", geo: "Punjab" }, DEFAULTS))}>
          <AskDock />
        </ExplorerContext.Provider>
      </Providers>,
    );
    expect(screen.getAllByTestId("ask-scope-chip").map((c) => c.textContent)).toEqual(["Punjab", "All gases", "2020–21"]);
    expect(screen.getByTestId("turn-scope")).toHaveTextContent("Asked about Pakistan · PM₂.₅ emissions · 2023–24");
  });
  it("streams a turn: thinking, tool call, result, map action, refusal, answer with cites, usage", async () => {
    const fetchSpy = vi.fn(async () => sseResponse(sseBody(EVENTS)));
    vi.stubGlobal("fetch", fetchSpy);
    const setState = vi.fn();
    mount(ctx(setState));
    expect(screen.getAllByTestId("suggestion").length).toBeGreaterThan(2);
    expect(screen.getByText("How have emissions changed since 2020–21?")).toBeTruthy(); // the release's short label, never the id
    // the scope is the composer's own chip row: it is sent with every question, so it belongs
    // beside the box rather than behind a control a reader has to know to press
    expect(screen.getByTestId("ask-scope")).toHaveTextContent("Using this view:");
    expect(screen.getAllByTestId("ask-scope-chip").map((c) => c.textContent))
      .toEqual(["Pakistan", "All gases", "2023–24"]);
    await askQuestion("How much did Punjab's agriculture emit in FY2023-24, and show it on the map");
    await waitFor(() => expect(screen.getByTestId("turn").getAttribute("data-status")).toBe("done"));
    // the request carried ui_state = the URL scope and no history on the first turn. Pick the /ask
    // call by name: the empty state also asks the release for the figure it puts in one suggested
    // question, so the first call this spy saw is not necessarily the question.
    const calls = fetchSpy.mock.calls as unknown as [string, RequestInit][];
    const ask = calls.find((c) => String(c[0]).endsWith("/ask"));
    expect(ask).toBeTruthy();
    const body = JSON.parse(String(ask![1].body));
    expect(body.ui_state).toEqual({ level: "adm1", period: "FY2023-24", config: "REF_2023_24", gwp: "AR5", view: "all", metric: "greenhouse_gases" });
    expect(body.client_history).toEqual([]);
    // the answer names the scope it was asked under
    expect(screen.getByTestId("turn-scope")).toHaveTextContent("Asked about Pakistan · All gases · 2023–24");
    // THE TURN IS A CHAT MESSAGE NOW: the bubble, the answer, and the notices that concern the
    // reader. The model's reasoning, the per-call tool cards, the "How this was answered" fold and
    // the token line are all gone from the screen.
    const turn = screen.getByTestId("turn");
    expect(turn.querySelector('[data-testid="tool-card"]')).toBeNull();
    expect(screen.queryByTestId("thinking-card")).toBeNull();
    expect(screen.queryByTestId("how-answered")).toBeNull();
    expect(screen.queryByTestId("usage-line")).toBeNull();
    const kinds = Array.from(turn.querySelectorAll("[data-testid]"))
      .map((el) => el.getAttribute("data-testid"))
      .filter((t) => ["user-message", "turn-refusal", "answer-card", "provenance"].includes(t ?? ""));
    expect(kinds).toEqual(["user-message", "turn-refusal", "answer-card", "provenance"]);
    // THE SIX-CHIP "moved the map" BLOCK IS GONE. It reported Config / Gwp / Level / Period /
    // Sector / "View all three views" and a raw URL - internal state, none of it an answer to
    // anything. The move is one quiet line with a way back.
    expect(screen.queryByTestId("map-action")).toBeNull();
    expect(screen.getByTestId("map-moved")).toHaveTextContent("Map updated to");

    // the cited number is still the tool result's display, and clicking it opens the evidence -
    // the same destination the tool card used to be
    const cites = screen.getAllByTestId("cite");
    expect(cites.map((c) => c.textContent)).toEqual([DISPLAY, UNIT]);
    expect(cites[0].getAttribute("data-k")).toBe("1");
    expect(cites[0].getAttribute("data-receipt")).toBe(RECEIPT);
    expect(screen.queryByTestId("evidence-detail")).toBeNull();
    fireEvent.click(cites[0]);
    expect(screen.getByTestId("evidence-detail")).toBeInTheDocument();
    // the way back to the source is a link, not a hash printed into the panel
    expect(screen.getByTestId("reproduce-link")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-detail").textContent).not.toContain(RECEIPT);

    // A REFUSAL IS ONE SENTENCE, NOT A CLASS NAME AND AN ID TWICE. The shared card led with
    // "Refused: GrainUnavailable grain_unavailable limitation grain_unavailable" above an answer
    // that explained the same thing in prose. The release's own message is what a reader needs.
    const refusal = screen.getByTestId("turn-refusal");
    expect(refusal).toHaveTextContent("AR6 CO2e is not carried at ADM2");
    expect(refusal.textContent).not.toContain("ar6_adm2_ne");
    expect(refusal.textContent).not.toContain("NotEstimated");
    expect(refusal.textContent).not.toContain("not_estimated");
    // an explicit map request still moves the map, and undoing it NAMES EVERY KEY IT TOUCHED -
    // a key that was unset goes back as null, because omitting it could never unset anything
    expect(setState).toHaveBeenCalledWith({ geo: "Punjab", level: "adm1", period: "FY2023-24", sector: "agriculture" });
    fireEvent.click(screen.getByTestId("map-undo"));
    const undo = setState.mock.calls.map((c) => c[0]).at(-1) as Record<string, unknown>;
    expect(Object.keys(undo).sort()).toEqual(["geo", "level", "period", "sector"]);
    expect(undo.geo).toBeNull();          // there was no province before; null is what unsets it
    expect(undo.sector).toBeNull();
    // the conversation id went to the URL and the log to localStorage
    expect(setState).toHaveBeenCalledWith({ c: CID }, { history: "replace" });
    const stored = JSON.parse(window.localStorage.getItem(STORE_PREFIX + CID) ?? "null");
    expect(stored.turns).toHaveLength(1);
    expect(stored.turns[0].events.map((e: { name: string }) => e.name)).toEqual(EVENTS.map(([n]) => n));
    // NEITHER THE TOKENS NOR THE ELAPSED TIME ARE ON SCREEN. Both are the operator's business, and
    // both are still in the stream and the stored transcript - only nothing renders them.
    const dockText = screen.getByTestId("ask-dock").textContent ?? "";
    expect(dockText).not.toContain("in 400");
    expect(dockText).not.toContain("0.0031");
    expect(dockText).not.toContain("4.213");
    // the call's own state is reachable from the evidence fold instead of a per-card "Show on map"
    expect(screen.getByTestId("explore-permalink")).toBeInTheDocument();
    // every decimal on screen is a string the stream carried
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const tokens: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) tokens.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
    expect(tokens.length).toBeGreaterThan(0);
    // "1.0" is the leading part of the release identity the footer prints (release_id, a server
    // string), not a figure. Allowed by name so a genuinely invented number still fails here.
    for (const t of tokens) expect([DISPLAY, SHORT, "0.0031", "4.213", "1.0"]).toContain(t);
    // the answer card's scope names the call's context through the labels
    expect(screen.getAllByTestId("scope-row").map((r) => r.textContent)).toContain("Geography Punjab (province)");
  });

  it("away from the workspace the call's state is a link in the details fold, and ?q= seeds one send", async () => {
    pathname.value = "/ask";
    const fetchSpy = askFetch(EVENTS);
    vi.stubGlobal("fetch", fetchSpy);
    const onSeeded = vi.fn();
    const value = ctx();
    const { rerender } = render(
      <Providers>
        <ExplorerContext.Provider value={value}>
          <AskDock seed="  What is Punjab's largest sector?  " onSeeded={onSeeded} />
        </ExplorerContext.Provider>
      </Providers>,
    );
    await waitFor(() => expect(screen.getByTestId("turn").getAttribute("data-status")).toBe("done"));
    expect(askCalls(fetchSpy)).toHaveLength(1);
    expect(JSON.parse(String((askCalls(fetchSpy)[0] as unknown as [string, RequestInit])[1].body)).message).toBe("What is Punjab's largest sector?");
    expect(onSeeded).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("user-message")).toHaveTextContent("What is Punjab's largest sector?");
    rerender(
      <Providers>
        <ExplorerContext.Provider value={value}>
          <AskDock seed="What is Punjab's largest sector?" onSeeded={onSeeded} />
        </ExplorerContext.Provider>
      </Providers>,
    );
    expect(askCalls(fetchSpy)).toHaveLength(1); // sent once, never again
    // away from the workspace the call's state is still reachable, as a link, from the details fold
    fireEvent.click(screen.getByTestId("provenance-action"));
    const link = screen.getByTestId("explore-permalink");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toContain("sector=agriculture");
    expect(link.getAttribute("href")).toContain("geo=Punjab");
    pathname.value = "/";
  });

  it("restores a conversation from the c parameter and sends it as client_history", async () => {
    const fetchSpy = askFetch(EVENTS);
    vi.stubGlobal("fetch", fetchSpy);
    mount(ctx());
    await askQuestion("first question");
    await waitFor(() => expect(screen.getByTestId("turn").getAttribute("data-status")).toBe("done"));
    // a fresh mount with ?c=<id> replays the stored log without a request
    const { unmount } = mount(ctx(vi.fn(), undefined, { ...base, c: CID }));
    expect(screen.getAllByTestId("answer-card").length).toBeGreaterThanOrEqual(2);
    expect(askCalls(fetchSpy)).toHaveLength(1);
    unmount();
  });

  it("a 503 fails ONE question and keeps the conversation, showing the server's own message", async () => {
    // DELIBERATELY CHANGED. This used to assert the opposite: a 503 replaced the whole panel with
    // the DisabledCard and deleted the turn. That was wrong before and is worse now, because the
    // server answers explanations without a provider key and returns 503 only for a question that
    // needs the query - so a visitor could ask three things happily and lose all three on the
    // fourth. The 429 path already kept the turn and showed an error card; this follows it. The
    // server's `message` was also being discarded in favour of the bare reason code.
    const reason = "no provider key is set in the API's environment";
    const message = "This question needs the inventory query, which needs the assistant's model. Explanations of the concepts and methods still work.";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, statusText: "Service Unavailable", json: async () => ({ error: "agent_disabled", reason, message }) }) as unknown as Response));
    mount(ctx());
    await askQuestion("how much did agriculture emit?");
    const card = await screen.findByTestId("error-card");
    expect(card).toHaveAttribute("data-code", "agent_disabled");
    expect(card).toHaveTextContent(message);
    // the question stays in the transcript, and the composer stays usable
    expect(screen.getByTestId("turn")).toBeTruthy();
    expect(screen.getByTestId("user-message")).toHaveTextContent("how much did agriculture emit?");
    expect(screen.queryByTestId("disabled-card")).toBeNull();
    expect((screen.getByTestId("question") as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("renders the DisabledCard without a request only when NEITHER the model nor the library is there", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mount(ctx(vi.fn(), { enabled: false, model: "", reason: "not mounted", library: "", usable: false }));
    expect(screen.getByTestId("disabled-card")).toHaveTextContent("not mounted");
    expect((screen.getByTestId("question") as HTMLTextAreaElement).disabled).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is usable with the explanation library alone, and does not claim a model it has not got", () => {
    // `enabled` tracks the MODEL and keeps doing so. Keying the panel off it meant a site with no
    // provider key rendered the disabled card and disabled the composer before sending anything,
    // so the prepared explanations - which need no key and answer most of what a visitor asks -
    // were unreachable from a browser.
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, body: null }) as unknown as Response);
    vi.stubGlobal("fetch", fetchSpy);
    mount(ctx(vi.fn(), { enabled: false, model: "", reason: "no provider key is set", library: "b4e422a0", usable: true }));
    expect(screen.queryByTestId("disabled-card")).toBeNull();
    expect((screen.getByTestId("question") as HTMLTextAreaElement).disabled).toBe(false);
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
    expect(screen.queryByTestId("answer-card")).toBeNull();
    // an errored turn carries no token line either - it never did belong to the reader
    expect(screen.queryByTestId("usage-line")).toBeNull();
    expect(screen.getByTestId("ask-dock").textContent).not.toContain("in 300");
  });
});
