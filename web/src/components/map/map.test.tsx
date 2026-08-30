import "@testing-library/jest-dom/vitest";
/**
 * The Map page: the filter panel, the map (stubbed: no WebGL in jsdom) with its layer switch
 * reflected in the URL, the timeline, the selection drawer's five tabs and the legend of every
 * layer against mocked envelopes. The four audits: every decimal on screen is a server string,
 * no "FY", no raw id, no avoid-list phrase; the word "Allocated" is present and no heading
 * is a bare "Emissions".
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import { ExplorerContext, useExplorer, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import type { Envelope, ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import Page from "@/app/map/page";
import { LayerLegend } from "./LayerLegend";
import { indexCells, indexUnallocated } from "./paint";
import { exceptionIndex, exceptionItems } from "./exceptions";
import { LAYERS } from "./layerModes";
import { RELEASE, envelope, mockFetch, refusal } from "@/__tests__/fixtures";
import { avoidPhrasesIn } from "@/__tests__/vocabulary";

vi.mock("@/components/map/ExplorerMap", async () => {
  const { useExplorer: use } = await import("@/components/ExplorerContext");
  return { ExplorerMap: () => { const { state } = use(); return <div data-testid="map-stub" data-layer={state.layer} data-level={state.level} />; } };
});
vi.mock("@/components/ui/BarChart", () => ({ BarChart: ({ env }: { env: { values: { display: string; display_short?: string }[] } }) => <div data-testid="bar-chart">{env.values.map((v) => v.display_short ?? v.display).join(" ")}</div> }));
vi.mock("@/components/ui/TrendChart", () => ({ TrendChart: ({ env }: { env: { values: { display: string; display_short?: string }[] } | null | undefined }) => <div data-testid="trend-chart">{(env?.values ?? []).map((v) => v.display_short ?? v.display).join(" ")}</div> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/map", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), redirect: vi.fn() }));

const D = { national: "452.35", nationalFull: "452.34662", punjab: "228.72", punjabFull: "228.7168", sindh: "134.73", sectors: ["223.45", "63.37"], shares: ["49.4", "14.0"], series: ["372.40", "452.35"], change: "+79.95", changePct: "+21.5", district: "[12.26, 12.28]", districtFull: "[12.2565, 12.2769]", lineage: ["0.27", "0.59"], views: ["176.66", "32.33", "19.73"] };
const U = { placed: "443.34", total: "9.01", punjab: "4.84", punjabPlaced: "223.88", sindh: "3.45", punjabExact: "4.837161474822386761", sindhExact: "3.447244381222043967", moduleGas: "4.827234056166698500" };
const PROVINCE_ROWS = [{ province: "Punjab", exact: U.punjabExact, n_rows: 285, unallocated_short: U.punjab }, { province: "Sindh", exact: U.sindhExact, n_rows: 285, unallocated_short: U.sindh }];

const LAHORE = "60131773B12131197496886";
const cellFields = { allocation_status: "one_to_one", spatial_class: "S3", placement_class: "diffuse_by_nature", allocation_surface: "builtup", dominant_module: "transport", dominant_stream: "transport|road-transport|2w-petrol-co2|co2", spatial_class_basis: "S3 of the transport stream with the largest reference-year mass" };

function route(url: string, body: Record<string, unknown> | undefined) {
  if (url.endsWith("/release")) return RELEASE;
  if (url.endsWith("/openapi.json")) return { paths: {}, components: { schemas: { QueryEmissions: { properties: { gwp_basis: { description: "AR5 | AR6" }, spatial_view: { description: "all | physical | origin | accounting" } } }, GridCellRequest: { properties: { gas: { default: "CO2" }, month: { description: 'YYYYMM or "annual"' } } } } } };
  if (url.includes("/tiles/")) return { raster: undefined };
  if (url.includes("/spatial/lineage/")) return envelope([{ display: "0.2725", display_short: D.lineage[0], extra: { module: "agriculture", gas: "CH4", month: "202307", spatial_view: "physical", allocation_status: "one_to_one", absence_reason: "", exactness: "exact" } }, { display: "0.5900", display_short: D.lineage[1], extra: { module: "power", gas: "CO2", month: "202307", spatial_view: "physical", allocation_status: "shared_shape", absence_reason: "", exactness: "exact" } }], { request_type: "get_spatial_lineage", unallocated: { by_module_gas: [{ module: "industry", gas: "CO2", exact: U.moduleGas }] } });
  if (url.includes("/timeseries")) {
    const q = (body?.query ?? {}) as Record<string, unknown>;
    if (q.geography_level) return refusal("grain_unavailable", "GrainUnavailable", "spatial products exist for the reference year only", "grid_not_tabular");
    return envelope([{ display: "372.397", display_short: D.series[0], group: { period_id: "FY2020-21" } }, { display: "452.347", display_short: D.series[1], group: { period_id: "FY2023-24" } }], { request_type: "get_timeseries", change: { from_period: "FY2020-21", to_period: "FY2023-24", from_short: D.series[0], to_short: D.series[1], change_short: D.change, change_pct_short: D.changePct, unit_short: "Mt CO₂e" } });
  }
  if ((body?.periods as string[] | undefined)?.[0] === "FY2020-21" && body?.geography_level) return refusal("grain_unavailable", "GrainUnavailable", "spatial products exist for FY2023-24 only", "grid_not_tabular");
  const g = (body?.group_by ?? []) as string[];
  if (g.includes("sector_id")) return envelope([{ display: "223.454", display_short: D.sectors[0], group: { sector_id: "agriculture" }, extra: { share_pct_short: D.shares[0] } }, { display: "63.371", display_short: D.sectors[1], group: { sector_id: "power" }, extra: { share_pct_short: D.shares[1] } }]);
  if (g.includes("module")) return envelope([{ display: "223.454", display_short: D.sectors[0], group: { module: "agriculture" }, extra: { share_pct_short: D.shares[0] } }, { display: "63.371", display_short: D.sectors[1], group: { module: "power" }, extra: { share_pct_short: D.shares[1] } }]);
  if (g.includes("spatial_view")) return envelope([{ display: "176.66", display_short: D.views[0], group: { spatial_view: "physical" } }, { display: "32.33", display_short: D.views[1], group: { spatial_view: "accounting" } }, { display: "19.73", display_short: D.views[2], group: { spatial_view: "origin" } }]);
  if (g.includes("province")) return envelope([{ display: D.punjabFull, display_short: D.punjab, group: { province: "Punjab" }, extra: { unallocated_short: U.punjab, share_pct_short: "50.6" } }, { display: "134.7255", display_short: D.sindh, group: { province: "Sindh" }, extra: { unallocated_short: U.sindh, share_pct_short: "29.8" } }], { unallocated: { level: "adm1", by_province: PROVINCE_ROWS, note: "mass retained at ADM1 and placed no finer" }, derived: { unallocated_total_short: U.total, placed_short: U.placed } });
  if (g.includes("shape_id")) return envelope([{ display: D.districtFull, display_short: D.district, group: { shape_id: LAHORE }, exactness: "exact;bounded_mixed_ch4_origin", exact_high: "12.2769", extra: { ...cellFields, interpretation: "an interval: the module mixes fossil and biogenic CH4" } }]);
  if (body?.geography_level === "adm2") return envelope([{ display: D.districtFull, display_short: D.district, group: { shape_id: LAHORE }, exactness: "exact;bounded_mixed_ch4_origin", exact_high: "12.2769", extra: { ...cellFields, interpretation: "an interval: the module mixes fossil and biogenic CH4" } }]);
  if (body?.geography_level === "adm1") return envelope([{ display: D.punjabFull, display_short: D.punjab, group: { province: "Punjab" }, extra: { unallocated_short: U.punjab } }], { unallocated: { level: "adm1", by_province: [PROVINCE_ROWS[0]] }, derived: { unallocated_total_short: U.punjab, placed_short: U.punjabPlaced } });
  return envelope([{ display: D.nationalFull, display_short: D.national, unit_short: "Mt CO₂e" }]);
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch(route));
});

/** The last URL the page wrote once one containing `part` has arrived (nuqs batches its writes). */
async function urlWith(updates: Parameters<OnUrlUpdateFunction>[0][], part: string) {
  await waitFor(() => expect(updates.some((u) => u.queryString.includes(part)), `no URL update containing ${part}`).toBe(true));
  return updates[updates.length - 1].queryString;
}

