import "@testing-library/jest-dom/vitest";
/**
 * The chips, the legend's scope line and the Explore panel's selects print the release's
 * labels ("Reference estimate", "IPCC 2013 (AR5)"), never the raw ids; the ids stay as
 * secondary text in the Explore panel only.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { ScopeChips } from "./ScopeChips";
import { Legend } from "./Legend";
import { ExplorePanel } from "@/components/panels/ExplorePanel";
import { RELEASE } from "@/__tests__/fixtures";
import { scopeWords, sectorWords } from "@/lib/labels";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, panel: null, ask: false, c: null, cam: null, raster: false, view3d: false };

function ctx(state: ExplorerState): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState: vi.fn(), release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: { gwp: ["AR5", "AR6"], geographyLevel: [], spatialView: [], basis: [], configuration: [], routes: [], gridGas: "CO2", gridAnnual: "annual" }, agent: { enabled: false, model: "", reason: "not mounted" }, isMobile: false };
}
function mount(node: React.ReactNode, state: ExplorerState = base) {
  return render(<ExplorerContext.Provider value={ctx(state)}>{node}</ExplorerContext.Provider>);
}

describe("ScopeChips", () => {
  it("reads '2023–24 · Reference estimate · IPCC 2013 (AR5) · All sectors' with the notes as titles", () => {
    mount(<ScopeChips />);
    const chips = screen.getAllByTestId("scope-chip").map((c) => ({ text: c.textContent, title: c.getAttribute("title") }));
    expect(chips.map((c) => c.text)).toEqual(["2023–24", "Reference estimate", "IPCC 2013 (AR5)", "All sectors"]);
    expect(chips[1].title).toBe("every axis at its reference setting; residential dung on the ledger basis (L)");
    expect(chips[2].title).toContain("Fifth Assessment Report");
    expect(screen.getByTestId("scope-chips").textContent).not.toMatch(/\bL\b/);
  });
  it("the survey configuration and AR6", () => {
    mount(<ScopeChips />, { ...base, config: "S_2023_24", gwp: "AR6" });
    const chips = screen.getAllByTestId("scope-chip").map((c) => c.textContent);
    expect(chips).toEqual(["2023–24", "Survey-based estimate", "IPCC 2021 (AR6)", "All sectors"]);
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
