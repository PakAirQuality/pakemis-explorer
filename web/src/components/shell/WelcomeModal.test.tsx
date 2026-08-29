import "@testing-library/jest-dom/vitest";
/**
 * The first-visit introduction: shows when localStorage holds no dismissal, hides after a
 * dismissal and stays hidden on a fresh mount, re-opens on openIntro(). The four screens carry
 * their titles verbatim (screen 1's with the release's period range) and their sentences; no
 * screen carries a question eyebrow, the word "Ask", a receipt or Result ID, the release id or
 * the token "FY"; Back is absent on page 1 and present from page 2; the primary reads Next on
 * pages 1–3 and Open Explorer on page 4, beside "View methodology" (/about#methods); the only
 * decimals on any screen are envelope displays; the transport example is a live envelope with
 * a refusal card when the API refuses. The two charts are mocked (TrendChart.test.tsx renders
 * the real one); the mocks print the title, the unit line and the shown strings they were
 * given (display_short, else display), which is what the real ones draw.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseAgent, releaseDims, releaseLabels } from "@/lib/release";
import type { Envelope, ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { RELEASE, envelope } from "@/__tests__/fixtures";
import { AVOID_PHRASES, avoidPhrasesIn } from "@/__tests__/vocabulary";
import { EXPLORE_TERMS, INTRO_KEY, OPEN_TERMS, QUERY_CLOSING, SCREENS, VERSIONED_LINE, WelcomeModal, exampleQuestion, factsLine, figureUnitLine, openIntro, screenTitle } from "./WelcomeModal";

vi.mock("@/components/ui/TrendChart", () => ({
  TrendChart: ({ env, title, subtitle, showReceipt }: { env: { values: { display: string; display_short?: string }[] } | null | undefined; title?: string; subtitle?: string; showReceipt?: boolean }) =>
    env ? (
      <div data-testid="trend-chart" data-receipt-shown={String(showReceipt !== false)}>
        <span data-testid="trend-title">{title}</span> <span data-testid="trend-subtitle">{subtitle}</span> {env.values.map((v) => v.display_short ?? v.display).join(" ")}
      </div>
    ) : (
      <div data-testid="trend-skeleton" />
    ),
}));
vi.mock("@/components/ui/BarChart", () => ({ BarChart: ({ env }: { env: { values: { display: string; display_short?: string }[] } }) => <div data-testid="bar-chart">{env.values.map((v) => v.display_short ?? v.display).join(" ")}</div> }));

const NATIONAL = "452.34662";
const SERIES = ["372.397", "452.347"]; // no display_short: the displays stand
const TRANSPORT = ["43.358", "41.926"];
const TRANSPORT_SHORT = ["43.36", "41.93"]; // the server's two-decimal renderings
const SECTORS = [{ display: "196.789", display_short: "196.79", group: { sector_id: "agriculture" } }, { display: "58.123", display_short: "58.12", group: { sector_id: "power" } }];
const TITLES = ["Pakistan greenhouse-gas emissions, 2020–21 to 2023–24", "Explore emissions across place, time and sector", "Query the dataset", "Open data, methods and code"];

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

/** The text of every `.micro` element (the eyebrow level): none may be a question. */
function micros(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll(".micro")).map((e) => e.textContent ?? "");
}

const FORBIDDEN = [RELEASE.release_id, RELEASE.version, "receipt", "Receipt", "Result ID", "Ask", "FY", "Inventory reference", NATIONAL];

