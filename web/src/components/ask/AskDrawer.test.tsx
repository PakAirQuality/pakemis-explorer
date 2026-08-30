/**
 * The Ask drawer: closed until the nav's Ask PakEmis button or openAsk() opens it; the scope
 * line and the suggested questions follow the URL state (Punjab · agriculture, then the
 * national default); an openAsk request sends its question once with the scope it names;
 * Escape closes; on the /ask page the drawer stays out (the page is the panel).
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { TopNav } from "@/components/shell/TopNav";
import { openAsk, resetAskBus } from "@/lib/askBus";
import { releaseDims, releaseLabels } from "@/lib/release";
import { resolveState, type ExplorerState } from "@/lib/urlState";
import type { ReleaseInfo } from "@/lib/envelope";
import { RELEASE } from "@/__tests__/fixtures";
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
  return { state, setState, release, labels, dims, defaults: DEFAULTS, contract: undefined, agent: { enabled: true, model: "gemini-test", reason: "" }, isMobile };
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

function mount(value: ExplorerContextValue) {
  return render(
    <Providers>
      <ExplorerContext.Provider value={value}>
        <TopNav />
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
    fireEvent.click(screen.getByTestId("nav-ask"));
    expect(drawer.getAttribute("data-open")).toBe("1");
    expect(screen.getByTestId("ask-dock").getAttribute("data-variant")).toBe("drawer");
    expect(screen.getByTestId("ask-contract")).toHaveTextContent("The assistant interprets your question; the PakEmis engine supplies every number. It never calculates from documents or prose.");
    expect(screen.getByTestId("ask-scope")).toHaveTextContent("Scope: Punjab · agriculture · 2023–24 · reference estimate");
    expect(screen.getAllByTestId("suggestion").map((b) => b.textContent)).toEqual(["Why is Punjab's estimate high?", "How much comes from livestock?", "Which parts are proxy-allocated?", "Compare Punjab with Sindh", "Download the rows used here."]);
    expect(document.body.textContent).not.toContain("FY");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(drawer.getAttribute("data-open")).toBe("0");
    fireEvent.click(screen.getByTestId("nav-ask"));
    expect(drawer.getAttribute("data-open")).toBe("1");
    fireEvent.click(screen.getByTestId("ask-close"));
    expect(drawer.getAttribute("data-open")).toBe("0");
  });

  it("the scope line and the suggestions change with the state", () => {
    const { rerender } = mount(ctx(punjabAg));
    fireEvent.click(screen.getByTestId("nav-ask"));
    expect(screen.getAllByTestId("suggestion")).toHaveLength(5);
    rerender(
      <Providers>
        <ExplorerContext.Provider value={ctx(national)}>
          <TopNav />
          <AskDrawer />
        </ExplorerContext.Provider>
      </Providers>,
    );
    expect(screen.getByTestId("ask-scope")).toHaveTextContent("Scope: Pakistan · 2023–24 · reference estimate");
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
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.message).toBe("Compare Punjab with Sindh");
    expect(body.ui_state).toEqual({ level: "adm1", period: "FY2023-24", config: "REF_2023_24", gwp: "AR5", view: "all", sector: "agriculture", geo: "Sindh" });
    expect(setState).toHaveBeenCalledWith({ geo: "Sindh" });
    expect(screen.getByTestId("user-message")).toHaveTextContent("Compare Punjab with Sindh");
    // a second request is a second send; a bare openAsk only opens
    await act(async () => {
      openAsk({ question: "How certain is this?" });
    });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String((fetchSpy.mock.calls[1] as unknown as [string, RequestInit])[1].body)).message).toBe("How certain is this?");
    await act(async () => {
      openAsk();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("a suggestion click sends that question with the drawer's scope", async () => {
    const fetchSpy = vi.fn(async () => sse(DONE));
    vi.stubGlobal("fetch", fetchSpy);
    mount(ctx(punjabAg));
    fireEvent.click(screen.getByTestId("nav-ask"));
    await act(async () => {
      fireEvent.click(screen.getAllByTestId("suggestion")[1]);
    });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body));
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
    fireEvent.click(screen.getByTestId("nav-ask"));
    const drawer = screen.getByTestId("ask-drawer");
    expect(drawer.className).toContain("inset-0");
    expect(drawer.getAttribute("style") ?? "").not.toContain("440");
  });
});
