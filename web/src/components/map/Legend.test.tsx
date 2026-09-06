import "@testing-library/jest-dom/vitest";
/**
 * The filter panel's controls, the Map page's legend scope line (Legend, the magnitude panel
 * LayerLegend composes; the /data canvas's map carries the opacity pill instead) and the
 * Explore panel's selects print the release's labels ("Reference estimate", "IPCC 2013 (AR5)"),
 * never the raw ids; the ids stay as secondary text in the Explore panel only. Map settings has
 * its own file (components/workspace/MapSettings.test.tsx).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { FilterPanel } from "@/components/workspace/FilterPanel";
import { Legend } from "./Legend";
import { ExplorePanel } from "@/components/panels/ExplorePanel";
import { RELEASE } from "@/__tests__/fixtures";
import { scopeWords, sectorWords } from "@/lib/labels";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, pol: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, tab: "summary", layer: "magnitude", scale: "relative", pane: "map", c: null, cam: null, raster: false, view3d: false };

function ctx(state: ExplorerState): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState: vi.fn(), release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: { gwp: ["AR5", "AR6"], geographyLevel: [], spatialView: [], basis: [], configuration: [], routes: [], gridGas: "CO2", gridAnnual: "annual" }, agent: { enabled: false, model: "", reason: "not mounted" }, isMobile: false };
}
function mount(node: React.ReactNode, state: ExplorerState = base) {
  return render(
    <Providers>
      <ExplorerContext.Provider value={ctx(state)}>{node}</ExplorerContext.Provider>
    </Providers>,
  );
}

describe("FilterPanel", () => {
  it("the controls that drive both the deck and the map: the level, the sector, the gas and the year, in the release's own words", () => {
    mount(<FilterPanel open onToggle={() => {}} place="Pakistan" />);
    expect(screen.getByTestId("year-value")).toHaveTextContent("2023–24");
    const sector = screen.getByTestId("sector-select") as HTMLSelectElement;
    expect(sector.options[sector.selectedIndex].textContent).toBe("All sectors");
    const gas = screen.getByTestId("gas-select") as HTMLSelectElement;
    expect(gas.options[gas.selectedIndex].textContent).toBe("All gases (CO₂e)");
    expect(screen.getByTestId("level-adm1")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("level-adm1").className).toContain("bg-accent");
    expect(screen.getByTestId("level-adm2")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("active-view")).toHaveTextContent("Pakistan · All sectors · CO₂e · 2023–24");
    expect(screen.getByTestId("filter-panel").textContent).not.toContain("FY");
    expect(screen.getByTestId("filter-panel").textContent).not.toContain("REF_2023_24");
    // the estimate, the warming potentials, the spatial view and the raster left for Map settings
    for (const id of ["config-select", "gwp-select", "view-select", "raster-toggle"]) expect(screen.queryByTestId(id), id).toBeNull();
  });
  it("collapsed: a rail of icons that bring the panel back", () => {
    mount(<FilterPanel open={false} onToggle={() => {}} place="Pakistan" />);
    expect(screen.getByTestId("filter-panel")).toHaveAttribute("data-open", "0");
    for (const id of ["filters-expand", "rail-level", "rail-sector", "rail-gas"]) expect(screen.getByTestId(id), id).toBeTruthy();
    expect(screen.queryByTestId("year-range")).toBeNull();
  });
});

describe("Legend scope line", () => {
  it("'Provinces · 2023–24 · reference estimate · all sectors' at the default basis; the AR6 basis is named when chosen", () => {
    const labels = releaseLabels(RELEASE as unknown as ReleaseInfo);
    const scope = ["Provinces", scopeWords(labels, base, "AR5", sectorWords(labels, null))].join(" · ");
    expect(scope).toBe("Provinces · 2023–24 · reference estimate · all sectors");
    mount(<Legend state={base} scope={scope} env={null} index={null} error={null} isLoading={false} raster={undefined} rasterOn={false} hasCells={false} />);
    expect(screen.getByTestId("legend")).toHaveTextContent("Provinces · 2023–24 · reference estimate · all sectors");
    expect(["Provinces", scopeWords(labels, { ...base, gwp: "AR6" }, "AR5", sectorWords(labels, null))].join(" · ")).toBe("Provinces · 2023–24 · reference estimate · IPCC 2021 (AR6) · all sectors");
  });
});

describe("ExplorePanel", () => {
  it("the estimate select and the warming-potential buttons carry the labels, with the raw id as secondary text", () => {
    mount(<ExplorePanel />);
    const select = screen.getByTestId("config-select") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Reference estimate · REF_2023_24", "Survey-based estimate · S_2023_24"]);
    expect(select.getAttribute("title")).toContain("every axis at its reference setting");
    const buttons = Array.from(screen.getByTestId("gwp-select").querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toEqual(["IPCC 2013 (AR5)", "IPCC 2021 (AR6)"]);
    expect(buttons[1].getAttribute("title")).toContain("Sixth Assessment Report");
    expect(screen.getByTestId("explore-panel")).toHaveTextContent("Fifth Assessment Report");
  });
});