function mount(search = "", onUrlUpdate?: OnUrlUpdateFunction) {
  const Wrapper = withNuqsTestingAdapter({ searchParams: search, onUrlUpdate });
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

/** Every decimal token on screen is one of the strings received from the mocked API. */
function assertServerDecimals(extra: string[] = []) {
  const allowed = [...Object.values(D).flat(), ...Object.values(U), ...extra];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const tokens: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) tokens.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
  expect(tokens.length).toBeGreaterThan(0);
  for (const t of tokens) expect(allowed.some((a) => a.includes(t)), `${t} is not a server string`).toBe(true);
}

function audits(allocated = true) {
  const text = document.body.textContent ?? "";
  expect(text).not.toContain("FY");
  expect(text).not.toMatch(/(^|[^A-Z0-9(])AR5(?![)\w])/);
  expect(text).not.toContain("REF_2023_24");
  expect(text).not.toContain("1.0.0rc");
  expect(text).not.toContain("Mt CO2e");
  expect(text).not.toContain("LULUCF");
  expect(avoidPhrasesIn(text)).toEqual([]);
  for (const el of Array.from(document.body.querySelectorAll("[title]"))) {
    expect(el.getAttribute("title") ?? "").not.toContain("FY");
    expect(el.getAttribute("title") ?? "").not.toContain("1.0.0rc");
  }
  // the vocabulary: "Allocated emissions" everywhere, never a bare "Emissions" heading
  if (allocated) expect(text).toMatch(/[Aa]llocated emissions/);
  for (const h of Array.from(document.body.querySelectorAll("h1, h2, h3"))) expect((h.textContent ?? "").trim()).not.toMatch(/^Emissions\b/);
}