function stubApi(transport: "ok" | "refuse" = "ok") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as { query?: { sectors?: string[] }; group_by?: string[] }) : undefined;
      const ok = (payload: unknown) => ({ ok: true, status: 200, statusText: "OK", json: async () => payload }) as Response;
      if (String(url).endsWith("/release")) return ok(RELEASE);
      if (String(url).includes("/timeseries")) {
        if (body?.query?.sectors?.[0] === "transport") {
          if (transport === "refuse") return { ok: false, status: 422, statusText: "Unprocessable", json: async () => ({ error: "refused", error_class: "NotEstimated", message: "transport is not carried for this basis", limitation_id: "transport_ne", detail: {} }) } as Response;
          return ok(envelope([{ display: TRANSPORT[0], display_short: TRANSPORT_SHORT[0], group: { period_id: "FY2020-21" } }, { display: TRANSPORT[1], display_short: TRANSPORT_SHORT[1], group: { period_id: "FY2023-24" } }], { request_type: "get_timeseries", request: JSON.stringify({ _type: "TimeseriesRequest", query: { sectors: ["transport"] } }) }));
        }
        return ok(envelope([{ display: SERIES[0], group: { period_id: "FY2020-21" } }, { display: SERIES[1], group: { period_id: "FY2023-24" } }], { request_type: "get_timeseries" }));
      }
      if (body?.group_by?.[0] === "sector_id") return ok(envelope(SECTORS, { context: { ...envelope([]).context, periods: ["FY2023-24"] } }));
      return ok(envelope([{ display: NATIONAL }], { context: { ...envelope([]).context, periods: ["FY2023-24"] } }));
    }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  stubApi();
});

