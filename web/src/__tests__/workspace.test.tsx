import "@testing-library/jest-dom/vitest";
/**
 * The workspace at `/` (the Overview and the Map merged on 2026-08-30) against mocked envelopes
 * that carry the server's presentation fields (`display_short`, `share_pct_short`,
 * `share_phrase`, `rank`, `axis.ticks_short`, `change`, `derived`):
 *
 *  · the frame — the map full-bleed behind everything, the nav capsule, the 420 px insight
 *    deck, the filter panel and the legend capsule over it, the map buttons and Map settings;
 *  · the URL round trip — the level, sector, gas and year the filter panel writes come back as
 *    the deck's and the map's scope, and nothing but the URL carries them;
 *  · the scope chips clearing each of the three back to its default;
 *  · collapse-all flipping every widget's switch, and each switch collapsing its own card;
 *  · the narrow window (under 1280 px): one pane at a time, the Dashboard | Map switch in the
 *    nav capsule, the pane in the URL and nowhere else;
 *  · the four audits — every decimal on the page is a server string (ticks included), no "FY",
 *    no raw id (bare AR5, "(NE)", "LULUCF", a version), no avoid-list phrase — and the naming
 *    rule: the chrome never names the dataset.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import Page from "@/app/page";
import { RELEASE, envelope, mockFetch, refusal, stubNarrowViewport, stubWideViewport } from "./fixtures";
import { avoidPhrasesIn, namesDataset } from "./vocabulary";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/map/ExplorerMap", () => ({
  ExplorerMap: ({ override, padding, opacity }: { override?: { sector?: string | null }; padding?: { left: number; right: number }; opacity?: number }) => (
    <div data-testid="map-stub" data-sector={override?.sector ?? ""} data-pad-left={padding?.left ?? ""} data-pad-right={padding?.right ?? ""} data-opacity={opacity ?? ""} />
  ),
}));
type Item = { id: string; name: string; label: string };
vi.mock("@/components/charts/BarsWithAxis", () => ({
  BarsWithAxis: ({ items, ticks, onHover, onSelect, testId = "bars-with-axis" }: { items: Item[]; ticks?: string[] | null; onHover?: (id: string | null) => void; onSelect?: (id: string) => void; testId?: string }) => (
    <div data-testid={testId} data-ticks={(ticks ?? []).join("|")}>
      {(ticks ?? []).map((t, i) => <span key={i} data-testid="axis-tick">{t}</span>)}
      {items.map((i) => <button key={i.id} type="button" data-testid="bar-item" data-id={i.id} onMouseEnter={() => onHover?.(i.id)} onClick={() => onSelect?.(i.id)}>{i.name} {i.label}</button>)}
    </div>
  ),
}));
vi.mock("@/components/charts/ColumnChart", () => ({
  ColumnChart: ({ points, ticks }: { points: Item[]; ticks?: string[] | null }) => (
    <div data-testid="column-chart" data-ticks={(ticks ?? []).join("|")}>
      {(ticks ?? []).map((t, i) => <span key={i} data-testid="axis-tick">{t}</span>)}
      {points.map((p) => <span key={p.id} data-testid="column">{p.name} {p.label}</span>)}
    </div>
  ),
}));

const U = { unit_short: "Mt CO₂e", unit_words: "million tonnes CO₂e" };
const AXIS_250 = { ticks_short: ["0", "50", "100", "150", "200", "250"], min_short: "0.30", max_short: "223.45", unit_short: "Mt CO₂e" };
const SECTORS = [
  { display: "223.454", display_short: "223.45", ...U, group: { sector_id: "agriculture" }, extra: { share_pct_short: "49.4", share_phrase: "nearly half", rank: 1 } },
  { display: "63.370", display_short: "63.37", ...U, group: { sector_id: "power" }, extra: { share_pct_short: "14.0", share_phrase: "about a tenth", rank: 2 } },
  { display: "41.926", display_short: "41.93", ...U, group: { sector_id: "transport" }, extra: { share_pct_short: "9.3", share_phrase: "a small share", rank: 3 } },
];
const PUNJAB_SECTORS = [
  { display: "123.301", display_short: "123.30", ...U, group: { module: "agriculture" }, extra: { share_pct_short: "53.9", share_phrase: "nearly half", rank: 1 } },
  { display: "27.488", display_short: "27.49", ...U, group: { module: "transport" }, extra: { share_pct_short: "12.0", share_phrase: "about a tenth", rank: 2 } },
];
const GASES = [
  { display: "248.748", display_short: "248.75", ...U, group: { gas: "CH4" }, extra: { share_pct_short: "55.0", share_phrase: "over half", rank: 1 } },
  { display: "161.456", display_short: "161.46", ...U, group: { gas: "CO2" }, extra: { share_pct_short: "35.7", share_phrase: "about a third", rank: 2 } },
];
const PROVINCES = [
  { display: "228.7168", display_short: "228.72", ...U, group: { province: "Punjab" }, extra: { share_pct_short: "50.6", share_phrase: "nearly half", rank: 1 } },
  { display: "134.7255", display_short: "134.73", ...U, group: { province: "Sindh" }, extra: { share_pct_short: "29.8", share_phrase: "about a quarter", rank: 2 } },
];
const DERIVED_PK = { unallocated_total_short: "9.01", placed_short: "443.34" };
const DERIVED_PB = { unallocated_total_short: "4.84", placed_short: "223.88" };
const SERIES = [
  { display: "372.397", display_short: "372.40", ...U, group: { period_id: "FY2020-21" } },
  { display: "452.347", display_short: "452.35", ...U, group: { period_id: "FY2023-24" } },
];
const SERIES_AXIS = { ticks_short: ["0", "100", "200", "300", "400", "500"], unit_short: "Mt CO₂e" };
const CHANGE = { from_period: "FY2020-21", to_period: "FY2023-24", from_short: "372.40", to_short: "452.35", change_short: "+79.95", change_pct_short: "+21.5", direction: "rose", unit_short: "Mt CO₂e" };
const NATIONAL = [{ display: "452.34662", display_short: "452.35", ...U }];
const PUNJAB = [{ display: "228.7168", display_short: "228.72", ...U, group: { province: "Punjab" } }];
const SERIES_REFUSAL = refusal("grain_unavailable", "GrainUnavailable", "spatial products exist for the reference year only");

const fetchSpy = vi.fn();
beforeEach(() => {
  fetchSpy.mockReset();
  stubWideViewport();
  vi.stubGlobal(
    "fetch",
    mockFetch((url, body) => {
      fetchSpy(url, body);
      if (url.endsWith("/release")) return RELEASE;
      if (url.endsWith("/openapi.json")) return { paths: { "/api/v1/emissions/release": {} }, components: { schemas: { QueryEmissions: { properties: { gwp_basis: { description: "AR5 | AR6" }, spatial_view: { description: "all | physical | origin | accounting" } } }, GridCellRequest: { properties: { gas: { default: "CO2" }, month: { description: 'YYYYMM or "annual"' } } } } } };
      if (url.includes("/tiles/")) return { raster: undefined, adm1: {}, adm2: {} };
      if (url.includes("/timeseries")) {
        const q = (body as { query?: { geography_ids?: string[] } } | undefined)?.query;
        if (q?.geography_ids?.length) return SERIES_REFUSAL;
        return envelope(SERIES, { request_type: "get_timeseries", axis: SERIES_AXIS, change: CHANGE });
      }
      if (url.includes("/query/air")) {
        const k = (body as { group_by?: string[] } | undefined)?.group_by?.[0];
        if (k === "year") return envelope([{ display: "782.446", display_short: "782.45", unit: "kt NH3", unit_short: "kt NH₃", group: { year: "1990" } }, { display: "2674.532", display_short: "2674.53", unit: "kt NH3", unit_short: "kt NH₃", group: { year: "2024" } }], { request_type: "query_air" });
        if (k === "province") return envelope([{ display: "1534.055", display_short: "1534.06", unit: "kt NH3", unit_short: "kt NH₃", group: { province: "Punjab" }, extra: { share_pct_short: "57.4" } }], { request_type: "query_air", axis: AXIS_250 });
        if (k === "sector_id") return envelope([{ display: "2674.532", display_short: "2674.53", unit: "kt NH3", unit_short: "kt NH₃", group: { sector_id: "agriculture" }, extra: { share_pct_short: "96.0" } }], { request_type: "query_air", axis: AXIS_250 });
        return envelope([{ display: "2784.709", display_short: "2784.71", unit: "kt NH3", unit_short: "kt NH₃" }], { request_type: "query_air" });
      }
      if (body?.group_by?.includes("sector_id")) return envelope(SECTORS, { axis: AXIS_250, partition: { n: 3 } });
      if (body?.group_by?.includes("module")) return envelope(PUNJAB_SECTORS, { axis: { ticks_short: ["0", "25", "50", "75", "100", "125"], unit_short: "Mt CO₂e" }, partition: { n: 2 } });
      if (body?.group_by?.includes("gas")) return envelope(GASES, { axis: AXIS_250, partition: { n: 2 } });
      if (body?.group_by?.includes("province")) return envelope(PROVINCES, { axis: AXIS_250, partition: { n: 2 }, derived: DERIVED_PK });
      if (body?.geography_ids?.includes("Punjab")) return envelope(PUNJAB, { derived: DERIVED_PB });
      return envelope(NATIONAL);
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

/** Every decimal token the mocked server sent: displays, shorts, shares, ticks, the change strings and the derived strings. */
function serverDecimals(): Set<string> {
  const out = new Set<string>();
  const add = (s: string) => (s.match(/\d+\.\d+/g) ?? []).forEach((t) => out.add(t));
  for (const c of [...SECTORS, ...PUNJAB_SECTORS, ...GASES, ...PROVINCES, ...SERIES, ...NATIONAL, ...PUNJAB]) add(JSON.stringify(c));
  for (const o of [AXIS_250, SERIES_AXIS, CHANGE, DERIVED_PK, DERIVED_PB, RELEASE]) add(JSON.stringify(o));
  return out;
}

