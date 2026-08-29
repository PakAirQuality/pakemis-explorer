import "@testing-library/jest-dom/vitest";
/**
 * Smoke: the screen renders against a mocked /release and mocked envelopes, and every number
 * on screen is an envelope's display string. The map and charts are stubbed (no WebGL/canvas in jsdom).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import Page from "@/app/page";
import DataPage from "@/app/data/page";
import { RELEASE, envelope, mockFetch } from "./fixtures";

vi.mock("@/components/map/ExplorerMap", () => ({ ExplorerMap: () => <div data-testid="map-stub" /> }));
vi.mock("@/components/ui/BarChart", () => ({ BarChart: () => <div data-testid="bar-chart" /> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), redirect: vi.fn() }));

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
      return envelope([{ display: "452.34662" }]);
    }),
  );
});

function mount(node: React.ReactNode, search = "") {
  const Wrapper = withNuqsTestingAdapter({ searchParams: search });
  return render(
    <Wrapper>
      <Providers>{node}</Providers>
    </Wrapper>,
  );
}

describe("PakEmis Explorer", () => {
  it("renders the shell with the national KPI from an envelope and the receipt as a footer", async () => {
    mount(<Page />);
    expect(await screen.findByTestId("explorer")).toBeTruthy();
    expect(await screen.findByTestId("national-kpi")).toHaveTextContent("452.34662");
    expect((await screen.findAllByTestId("receipt-footer")).length).toBeGreaterThan(0);
    expect(screen.getByTestId("map-stub")).toBeTruthy();
  });
  it("shows the Ask placeholder as a disabled card with the release's reason", async () => {
    mount(<Page />, "?ask=1");
    expect(await screen.findByTestId("disabled-card")).toHaveTextContent("not mounted");
    expect(screen.getByText("query_emissions")).toBeTruthy();
  });
  it("renders /data with the release identity and the sector x gas frame", async () => {
    mount(<DataPage />);
    expect(await screen.findByText("Data & API")).toBeTruthy();
    expect(await screen.findByText(/PakEmis 1\.0\.0rc42 · commit/)).toBeTruthy();
    expect((await screen.findAllByTestId("frame")).length).toBeGreaterThan(0);
  });
});
