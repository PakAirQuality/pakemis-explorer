import "@testing-library/jest-dom/vitest";
/**
 * Every number the DetailCard renders is a mocked envelope's display (or an exact / coordinate
 * string received in the envelope): province, bounded district, grid cell.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import type { ReleaseInfo } from "@/lib/envelope";
import type { ExplorerState } from "@/lib/urlState";
import { DetailCard } from "./DetailCard";
import { RELEASE, envelope, mockFetch } from "@/__tests__/fixtures";

vi.mock("@/components/ui/BarChart", () => ({ BarChart: ({ env }: { env: { values: { display: string; display_short?: string }[] } }) => <div data-testid="bar-chart">{env.values.map((v) => v.display_short ?? v.display).join(" ")}</div> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const DISPLAYS = {
  provinceTotal: "228.7168",
  districtTotal: "[12.2565, 12.2769]",
  modules: ["123.3050", "17.9917", "[0.5865, 0.5866]"],
  gases: ["130.5538", "74.7121"],
  months: ["21.2696", "21.5418"],
  lineage: ["0.6421", "0.7643"],
  cell: "1.16181505",
};
/** The server's two-decimal renderings, where the mocked cells carry one (the rest fall back to display). */
const SHORTS = { provinceTotal: "228.72", districtTotal: "[12.26, 12.28]", module0: "123.31", cell: "1.16" };
const EXACTS = { unallocProvince: "4.837161474822386761", unallocModuleGas: "4.827234056166698500", cellExact: "1.1618150472640991" };
const COORDS = { lat: "24.925000000000004", lon: "67.075" };

const base: ExplorerState = { level: "adm1", period: "FY2023-24", month: null, sector: null, gas: null, config: "REF_2023_24", gwp: "AR5", view: "all", geo: null, cell: null, panel: null, ask: false, c: null, cam: null, raster: false, view3d: false };

function ctx(state: ExplorerState): ExplorerContextValue {
  const release = RELEASE as unknown as ReleaseInfo;
  return { state, setState: vi.fn(), release, labels: releaseLabels(release), dims: releaseDims(release), defaults: { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" }, contract: undefined, agent: { enabled: false, model: "", reason: "not mounted" }, isMobile: false };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    mockFetch((url, body) => {
      if (url.includes("/spatial/lineage/")) {
        return envelope(
          [
            { display: DISPLAYS.lineage[0], extra: { module: "agriculture", gas: "CH4", month: "202307", spatial_view: "physical", allocation_status: "one_to_one" } },
            { display: DISPLAYS.lineage[1], extra: { module: "power", gas: "CO2", month: "202307", spatial_view: "physical", allocation_status: "shared_shape" } },
          ],
          { request_type: "get_spatial_lineage", unallocated: { by_module_gas: [{ module: "industry", gas: "CO2", exact: EXACTS.unallocModuleGas }] } },
        );
      }
      if (url.includes("/spatial/grid")) {
        return envelope([{ display: DISPLAYS.cell, display_short: SHORTS.cell, unit: "Gg", extra: { lat: 24.925000000000004, lon: 67.075, row: 242, col: 124, month: "202401", exact: EXACTS.cellExact, formula: "cell value read from the cube" } }], { request_type: "get_grid_cell", limitations_hit: [{ id: "grid_not_tabular", message: "grid cells stay in the cube" }] });
      }
      const g = body?.group_by ?? [];
      if (g.includes("module")) return envelope([{ display: DISPLAYS.modules[0], display_short: SHORTS.module0, group: { module: "agriculture" } }, { display: DISPLAYS.modules[1], group: { module: "power" } }, { display: DISPLAYS.modules[2], group: { module: "residential" }, exactness: "bounded_mixed_ch4_origin;exact", exact_high: "0.5866" }]);
      if (g.includes("gas")) return envelope([{ display: DISPLAYS.gases[0], group: { gas: "CH4" } }, { display: DISPLAYS.gases[1], group: { gas: "CO2" } }]);
      if (g.includes("month")) return envelope([{ display: DISPLAYS.months[0], group: { month: "202307" } }, { display: DISPLAYS.months[1], group: { month: "202308" } }]);
      if (body?.geography_level === "adm2") return envelope([{ display: DISPLAYS.districtTotal, display_short: SHORTS.districtTotal, group: { shape_id: "60131773B12131197496886" }, exactness: "exact;bounded_mixed_ch4_origin", exact_high: "12.2769", extra: { interpretation: "an interval: the module mixes fossil and biogenic CH4" } }]);
      return envelope([{ display: DISPLAYS.provinceTotal, display_short: SHORTS.provinceTotal, group: { province: "Punjab" } }], { unallocated: { level: "adm1", by_province: [{ province: "Punjab", exact: EXACTS.unallocProvince, n_rows: 285 }], note: "mass retained at ADM1" } });
    }),
  );
});