async function loaded() {
  await screen.findByTestId("card-snapshot-sentence");
  await screen.findByTestId("card-sectors-sentence");
  await screen.findByTestId("card-places-sentence");
}

/** The last URL the page wrote once one containing `part` has arrived (nuqs batches its writes). */
async function urlWith(updates: Parameters<OnUrlUpdateFunction>[0][], part: string) {
  await waitFor(() => expect(updates.some((u) => u.queryString.includes(part)), `no URL update containing ${part}`).toBe(true));
  return updates[updates.length - 1].queryString;
}

describe("the workspace frame", () => {
  it("one full-bleed map behind everything, with the nav capsule, the deck, the filter panel, the legend capsule, the map buttons and Map settings over it", async () => {
    mount();
    await loaded();
    const page = screen.getByTestId("workspace");
    for (const c of ["relative", "h-dvh", "overflow-hidden"]) expect(page.className, c).toContain(c);
    // the map fills the frame, behind the panels
    const pane = screen.getByTestId("map-pane");
    expect(pane.className).toContain("absolute inset-0");
    expect(pane).toContainElement(screen.getByTestId("map-stub"));
    expect(Array.from(page.children)[0]).toBe(pane);
    // the nav capsule floats at the deck's own left inset, so the two left edges are one line
    const nav = screen.getByTestId("nav-capsule");
    expect(nav.className).toContain("absolute left-5 top-5");
    expect(screen.getAllByTestId("nav-link").map((a) => a.textContent)).toEqual(["Explore", "Data", "Methods", "Downloads"]);
    // the deck: 420 px, inset 20, under the capsule, its own scroll, letting pointer events through
    const deck = screen.getByTestId("deck");
    // 420 px exactly, so the nav capsule above it shares both edges
    for (const c of ["absolute", "left-5", "top-[84px]", "bottom-5", "w-[420px]", "z-20", "overflow-y-auto", "overscroll-contain", "scrollbar-none", "pointer-events-none", "flex flex-col gap-3"]) expect(deck.className, c).toContain(c);
    expect(deck.className).not.toContain("pr-2");
    expect(screen.getByTestId("nav-capsule").className).toContain("w-[420px]");
    expect(deck.className).not.toMatch(/(^|\s)bg-/); // the map shows between the cards
    const cards = Array.from(deck.children).map((el) => el.getAttribute("data-testid"));
    expect(cards).toEqual(["header-block", "deck-header", "scope-chips", "card-snapshot", "card-sectors", "card-trend", "card-places", "footer"]);
    for (const id of ["card-snapshot", "card-sectors", "card-trend", "card-places", "footer"]) expect(screen.getByTestId(id).className, id).toContain("pointer-events-auto");
    expect(screen.getByTestId("deck-header")).toHaveTextContent("INSIGHTS · PAKISTAN");
    // the filter panel: 340 px, top-right
    const filters = screen.getByTestId("filter-panel");
    for (const c of ["absolute", "right-5", "top-5", "z-20", "w-[340px]", "card", "p-4"]) expect(filters.className, c).toContain(c);
    // the legend capsule: bottom-left of the map, right of the deck, one line and no break numbers
    const legend = screen.getByTestId("legend-capsule");
    const slot = screen.getByTestId("legend-capsule-slot"); // the capsule plus the panel its ⓘ opens above it
    expect(slot.className).toContain("left-[calc(20px+420px+16px)]");
    expect(slot.className).toContain("bottom-5");
    expect(legend).toHaveTextContent("Relative");
    expect(legend).toHaveTextContent("Lower");
    expect(legend).toHaveTextContent("Higher");
    expect((legend.textContent ?? "").match(/\d/g)).toBeNull();
    expect(screen.queryByTestId("legend")).toBeNull(); // never two legends at once
    expect(screen.queryByTestId("layer-legend")).toBeNull();
    expect(screen.queryByTestId("opacity-pill")).toBeNull();
    // the map's own buttons, bottom-right, and the Map settings pill under them
    const buttons = screen.getByTestId("map-buttons");
    expect(buttons.className).toContain("right-5");
    for (const id of ["map-zoom-in", "map-zoom-out", "map-locate", "map-fullscreen"]) expect(within(buttons).getByTestId(id).className, id).toContain("glass");
    expect(screen.getByTestId("map-settings-button")).toHaveTextContent("Map settings");
    expect(screen.queryByTestId("map-settings-panel")).toBeNull();
    // at 1280 px and above both panes are on screen, so nothing offers a choice between them
    expect(screen.queryByTestId("pane-switch")).toBeNull();
    expect(screen.getByTestId("map-pane")).not.toHaveAttribute("aria-hidden");
    // the brand mark appears once, in the nav: the footer is the compact licence line alone
    const logos = screen.getAllByTestId("brand-logo");
    expect(logos).toHaveLength(1);
    expect(nav).toContainElement(logos[0]);
  });
  it("the map's padding is the chrome's own widths, and collapsing a panel re-computes it", async () => {
    mount();
    await loaded();
    const stub = () => screen.getByTestId("map-stub");
    // the chrome's own widths plus FRAME_MARGIN_PX all round, so the country stands off the panels
    const M = 12;
    expect(stub()).toHaveAttribute("data-pad-left", String(420 + 20 + 16 + M));
    expect(stub()).toHaveAttribute("data-pad-right", String(340 + 20 + 16 + M));
    fireEvent.click(screen.getByTestId("filters-collapse"));
    expect(screen.getByTestId("filter-panel")).toHaveAttribute("data-open", "0");
    expect(stub()).toHaveAttribute("data-pad-right", String(48 + 20 + 16 + M));
    fireEvent.click(screen.getByTestId("deck-collapse"));
    expect(screen.queryByTestId("deck")).toBeNull();
    expect(screen.getByTestId("deck-rail")).toBeInTheDocument();
    expect(stub()).toHaveAttribute("data-pad-left", String(20 + M));
    fireEvent.click(screen.getByTestId("deck-rail"));
    expect(await screen.findByTestId("deck")).toBeInTheDocument();
    expect(stub()).toHaveAttribute("data-pad-left", String(420 + 20 + 16 + M));
    fireEvent.click(screen.getByTestId("filters-expand"));
    expect(stub()).toHaveAttribute("data-pad-right", String(340 + 20 + 16 + M));
  });
  it("Map settings carries what left the filter panel plus the map's own display choices: the layer, the scale, the opacity, the raster, the basemap, the boundaries, the month, the estimate, the warming potentials and the spatial view", async () => {
    mount();
    await loaded();
    // none of them is in the panel any more
    for (const id of ["config-select", "gwp-select", "view-select", "layer-switch", "opacity-range", "raster-toggle"]) expect(screen.queryByTestId(id), id).toBeNull();
    fireEvent.click(screen.getByTestId("map-settings-button"));
    const panel = screen.getByTestId("map-settings-panel");
    for (const id of ["layer-switch", "scale-select", "opacity-range", "raster-toggle", "basemap-select", "boundaries-toggle", "month-select", "config-select", "gwp-select", "view-select"]) expect(within(panel).getByTestId(id), id).toBeInTheDocument();
    expect((within(panel).getByTestId("config-select") as HTMLSelectElement).options[0].textContent).toBe("Reference estimate");
    expect(Array.from(within(panel).getByTestId("gwp-select").querySelectorAll("button")).map((b) => b.textContent)).toEqual(["IPCC 2013 (AR5)", "IPCC 2021 (AR6)"]);
    // the opacity is a display setting the page owns and hands to the map, never the URL
    fireEvent.change(within(panel).getByTestId("opacity-range"), { target: { value: "40" } });
    expect(screen.getByTestId("opacity-value")).toHaveTextContent("40%");
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-opacity", "40");
    fireEvent.click(screen.getByTestId("map-settings-close"));
    expect(screen.queryByTestId("map-settings-panel")).toBeNull();
  });
});

