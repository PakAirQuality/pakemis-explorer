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
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import Page from "@/app/data/page";
import { resolveState } from "@/lib/urlState";
import { buildQuery, resolveExplore, toUrl, transition, type ExploreContext, type ExploreState, type LocalKeys } from "@/lib/explore/query";
import { MAP_FAILURE } from "@/components/workspace/copy";
import { RELEASE, envelope, mockFetch } from "./fixtures";
import { avoidPhrasesIn } from "./vocabulary";

const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/data", useRouter: () => ({ push, replace: vi.fn() }) }));
/**
 * The map stub can be told what status to report as it mounts (null: a map still loading, as
 * before) and keeps the live instance's `onStatus` for what the browser does afterwards.
 */
const mapStub = vi.hoisted(() => ({ status: null as null | "ready" | "failed" | "lost", report: null as null | ((s: "loading" | "ready" | "failed" | "lost") => void) }));
vi.mock("@/components/map/ExplorerMap", async () => {
  const { useEffect } = await import("react");
  return {
    ExplorerMap: ({ override, onStatus }: { override?: { level?: string; sector?: string | null }; onStatus?: (s: "loading" | "ready" | "failed" | "lost") => void }) => {
      useEffect(() => {
        mapStub.report = (s) => onStatus?.(s);
        if (mapStub.status) onStatus?.(mapStub.status);
        return () => {
          mapStub.report = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return <div data-testid="map-stub" data-level={override?.level ?? ""} data-sector={override?.sector ?? ""} />;
    },
  };
});
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
  { display: "223.454", display_short: "223.45", ...U, group: { reporting_sector: "agriculture" }, extra: { share_pct_short: "49.4", share_phrase: "nearly half", rank: 1 } },
  { display: "63.370", display_short: "63.37", ...U, group: { reporting_sector: "power" }, extra: { share_pct_short: "14.0", share_phrase: "about a tenth", rank: 2 } },
  { display: "29.467", display_short: "29.47", ...U, group: { reporting_sector: "residential" }, extra: { share_pct_short: "6.5", share_phrase: "a small share", rank: 3 } },
];
// rc54: a place breakdown asks the same key as a national one, so the fixture is the same cells
const MODULES = SECTORS.map((c) => ({ ...c, group: { reporting_sector: c.group.reporting_sector } }));
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
  { display: "0.000", display_short: "0.00", ...U, value: 0, extra: { left: side("223.454", "223.45", { reporting_sector: "agriculture" }), right: side("223.454", "223.45", { reporting_sector: "agriculture" }) } },
  { display: "0.000", display_short: "0.00", ...U, value: 0, extra: { left: side("63.370", "63.37", { reporting_sector: "power" }), right: side("63.370", "63.37", { reporting_sector: "power" }) } },
  { display: "12.459", display_short: "12.46", ...U, value: 12.459, extra: { left: side("29.467", "29.47", { reporting_sector: "residential" }), right: side("41.926", "41.93", { reporting_sector: "residential" }) } },
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
  mapStub.status = null;
  mapStub.report = null;
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
        // a place the release holds nothing for: an EMPTY envelope, which the page must call empty
        if ((body?.geography_ids as string[] | undefined)?.[0] === "Sindh") return envelope([], { request_type: "query_air" });
        if (k === "period_id") return envelope([{ display: "600.100", display_short: "600.10", unit: "kt PM2.5", unit_short: "kt PM₂.₅", group: { period_id: "FY2020-21" } }, { display: "771.873", display_short: "771.87", unit: "kt PM2.5", unit_short: "kt PM₂.₅", group: { period_id: "FY2023-24" } }], { request_type: "query_air", axis: AXIS_250 });
        if (k === "year") return envelope([{ display: "782.446", display_short: "782.45", unit: "kt NH3", unit_short: "kt NH₃", group: { year: "1990" } }, { display: "2674.532", display_short: "2674.53", unit: "kt NH3", unit_short: "kt NH₃", group: { year: "2024" } }], { request_type: "query_air", axis: AXIS_250 });
        if (k === "province") return envelope([{ display: "1534.055", display_short: "1534.06", unit: "kt NH3", unit_short: "kt NH₃", group: { province: "Punjab" }, extra: { share_pct_short: "57.4" } }], { request_type: "query_air", axis: AXIS_250 });
        return envelope([{ display: "631.915", display_short: "631.92", unit: "kt PM2.5", unit_short: "kt PM₂.₅", group: { sector_id: "residential" }, extra: { share_pct_short: "75.7" } }, { display: "63.851", display_short: "63.85", unit: "kt PM2.5", unit_short: "kt PM₂.₅", group: { sector_id: "waste" }, extra: { share_pct_short: "7.6" } }], { request_type: "query_air", axis: AXIS_250 });
      }
      const key = body?.group_by?.[0];
      if (key === "reporting_sector") return envelope(SECTORS, { partition: PARTITION, axis: AXIS_250 });
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
    expect(buildQuery(s, CTX)).toEqual({ kind: "emissions", body: { ...SCOPE, group_by: ["reporting_sector"], order_by: "value desc" }, groupBy: "reporting_sector", chart: "bars" });
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
    expect(buildQuery(back, CTX)).toMatchObject({ kind: "timeseries", body: { query: { reporting_sectors: ["agriculture"] } } });
  });
  it("what makes up agriculture: Sector = agriculture groups the sector's categories; a category then groups by gas", () => {
    const s = transition(start(), { control: "sector", value: "agriculture" }, CTX);
    expect(buildQuery(s, CTX)).toEqual({ kind: "emissions", body: { ...SCOPE, reporting_sectors: ["agriculture"], group_by: ["category"], order_by: "value desc" }, groupBy: "category", chart: "bars" });
    const c = transition(s, { control: "category", value: "Enteric fermentation" }, CTX);
    expect(buildQuery(c, CTX)).toEqual({ kind: "emissions", body: { ...SCOPE, reporting_sectors: ["agriculture"], categories: ["Enteric fermentation"], group_by: ["gas"], order_by: "value desc" }, groupBy: "gas", chart: "stacked" });
    expect(toUrl(c)).toMatchObject({ shared: { sector: "agriculture" }, local: { cat: "Enteric fermentation", by: "gas" } });
  });
  it("which gases dominate: Gas = By gas groups by gas as a stacked bar; one gas is a filter and the breakdown falls back", () => {
    const s = transition(start(), { control: "gas", value: "by" }, CTX);
    expect(buildQuery(s, CTX)).toEqual({ kind: "emissions", body: { ...SCOPE, group_by: ["gas"], order_by: "value desc" }, groupBy: "gas", chart: "stacked" });
    const one = transition(s, { control: "gas", value: "CH4" }, CTX);
    expect(buildQuery(one, CTX)).toMatchObject({ body: { gases: ["CH4"], group_by: ["reporting_sector"] }, chart: "bars" });
  });
  it("compare Punjab and Sindh: two provinces ask the ADM1-by-province envelope and keep the two (a filter, not arithmetic)", () => {
    const p = transition(start(), { control: "geography", value: "province", id: "Punjab" }, CTX);
    // one province: its sectors, on the reporting axis (the district tables carry it since rc54)
    expect(buildQuery(p, CTX)).toEqual({ kind: "emissions", body: { ...SCOPE, geography_level: "adm1", geography_ids: ["Punjab"], spatial_view: "all", group_by: ["reporting_sector"], order_by: "value desc" }, groupBy: "reporting_sector", chart: "bars" });
    const two = transition(p, { control: "geography", value: "second", id: "Sindh" }, CTX);
    expect(two.geos).toEqual(["Punjab", "Sindh"]);
    expect(buildQuery(two, CTX)).toEqual({ kind: "emissions", body: { ...SCOPE, geography_level: "adm1", spatial_view: "all", group_by: ["province"], order_by: "value desc" }, groupBy: "province", chart: "bars", filterTo: { key: "province", ids: ["Punjab", "Sindh"] } });
    expect(toUrl(two)).toMatchObject({ shared: { level: "adm1", geo: null }, local: { geos: "Punjab,Sindh", by: "place" } });
    // two places stay side by side under every other control: a sector filters both, it never re-groups
    const twoAg = transition(two, { control: "sector", value: "agriculture" }, CTX);
    expect(buildQuery(twoAg, CTX)).toMatchObject({ body: { reporting_sectors: ["agriculture"], group_by: ["province"] }, filterTo: { ids: ["Punjab", "Sindh"] } });
    expect(resolveExplore(resolveState({}, DEFAULTS), { ...LOCAL, geos: "Punjab,Sindh", by: "sector" }, CTX).by).toBe("place");
    // the URL round-trips to the same query
    const url = toUrl(two);
    const again = resolveExplore(resolveState({ level: url.shared.level ?? null, geo: null, period: null, sector: null, gas: null, config: null, gwp: null, view: null, month: null, cell: null, c: null, cam: null, raster: null, view3d: null } as Parameters<typeof resolveState>[0], DEFAULTS), url.local, CTX);
    expect(buildQuery(again, CTX)).toEqual(buildQuery(two, CTX));
    // every province, and every district
    expect(buildQuery(transition(start(), { control: "geography", value: "provinces" }, CTX), CTX)).toMatchObject({ body: { geography_level: "adm1", group_by: ["province"] }, chart: "bars" });
    // every province with a sector stays side by side (the sector filters), and a bare geos=all URL reads as the place breakdown
    expect(buildQuery(transition(transition(start(), { control: "geography", value: "provinces" }, CTX), { control: "sector", value: "agriculture" }, CTX), CTX)).toMatchObject({ body: { reporting_sectors: ["agriculture"], group_by: ["province"] } });
    expect(resolveExplore(resolveState({}, DEFAULTS), { ...LOCAL, geos: "all" }, CTX).by).toBe("place");
    expect(buildQuery(transition(start(), { control: "geography", value: "districts" }, CTX), CTX)).toMatchObject({ body: { geography_level: "adm2", group_by: ["shape_id"] } });
  });
  it("L against S: Compare estimates is compare_emissions over the composition, grouped bars; a series off the national grain and a category at province grain are refused by name", () => {
    const s = transition(start(), { control: "estimate", value: "compare" }, CTX);
    expect(buildQuery(s, CTX)).toEqual({
      kind: "compare",
      body: { left: { ...SCOPE, configuration_id: "REF_2023_24", group_by: ["reporting_sector"], order_by: "value desc" }, right: { ...SCOPE, configuration_id: "S_2023_24", group_by: ["reporting_sector"], order_by: "value desc" }, mode: "absolute" },
      groupBy: "reporting_sector",
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
    expect(within(bars).getAllByTestId("bar-item").map((b) => b.textContent)).toEqual(["Agriculture 223.45 · 49.4 %", "Power (grid generation) 63.37 · 14.0 %", "Residential 29.47 · 6.5 %"]);
    expect(lastCall("/query/emissions")).toEqual({ periods: ["FY2023-24"], configuration_id: "REF_2023_24", gwp_basis: "AR5", group_by: ["reporting_sector"], order_by: "value desc" });
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
  it("a map that cannot be drawn is never a blank canvas: the sentence, the chart of the same envelope in its place, and one click to Chart or Table with the selection intact", async () => {
    mapStub.status = "failed";
    const updates: string[] = [];
    mount("?sector=agriculture&period=FY2020-21", ({ queryString }) => updates.push(queryString));
    await screen.findByTestId("canvas-sentence");
    fireEvent.click(screen.getByTestId("rep-tabs-map"));
    const fallback = await screen.findByTestId("canvas-map-fallback");
    expect(fallback).toHaveAttribute("data-status", "failed");
    const notice = within(fallback).getByTestId("map-unavailable");
    expect(notice).toHaveAttribute("role", "status");
    expect(within(notice).getByTestId("map-unavailable-text")).toHaveTextContent(MAP_FAILURE.explanation);
    // the frame the map would have filled is out of sight, not a 560 px blank
    const frame = screen.getByTestId("canvas-map");
    expect(frame).toHaveClass("hidden");
    expect(frame).toHaveAttribute("aria-hidden", "true");
    // the same envelope, as bars: the provinces the map would have shaded, for the sector and year asked
    const body = { periods: ["FY2020-21"], configuration_id: "REF_2023_24", gwp_basis: "AR5", geography_level: "adm1", spatial_view: "all", reporting_sectors: ["agriculture"], group_by: ["province"], order_by: "value desc" };
    expect(lastCall("/query/emissions")).toEqual(body);
    const bars = await within(fallback).findByTestId("bars-with-axis");
    expect(within(bars).getAllByTestId("bar-item").map((b) => b.textContent)).toEqual(PROVINCES.map((c) => `${c.group.province} ${c.display_short} · ${c.extra.share_pct_short} %`));
    // nothing was rewritten behind the reader's back: the map is still what the URL asks for
    for (const part of ["rep=map", "sector=agriculture", "period=FY2020-21", "geos=all"]) expect(updates.at(-1), part).toContain(part);
    // one click makes Table the page's representation, the selection and the request unchanged
    fireEvent.click(within(notice).getByTestId("map-unavailable-table"));
    expect(await screen.findAllByTestId("envelope-row")).toHaveLength(PROVINCES.length);
    for (const part of ["rep=table", "sector=agriculture", "period=FY2020-21", "geos=all"]) expect(updates.at(-1), part).toContain(part);
    expect(lastCall("/query/emissions")).toEqual(body);
    expect(screen.queryByTestId("map-unavailable")).toBeNull();
    expect(screen.queryByTestId("canvas-map")).toBeNull();
    // and the other click, from the map again, makes it Chart
    fireEvent.click(screen.getByTestId("rep-tabs-map"));
    fireEvent.click(await screen.findByTestId("map-unavailable-chart"));
    await waitFor(() => expect(updates.at(-1)).not.toContain("rep="));
    expect(updates.at(-1)).toContain("sector=agriculture");
    expect(screen.queryByTestId("map-unavailable")).toBeNull();
    expect(screen.getByTestId("bars-with-axis")).toBeInTheDocument();
  });
  it("a context lost on the data page's map shows the chart until the browser gives it back, and then the map again", async () => {
    mapStub.status = "ready";
    mount();
    await screen.findByTestId("canvas-sentence");
    fireEvent.click(screen.getByTestId("rep-tabs-map"));
    const stub = await screen.findByTestId("map-stub");
    expect(screen.getByTestId("canvas-map")).not.toHaveClass("hidden");
    expect(screen.queryByTestId("canvas-map-fallback")).toBeNull();
    act(() => mapStub.report?.("lost"));
    expect(screen.getByTestId("canvas-map-fallback")).toHaveAttribute("data-status", "lost");
    expect(screen.getByTestId("map-unavailable-text")).toHaveTextContent(MAP_FAILURE.explanation);
    expect(screen.getByTestId("canvas-map")).toHaveClass("hidden");
    expect(screen.getByTestId("map-stub")).toBe(stub); // the same instance, kept for the context's return
    act(() => mapStub.report?.("ready"));
    expect(screen.queryByTestId("canvas-map-fallback")).toBeNull();
    expect(screen.getByTestId("canvas-map")).not.toHaveClass("hidden");
    expect(screen.getByTestId("map-stub")).toBe(stub);
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
    expect(lastCall("/query/emissions")).toEqual({ periods: ["FY2023-24"], configuration_id: "REF_2023_24", gwp_basis: "AR5", reporting_sectors: ["agriculture"], group_by: ["category"], order_by: "value desc" });
    expect(screen.getByTestId("showing-line-text")).toHaveTextContent("Pakistan's 2023–24 reference emissions, agriculture, grouped by IPCC category, using IPCC 2013 warming factors.");
    expect(screen.getByTestId("canvas-title")).toHaveTextContent("Emissions by IPCC category");
    const cat = screen.getByTestId("category-select");
    expect(Array.from(cat.querySelectorAll("option")).map((o) => o.textContent)).toEqual(["All of agriculture", "Enteric fermentation", "Managed soils"]);
    // the category filter then groups the gases
    fireEvent.change(cat, { target: { value: "Enteric fermentation" } });
    await waitFor(() => expect(lastCall("/query/emissions")).toMatchObject({ reporting_sectors: ["agriculture"], categories: ["Enteric fermentation"], group_by: ["gas"] }));
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
    await waitFor(() => expect(lastCall("/query/emissions")).toMatchObject({ geography_level: "adm1", geography_ids: ["Punjab"], group_by: ["reporting_sector"] }));
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
      left: { periods: ["FY2023-24"], configuration_id: "REF_2023_24", gwp_basis: "AR5", group_by: ["reporting_sector"], order_by: "value desc" },
      right: { periods: ["FY2023-24"], configuration_id: "S_2023_24", gwp_basis: "AR5", group_by: ["reporting_sector"], order_by: "value desc" },
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
  it("a pollutant is read from ONE product: the covered panel for the selected fiscal year, on every request the page makes", async () => {
    // The page used to send no `periods`, and the API picks its air product by whether they are
    // there: without them it served the older single-year layers, where grid power's screening
    // bound is an ordinary row. Same question as the workspace, a different total and a different
    // largest source. Every assertion below is on the REQUEST, because that is where it went wrong.
    const updates: string[] = [];
    mount("", ({ queryString }) => updates.push(queryString));
    await screen.findByTestId("canvas-sentence");
    fireEvent.change(screen.getByTestId("gas-select"), { target: { value: "pol:PM2.5" } });
    await waitFor(() => expect(lastCall("/query/air")).toEqual({ pollutants: ["PM2.5"], periods: ["FY2023-24"], group_by: ["sector_id"], order_by: "value desc" }));
    expect(screen.getByTestId("canvas-title")).toHaveTextContent("PM₂.₅ emissions by sector");
    // the share says what it is a share of: the sources estimated, never "the total"
    await waitFor(() => expect(screen.getByTestId("canvas-sentence")).toHaveTextContent("Residential is the largest estimated source, at 631.92 kt PM₂.₅ (75.7 % of the sources estimated here)."));
    expect(screen.getByTestId("canvas-sentence")).not.toHaveTextContent("of the total");
    expect(screen.getByTestId("showing-line-text")).toHaveTextContent("not a measure of air quality");
    expect(screen.getByTestId("showing-line-text")).toHaveTextContent("2023–24");
    expect(updates.at(-1)).toContain("pol=PM2.5");
    // no request on this page is an air request without a period
    for (const body of calls("/query/air")) expect(body).toHaveProperty("periods");

    // ANOTHER YEAR is asked for, not pinned away: the panel carries every fiscal year
    fireEvent.change(screen.getByTestId("period-select"), { target: { value: "FY2020-21" } });
    await waitFor(() => expect(lastCall("/query/air")).toEqual({ pollutants: ["PM2.5"], periods: ["FY2020-21"], group_by: ["sector_id"], order_by: "value desc" }));
    expect(screen.getByTestId("result-chip-period")).toHaveTextContent("2020–21");
    fireEvent.change(screen.getByTestId("period-select"), { target: { value: "FY2023-24" } });

    // ALL YEARS is the nine-year fiscal series of the same selection, not agriculture's calendar history
    fireEvent.change(screen.getByTestId("period-select"), { target: { value: "range" } });
    await waitFor(() => expect(lastCall("/query/air")).toEqual({ pollutants: ["PM2.5"], periods: ["FY2020-21", "FY2023-24"], group_by: ["period_id"] }));
    await waitFor(() => expect(screen.getByTestId("canvas-sentence")).toHaveTextContent("600.10 kt PM₂.₅ in 2020–21, 771.87 kt PM₂.₅ in 2023–24"));
    fireEvent.change(screen.getByTestId("period-select"), { target: { value: "FY2023-24" } });

    // the page's own map still draws CO₂e, and says so truthfully
    fireEvent.click(screen.getByTestId("rep-tabs-map"));
    expect(await screen.findByTestId("refusal-card")).toHaveTextContent("the Explore map shows it by province and district");
    fireEvent.click(screen.getByTestId("rep-tabs-chart"));
    // choosing a gas returns to CO2e
    fireEvent.change(screen.getByTestId("gas-select"), { target: { value: "" } });
    await waitFor(() => expect(screen.getByTestId("canvas-title")).not.toHaveTextContent("PM₂.₅"));
  });
  it("one selected place is THAT place by sector; comparing places is its own, explicit mode", async () => {
    // Lahore selected used to promise "Lahore's … grouped by sector" over a chart of every
    // district, and Punjab a table of every province: the place set the heading and never reached
    // the query. The request and the title are asserted together, because the bug was that they
    // disagreed.
    mount("?pol=PM2.5");
    await screen.findByTestId("canvas-sentence");
    // PUNJAB: its id is in the request, and the rows asked for are its sectors
    fireEvent.change(screen.getByTestId("geography-select"), { target: { value: "province:Punjab" } });
    await waitFor(() => expect(lastCall("/query/air")).toEqual({ pollutants: ["PM2.5"], periods: ["FY2023-24"], geography_level: "adm1", geography_ids: ["Punjab"], group_by: ["sector_id"], order_by: "value desc" }));
    expect(screen.getByTestId("canvas-title")).toHaveTextContent("PM₂.₅ emissions by sector");
    expect(screen.getByTestId("showing-line-text")).toHaveTextContent("Punjab's PM₂.₅ emissions in kilotonnes, grouped by sector");
    await waitFor(() => expect(screen.getByTestId("canvas-sentence")).toHaveTextContent("Residential is the largest estimated source in Punjab"));
    // EVERY PROVINCE is asked for by name - the comparison mode - and titled as what comes back
    fireEvent.change(screen.getByTestId("geography-select"), { target: { value: "provinces" } });
    await waitFor(() => expect(lastCall("/query/air")).toEqual({ pollutants: ["PM2.5"], periods: ["FY2023-24"], geography_level: "adm1", group_by: ["province"], order_by: "value desc" }));
    expect(screen.getByTestId("canvas-title")).toHaveTextContent("PM₂.₅ emissions by province");
    expect(lastCall("/query/air")).not.toHaveProperty("geography_ids");
    // a sector filter rides along at the place grain
    fireEvent.change(screen.getByTestId("sector-select"), { target: { value: "residential" } });
    await waitFor(() => expect(lastCall("/query/air")).toMatchObject({ sectors: ["residential"], geography_level: "adm1", group_by: ["province"] }));
  });
  it("a district is asked for at district grain, and a province stays a province while its districts are on the map", async () => {
    const lahore = "60131773B12131197496886";
    const { unmount } = mount(`?pol=PM2.5&level=adm2&geo=${lahore}`);
    await waitFor(() => expect(lastCall("/query/air")).toEqual({ pollutants: ["PM2.5"], periods: ["FY2023-24"], geography_level: "adm2", geography_ids: [lahore], group_by: ["sector_id"], order_by: "value desc" }));
    expect(screen.getByTestId("canvas-title")).toHaveTextContent("PM₂.₅ emissions by sector");
    unmount();
    // the workspace writes level=adm2 with geo=Punjab when a province is drilled into: the grain
    // is the id's, and reading `level` asked the district table for a shape called "Punjab"
    fetchSpy.mockClear();
    const air = mount("?pol=PM2.5&level=adm2&geo=Punjab");
    await waitFor(() => expect(lastCall("/query/air")).toMatchObject({ geography_level: "adm1", geography_ids: ["Punjab"], group_by: ["sector_id"] }));
    air.unmount();
    // and the same link under greenhouse gases, which drew an empty chart under the province's name
    fetchSpy.mockClear();
    mount("?level=adm2&geo=Punjab");
    await waitFor(() => expect(lastCall("/query/emissions")).toMatchObject({ geography_level: "adm1", geography_ids: ["Punjab"] }));
  });
  it("a place the release holds nothing for is said to be empty: no national fallback, no other places", async () => {
    mount("?pol=PM2.5&geo=Sindh");
    await waitFor(() => expect(lastCall("/query/air")).toMatchObject({ geography_level: "adm1", geography_ids: ["Sindh"] }));
    expect(await screen.findByTestId("refusal-card")).toHaveTextContent("The release holds no rows for this selection");
    expect(screen.queryByTestId("canvas-sentence")).toBeNull();
    // nothing was asked in its place
    for (const body of calls("/query/air").filter((b) => (b.group_by as string[] | undefined)?.[0] === "sector_id" && b.geography_ids)) expect(body.geography_ids).toEqual(["Sindh"]);
  });
  it("under a pollutant the page's own chrome is the pollutant's: overview, measure, estimate, view, summary", async () => {
    mount("?pol=PM2.5");
    await screen.findByTestId("canvas-sentence");
    // the anchor card is the pollutant's covered total, not the national CO₂e figure it used to keep
    const overview = await screen.findByTestId("overview-card");
    await waitFor(() => expect(overview).toHaveTextContent("the sources this release estimates emitted 631.92 kt PM₂.₅ in Pakistan"));
    expect(overview).toHaveTextContent("not a measurement of the air people breathe");
    expect(overview).not.toHaveTextContent("CO₂e");
    expect(calls("/query/emissions")).toHaveLength(0);
    // the measure is emission mass; no warming-potential basis is offered
    const measure = screen.getByTestId("measure-select") as HTMLSelectElement;
    expect([...measure.options].map((o) => o.textContent)).toEqual(["Emission mass · kilotonnes"]);
    // only the reference estimate (and the disabled compare) is offered; the accounting view is not a pollutant setting
    const config = screen.getByTestId("config-select") as HTMLSelectElement;
    expect([...config.options].filter((o) => !o.disabled).map((o) => o.value)).toEqual(["REF_2023_24"]);
    expect(screen.queryByTestId("view-select")).toBeNull();
    expect(screen.getByTestId("view-not-for-air")).toBeInTheDocument();
    expect(screen.getByTestId("active-view")).toHaveTextContent("PM₂.₅ emissions (kt)");
    expect(screen.getByTestId("active-view")).not.toHaveTextContent("CO₂e");
    // back to greenhouse gases: the greenhouse controls return, and the overview asks its own query again
    fireEvent.change(screen.getByTestId("gas-select"), { target: { value: "" } });
    await waitFor(() => expect(screen.getByTestId("view-select")).toBeInTheDocument());
    expect([...(screen.getByTestId("measure-select") as HTMLSelectElement).options].length).toBeGreaterThan(1);
    await waitFor(() => expect(calls("/query/emissions").length).toBeGreaterThan(0));
    expect(screen.getByTestId("active-view")).toHaveTextContent("CO₂e");
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
      expect(text).not.toContain("reporting_sector");
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
