import "@testing-library/jest-dom/vitest";
/**
 * The reactive deck: the cards re-write themselves from the shared selection.
 *
 *  · each scope renders its own card set, in the selector's order (workspace/cards.ts);
 *  · changing the sector, the gas, the year, the level or the selected place through `setState`
 *    — the same state the filter panel, the chips and the map write — re-writes both which cards
 *    are shown and what each of them asks the server for;
 *  · a district shows the two cards the map drawer used to carry, with the release's own spatial
 *    evidence fields and its lineage;
 *  · a sector's IPCC categories asked at ADM grain carry the release's typed refusal by name —
 *    the card never falls back to another key;
 *  · a collapsed card issues no request at all;
 *  · the four audits (every decimal a server string, no "FY", no raw id, no avoid-list phrase)
 *    and the naming rule (the chrome never names the dataset).
 *
 * The deck is mounted on its own, not through the page, so the assertions are about the cards and
 * not about the workspace's frame (that is __tests__/workspace.test.tsx).
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import { useExplorer } from "@/components/ExplorerContext";
import { Deck } from "@/components/workspace/Deck";
import type { ExplorerState } from "@/lib/urlState";
import { RELEASE, envelope, mockFetch, refusal, stubWideViewport } from "./fixtures";
import { avoidPhrasesIn, namesDataset } from "./vocabulary";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
type Item = { id: string; name: string; label: string };
vi.mock("@/components/charts/BarsWithAxis", () => ({
  BarsWithAxis: ({ items, ticks, onSelect, testId = "bars-with-axis" }: { items: Item[]; ticks?: string[] | null; onSelect?: (id: string) => void; testId?: string }) => (
    <div data-testid={testId} data-ticks={(ticks ?? []).join("|")}>
      {(ticks ?? []).map((t, i) => (
        <span key={i} data-testid="axis-tick">{t}</span>
      ))}
      {items.map((i) => (
        <button key={i.id} type="button" data-testid="bar-item" data-id={i.id} onClick={() => onSelect?.(i.id)}>
          {i.name} {i.label}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("@/components/charts/ColumnChart", () => ({
  ColumnChart: ({ points, ticks }: { points: Item[]; ticks?: string[] | null }) => (
    <div data-testid="column-chart" data-ticks={(ticks ?? []).join("|")}>
      {(ticks ?? []).map((t, i) => (
        <span key={i} data-testid="axis-tick">{t}</span>
      ))}
      {points.map((p) => (
        <span key={p.id} data-testid="column">{p.name} {p.label}</span>
      ))}
    </div>
  ),
}));

const SHAPE = "60131773B12131197496886"; // the fixture's one ADM2 shape: Lahore, in Punjab
const U = { unit_short: "Mt CO₂e", unit_words: "million tonnes CO₂e" };
const AXIS = { ticks_short: ["0", "50", "100", "150", "200", "250"], unit_short: "Mt CO₂e" };
const SERIES_AXIS = { ticks_short: ["0", "100", "200", "300", "400", "500"], unit_short: "Mt CO₂e" };

const NATIONAL = [{ display: "452.34662", display_short: "452.35", ...U }];
const POWER = [{ display: "63.370", display_short: "63.37", ...U }];
const METHANE = [{ display: "248.748", display_short: "248.75", ...U }];
const SECTORS = [
  { display: "223.454", display_short: "223.45", ...U, group: { reporting_sector: "agriculture" }, extra: { share_pct_short: "49.4", share_phrase: "nearly half", rank: 1 } },
  { display: "63.370", display_short: "63.37", ...U, group: { reporting_sector: "power" }, extra: { share_pct_short: "14.0", share_phrase: "about a tenth", rank: 2 } },
];
const CATEGORIES = [
  { display: "151.658", display_short: "151.66", ...U, group: { category: "Enteric fermentation" }, extra: { share_pct_short: "67.9", share_phrase: "most", rank: 1 } },
  { display: "28.526", display_short: "28.53", ...U, group: { category: "Managed soils" }, extra: { share_pct_short: "12.8", share_phrase: "about a tenth", rank: 2 } },
];
const GASES = [
  { display: "248.748", display_short: "248.75", ...U, group: { gas: "CH4" }, extra: { share_pct_short: "55.0", share_phrase: "over half", rank: 1 } },
  { display: "161.456", display_short: "161.46", ...U, group: { gas: "CO2" }, extra: { share_pct_short: "35.7", share_phrase: "about a third", rank: 2 } },
];
const PROVINCES = [
  { display: "228.7168", display_short: "228.72", ...U, group: { province: "Punjab" }, extra: { share_pct_short: "50.6", share_phrase: "nearly half", rank: 1, unallocated_short: "4.84" } },
  { display: "134.7255", display_short: "134.73", ...U, group: { province: "Sindh" }, extra: { share_pct_short: "29.8", share_phrase: "about a quarter", rank: 2, unallocated_short: "3.45" } },
];
const DERIVED_PK = { unallocated_total_short: "9.01", placed_short: "443.34" };
const DERIVED_PB = { unallocated_total_short: "4.84", placed_short: "223.88", unallocated_by_province_short: { Punjab: "4.84" } };
const PUNJAB = [{ display: "228.7168", display_short: "228.72", ...U, group: { province: "Punjab" }, extra: { unallocated_short: "4.84" } }];
const PUNJAB_MODULES = [
  { display: "123.301", display_short: "123.30", ...U, group: { reporting_sector: "agriculture" }, extra: { share_pct_short: "53.9", rank: 1 } },
  { display: "17.990", display_short: "17.99", ...U, group: { reporting_sector: "power" }, extra: { share_pct_short: "7.9", rank: 2 } },
];
const DISTRICT = [
  {
    display: "[14.2983, 14.3156]",
    display_short: "[14.30, 14.32]",
    ...U,
    exactness: "exact;bounded_mixed_ch4_origin",
    exact_high: "14.3156",
    group: { shape_id: SHAPE },
    extra: {
      interpretation: "an interval: the module mixes fossil and biogenic methane at the published grain",
      allocation_status: "one_to_one",
      spatial_class: "S1",
      placement_class: "point_partial",
      allocation_surface: "grid_station_points",
      dominant_stream: "power|electricity-and-heat-production|coal-co2|co2",
      spatial_class_basis: "the any-gas stream with the largest reference-year mass in power",
    },
  },
];
const DISTRICT_MODULES = [
  { display: "2.850", display_short: "2.85", ...U, group: { reporting_sector: "agriculture" } },
  { display: "0.950", display_short: "0.95", ...U, group: { reporting_sector: "transport" } },
];
const DISTRICTS = [{ display: "[14.2983, 14.3156]", display_short: "[14.30, 14.32]", ...U, group: { shape_id: SHAPE } }];
const LINEAGE = [
  { display: "2.850", display_short: "2.85", ...U, group: { module: "agriculture" }, extra: { allocation_status: "one_to_one", absence_reason: "", exactness: "exact" } },
  { display: "0.950", display_short: "0.95", ...U, group: { module: "transport" }, extra: { allocation_status: "shared_shape", absence_reason: "no_native_geometry", exactness: "exact" } },
];
const SERIES = [
  { display: "372.397", display_short: "372.40", ...U, group: { period_id: "FY2020-21" } },
  { display: "452.347", display_short: "452.35", ...U, group: { period_id: "FY2023-24" } },
];
const CHANGE = { from_period: "FY2020-21", to_period: "FY2023-24", from_short: "372.40", to_short: "452.35", change_short: "+79.95", change_pct_short: "+21.5", direction: "rose", unit_short: "Mt CO₂e" };
const SERIES_REFUSAL = refusal("grain_unavailable", "GrainUnavailable", "spatial products exist for 2023–24 only", "grid_not_tabular");
const CATEGORY_REFUSAL = refusal("grain_unavailable", "GrainUnavailable", "'category' is not a column the release carries at province grain; available at national grain", "grain_unavailable");
const SPATIAL_REFUSAL = refusal("grain_unavailable", "GrainUnavailable", "spatial products exist for 2023–24 only", "grid_not_tabular");

const posts: { url: string; body: Record<string, unknown> | undefined }[] = [];

beforeEach(() => {
  posts.length = 0;
  stubWideViewport();
  vi.stubGlobal(
    "fetch",
    mockFetch((url, body) => {
      posts.push({ url, body });
      if (url.endsWith("/release")) return RELEASE;
      if (url.endsWith("/openapi.json")) return { paths: {}, components: { schemas: { QueryEmissions: { properties: {} }, GridCellRequest: { properties: { gas: { default: "CO2" } } } } } };
      if (url.includes("/tiles/")) return { raster: undefined, adm1: {}, adm2: {} };
      if (url.includes("/spatial/lineage/")) return envelope(LINEAGE, { request_type: "get_spatial_lineage" });
      if (url.includes("/timeseries")) {
        // the release answers the annual series at every grain (fact_adm1_year / fact_adm2_year, AR5);
        // the one typed refusal left is a district under AR6
        const q = (body as { query?: { geography_level?: string; gwp_basis?: string } } | undefined)?.query;
        if (q?.geography_level === "adm2" && q?.gwp_basis === "AR6") return SERIES_REFUSAL;
        return envelope(SERIES, { request_type: "get_timeseries", axis: SERIES_AXIS, change: CHANGE });
      }
      const b = body ?? {};
      const off = Array.isArray(b.periods) && b.periods[0] !== "FY2023-24";
      const level = String(b.geography_level ?? "");
      const group = (b.group_by ?? []) as string[];
      if (off && level) return SPATIAL_REFUSAL;
      if (group.includes("category")) return level ? CATEGORY_REFUSAL : envelope(CATEGORIES, { axis: AXIS, partition: { n: 2 } });
      // rc54: national and place breakdowns ask the SAME key (the reporting sector), so the
      // scope is what tells them apart - it is the geography, not the group key, that differs
      if (group.includes("reporting_sector")) {
        if (level === "adm2") return envelope(DISTRICT_MODULES, { axis: AXIS });
        if (level === "adm1") return envelope(PUNJAB_MODULES, { axis: AXIS, partition: { n: 2 } });
        return envelope(SECTORS, { axis: AXIS, partition: { n: 2 } });
      }
      if (group.includes("gas")) return envelope(GASES, { axis: AXIS, partition: { n: 2 } });
      if (group.includes("province")) return envelope(PROVINCES, { axis: AXIS, partition: { n: 2 }, derived: DERIVED_PK });
      if (group.includes("shape_id")) return envelope(DISTRICTS, { axis: AXIS });
      const ids = (b.geography_ids ?? []) as string[];
      if (ids.includes(SHAPE)) return envelope(DISTRICT, { axis: AXIS });
      if (ids.includes("Punjab")) return envelope(PUNJAB, { derived: DERIVED_PB });
      if ((b.reporting_sectors as string[] | undefined)?.length) return envelope(POWER);
      if ((b.gases as string[] | undefined)?.length) return envelope(METHANE);
      return envelope(NATIONAL);
    }),
  );
});

let patch: (p: Partial<ExplorerState>) => void = () => {};
function Capture() {
  patch = useExplorer().setState;
  return null;
}

function mount(search = "") {
  const Wrapper = withNuqsTestingAdapter({ searchParams: search, hasMemory: true });
  return render(
    <Wrapper>
      <Providers>
        <ExplorerProvider>
          <Capture />
          <Deck onGeo={() => {}} onReset={() => {}} />
        </ExplorerProvider>
      </Providers>
    </Wrapper>,
  );
}

/** The card ids the deck is showing, in order. */
function shownCards(): string[] {
  return screen
    .getAllByTestId(/^card-[a-z]+$/)
    .map((el) => (el.getAttribute("data-testid") ?? "").replace("card-", ""));
}
const set = (search = "") => mount(search);
async function ready() {
  // every scope opens with the overview panel
  await screen.findByTestId("card-overview-sentence");
}

