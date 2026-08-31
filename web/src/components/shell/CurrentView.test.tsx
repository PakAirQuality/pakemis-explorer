import "@testing-library/jest-dom/vitest";
/**
 * The Current view bar: the line in the release's words (period short label, the place, the
 * configuration label, the LULUCF status; the GWP basis only when not the default; a sector
 * when chosen), the IPCC basis and LULUCF note as its tooltip, no raw id, and Change view
 * opening the ExplorePanel's controls in a popover that Escape closes.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseAgent, releaseDims, releaseLabels } from "@/lib/release";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { RELEASE } from "@/__tests__/fixtures";
import { CurrentView, currentViewWords } from "./CurrentView";

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, tab: "summary", layer: "magnitude", scale: "relative", pane: "map", c: null, cam: null, raster: false, view3d: false };
const defaults = { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" };

function ctx(state = base): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState: vi.fn(), release, labels: releaseLabels(release), dims: releaseDims(release), defaults, contract: undefined, agent: releaseAgent(release), isMobile: false };
}

describe("CurrentView", () => {
  it("reads '2023–24 · Pakistan · Reference estimate' with the basis as its tooltip and no raw id", () => {
    render(
      <ExplorerContext.Provider value={ctx()}>
        <CurrentView />
      </ExplorerContext.Provider>,
    );
    const line = screen.getByTestId("current-view-line");
    expect(line).toHaveTextContent("2023–24 · Pakistan · Reference estimate");
    expect(line.getAttribute("title")).toContain("IPCC 2013 (AR5): CO₂-equivalent using the IPCC Fifth Assessment Report");
    expect(line.getAttribute("title")).not.toContain("land use");   // the exclusion left the chrome on 2026-08-31
    const text = screen.getByTestId("current-view").textContent ?? "";
    expect(text).not.toContain("FY");
    expect(text).not.toMatch(/(^|[^A-Z0-9(])AR5(?![)\w])/);
    expect(text).not.toContain("REF_2023_24");
  });
  it("names the place, the basis when it is not the default, and a chosen sector, gas and month", () => {
    const c = ctx();
    const { words } = currentViewWords(c.labels, c.dims, { ...base, geo: "Punjab", gwp: "AR6", sector: "power", gas: "CH4", month: "202307" }, defaults);
    expect(words).toBe("2023–24 · Punjab · Reference estimate · IPCC 2021 (AR6) · Power · CH₄ · Jul 2023");
    const district = currentViewWords(c.labels, c.dims, { ...base, level: "adm2", geo: "60131773B12131197496886" }, defaults);
    expect(district.words).toContain("· Lahore ·");
  });
  it("Change view opens the ExplorePanel's controls and Escape closes them", () => {
    render(
      <ExplorerContext.Provider value={ctx()}>
        <CurrentView />
      </ExplorerContext.Provider>,
    );
    expect(screen.queryByTestId("change-view-popover")).toBeNull();
    fireEvent.click(screen.getByTestId("change-view"));
    expect(screen.getByTestId("change-view-popover")).toBeInTheDocument();
    expect(screen.getByTestId("explore-panel")).toBeInTheDocument();
    expect(screen.getByTestId("config-select")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("change-view-popover")).toBeNull();
  });
});