describe("the workspace's state", () => {
  it("the filter panel writes level, sector, gas and the year to the URL, and the deck and the map read them back", async () => {
    const updates: Parameters<OnUrlUpdateFunction>[0][] = [];
    mount("", (e) => updates.push(e));
    await loaded();
    fireEvent.click(screen.getByTestId("level-adm2"));
    expect(await urlWith(updates, "level=adm2")).toContain("level=adm2");
    fireEvent.change(screen.getByTestId("sector-select"), { target: { value: "power" } });
    expect(await urlWith(updates, "sector=power")).toContain("sector=power");
    fireEvent.change(screen.getByTestId("gas-select"), { target: { value: "CH4" } });
    expect(await urlWith(updates, "gas=CH4")).toContain("gas=CH4");
    fireEvent.change(screen.getByTestId("year-range"), { target: { value: "0" } });
    expect(await urlWith(updates, "period=FY2020-21")).toContain("period=FY2020-21");
    // the year slider's ends are the release's own short labels, and the value is one of them
    await waitFor(() => expect(screen.getByTestId("year-value")).toHaveTextContent("2020–21"));
    // the active view line reads the same scope back in words
    expect(screen.getByTestId("active-view")).toHaveTextContent("Pakistan · Power · CH₄ · 2020–21");
  });
  it("a scope read from the URL becomes the chips, and each chip clears back to its default", async () => {
    const updates: Parameters<OnUrlUpdateFunction>[0][] = [];
    mount("?sector=power&gas=CH4&period=FY2020-21", (e) => updates.push(e));
    await screen.findByTestId("card-snapshot-sentence");
    const chips = screen.getByTestId("scope-chips");
    expect(within(chips).getByTestId("chip-sector")).toHaveTextContent("Power");
    expect(within(chips).getByTestId("chip-gas")).toHaveTextContent("CH₄");
    expect(within(chips).getByTestId("chip-period")).toHaveTextContent("2020–21");
    for (const id of ["chip-sector", "chip-gas", "chip-period"]) expect(screen.getByTestId(id)).toHaveAttribute("data-default", "0");
    fireEvent.click(screen.getByTestId("chip-sector-clear"));
    await waitFor(() => expect(screen.getByTestId("chip-sector")).toHaveTextContent("All sectors"));
    fireEvent.click(screen.getByTestId("chip-gas-clear"));
    await waitFor(() => expect(screen.getByTestId("chip-gas")).toHaveTextContent("All gases"));
    fireEvent.click(screen.getByTestId("chip-period-clear"));
    await waitFor(() => expect(screen.getByTestId("chip-period")).toHaveTextContent("2023–24"));
    // a chip at its default carries no clear button
    for (const id of ["chip-sector", "chip-gas", "chip-period"]) {
      expect(screen.getByTestId(id)).toHaveAttribute("data-default", "1");
      expect(screen.queryByTestId(`${id}-clear`), id).toBeNull();
    }
    expect(updates[updates.length - 1].queryString).toBe("");
  });
  it("the province card re-scopes the deck; the hovered sector steers the map without reaching the URL", async () => {
    const updates: Parameters<OnUrlUpdateFunction>[0][] = [];
    mount("", (e) => updates.push(e));
    await loaded();
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-sector", "");
    const bars = within(screen.getByTestId("sectors-bars")).getAllByTestId("bar-item");
    fireEvent.click(bars[1]);
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-sector", "power");
    expect(updates.some((u) => u.queryString.includes("sector="))).toBe(false); // the hover/pick stays local
    expect(screen.getByTestId("sectors-link")).toHaveAttribute("href", "/data?sector=power");
    fireEvent.click(bars[1]);
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-sector", "");
    // the card offers no reset until there is something to reset, and no "Choose a province" button
    expect(screen.queryByTestId("header-reset")).toBeNull();
    expect(screen.queryByTestId("header-choose")).toBeNull();
    expect(screen.getByTestId("header-utilities")).toHaveTextContent("Share");
    expect(screen.getByTestId("header-utilities")).toHaveTextContent("Download");
    // the province select writes `geo`, and the deck re-writes itself to the province's cards
    fireEvent.change(screen.getByTestId("province-select"), { target: { value: "Punjab" } });
    await waitFor(() => expect(screen.getByTestId("card-snapshot-sentence")).toHaveTextContent("In 2023–24, Punjab's allocated emissions were 228.72 Mt CO₂e."));
    expect(screen.getByTestId("workspace")).toHaveAttribute("data-scope", "Punjab");
    expect(screen.getByTestId("deck")).toHaveAttribute("data-scope", "province");
    expect(screen.getByTestId("deck-header")).toHaveTextContent("INSIGHTS · PUNJAB");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Punjab");
    expect(await screen.findByTestId("card-composition-sentence")).toHaveTextContent("agriculture was the largest source of emissions, contributing 123.30 Mt");
    // now a place is picked, "Reset map" appears, and it returns the deck and the map to Pakistan
    expect(screen.getByTestId("header-reset")).toHaveTextContent("Reset map");
    fireEvent.click(screen.getByTestId("header-reset"));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pakistan"));
    expect(screen.getByTestId("workspace")).toHaveAttribute("data-scope", "PK");
  });
  it("Reset filters clears the level, the place, the sector, the gas and the year at once", async () => {
    const updates: Parameters<OnUrlUpdateFunction>[0][] = [];
    mount("?level=adm2&sector=power&gas=CH4&period=FY2020-21", (e) => updates.push(e));
    await screen.findByTestId("card-snapshot-sentence");
    fireEvent.click(screen.getByTestId("reset-filters"));
    await waitFor(() => expect(updates[updates.length - 1].queryString).toBe(""));
    expect(screen.getByTestId("chip-sector")).toHaveTextContent("All sectors");
  });
});