describe("the deck's card set follows the scope", () => {
  it("Pakistan, all sectors, all gases: the total, where it comes from, how it changed, where it is placed", async () => {
    set();
    await ready();
    expect(shownCards()).toEqual(["overview", "sectors", "places"]);
    expect(screen.getByTestId("deck")).toHaveAttribute("data-scope", "national");
    expect(screen.getByTestId("card-overview")).toHaveTextContent("National overview");
    expect(screen.getByTestId("overview-display")).toHaveTextContent("452.35");
    // the share-rank chip is gone; the sentence itself carries the share
    expect(screen.queryByTestId("overview-chip")).toBeNull();
    expect(screen.getByTestId("card-overview-sentence")).toHaveTextContent("49.4 %");
    // the panel folds the trend in: the rail and the series live inside it
    expect(screen.getByTestId("year-rail")).toBeInTheDocument();
    expect(screen.getByTestId("overview-series")).toBeInTheDocument();
    expect(screen.getByTestId("card-sectors")).toHaveTextContent("Emission sources");
    expect(screen.getByTestId("card-places")).toHaveTextContent("Spatial distribution");
    expect(await screen.findByTestId("card-places-sentence")).toHaveTextContent("Punjab carried 228.72 Mt of the allocated total — 50.6 %, the largest provincial share.");
  });
  it("a sector chosen: the same panel against the national partition (figure, rail, series), its categories, its provincial split", async () => {
    set("?sector=power");
    await ready();
    expect(shownCards()).toEqual(["overview", "categories", "places"]);
    expect(screen.getByTestId("card-overview")).toHaveTextContent("Sector overview");
    expect(screen.getByTestId("overview-display")).toHaveTextContent("63.37");
    // the share and the rank are the SERVER's, off the sector partition's own cell, in the sentence
    expect(screen.getByTestId("card-overview-sentence")).toHaveTextContent("That is 14.0 % of the national total — rank 2 of 2.");
    expect(screen.getByTestId("year-rail")).toBeInTheDocument();
    expect(screen.getByTestId("overview-series")).toBeInTheDocument();
    expect(screen.getByTestId("card-categories")).toHaveTextContent("Category breakdown");
    expect(await screen.findByTestId("card-categories-sentence")).toHaveTextContent("enteric fermentation was the largest source of emissions, contributing 151.66 Mt");
  });
  it("a gas chosen: its total, which sectors emit it, how it changed — and no placement card", async () => {
    set("?gas=CH4");
    await ready();
    expect(shownCards()).toEqual(["overview", "sectors"]);
    expect(screen.getByTestId("card-overview")).toHaveTextContent("Gas overview");
    expect(screen.getByTestId("overview-display")).toHaveTextContent("248.75");
    expect(screen.queryByTestId("overview-chip")).toBeNull();
    expect(screen.getByTestId("card-overview-sentence")).toHaveTextContent("That is 55.0 % of the national total — rank 1 of 2.");
    expect(screen.getByTestId("card-sectors")).toHaveTextContent("Contributing sectors");
  });
  it("a province selected: the same panel - its total with the province partition's share and rank, the rail and the nine-year series - its modules, the provinces ranked, what it retains", async () => {
    set("?geo=Punjab");
    await ready();
    expect(shownCards()).toEqual(["overview", "composition", "peers", "placement"]);
    expect(screen.getByTestId("card-overview")).toHaveTextContent("Province overview");
    expect(screen.getByTestId("card-overview-sentence")).toHaveTextContent("In 2023–24, Punjab's allocated emissions were 228.72 Mt CO₂e. That is 50.6 % of the national allocated total — rank 1 of 2.");
    // the nine-year composition the country shows, for the province: the rail and the series
    // (the series asked at ADM1 for Punjab, the change sentence the server's)
    expect(screen.getByTestId("year-rail")).toBeInTheDocument();
    expect(screen.getByTestId("overview-series")).toBeInTheDocument();
    expect(await screen.findByTestId("overview-change")).toHaveTextContent("By 2023–24, emissions had risen to 452.35 Mt CO₂e");
    const series = posts.filter((p) => p.url.includes("/timeseries"));
    expect(series.length).toBeGreaterThan(0);
    expect((series[series.length - 1].body?.query as { geography_level?: string; geography_ids?: string[] }).geography_level).toBe("adm1");
    expect((series[series.length - 1].body?.query as { geography_ids?: string[] }).geography_ids).toEqual(["Punjab"]);
    expect(screen.queryByTestId("snapshot-chip")).toBeNull();
    expect(await screen.findByTestId("card-composition-sentence")).toHaveTextContent("agriculture was the largest source of emissions, contributing 123.30 Mt");
    expect(await screen.findByTestId("card-peers-sentence")).toHaveTextContent("Punjab is 1 of 2 provinces, at 228.72 Mt (50.6 %).");
    expect(await screen.findByTestId("card-placement-sentence")).toHaveTextContent("Of Punjab's allocated total, 223.88 Mt CO₂e is placed at a finer grain and 4.84 Mt CO₂e is retained at province level");
    expect(within(screen.getByTestId("placement-rows")).getByText("4.84 Mt CO₂e")).toBeInTheDocument();
  });
  it("a district selected: its total, its modules, its peers within its own province, then evidence and sources", async () => {
    set(`?level=adm2&geo=${SHAPE}`);
    await ready();
    expect(shownCards()).toEqual(["overview", "composition", "peers", "evidence", "sources"]);
    expect(screen.getByTestId("deck")).toHaveAttribute("data-scope", "district");
    expect(screen.getByTestId("deck-header")).toHaveTextContent("EMISSIONS TRENDS");
    expect(screen.getByTestId("place-title")).toHaveTextContent("Lahore");
    expect(screen.getByTestId("card-overview")).toHaveTextContent("District overview");
    // the release bounds an ADM2 total: the panel prints its interval string and its badge, and no share
    expect(screen.getByTestId("overview-display")).toHaveTextContent("[14.30, 14.32]");
    expect(screen.getByTestId("card-overview-sentence")).not.toHaveTextContent("rank");
    // and the same rail and nine-year series, asked at ADM2 for the district
    expect(screen.getByTestId("year-rail")).toBeInTheDocument();
    expect(screen.getByTestId("overview-series")).toBeInTheDocument();
    const series = posts.filter((p) => p.url.includes("/timeseries"));
    expect((series[series.length - 1].body?.query as { geography_level?: string }).geography_level).toBe("adm2");
    expect(await screen.findByTestId("card-composition-sentence")).toHaveTextContent("agriculture was the largest source of emissions, contributing 2.85 Mt");
    expect(await screen.findByTestId("card-peers-sentence")).toHaveTextContent("Lahore is one of 1 districts in the same province");
  });
});

