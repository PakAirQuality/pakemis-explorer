import "@testing-library/jest-dom/vitest";
/**
 * The briefing map's chrome: the bottom-left opacity pill (Low – gradient – High | Opacity
 * slider at 80 %) in the legend's place, no legend list, no scope line, no unit row; the
 * slider's number is the input's own integer. The console variant keeps the full LayerLegend
 * and has no pill. No WebGL in jsdom and no token: the map itself is not created.
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
import { OpacityPill, OPACITY_DEFAULT } from "./OpacityPill";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("mapbox-gl", () => ({ default: { Map: class {}, AttributionControl: class {}, accessToken: "" } }));

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, tab: "summary", layer: "magnitude", scale: "relative", c: null, cam: null, raster: false, view3d: false };

function ctx(state: ExplorerState): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState: vi.fn(), release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: { gwp: ["AR5", "AR6"], geographyLevel: [], spatialView: [], basis: [], configuration: [], routes: [], gridGas: "CO2", gridAnnual: "annual" }, agent: { enabled: false, model: "", reason: "not mounted" }, isMobile: false };
}
function mount(node: React.ReactNode) {
  vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "");
  vi.stubGlobal("fetch", mockFetch((url) => (url.includes("/tiles") ? { raster: undefined } : envelope([{ display: "228.7168", display_short: "228.72", group: { province: "Punjab" } }]))));
  return render(
    <Providers>
      <ExplorerContext.Provider value={ctx(base)}>{node}</ExplorerContext.Provider>
    </Providers>,
  );
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("OpacityPill", () => {
  it("Low, the gradient, High, a hairline, Opacity and the slider at 80 %; the number is the input's integer", () => {
    const onChange = vi.fn();
    render(<OpacityPill value={OPACITY_DEFAULT} onChange={onChange} />);
    const pill = screen.getByTestId("opacity-pill");
    expect(pill).toHaveTextContent("Low");
    expect(pill).toHaveTextContent("High");
    expect(pill).toHaveTextContent("Opacity");
    expect(pill.className).toContain("glass");
    expect(pill.className).toContain("rounded-xl");
    expect(screen.getByTestId("pill-gradient").getAttribute("style")).toContain("linear-gradient(90deg");
    const range = screen.getByTestId("opacity-range") as HTMLInputElement;
    expect(range).toHaveAttribute("min", "0");
    expect(range).toHaveAttribute("max", "100");
    expect(range).toHaveAttribute("step", "5");
    expect(range.value).toBe("80");
    expect(screen.getByTestId("opacity-value")).toHaveTextContent("80%");
    fireEvent.change(range, { target: { value: "45" } });
    expect(onChange).toHaveBeenCalledWith(45);
    // nothing else: no numbers but the percent, no scope, no unit
    expect((pill.textContent ?? "").match(/\d+/g)).toEqual(["80"]);
  });
});

describe("ExplorerMap, briefing variant", () => {
  it("renders the opacity pill in the legend's place and no legend list; the slider moves the shown percent", async () => {
    mount(<ExplorerMap variant="briefing" />);
    expect(await screen.findByTestId("opacity-pill")).toBeInTheDocument();
    expect(screen.queryByTestId("legend")).toBeNull();
    expect(screen.queryByTestId("layer-legend")).toBeNull();
    expect(screen.queryByTestId("legend-label")).toBeNull();
    expect(screen.queryByTestId("legend-gradient")).toBeNull();
    expect(screen.queryByTestId("context-pill")).toBeNull();
    expect(document.body.textContent).not.toContain("Result details");
    fireEvent.change(screen.getByTestId("opacity-range"), { target: { value: "55" } });
    expect(screen.getByTestId("opacity-value")).toHaveTextContent("55%");
    expect(screen.getByTestId("basemap-notice")).toBeInTheDocument(); // no token in tests: the one-line notice, no map
  });
  it("the console variant keeps the full legend and has no pill", async () => {
    mount(<ExplorerMap variant="console" />);
    expect(await screen.findByTestId("layer-legend")).toBeInTheDocument();
    expect(screen.queryByTestId("opacity-pill")).toBeNull();
  });
});
