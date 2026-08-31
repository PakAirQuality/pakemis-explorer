import "@testing-library/jest-dom/vitest";
/**
 * The map's three variants and the chrome each carries. `briefing` (the /data canvas) keeps the
 * bottom-left opacity pill in the legend's place — the pill that used to be map/OpacityPill.tsx,
 * which retired into the workspace's Map settings — and no legend list, no scope line, no unit
 * row; the slider's number is the input's own integer. `console` keeps the full LayerLegend and
 * has no pill. `workspace` carries no chrome of its own at all: the legend capsule, the map
 * buttons and Map settings are the workspace's, and the URL's `layer` reaches the map there as
 * it does on the console. No WebGL in jsdom and no token: the map itself is not created.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { Providers } from "@/components/Providers";
import { releaseDims, releaseLabels } from "@/lib/release";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { RELEASE, envelope, mockFetch } from "@/__tests__/fixtures";
import { ExplorerMap } from "./ExplorerMap";
import { OPACITY_DEFAULT } from "./layers";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("mapbox-gl", () => ({ default: { Map: class {}, AttributionControl: class {}, accessToken: "" } }));

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, tab: "summary", layer: "magnitude", scale: "relative", pane: "map", c: null, cam: null, raster: false, view3d: false };

function ctx(state: ExplorerState): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState: vi.fn(), release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: { gwp: ["AR5", "AR6"], geographyLevel: [], spatialView: [], basis: [], configuration: [], routes: [], gridGas: "CO2", gridAnnual: "annual" }, agent: { enabled: false, model: "", reason: "not mounted" }, isMobile: false };
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