describe("the district's evidence and sources", () => {
  it("the release's own spatial fields for the shape, the lineage's allocation statuses, and the class definitions", async () => {
    set(`?level=adm2&geo=${SHAPE}`);
    await ready();
    const fields = await screen.findByTestId("evidence-fields");
    expect(fields).toHaveTextContent("S1 — native source geometry");
    expect(fields).toHaveTextContent("the any-gas stream with the largest reference-year mass in power");
    expect(fields).toHaveTextContent("point partial on grid_station_points");
    expect(fields).toHaveTextContent("one-to-one");
    const lineage = await screen.findByTestId("evidence-lineage");
    await waitFor(() => expect(lineage).toHaveTextContent("shared shape"));
    expect(lineage).toHaveTextContent("no native geometry");
    expect(screen.getByTestId("class-definitions")).toHaveTextContent("S4");
    // and the sources card: the lineage rows, the provenance tables and the release
    expect(await screen.findByTestId("provenance")).toHaveTextContent("fact_annual");
    expect(screen.getByTestId("release-identity")).toHaveTextContent("Downloads");
  });
});

describe("the deck re-writes itself from the shared selection", () => {
  it("sector, gas, year, level and place, each through setState", async () => {
    set();
    await ready();
    expect(shownCards()).toEqual(["overview", "sectors", "places"]);

    await act(async () => void patch({ sector: "power" }));
    await waitFor(() => expect(shownCards()).toEqual(["overview", "categories", "places"]));
    await waitFor(() => expect(screen.getByTestId("overview-display")).toHaveTextContent("63.37"));

    await act(async () => void patch({ sector: null, gas: "CH4" }));
    await waitFor(() => expect(shownCards()).toEqual(["overview", "sectors"]));
    await waitFor(() => expect(screen.getByTestId("overview-display")).toHaveTextContent("248.75"));

    await act(async () => void patch({ gas: null, geo: "Punjab" }));
    await waitFor(() => expect(shownCards()).toEqual(["overview", "composition", "peers", "placement"]));
    await waitFor(() => expect(screen.getByTestId("place-title")).toHaveTextContent("Punjab"));

    await act(async () => void patch({ level: "adm2", geo: SHAPE }));
    await waitFor(() => expect(shownCards()).toEqual(["overview", "composition", "peers", "evidence", "sources"]));

    await act(async () => void patch({ level: "adm1", geo: null }));
    await waitFor(() => expect(shownCards()).toEqual(["overview", "sectors", "places"]));

    // the year is not part of the scope: the national cards stay, and the spatial one carries the
    // release's own refusal rather than an empty chart
    await act(async () => void patch({ period: "FY2020-21" }));
    await waitFor(() => expect(within(screen.getByTestId("card-places")).getByTestId("refusal-card")).toHaveTextContent("Refused: GrainUnavailable"));
    expect(shownCards()).toEqual(["overview", "sectors", "places"]);
    expect(within(screen.getByTestId("card-places")).getByTestId("refusal-card")).toHaveTextContent("spatial products exist for 2023–24 only");
    expect(screen.getByTestId("card-overview-sentence")).toHaveTextContent("452.35");
  });
  it("a sector's categories asked at ADM grain carry the release's typed refusal, never another key", async () => {
    set("?geo=Punjab&sector=power");
    await ready();
    // the place chooses the card set; the sector still chooses the KEY the server is asked for
    expect(shownCards()).toEqual(["overview", "composition", "peers", "placement"]);
    const refused = await within(screen.getByTestId("card-composition")).findByTestId("refusal-card");
    expect(refused).toHaveTextContent("Refused: GrainUnavailable");
    expect(refused).toHaveTextContent("'category' is not a column the release carries at province grain");
    expect(within(screen.getByTestId("card-composition")).queryByTestId("composition-bars")).toBeNull();
    // the request the deck sent asked for `category`, at the province's grain — no silent fallback
    const asked = posts.filter((p) => p.url.includes("/query/emissions") && ((p.body?.group_by as string[] | undefined) ?? []).includes("category"));
    expect(asked.length).toBeGreaterThan(0);
    expect(asked[asked.length - 1].body?.geography_level).toBe("adm1");
    // rc54: "module" is no longer a grouping any surface sends - one axis, at every grain
    expect(posts.some((p) => ((p.body?.group_by as string[] | undefined) ?? []).includes("module"))).toBe(false);
  });
});

