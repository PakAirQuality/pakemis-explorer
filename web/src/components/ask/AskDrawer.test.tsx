/**
 * The Ask drawer: closed until the nav's "Ask about this view" button or openAsk() opens it; the scope
 * line and the suggested questions follow the URL state (Punjab · agriculture, then the
 * national default); an openAsk request sends its question once with the scope it names;
 * Escape closes; on the /ask page the drawer stays out (the page is the panel).
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { AskFab } from "@/components/shell/AskFab";
import { NavCapsule } from "@/components/shell/NavCapsule";
import { openAsk, resetAskBus } from "@/lib/askBus";
import { releaseDims, releaseLabels } from "@/lib/release";
import { resolveState, type ExplorerState } from "@/lib/urlState";
import type { ReleaseInfo } from "@/lib/envelope";
import { RELEASE, stubViewport, stubWideViewport } from "@/__tests__/fixtures";
import { AskDrawer } from "./AskDrawer";
import { comparisonProvince, scopeLine, suggestedQuestions } from "./suggestions";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const DEFAULTS = { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" };
const national: ExplorerState = resolveState({}, DEFAULTS);
const punjabAg: ExplorerState = resolveState({ geo: "Punjab", sector: "agriculture" }, DEFAULTS);
const release = RELEASE as unknown as ReleaseInfo;
const labels = releaseLabels(release);
const dims = releaseDims(release);

function ctx(state: ExplorerState, setState = vi.fn(), isMobile = false): ExplorerContextValue {
  return { state, setState, release, labels, dims, defaults: DEFAULTS, contract: undefined, agent: { enabled: true, model: "gemini-test", reason: "", library: "lib", usable: true }, isMobile };
}

function sse(events: [string, unknown][]): Response {
  const text = events.map(([n, d]) => `event: ${n}\ndata: ${JSON.stringify(d)}\n\n`).join("");
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
  return { ok: true, status: 200, statusText: "OK", headers: new Headers(), body } as unknown as Response;
}
const DONE: [string, unknown][] = [
  ["answer", { text: "Yes.", receipts: [], citations: [], elapsed_s: 0.5, scope: null }],
  ["done", { conversation_id: "c0ffee00deadbeef", usage: { input_tokens: 1, output_tokens: 1 }, cost_estimate_usd: null }],
];

/**
 * The /ask POSTs a spy saw, and nothing else. The panel's empty state also asks the release for
 * the national total — the figure it puts in one suggested question — so counting every call would
 * count that too, and these tests are about how many times the QUESTION was sent.
 */
function askCalls(spy: { mock: { calls: unknown[][] } }): RequestInit[] {
  return spy.mock.calls.filter((c) => String(c[0]).includes("/ask")).map((c) => c[1] as RequestInit);
}
function askBody(spy: { mock: { calls: unknown[][] } }, i = 0): { message: string; ui_state: Record<string, unknown> } {
  return JSON.parse(String(askCalls(spy)[i].body));
}

function mount(value: ExplorerContextValue) {
  return render(
    <Providers>
      <ExplorerContext.Provider value={value}>
        <NavCapsule />
        <AskFab />
        <AskDrawer />
      </ExplorerContext.Provider>
    </Providers>,
  );
}

beforeEach(() => {
  resetAskBus();
  window.localStorage.clear();
  pathname.value = "/";
});

