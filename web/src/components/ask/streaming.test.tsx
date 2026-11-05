/**
 * The answer streams: the server sends each checked line as `answer_delta`, takes a draft back with
 * `answer_reset` (before a tool call, or to correct it), and the final `answer` replaces the draft.
 * These tests watch a stream arrive event by event, so the draft can be seen before the answer.
 */
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import { resolveState } from "@/lib/urlState";
import type { ReleaseInfo } from "@/lib/envelope";
import { RELEASE } from "@/__tests__/fixtures";
import { AskDock } from "./AskDock";
import { settledDraft } from "./answerText";
import { CHECKING_TEXT } from "./ReasoningTimeline";
import { loadConversation, saveConversation } from "./store";
import { timelineOf } from "./timeline";
import type { AskEvent } from "./types";

const DEFAULTS = { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" };
const CID = "c0ffee00deadbeef";
const RECEIPT = "0123456789abcdef0123456789abcdef";
const cite = (text: string) => `<cite k="1" cell="0" receipt="${RECEIPT}">${text}</cite>`;
const ev = (name: string, data: unknown): AskEvent => ({ name, data });

describe("the draft, from the events", () => {
  it("grows with each line, and the final answer replaces it", () => {
    const events = [ev("answer_delta", { text: "One.\n" }), ev("answer_delta", { text: "Two.\n" })];
    expect(timelineOf(events).draft).toBe("One.\nTwo.\n");
    const done = timelineOf([...events, ev("answer", { text: "One.\nTwo.", receipts: [], citations: [], scope: null })]);
    expect(done.draft).toBe("");
    expect(done.answer?.text).toBe("One.\nTwo.");
  });

  it("is dropped quietly before a tool call, and with 'checking' for a correction", () => {
    const tools = timelineOf([ev("answer_delta", { text: "Let me look.\n" }), ev("answer_reset", { reason: "tools" })]);
    expect(tools.draft).toBe("");
    expect(tools.checking).toBe(false);
    const corr = timelineOf([ev("answer_delta", { text: "A.\n" }), ev("answer_reset", { reason: "correction" })]);
    expect(corr.draft).toBe("");
    expect(corr.checking).toBe(true);
    // the corrected answer's first line ends the check
    expect(timelineOf([ev("answer_reset", { reason: "correction" }), ev("answer_delta", { text: "B.\n" })]).checking).toBe(false);
  });

  it("is withdrawn whole when the answer is withheld", () => {
    const tl = timelineOf([ev("answer_delta", { text: "A line.\n" }), ev("error", { code: "bare_numbers", message: "x" })]);
    expect(tl.draft).toBe("");
    expect(tl.items.map((i) => i.kind)).toEqual(["error"]);
  });

  it("holds a table's header line back until its separator arrives", () => {
    expect(settledDraft("Counts:\n| Class | Count |\n")).toBe("Counts:\n");
    expect(settledDraft("Counts:\n| Class | Count |\n|---|---:|\n")).toBe("Counts:\n| Class | Count |\n|---|---:|\n");
    expect(settledDraft("| Class | Count |\n|---|---:|\n| Cars | 12 |\n")).toBe("| Class | Count |\n|---|---:|\n| Cars | 12 |\n");
    expect(settledDraft("Plain.\n")).toBe("Plain.\n");
  });

  it("is not stored with a finished conversation: its answer event already holds the text", () => {
    saveConversation({
      conversation_id: CID, updated: 0,
      turns: [{ id: "t1", message: "q", ui_state: {}, status: "done", events: [ev("answer_delta", { text: "A.\n" }), ev("answer", { text: "A.", receipts: [], citations: [], scope: null })] }],
    });
    expect(loadConversation(CID)?.turns[0].events.map((e) => e.name)).toEqual(["answer"]);
  });
});

// --- watching a stream arrive --------------------------------------------------------------

/** An SSE body the test feeds one event at a time. */
function controlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  const encoder = new TextEncoder();
  return {
    response: { ok: true, status: 200, statusText: "OK", headers: new Headers({ "content-type": "text/event-stream" }), body } as unknown as Response,
    send: async (name: string, data: unknown) => {
      await act(async () => {
        controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));
        await new Promise((r) => setTimeout(r, 0));
      });
    },
    close: async () => { await act(async () => { controller.close(); await new Promise((r) => setTimeout(r, 0)); }); },
  };
}