function mount(state: ExplorerState) {
  return render(
    <Providers>
      <ExplorerContext.Provider value={ctx(state)}>
        <DetailCard />
      </ExplorerContext.Provider>
    </Providers>,
  );
}

/** Every decimal token on screen must be one of the strings received in an envelope: a cell's display_short or its display (or an exact / coordinate). */
function assertOnlyEnvelopeNumbers(allowed: string[]) {
  allowed = [...allowed, ...Object.values(SHORTS)];
  // per text node: textContent would glue neighbouring nodes ("202307" + "21.2696") into one token
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const tokens: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) tokens.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
  expect(tokens.length).toBeGreaterThan(0);
  for (const t of tokens) expect(allowed.some((a) => a.includes(t)), `${t} is not from an envelope`).toBe(true);
}

describe("DetailCard", () => {
  it("province: total, sector bars, gas chips, months, lineage unallocated line - all envelope strings", async () => {
    mount({ ...base, geo: "Punjab" });
    const headline = await screen.findByTestId("headline-display");
    expect(headline).toHaveTextContent(SHORTS.provinceTotal); // the server's two-decimal rendering by default
    expect(headline.textContent).not.toContain(DISPLAYS.provinceTotal);
    expect(headline).toHaveAttribute("title", expect.stringContaining(DISPLAYS.provinceTotal)); // the contract precision one hover away
    await screen.findByTestId("unallocated-line");
    await screen.findByTestId("unallocated-table");
    await waitFor(() => expect(screen.getAllByTestId("bar-chart").length).toBe(2));
    assertOnlyEnvelopeNumbers([DISPLAYS.provinceTotal, ...DISPLAYS.modules, ...DISPLAYS.gases, ...DISPLAYS.months, ...DISPLAYS.lineage, ...Object.values(EXACTS)]);
    expect(screen.getByTestId("unallocated-line")).toHaveTextContent(EXACTS.unallocProvince);
  });
  it("district: interval headline verbatim with the badge, shared-shape rows, lineage table", async () => {
    mount({ ...base, level: "adm2", geo: "60131773B12131197496886" });
    expect(await screen.findByTestId("headline-display")).toHaveTextContent("[12.26, 12.28]");
    expect(screen.getByTestId("headline")).toHaveTextContent("interval");
    expect(screen.getByTestId("shape-rows")).toHaveTextContent("Lahore District");
    expect(screen.getByTestId("shape-rows")).toHaveTextContent("Lahore City");
    await waitFor(() => expect(screen.getAllByTestId("envelope-table").length).toBeGreaterThan(0));
    await screen.findByTestId("unallocated-line");
    assertOnlyEnvelopeNumbers([DISPLAYS.districtTotal, ...DISPLAYS.modules, ...DISPLAYS.gases, ...DISPLAYS.months, ...DISPLAYS.lineage, ...Object.values(EXACTS)]);
  });
  it("grid cell: the cube's display in Gg with lat/lon/row/col as received", async () => {
    mount({ ...base, level: "grid", gas: "CH4", month: "202401", cell: "24.925,67.075", raster: true });
    expect(await screen.findByTestId("headline-display")).toHaveTextContent(SHORTS.cell);
    expect(screen.getByTestId("headline")).toHaveTextContent("Gg");
    assertOnlyEnvelopeNumbers([DISPLAYS.cell, EXACTS.cellExact, COORDS.lat, COORDS.lon]);
  });
  it("renders nothing without a selection", () => {
    mount(base);
    expect(screen.queryByTestId("detail-card")).toBeNull();
  });
});
