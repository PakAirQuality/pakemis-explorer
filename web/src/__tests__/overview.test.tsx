import "@testing-library/jest-dom/vitest";
/**
 * The Overview briefing against mocked envelopes that carry the server's presentation fields
 * (`display_short`, `share_pct_short`, `share_phrase`, `rank`, `axis.ticks_short`, `change`,
 * `derived`): the opening statement assembled from them, each widget's sentence, the axis
 * ticks passed to the charts equal to the envelopes' ticks, the province dropdown re-scoping
 * the statement (a `module` breakdown, the series refused by name), the floating deck over the
 * full-bleed map (the map pane absolute under the frame, the 520 px column without a
 * background, the map toggle top-right, one logo in the nav and one in the footer card), the
 * place header card (eyebrow, title, the four actions, Reset view clearing the scope), the deck
 * pills (Sections (4), collapse-all flipping every switch), each widget's switch collapsing its
 * body, the absence of the tab strip and of the interval / completeness / evidence widgets, and
 * the four audits: every decimal on the page is a server string (ticks included), no "FY", no
 * raw id (bare AR5, "(NE)", "LULUCF", a version), no avoid-list phrase.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import Page from "@/app/page";
import { RELEASE, envelope, mockFetch, refusal } from "./fixtures";
import { avoidPhrasesIn } from "./vocabulary";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/map/ExplorerMap", () => ({
  ExplorerMap: ({ override }: { override?: { level?: string; sector?: string | null } }) => <div data-testid="map-stub" data-level={override?.level ?? ""} data-sector={override?.sector ?? ""} />,
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
  { display: "37.914", display_short: "37.91", ...U, group: { sector_id: "waste" }, extra: { share_pct_short: "8.4", share_phrase: "a small share", rank: 4 } },
];
const PUNJAB_SECTORS = [
  { display: "123.301", display_short: "123.30", ...U, group: { module: "agriculture" }, extra: { share_pct_short: "53.9", share_phrase: "nearly half", rank: 1 } },
  { display: "27.488", display_short: "27.49", ...U, group: { module: "transport" }, extra: { share_pct_short: "12.0", share_phrase: "about a tenth", rank: 2 } },
];
const GASES = [
  { display: "248.748", display_short: "248.75", ...U, group: { gas: "CH4" }, extra: { share_pct_short: "55.0", share_phrase: "over half", rank: 1 } },
  { display: "161.456", display_short: "161.46", ...U, group: { gas: "CO2" }, extra: { share_pct_short: "35.7", share_phrase: "about a third", rank: 2 } },
  { display: "42.143", display_short: "42.14", ...U, group: { gas: "N2O" }, extra: { share_pct_short: "9.3", share_phrase: "a small share", rank: 3 } },
];
const PROVINCES = [
  { display: "228.7168", display_short: "228.72", ...U, group: { province: "Punjab" }, extra: { share_pct_short: "50.6", share_phrase: "nearly half", rank: 1 } },
  { display: "134.7255", display_short: "134.73", ...U, group: { province: "Sindh" }, extra: { share_pct_short: "29.8", share_phrase: "about a quarter", rank: 2 } },
  { display: "1.9972", display_short: "2.00", ...U, group: { province: "Other" }, extra: { share_pct_short: "0.4", share_phrase: "a marginal share", rank: 3 } },
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
  vi.stubGlobal(
    "fetch",
    mockFetch((url, body) => {
      fetchSpy(url, body);
      if (url.endsWith("/release")) return RELEASE;
      if (url.endsWith("/openapi.json")) return { paths: { "/api/v1/emissions/release": {} }, components: { schemas: { QueryEmissions: { properties: { gwp_basis: { description: "AR5 | AR6" }, spatial_view: { description: "all | physical | origin | accounting" } } }, GridCellRequest: { properties: { gas: { default: "CO2" }, month: { description: 'YYYYMM or "annual"' } } } } } };
      if (url.includes("/timeseries")) {
        const q = (body as { query?: { geography_ids?: string[] } } | undefined)?.query;
        if (q?.geography_ids?.length) return SERIES_REFUSAL;
        return envelope(SERIES, { request_type: "get_timeseries", axis: SERIES_AXIS, change: CHANGE });
      }
      if (body?.group_by?.includes("sector_id")) return envelope(SECTORS, { axis: AXIS_250, partition: { n: 4 } });
      if (body?.group_by?.includes("module")) return envelope(PUNJAB_SECTORS, { axis: { ticks_short: ["0", "25", "50", "75", "100", "125"], unit_short: "Mt CO₂e" }, partition: { n: 2 } });
      if (body?.group_by?.includes("gas")) return envelope(GASES, { axis: AXIS_250, partition: { n: 3 } });
      if (body?.group_by?.includes("province")) return envelope(PROVINCES, { axis: AXIS_250, partition: { n: 3 }, derived: DERIVED_PK });
      if (body?.geography_ids?.includes("Punjab")) return envelope(PUNJAB, { derived: DERIVED_PB });
      return envelope(NATIONAL);
    }),
  );
});

function mount(search = "") {
  const Wrapper = withNuqsTestingAdapter({ searchParams: search, hasMemory: true });
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

/** Every decimal token the mocked server sent: displays, shorts, shares, quantiles, ticks, the change strings and the derived strings. */
function serverDecimals(): Set<string> {
  const out = new Set<string>();
  const add = (s: string) => (s.match(/\d+\.\d+/g) ?? []).forEach((t) => out.add(t));
  for (const c of [...SECTORS, ...PUNJAB_SECTORS, ...GASES, ...PROVINCES, ...SERIES, ...NATIONAL, ...PUNJAB]) add(JSON.stringify(c));
  for (const o of [AXIS_250, SERIES_AXIS, CHANGE, DERIVED_PK, DERIVED_PB, RELEASE]) add(JSON.stringify(o));
  return out;
}