describe("suggestions", () => {
  it("words the scope line and the questions from the release's labels, keyed on the scope keys set", () => {
    expect(scopeLine(labels, dims, punjabAg, DEFAULTS)).toBe("Punjab · agriculture · 2023–24 · reference estimate");
    expect(scopeLine(labels, dims, national, DEFAULTS)).toBe("Pakistan · 2023–24 · reference estimate");
    expect(scopeLine(labels, dims, { ...national, gwp: "AR6", gas: "CH4", month: "202307" }, DEFAULTS)).toBe("Pakistan · CH₄ · 2023–24 · Jul 2023 · reference estimate · IPCC 2021 (AR6)");
    expect(suggestedQuestions(labels, dims, punjabAg)).toEqual(["Why is Punjab's estimate high?", "How much comes from livestock?", "Which parts are proxy-allocated?", "Compare Punjab with Sindh", "Download the rows used here."]);
    expect(suggestedQuestions(labels, dims, national)).toEqual(["What is Pakistan's largest source?", "How certain is this estimate?", "Which categories are not estimated?", "How have emissions changed since 2020–21?"]);
    expect(suggestedQuestions(labels, dims, { ...national, sector: "power" })).toEqual(["How much comes from coal-fired generation?", "How certain is the power estimate?", "How has power changed since 2020–21?", "Which parts of power are not estimated?", "Download the rows used here."]);
    expect(suggestedQuestions(labels, dims, resolveState({ level: "adm2", geo: "60131773B12131197496886" }, DEFAULTS))).toEqual(["Why is Lahore's estimate high?", "What is Lahore's largest source?", "Which parts are proxy-allocated?", "How was this district's share allocated?", "Download the rows used here."]);
    expect(comparisonProvince(dims, "Sindh")).toBe("Balochistan"); // cyclic, polygons only (Other is skipped)
    // A POLLUTANT VIEW IS WORDED AS ONE: the metric part names it, and the questions are about its
    // emissions - none about a CO₂e figure, none the air tables cannot answer
    const pm25 = resolveState({ pol: "PM2.5" }, DEFAULTS);
    expect(scopeLine(labels, dims, pm25, DEFAULTS)).toBe("Pakistan · PM₂.₅ emissions · 2023–24 · reference estimate");
    expect(suggestedQuestions(labels, dims, pm25)).toEqual(["What are Pakistan's largest sources of PM₂.₅?", "Which provinces emit the most PM₂.₅?", "Which sources of PM₂.₅ are not estimated?", "How have PM₂.₅ emissions changed since 2020–21?", "Is this a measure of air quality?"]);
    expect(suggestedQuestions(labels, dims, resolveState({ pol: "SO2", level: "adm2", geo: "60131773B12131197496886" }, DEFAULTS))[0]).toBe("What are Lahore's largest sources of SO₂?");
    // a pollutant view carries no warming-potential basis to mention, even a non-default one
    expect(scopeLine(labels, dims, { ...pm25, gwp: "AR6" }, DEFAULTS)).not.toContain("AR6");
    // THE PLACE IS READ AT ITS OWN GRAIN: a province with its districts on the map is still a province
    const drilled = resolveState({ level: "adm2", geo: "Punjab" }, DEFAULTS);
    expect(scopeLine(labels, dims, drilled, DEFAULTS)).toBe("Punjab · 2023–24 · reference estimate");
    expect(suggestedQuestions(labels, dims, drilled)).toContain("Compare Punjab with Sindh");
    expect(suggestedQuestions(labels, dims, drilled)).not.toContain("How was this district's share allocated?");
    for (const q of [...suggestedQuestions(labels, dims, punjabAg), ...suggestedQuestions(labels, dims, national)]) {
      expect(q).not.toContain("FY");
      expect(q).not.toMatch(/\d+\.\d+/);
    }
  });
});

