import "@testing-library/jest-dom/vitest";
/**
 * The workspace at `/` when the map cannot be drawn. The map is a stub that reports the status a
 * test scripts for it — one entry per mount, so a remount is countable — and the page is held to
 * what a reader with no WebGL is owed:
 *
 *  · one sentence saying what happened and where the same estimates are;
 *  · no legend and no map buttons over a blank canvas, and the deck in its full-width layout at
 *    once, at either width, clear of the nav and of the docked assistant;
 *  · the results, the filters and the ways to the evidence and the downloads all still within reach;
 *  · a link to /data that is exactly `hrefForState(state, defaults, "/data")` — the pollutant,
 *    the province and the year go with the reader;
 *  · "Try again" remounting the map twice at most and then gone, with the sentence left standing;
 *  · a context the browser gives back restoring the map by itself, no retry spent.
 *
 * And to what the REASON for the failure changes: the sentence is that failure's own, the retry
 * is offered only where another attempt could help (never for a browser that cannot draw the map
 * or a token that is not accepted on this address), a retry that never answers is ended by the
 * map's own `timeout` rather than left saying "Trying again…", and "Reset map" is not offered
 * while there is no map to reset.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import { resetAskChrome } from "@/components/ask/docked";
import { MAP_RETRY_LIMIT } from "@/components/map/useMapRecovery";
import { MAP_FAILURE, MAP_FAILURE_EXPLANATION } from "@/components/workspace/copy";
import { hrefForState, resolveState, type StateDefaults } from "@/lib/urlState";
import Page from "@/app/page";
import { RELEASE, envelope, mockFetch, stubNarrowViewport, stubWideViewport } from "./fixtures";

type Status = "loading" | "ready" | "failed" | "lost";
type Failure = "unsupported" | "webgl" | "library" | "token" | "style" | "timeout";

/**
 * The stub's script: what each successive MOUNT reports as it mounts (null: nothing yet, a map
 * still loading), how many mounts there have been, and the live instance's own voice for what
 * happens later (a context lost, a context restored, a wait given up on). A status is reported as
 * it is; a FAILURE REASON is reported as the map reports one — `onFailure(reason)` and then
 * `onStatus("failed")`. A bare "failed" is a map that gives no reason, as before.
 */