function mount() {
  const release = RELEASE as unknown as ReleaseInfo;
  const value: ExplorerContextValue = {
    state: resolveState({}, DEFAULTS), setState: vi.fn(), release, labels: releaseLabels(release), dims: releaseDims(release),
    defaults: DEFAULTS, contract: undefined, agent: { enabled: true, model: "claude-sonnet-5", reason: "", library: "lib", usable: true }, isMobile: false,
  };
  render(
    <Providers>
      <ExplorerContext.Provider value={value}>
        <AskDock />
      </ExplorerContext.Provider>
    </Providers>,
  );
}

async function ask(text: string) {
  const box = screen.getByTestId("question") as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: text } });
  await act(async () => { fireEvent.keyDown(box, { key: "Enter" }); });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("the panel while an answer streams", () => {
  it("shows each line as it arrives, then the answer in its place", async () => {
    const stream = controlledStream();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).endsWith("/ask") ? stream.response : ({ ok: false, status: 404, statusText: "x", json: async () => ({}) } as Response))));
    mount();
    await ask("What were Pakistan's emissions?");
    await stream.send("status", { phase: "model", turn: 1 });
    expect(screen.queryByTestId("answer-draft")).toBeNull();
    await stream.send("answer_delta", { text: `In 2023-24 Pakistan emitted ${cite("469.64")} ${cite("Mt CO₂e")}.\n` });
    const draft = await screen.findByTestId("answer-draft");
    expect(draft).toHaveTextContent("In 2023-24 Pakistan emitted 469.64 Mt CO₂e.");
    // the figure is already the server's, drawn as a cite
    expect(draft.querySelector('[data-testid="cite"]')).toHaveTextContent("469.64");
    // still working: the working line stays under the draft
    expect(screen.getByTestId("provenance")).toHaveAttribute("data-live", "1");
    await stream.send("answer_delta", { text: "\nAgriculture is the largest source.\n" });
    expect(screen.getByTestId("answer-draft")).toHaveTextContent("Agriculture is the largest source.");
    await stream.send("answer", { text: `In 2023-24 Pakistan emitted ${cite("469.64")} ${cite("Mt CO₂e")}.\n\nAgriculture is the largest source.`, receipts: [], citations: [], scope: null, elapsed_s: 1 });
    await stream.send("done", { conversation_id: CID, usage: { input_tokens: 1, output_tokens: 1 }, cost_estimate_usd: null });
    await stream.close();
    await waitFor(() => expect(screen.getByTestId("turn").getAttribute("data-status")).toBe("done"));
    expect(screen.queryByTestId("answer-draft")).toBeNull();
    expect(screen.getByTestId("answer-part-answer")).toHaveTextContent("Agriculture is the largest source.");
  });

  it("says it is checking the figures while a taken-back draft is rewritten", async () => {
    const stream = controlledStream();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).endsWith("/ask") ? stream.response : ({ ok: false, status: 404, statusText: "x", json: async () => ({}) } as Response))));
    mount();
    await ask("Total?");
    await stream.send("answer_delta", { text: "A first line.\n" });
    expect(await screen.findByTestId("answer-draft")).toHaveTextContent("A first line.");
    await stream.send("answer_reset", { reason: "correction" });
    expect(screen.queryByTestId("answer-draft")).toBeNull();
    expect(screen.getByTestId("provenance")).toHaveTextContent(CHECKING_TEXT);
    await stream.send("answer_delta", { text: "The corrected line.\n" });
    expect(screen.getByTestId("answer-draft")).toHaveTextContent("The corrected line.");
    expect(screen.getByTestId("provenance")).not.toHaveTextContent(CHECKING_TEXT);
    await stream.close();
  });
});