describe("the Map page", () => {
  it("renders the filter panel, the map, the timeline and the national drawer: 'Pakistan · allocated emissions' with the total and the placed / unallocated sentence from the server's derived strings", async () => {
    mount();
    expect(await screen.findByTestId("explorer")).toBeTruthy();
    expect(screen.getByTestId("page-title")).toHaveTextContent("Map allocated emissions");
    expect(screen.getByTestId("filter-panel")).toHaveAttribute("data-open", "1");
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-layer", "magnitude");
    expect(screen.getByTestId("time-rail")).toHaveTextContent("2023–24");
    expect(screen.getByTestId("month-row")).toHaveTextContent("Annual");
    expect(screen.getByTestId("month-row")).toHaveTextContent("Jul 23");
    expect(await screen.findByTestId("drawer-title")).toHaveTextContent("Pakistan · allocated emissions");
    const headline = await screen.findByTestId("headline-display");
    expect(headline).toHaveTextContent(D.national);
    expect(headline).toHaveAttribute("title", expect.stringContaining(D.nationalFull));
    expect(screen.getByTestId("headline-unit")).toHaveTextContent("Mt CO₂e");
    const sentence = await screen.findByTestId("placed-sentence");
    expect(sentence).toHaveTextContent(`Of this total, ${U.placed} Mt CO₂e is spatially placed and ${U.total} Mt CO₂e remains explicitly unallocated`);
    expect(screen.getByTestId("how-to-read")).toHaveTextContent("not a measurement");
    expect(screen.getByTestId("ask-about")).toHaveAttribute("href", expect.stringContaining("/ask?q="));
    expect(screen.getByTestId("open-rows")).toBeTruthy();
    expect(screen.getAllByTestId("nav-link").find((a) => a.textContent === "Map")).toHaveAttribute("aria-current", "page");
    assertServerDecimals();
    audits();
  });
  it("the drawer tabs follow the URL `tab`: Breakdown (shares), Trend (the series and its change), Evidence (class definitions), Sources (the release on Downloads)", async () => {
    const updates: Parameters<OnUrlUpdateFunction>[0][] = [];
    mount("", (e) => updates.push(e));
    await screen.findByTestId("drawer-title");
    const tabs = screen.getByTestId("drawer-tabs");
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Summary", "Breakdown", "Trend", "Evidence", "Sources"]);
    fireEvent.click(within(tabs).getByText("Breakdown"));
    expect(await urlWith(updates, "tab=breakdown")).toContain("tab=breakdown");
    await screen.findByTestId("tab-breakdown");
    await waitFor(() => expect(screen.getAllByTestId("table-share").map((e) => e.textContent)).toEqual([`${D.shares[0]}%`, `${D.shares[1]}%`]));
    fireEvent.click(within(tabs).getByText("Trend"));
    await screen.findByTestId("tab-trend");
    expect(await screen.findByTestId("change-sentence")).toHaveTextContent(`${D.change} Mt CO₂e (${D.changePct}%)`);
    expect(screen.getByTestId("trend-chart")).toHaveTextContent(D.series.join(" "));
    fireEvent.click(within(tabs).getByText("Evidence"));
    await screen.findByTestId("tab-evidence");
    expect(screen.getByTestId("class-definitions")).toHaveTextContent("S1");
    expect(screen.getByTestId("class-definitions")).toHaveTextContent("native source geometry");
    fireEvent.click(within(tabs).getByText("Sources"));
    await screen.findByTestId("tab-sources");
    expect(await screen.findByTestId("provenance")).toHaveTextContent("fact_annual");
    expect(screen.getByTestId("release-identity").querySelector("a")).toHaveAttribute("href", "/downloads");
    fireEvent.click(within(tabs).getByText("Summary"));
    await waitFor(() => expect(updates[updates.length - 1].queryString).not.toContain("tab="));
    assertServerDecimals();
    audits();
  });
  it("a province from the URL: '{Place} · allocated emissions', its retained mass; a district: the interval verbatim, the evidence fields and the lineage statuses; the trend is the typed refusal", async () => {
    const { unmount } = mount("?geo=Punjab");
    expect(await screen.findByTestId("drawer-title")).toHaveTextContent("Punjab · allocated emissions");
    expect(await screen.findByTestId("headline-display")).toHaveTextContent(D.punjab);
    expect(await screen.findByTestId("placed-sentence")).toHaveTextContent(`${U.punjab} Mt CO₂e remains explicitly unallocated`);
    expect(screen.getByTestId("drawer-close")).toBeTruthy();
    assertServerDecimals();
    unmount();
    mount(`?level=adm2&geo=${LAHORE}&tab=evidence`);
    expect(await screen.findByTestId("drawer-title")).toHaveTextContent("Lahore · allocated emissions");
    const fields = await screen.findByTestId("evidence-fields");
    await waitFor(() => expect(fields).toHaveTextContent("S3 — administrative statistic"));
    expect(fields).toHaveTextContent("diffuse by nature on builtup");
    expect(fields).toHaveTextContent("one-to-one");
    expect(fields).toHaveTextContent("road transport");
    const lineage = await screen.findByTestId("evidence-lineage");
    await waitFor(() => expect(lineage).toHaveTextContent("shared shape · 1 rows"));
    expect(await screen.findByTestId("unallocated-table")).toHaveTextContent(U.moduleGas);
    fireEvent.click(within(screen.getByTestId("drawer-tabs")).getByText("Trend"));
    expect(await screen.findByTestId("refusal-card")).toHaveTextContent("GrainUnavailable");
    fireEvent.click(within(screen.getByTestId("drawer-tabs")).getByText("Summary"));
    expect(await screen.findByTestId("headline-display")).toHaveTextContent(D.district);
    expect(screen.getByTestId("headline")).toHaveTextContent("interval");
    expect(screen.getByTestId("shape-rows")).toHaveTextContent("Lahore District");
    assertServerDecimals();
    audits();
  });
  it("the layer switch and the level are read from the URL; a non-reference year is 'national only' with the refusal in the API's words", async () => {
    const { unmount } = mount("?layer=evidence&level=adm2");
    await screen.findByTestId("drawer-title");
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-layer", "evidence");
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-level", "adm2");
    unmount();
    mount("?period=FY2020-21");
    const only = await screen.findByTestId("national-only");
    expect(only).toHaveTextContent("national only");
    await waitFor(() => expect(only).toHaveTextContent("spatial products exist for FY2023-24 only (GrainUnavailable)"));
    expect(screen.queryByTestId("month-row")).toBeNull();
    expect(await screen.findByTestId("headline-display")).toHaveTextContent(D.national);
  });
  it("the filter panel writes the URL and collapses to a rail; the timeline writes period and month", async () => {
    const updates: Parameters<OnUrlUpdateFunction>[0][] = [];
    mount("", (e) => updates.push(e));
    await screen.findByTestId("drawer-title");
    fireEvent.change(screen.getByTestId("sector-select"), { target: { value: "power" } });
    await urlWith(updates, "sector=power");
    fireEvent.click(screen.getByTestId("level-adm2"));
    expect(await urlWith(updates, "level=adm2")).toContain("sector=power");
    fireEvent.click(screen.getByTestId("filters-collapse"));
    expect(screen.getByTestId("filter-panel")).toHaveAttribute("data-open", "0");
    expect(screen.getByTestId("rail-period")).toBeTruthy();
    fireEvent.click(screen.getByTestId("rail-period"));
    expect(screen.getByTestId("filter-panel")).toHaveAttribute("data-open", "1");
    fireEvent.click(screen.getAllByTestId("month-chip")[1]);
    await urlWith(updates, "month=202307");
    fireEvent.click(screen.getAllByTestId("year-chip")[0]);
    expect(await urlWith(updates, "period=FY2020-21")).not.toContain("month="); // a new period drops the month
  });
});