const mapStub = vi.hoisted(() => ({ script: [] as (Status | Failure | null)[], mounts: 0, report: null as null | ((s: Status | Failure) => void) }));

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/map/ExplorerMap", async () => {
  const { useEffect } = await import("react");
  return {
    OPENING_MAX_ZOOM: 3.8,
    ExplorerMap: ({ onStatus, onFailure }: { onStatus?: (s: Status) => void; onFailure?: (r: Failure) => void }) => {
      useEffect(() => {
        mapStub.mounts += 1;
        const say = (s: Status | Failure) => {
          if (s === "loading" || s === "ready" || s === "failed" || s === "lost") return onStatus?.(s);
          onFailure?.(s);
          onStatus?.("failed");
        };
        mapStub.report = say;
        const first = mapStub.script.shift();
        if (first) say(first);
        return () => {
          mapStub.report = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return <div data-testid="map-stub" />;
    },
  };
});
type Item = { id: string; name: string; label: string };
vi.mock("@/components/charts/BarsWithAxis", () => ({
  BarsWithAxis: ({ items, testId = "bars-with-axis" }: { items: Item[]; testId?: string }) => (
    <div data-testid={testId}>{items.map((i) => <span key={i.id} data-testid="bar-item">{i.name} {i.label}</span>)}</div>
  ),
}));
vi.mock("@/components/charts/ColumnChart", () => ({
  ColumnChart: ({ points, testId = "column-chart" }: { points: Item[]; testId?: string }) => (
    <div data-testid={testId}>{points.map((p) => <span key={p.id} data-testid="column">{p.name} {p.label}</span>)}</div>
  ),
}));

const U = { unit_short: "Mt CO₂e", unit_words: "million tonnes CO₂e" };
const AXIS = { ticks_short: ["0", "50", "100", "150", "200", "250"], unit_short: "Mt CO₂e" };
const SECTORS = [
  { display: "223.454", display_short: "223.45", ...U, group: { reporting_sector: "agriculture" }, extra: { share_pct_short: "49.4", share_phrase: "nearly half", rank: 1 } },
  { display: "63.370", display_short: "63.37", ...U, group: { reporting_sector: "power" }, extra: { share_pct_short: "14.0", share_phrase: "about a tenth", rank: 2 } },
];
const PROVINCES = [
  { display: "228.7168", display_short: "228.72", ...U, group: { province: "Punjab" }, extra: { share_pct_short: "50.6", share_phrase: "nearly half", rank: 1 } },
  { display: "134.7255", display_short: "134.73", ...U, group: { province: "Sindh" }, extra: { share_pct_short: "29.8", share_phrase: "about a quarter", rank: 2 } },
];
const SERIES = [
  { display: "372.397", display_short: "372.40", ...U, group: { period_id: "FY2020-21" } },
  { display: "452.347", display_short: "452.35", ...U, group: { period_id: "FY2023-24" } },
];
const CHANGE = { from_period: "FY2020-21", to_period: "FY2023-24", from_short: "372.40", to_short: "452.35", change_short: "+79.95", change_pct_short: "+21.5", direction: "rose", unit_short: "Mt CO₂e" };
const NH3 = { unit: "kt NH3", unit_short: "kt NH₃" };

beforeEach(() => {
  mapStub.script = [];
  mapStub.mounts = 0;
  mapStub.report = null;
  stubWideViewport();
  resetAskChrome();
  vi.stubGlobal(
    "fetch",
    mockFetch((url, body) => {
      if (url.endsWith("/release")) return RELEASE;
      if (url.endsWith("/openapi.json")) return { paths: { "/api/v1/emissions/release": {} }, components: { schemas: { QueryEmissions: { properties: { gwp_basis: { description: "AR5 | AR6" }, spatial_view: { description: "all | physical | origin | accounting" } } }, GridCellRequest: { properties: { gas: { default: "CO2" }, month: { description: 'YYYYMM or "annual"' } } } } } };
      if (url.includes("/tiles/")) return { raster: undefined, adm1: {}, adm2: {} };
      if (url.includes("/timeseries")) return envelope(SERIES, { request_type: "get_timeseries", axis: AXIS, change: CHANGE });
      if (url.includes("/query/air")) {
        const k = (body as { group_by?: string[] } | undefined)?.group_by?.[0];
        if (k === "period_id") return envelope([{ display: "2100.004", display_short: "2100.00", ...NH3, group: { period_id: "FY2020-21" } }, { display: "2784.709", display_short: "2784.71", ...NH3, group: { period_id: "FY2023-24" } }], { request_type: "query_air", axis: AXIS });
        if (k === "sector_id") return envelope([{ display: "2674.532", display_short: "2674.53", ...NH3, group: { sector_id: "agriculture" }, extra: { share_pct_short: "96.0" } }], { request_type: "query_air", axis: AXIS });
        if (k === "province") return envelope([{ display: "1534.055", display_short: "1534.06", ...NH3, group: { province: "Punjab" }, extra: { share_pct_short: "57.4" } }], { request_type: "query_air", axis: AXIS });
        return envelope([{ display: "2100.004", display_short: "2100.00", ...NH3 }], { request_type: "query_air" });
      }
      if (body?.group_by?.includes("reporting_sector")) return envelope(SECTORS, { axis: AXIS, partition: { n: 2 } });
      if (body?.group_by?.includes("province")) return envelope(PROVINCES, { axis: AXIS, partition: { n: 2 }, derived: { unallocated_total_short: "9.01", placed_short: "443.34" } });
      return envelope([{ display: "452.34662", display_short: "452.35", ...U }]);
    }),
  );
});

function mount(search = "", onUrlUpdate?: OnUrlUpdateFunction) {
  const Wrapper = withNuqsTestingAdapter({ searchParams: search, hasMemory: true, onUrlUpdate });
  return render(
    <Wrapper>
      <Providers>
        <ExplorerProvider>
          <Page />
        </ExplorerProvider>
      </Providers>
    </Wrapper>,
  );
}

/** The release's defaults as ExplorerProvider resolves them: what the page's own links are written against. */
const DEFAULTS: StateDefaults = { period_id: RELEASE.defaults.period_id, configuration_id: RELEASE.defaults.configuration_id, gwp_basis: RELEASE.defaults.gwp_basis, spatial_view: RELEASE.defaults.spatial_view, grid_gas: "CO2" };

const notice = () => screen.findByTestId("map-unavailable");

describe("the workspace with no map", () => {
  it("says what happened, takes the map's chrome off, and gives the deck the whole pane at once — the cards, the filters and the ways to the evidence and the downloads all still there", async () => {
    mapStub.script = ["failed"];
    const updates: Parameters<OnUrlUpdateFunction>[0][] = [];
    mount("", (e) => updates.push(e));
    const card = await notice();
    expect(MAP_FAILURE.explanation).toBe("The map could not load in this browser. You can explore the same estimates in the table or chart.");
    expect(within(card).getByTestId("map-unavailable-text")).toHaveTextContent(MAP_FAILURE.explanation);
    expect(card).toHaveAttribute("role", "status");
    expect(card).toHaveAttribute("data-status", "failed");
    // no live-looking controls over a blank canvas
    expect(screen.queryByTestId("legend-capsule")).toBeNull();
    expect(screen.queryByTestId("map-buttons")).toBeNull();
    for (const id of ["map-zoom-in", "map-zoom-out", "map-locate", "map-fullscreen"]) expect(screen.queryByTestId(id), id).toBeNull();
    // the canvas itself is out of sight and out of the accessibility tree, but still mounted
    const pane = screen.getByTestId("map-pane");
    expect(pane).toHaveAttribute("aria-hidden", "true");
    expect(pane).toHaveAttribute("data-map-status", "failed");
    expect(pane).toHaveClass("invisible");
    expect(pane).toContainElement(screen.getByTestId("map-stub"));
    // the deck is the pane: the full-width column, centred in what the nav and the assistant leave
    const deck = screen.getByTestId("deck");
    expect(deck).toHaveAttribute("data-full", "1");
    for (const c of ["inset-x-0", "mx-auto", "w-full", "max-w-[640px]", "overflow-y-auto"]) expect(deck.className, c).toContain(c);
    expect(deck.className).not.toContain("w-[420px]");
    expect(deck.style.right).toBe("440px");
    expect(deck.style.top).toBe("84px");
    expect(screen.queryByTestId("deck-rail")).toBeNull();
    expect(screen.queryByTestId("deck-collapse")).toBeNull(); // there is nothing to collapse it in favour of
    // the notice is the deck's first card, and every other card follows in its usual order
    expect(Array.from(deck.children).map((el) => el.getAttribute("data-testid"))).toEqual(["map-unavailable", "header-block", "deck-header", "card-overview", "card-sectors", "card-places", "footer"]);
    // the results
    expect(await screen.findByTestId("card-overview-sentence")).toHaveTextContent("452.35 Mt CO₂e");
    expect(await screen.findByTestId("card-sectors-sentence")).toBeInTheDocument();
    // the evidence and the downloads: the nav's own sections, and each result's way into the inventory
    expect(within(screen.getByTestId("nav-capsule")).getAllByTestId("nav-link").map((l) => l.getAttribute("href"))).toEqual(["/", "/methods", "/downloads"]);
    expect(screen.getByTestId("card-overview")).toHaveAttribute("data-receipt", expect.stringMatching(/^[0-9a-f]{32}$/));
    expect(await screen.findByTestId("sectors-link")).toHaveAttribute("href", "/data");
    // the filters: the map's button stack was the way in, so the deck's header is
    const filters = within(screen.getByTestId("deck-header")).getByTestId("filters-button");
    fireEvent.click(filters);
    expect(screen.getByTestId("filter-panel")).toHaveAttribute("data-open", "1");
    fireEvent.change(screen.getByTestId("sector-select"), { target: { value: "power" } });
    await waitFor(() => expect(updates.some((u) => u.queryString.includes("sector=power"))).toBe(true));
    // and the changed filter is in the link out, with the notice still standing
    await waitFor(() => expect(screen.getByTestId("map-unavailable-link").getAttribute("href")).toContain("sector=power"));
  });

  it("the way to the table and chart carries the whole selection: a pollutant, a province and a year that is not the reference", async () => {
    mapStub.script = ["failed"];
    const search = "?pol=NH3&geo=Punjab&period=FY2020-21";
    mount(search);
    const link = within(await notice()).getByTestId("map-unavailable-link");
    expect(link).toHaveTextContent(MAP_FAILURE.alternative);
    const state = resolveState({ pol: "NH3", geo: "Punjab", period: "FY2020-21" }, DEFAULTS);
    const href = link.getAttribute("href") ?? "";
    expect(href).toBe(hrefForState(state, DEFAULTS, "/data"));
    expect(href.startsWith("/data?")).toBe(true);
    const q = new URLSearchParams(href.split("?")[1]);
    expect(q.get("pol")).toBe("NH3");
    expect(q.get("geo")).toBe("Punjab");
    expect(q.get("period")).toBe("FY2020-21");
    // the deck under it answers the same selection
    expect(screen.getByTestId("workspace")).toHaveAttribute("data-scope", "Punjab");
  });

  it("Try again remounts the map twice at most; after that the control is gone and the sentence and the link stand", async () => {
    mapStub.script = ["failed", "failed", "failed"];
    mount();
    await notice();
    expect(mapStub.mounts).toBe(1);
    expect(MAP_RETRY_LIMIT).toBe(2);
    for (let attempt = 1; attempt <= MAP_RETRY_LIMIT; attempt += 1) {
      const retry = screen.getByTestId("map-retry");
      expect(retry).toHaveTextContent(MAP_FAILURE.retry);
      expect(retry).toBeEnabled();
      fireEvent.click(retry);
      await waitFor(() => expect(mapStub.mounts).toBe(1 + attempt));
      // each failure lands back on the same notice, never on a blank panel in between
      expect(screen.getByTestId("map-unavailable-text")).toHaveTextContent(MAP_FAILURE.explanation);
      expect(screen.queryByTestId("map-buttons")).toBeNull();
    }
    await waitFor(() => expect(screen.queryByTestId("map-retry")).toBeNull());
    expect(mapStub.mounts).toBe(1 + MAP_RETRY_LIMIT);
    expect(screen.getByTestId("map-unavailable-text")).toHaveTextContent(MAP_FAILURE.explanation);
    expect(screen.getByTestId("map-unavailable-link")).toHaveAttribute("href", "/data");
    expect(screen.getByTestId("deck")).toHaveAttribute("data-full", "1");
  });

  it("while a retry is in flight the control says so and cannot be pressed again; a retry that works brings the whole map pane back", async () => {
    mapStub.script = ["failed", null];
    mount();
    await notice();
    fireEvent.click(screen.getByTestId("map-retry"));
    await waitFor(() => expect(mapStub.mounts).toBe(2));
    const retry = screen.getByTestId("map-retry");
    expect(retry).toBeDisabled();
    expect(retry).toHaveTextContent(MAP_FAILURE.retrying);
    fireEvent.click(retry);
    expect(mapStub.mounts).toBe(2);
    // the new map is not a map until it has drawn: the deck keeps the screen meanwhile
    expect(screen.getByTestId("deck")).toHaveAttribute("data-full", "1");
    act(() => mapStub.report?.("ready"));
    expect(screen.queryByTestId("map-unavailable")).toBeNull();
    expect(screen.getByTestId("legend-capsule")).toBeInTheDocument();
    expect(screen.getByTestId("map-buttons")).toBeInTheDocument();
    const deck = screen.getByTestId("deck");
    expect(deck).toHaveAttribute("data-full", "0");
    expect(deck.style.right).toBe("");
    expect(screen.getByTestId("deck-collapse")).toBeInTheDocument();
    const pane = screen.getByTestId("map-pane");
    expect(pane).not.toHaveAttribute("aria-hidden");
    expect(pane).not.toHaveClass("invisible");
  });

  it("a context the browser takes away and gives back: the notice, then the map again — the same instance, and no retry spent", async () => {
    mapStub.script = ["ready"];
    mount();
    await screen.findByTestId("map-buttons");
    expect(screen.queryByTestId("map-unavailable")).toBeNull();
    act(() => mapStub.report?.("lost"));
    expect(await notice()).toHaveAttribute("data-status", "lost");
    expect(screen.getByTestId("map-unavailable-text")).toHaveTextContent(MAP_FAILURE.explanation);
    expect(screen.queryByTestId("legend-capsule")).toBeNull();
    expect(screen.queryByTestId("map-buttons")).toBeNull();
    expect(screen.getByTestId("deck")).toHaveAttribute("data-full", "1");
    expect(screen.getByTestId("map-stub")).toBeInTheDocument(); // still mounted: the context returns to this instance
    act(() => mapStub.report?.("ready"));
    expect(screen.queryByTestId("map-unavailable")).toBeNull();
    expect(screen.getByTestId("legend-capsule")).toBeInTheDocument();
    expect(screen.getByTestId("map-buttons")).toBeInTheDocument();
    expect(screen.getByTestId("deck")).toHaveAttribute("data-full", "0");
    expect(mapStub.mounts).toBe(1);
    // both retries are still there for a loss that does not mend
    mapStub.script = ["failed", "failed"];
    act(() => mapStub.report?.("lost"));
    for (let attempt = 1; attempt <= MAP_RETRY_LIMIT; attempt += 1) {
      fireEvent.click(screen.getByTestId("map-retry"));
      await waitFor(() => expect(mapStub.mounts).toBe(1 + attempt));
    }
    await waitFor(() => expect(screen.queryByTestId("map-retry")).toBeNull());
  });

  it("a context restored before the map ever loaded is not yet a map: the notice holds until it has drawn", async () => {
    mapStub.script = ["lost"];
    mount();
    await notice();
    act(() => mapStub.report?.("loading"));
    expect(screen.getByTestId("map-unavailable")).toHaveAttribute("data-status", "lost");
    expect(screen.queryByTestId("map-buttons")).toBeNull();
    act(() => mapStub.report?.("ready"));
    expect(screen.queryByTestId("map-unavailable")).toBeNull();
    expect(screen.getByTestId("map-buttons")).toBeInTheDocument();
    expect(mapStub.mounts).toBe(1);
  });

  it("a browser that cannot draw the map, and an address the token is not accepted on: each says its own sentence and offers no retry, because none could work", async () => {
    expect(MAP_FAILURE_EXPLANATION.unsupported).toBe("The map could not load in this browser. You can explore the same estimates in the table or chart.");
    expect(MAP_FAILURE_EXPLANATION.token).toBe("The map is not available on this address. You can explore the same estimates in the table or chart.");
    for (const reason of ["unsupported", "token"] as const) {
      mapStub.script = [reason];
      mapStub.mounts = 0;
      const { unmount } = mount("?geo=Punjab");
      const card = await notice();
      expect(card, reason).toHaveAttribute("data-status", "failed");
      expect(card, reason).toHaveAttribute("data-reason", reason);
      expect(within(card).getByTestId("map-unavailable-text"), reason).toHaveTextContent(MAP_FAILURE_EXPLANATION[reason]);
      expect(within(card).queryByTestId("map-retry"), reason).toBeNull();
      // the way to the same figures is the whole of what is offered, and it still carries the selection
      expect(within(card).getByTestId("map-unavailable-link").getAttribute("href"), reason).toBe("/data?geo=Punjab");
      expect(within(card).queryAllByRole("button"), reason).toHaveLength(0);
      expect(mapStub.mounts, reason).toBe(1);
      // everything else about a workspace with no map holds
      expect(screen.queryByTestId("map-buttons"), reason).toBeNull();
      expect(screen.getByTestId("deck"), reason).toHaveAttribute("data-full", "1");
      unmount();
    }
    // the token's sentence does not send the reader off to mend a browser that is not broken
    expect(MAP_FAILURE_EXPLANATION.token).not.toContain("browser");
  });

  it("a map that did not finish loading says so in its own words, and those failures do get the retry", async () => {
    expect(MAP_FAILURE_EXPLANATION.library).toBe("The map did not finish loading. You can explore the same estimates in the table or chart.");
    expect(MAP_FAILURE_EXPLANATION.style).toBe("The map did not finish loading. You can explore the same estimates in the table or chart.");
    expect(MAP_FAILURE_EXPLANATION.timeout).toBe("The map is taking too long to load. You can explore the same estimates in the table or chart.");
    expect(MAP_FAILURE_EXPLANATION.webgl).toBe(MAP_FAILURE.explanation);
    for (const reason of ["library", "style", "timeout", "webgl"] as const) {
      mapStub.script = [reason];
      const { unmount } = mount();
      const card = await notice();
      expect(card, reason).toHaveAttribute("data-reason", reason);
      expect(within(card).getByTestId("map-unavailable-text"), reason).toHaveTextContent(MAP_FAILURE_EXPLANATION[reason]);
      expect(within(card).getByTestId("map-retry"), reason).toBeEnabled();
      expect(within(card).getByTestId("map-unavailable-link"), reason).toHaveAttribute("href", "/data");
      unmount();
    }
  });

  it("a retry that never answers does not hang: the map's own timeout ends it, the control comes back, and at the cap it is gone", async () => {
    // the first map fails for a reason a retry can cure; neither retry ever loads or fails by itself
    mapStub.script = ["style", null, null];
    mount();
    await notice();
    for (let attempt = 1; attempt <= MAP_RETRY_LIMIT; attempt += 1) {
      fireEvent.click(screen.getByTestId("map-retry"));
      await waitFor(() => expect(mapStub.mounts).toBe(1 + attempt));
      expect(screen.getByTestId("map-retry")).toBeDisabled();
      expect(screen.getByTestId("map-retry")).toHaveTextContent(MAP_FAILURE.retrying);
      // silence, until the map gives up on itself: a status like any other
      act(() => mapStub.report?.("timeout"));
      expect(screen.getByTestId("map-unavailable")).toHaveAttribute("data-reason", "timeout");
      expect(screen.getByTestId("map-unavailable-text")).toHaveTextContent(MAP_FAILURE_EXPLANATION.timeout);
      if (attempt < MAP_RETRY_LIMIT) {
        expect(screen.getByTestId("map-retry")).toBeEnabled();
        expect(screen.getByTestId("map-retry")).toHaveTextContent(MAP_FAILURE.retry);
      }
    }
    // both spent: no control left saying "Trying again…", and none to press
    expect(screen.queryByTestId("map-retry")).toBeNull();
    expect(mapStub.mounts).toBe(1 + MAP_RETRY_LIMIT);
    expect(screen.getByTestId("map-unavailable-link")).toHaveAttribute("href", "/data");
    // a map given up on that loads after all is shown, as a restored context is
    act(() => mapStub.report?.("ready"));
    expect(screen.queryByTestId("map-unavailable")).toBeNull();
    expect(screen.getByTestId("map-buttons")).toBeInTheDocument();
  });

  it("a retry that meets a refusal offers no more of them, though one is left: the reason is the latest map's", async () => {
    mapStub.script = ["timeout", "token"];
    mount();
    await notice();
    fireEvent.click(screen.getByTestId("map-retry"));
    await waitFor(() => expect(mapStub.mounts).toBe(2));
    await waitFor(() => expect(screen.getByTestId("map-unavailable")).toHaveAttribute("data-reason", "token"));
    expect(screen.getByTestId("map-unavailable-text")).toHaveTextContent(MAP_FAILURE_EXPLANATION.token);
    expect(MAP_RETRY_LIMIT).toBeGreaterThan(1);
    expect(screen.queryByTestId("map-retry")).toBeNull();
  });

  it("a lost context reads as the browser's own failure whatever an earlier map said, and keeps its retry", async () => {
    mapStub.script = ["timeout", "ready"];
    mount();
    await notice();
    fireEvent.click(screen.getByTestId("map-retry"));
    await screen.findByTestId("map-buttons");
    act(() => mapStub.report?.("lost"));
    const card = await notice();
    expect(card).toHaveAttribute("data-status", "lost");
    expect(card).toHaveAttribute("data-reason", "webgl");
    expect(within(card).getByTestId("map-unavailable-text")).toHaveTextContent(MAP_FAILURE.explanation);
    expect(within(card).getByTestId("map-retry")).toBeEnabled();
  });

  it("Reset map is not offered while there is no map: the selection is still cleared from the place picker and from Reset filters, and the control returns with the map", async () => {
    mapStub.script = ["ready"];
    const updates: Parameters<OnUrlUpdateFunction>[0][] = [];
    mount("?geo=Punjab", (e) => updates.push(e));
    await screen.findByTestId("map-buttons");
    // a place is picked and the map is up: there is something to reset, and a map to reset
    expect(screen.getByTestId("header-reset")).toHaveTextContent("Reset map");
    act(() => mapStub.report?.("lost"));
    await notice();
    expect(screen.queryByTestId("header-reset")).toBeNull();
    expect(screen.getByTestId("header-block")).not.toHaveTextContent("Reset map");
    // the place card keeps its other two actions, and the selection it still shows
    expect(screen.getByTestId("header-utilities")).toHaveTextContent("Share");
    expect(screen.getByTestId("header-utilities")).toHaveTextContent("Download");
    expect(screen.getByTestId("workspace")).toHaveAttribute("data-scope", "Punjab");
    act(() => mapStub.report?.("ready"));
    expect(screen.getByTestId("header-reset")).toBeInTheDocument();
    // down again, for good this time: the two other ways to clear the selection both work
    act(() => mapStub.report?.("token"));
    await notice();
    expect(screen.queryByTestId("header-reset")).toBeNull();
    fireEvent.click(screen.getByTestId("place-picker"));
    fireEvent.click(screen.getByTestId("place-option-all"));
    await waitFor(() => expect(screen.getByTestId("workspace")).toHaveAttribute("data-scope", "PK"));
    expect(updates.at(-1)?.queryString ?? "").not.toContain("geo=");
    expect(screen.queryByTestId("header-reset")).toBeNull();
    fireEvent.click(within(screen.getByTestId("deck-header")).getByTestId("filters-button"));
    expect(screen.getByTestId("reset-filters")).toBeInTheDocument();
  });

  it("a narrow window on its map pane is not left on a blank one: the deck takes it, the switch goes, the filters stay, and the pane in the URL is left alone", async () => {
    stubNarrowViewport();
    mapStub.script = ["failed"];
    const updates: Parameters<OnUrlUpdateFunction>[0][] = [];
    mount("", (e) => updates.push(e));
    await notice();
    const deck = screen.getByTestId("deck");
    expect(deck).toHaveAttribute("data-full", "1");
    expect(deck.style.right).toBe(""); // nothing beside the deck at this width
    expect(screen.queryByTestId("pane-switch")).toBeNull();
    expect(screen.queryByTestId("legend-capsule")).toBeNull();
    expect(screen.queryByTestId("map-buttons")).toBeNull();
    expect(screen.getByTestId("nav-capsule")).toBeInTheDocument();
    expect(await screen.findByTestId("card-overview-sentence")).toHaveTextContent("452.35 Mt CO₂e");
    fireEvent.click(within(screen.getByTestId("deck-header")).getByTestId("filters-button"));
    expect(screen.getByTestId("filter-panel")).toHaveAttribute("data-open", "1");
    expect(updates.some((u) => u.queryString.includes("pane="))).toBe(false);
    // the map returns: so does the pane the window was on, with its switch
    act(() => mapStub.report?.("ready"));
    expect(screen.getByTestId("pane-map")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("deck")).toBeNull();
    expect(screen.getByTestId("map-buttons")).toBeInTheDocument();
  });

  it("a map that loads is the workspace as it was: no notice, and the deck in its column", async () => {
    mapStub.script = ["ready"];
    mount();
    await screen.findByTestId("map-buttons");
    expect(screen.queryByTestId("map-unavailable")).toBeNull();
    expect(screen.getByTestId("legend-capsule")).toBeInTheDocument();
    const deck = screen.getByTestId("deck");
    expect(deck).toHaveAttribute("data-full", "0");
    expect(deck.style.right).toBe("");
    expect(screen.getByTestId("map-pane")).not.toHaveClass("invisible");
    expect(Array.from(deck.children).map((el) => el.getAttribute("data-testid"))).toEqual(["header-block", "deck-header", "card-overview", "card-sectors", "card-places", "footer"]);
  });
});
