import "@testing-library/jest-dom/vitest";
/**
 * Smoke: the Map page renders against a mocked /release and mocked envelopes under the
 * shared ExplorerProvider (the page's own behaviour is in components/map/map.test.tsx). The
 * map and charts are stubbed (no WebGL/canvas in jsdom).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import Page from "@/app/map/page";
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

describe("PakEmis Map page", () => {
  it("renders the map screen with the national total from an envelope (the server's two-decimal rendering, the contract display in the title) and a receipt footer", async () => {
    mount(<Page />);
    expect(await screen.findByTestId("explorer")).toBeTruthy();
    expect(await screen.findByTestId("headline-display")).toHaveTextContent("452.35");
    expect(screen.getByTestId("headline-display")).toHaveAttribute("title", expect.stringContaining("452.34662"));
    expect((await screen.findAllByTestId("receipt-footer")).length).toBeGreaterThan(0);
    expect(screen.getByTestId("map-stub")).toBeTruthy();
    expect(screen.getByTestId("map-frame")).toBeTruthy();
    expect(screen.getAllByTestId("nav-link").find((a) => a.textContent === "Map")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByTestId("welcome-modal")).toBeNull();
  });
  it("the shell prints no raw id: no bare AR5, no ' L ·', no '(NE)', no 'LULUCF', no version string", async () => {
    mount(<Page />);
    await screen.findByTestId("headline-display");
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
