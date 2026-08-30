import "@testing-library/jest-dom/vitest";
/**
 * The filter panel's controls, the Map page's legend scope line (Legend, the magnitude panel
 * LayerLegend composes; the Overview's map carries the opacity pill instead) and the Explore
 * panel's selects print the release's labels ("Reference estimate", "IPCC 2013 (AR5)"), never
 * the raw ids; the ids stay as secondary text in the Explore panel only.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { FilterPanel } from "./FilterPanel";
import { Legend } from "./Legend";
import { ExplorePanel } from "@/components/panels/ExplorePanel";
import { RELEASE } from "@/__tests__/fixtures";
import { scopeWords, sectorWords } from "@/lib/labels";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, tab: "summary", layer: "magnitude", c: null, cam: null, raster: false, view3d: false };

function ctx(state: ExplorerState): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState: vi.fn(), release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: { gwp: ["AR5", "AR6"], geographyLevel: [], spatialView: [], basis: [], configuration: [], routes: [], gridGas: "CO2", gridAnnual: "annual" }, agent: { enabled: false, model: "", reason: "not mounted" }, isMobile: false };
}
function mount(node: React.ReactNode, state: ExplorerState = base) {
  return render(<ExplorerContext.Provider value={ctx(state)}>{node}</ExplorerContext.Provider>);
}

describe("FilterPanel", () => {
  it("the selects read '2023–24', 'Reference estimate', 'All sectors' with the notes as titles; the warming potentials are spelled out", () => {
    mount(<FilterPanel open onToggle={() => {}} />);
    const period = screen.getByTestId("period-select") as HTMLSelectElement;
    expect(period.options[period.selectedIndex].textContent).toBe("2023–24");
    expect(screen.getByTestId("filter-period")).toHaveTextContent("July 2023 – June 2024");
    const config = screen.getByTestId("config-select") as HTMLSelectElement;
    expect(config.options[config.selectedIndex].textContent).toBe("Reference estimate");
    expect(config.getAttribute("title")).toBe("every axis at its reference setting; residential dung on the ledger basis (L)");
    const sector = screen.getByTestId("sector-select") as HTMLSelectElement;
    expect(sector.options[sector.selectedIndex].textContent).toBe("All sectors");
    const buttons = Array.from(screen.getByTestId("gwp-select").querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toEqual(["IPCC 2013 (AR5)", "IPCC 2021 (AR6)"]);
    expect(buttons[0].getAttribute("title")).toContain("Fifth Assessment Report");
    expect(screen.getByTestId("filter-panel").textContent).not.toContain("FY");
    expect(screen.getByTestId("filter-panel").textContent).not.toContain("REF_2023_24");
  });
  it("the survey configuration and AR6 are named by their labels", () => {
    mount(<FilterPanel open onToggle={() => {}} />, { ...base, config: "S_2023_24", gwp: "AR6" });
    const config = screen.getByTestId("config-select") as HTMLSelectElement;
    expect(config.options[config.selectedIndex].textContent).toBe("Survey-based estimate");
    expect(screen.getByTestId("gwp-select").querySelector('[aria-selected="true"]')).toHaveTextContent("IPCC 2021 (AR6)");
  });
  it("collapsed: a rail of one icon per section", () => {
    mount(<FilterPanel open={false} onToggle={() => {}} />);
    expect(screen.getByTestId("filter-rail")).toBeTruthy();
    for (const id of ["geography", "period", "sector", "gas", "estimate", "view"]) expect(screen.getByTestId(`rail-${id}`)).toBeTruthy();
    expect(screen.queryByTestId("period-select")).toBeNull();
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
