import "@testing-library/jest-dom/vitest";
/**
 * The first-visit explainer: shows when localStorage holds no dismissal, hides after a dismissal
 * and stays hidden on a fresh mount, re-opens on openIntro(); the four screens carry their copy;
 * screen 1 prints no release version, receipt, GWP basis or configuration label; the national
 * total appears from screen 3 on, as the mocked envelope's display split typographically (never
 * rounded) with a "View source" opening the evidence drawer; every decimal on any screen is the
 * mocked display; no phrase from the manuscript's "avoid" list appears.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseAgent, releaseDims, releaseLabels } from "@/lib/release";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { RELEASE, envelope, mockFetch } from "@/__tests__/fixtures";
import { AVOID_PHRASES, avoidPhrasesIn } from "@/__tests__/vocabulary";
import { INTRO_KEY, SCREENS, WelcomeModal, countWord, openIntro, splitDisplay, unitText } from "./WelcomeModal";

vi.mock("@/components/ui/TrendChart", () => ({ TrendChart: ({ env }: { env: unknown }) => <div data-testid={env ? "trend-chart" : "trend-skeleton"} /> }));

const NATIONAL = "452.34662";
const SERIES = ["372.397", "452.347"];

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, panel: null, ask: false, c: null, cam: null, raster: false, view3d: false };

function ctx(setState = vi.fn(), isMobile = false): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state: base, setState, release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: undefined, agent: releaseAgent(release), isMobile };
}

function mount(setState = vi.fn(), isMobile = false) {
  return render(
    <Providers>
      <ExplorerContext.Provider value={ctx(setState, isMobile)}>
        <WelcomeModal />
      </ExplorerContext.Provider>
    </Providers>,
  );
}

/** Every decimal token on screen. */
function decimals(root: HTMLElement): string[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const tokens: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) tokens.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
  return tokens;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    mockFetch((url) => {
      if (url.endsWith("/v1/release")) return RELEASE;
      if (url.includes("/timeseries")) return envelope([{ display: SERIES[0], group: { period_id: "FY2020-21" } }, { display: SERIES[1], group: { period_id: "FY2023-24" } }], { request_type: "get_timeseries" });
      return envelope([{ display: NATIONAL }]);
    }),
  );
});

