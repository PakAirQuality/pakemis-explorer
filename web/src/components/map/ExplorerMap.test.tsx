import "@testing-library/jest-dom/vitest";
/**
 * The map's three variants and the chrome each carries. `briefing` (the /data canvas) keeps the
 * bottom-left opacity pill in the legend's place — the pill that used to be map/OpacityPill.tsx,
 * which retired into the workspace's Map settings — and no legend list, no scope line, no unit
 * row; the slider's number is the input's own integer. `console` keeps the full LayerLegend and
 * has no pill. `workspace` carries no chrome of its own at all: the legend capsule, the map
 * buttons and Map settings are the workspace's, and the URL's `layer` reaches the map there as
 * it does on the console. No WebGL in jsdom and no token: the map itself is not created.
 *
 * The map's DATA is asked for all the same, and the last block holds it to one rule: a page that
 * hands the map its own request (`request`) gets that request asked ONCE for both of them, under
 * the page's query key, and a map handed nothing builds the body it always built.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { Providers } from "@/components/Providers";
import { Canvas } from "@/components/explore/Canvas";
import { visibleEnvelope } from "@/components/explore/Explore";
import type { QueryAir, QueryEmissions } from "@/lib/api";
import { buildQuery, resolveExplore, type ExploreContext, type QueryPlan } from "@/lib/explore/query";
import { useAir, useEmissions } from "@/lib/queries";
import { releaseDims, releaseLabels } from "@/lib/release";
import { adm1Body, adm2Body, airMapBody } from "@/lib/requests";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { RELEASE, envelope, mockFetch } from "@/__tests__/fixtures";
import { ExplorerMap } from "./ExplorerMap";
import { OPACITY_DEFAULT } from "./layers";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("mapbox-gl", () => ({ default: { Map: class {}, AttributionControl: class {}, accessToken: "" } }));

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, pol: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, tab: "summary", layer: "magnitude", scale: "relative", pane: "map", c: null, cam: null, raster: false, view3d: false };

function ctx(state: ExplorerState): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState: vi.fn(), release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: { gwp: ["AR5", "AR6"], geographyLevel: [], spatialView: [], basis: [], configuration: [], routes: [], gridGas: "CO2", gridAnnual: "annual" }, agent: { enabled: false, model: "", reason: "not mounted", library: "", usable: false }, isMobile: false };
}
function mount(node: React.ReactNode, state: ExplorerState = base) {
  vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "");
  vi.stubGlobal("fetch", mockFetch((url) => (url.includes("/tiles") ? { raster: undefined } : envelope([{ display: "228.7168", display_short: "228.72", group: { province: "Punjab" } }]))));
  return render(
    <Providers>
      <ExplorerContext.Provider value={ctx(state)}>{node}</ExplorerContext.Provider>
    </Providers>,
  );
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ExplorerMap, briefing variant", () => {
  it("renders the opacity pill in the legend's place and no legend list; the slider moves the shown percent", async () => {
    mount(<ExplorerMap variant="briefing" />);
    const pill = await screen.findByTestId("opacity-pill");
    expect(pill).toHaveTextContent("Low");
    expect(pill).toHaveTextContent("High");
    expect(pill).toHaveTextContent("Opacity");
    expect(screen.getByTestId("pill-gradient").getAttribute("style")).toContain("linear-gradient(90deg");
    const range = screen.getByTestId("opacity-range") as HTMLInputElement;
    expect(range).toHaveAttribute("min", "0");
    expect(range).toHaveAttribute("max", "100");
    expect(range).toHaveAttribute("step", "5");
    expect(range.value).toBe(String(OPACITY_DEFAULT));
    expect(screen.getByTestId("opacity-value")).toHaveTextContent(`${OPACITY_DEFAULT}%`);
    expect(screen.queryByTestId("legend")).toBeNull();
    expect(screen.queryByTestId("layer-legend")).toBeNull();
    expect(screen.queryByTestId("legend-label")).toBeNull();
    expect(screen.queryByTestId("legend-gradient")).toBeNull();
    expect(screen.queryByTestId("context-pill")).toBeNull();
    expect(document.body.textContent).not.toContain("Result details");
    fireEvent.change(range, { target: { value: "55" } });
    expect(screen.getByTestId("opacity-value")).toHaveTextContent("55%");
    // nothing else: no numbers but the percent, no scope, no unit
    expect((screen.getByTestId("opacity-pill").textContent ?? "").match(/\d+/g)).toEqual(["55"]);
    expect(screen.getByTestId("basemap-notice")).toBeInTheDocument(); // no token in tests: the one-line notice, no map
  });
  it("the briefing map paints the magnitude choropleth whatever the URL's layer says", async () => {
    mount(<ExplorerMap variant="briefing" />, { ...base, layer: "evidence" });
    expect(await screen.findByTestId("explorer-map")).toHaveAttribute("data-layer", "magnitude");
  });
});

describe("ExplorerMap, console variant", () => {
  it("keeps the full legend and has no pill", async () => {
    mount(<ExplorerMap variant="console" />);
    expect(await screen.findByTestId("layer-legend")).toBeInTheDocument();
    expect(screen.queryByTestId("opacity-pill")).toBeNull();
  });
});

describe("ExplorerMap, workspace variant", () => {
  it("carries no chrome of its own — the workspace owns the legend, the buttons and Map settings", async () => {
    mount(<ExplorerMap variant="workspace" padding={{ top: 84, right: 376, bottom: 56, left: 456 }} opacity={60} />);
    await screen.findByTestId("explorer-map");
    for (const id of ["layer-legend", "legend", "opacity-pill", "layer-switch", "context-pill"]) expect(screen.queryByTestId(id), id).toBeNull();
  });
  it("paints the URL's layer, as the console does: Map settings' layer switch reaches the map", async () => {
    const { unmount } = mount(<ExplorerMap variant="workspace" />, { ...base, level: "adm2", layer: "method" });
    expect(await screen.findByTestId("explorer-map")).toHaveAttribute("data-layer", "method");
    unmount();
    mount(<ExplorerMap variant="workspace" />, { ...base, layer: "exceptions" });
    expect(await screen.findByTestId("explorer-map")).toHaveAttribute("data-layer", "exceptions");
  });
});

// --- the map's request --------------------------------------------------------------------------

/** Every body posted to a /query route so far, in order, with the route it went to. */
function posted(): { route: string; body: Record<string, unknown> }[] {
  const mock = vi.mocked(globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>);
  return mock.mock.calls
    .filter(([url, init]) => String(url).includes("/query/") && !!init?.body)
    .map(([url, init]) => ({ route: String(url).replace(/^.*(\/query\/[a-z]+).*$/, "$1"), body: JSON.parse(String(init!.body)) as Record<string, unknown> }));
}

