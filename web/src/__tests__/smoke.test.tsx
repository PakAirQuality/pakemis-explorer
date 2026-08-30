import "@testing-library/jest-dom/vitest";
/**
 * Smoke: the two pages that carry the release render against a mocked /release and mocked
 * envelopes under the shared ExplorerProvider — the workspace at `/` (its own behaviour is in
 * __tests__/workspace.test.tsx) and the Grapher at `/data` (in __tests__/explore.test.tsx) —
 * each with the nav capsule marking its own section, and neither printing a raw id. The map and
 * the charts are stubbed (no WebGL or canvas in jsdom).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import Workspace from "@/app/page";
import DataPage from "@/app/data/page";
import { RELEASE, envelope, mockFetch, stubWideViewport } from "./fixtures";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("@/components/map/ExplorerMap", () => ({ ExplorerMap: () => <div data-testid="map-stub" /> }));
vi.mock("@/components/ui/BarChart", () => ({ BarChart: () => <div data-testid="bar-chart" /> }));
vi.mock("@/components/charts/BarsWithAxis", () => ({ BarsWithAxis: () => <div data-testid="bars-with-axis" /> }));
vi.mock("@/components/charts/ColumnChart", () => ({ ColumnChart: () => <div data-testid="column-chart" /> }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), redirect: vi.fn() }));

beforeEach(() => {
  stubWideViewport();
  vi.stubGlobal(
    "fetch",
    mockFetch((url, body) => {
      if (url.endsWith("/release")) return RELEASE;
      if (url.endsWith("/openapi.json")) return { paths: { "/api/v1/emissions/release": {} }, components: { schemas: { QueryEmissions: { properties: { gwp_basis: { description: "AR5 | AR6" }, spatial_view: { description: "all | physical | origin | accounting" } } }, GridCellRequest: { properties: { gas: { default: "CO2" }, month: { description: 'YYYYMM or "annual"' } } } } } };
      if (url.includes("/tiles/")) return { raster: undefined, adm1: {}, adm2: {} };
      if (body?.group_by?.includes("province")) return envelope([{ display: "228.7168", display_short: "228.72", group: { province: "Punjab" } }], { derived: { unallocated_total_short: "9.01", placed_short: "443.34" } });
      return envelope([{ display: "452.34662", display_short: "452.35", unit_short: "Mt CO₂e" }]);
    }),
  );
});

function mount(node: React.ReactNode, search = "") {
  const Wrapper = withNuqsTestingAdapter({ searchParams: search });
  return render(
    <Wrapper>
      <Providers>
        <ExplorerProvider>{node}</ExplorerProvider>
      </Providers>
    </Wrapper>,
  );
}

/** The shell prints no raw id: no bare AR5, no ' L ·', no '(NE)', no 'LULUCF', no version string. */
function noRawIds() {
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/(^|[^A-Z0-9(])AR5(?![)\w])/); // "IPCC 2013 (AR5)" is the only spelling allowed
  expect(text).not.toContain(" L ·");
  expect(text).not.toContain("(L)");
  expect(text).not.toContain("(NE)");
  expect(text).not.toContain("LULUCF");
  expect(text).not.toContain("1.0.0rc");
  expect(text).not.toContain("Mt CO2e");
  for (const el of Array.from(document.body.querySelectorAll("[title]"))) expect(el.getAttribute("title") ?? "").not.toContain("1.0.0rc");
}

describe("the workspace at /", () => {
  it("renders the map, the deck's opening statement from an envelope (the server's two-decimal rendering) and the nav marking Explore", async () => {
    pathname.value = "/";
    mount(<Workspace />);
    expect(await screen.findByTestId("workspace")).toBeTruthy();
    expect(await screen.findByTestId("opening-statement")).toHaveTextContent("452.35");
    expect(screen.getByTestId("map-stub")).toBeTruthy();
    expect(screen.getByTestId("deck")).toBeTruthy();
    expect(screen.getByTestId("filter-panel")).toBeTruthy();
    expect(screen.getAllByTestId("nav-link").find((a) => a.textContent === "Explore")).toHaveAttribute("aria-current", "page");
    noRawIds();
  });
});

describe("the Grapher at /data", () => {
  it("renders the canvas with the national total from an envelope and a receipt footer, and the nav marks Data", async () => {
    pathname.value = "/data";
    mount(<DataPage />);
    expect(await screen.findByTestId("explore-page")).toBeTruthy();
    expect(await screen.findByTestId("canvas")).toBeTruthy();
    expect(await screen.findByTestId("canvas-title")).toBeTruthy();
    expect(screen.getAllByTestId("nav-link").find((a) => a.textContent === "Data")).toHaveAttribute("aria-current", "page");
    noRawIds();
  });
});