describe("the deck's cards", () => {
  it("collapse-all flips every switch and its own label; one switch collapses its own card to its header row", async () => {
    mount();
    await loaded();
    const all = screen.getByTestId("deck-collapse-all");
    expect(all).toHaveTextContent("Collapse all");
    const ids = ["card-snapshot", "card-sectors", "card-trend", "card-places"];
    const switches = ids.map((id) => screen.getByTestId(`${id}-switch`));
    expect(screen.getAllByRole("switch")).toHaveLength(4);
    for (const sw of switches) expect(sw).toHaveAttribute("aria-checked", "true");
    fireEvent.click(switches[1]);
    expect(switches[1]).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByTestId("card-sectors-sentence")).toBeNull();
    expect(screen.queryByTestId("sectors-bars")).toBeNull();
    expect(screen.getByTestId("card-sectors")).toHaveTextContent("Emission sources");
    expect(screen.getByTestId("card-trend-sentence")).toBeInTheDocument();
    fireEvent.click(switches[1]);
    expect(await screen.findByTestId("card-sectors-sentence")).toBeInTheDocument();
    fireEvent.click(all);
    for (const sw of switches) expect(sw).toHaveAttribute("aria-checked", "false");
    for (const id of ids) expect(screen.queryByTestId(`${id}-sentence`), id).toBeNull();
    expect(all).toHaveTextContent("Expand all");
    expect(all).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(all);
    for (const id of ids) expect(await screen.findByTestId(`${id}-sentence`)).toBeInTheDocument();
  });
  it("each card's sentence is built from the envelope's server strings, and the charts' ticks are the envelopes' own", async () => {
    mount();
    await loaded();
    expect(screen.getByTestId("card-snapshot-sentence")).toHaveTextContent("In 2023–24, Pakistan emitted an estimated 452.35 Mt CO₂e. Agriculture contributed 223.45 Mt, accounting for 49.4 % of the total.");
    expect(screen.getByTestId("snapshot-chip")).toHaveTextContent("49.4 % from agriculture");
    expect(screen.queryByTestId("snapshot-meta")).toBeNull();   // the meta line was removed on 2026-08-31
    expect(screen.getByTestId("card-sectors-sentence")).toHaveTextContent("In 2023–24, agriculture was the largest source of emissions, contributing 223.45 Mt CO₂e (49.4 %). Power followed at 63.37 Mt (14.0 %), with transport at 41.93 Mt (9.3 %).");
    expect(screen.getByTestId("card-trend-sentence")).toHaveTextContent("Between 2020–21 and 2023–24, Pakistan's emissions increased by +21.5 %, from 372.40 Mt to 452.35 Mt CO₂e.");
    expect(screen.getByTestId("card-places-sentence")).toHaveTextContent("Punjab carried 228.72 Mt of the allocated total — 50.6 %, the largest provincial share.");
    expect(screen.getByTestId("sectors-bars")).toHaveAttribute("data-ticks", AXIS_250.ticks_short.join("|"));
    expect(screen.getByTestId("column-chart")).toHaveAttribute("data-ticks", SERIES_AXIS.ticks_short.join("|"));
    expect(within(screen.getByTestId("column-chart")).getAllByTestId("column").map((c) => c.textContent)).toEqual(["2020–21 372.40", "2023–24 452.35"]);
    // a card's header is its title and its switch: the toolbar icons were removed on 2026-08-31
    for (const id of ["card-snapshot", "card-sectors", "card-trend", "card-places"]) {
      expect(screen.getByTestId(`${id}-switch`)).toHaveAttribute("role", "switch");
      for (const tool of ["info", "download", "share", "claim"]) expect(screen.queryByTestId(`${id}-${tool}`), `${id}-${tool}`).toBeNull();
    }
  });
});