/** A client of the test's own, so the cache can be read: which key holds the envelope, and how many are reading it. */
function mountWith(client: QueryClient, node: React.ReactNode, state: ExplorerState = base) {
  vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "");
  vi.stubGlobal("fetch", mockFetch((url, body) => (url.includes("/tiles") ? { raster: undefined } : envelope([{ display: "228.7168", display_short: "228.72", group: { [body?.group_by?.[0] ?? "province"]: "Punjab" } }], url.includes("/query/air") ? { request_type: "query_air" } : {}))));
  const wrap = (n: React.ReactNode) => (
    <QueryClientProvider client={client}>
      <ExplorerContext.Provider value={ctx(state)}>{n}</ExplorerContext.Provider>
    </QueryClientProvider>
  );
  const view = render(wrap(node));
  return { ...view, rerender: (n: React.ReactNode) => view.rerender(wrap(n)) };
}
/** No default staleTime: an observer that mounts on a settled query refetches it unless ITS options say the answer is fresh. */
const bareClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const settled = (client: QueryClient) => waitFor(() => expect(client.isFetching()).toBe(0));
/** The map's own queries (key "map"): present in the cache, but never asked while a request is handed in. */
const ownAsked = (client: QueryClient) => client.getQueryCache().findAll({ queryKey: ["map"] }).filter((q) => q.state.dataUpdatedAt > 0 || q.state.fetchStatus !== "idle" || q.state.errorUpdatedAt > 0);

const AIR_PLACES: QueryAir = { pollutants: ["PM2.5"], periods: ["FY2023-24"], geography_level: "adm1", group_by: ["province"], order_by: "value desc" };
const GHG_PLACES: QueryEmissions = { periods: ["FY2023-24"], configuration_id: "REF_2023_24", gwp_basis: "AR5", geography_level: "adm1", spatial_view: "all", group_by: ["province"], order_by: "value desc" };