describe("WelcomeModal", () => {
  it("screen 1: the title with the release's range, the sentence, the facts line, the national figure without a receipt, and none of the release bookkeeping", async () => {
    mount();
    const modal = await screen.findByTestId("welcome-modal");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(TITLES[0]);
    expect(screenTitle(0, "2020–21 to 2023–24")).toBe(TITLES[0]);
    expect(modal).toHaveTextContent(SCREENS[0].text);
    expect(screen.getByTestId("intro-facts")).toHaveTextContent("2 fiscal years · monthly estimates · district-level data · documented sources");
    expect(factsLine(9)).toBe("9 fiscal years · monthly estimates · district-level data · documented sources");
    expect(screen.getByTestId("intro-counter")).toHaveTextContent("1 of 4");
    expect(screen.getByTestId("intro-dots").children.length).toBe(4);
    expect(screen.getByTestId("intro-dots").querySelectorAll("[data-current]").length).toBe(1);
    expect(screen.queryByTestId("intro-back")).toBeNull();
    expect(screen.getByTestId("intro-next")).toHaveTextContent("Next");
    expect(screen.getByTestId("intro-skip")).toHaveTextContent("Skip");
    const chart = await screen.findByTestId("trend-chart");
    expect(screen.getByTestId("trend-title")).toHaveTextContent("Pakistan greenhouse-gas emissions");
    expect(screen.getByTestId("trend-subtitle")).toHaveTextContent("Million tonnes CO₂e (AR5), excluding land use");
    expect(chart).toHaveAttribute("data-receipt-shown", "false");
    expect(screen.queryByTestId("receipt-footer")).toBeNull();
    const text = modal.textContent ?? "";
    for (const forbidden of FORBIDDEN) expect(text).not.toContain(forbidden);
    expect(text).not.toContain("?");
    expect(micros(modal).some((m) => m.includes("?"))).toBe(false);
    expect(decimals(modal).sort()).toEqual([...SERIES].sort());
  });
  it("screens 2 to 4 carry their titles verbatim and their copy; the only decimals are envelope displays; Back appears from page 2", async () => {
    mount();
    const modal = await screen.findByTestId("welcome-modal");
    await screen.findByTestId("trend-chart");
    fireEvent.click(screen.getByTestId("intro-next"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(TITLES[1]);
    expect(modal).toHaveTextContent(SCREENS[1].text);
    expect(screen.getByTestId("intro-counter")).toHaveTextContent("2 of 4");
    expect(screen.getByTestId("intro-back")).toHaveTextContent("Back");
    expect(screen.getByTestId("intro-next")).toHaveTextContent("Next");
    for (const [term, line] of EXPLORE_TERMS) {
      expect(screen.getByTestId("intro-explore-list")).toHaveTextContent(term);
      expect(screen.getByTestId("intro-explore-list")).toHaveTextContent(line);
    }
    expect(screen.getByTestId("intro-sectors-title")).toHaveTextContent("Emissions by sector, 2023–24");
    await screen.findByTestId("bar-chart");
    expect(screen.getByTestId("intro-sectors-unit")).toHaveTextContent("Million tonnes CO₂e (AR5)");
    expect(screen.getByTestId("intro-sectors-unit")).not.toHaveTextContent("land use");
    expect(screen.getByTestId("bar-chart")).toHaveTextContent(SECTORS[0].display_short);
    expect(screen.getByTestId("bar-chart")).not.toHaveTextContent(SECTORS[0].display);
    expect(screen.queryByTestId("trend-chart")).toBeNull(); // the trend figure stays on screen 1
    expect(decimals(modal).sort()).toEqual(SECTORS.map((c) => c.display_short).sort());
    expect(modal.textContent).not.toContain("?");
    fireEvent.click(screen.getByTestId("intro-next"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(TITLES[2]);
    expect(modal).toHaveTextContent(SCREENS[2].text);
    expect(screen.getByTestId("intro-example")).toHaveTextContent("Example");
    expect(screen.getByTestId("intro-question")).toHaveTextContent("“How have transport emissions changed since 2020–21?”");
    expect(exampleQuestion("2015–16")).toBe("How have transport emissions changed since 2015–16?");
    const transport = await screen.findByTestId("trend-chart");
    expect(screen.getByTestId("intro-transport")).toContainElement(transport);
    expect(screen.getByTestId("trend-title")).toHaveTextContent("Transport emissions by year");
    expect(screen.getByTestId("trend-subtitle")).toHaveTextContent("Million tonnes CO₂e (AR5)");
    expect(transport).toHaveAttribute("data-receipt-shown", "false");
    expect(screen.getByTestId("intro-query-closing")).toHaveTextContent(QUERY_CLOSING);
    expect(decimals(modal).sort()).toEqual([...TRANSPORT_SHORT].sort());
    // the one question mark on any screen is the example question itself
    expect((modal.textContent ?? "").match(/\?/g)?.length).toBe(1);
    expect(micros(modal).some((m) => m.includes("?"))).toBe(false);
    expect(screen.getByTestId("intro-next")).toHaveTextContent("Next");
    fireEvent.click(screen.getByTestId("intro-next"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(TITLES[3]);
    expect(modal).toHaveTextContent(SCREENS[3].text);
    expect(screen.getByTestId("intro-counter")).toHaveTextContent("4 of 4");
    for (const [term, line] of OPEN_TERMS) {
      expect(screen.getByTestId("intro-open-list")).toHaveTextContent(term);
      expect(screen.getByTestId("intro-open-list")).toHaveTextContent(line);
    }
    expect(screen.getByTestId("intro-versioned")).toHaveTextContent(VERSIONED_LINE);
    expect(screen.queryByTestId("intro-next")).toBeNull();
    expect(screen.getByTestId("intro-done")).toHaveTextContent("Open Explorer");
    expect(screen.getByTestId("intro-methods")).toHaveTextContent("View methodology");
    expect(screen.getByTestId("intro-methods")).toHaveAttribute("href", "/about#methods");
    expect(screen.getByTestId("intro-back")).toBeInTheDocument();
    expect(decimals(modal)).toEqual([]);
    expect(modal.textContent).not.toContain("?");
    // Back returns to page 3
    fireEvent.click(screen.getByTestId("intro-back"));
    expect(screen.getByTestId("intro-counter")).toHaveTextContent("3 of 4");
  });
  it("no screen names a receipt, a Result ID, the release id, 'Ask' or a period id; no button but Skip, Back, Next, Open Explorer, View methodology and the close", async () => {
    mount();
    const modal = await screen.findByTestId("welcome-modal");
    await screen.findByTestId("trend-chart");
    for (let i = 0; i < 4; i += 1) {
      if (i === 2) await screen.findByTestId("trend-chart");
      const text = modal.textContent ?? "";
      for (const forbidden of FORBIDDEN) expect(text, `screen ${i + 1} contains ${forbidden}`).not.toContain(forbidden);
      const buttons = Array.from(modal.querySelectorAll("button")).map((b) => b.textContent?.trim() || b.getAttribute("aria-label"));
      for (const b of buttons) expect(["Skip", "Back", "Next", "Open Explorer", "Close the introduction"]).toContain(b);
      const links = Array.from(modal.querySelectorAll("a")).map((a) => a.textContent?.trim());
      expect(links).toEqual(i === 3 ? ["View methodology"] : []);
      if (i < 3) fireEvent.click(screen.getByTestId("intro-next"));
    }
  });
  it("the transport example is a live envelope: a skeleton while it loads, the refusal by name when the API refuses", async () => {
    stubApi("refuse");
    mount();
    await screen.findByTestId("welcome-modal");
    fireEvent.click(screen.getByTestId("intro-next"));
    fireEvent.click(screen.getByTestId("intro-next"));
    expect(screen.getByTestId("intro-transport")).toBeInTheDocument();
    const refusal = await screen.findByTestId("refusal-card");
    expect(screen.getByTestId("intro-transport")).toContainElement(refusal);
    expect(refusal).toHaveTextContent("NotEstimated");
    expect(screen.queryByTestId("trend-chart")).toBeNull();
  });
  it("contains no phrase from the manuscript's avoid list on any screen", async () => {
    mount();
    const modal = await screen.findByTestId("welcome-modal");
    expect(AVOID_PHRASES.length).toBe(7);
    for (let i = 0; i < 4; i += 1) {
      expect(avoidPhrasesIn(modal.textContent ?? "")).toEqual([]);
      if (i < 3) fireEvent.click(screen.getByTestId("intro-next"));
    }
    await screen.findByTestId("intro-done");
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
  it("re-opens on openIntro() at the first screen; arrow keys step; Open Explorer dismisses and persists", async () => {
    mount();
    await screen.findByTestId("welcome-modal");
    fireEvent.click(screen.getByTestId("intro-close"));
    expect(screen.queryByTestId("welcome-modal")).toBeNull();
    openIntro();
    await screen.findByTestId("welcome-modal");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(TITLES[0]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("intro-counter")).toHaveTextContent("2 of 4");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByTestId("intro-counter")).toHaveTextContent("1 of 4");
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByTestId("intro-next"));
    fireEvent.click(screen.getByTestId("intro-done"));
    expect(screen.queryByTestId("welcome-modal")).toBeNull();
    expect(window.localStorage.getItem(INTRO_KEY)).toBe("1");
  });
  it("Skip and Escape dismiss", async () => {
    mount();
    await screen.findByTestId("welcome-modal");
    fireEvent.click(screen.getByTestId("intro-skip"));
    expect(screen.queryByTestId("welcome-modal")).toBeNull();
    window.localStorage.clear();
    openIntro();
    await screen.findByTestId("welcome-modal");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("welcome-modal")).toBeNull();
  });
  it("under 768 px the four screens are one scroll in order, ending with Open Explorer", async () => {
    mount(vi.fn(), true);
    const modal = await screen.findByTestId("welcome-modal");
    const text = modal.textContent ?? "";
    const positions = TITLES.map((t) => text.indexOf(t));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(screen.queryByTestId("intro-next")).toBeNull();
    expect(screen.getByTestId("intro-done")).toHaveTextContent("Open Explorer");
  });
  it("figureUnitLine: the unit as words, capitalised, with the land-use clause only when asked", () => {
    const env = envelope([{ display: "1.0" }]) as unknown as Envelope;
    expect(figureUnitLine(env, true)).toBe("Million tonnes CO₂e (AR5), excluding land use");
    expect(figureUnitLine(env)).toBe("Million tonnes CO₂e (AR5)");
    expect(figureUnitLine(null, true)).toBe("");
    expect(figureUnitLine(envelope([{ display: "1.0", unit: "Gg" }]) as unknown as Envelope, true)).toBe("Thousand tonnes, excluding land use");
  });
});