describe("WelcomeModal", () => {
  it("screen 1 is the hero: headline, dek, the facts row in words, the trend visual, and none of the release bookkeeping", async () => {
    mount();
    const modal = await screen.findByTestId("welcome-modal");
    expect(modal).toHaveTextContent(SCREENS[0].headline);
    expect(modal).toHaveTextContent(SCREENS[0].dek);
    expect(screen.getByTestId("intro-facts")).toHaveTextContent("Two fiscal years"); // the fixture's dims hold two fiscal periods
    expect(screen.getByTestId("intro-facts")).toHaveTextContent("Monthly detail");
    expect(screen.getByTestId("intro-facts")).toHaveTextContent("Source-traceable");
    expect(screen.getByTestId("intro-counter")).toHaveTextContent("01 / 04");
    expect(screen.getByTestId("intro-next")).toHaveTextContent("Explore the project");
    await screen.findByTestId("trend-chart");
    const text = modal.textContent ?? "";
    for (const forbidden of [RELEASE.release_id, RELEASE.version, "receipt", "AR5", "Inventory reference", "2023-07-01", NATIONAL]) expect(text).not.toContain(forbidden);
    expect(decimals(modal)).toEqual([]);
  });
  it("screens 2 to 4 carry their copy; the number appears from screen 3 on as the envelope's display, split typographically", async () => {
    mount();
    const modal = await screen.findByTestId("welcome-modal");
    fireEvent.click(screen.getByTestId("intro-next"));
    expect(modal).toHaveTextContent(SCREENS[1].headline);
    expect(modal).toHaveTextContent(SCREENS[1].dek);
    expect(screen.getByTestId("intro-counter")).toHaveTextContent("02 / 04");
    expect(decimals(modal)).toEqual([]);
    fireEvent.click(screen.getByTestId("intro-next"));
    expect(modal).toHaveTextContent(SCREENS[2].headline);
    expect(modal).toHaveTextContent(SCREENS[2].dek);
    const kpi = await screen.findByTestId("intro-kpi");
    expect(kpi).toHaveTextContent(NATIONAL);
    expect(kpi.children[0]).toHaveTextContent("452");
    expect(kpi.children[1]).toHaveTextContent(".34662");
    expect(screen.getByTestId("intro-example")).toHaveTextContent(`Pakistan emitted ${NATIONAL} Mt CO₂e in FY2023-24.`);
    expect(screen.getByTestId("intro-source")).toBeInTheDocument();
    for (const t of decimals(modal)) expect(t).toBe(NATIONAL);
    fireEvent.click(screen.getByTestId("intro-next"));
    expect(modal).toHaveTextContent(SCREENS[3].headline);
    expect(modal).toHaveTextContent(SCREENS[3].dek);
    expect(screen.getByTestId("intro-counter")).toHaveTextContent("04 / 04");
    expect(screen.getByTestId("intro-done")).toHaveTextContent("Start exploring");
    expect(screen.getByTestId("intro-footnote")).toHaveTextContent(RELEASE.release_id);
    const versionTokens = new Set(RELEASE.release_id.match(/\d+\.\d+/g) ?? []);
    for (const t of decimals(modal)) expect(versionTokens.has(t)).toBe(true);
  });
  it("'View source' opens the evidence drawer of the national envelope", async () => {
    mount();
    await screen.findByTestId("welcome-modal");
    fireEvent.click(screen.getByTestId("intro-next"));
    fireEvent.click(screen.getByTestId("intro-next"));
    await screen.findByTestId("intro-kpi");
    fireEvent.click(screen.getByTestId("intro-source"));
    const drawer = await screen.findByRole("dialog", { name: "Envelope" });
    expect(drawer).toHaveTextContent("query_emissions");
    expect(drawer).toHaveTextContent("receipt");
  });
  it("contains no phrase from the manuscript's avoid list on any screen", async () => {
    mount();
    const modal = await screen.findByTestId("welcome-modal");
    expect(AVOID_PHRASES.length).toBe(7);
    for (let i = 0; i < 4; i += 1) {
      expect(avoidPhrasesIn(modal.textContent ?? "")).toEqual([]);
      if (i < 3) fireEvent.click(screen.getByTestId("intro-next"));
    }
    await screen.findByTestId("intro-footnote");
    expect(avoidPhrasesIn(modal.textContent ?? "")).toEqual([]);
  });
  it("hides after a dismissal, persists it, and stays hidden on a fresh mount", async () => {
    const { unmount } = mount();
    await screen.findByTestId("welcome-modal");
    fireEvent.click(screen.getByTestId("intro-close"));
    expect(screen.queryByTestId("welcome-modal")).toBeNull();
    expect(window.localStorage.getItem(INTRO_KEY)).toBe("1");
    unmount();
    mount();
    await waitFor(() => expect(screen.queryByTestId("welcome-modal")).toBeNull());
  });
  it("re-opens on openIntro() at the first screen; arrow keys step; 'Ask a question' dismisses and sets ask", async () => {
    const setState = vi.fn();
    mount(setState);
    await screen.findByTestId("welcome-modal");
    fireEvent.click(screen.getByTestId("intro-close"));
    expect(screen.queryByTestId("welcome-modal")).toBeNull();
    openIntro();
    const modal = await screen.findByTestId("welcome-modal");
    expect(modal).toHaveTextContent(SCREENS[0].headline);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("intro-counter")).toHaveTextContent("02 / 04");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByTestId("intro-counter")).toHaveTextContent("01 / 04");
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByTestId("intro-next"));
    fireEvent.click(screen.getByTestId("intro-ask"));
    expect(setState).toHaveBeenCalledWith({ ask: true });
    expect(screen.queryByTestId("welcome-modal")).toBeNull();
    expect(window.localStorage.getItem(INTRO_KEY)).toBe("1");
  });
  it("Escape dismisses", async () => {
    mount();
    await screen.findByTestId("welcome-modal");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("welcome-modal")).toBeNull();
  });
  it("under 768 px the four screens are one scroll in order", async () => {
    mount(vi.fn(), true);
    const modal = await screen.findByTestId("welcome-modal");
    const text = modal.textContent ?? "";
    const positions = SCREENS.map((s) => text.indexOf(s.headline));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(screen.queryByTestId("intro-next")).toBeNull();
  });
  it("helpers: counts as words, the display split keeps the string whole, the unit is typographic only", () => {
    expect(countWord(9)).toBe("nine");
    expect(countWord(40)).toBe("40");
    expect(splitDisplay("452.34662")).toEqual({ int: "452", rest: ".34662" });
    expect(splitDisplay("[0.5865, 0.5866]")).toEqual({ int: "[0.5865, 0.5866]", rest: "" });
    expect(unitText("Mt CO2e AR5")).toBe("Mt CO₂e");
    expect(unitText("Gg")).toBe("Gg");
  });
});