describe("ExplorerMap, the request it asks", () => {
  it("handed nothing, it builds its own body as before: the province or district envelope of the state, a pollutant's when one is selected", async () => {
    const ghg = bareClient();
    const a = mountWith(ghg, <ExplorerMap variant="workspace" />);
    await settled(ghg);
    expect(posted()).toEqual([{ route: "/query/emissions", body: adm1Body(base) }]);
    expect(adm1Body(base)).not.toHaveProperty("order_by");
    expect(ghg.getQueryState(["map", adm1Body(base)])?.status).toBe("success");
    a.unmount();

    const air = bareClient();
    const state: ExplorerState = { ...base, pol: "PM2.5", sector: "residential", level: "adm2" };
    const b = mountWith(air, <ExplorerMap variant="workspace" />, state);
    await settled(air);
    expect(posted()).toEqual([{ route: "/query/air", body: { pollutants: ["PM2.5"], periods: ["FY2023-24"], sectors: ["residential"], geography_level: "adm2", group_by: ["shape_id"] } }]);
    expect(air.getQueryState(["map", airMapBody(state)])?.status).toBe("success");
    b.unmount();

    // the briefing map without a request (no page hands it one) is the same map: the override's selection, its own body
    const brief = bareClient();
    mountWith(brief, <ExplorerMap variant="briefing" override={{ level: "adm2", sector: "power" }} />);
    await settled(brief);
    expect(posted()).toEqual([{ route: "/query/emissions", body: adm2Body({ ...base, level: "adm2", sector: "power" }) }]);
  });
  it("handed a pollutant request, the briefing map posts exactly that body to the air route, once, and nothing of its own", async () => {
    const client = bareClient();
    mountWith(client, <ExplorerMap variant="briefing" override={{ level: "adm1", pol: "PM2.5", gas: null, geo: null }} request={{ kind: "air", body: AIR_PLACES }} />);
    await settled(client);
    expect(posted()).toEqual([{ route: "/query/air", body: AIR_PLACES }]);
    // under the page's key, not the map's: the envelope is the one a page's useAir reads
    expect(client.getQueryState(["air", AIR_PLACES])?.status).toBe("success");
    expect(ownAsked(client)).toEqual([]);
    expect(screen.getByTestId("explorer-map")).toHaveAttribute("data-layer", "magnitude");
    expect(screen.queryByTestId("briefing-refusal")).toBeNull();
  });
  it("handed a greenhouse request, likewise: the page's body with its order, on the emissions route, once", async () => {
    const client = bareClient();
    mountWith(client, <ExplorerMap variant="briefing" override={{ level: "adm1", geo: null }} request={{ kind: "emissions", body: GHG_PLACES }} />);
    await settled(client);
    expect(posted()).toEqual([{ route: "/query/emissions", body: GHG_PLACES }]);
    expect(client.getQueryState(["emissions", GHG_PLACES])?.status).toBe("success");
    expect(ownAsked(client)).toEqual([]);
  });
  it("the level is the handed request's: a district body puts the map at districts whatever the state says", async () => {
    const client = bareClient();
    const districts: QueryAir = { ...AIR_PLACES, geography_level: "adm2", group_by: ["shape_id"] };
    // the URL state and the override both say provinces; the request asks districts, and its cells are keyed by shape
    const view = mountWith(client, <ExplorerMap variant="briefing" override={{ level: "adm1", pol: "PM2.5" }} request={{ kind: "air", body: districts }} />);
    await settled(client);
    expect(posted()).toEqual([{ route: "/query/air", body: districts }]);
    expect(screen.getByTestId("breadcrumb-provinces")).toBeInTheDocument(); // shown at district level only
    view.rerender(<ExplorerMap variant="briefing" override={{ level: "adm2", pol: "PM2.5" }} request={{ kind: "air", body: AIR_PLACES }} />);
    await settled(client);
    expect(screen.queryByTestId("breadcrumb-provinces")).toBeNull();
    expect(posted().at(-1)).toEqual({ route: "/query/air", body: AIR_PLACES });
  });
  it("a page's hook and the map, sharing one body, cause exactly one fetch - whichever of them asks first", async () => {
    function Reader({ body }: { body: QueryAir }) {
      const q = useAir(body);
      return <div data-testid="reader" data-receipt={q.data?.receipt ?? ""} />;
    }
    const map = <ExplorerMap variant="briefing" override={{ level: "adm1", pol: "PM2.5" }} request={{ kind: "air", body: AIR_PLACES }} />;
    // together
    const together = bareClient();
    const a = mountWith(together, <><Reader body={AIR_PLACES} />{map}</>);
    await settled(together);
    expect(posted()).toEqual([{ route: "/query/air", body: AIR_PLACES }]);
    const shared = together.getQueryCache().find({ queryKey: ["air", AIR_PLACES] });
    expect(shared?.getObserversCount()).toBe(2); // the page's hook and the map's, on one cache entry
    expect(screen.getByTestId("reader").getAttribute("data-receipt")).toBe(shared?.state.data ? (shared.state.data as { receipt: string }).receipt : "missing");
    expect(ownAsked(together)).toEqual([]);
    a.unmount();
    // the page first, its answer already in hand when the reader chooses Map: the map mounts on a
    // settled query and must not ask again (it would, on any options but the hook's own)
    const later = bareClient();
    const b = mountWith(later, <Reader body={AIR_PLACES} />);
    await settled(later);
    expect(posted()).toHaveLength(1);
    b.rerender(<><Reader body={AIR_PLACES} />{map}</>);
    await screen.findByTestId("explorer-map");
    await settled(later);
    expect(posted()).toEqual([{ route: "/query/air", body: AIR_PLACES }]);
    expect(later.getQueryCache().find({ queryKey: ["air", AIR_PLACES] })?.getObserversCount()).toBe(2);
    // and a body that differs by its order alone is a different request - which is what the map used to send
    expect(airMapBody({ level: "adm1", pol: "PM2.5", period: "FY2023-24", sector: null })).toEqual({ ...AIR_PLACES, order_by: undefined });
  });
});

