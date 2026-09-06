import "@testing-library/jest-dom/vitest";
/**
 * Map settings, the workspace's bottom-right popover: the eight groups it holds, in order, and
 * what each one writes. The five with a URL key (map layer, scale, grid raster, month, estimate,
 * warming potentials, spatial view) write it through `setState` and nothing else; the three that
 * are chrome (opacity, basemap, boundaries) call the page's own setters and never touch the URL.
 * Every option's word is a release label, and the only number the panel prints is the opacity
 * slider's own integer percent.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { RELEASE } from "@/__tests__/fixtures";
import { avoidPhrasesIn, namesDataset } from "@/__tests__/vocabulary";
import type { BasemapChoice } from "@/components/map/basemap";
import { MapSettings } from "./MapSettings";
import { SETTINGS } from "./copy";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, pol: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, tab: "summary", layer: "magnitude", scale: "relative", pane: "map", c: null, cam: null, raster: false, view3d: false };

function ctx(state: ExplorerState, setState: ExplorerContextValue["setState"]): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState, release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: { gwp: ["AR5", "AR6"], geographyLevel: [], spatialView: [], basis: [], configuration: [], routes: [], gridGas: "CO2", gridAnnual: "annual" }, agent: { enabled: false, model: "", reason: "not mounted" }, isMobile: false };
}

type Handlers = { onOpacity: (pct: number) => void; onBasemap: (c: BasemapChoice) => void; onBoundaries: (on: boolean) => void; setState: ExplorerContextValue["setState"] };

function mount(state: Partial<ExplorerState> = {}, chrome: { opacity?: number; basemap?: "light" | "streets"; boundaries?: boolean } = {}) {
  const h = { onOpacity: vi.fn<(pct: number) => void>(), onBasemap: vi.fn<(c: BasemapChoice) => void>(), onBoundaries: vi.fn<(on: boolean) => void>(), setState: vi.fn<ExplorerContextValue["setState"]>() } satisfies Handlers;
  const r = render(
    <ExplorerContext.Provider value={ctx({ ...base, ...state }, h.setState)}>
      <MapSettings open onToggle={() => {}} opacity={chrome.opacity ?? 80} onOpacity={h.onOpacity} basemap={chrome.basemap ?? "light"} onBasemap={h.onBasemap} boundaries={chrome.boundaries ?? true} onBoundaries={h.onBoundaries} />
    </ExplorerContext.Provider>,
  );
  return { ...r, ...h };
}

describe("Map settings", () => {
  it("holds its groups in order: map layer, scale, opacity, grid raster, basemap, boundaries, month, then the three that left the filter panel", () => {
    mount();
    const panel = screen.getByTestId("map-settings-panel");
    const heads = Array.from(panel.querySelectorAll(".micro, label > span:first-child, label")).map((e) => (e.textContent ?? "").trim());
    const order = [SETTINGS.layer, SETTINGS.scale, SETTINGS.opacity, SETTINGS.raster, SETTINGS.basemap, SETTINGS.boundaries, SETTINGS.month, SETTINGS.estimate, SETTINGS.gwp, SETTINGS.view];
    const at = order.map((label) => heads.findIndex((h) => h.startsWith(label)));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("the map layer writes `layer` (and takes the level with it when the layer only paints there)", () => {
    const { setState } = mount();
    fireEvent.click(screen.getByTestId("layer-exceptions"));
    expect(setState).toHaveBeenCalledWith({ layer: "exceptions" });
    fireEvent.click(screen.getByTestId("layer-evidence"));
    expect(setState).toHaveBeenCalledWith({ layer: "evidence", level: "adm2" });
  });

  it("the scale writes `scale`, one option per mode, each with its own line, the current one checked", () => {
    const { setState } = mount({ scale: "relative" });
    expect(screen.getByTestId("scale-relative")).toHaveAttribute("aria-checked", "true");
    for (const mode of ["fixed", "absolute"] as const) {
      expect(screen.getByTestId(`scale-${mode}`)).toHaveAttribute("aria-checked", "false");
      fireEvent.click(screen.getByTestId(`scale-${mode}`));
      expect(setState).toHaveBeenCalledWith({ scale: mode });
    }
    // each option says what it does, and none of the three prints a number
    for (const mode of ["relative", "fixed", "absolute"] as const) {
      const text = screen.getByTestId(`scale-${mode}`).textContent ?? "";
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/\d/);
    }
  });

  it("the opacity and the boundaries are chrome: the page's setters, never the URL", () => {
    const { setState, onOpacity, onBoundaries } = mount({}, { opacity: 80, boundaries: true });
    const range = screen.getByTestId("opacity-range") as HTMLInputElement;
    expect(range.value).toBe("80");
    expect(screen.getByTestId("opacity-value")).toHaveTextContent("80%");
    fireEvent.change(range, { target: { value: "45" } });
    expect(onOpacity).toHaveBeenCalledWith(45);
    const box = screen.getByTestId("boundaries-toggle") as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(onBoundaries).toHaveBeenCalledWith(false);
    expect(setState).not.toHaveBeenCalled();
  });

  it("the basemap is chrome too: Light and Streets, the current one selected, the page's setter", () => {
    const { setState, onBasemap } = mount({}, { basemap: "light" });
    const group = screen.getByTestId("basemap-select");
    expect(Array.from(group.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Light", "Streets"]);
    expect(screen.getByTestId("basemap-light")).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByTestId("basemap-streets"));
    expect(onBasemap).toHaveBeenCalledWith("streets");
    expect(setState).not.toHaveBeenCalled();
  });

  it("the grid raster writes `raster`", () => {
    const { setState } = mount({ raster: false });
    fireEvent.click(screen.getByTestId("raster-toggle"));
    expect(setState).toHaveBeenCalledWith({ raster: true });
  });

  it("the month select writes `month` on the reference year and is absent on any other, where the release maps nothing", () => {
    const { setState, unmount } = mount();
    const month = screen.getByTestId("month-select") as HTMLSelectElement;
    expect(Array.from(month.options).map((o) => o.textContent)).toEqual([SETTINGS.monthAll, "Jul 2023", "Aug 2023"]);
    fireEvent.change(month, { target: { value: "202308" } });
    expect(setState).toHaveBeenCalledWith({ month: "202308" });
    fireEvent.change(month, { target: { value: "" } });
    expect(setState).toHaveBeenCalledWith({ month: null });
    unmount();
    mount({ period: "FY2020-21" });
    expect(screen.queryByTestId("month-select")).toBeNull();
  });

  it("the estimate, the warming potentials and the spatial view read their labels and write their keys", () => {
    const { setState, unmount } = mount();
    const config = screen.getByTestId("config-select") as HTMLSelectElement;
    expect(config.options[config.selectedIndex].textContent).toBe("Reference estimate");
    expect(config.getAttribute("title")).toBe("every axis at its reference setting; residential dung on the ledger basis (L)");
    fireEvent.change(config, { target: { value: "S_2023_24" } });
    expect(setState).toHaveBeenCalledWith({ config: "S_2023_24" });
    const buttons = Array.from(screen.getByTestId("gwp-select").querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toEqual(["IPCC 2013 (AR5)", "IPCC 2021 (AR6)"]);
    expect(buttons[0].getAttribute("title")).toContain("Fifth Assessment Report");
    fireEvent.click(buttons[1]);
    expect(setState).toHaveBeenCalledWith({ gwp: "AR6" });
    const view = screen.getByTestId("view-select") as HTMLSelectElement;
    fireEvent.change(view, { target: { value: "physical" } });
    expect(setState).toHaveBeenCalledWith({ view: "physical" });
    unmount();
    mount({ config: "S_2023_24", gwp: "AR6" });
    const survey = screen.getByTestId("config-select") as HTMLSelectElement;
    expect(survey.options[survey.selectedIndex].textContent).toBe("Survey-based estimate");
    expect(screen.getByTestId("gwp-select").querySelector('[aria-selected="true"]')).toHaveTextContent("IPCC 2021 (AR6)");
  });

  it("the audits: no raw id, no 'FY', no dataset name in the chrome, no avoid-list phrase, and no figure of its own", () => {
    mount({}, { opacity: 65 });
    const panel = screen.getByTestId("map-settings-panel");
    const text = panel.textContent ?? "";
    expect(text).not.toContain("REF_2023_24");
    expect(text).not.toContain("S_2023_24");
    expect(text).not.toContain("FY");
    expect(text).not.toMatch(/(^|[^A-Z0-9(])AR5(?![)\w])/);
    expect(namesDataset(text)).toBe(false);
    expect(avoidPhrasesIn(text)).toEqual([]);
    // every digit on the panel belongs to a release label (a month, a warming-potential edition)
    // or to the opacity slider's own integer; the panel derives no figure of its own
    expect(text).toContain("65%");
    expect(text).not.toMatch(/\d\.\d/);
    for (const el of Array.from(panel.querySelectorAll("[title]"))) expect(el.getAttribute("title") ?? "").not.toContain("FY");
  });
});