describe("a place keeps the country's nine years", () => {
  it("clicking a rail tick in a province scope writes the period, and the place's own total is asked in that year", async () => {
    set("?geo=Punjab");
    await ready();
    const mark = posts.length;
    fireEvent.click(screen.getByTestId("rail-FY2020-21"));
    await waitFor(() => expect(posts.slice(mark).some((p) => p.url.includes("/query/emissions") && (p.body?.periods as string[] | undefined)?.[0] === "FY2020-21" && p.body?.geography_level === "adm1")).toBe(true));
    // the rail stays, the series stays: the panel is the same composition off the reference year
    expect(screen.getByTestId("year-rail")).toBeInTheDocument();
    expect(screen.getByTestId("overview-series")).toBeInTheDocument();
  });
  it("a district under AR6 shows the release's typed refusal inside the series block, never a blank", async () => {
    set(`?level=adm2&geo=${SHAPE}&gwp=AR6`);
    await ready();
    const refused = await within(screen.getByTestId("overview-series")).findByTestId("refusal-card");
    expect(refused).toHaveTextContent("Refused: GrainUnavailable");
    expect(screen.getByTestId("year-rail")).toBeInTheDocument();
  });
});

describe("a collapsed card asks for nothing", () => {
  it("collapsing every card stops the deck's queries; expanding brings them back", async () => {
    set();
    await ready();
    const queries = () => posts.filter((p) => p.url.includes("/query/")).length;
    fireEvent.click(screen.getByTestId("deck-collapse-all"));
    for (const id of ["overview", "sectors", "places"]) expect(screen.queryByTestId(`card-${id}-sentence`), id).toBeNull();
    const before = queries();
    await act(async () => void patch({ period: "FY2020-21" }));
    expect(queries()).toBe(before);
    // one card back open, and its own envelope — and only its own — is asked for, in the new year
    const mark = posts.length;
    fireEvent.click(screen.getByTestId("card-places-switch"));
    await waitFor(() => expect(queries()).toBeGreaterThan(before));
    const asked = posts.slice(mark).filter((p) => p.url.includes("/query/"));
    expect(asked).toHaveLength(1);
    expect(asked[0].url).toContain("/query/emissions");
    expect(asked[0].body?.periods).toEqual(["FY2020-21"]);
    expect(asked[0].body?.geography_level).toBe("adm1");
  });
});