// --- the data page's canvas over the real map ---------------------------------------------------

const CTX: ExploreContext = { periods: ["FY2020-21", "FY2023-24"], referencePeriod: "FY2023-24", monthsOf: () => [], reference: "REF_2023_24", survey: "S_2023_24", surveyCovers: (p) => p === "FY2023-24" };

/** The canvas as the page mounts it: the plan's one query through the page's hook, the plan's filter applied, the Map representation. */
function Page({ url, geos }: { url: ExplorerState; geos: string }) {
  const state = resolveExplore(url, { by: "place", rep: "map", range: null, geos, cat: null, share: null }, CTX);
  const plan: QueryPlan = buildQuery(state, CTX);
  const air = useAir(plan.kind === "air" ? plan.body : null, plan.kind === "air");
  const ghg = useEmissions(plan.kind === "emissions" ? plan.body : null, plan.kind === "emissions");
  const q = plan.kind === "air" ? air : ghg;
  const release = RELEASE as unknown as ReleaseInfo;
  return <Canvas state={state} plan={plan} ctx={CTX} env={visibleEnvelope(q.data, plan)} error={q.error} isLoading={q.isLoading} labels={releaseLabels(release)} dims={releaseDims(release)} dispatch={() => {}} />;
}

describe("the data page's canvas and its map", () => {
  it("a pollutant by province: one request for the chart and the map, the plan's own", async () => {
    const client = bareClient();
    const url: ExplorerState = { ...base, pol: "PM2.5", sector: "residential", period: "FY2020-21" };
    mountWith(client, <Page url={url} geos="all" />, url);
    await screen.findByTestId("explorer-map");
    await settled(client);
    const body = { pollutants: ["PM2.5"], sectors: ["residential"], periods: ["FY2020-21"], geography_level: "adm1", group_by: ["province"], order_by: "value desc" };
    expect(posted()).toEqual([{ route: "/query/air", body }]);
    expect(client.getQueryCache().find({ queryKey: ["air", body] })?.getObserversCount()).toBe(2);
    expect(ownAsked(client)).toEqual([]);
    expect(screen.getByTestId("explorer-map")).toHaveAttribute("data-layer", "magnitude");
    expect(screen.queryByTestId("refusal-card")).toBeNull();
  });
  it("every district, and greenhouse gases: one request each, and the map at the grain the plan asked", async () => {
    const districts = bareClient();
    const url: ExplorerState = { ...base, pol: "NH3", level: "adm2" };
    const a = mountWith(districts, <Page url={url} geos="all" />, url);
    await screen.findByTestId("explorer-map");
    await settled(districts);
    expect(posted()).toEqual([{ route: "/query/air", body: { pollutants: ["NH3"], periods: ["FY2023-24"], geography_level: "adm2", group_by: ["shape_id"], order_by: "value desc" } }]);
    expect(screen.getByTestId("breadcrumb-provinces")).toBeInTheDocument();
    a.unmount();
    // two chosen provinces under greenhouse gases: the canvas keeps two cells, the map asks for (and is answered with) all of them
    const ghg = bareClient();
    mountWith(ghg, <Page url={base} geos="Punjab,Sindh" />);
    await screen.findByTestId("explorer-map");
    await settled(ghg);
    expect(posted()).toEqual([{ route: "/query/emissions", body: GHG_PLACES }]);
    expect(ghg.getQueryCache().find({ queryKey: ["emissions", GHG_PLACES] })?.getObserversCount()).toBe(2);
    expect(ownAsked(ghg)).toEqual([]);
  });
});
