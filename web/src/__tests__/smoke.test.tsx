import "@testing-library/jest-dom/vitest";
/**
 * Smoke: the Map page and the Downloads page render against a mocked /release and mocked
 * envelopes under the shared ExplorerProvider, and every number on screen is an envelope's
 * display string. The map and charts are stubbed (no WebGL/canvas in jsdom).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import Page from "@/app/map/page";
import DownloadsPage from "@/app/downloads/page";
import { RELEASE, envelope, mockFetch } from "./fixtures";

vi.mock("@/components/map/ExplorerMap", () => ({ ExplorerMap: () => <div data-testid="map-stub" /> }));
vi.mock("@/components/ui/BarChart", () => ({ BarChart: () => <div data-testid="bar-chart" /> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/map", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), redirect: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    mockFetch((url, body) => {
      if (url.endsWith("/release")) return RELEASE;
      if (url.endsWith("/openapi.json")) return { paths: { "/api/v1/emissions/release": {} }, components: { schemas: { QueryEmissions: { properties: { gwp_basis: { description: "AR5 | AR6" }, spatial_view: { description: "all | physical | origin | accounting" } } }, GridCellRequest: { properties: { gas: { default: "CO2" }, month: { description: 'YYYYMM or "annual"' } } } } } };
      if (body?.group_by?.includes("sector_id")) return envelope([{ display: "223.454", group: { sector_id: "agriculture" } }, { display: "57.612", group: { sector_id: "power" } }]);
      if (body?.group_by?.includes("province")) return envelope([{ display: "228.7168", group: { province: "Punjab" } }]);
      if (body?.configuration_id === "S_2023_24") return envelope([{ display: "447.21383" }]);
      if (url.includes("/timeseries")) return envelope([{ display: "372.397", group: { period_id: "FY2015-16" } }, { display: "452.347", group: { period_id: "FY2023-24" } }]);
      if (url.includes("/compare")) return envelope([{ display: "-5.133", group: { sector_id: "residential" } }]);
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

describe("PakEmis Map page", () => {
  it("renders the map screen with the national KPI from an envelope and the receipt as a footer", async () => {
    mount(<Page />);
    expect(await screen.findByTestId("explorer")).toBeTruthy();
    expect(await screen.findByTestId("national-kpi")).toHaveTextContent("452.35"); // the server's two-decimal rendering; the contract display in the title
    expect(screen.getByTestId("national-kpi")).toHaveAttribute("title", expect.stringContaining("452.34662"));
    expect((await screen.findAllByTestId("receipt-footer")).length).toBeGreaterThan(0);
    expect(screen.getByTestId("map-stub")).toBeTruthy();
    expect(screen.getByTestId("map-frame")).toBeTruthy();
    expect(screen.getAllByTestId("nav-link").find((a) => a.textContent === "Map")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByTestId("welcome-modal")).toBeNull();
  });
  it("shows the Ask placeholder as a disabled card with the release's reason", async () => {
    mount(<Page />, "?ask=1");
    expect(await screen.findByTestId("disabled-card")).toHaveTextContent("not mounted");
    expect(screen.getByText("query_emissions")).toBeTruthy();
  });
  it("renders /downloads with the release identity (the one place the version is printed) and the sector x gas frame", async () => {
    mount(<DownloadsPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Downloads" })).toBeTruthy();
    expect(await screen.findByText("Release identity")).toBeTruthy();
    expect(screen.getByText("PakEmis 1.0.0rc42")).toBeTruthy();
    expect((await screen.findAllByTestId("frame")).length).toBeGreaterThan(0);
  });
});

describe("the labels a reader sees", () => {
  it("the KPI reads the unit as Mt CO₂e with the GWP sentence as its tooltip, under 'Reference estimate · excludes land use and forestry'", async () => {
    mount(<Page />);
    expect(await screen.findByTestId("national-kpi")).toHaveTextContent("452.35");
    const unit = screen.getByTestId("national-kpi-unit");
    expect(unit).toHaveTextContent("Mt CO₂e");
    expect(unit).toHaveAttribute("title", expect.stringContaining("Fifth Assessment Report"));
    const line = screen.getByTestId("national-kpi-line");
    expect(line).toHaveTextContent("Reference estimate · excludes land use and forestry");
    expect(line.querySelector("[title]")?.getAttribute("title")).toContain("every axis at its reference setting");
    expect(Array.from(line.querySelectorAll("[title]")).map((e) => e.getAttribute("title"))).toContain("an exploratory Tier-1 module publishes a provisional sink outside every total");
  });
  it("the frames' unit lines read 'Million tonnes CO₂e' in full and the survey frame is titled in words", async () => {
    mount(<Page />);
    const units = await screen.findAllByTestId("frame-unit");
    for (const u of units) {
      expect(u).toHaveTextContent("Million tonnes CO₂e");
      expect(u.className).not.toContain("truncate");
    }
    expect(await screen.findByText("Survey-based estimate minus reference estimate, by sector")).toBeTruthy();
  });
  it("a scope line names the GWP basis only when it is not the release's default", async () => {
    const { unmount } = mount(<Page />);
    const panel = await screen.findByTestId("context-panel");
    await screen.findByTestId("national-kpi");
    expect(panel).toHaveTextContent("2023–24 · reference estimate");
    expect(panel.textContent).not.toContain("IPCC 2013");
    unmount();
    mount(<Page />, "?gwp=AR6");
    const panel6 = await screen.findByTestId("context-panel");
    await screen.findByTestId("national-kpi");
    expect(panel6).toHaveTextContent("2023–24 · reference estimate · IPCC 2021 (AR6)");
  });
  it("the shell prints no raw id: no bare AR5, no ' L ·', no '(NE)', no 'LULUCF', no version string", async () => {
    mount(<Page />);
    await screen.findByTestId("national-kpi");
    await screen.findAllByTestId("frame-unit");
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/(^|[^A-Z0-9(])AR5(?![)\w])/); // "IPCC 2013 (AR5)" is the only spelling allowed, and it is not in the default shell
    expect(text).not.toContain(" L ·");
    expect(text).not.toContain("(L)");
    expect(text).not.toContain("(NE)");
    expect(text).not.toContain("LULUCF");
    expect(text).not.toContain("1.0.0rc");
    expect(text).not.toContain("Mt CO2e");
    for (const el of Array.from(document.body.querySelectorAll("[title]"))) {
      expect(el.getAttribute("title") ?? "").not.toContain("1.0.0rc");
    }
  });
});