const base: ExplorerState = { level: "adm2", period: "FY2023-24", month: null, sector: null, gas: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, tab: "summary", layer: "magnitude", c: null, cam: null, raster: false, view3d: false };
function ctx(state: ExplorerState): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState: vi.fn(), release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: undefined, agent: { enabled: false, model: "", reason: "not mounted" }, isMobile: false };
}
function LegendHost({ state, env, provinces }: { state: ExplorerState; env: Envelope; provinces: Envelope | null }) {
  const { dims, release } = useExplorer();
  const index = indexCells(env, state.level);
  const ex = exceptionIndex(dims, "Other");
  const residual = { name: "Other", members: ["Azad Kashmir"] };
  return <LayerLegend state={state} scope="Districts · 2023–24 · reference estimate · all sectors" env={env} index={index} error={null} isLoading={false} raster={undefined} hasCells={false} shared={null} unallocated={{ env: provinces, index: indexUnallocated(provinces), error: null, isLoading: false }} exceptions={{ present: new Set(["shared_shape", "bounded"]), items: exceptionItems(release, ex, residual) }} />;
}

describe("the layer legends", () => {
  const env = route("/query/emissions", { group_by: ["shape_id"], periods: ["FY2023-24"] }) as unknown as Envelope;
  const provinces = route("/query/emissions", { group_by: ["province"], periods: ["FY2023-24"] }) as unknown as Envelope;
  const mountLegend = (layer: ExplorerState["layer"], level: ExplorerState["level"] = "adm2") =>
    render(
      <Providers>
        <ExplorerContext.Provider value={ctx({ ...base, layer, level })}>
          <LegendHost state={{ ...base, layer, level }} env={env} provinces={provinces} />
        </ExplorerContext.Provider>
      </Providers>,
    );
  it("each layer has its own legend and the one sentence saying it is an allocation, not an observation", () => {
    for (const layer of ["magnitude", "evidence", "method", "unallocated", "exceptions"] as const) {
      const { unmount } = mountLegend(layer);
      expect(screen.getByTestId("layer-legend")).toHaveAttribute("data-layer", layer);
      expect(screen.getByTestId("layer-sentence")).toHaveTextContent(LAYERS[layer].sentence);
      expect(screen.getByTestId("layer-sentence")).toHaveTextContent("not an observation");
      unmount();
    }
  });
  it("magnitude: the cells' displays; evidence: S1–S4/NA with the definitions and the count; method: statuses and the hatch; unallocated: the province rows' unallocated_short; exceptions: the kinds and the named list", () => {
    let r = mountLegend("magnitude");
    expect(screen.getAllByTestId("legend-label").map((e) => e.textContent)).toEqual([D.district]);
    r.unmount();
    r = mountLegend("evidence");
    const ids = screen.getAllByTestId("legend-category").map((e) => e.getAttribute("data-id"));
    expect(ids).toEqual(["S1", "S2", "S3", "S4", "NA"]);
    expect(screen.getByTestId("legend-categories")).toHaveTextContent("administrative statistic");
    expect(screen.getAllByTestId("legend-category").find((e) => e.getAttribute("data-id") === "S3")).toHaveTextContent("1 district");
    r.unmount();
    r = mountLegend("method");
    expect(screen.getAllByTestId("legend-category").map((e) => e.getAttribute("data-id"))).toEqual(["one_to_one", "shared_shape", "shape_missing", "outside"]);
    expect(screen.getByTestId("legend-hatch")).toHaveTextContent("diffuse by nature (1)");
    r.unmount();
    r = mountLegend("unallocated", "adm1");
    expect(screen.getAllByTestId("legend-province").map((e) => e.textContent)).toEqual([`Punjab${U.punjab}`, `Sindh${U.sindh}`]);
    expect(screen.getByTestId("layer-legend")).toHaveTextContent(`${U.total} in all, ${U.placed} placed`);
    r.unmount();
    r = mountLegend("exceptions");
    expect(screen.getAllByTestId("legend-category").map((e) => e.getAttribute("data-id"))).toEqual(["other_unit", "shared_shape", "no_cell", "bounded"]);
    const list = screen.getByTestId("exceptions-list");
    expect(list).toHaveTextContent("Shared 'Other' cell");
    expect(list).toHaveTextContent("Lahore · one shape for 2 units");
    expect(list).toHaveTextContent("Lahore District, Lahore City");
    audits(false); // a legend alone names its layer; the page carries "allocated emissions"
    r.unmount();
  });
});