describe("the narrow workspace: one pane at a time", () => {
  it("the map pane is the map alone — its legend, its buttons and its filters sheet — with the Dashboard | Map switch in the nav capsule and no deck", async () => {
    stubNarrowViewport();
    mount();
    const sw = await screen.findByTestId("pane-switch");
    // the switch lives in the capsule, which grows to hold it rather than clipping the links
    const nav = screen.getByTestId("nav-capsule");
    expect(nav).toContainElement(sw);
    expect(nav.className).not.toContain("w-[420px]");
    expect(nav.className).toContain("w-auto");
    expect(screen.getByTestId("pane-map")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("pane-dashboard")).toHaveAttribute("aria-pressed", "false");
    expect([screen.getByTestId("pane-dashboard").textContent, screen.getByTestId("pane-map").textContent]).toEqual(["Dashboard", "Map"]);
    // the map pane: the map, its legend, its buttons and the filters sheet's button; no deck
    expect(screen.getByTestId("map-stub")).toBeInTheDocument();
    expect(screen.getByTestId("map-pane")).not.toHaveAttribute("aria-hidden");
    expect(screen.getByTestId("legend-capsule")).toBeInTheDocument();
    expect(screen.getByTestId("map-buttons")).toBeInTheDocument();
    expect(screen.queryByTestId("deck")).toBeNull();
    expect(screen.queryByTestId("deck-rail")).toBeNull();
    expect(screen.queryByTestId("filter-panel")).toBeNull(); // the sheet, closed
    // one pane means no side chrome: the map's padding is the nav above and a small inset all round
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-pad-left", "32");
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-pad-right", "32");
    fireEvent.click(screen.getByTestId("filters-button"));
    expect(screen.getByTestId("filter-panel")).toHaveAttribute("data-open", "1");
  });
  it("Dashboard shows the deck as one full-width column, hides the map's own chrome, keeps the filters within reach, and writes the pane to the URL", async () => {
    stubNarrowViewport();
    const updates: Parameters<OnUrlUpdateFunction>[0][] = [];
    mount("", (e) => updates.push(e));
    fireEvent.click(await screen.findByTestId("pane-dashboard"));
    await loaded();
    expect(await urlWith(updates, "pane=dashboard")).toContain("pane=dashboard");
    expect(screen.getByTestId("pane-dashboard")).toHaveAttribute("aria-pressed", "true");
    // the deck is the pane: full width, inset 20, capped and centred, under the nav capsule
    const deck = screen.getByTestId("deck");
    expect(deck).toHaveAttribute("data-full", "1");
    for (const c of ["absolute", "inset-x-0", "top-[84px]", "bottom-0", "mx-auto", "w-full", "max-w-[560px]", "overflow-y-auto", "px-5"]) expect(deck.className, c).toContain(c);
    expect(deck.className).not.toContain("w-[420px]");
    // every card is still there, in the same order
    expect(Array.from(deck.children).map((el) => el.getAttribute("data-testid"))).toEqual(["header-block", "deck-header", "scope-chips", "card-snapshot", "card-sectors", "card-trend", "card-places", "footer"]);
    expect(screen.getByTestId("card-snapshot-sentence")).toHaveTextContent("452.35 Mt CO₂e");
    // and the map's own chrome is not: no legend capsule, no map buttons, no Map settings
    expect(screen.queryByTestId("legend-capsule")).toBeNull();
    expect(screen.queryByTestId("map-buttons")).toBeNull();
    expect(screen.queryByTestId("map-settings-button")).toBeNull();
    expect(screen.getByTestId("map-pane")).toHaveAttribute("aria-hidden", "true");
    // the filters stay reachable, from the deck's own header
    const filters = within(screen.getByTestId("deck-header")).getByTestId("filters-button");
    fireEvent.click(filters);
    expect(screen.getByTestId("filter-panel")).toHaveAttribute("data-open", "1");
    fireEvent.click(screen.getByTestId("filters-close"));
    // and the map comes back whole
    fireEvent.click(screen.getByTestId("pane-map"));
    expect(await urlWith(updates, "pane=")).not.toContain("pane=dashboard");
    expect(screen.queryByTestId("deck")).toBeNull();
    expect(screen.getByTestId("map-buttons")).toBeInTheDocument();
  });
  it("the pane survives a reload: `?pane=dashboard` opens on the deck, and a wide window ignores it and offers no switch", async () => {
    stubNarrowViewport();
    const { unmount } = mount("?pane=dashboard");
    await loaded();
    expect(screen.getByTestId("deck")).toHaveAttribute("data-full", "1");
    expect(screen.getByTestId("pane-dashboard")).toHaveAttribute("aria-pressed", "true");
    unmount();
    // the same link on a wide window: both panes, no switch, and the deck in its 420 px column
    stubWideViewport();
    mount("?pane=dashboard");
    await loaded();
    expect(screen.queryByTestId("pane-switch")).toBeNull();
    expect(screen.getByTestId("deck")).toHaveAttribute("data-full", "0");
    expect(screen.getByTestId("map-buttons")).toBeInTheDocument();
    expect(screen.getByTestId("legend-capsule")).toBeInTheDocument();
  });
});

