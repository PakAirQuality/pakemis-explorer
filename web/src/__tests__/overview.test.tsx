import "@testing-library/jest-dom/vitest";
/**
 * The Overview briefing against mocked envelopes that carry the server's presentation fields
 * (`display_short`, `share_pct_short`, `share_phrase`, `rank`, `axis.ticks_short`, `change`,
 * `derived`, `interval_short`, `quantiles_short`): the opening statement assembled from them,
 * each widget's sentence, the axis ticks passed to the charts equal to the envelopes' ticks,
 * the province dropdown re-scoping the statement (a `module` breakdown, the series refused
 * by name), the anchors, and the four audits: every decimal on the page is a server string
 * (ticks and quantiles included), no "FY", no raw id (bare AR5, "(NE)", "LULUCF", a version),
 * no avoid-list phrase.
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
const UNCERTAINTY = [
  { display: "456.940", display_short: "456.94", ...U, value: 456.94, extra: { kind: "parametric_reference", scenario: "within_sector", scenario_label: "factors shared within a module", quantiles_short: { "P2.5": "407.42", "P97.5": "533.41" }, interval_short: "407.42–533.41" } },
  { display: "456.910", display_short: "456.91", ...U, value: 456.91, extra: { kind: "parametric_reference", scenario: "cross_sector", scenario_label: "factors shared across modules", quantiles_short: { "P2.5": "407.28", "P97.5": "533.73" }, interval_short: "407.28–533.73" } },
];
const UNC_AXIS = { ticks_short: ["0", "200", "400", "600"], unit_short: "Mt CO₂e" };
const COMPLETENESS = [
  { display: "NE", unit: "notation_key", value: undefined, extra: { code: "3.D", category: "Agricultural soils - N from SOC mineralisation", gas: "N2O", notation_key: "NE", justification: "no series" } },
  { display: "NE", unit: "notation_key", value: undefined, extra: { code: "2.A.2", category: "Lime production", gas: "CO2", notation_key: "NE", justification: "no series" } },
  { display: "NE", unit: "notation_key", value: undefined, extra: { code: "(air)", category: "Air pollutants - road transport cold-start excess", gas: "CO", notation_key: "NE", justification: "no series" } },
  { display: "E", unit: "notation_key", value: undefined, extra: { code: "3.A", category: "Enteric fermentation", gas: "CH4", notation_key: "E", justification: "" } },
  { display: "E", unit: "notation_key", value: undefined, extra: { code: "1.A.1", category: "Power", gas: "CO2", notation_key: "E", justification: "" } },
];
const EVIDENCE = [
  { display: "E2 / T4 / S3", unit: "evidence", value: undefined, extra: { source_stream_id: "agriculture|enteric-fermentation|buffalo|ch4", module: "agriculture", evidence_class: "E2", temporal_class: "T4", spatial_class_measured: "S3" } },
  { display: "E3 / T3 / S3", unit: "evidence", value: undefined, extra: { source_stream_id: "agriculture|rice|ch4", module: "agriculture", evidence_class: "E3", temporal_class: "T3", spatial_class_measured: "S3" } },
  { display: "E1 / T2 / S1", unit: "evidence", value: undefined, extra: { source_stream_id: "power|grid|coal|co2", module: "power", evidence_class: "E1", temporal_class: "T2", spatial_class_measured: "S1" } },
];
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
      if (url.includes("/query/uncertainty")) return envelope(UNCERTAINTY, { request_type: "get_uncertainty", axis: UNC_AXIS });
      if (url.includes("/query/completeness")) return envelope(COMPLETENESS, { request_type: "get_completeness" });
      if (url.includes("/evidence/")) return envelope(EVIDENCE, { request_type: "get_evidence" });
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
  for (const c of [...SECTORS, ...PUNJAB_SECTORS, ...GASES, ...PROVINCES, ...SERIES, ...UNCERTAINTY, ...COMPLETENESS, ...EVIDENCE, ...NATIONAL, ...PUNJAB]) add(JSON.stringify(c));
  for (const o of [AXIS_250, SERIES_AXIS, UNC_AXIS, CHANGE, DERIVED_PK, DERIVED_PB, RELEASE]) add(JSON.stringify(o));
  return out;
}

async function loaded() {
  await screen.findByTestId("opening-statement");
  await screen.findByTestId("sector-widget-sentence");
  await screen.findByTestId("trend-widget-sentence");
  await screen.findByTestId("uncertainty-widget-sentence");
  await screen.findByTestId("gas-widget-sentence");
  await screen.findByTestId("places-widget-sentence");
  await screen.findByTestId("completeness-widget-sentence");
  await screen.findByTestId("evidence-widget-sentence");
}

describe("Overview briefing", () => {
  it("opens with the statement assembled from display_short, share_pct_short and share_phrase, the independence line, the eyebrow and no total card, slogan or Ask box", async () => {
    mount();
    expect(await screen.findByTestId("opening-statement")).toHaveTextContent("In 2023–24, Pakistan emitted an estimated 452.35 Mt CO₂e. Agriculture accounted for 223.45 Mt — 49.4 %, nearly half — of the reconstructed inventory, which excludes land use and forestry.");
    expect(screen.getByTestId("independent-line")).toHaveTextContent("PakEmis is an independent public-data reconstruction, not an official inventory; every figure carries its method, evidence grade and source.");
    expect(screen.getByTestId("eyebrow")).toHaveTextContent("Pakistan's explainable emissions inventory");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pakistan");
    expect(screen.queryByTestId("total-card")).toBeNull();
    expect(screen.queryByTestId("question-input")).toBeNull();
    expect(screen.getByTestId("nav-ask").tagName).toBe("BUTTON"); // toggles the AskDrawer on the bus
    expect(screen.getByTestId("header-download")).toHaveAttribute("href", "/downloads");
    // the national total was asked without a geography; the national interval with scope national only
    const totals = fetchSpy.mock.calls.filter(([u, b]) => String(u).includes("/query/emissions") && !b?.group_by);
    expect(totals.length).toBeGreaterThan(0);
    for (const [, b] of totals) expect(b?.geography_ids).toBeUndefined();
    for (const [, b] of fetchSpy.mock.calls.filter(([u]) => String(u).includes("/query/uncertainty"))) expect(b).toEqual({ scope: "national" });
  });
  it("each widget's sentence is built from the envelope's server strings, period first", async () => {
    mount();
    await loaded();
    expect(screen.getByTestId("sector-widget-sentence")).toHaveTextContent("In 2023–24, agriculture was the largest source at 223.45 Mt (49.4 %), followed by power (63.37 Mt, 14.0 %) and transport (41.93 Mt, 9.3 %).");
    expect(screen.getByTestId("sector-widget-caption")).toHaveTextContent("Reference estimate · IPCC 2013 (AR5) warming potentials · land use excluded");
    expect(screen.getByTestId("trend-widget-sentence")).toHaveTextContent("From 2020–21 to 2023–24, Pakistan's emissions rose from 372.40 Mt to 452.35 Mt CO₂e, a change of +79.95 Mt (+21.5 %).");
    expect(screen.getByTestId("trend-widget-caption")).toHaveTextContent("Annual totals · years run July–June");
    expect(screen.getByTestId("uncertainty-widget-sentence")).toHaveTextContent("The 95 % interval spans 407.28–533.73 Mt CO₂e when emission factors are shared across modules; the Monte-Carlo median is 456.91 Mt.");
    expect(screen.getByTestId("uncertainty-widget-caption")).toHaveTextContent("factors shared across modules · factors shared within a module. The reference estimate is marked; the interval bounds the national total.");
    expect(screen.getByTestId("gas-widget-sentence")).toHaveTextContent("Methane made up 248.75 Mt (55.0 %) of Pakistan's CO₂-equivalent total; carbon dioxide 161.46 Mt (35.7 %) and nitrous oxide 42.14 Mt (9.3 %).");
    expect(screen.getByTestId("places-widget-sentence")).toHaveTextContent("Punjab carried 228.72 Mt of the allocated total; 9.01 Mt was retained at provincial level and placed no finer.");
    expect(screen.getByTestId("places-link")).toHaveAttribute("href", "/map");
    expect(screen.getByTestId("completeness-widget-sentence")).toHaveTextContent("3 of 5 category–gas combinations are not estimated; a blank is not a zero.");
    expect(screen.getByTestId("completeness-widget-note")).toHaveTextContent("Not estimated is not zero.");
    expect(within(screen.getByTestId("ne-list")).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["3.DAgricultural soils - N from SOC mineralisationN2O", "2.A.2Lime productionCO2", "(air)Air pollutants - road transport cold-start excessCO"]);
    expect(screen.queryByTestId("ne-more")).toBeNull();
    expect(screen.getByTestId("evidence-widget-sentence")).toHaveTextContent("The inventory rests on 3 source streams, each graded on annual activity, monthly timing and spatial placement.");
    const classes = screen.getAllByTestId("evidence-class").map((el) => `${el.getAttribute("data-class")}:${el.getAttribute("data-count")}`);
    expect(classes).toEqual(["E1:1", "E2:1", "E3:1", "T2:1", "T3:1", "T4:1", "S1:1", "S3:2"]);
    expect(screen.getAllByTestId("evidence-class")[0]).toHaveAttribute("title", "E1 — measured or metered quantity for this source and period");
    // the stacked gas bar and the interval figure print the server's strings
    const bar = screen.getByTestId("stacked-bar");
    expect(bar).toHaveTextContent("CH₄");
    expect(bar).toHaveTextContent("248.75");
    expect(bar).toHaveTextContent("55.0 %");
    const rows = screen.getAllByTestId("interval-row");
    expect(rows.map((r) => r.getAttribute("data-scenario"))).toEqual(["cross_sector", "within_sector"]);
    expect(within(rows[0]).getByTestId("interval-low")).toHaveTextContent("407.28");
    expect(within(rows[0]).getByTestId("interval-high")).toHaveTextContent("533.73");
    expect(within(rows[0]).getByTestId("interval-median")).toHaveTextContent("456.91");
    expect(screen.getByTestId("interval-marker")).toHaveTextContent("reference estimate 452.35");
    // every widget carries its toolbar (Result details, download, share) on its envelope
    for (const id of ["sector-widget", "trend-widget", "uncertainty-widget", "gas-widget", "places-widget", "completeness-widget", "evidence-widget"]) {
      expect(screen.getByTestId(`${id}-info`)).toBeInTheDocument();
      expect(screen.getByTestId(`${id}-download`)).toBeInTheDocument();
      expect(screen.getByTestId(`${id}-share`)).toBeInTheDocument();
    }
    // the routes strip names each surface with its job
    expect(screen.getAllByTestId("route-card").map((a) => `${a.getAttribute("href")} ${a.querySelector("div > div")?.textContent}`)).toEqual(["/explore Explore tests", "/map Map locates", "/methods Methods proves", "/downloads Downloads releases"]);
  });
  it("the charts' axis labels are the envelopes' axis.ticks_short and nothing else", async () => {
    mount();
    await loaded();
    expect(screen.getByTestId("bars-with-axis")).toHaveAttribute("data-ticks", AXIS_250.ticks_short.join("|"));
    expect(within(screen.getByTestId("bars-with-axis")).getAllByTestId("axis-tick").map((t) => t.textContent)).toEqual(AXIS_250.ticks_short);
    expect(screen.getByTestId("column-chart")).toHaveAttribute("data-ticks", SERIES_AXIS.ticks_short.join("|"));
    expect(within(screen.getByTestId("column-chart")).getAllByTestId("column").map((c) => c.textContent)).toEqual(["2020–21 372.40", "2023–24 452.35"]);
    expect(within(screen.getByTestId("interval-bar")).getAllByTestId("axis-tick").map((t) => t.textContent)).toEqual(UNC_AXIS.ticks_short);
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
  });
  it("the province dropdown re-scopes the statement (allocated emissions, a module breakdown), names the series refusal and keeps the national interval", async () => {
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
    expect(screen.getByTestId("uncertainty-widget-caption")).toHaveTextContent("no provincial interval is published");
    expect(screen.queryByTestId("interval-marker")).toBeNull();
    fireEvent.change(screen.getByTestId("province-select"), { target: { value: "" } });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pakistan"));
  });
  it("the tab strip's anchors exist on the page", async () => {
    mount();
    await loaded();
    for (const id of ["summary", "sectors", "trend", "gases", "places", "uncertainty", "evidence"]) {
      expect(document.getElementById(id), id).not.toBeNull();
      expect(screen.getByTestId(`tab-${id}`)).toHaveAttribute("href", `#${id}`);
    }
    expect(screen.getByTestId("tab-summary")).toHaveAttribute("aria-current", "location");
  });
  it("audits: every decimal is a server string (ticks and quantiles included); no FY; no raw id; no avoid-list phrase; the footer names the licences and no version", async () => {
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
