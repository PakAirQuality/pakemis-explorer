import "@testing-library/jest-dom/vitest";
/**
 * /data, the Grapher: the query builder (lib/explore/query.ts) answers the five model
 * questions with exactly one contract call each — the nine-year change (a range → get_timeseries,
 * a line, the server's `change` sentence), what makes up agriculture (a sector → its
 * categories), which gases dominate (By gas → a stacked bar), Punjab against Sindh (two
 * provinces → two bars out of the ADM1-by-province envelope, a filter not arithmetic), the two
 * estimates (Compare → compare_emissions, grouped bars with the difference cells'
 * display_short) — by controls alone; the representation switch shows the same envelope as a
 * chart, a table or a map (the typed reason off a place breakdown); exactly four actions
 * under the canvas; and the four audits (every decimal a server string, ticks included; no FY;
 * no raw id; no avoid-list phrase).
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import Page from "@/app/data/page";
import { resolveState } from "@/lib/urlState";
import { buildQuery, resolveExplore, toUrl, transition, type ExploreContext, type ExploreState, type LocalKeys } from "@/lib/explore/query";
import { RELEASE, envelope, mockFetch } from "./fixtures";
import { avoidPhrasesIn } from "./vocabulary";

const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/data", useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/components/map/ExplorerMap", () => ({
  ExplorerMap: ({ override }: { override?: { level?: string; sector?: string | null } }) => <div data-testid="map-stub" data-level={override?.level ?? ""} data-sector={override?.sector ?? ""} />,
}));
type Item = { id: string; name: string; label: string };
vi.mock("@/components/charts/BarsWithAxis", () => ({
  BarsWithAxis: ({ items, ticks, onSelect, testId = "bars-with-axis" }: { items: Item[]; ticks?: string[] | null; onSelect?: (id: string) => void; testId?: string }) => (
    <div data-testid={testId} data-ticks={(ticks ?? []).join("|")}>
      {(ticks ?? []).map((t, i) => <span key={i} data-testid="axis-tick">{t}</span>)}
      {items.map((i) => <button key={i.id} type="button" data-testid="bar-item" data-id={i.id} onClick={() => onSelect?.(i.id)}>{i.name} {i.label}</button>)}
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
vi.mock("@/components/charts/LineChart", () => ({
  LineChart: ({ points, ticks }: { points: Item[]; ticks?: string[] | null }) => (
    <div data-testid="line-chart" data-ticks={(ticks ?? []).join("|")}>
      {(ticks ?? []).map((t, i) => <span key={i} data-testid="axis-tick">{t}</span>)}
      {points.map((p) => <span key={p.id} data-testid="line-point">{p.name} {p.label}</span>)}
    </div>
  ),
}));

const U = { unit_short: "Mt CO₂e", unit_words: "million tonnes CO₂e" };
const AXIS_250 = { ticks_short: ["0", "50", "100", "150", "200", "250"], min_short: "0.30", max_short: "223.45", unit_short: "Mt CO₂e" };
const AXIS_500 = { ticks_short: ["0", "100", "200", "300", "400", "500"], min_short: "372.40", max_short: "452.35", unit_short: "Mt CO₂e" };
const SECTORS = [
  { display: "223.454", display_short: "223.45", ...U, group: { sector_id: "agriculture" }, extra: { share_pct_short: "49.4", share_phrase: "nearly half", rank: 1 } },
  { display: "63.370", display_short: "63.37", ...U, group: { sector_id: "power" }, extra: { share_pct_short: "14.0", share_phrase: "about a tenth", rank: 2 } },
  { display: "29.467", display_short: "29.47", ...U, group: { sector_id: "residential" }, extra: { share_pct_short: "6.5", share_phrase: "a small share", rank: 3 } },
];
const MODULES = SECTORS.map((c) => ({ ...c, group: { module: c.group.sector_id } }));
const CATEGORIES = [
  { display: "151.662", display_short: "151.66", ...U, group: { category: "Enteric fermentation" }, extra: { share_pct_short: "67.9", share_phrase: "most", rank: 1 } },
  { display: "28.531", display_short: "28.53", ...U, group: { category: "Managed soils" }, extra: { share_pct_short: "12.8", share_phrase: "about a tenth", rank: 2 } },
];
const GASES = [
  { display: "248.751", display_short: "248.75", ...U, group: { gas: "CH4" }, extra: { share_pct_short: "55.0", share_phrase: "nearly half", rank: 1 } },
  { display: "161.462", display_short: "161.46", ...U, group: { gas: "CO2" }, extra: { share_pct_short: "35.7", share_phrase: "about a third", rank: 2 } },
  { display: "42.143", display_short: "42.14", ...U, group: { gas: "N2O" }, extra: { share_pct_short: "9.3", share_phrase: "a small share", rank: 3 } },
];
const MONTHS = [
  { display: "41.538", display_short: "41.54", ...U, group: { month: "202307" }, extra: { share_pct_short: "49.5" } },
  { display: "42.411", display_short: "42.41", ...U, group: { month: "202308" }, extra: { share_pct_short: "50.5" } },
];
const PROVINCES = [
  { display: "228.7168", display_short: "228.72", ...U, group: { province: "Punjab" }, extra: { share_pct_short: "50.6", share_phrase: "nearly half", rank: 1 } },
  { display: "134.7255", display_short: "134.73", ...U, group: { province: "Sindh" }, extra: { share_pct_short: "29.8", share_phrase: "about a quarter", rank: 2 } },
  { display: "56.0600", display_short: "56.06", ...U, group: { province: "Khyber Pakhtunkhwa" }, extra: { share_pct_short: "12.4", rank: 3 } },
  { display: "30.2100", display_short: "30.21", ...U, group: { province: "Balochistan" }, extra: { share_pct_short: "6.7", rank: 4 } },
  { display: "2.0000", display_short: "2.00", ...U, group: { province: "Other" }, extra: { share_pct_short: "0.4", rank: 5 } },
];
const SERIES = [
  { display: "372.397", display_short: "372.40", ...U, group: { period_id: "FY2020-21" } },
  { display: "452.347", display_short: "452.35", ...U, group: { period_id: "FY2023-24" } },
];
const CHANGE = { from_period: "FY2020-21", to_period: "FY2023-24", from_short: "372.40", to_short: "452.35", change_short: "+79.95", change_pct_short: "+21.5", direction: "rose", unit_short: "Mt CO₂e", note: "compares the first and last period only" };
const side = (display: string, display_short: string, group: Record<string, string>) => ({ exact: `${display}000`, value: Number(display), display, unit: "Mt CO2e AR5", result_row_ids: ["r"], formula: "SUM", group, display_short, ...U });
const COMPARE = [
  { display: "0.000", display_short: "0.00", ...U, value: 0, extra: { left: side("223.454", "223.45", { sector_id: "agriculture" }), right: side("223.454", "223.45", { sector_id: "agriculture" }) } },
  { display: "0.000", display_short: "0.00", ...U, value: 0, extra: { left: side("63.370", "63.37", { sector_id: "power" }), right: side("63.370", "63.37", { sector_id: "power" }) } },
  { display: "12.459", display_short: "12.46", ...U, value: 12.459, extra: { left: side("29.467", "29.47", { sector_id: "residential" }), right: side("41.926", "41.93", { sector_id: "residential" }) } },
];
const AXIS_DIFF = { ticks_short: ["-20", "-10", "0", "10", "20"], min_short: "-13.58", max_short: "12.46", unit_short: "Mt CO₂e" };
const PARTITION = { of: "the sum of these cells", n: 3, share_field: "share_pct_short", rule: "100 x exact / the sum of exact" };
const NE = [
  { display: "NE", unit: "notation_key", value: undefined, extra: { code: "3.D", category: "Agricultural soils - N from SOC mineralisation", gas: "N2O", notation_key: "NE" } },
  { display: "NE", unit: "notation_key", value: undefined, extra: { code: "2.A.2", category: "Lime production", gas: "CO2", notation_key: "NE" } },
];

const fetchSpy = vi.fn();
beforeEach(() => {
  fetchSpy.mockReset();
  push.mockReset();
  vi.stubGlobal(
    "fetch",
    mockFetch((url, body) => {
      fetchSpy(url, body);
      if (url.endsWith("/release")) return RELEASE;
      if (url.endsWith("/openapi.json")) return { paths: {}, components: { schemas: { QueryEmissions: { properties: { gwp_basis: { description: "AR5 | AR6" }, spatial_view: { description: "all | physical | origin | accounting" } } }, GridCellRequest: { properties: { gas: { default: "CO2" }, month: { description: 'YYYYMM or "annual"' } } } } } };
      if (url.includes("/query/completeness")) return envelope(NE, { request_type: "get_completeness" });
      if (url.includes("/query/timeseries")) return envelope(SERIES, { request_type: "get_timeseries", axis: AXIS_500, change: CHANGE });
      if (url.includes("/query/compare")) return envelope(COMPARE, { request_type: "compare_emissions", axis: AXIS_DIFF, context: { release: "PakEmis 1.0.0rc42", version: "1.0.0rc42", commit: "bc1716d6", configuration_id: "REF_2023_24 vs S_2023_24", gwp_basis: "AR5", lulucf: { status: "excluded", notation_key: "NE", note: "" }, defaults_applied: [] } });
      if (url.includes("/query/air")) {
        const k = body?.group_by?.[0];
        if (k === "year") return envelope([{ display: "782.446", display_short: "782.45", unit: "kt NH3", unit_short: "kt NH₃", group: { year: "1990" } }, { display: "2674.532", display_short: "2674.53", unit: "kt NH3", unit_short: "kt NH₃", group: { year: "2024" } }], { request_type: "query_air", axis: AXIS_250 });
        if (k === "province") return envelope([{ display: "1534.055", display_short: "1534.06", unit: "kt NH3", unit_short: "kt NH₃", group: { province: "Punjab" }, extra: { share_pct_short: "57.4" } }], { request_type: "query_air", axis: AXIS_250 });
        return envelope([{ display: "631.915", display_short: "631.92", unit: "kt PM2.5", unit_short: "kt PM₂.₅", group: { sector_id: "residential" }, extra: { share_pct_short: "75.7" } }, { display: "63.851", display_short: "63.85", unit: "kt PM2.5", unit_short: "kt PM₂.₅", group: { sector_id: "waste" }, extra: { share_pct_short: "7.6" } }], { request_type: "query_air", axis: AXIS_250 });
      }
      const key = body?.group_by?.[0];
      if (key === "sector_id") return envelope(SECTORS, { partition: PARTITION, axis: AXIS_250 });
      if (key === "module") return envelope(MODULES, { partition: PARTITION, axis: AXIS_250 });
      if (key === "category") return envelope(CATEGORIES, { partition: PARTITION, axis: AXIS_250 });
      if (key === "gas") return envelope(GASES, { partition: PARTITION, axis: AXIS_250 });
      if (key === "month") return envelope(MONTHS, { partition: PARTITION, axis: AXIS_250 });
      if (key === "province") return envelope(PROVINCES, { partition: { ...PARTITION, n: 5 }, axis: AXIS_250, derived: { unallocated_total_short: "9.01", placed_short: "443.34" } });
      return envelope([{ display: "452.34662", display_short: "452.35", ...U }]);
    }),
  );
});

function mount(search = "", onUrlUpdate?: OnUrlUpdateFunction) {
  const Wrapper = withNuqsTestingAdapter({ searchParams: search, onUrlUpdate, hasMemory: true });
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

const calls = (route: string) => fetchSpy.mock.calls.filter(([u]) => String(u).includes(route)).map(([, b]) => b as Record<string, unknown>);
const lastCall = (route: string) => calls(route).at(-1);

function serverDecimals(): Set<string> {
  const out = new Set<string>();
  const add = (s: string) => (s.match(/\d+\.\d+/g) ?? []).forEach((t) => out.add(t));
  for (const c of [...SECTORS, ...CATEGORIES, ...GASES, ...MONTHS, ...PROVINCES, ...SERIES, ...COMPARE, ...NE]) add(JSON.stringify(c));
  add(JSON.stringify([CHANGE, AXIS_250, AXIS_500, AXIS_DIFF]));
  add("452.34662 452.35");
  add(JSON.stringify(RELEASE));
  return out;
}

// --- the builder, pure ---------------------------------------------------------------------

const DEFAULTS = { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" };
const CTX: ExploreContext = { periods: ["FY2020-21", "FY2023-24"], referencePeriod: "FY2023-24", monthsOf: (p) => (p === "FY2023-24" ? ["202307", "202308"] : []), reference: "REF_2023_24", survey: "S_2023_24", surveyCovers: (p) => p === "FY2023-24" };
const LOCAL: LocalKeys = { by: null, rep: null, range: null, geos: null, cat: null, share: null };
const start = (): ExploreState => resolveExplore(resolveState({}, DEFAULTS), LOCAL, CTX);
const SCOPE = { periods: ["FY2023-24"], configuration_id: "REF_2023_24", gwp_basis: "AR5" };

describe("lib/explore/query: one state, one contract call", () => {
  it("the default is the sector breakdown at national grain, ordered by value", () => {
    const s = start();
    expect(s.by).toBe("sector");
    expect(buildQuery(s, CTX)).toEqual({ kind: "emissions", body: { ...SCOPE, group_by: ["sector_id"], order_by: "value desc" }, groupBy: "sector_id", chart: "bars" });
  });
  it("nine-year change: Period = All years is get_timeseries (annual, no period filter), drawn as a line", () => {
    const s = transition(start(), { control: "period", value: "range" }, CTX);
    expect([s.by, s.range]).toEqual(["period", true]);
    expect(buildQuery(s, CTX)).toEqual({ kind: "timeseries", body: { query: { configuration_id: "REF_2023_24", gwp_basis: "AR5" }, step: "annual" }, groupBy: "period_id", chart: "line" });
    expect(toUrl(s).local).toMatchObject({ range: true, by: null });
    // a sector under the range keeps the series (the range is what was varied last)
    const t = transition(s, { control: "sector", value: "agriculture" }, CTX);
    expect(t.by).toBe("category");
    const back = transition(t, { control: "period", value: "range" }, CTX);
    expect(buildQuery(back, CTX)).toMatchObject({ kind: "timeseries", body: { query: { sectors: ["agriculture"] } } });
  });
  it("what makes up agriculture: Sector = agriculture groups the sector's categories; a category then groups by gas", () => {
    const s = transition(start(), { control: "sector", value: "agriculture" }, CTX);
    expect(buildQuery(s, CTX)).toEqual({ kind: "emissions", body: { ...SCOPE, sectors: ["agriculture"], group_by: ["category"], order_by: "value desc" }, groupBy: "category", chart: "bars" });
    const c = transition(s, { control: "category", value: "Enteric fermentation" }, CTX);
    expect(buildQuery(c, CTX)).toEqual({ kind: "emissions", body: { ...SCOPE, sectors: ["agriculture"], categories: ["Enteric fermentation"], group_by: ["gas"], order_by: "value desc" }, groupBy: "gas", chart: "stacked" });
    expect(toUrl(c)).toMatchObject({ shared: { sector: "agriculture" }, local: { cat: "Enteric fermentation", by: "gas" } });
  });
  it("which gases dominate: Gas = By gas groups by gas as a stacked bar; one gas is a filter and the breakdown falls back", () => {
    const s = transition(start(), { control: "gas", value: "by" }, CTX);
    expect(buildQuery(s, CTX)).toEqual({ kind: "emissions", body: { ...SCOPE, group_by: ["gas"], order_by: "value desc" }, groupBy: "gas", chart: "stacked" });
    const one = transition(s, { control: "gas", value: "CH4" }, CTX);
    expect(buildQuery(one, CTX)).toMatchObject({ body: { gases: ["CH4"], group_by: ["sector_id"] }, chart: "bars" });
  });
  it("compare Punjab and Sindh: two provinces ask the ADM1-by-province envelope and keep the two (a filter, not arithmetic)", () => {
    const p = transition(start(), { control: "geography", value: "province", id: "Punjab" }, CTX);
    // one province: its sectors, by module (sector_id is national-grain only)
    expect(buildQuery(p, CTX)).toEqual({ kind: "emissions", body: { ...SCOPE, geography_level: "adm1", geography_ids: ["Punjab"], spatial_view: "all", group_by: ["module"], order_by: "value desc" }, groupBy: "module", chart: "bars" });
    const two = transition(p, { control: "geography", value: "second", id: "Sindh" }, CTX);
    expect(two.geos).toEqual(["Punjab", "Sindh"]);
    expect(buildQuery(two, CTX)).toEqual({ kind: "emissions", body: { ...SCOPE, geography_level: "adm1", spatial_view: "all", group_by: ["province"], order_by: "value desc" }, groupBy: "province", chart: "bars", filterTo: { key: "province", ids: ["Punjab", "Sindh"] } });
    expect(toUrl(two)).toMatchObject({ shared: { level: "adm1", geo: null }, local: { geos: "Punjab,Sindh", by: "place" } });
    // two places stay side by side under every other control: a sector filters both, it never re-groups
    const twoAg = transition(two, { control: "sector", value: "agriculture" }, CTX);
    expect(buildQuery(twoAg, CTX)).toMatchObject({ body: { sectors: ["agriculture"], group_by: ["province"] }, filterTo: { ids: ["Punjab", "Sindh"] } });
    expect(resolveExplore(resolveState({}, DEFAULTS), { ...LOCAL, geos: "Punjab,Sindh", by: "sector" }, CTX).by).toBe("place");
    // the URL round-trips to the same query
    const url = toUrl(two);
    const again = resolveExplore(resolveState({ level: url.shared.level ?? null, geo: null, period: null, sector: null, gas: null, config: null, gwp: null, view: null, month: null, cell: null, c: null, cam: null, raster: null, view3d: null } as Parameters<typeof resolveState>[0], DEFAULTS), url.local, CTX);
    expect(buildQuery(again, CTX)).toEqual(buildQuery(two, CTX));
    // every province, and every district
    expect(buildQuery(transition(start(), { control: "geography", value: "provinces" }, CTX), CTX)).toMatchObject({ body: { geography_level: "adm1", group_by: ["province"] }, chart: "bars" });
    // every province with a sector stays side by side (the sector filters), and a bare geos=all URL reads as the place breakdown
    expect(buildQuery(transition(transition(start(), { control: "geography", value: "provinces" }, CTX), { control: "sector", value: "agriculture" }, CTX), CTX)).toMatchObject({ body: { sectors: ["agriculture"], group_by: ["province"] } });
    expect(resolveExplore(resolveState({}, DEFAULTS), { ...LOCAL, geos: "all" }, CTX).by).toBe("place");
    expect(buildQuery(transition(start(), { control: "geography", value: "districts" }, CTX), CTX)).toMatchObject({ body: { geography_level: "adm2", group_by: ["shape_id"] } });
  });
  it("L against S: Compare estimates is compare_emissions over the composition, grouped bars; a series off the national grain and a category at province grain are refused by name", () => {
    const s = transition(start(), { control: "estimate", value: "compare" }, CTX);
    expect(buildQuery(s, CTX)).toEqual({
      kind: "compare",
      body: { left: { ...SCOPE, configuration_id: "REF_2023_24", group_by: ["sector_id"], order_by: "value desc" }, right: { ...SCOPE, configuration_id: "S_2023_24", group_by: ["sector_id"], order_by: "value desc" }, mode: "absolute" },
      groupBy: "sector_id",
      chart: "grouped",
    });
    // the survey estimate covers the reference year only: another year cannot compare
    const other = transition(s, { control: "period", value: { period: "FY2020-21" } }, CTX);
    expect(other.by).toBe("sector");
    // a range at province grain falls back; a category kept at province grain is a typed refusal
    const punjab = transition(start(), { control: "geography", value: "province", id: "Punjab" }, CTX);
    expect(transition(punjab, { control: "period", value: "range" }, CTX).by).not.toBe("period");
    const refused = buildQuery({ ...punjab, category: "Enteric fermentation", sector: "agriculture" }, CTX);
    expect(refused).toMatchObject({ kind: "refused", refusal: { error_class: "GrainUnavailable", detail: { available_at: ["national"] } } });
  });
});

// --- the page -------------------------------------------------------------------------------

describe("/data (the Grapher)", () => {
  it("the sector canvas: title, Showing sentence, the largest cell's share, bars on the server's ticks, exactly two actions", async () => {
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: "Pakistan" })).toBeInTheDocument();
    // the analytical counterpart's three zones: the branded header card, the chips, the overview, the rail
    expect(screen.getByTestId("data-header")).toBeInTheDocument();
    expect(screen.getByTestId("data-eyebrow")).toHaveTextContent("Pakistan Emissions Data");
    expect(screen.getByTestId("result-chips")).toHaveTextContent("All sectors");
    expect(screen.getByTestId("filter-rail")).toHaveAttribute("data-open", "1");
    expect(await screen.findByTestId("overview-display")).toHaveTextContent("452.35");
    expect(await screen.findByTestId("overview-chip")).toHaveTextContent("49.4 % from agriculture");
    expect(screen.getByTestId("canvas-title")).toHaveTextContent("Emissions by sector");
    expect(screen.getByTestId("showing-line-text")).toHaveTextContent("Pakistan's 2023–24 reference emissions, all sectors, grouped by sector, using IPCC 2013 warming factors.");
    expect(await screen.findByTestId("canvas-sentence")).toHaveTextContent("Agriculture accounts for 49.4 % (nearly half) of Pakistan's 2023–24 reference estimate.");
    expect(screen.getByTestId("frame-unit")).toHaveTextContent("Million tonnes CO₂e");
    const bars = screen.getByTestId("bars-with-axis");
    expect(bars).toHaveAttribute("data-ticks", AXIS_250.ticks_short.join("|"));
    expect(within(bars).getAllByTestId("bar-item").map((b) => b.textContent)).toEqual(["Agriculture 223.45 · 49.4 %", "Power 63.37 · 14.0 %", "Residential 29.47 · 6.5 %"]);
    expect(lastCall("/query/emissions")).toEqual({ periods: ["FY2023-24"], configuration_id: "REF_2023_24", gwp_basis: "AR5", group_by: ["sector_id"], order_by: "value desc" });
    // the two actions, and only two (Explain and Evidence left the canvas on 2026-09-07)
    const actions = screen.getByTestId("actions");
    expect(Array.from(actions.children).map((c) => c.getAttribute("data-testid"))).toEqual(["action-download", "action-share"]);
    expect(screen.getByTestId("action-download")).toHaveAttribute("href", expect.stringMatching(/\/download\/[0-9a-f]{32}\.csv$/));
    expect(push).not.toHaveBeenCalled();
    // the reading line opens to its four rows and counts every NE row
    fireEvent.click(screen.getByText("Reading this result"));
    await waitFor(() => expect(screen.getByTestId("reading-ne")).toHaveTextContent("2 categories are marked NE in this release."));
    expect(screen.getByTestId("reading-estimate")).toHaveTextContent("Every number on this page is the reference estimate. Structural alternatives (Survey-based estimate) are selectable under Estimate.");
    expect(screen.getByTestId("reading-not-official")).toHaveTextContent("Not an official inventory");
    expect(screen.getByTestId("reading-exact")).toHaveTextContent("Every value can expose its data rows, calculation, release and query receipt.");
    expect(screen.getAllByTestId("nav-link").find((a) => a.textContent === "Data")).toHaveAttribute("aria-current", "page");
  });
  it("Chart · Table · Map show the same envelope: the table carries the Share column, choosing Map carries the scope to every province and draws it", async () => {
    const updates: string[] = [];
    mount("", ({ queryString }) => updates.push(queryString));
    await screen.findByTestId("canvas-sentence");
    const receipt = screen.getByTestId("canvas").getAttribute("data-receipt");
    fireEvent.click(screen.getByTestId("rep-tabs-table"));
    const rows = await screen.findAllByTestId("envelope-row");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByTestId("table-share")).toHaveTextContent("49.4%");
    expect(within(rows[0]).getByTestId("table-value")).toHaveTextContent("223.45");
    expect(screen.getByTestId("canvas").getAttribute("data-receipt")).toBe(receipt);
    expect(updates.at(-1)).toContain("rep=table");
    // choosing Map from a national breakdown carries the scope to every province, not a refusal
    fireEvent.click(screen.getByTestId("rep-tabs-map"));
    expect(await screen.findByTestId("map-stub")).toHaveAttribute("data-level", "adm1");
    expect(lastCall("/query/emissions")).toEqual({ periods: ["FY2023-24"], configuration_id: "REF_2023_24", gwp_basis: "AR5", geography_level: "adm1", spatial_view: "all", group_by: ["province"], order_by: "value desc" });
    expect(screen.getByTestId("canvas-title")).toHaveTextContent("Allocated emissions by province");
    expect(updates.at(-1)).toContain("geos=all");
  });
  it("nine-year change: All years asks the annual series and the canvas reads the server's change sentence over a line on the series' ticks", async () => {
    const updates: string[] = [];
    mount("", ({ queryString }) => updates.push(queryString));
    await screen.findByTestId("canvas-sentence");
    fireEvent.change(screen.getByTestId("period-select"), { target: { value: "range" } });
    await waitFor(() => expect(screen.getByTestId("canvas-sentence")).toHaveTextContent("rose from 372.40 to 452.35 Mt CO₂e, +79.95 Mt (+21.5 %)"));
    expect(lastCall("/query/timeseries")).toEqual({ query: { configuration_id: "REF_2023_24", gwp_basis: "AR5" }, step: "annual" });
    expect(screen.getByTestId("line-chart")).toHaveAttribute("data-ticks", AXIS_500.ticks_short.join("|"));
    expect(screen.getByTestId("canvas-title")).toHaveTextContent("Emissions over time");
    expect(screen.getByTestId("showing-line-text")).toHaveTextContent("by year, 2020–21 to 2023–24");
    expect(updates.at(-1)).toContain("range=true");
    expect(screen.getByTestId("period-select")).toHaveValue("range");
  });
  it("what makes up agriculture: Sector = Agriculture groups the categories, offers them in a Category control", async () => {
    mount();
    await screen.findByTestId("canvas-sentence");
    fireEvent.change(screen.getByTestId("sector-select"), { target: { value: "agriculture" } });
    await waitFor(() => expect(screen.getByTestId("canvas-sentence")).toHaveTextContent("Enteric fermentation accounts for 67.9 % (most) of Pakistan's 2023–24 reference estimate in agriculture."));
    expect(lastCall("/query/emissions")).toEqual({ periods: ["FY2023-24"], configuration_id: "REF_2023_24", gwp_basis: "AR5", sectors: ["agriculture"], group_by: ["category"], order_by: "value desc" });
    expect(screen.getByTestId("showing-line-text")).toHaveTextContent("Pakistan's 2023–24 reference emissions, agriculture, grouped by IPCC category, using IPCC 2013 warming factors.");
    expect(screen.getByTestId("canvas-title")).toHaveTextContent("Emissions by IPCC category");
    const cat = screen.getByTestId("category-select");
    expect(Array.from(cat.querySelectorAll("option")).map((o) => o.textContent)).toEqual(["All of agriculture", "Enteric fermentation", "Managed soils"]);
    // the category filter then groups the gases
    fireEvent.change(cat, { target: { value: "Enteric fermentation" } });
    await waitFor(() => expect(lastCall("/query/emissions")).toMatchObject({ sectors: ["agriculture"], categories: ["Enteric fermentation"], group_by: ["gas"] }));
    expect(await screen.findByTestId("stacked-bar")).toBeInTheDocument();
  });
  it("which gases dominate: Gas = By gas draws the stacked bar with the server's shares", async () => {
    mount();
    await screen.findByTestId("canvas-sentence");
    fireEvent.change(screen.getByTestId("gas-select"), { target: { value: "by" } });
    const bar = await screen.findByTestId("stacked-bar");
    expect(within(bar).getAllByTestId("segment").map((s) => s.getAttribute("data-id"))).toEqual(["CH4", "CO2", "N2O"]);
    expect(bar).toHaveTextContent("CH₄");
    expect(bar).toHaveTextContent("248.75 Mt");
    expect(bar).toHaveTextContent("55.0 %");
    expect(lastCall("/query/emissions")).toEqual({ periods: ["FY2023-24"], configuration_id: "REF_2023_24", gwp_basis: "AR5", group_by: ["gas"], order_by: "value desc" });
    expect(screen.getByTestId("canvas-sentence")).toHaveTextContent("CH₄ accounts for 55.0 % (nearly half) of Pakistan's 2023–24 reference estimate.");
    // Share of total relabels the bars with the server's share alone
    fireEvent.change(screen.getByTestId("gas-select"), { target: { value: "" } });
    await screen.findByTestId("bars-with-axis");
    fireEvent.change(screen.getByTestId("measure-select"), { target: { value: "share" } });
    await waitFor(() => expect(within(screen.getByTestId("bars-with-axis")).getAllByTestId("bar-item")[0]).toHaveTextContent("Agriculture 49.4 %"));
  });
  it("compare Punjab and Sindh: a province then Compare with… keeps two bars out of the five-province envelope", async () => {
    const updates: string[] = [];
    mount("", ({ queryString }) => updates.push(queryString));
    await screen.findByTestId("canvas-sentence");
    fireEvent.change(screen.getByTestId("geography-select"), { target: { value: "province:Punjab" } });
    await waitFor(() => expect(lastCall("/query/emissions")).toMatchObject({ geography_level: "adm1", geography_ids: ["Punjab"], group_by: ["module"] }));
    expect(await screen.findByTestId("canvas-title")).toHaveTextContent("Allocated emissions by sector");
    expect(screen.getByTestId("showing-line-text")).toHaveTextContent("Punjab's 2023–24 allocated reference emissions, all sectors, grouped by sector");
    fireEvent.change(screen.getByTestId("second-select"), { target: { value: "Sindh" } });
    await waitFor(() => expect(within(screen.getByTestId("bars-with-axis")).getAllByTestId("bar-item").map((b) => b.textContent)).toEqual(["Punjab 228.72 · 50.6 %", "Sindh 134.73 · 29.8 %"]));
    expect(lastCall("/query/emissions")).toEqual({ periods: ["FY2023-24"], configuration_id: "REF_2023_24", gwp_basis: "AR5", geography_level: "adm1", spatial_view: "all", group_by: ["province"], order_by: "value desc" });
    expect(screen.getByTestId("canvas-sentence")).toHaveTextContent("Punjab: 228.72 Mt CO₂e (50.6 % of the provinces' allocated total); Sindh: 134.73 Mt CO₂e (29.8 %).");
    expect(screen.getByTestId("showing-line-text")).toHaveTextContent("Punjab and Sindh's 2023–24 allocated reference emissions, all sectors, grouped by province");
    expect(updates.at(-1)).toContain("geos=Punjab,Sindh");
    fireEvent.click(screen.getByTestId("rep-tabs-table"));
    expect(await screen.findAllByTestId("envelope-row")).toHaveLength(2);
  });
  it("L against S: Compare estimates draws grouped bars with the difference cells' display_short", async () => {
    mount();
    await screen.findByTestId("canvas-sentence");
    fireEvent.change(screen.getByTestId("config-select"), { target: { value: "compare" } });
    const grouped = await screen.findByTestId("grouped-bars");
    expect(lastCall("/query/compare")).toEqual({
      left: { periods: ["FY2023-24"], configuration_id: "REF_2023_24", gwp_basis: "AR5", group_by: ["sector_id"], order_by: "value desc" },
      right: { periods: ["FY2023-24"], configuration_id: "S_2023_24", gwp_basis: "AR5", group_by: ["sector_id"], order_by: "value desc" },
      mode: "absolute",
    });
    expect(within(grouped).getAllByTestId("grouped-difference").map((d) => d.textContent)).toEqual(["0.00", "0.00", "12.46"]);
    const residential = within(grouped).getAllByTestId("grouped-row")[2];
    expect(within(residential).getByTestId("grouped-left")).toHaveTextContent("29.47");
    expect(within(residential).getByTestId("grouped-right")).toHaveTextContent("41.93");
    expect(grouped).toHaveTextContent("Reference estimate");
    expect(grouped).toHaveTextContent("Survey-based estimate");
    expect(screen.getByTestId("canvas-sentence")).toHaveTextContent("Survey-based estimate differs most from the reference estimate in Residential: 12.46 Mt CO₂e (29.47 → 41.93).");
    expect(screen.getByTestId("canvas-title")).toHaveTextContent("Two estimates side by side");
    expect(screen.getByTestId("config-select")).toHaveValue("compare");
    // the share mode does not apply to a comparison
    const share = screen.getByTestId("measure-select").querySelector('option[value="share"]') as HTMLOptionElement;
    expect(share.disabled).toBe(true);
  });
  it("the left column and the rail act on the same state: a chip clears its filter, Reset pushes the bare path, the rail collapses to icons", async () => {
    const updates: string[] = [];
    mount("", ({ queryString }) => updates.push(queryString));
    await screen.findByTestId("canvas-sentence");
    // the sector chip appears once a sector is chosen, and its × clears it back
    fireEvent.change(screen.getByTestId("sector-select"), { target: { value: "agriculture" } });
    await waitFor(() => expect(screen.getByTestId("result-chip-sector")).toHaveTextContent("Agriculture"));
    fireEvent.click(screen.getByTestId("result-chip-sector-clear"));
    await waitFor(() => expect(screen.getByTestId("result-chip-sector")).toHaveTextContent("All sectors"));
    expect(screen.getByTestId("result-chip-sector")).toHaveAttribute("data-default", "1");
    // the hero select in the header card drives the same geography control as the rail's
    fireEvent.change(screen.getByTestId("place-select"), { target: { value: "province:Punjab" } });
    await waitFor(() => expect(screen.getByTestId("geography-select")).toHaveValue("province:Punjab"));
    expect(screen.getByTestId("data-place-title")).toHaveTextContent("Punjab");
    // Reset is a push to the bare path: the URL is the whole state
    fireEvent.click(screen.getByTestId("reset-filters"));
    expect(push).toHaveBeenCalledWith("/data");
    // the rail collapses to a 48 px icon strip and reopens
    fireEvent.click(screen.getByTestId("filters-collapse"));
    expect(screen.getByTestId("filter-rail")).toHaveAttribute("data-open", "0");
    fireEvent.click(screen.getByTestId("filters-expand"));
    expect(screen.getByTestId("filter-rail")).toHaveAttribute("data-open", "1");
  });
  it("the air beta: a pollutant in the metric select routes to query_air - sectors, provinces, the 1990-2024 series, the map's typed note, and a sector filter at provinces", async () => {
    const updates: string[] = [];
    mount("", ({ queryString }) => updates.push(queryString));
    await screen.findByTestId("canvas-sentence");
    fireEvent.change(screen.getByTestId("gas-select"), { target: { value: "pol:PM2.5" } });
    await waitFor(() => expect(lastCall("/query/air")).toEqual({ pollutants: ["PM2.5"], group_by: ["sector_id"], order_by: "value desc" }));
    expect(screen.getByTestId("canvas-title")).toHaveTextContent("PM₂.₅ emissions by sector");
    await waitFor(() => expect(screen.getByTestId("canvas-sentence")).toHaveTextContent("Residential contributed 631.92 kt PM₂.₅ (75.7 % of the total)"));
    expect(screen.getByTestId("showing-line-text")).toHaveTextContent("air-quality beta");
    expect(updates.at(-1)).toContain("pol=PM2.5");
    // the map is a typed note, not a silent CO2e map
    fireEvent.click(screen.getByTestId("rep-tabs-map"));
    expect(await screen.findByTestId("refusal-card")).toHaveTextContent("the air-quality beta has no map layer yet");
    fireEvent.click(screen.getByTestId("rep-tabs-chart"));
    // provinces: the agriculture allocation
    fireEvent.change(screen.getByTestId("geography-select"), { target: { value: "provinces" } });
    await waitFor(() => expect(lastCall("/query/air")).toMatchObject({ pollutants: ["PM2.5"], geography_level: "adm1", group_by: ["province"] }));
    // the series
    fireEvent.change(screen.getByTestId("geography-select"), { target: { value: "national" } });
    fireEvent.change(screen.getByTestId("period-select"), { target: { value: "range" } });
    await waitFor(() => expect(lastCall("/query/air")).toMatchObject({ pollutants: ["PM2.5"], group_by: ["year"] }));
    await waitFor(() => expect(screen.getByTestId("canvas-sentence")).toHaveTextContent("782.45 kt NH₃ in 1990"));
    // since the air spatial lane every sector rides its own streams' geography: a sector
    // filter at provinces is answered, not refused - the filter reaches the request
    fireEvent.change(screen.getByTestId("period-select"), { target: { value: "FY2023-24" } });
    fireEvent.change(screen.getByTestId("geography-select"), { target: { value: "provinces" } });
    fireEvent.change(screen.getByTestId("sector-select"), { target: { value: "power" } });
    await waitFor(() => expect(lastCall("/query/air")).toMatchObject({ pollutants: ["PM2.5"], sectors: ["power"], geography_level: "adm1", group_by: ["province"] }));
    // choosing a gas returns to CO2e
    fireEvent.change(screen.getByTestId("gas-select"), { target: { value: "" } });
    await waitFor(() => expect(screen.getByTestId("canvas-title")).not.toHaveTextContent("PM₂.₅"));
  });
  it("the air layers are single-year: a URL year cannot relabel them - the period pins, the select stands down with the reason, and the showing line names the layers' own year", async () => {
    // a stale 2015-16 URL under a pollutant: the layer holds one year, so the state pins to
    // the reference and no request carries a period - the year label must never be a lie
    mount("?period=FY2015-16&pol=SO2");
    await screen.findByTestId("canvas-sentence");
    await waitFor(() => expect(lastCall("/query/air")).toEqual({ pollutants: ["SO2"], group_by: ["sector_id"], order_by: "value desc" }));
    expect(screen.getByTestId("period-select")).toHaveValue("air-year");
    expect(screen.getByTestId("result-chip-period")).toHaveTextContent("2024 layer");
    expect(screen.getByTestId("showing-line-text")).toHaveTextContent("single year (calendar 2024; power and aviation on the 2023–24 fiscal year)");
    expect(screen.getByTestId("showing-line-text")).not.toHaveTextContent("2015");
    // districts: still no period on the wire
    fireEvent.change(screen.getByTestId("geography-select"), { target: { value: "districts" } });
    await waitFor(() => expect(lastCall("/query/air")).toMatchObject({ pollutants: ["SO2"], geography_level: "adm2", group_by: ["shape_id"] }));
    expect(lastCall("/query/air")).not.toHaveProperty("periods");
    // back to CO2e: the year control returns
    fireEvent.change(screen.getByTestId("gas-select"), { target: { value: "" } });
    await waitFor(() => expect(screen.getByTestId("period-select")).not.toHaveValue("air-year"));
  });
  it("audits: every decimal is a server string (ticks included); no FY; no raw id; no avoid-list phrase", async () => {
    mount();
    await screen.findByTestId("canvas-sentence");
    fireEvent.click(screen.getByText("Reading this result"));
    await waitFor(() => expect(screen.getByTestId("reading-ne")).toHaveTextContent("marked NE in this release"));
    const allowed = serverDecimals();
    const audit = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const tokens: string[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) tokens.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
      for (const t of tokens) expect(allowed.has(t), t).toBe(true);
      const text = document.body.textContent ?? "";
      expect(text).not.toContain("FY");
      expect(text).not.toMatch(/(^|[^A-Z0-9(])AR5(?![)\w])/);
      expect(text).not.toContain("1.0.0rc");
      expect(text).not.toContain("REF_2023_24");
      expect(text).not.toContain("S_2023_24");
      expect(text).not.toContain("Mt CO2e");
      expect(text).not.toContain("sector_id");
      expect(avoidPhrasesIn(text)).toEqual([]);
      for (const el of Array.from(document.body.querySelectorAll("[title]"))) {
        expect(el.getAttribute("title") ?? "").not.toContain("FY");
        expect(el.getAttribute("title") ?? "").not.toContain("1.0.0rc");
      }
      return tokens.length;
    };
    expect(audit()).toBeGreaterThan(3);
    fireEvent.click(screen.getByTestId("rep-tabs-table"));
    await screen.findAllByTestId("envelope-row");
    audit();
    fireEvent.click(screen.getByTestId("rep-tabs-chart"));
    fireEvent.change(screen.getByTestId("period-select"), { target: { value: "range" } });
    await screen.findByTestId("line-chart");
    expect(screen.getAllByTestId("axis-tick").map((t) => t.textContent)).toEqual(AXIS_500.ticks_short);
    audit();
    expect(screen.getByText("Not an official inventory")).toBeInTheDocument();
  });
});