describe("the deck's audits", () => {
  it("every decimal is a server string; no FY; no raw id; no avoid-list phrase; the chrome never names the dataset", async () => {
    set();
    await ready();
    await screen.findByTestId("card-places-sentence");
    const allowed = new Set<string>();
    const add = (s: string) => (s.match(/\d+\.\d+/g) ?? []).forEach((t) => allowed.add(t));
    for (const c of [...NATIONAL, ...SECTORS, ...GASES, ...PROVINCES, ...SERIES]) add(JSON.stringify(c));
    for (const o of [AXIS, SERIES_AXIS, CHANGE, DERIVED_PK, RELEASE]) add(JSON.stringify(o));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const tokens: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) tokens.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
    expect(tokens.length).toBeGreaterThan(10);
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
    expect(namesDataset(text)).toBe(false);
    for (const el of Array.from(document.body.querySelectorAll("[title]"))) {
      expect(el.getAttribute("title") ?? "").not.toContain("FY");
      expect(el.getAttribute("title") ?? "").not.toContain("1.0.0rc");
    }
  });
  it("a district's cards keep the audits, intervals and lineage included", async () => {
    set(`?level=adm2&geo=${SHAPE}`);
    await ready();
    await screen.findByTestId("evidence-fields");
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("FY");
    expect(text).not.toContain("LULUCF");
    expect(text).not.toContain("Mt CO2e");
    expect(avoidPhrasesIn(text)).toEqual([]);
    expect(namesDataset(text)).toBe(false);
  });
});

describe("every card keeps the deck's affordances", () => {
  it("a card's header is its title and the switch alone: the toolbar icons were removed", async () => {
    set();
    await ready();
    // one family: every deck card wears the amber top edge, the warm hairline and the warm shadow
    for (const id of ["overview", "sectors", "places"]) {
      const card = screen.getByTestId(`card-${id}`);
      for (const c of ["border-t-brand-gold", "border-nav-line", "shadow-card", "bg-card"]) expect(card.className, `${id}: ${c}`).toContain(c);
    }
    for (const id of ["overview", "sectors", "places"]) {
      expect(screen.getByTestId(`card-${id}-switch`), id).toHaveAttribute("role", "switch");
      for (const tool of ["info", "download", "share", "claim"]) expect(screen.queryByTestId(`card-${id}-${tool}`), `${id}-${tool}`).toBeNull();
    }
  });
});
