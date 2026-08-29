import "@testing-library/jest-dom/vitest";
/**
 * The first-visit explainer: shows when localStorage holds no dismissal, hides after a dismissal
 * and stays hidden on a fresh mount, re-opens on openIntro(); every decimal it renders is the
 * mocked national envelope's display; no phrase from the manuscript's "avoid" list appears; the
 * release facts (period note, GWP bases, limitation texts, functions, agent reason) come from
 * the mocked release.
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
import { INTRO_KEY, WelcomeModal, openIntro, SHORT_SUMMARY } from "./WelcomeModal";

const NATIONAL = "452.34662";
const BBOXES = { adm1: { "Azad Kashmir": [73, 33, 75, 35], Balochistan: [61, 24, 70, 32], "Gilgit-Baltistan": [72, 34, 77, 37], "Islamabad Capital Territory": [72.8, 33.5, 73.4, 33.9], "Khyber Pakhtunkhwa": [69, 31, 74, 37], Punjab: [69, 27, 75, 34], Sindh: [66, 23, 71, 28] }, adm2: {} };

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
      if (url.endsWith("/bboxes.json")) return BBOXES;
      return envelope([{ display: NATIONAL }]);
    }),
  );
});

describe("WelcomeModal", () => {
  it("renders on a first visit with the summary, the release line and the national total from the envelope", async () => {
    mount();
    const modal = await screen.findByTestId("welcome-modal");
    expect(modal).toHaveTextContent(SHORT_SUMMARY);
    expect(modal).toHaveTextContent("PakEmis 1.0.0rc42");
    expect(modal).toHaveTextContent("FY2023-24 (2023-07-01 to 2024-06-30)");
    expect(await screen.findByTestId("intro-kpi")).toHaveTextContent(NATIONAL);
    expect(modal).toHaveTextContent("Inventory reference (L)");
    expect(screen.getByTestId("receipt-footer")).toBeInTheDocument();
  });
  it("every decimal on every panel is the mocked envelope's display (the release id's version aside)", async () => {
    mount();
    const modal = await screen.findByTestId("welcome-modal");
    await screen.findByTestId("intro-kpi");
    const versionTokens = new Set(RELEASE.release_id.match(/\d+\.\d+/g) ?? []);
    const seen: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      seen.push(...decimals(modal));
      if (i < 3) fireEvent.click(screen.getByTestId("intro-next"));
      await waitFor(() => expect(modal).toBeInTheDocument());
    }
    expect(seen.length).toBeGreaterThan(0);
    for (const t of seen) expect(versionTokens.has(t) ? NATIONAL : t).toBe(NATIONAL);
  });
  it("quotes the release: period note, GWP bases, LULUCF note, configuration notes, limitation texts, functions, agent reason", async () => {
    mount();
    const modal = await screen.findByTestId("welcome-modal");
    fireEvent.click(screen.getByTestId("intro-next"));
    expect(modal).toHaveTextContent("every sector reports the same twelve months");
    expect(modal).toHaveTextContent("on AR5, with AR6 carried as a secondary basis");
    expect(modal).toHaveTextContent("excluded (NE): an exploratory Tier-1 module");
    expect(modal).toHaveTextContent("Observed household demand (S)");
    expect(modal).toHaveTextContent("configuration S substitutes the residential module");
    expect(modal).toHaveTextContent("A blank is not a zero");
    fireEvent.click(screen.getByTestId("intro-next"));
    expect(modal).toHaveTextContent("their CO2e is a bounded interval, never a midpoint");
    expect(modal).toHaveTextContent("the map tiles are visual only");
    expect(modal).toHaveTextContent("ar6_adm2_ne");
    expect(modal).toHaveTextContent("calendar_basis_ne");
    await waitFor(() => expect(modal).toHaveTextContent("Azad Kashmir, Gilgit-Baltistan and Islamabad Capital Territory are one unit in the release, named “Other”"));
    fireEvent.click(screen.getByTestId("intro-next"));
    expect(modal).toHaveTextContent("get_timeseries");
    expect(modal).toHaveTextContent("Click a cited number");
    expect(screen.getByTestId("intro-agent")).toHaveTextContent("not mounted");
    expect(screen.getByTestId("intro-done")).toBeInTheDocument();
  });
  it("contains no phrase from the manuscript's avoid list", async () => {
    mount();
    const modal = await screen.findByTestId("welcome-modal");
    await screen.findByTestId("intro-kpi");
    expect(AVOID_PHRASES.length).toBe(7);
    for (let i = 0; i < 4; i += 1) {
      expect(avoidPhrasesIn(modal.textContent ?? "")).toEqual([]);
      if (i < 3) fireEvent.click(screen.getByTestId("intro-next"));
    }
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
  it("re-opens on openIntro() at the first step, and 'Ask a question' dismisses and sets ask", async () => {
    const setState = vi.fn();
    mount(setState);
    await screen.findByTestId("welcome-modal");
    fireEvent.click(screen.getByTestId("intro-close"));
    expect(screen.queryByTestId("welcome-modal")).toBeNull();
    openIntro();
    const modal = await screen.findByTestId("welcome-modal");
    expect(modal).toHaveTextContent(SHORT_SUMMARY);
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByTestId("intro-next"));
    fireEvent.click(screen.getByTestId("intro-ask"));
    expect(setState).toHaveBeenCalledWith({ ask: true });
    expect(screen.queryByTestId("welcome-modal")).toBeNull();
    expect(window.localStorage.getItem(INTRO_KEY)).toBe("1");
  });
  it("under 768 px the four panels are one scroll", async () => {
    mount(vi.fn(), true);
    const modal = await screen.findByTestId("welcome-modal");
    expect(modal).toHaveTextContent("What this is");
    expect(modal).toHaveTextContent("How to read the map");
    expect(modal).toHaveTextContent("Ask PakEmis");
    expect(screen.queryByTestId("intro-next")).toBeNull();
  });
});