describe("AskDrawer", () => {
  it("opens from the nav button with the scope line and the scope's suggestions, and closes on Escape", () => {
    mount(ctx(punjabAg));
    const drawer = screen.getByTestId("ask-drawer");
    expect(drawer.getAttribute("data-open")).toBe("0");
    expect(drawer.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(screen.getByTestId("ask-fab"));
    expect(drawer.getAttribute("data-open")).toBe("1");
    expect(screen.getByTestId("ask-dock").getAttribute("data-variant")).toBe("drawer");
    // the contract is printed under the questions now rather than folded behind an info button:
    // a promise a reader has to go looking for is not much of a promise
    expect(screen.getByTestId("ask-contract")).toHaveTextContent("Responses cite their sources and preserve the selected map context.");
    // and the scope is the composer's own chip row, always on screen beside the box it applies to
    expect(screen.getByTestId("ask-scope")).toHaveTextContent("Using this view:");
    // the pills are the reader's OWN choices; the configuration qualifies every answer and is
    // always on, so it stays in the scope line rather than sitting beside "Punjab" as though a
    // reader had picked it
    expect(screen.getAllByTestId("ask-scope-chip").map((c) => c.textContent))
      .toEqual(["Punjab", "agriculture", "All gases", "2023–24"]);
    // four questions, not five: the panel asks rather than lists
    expect(screen.getAllByTestId("suggestion").map((b) => b.textContent)).toEqual(["Why is Punjab's estimate high?", "How much comes from livestock?", "Which parts are proxy-allocated?", "Compare Punjab with Sindh"]);
    expect(document.body.textContent).not.toContain("FY");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(drawer.getAttribute("data-open")).toBe("0");
    fireEvent.click(screen.getByTestId("ask-fab"));
    expect(drawer.getAttribute("data-open")).toBe("1");
    fireEvent.click(screen.getByTestId("ask-close"));
    expect(drawer.getAttribute("data-open")).toBe("0");
  });

  it("the scope line and the suggestions change with the state", () => {
    const { rerender } = mount(ctx(punjabAg));
    fireEvent.click(screen.getByTestId("ask-fab"));
    expect(screen.getAllByTestId("suggestion")).toHaveLength(4);
    rerender(
      <Providers>
        <ExplorerContext.Provider value={ctx(national)}>
          <NavCapsule />
          <AskDrawer />
        </ExplorerContext.Provider>
      </Providers>,
    );
    expect(screen.getAllByTestId("ask-scope-chip").map((c) => c.textContent)).toEqual(["Pakistan", "All gases", "2023–24"]);
    // with no envelope in hand the certainty question keeps its number-free wording
    expect(screen.getAllByTestId("suggestion").map((b) => b.textContent)).toEqual(["What is Pakistan's largest source?", "How certain is this estimate?", "Which categories are not estimated?", "How have emissions changed since 2020–21?"]);
  });

  it("openAsk opens the drawer, applies the scope it names and sends its question once with that scope", async () => {
    const fetchSpy = vi.fn(async () => sse(DONE));
    vi.stubGlobal("fetch", fetchSpy);
    const setState = vi.fn();
    mount(ctx(punjabAg, setState));
    await act(async () => {
      openAsk({ question: "Compare Punjab with Sindh", scope: { geo: "Sindh" } });
    });
    expect(screen.getByTestId("ask-drawer").getAttribute("data-open")).toBe("1");
    await waitFor(() => expect(screen.getByTestId("turn").getAttribute("data-status")).toBe("done"));
    expect(askCalls(fetchSpy)).toHaveLength(1);
    const body = askBody(fetchSpy);
    expect(body.message).toBe("Compare Punjab with Sindh");
    expect(body.ui_state).toEqual({ level: "adm1", period: "FY2023-24", config: "REF_2023_24", gwp: "AR5", view: "all", metric: "greenhouse_gases", sector: "agriculture", geo: "Sindh", place_level: "adm1" });
    expect(setState).toHaveBeenCalledWith({ geo: "Sindh" });
    expect(screen.getByTestId("user-message")).toHaveTextContent("Compare Punjab with Sindh");
    // a second request is a second send; a bare openAsk only opens
    await act(async () => {
      openAsk({ question: "How certain is this?" });
    });
    await waitFor(() => expect(askCalls(fetchSpy)).toHaveLength(2));
    expect(askBody(fetchSpy, 1).message).toBe("How certain is this?");
    await act(async () => {
      openAsk();
    });
    expect(askCalls(fetchSpy)).toHaveLength(2);
  });

  it("a suggestion click sends that question with the drawer's scope", async () => {
    const fetchSpy = vi.fn(async () => sse(DONE));
    vi.stubGlobal("fetch", fetchSpy);
    mount(ctx(punjabAg));
    fireEvent.click(screen.getByTestId("ask-fab"));
    await act(async () => {
      fireEvent.click(screen.getAllByTestId("suggestion")[1]);
    });
    await waitFor(() => expect(askCalls(fetchSpy)).toHaveLength(1));
    const body = askBody(fetchSpy);
    expect(body.message).toBe("How much comes from livestock?");
    expect(body.ui_state.geo).toBe("Punjab");
    expect(body.ui_state.sector).toBe("agriculture");
  });

  it("stays out of the /ask page and is full-screen on mobile", () => {
    pathname.value = "/ask";
    const { unmount } = mount(ctx(national));
    expect(screen.queryByTestId("ask-drawer")).toBeNull();
    unmount();
    pathname.value = "/map";
    mount(ctx(national, vi.fn(), true));
    fireEvent.click(screen.getByTestId("ask-fab"));
    const drawer = screen.getByTestId("ask-drawer");
    expect(drawer.className).toContain("inset-0");
    expect(drawer.getAttribute("style") ?? "").not.toContain("440");
  });
});

/**
 * On the workspace the panel is the page's right column rather than a slide-over: no button to
 * press, no X to press back, and the map's chrome laid out around it. These pin the three things
 * that make that true and the one thing that keeps the rest of the app working - the SAME element,
 * so the round button still learns from `data-open` that it has nothing to do.
 */
describe("docked on the workspace", () => {
  it("is open with no way to dismiss it, and the round button takes itself away", async () => {
    stubWideViewport();
    pathname.value = "/";
    mount(ctx(national));
    const drawer = screen.getByTestId("ask-drawer");
    expect(drawer).toHaveAttribute("data-docked", "1");
    expect(drawer).toHaveAttribute("data-open", "1");
    expect(drawer).toHaveAttribute("aria-hidden", "false");
    expect(drawer.className).toContain("translate-x-0");
    expect(drawer.className).not.toContain("transition-transform");   // it never slid, so it must not animate in
    expect(screen.getByTestId("ask-dock")).toHaveAttribute("data-variant", "dock");
    expect(screen.queryByTestId("ask-close")).toBeNull();
    // the button hides itself off the drawer's own attribute; it needed no knowledge of any of this
    await waitFor(() => expect(screen.queryByTestId("ask-fab")).toBeNull());
    // and Escape, which closes a drawer, has nothing to close here
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("ask-drawer")).toHaveAttribute("data-open", "1");
  });

  it("is still a drawer on every other route at the same width, and on a narrow workspace", () => {
    stubWideViewport();
    pathname.value = "/methods";
    const { unmount } = mount(ctx(national));
    expect(screen.getByTestId("ask-drawer")).toHaveAttribute("data-open", "0");
    expect(screen.getByTestId("ask-fab")).toBeInTheDocument();
    unmount();
    // below the workspace's own two-pane threshold nothing docks: a third permanent column cannot
    // share a screen that already shows one pane at a time
    stubViewport(1100);
    pathname.value = "/";
    mount(ctx(national));
    expect(screen.getByTestId("ask-drawer")).toHaveAttribute("data-docked", "0");
    expect(screen.getByTestId("ask-drawer")).toHaveAttribute("data-open", "0");
    expect(screen.getByTestId("ask-fab")).toBeInTheDocument();
  });

  it("a seed still reaches it, so an Ask-about-this link keeps working where it is the page", async () => {
    stubWideViewport();
    pathname.value = "/";
    const fetchSpy = vi.fn(async () => sse(DONE));
    vi.stubGlobal("fetch", fetchSpy);
    const setState = vi.fn();
    mount(ctx(national, setState));
    await act(async () => {
      openAsk({ question: "How much comes from livestock?", scope: { geo: "Punjab", sector: "agriculture" } });
    });
    await waitFor(() => expect(askCalls(fetchSpy)).toHaveLength(1));
    expect(askBody(fetchSpy).message).toBe("How much comes from livestock?");
    expect(setState).toHaveBeenCalledWith({ geo: "Punjab", sector: "agriculture" });
  });
});