describe("the workspace's audits", () => {
  it("a pollutant as the metric: the filter select carries the beta group, the deck answers in kilotonnes, the chip names it", async () => {
    stubWideViewport();
    mount("?pol=NH3");
    await screen.findByTestId("deck");
    expect(screen.getByTestId("gas-select")).toHaveValue("pol:NH3");
    expect(await screen.findByTestId("air-display")).toHaveTextContent("2784.71");
    expect(screen.getByTestId("chip-gas")).toHaveTextContent("NH₃ (air beta)");
    expect(screen.getByTestId("active-view")).toHaveTextContent("NH₃ (air beta, kt)");
    expect(screen.getByTestId("card-air-sources")).toHaveTextContent("Agriculture is the largest estimated source");
    expect(screen.getByTestId("card-air-trend")).toHaveTextContent("the agriculture layer alone");
    // the layers are single-year: the slider stands down with the reason, and the year chip
    // names the layer's own year instead of relabeling it with a slider year
    expect(screen.getByTestId("air-year-note")).toHaveTextContent("Single-year layer (calendar 2024; power and aviation on the 2023–24 fiscal year)");
    expect(screen.queryByTestId("year-slider")).toBeNull();
    expect(screen.getByTestId("chip-period")).toHaveTextContent("2024 layer");
    // clearing through the chip returns to CO₂e
    fireEvent.click(screen.getByTestId("chip-gas-clear"));
    await waitFor(() => expect(screen.getByTestId("gas-select")).toHaveValue(""));
    expect(screen.getByTestId("year-slider")).toBeInTheDocument();
  });
  it("every decimal is a server string (ticks included); no FY; no raw id; no avoid-list phrase; and the chrome never names the dataset", async () => {
    mount();
    await loaded();
    const allowed = serverDecimals();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const tokens: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) tokens.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
    expect(tokens.length).toBeGreaterThan(20);
    for (const t of tokens) expect(allowed.has(t), t).toBe(true);
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("FY");
    expect(text).not.toMatch(/(^|[^A-Z0-9(])AR5(?![)\w])/);
    expect(text).not.toContain("(NE)");
    expect(text).not.toContain("LULUCF");
    // the land-use exclusion left the exploring surfaces on 2026-08-31: it documents the dataset
    // on /methods and in the citation, and it no longer follows every figure around the workspace
    expect(text).not.toContain("land use");
    expect(text).not.toContain("land-use");
    for (const el of Array.from(document.body.querySelectorAll("[title]"))) expect(el.getAttribute("title") ?? "").not.toContain("land use");
    expect(text).not.toContain("1.0.0rc");
    expect(text).not.toContain("REF_2023_24");
    expect(text).not.toContain("Mt CO2e");
    expect(avoidPhrasesIn(text)).toEqual([]);
    expect(namesDataset(text)).toBe(false);
    for (const el of Array.from(document.body.querySelectorAll("[title]"))) {
      expect(el.getAttribute("title") ?? "").not.toContain("FY");
      expect(el.getAttribute("title") ?? "").not.toContain("1.0.0rc");
    }
    // the footer is one line: the release's own licence identifiers
    expect(screen.getByTestId("footer-licences")).toHaveTextContent("Data/text CC-BY-4.0 · code MIT · OSM data ODbL");
    expect(screen.getByTestId("footer").textContent?.trim()).toBe("Data/text CC-BY-4.0 · code MIT · OSM data ODbL");
    expect(screen.queryByTestId("footer-repository")).toBeNull();
  });
});