async function loaded() {
  await screen.findByTestId("opening-statement");
  await screen.findByTestId("sector-widget-sentence");
  await screen.findByTestId("trend-widget-sentence");
  await screen.findByTestId("gas-widget-sentence");
  await screen.findByTestId("places-widget-sentence");
}

describe("Overview briefing", () => {
  it("opens with the statement assembled from display_short, share_pct_short and share_phrase, the independence line, the eyebrow and no total card, slogan or Ask box", async () => {
    mount();
    expect(await screen.findByTestId("opening-statement")).toHaveTextContent("In 2023–24, Pakistan emitted an estimated 452.35 Mt CO₂e. Agriculture accounted for 223.45 Mt — 49.4 %, nearly half — of the reconstructed inventory, which excludes land use and forestry.");
    expect(screen.getByTestId("independent-line")).toHaveTextContent("This is an independent public-data reconstruction, not an official inventory; every figure carries its method, evidence grade and source.");
    expect(screen.getByTestId("eyebrow")).toHaveTextContent("Pakistan's explainable emissions inventory");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pakistan");
    expect(screen.queryByTestId("total-card")).toBeNull();
    expect(screen.queryByTestId("question-input")).toBeNull();
    expect(screen.getByTestId("nav-ask").tagName).toBe("BUTTON"); // toggles the AskDrawer on the bus
    expect(screen.getByTestId("header-download")).toHaveAttribute("href", "/downloads");
    // the national total was asked without a geography; the interval, completeness and evidence envelopes are not asked at all (their widgets left the page)
    const totals = fetchSpy.mock.calls.filter(([u, b]) => String(u).includes("/query/emissions") && !b?.group_by);
    expect(totals.length).toBeGreaterThan(0);
    for (const [, b] of totals) expect(b?.geography_ids).toBeUndefined();
    expect(fetchSpy.mock.calls.filter(([u]) => /\/query\/uncertainty|\/query\/completeness|\/evidence\//.test(String(u)))).toEqual([]);
  });
  it("the floating deck: the map pane absolute under the frame, the 520 px column inset 20 px with no background and a thin scrollbar letting pointer events through, each card taking them back; one logo in the nav and one in the footer card", async () => {
    mount();
    await loaded();
    expect(screen.getByTestId("app-frame").className).toContain("lg:h-[calc(100dvh-56px)]");
    expect(screen.getByTestId("app-frame").className).toContain("relative");
    const pane = screen.getByTestId("map-pane");
    expect(pane.className).toContain("lg:absolute lg:inset-0");
    expect(pane.className).toContain("h-[60vh]"); // the column layout under 1024 px
    expect(pane).toContainElement(screen.getByTestId("briefing-map"));
    expect(screen.getByTestId("briefing-map").className).toContain("absolute inset-0");
    const deck = screen.getByTestId("dashboard-deck");
    for (const c of ["lg:absolute", "lg:left-5", "lg:top-5", "lg:bottom-5", "lg:w-[520px]", "lg:overflow-y-auto", "lg:overscroll-contain", "scrollbar-thin", "flex flex-col gap-3", "lg:pr-2", "lg:pointer-events-none"]) expect(deck.className, c).toContain(c);
    expect(deck.className).not.toMatch(/(^|\s)(lg:)?bg-/); // the map shows between the cards
    expect(screen.queryByTestId("dashboard-panel")).toBeNull();
    expect(screen.getByTestId("overview").querySelector(".max-w-\\[1500px\\]")).toBeNull();
    // the cards in order, each a separate rounded white card catching pointer events
    const cards = Array.from(deck.children).map((el) => el.getAttribute("data-testid"));
    expect(cards).toEqual(["header-block", "deck-controls", "opening", "sector-widget", "trend-widget", "gas-widget", "places-widget", "footer"]);
    for (const id of ["opening", "sector-widget", "trend-widget", "gas-widget", "places-widget"]) {
      const el = screen.getByTestId(id);
      expect(el.className, id).toContain("rounded-2xl bg-white");
      expect(el.className, id).toContain("shadow-md");
      expect(el.className, id).toContain("pointer-events-auto");
      expect(el.className, id).toContain("shrink-0"); // a fixed-height flex column shrinks a card with min-height 0 to nothing
      expect(el.className, id).not.toContain("card");
    }
    for (const id of ["header-block", "deck-controls", "footer"]) expect(screen.getByTestId(id).className, id).toContain("shrink-0");
    expect(screen.getByTestId("footer").className).toContain("rounded-2xl bg-white/90");
    expect(screen.getByTestId("footer").className).toContain("pointer-events-auto");
    expect(screen.getByTestId("footer")).toHaveTextContent("A Pakistan Air Quality Initiative product");
    // the map's chrome: the level toggle at the top-right, left of the frame button; nothing at the top-left
    const box = screen.getByTestId("map-level-box");
    expect(box.className).toContain("right-14 top-3");
    expect(box.className).not.toContain("left-");
    expect(box).toContainElement(screen.getByTestId("map-level-adm1"));
    // the logo: the nav and the footer card, not the header card
    const logos = screen.getAllByTestId("brand-logo");
    expect(logos).toHaveLength(2);
    expect(screen.getByTestId("header-block").querySelector("img")).toBeNull();
    expect(screen.getByTestId("top-nav")).toContainElement(logos[0]);
    expect(screen.getByTestId("footer")).toContainElement(logos[1]);
    expect(logos[1].className).toContain("h-6");
  });
  it("the place header card: accent blue with the wave, the eyebrow, the title, four labelled icon actions; Reset view clears a chosen province", async () => {
    mount("?geo=Punjab");
    await screen.findByTestId("opening-statement");
    const head = screen.getByTestId("header-block");
    for (const c of ["rounded-3xl", "bg-accent", "text-white", "shadow-lg", "overflow-hidden"]) expect(head.className, c).toContain(c);
    expect(head.querySelector("svg[data-testid=header-wave] path")).not.toBeNull();
    expect(head.querySelector("img")).toBeNull();
    expect(screen.getByTestId("eyebrow")).toHaveTextContent("Pakistan's explainable emissions inventory");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Punjab");
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-4xl");
    const actions = Array.from(screen.getByTestId("header-toolbar").children);
    expect(actions.map((a) => a.textContent)).toEqual(["Reset view", "Choose a province", "Share", "Download"]);
    for (const a of actions) expect(a.querySelector("svg"), a.textContent ?? "").not.toBeNull();
    expect(screen.getByTestId("header-download")).toHaveAttribute("href", "/downloads");
    // the province select is a white pill inside the card; Choose a province focuses it
    const select = screen.getByTestId("province-select");
    expect(head).toContainElement(select);
    expect(select.className).toContain("rounded-full bg-white");
    expect(select).toHaveValue("Punjab");
    fireEvent.click(screen.getByTestId("header-choose"));
    expect(document.activeElement).toBe(select);
    // Reset view clears the scope: Pakistan again, the national total asked
    fireEvent.click(screen.getByTestId("header-reset"));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pakistan"));
    expect(screen.getByTestId("overview")).toHaveAttribute("data-scope", "PK");
    expect(select).toHaveValue("");
  });
  it("the deck pills: Sections (4) counts the widget cards; collapse-all flips every switch and its own label; each widget's switch collapses its body to the header row", async () => {
    mount();
    await loaded();
    expect(screen.getByTestId("deck-sections")).toHaveTextContent("Sections (4)");
    expect(screen.getByTestId("deck-sections").className).toContain("rounded-full bg-white");
    expect(screen.getByTestId("deck-sections").className).toContain("text-accent");
    const all = screen.getByTestId("deck-collapse-all");
    expect(all).toHaveTextContent("Collapse all sections");
    const ids = ["sector-widget", "trend-widget", "gas-widget", "places-widget"];
    const switches = ids.map((id) => screen.getByTestId(`${id}-switch`));
    for (const sw of switches) {
      expect(sw).toHaveAttribute("role", "switch");
      expect(sw).toHaveAttribute("aria-checked", "true");
      expect(sw.className).toContain("bg-accent");
    }
    expect(screen.getAllByRole("switch")).toHaveLength(4);
    // one card: the switch hides the sentence, figure and caption; the header row (title, toolbar) stays
    fireEvent.click(switches[0]);
    expect(switches[0]).toHaveAttribute("aria-checked", "false");
    expect(switches[0].className).not.toContain("bg-accent");
    expect(screen.queryByTestId("sector-widget-sentence")).toBeNull();
    expect(screen.queryByTestId("sector-widget-caption")).toBeNull();
    expect(screen.queryByTestId("bars-with-axis")).toBeNull();
    expect(screen.getByTestId("sector-widget")).toHaveTextContent("Emissions by sector in Pakistan");
    expect(screen.getByTestId("sector-widget-info")).toBeInTheDocument();
    expect(screen.getByTestId("sector-widget")).toHaveAttribute("data-open", "0");
    expect(screen.getByTestId("trend-widget-sentence")).toBeInTheDocument();
    expect(all).toHaveTextContent("Collapse all sections"); // three still open
    fireEvent.click(switches[0]);
    expect(await screen.findByTestId("sector-widget-sentence")).toBeInTheDocument();
    // collapse all: every switch off, every body gone, the label flips; expand all brings them back
    fireEvent.click(all);
    for (const sw of switches) expect(sw).toHaveAttribute("aria-checked", "false");
    for (const id of ids) expect(screen.queryByTestId(`${id}-sentence`), id).toBeNull();
    expect(screen.queryByTestId("column-chart")).toBeNull();
    expect(screen.queryByTestId("stacked-bar")).toBeNull();
    expect(all).toHaveTextContent("Expand all sections");
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("opening-statement")).toBeInTheDocument(); // the statement is not a section
    fireEvent.click(all);
    for (const sw of switches) expect(sw).toHaveAttribute("aria-checked", "true");
    for (const id of ids) expect(await screen.findByTestId(`${id}-sentence`)).toBeInTheDocument();
    expect(all).toHaveTextContent("Collapse all sections");
    // the tab strip is gone; the section ids stay for the scroll spy
    expect(screen.queryByTestId("tab-strip")).toBeNull();
    for (const id of ["summary", "sectors", "trend", "gases", "places"]) expect(document.getElementById(id), id).not.toBeNull();
    expect(document.body.textContent).not.toContain("Summary");
  });
  it("the interval, completeness and evidence widgets and the routes strip are gone", async () => {
    mount();
    await loaded();
    for (const id of ["uncertainty-widget", "completeness-widget", "evidence-widget", "routes", "route-card", "ne-list", "interval-bar", "evidence-rows"]) expect(screen.queryByTestId(id), id).toBeNull();
    const text = document.body.textContent ?? "";
    for (const phrase of ["How certain is the estimate", "What is not estimated", "Evidence behind the numbers", "Explore tests", "Map locates", "Methods proves", "Downloads releases", "Not estimated is not zero"]) expect(text, phrase).not.toContain(phrase);
    expect(screen.getByTestId("footer")).toHaveTextContent("A Pakistan Air Quality Initiative product");
  });
  it("each widget's sentence is built from the envelope's server strings, period first", async () => {
    mount();
    await loaded();
    expect(screen.getByTestId("sector-widget-sentence")).toHaveTextContent("In 2023–24, agriculture was the largest source at 223.45 Mt (49.4 %), followed by power (63.37 Mt, 14.0 %) and transport (41.93 Mt, 9.3 %).");
    expect(screen.getByTestId("sector-widget-caption")).toHaveTextContent("Reference estimate · IPCC 2013 (AR5) warming potentials · land use excluded");
    expect(screen.getByTestId("trend-widget-sentence")).toHaveTextContent("From 2020–21 to 2023–24, Pakistan's emissions rose from 372.40 Mt to 452.35 Mt CO₂e, a change of +79.95 Mt (+21.5 %).");
    expect(screen.getByTestId("trend-widget-caption")).toHaveTextContent("Annual totals · years run July–June");
    expect(screen.getByTestId("gas-widget-sentence")).toHaveTextContent("Methane made up 248.75 Mt (55.0 %) of Pakistan's CO₂-equivalent total; carbon dioxide 161.46 Mt (35.7 %) and nitrous oxide 42.14 Mt (9.3 %).");
    expect(screen.getByTestId("places-widget-sentence")).toHaveTextContent("Punjab carried 228.72 Mt of the allocated total; 9.01 Mt was retained at provincial level and placed no finer.");
    expect(screen.getByTestId("places-link")).toHaveAttribute("href", "/map");
    // the stacked gas bar prints the server's strings
    const bar = screen.getByTestId("stacked-bar");
    expect(bar).toHaveTextContent("CH₄");
    expect(bar).toHaveTextContent("248.75");
    expect(bar).toHaveTextContent("55.0 %");
    // every widget carries its toolbar (Result details, download, share) on its envelope
    for (const id of ["sector-widget", "trend-widget", "gas-widget", "places-widget"]) {
      expect(screen.getByTestId(`${id}-info`)).toBeInTheDocument();
      expect(screen.getByTestId(`${id}-download`)).toBeInTheDocument();
      expect(screen.getByTestId(`${id}-share`)).toBeInTheDocument();
    }
  });
  it("the charts' axis labels are the envelopes' axis.ticks_short and nothing else", async () => {
    mount();
    await loaded();
    expect(screen.getByTestId("bars-with-axis")).toHaveAttribute("data-ticks", AXIS_250.ticks_short.join("|"));
    expect(within(screen.getByTestId("bars-with-axis")).getAllByTestId("axis-tick").map((t) => t.textContent)).toEqual(AXIS_250.ticks_short);
    expect(screen.getByTestId("column-chart")).toHaveAttribute("data-ticks", SERIES_AXIS.ticks_short.join("|"));
    expect(within(screen.getByTestId("column-chart")).getAllByTestId("column").map((c) => c.textContent)).toEqual(["2020–21 372.40", "2023–24 452.35"]);
    expect(screen.getByTestId("places-bars")).toHaveAttribute("data-ticks", AXIS_250.ticks_short.join("|"));
    expect(within(screen.getByTestId("bars-with-axis")).getAllByTestId("bar-item").map((b) => b.textContent)).toEqual(["Agriculture 223.45 · 49.4 %", "Power 63.37 · 14.0 %", "transport 41.93 · 9.3 %", "waste 37.91 · 8.4 %"]);
  });
  it("selecting a sector bar filters the Explore link and the map stub follows the hovered sector only on the Sectors widget", async () => {
    mount();
    await loaded();
    const bars = within(screen.getByTestId("bars-with-axis")).getAllByTestId("bar-item");
    expect(screen.getByTestId("sectors-link")).toHaveAttribute("href", "/explore");
    fireEvent.click(bars[1]);
    expect(screen.getByTestId("sectors-link")).toHaveAttribute("href", "/explore?sector=power");
    fireEvent.click(bars[1]);
    expect(screen.getByTestId("sectors-link")).toHaveAttribute("href", "/explore");
    // without an IntersectionObserver (jsdom) the active widget stays Summary, so the map is unfiltered
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-sector", "");
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-level", "adm1");
    fireEvent.click(screen.getByTestId("map-level-adm2"));
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-level", "adm2");
    // Reset view returns the map to provinces and clears the picked sector
    fireEvent.click(bars[1]);
    expect(screen.getByTestId("sectors-link")).toHaveAttribute("href", "/explore?sector=power");
    fireEvent.click(screen.getByTestId("header-reset"));
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-level", "adm1");
    expect(screen.getByTestId("sectors-link")).toHaveAttribute("href", "/explore");
  });
  it("the province dropdown re-scopes the statement (allocated emissions, a module breakdown) and names the series refusal", async () => {
    mount();
    await loaded();
    fireEvent.change(screen.getByTestId("province-select"), { target: { value: "Punjab" } });
    await waitFor(() => expect(screen.getByTestId("opening-statement")).toHaveTextContent("In 2023–24, Punjab's allocated emissions were 228.72 Mt CO₂e. Agriculture accounted for 123.30 Mt — 53.9 %, nearly half — of the province's allocated total."));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Punjab");
    expect(screen.getByTestId("overview")).toHaveAttribute("data-scope", "Punjab");
    await waitFor(() => expect(screen.getByTestId("sector-widget-sentence")).toHaveTextContent("In 2023–24, agriculture was the largest source at 123.30 Mt (53.9 %), followed by transport (27.49 Mt, 12.0 %)."));
    expect(screen.getByTestId("sector-widget")).toHaveTextContent("Emissions by sector in Punjab");
    const scoped = fetchSpy.mock.calls.find(([, b]) => b?.group_by?.includes("module"));
    expect(scoped?.[1]).toMatchObject({ geography_level: "adm1", geography_ids: ["Punjab"], group_by: ["module"] });
    expect(fetchSpy.mock.calls.some(([, b]) => b?.group_by?.includes("sector_id") && b?.geography_ids)).toBe(false);
    const trend = await within(screen.getByTestId("trend-widget")).findByTestId("refusal-card");
    expect(trend).toHaveTextContent("Refused: GrainUnavailable");
    expect(trend).toHaveTextContent("spatial products exist for the reference year only");
    await waitFor(() => expect(screen.getByTestId("places-widget-sentence")).toHaveTextContent("Punjab carried 228.72 Mt of the allocated total; 4.84 Mt was retained at provincial level and placed no finer."));
    expect(screen.getByTestId("places-link")).toHaveAttribute("href", "/map?geo=Punjab");
    fireEvent.change(screen.getByTestId("province-select"), { target: { value: "" } });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pakistan"));
  });
  it("audits: every decimal is a server string (ticks included); no FY; no raw id; no avoid-list phrase; the footer names the licences and no version", async () => {
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
    expect(text).not.toContain("1.0.0rc");
    expect(text).not.toContain("REF_2023_24");
    expect(text).not.toContain("Mt CO2e");
    expect(avoidPhrasesIn(text)).toEqual([]);
    for (const el of Array.from(document.body.querySelectorAll("[title]"))) {
      expect(el.getAttribute("title") ?? "").not.toContain("FY");
      expect(el.getAttribute("title") ?? "").not.toContain("1.0.0rc");
    }
    expect(screen.getByTestId("footer")).toHaveTextContent("Data and text CC-BY-4.0 · code MIT · OSM-derived tables ODbL");
    expect(screen.getByTestId("footer-repository")).toHaveAttribute("href", "https://github.com/example/pakemis");
  });
});
