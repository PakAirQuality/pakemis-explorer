/**
 * Analyze (/analyze): the three analyses over mocked envelopes — the change waterfall
 * (compare_emissions per grain, drill by click), the source × pollutant matrix (every
 * column its own denominator, NE cells typed not zero), and the configuration
 * sensitivity table (ranks from each envelope's own partition). Every printed number
 * in the assertions is a mocked server string.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import Page from "@/app/analyze/page";
import { RELEASE, envelope, mockFetch, type MockBody } from "./fixtures";

vi.mock("next/navigation", () => ({ usePathname: () => "/analyze", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/map/ExplorerMap", () => ({
  ExplorerMap: ({ override }: { override?: { sector?: string | null; period?: string } }) => (
    <div data-testid="map-stub" data-sector={override?.sector ?? ""} data-period={override?.period ?? ""} />
  ),
}));

const cmpCell = (delta: string, v: number, left: object, right: object) => ({
  display: delta, display_short: delta.replace(/^[+]/, ""), value: v, unit: "Mt CO2e AR5",
  extra: { left, right },
});
const L = (short: string, v: number, sector?: string) => ({ display_short: short, value: v, unit_short: "Mt CO₂e", group: sector ? { sector_id: sector } : {} });

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    mockFetch((url: string, body: MockBody | undefined) => {
      if (url.endsWith("/release")) return RELEASE;
      if (url.endsWith("/openapi.json")) return { paths: {}, components: { schemas: {} } };
      if (url.includes("/tiles/")) return { adm1: {}, adm2: {} };
      if (url.includes("/query/compare")) {
        const b = body as unknown as { left: { group_by?: string[]; sectors?: string[] }; right: { configuration_id?: string } };
        const g = b.left.group_by?.[0];
        if (b.right.configuration_id === "S_2023_24") {
          return envelope([
            cmpCell("-5.13", -5.13, L("29.47", 29.47, "residential"), L("24.34", 24.34, "residential")),
            cmpCell("0.00", 0, L("223.45", 223.45, "agriculture"), L("223.45", 223.45, "agriculture")),
          ], { request_type: "compare_emissions" });
        }
        if (g === "sector_id") {
          return envelope([
            cmpCell("+46.95", 46.95, L("176.50", 176.5, "agriculture"), L("223.45", 223.45, "agriculture")),
            cmpCell("+10.93", 10.93, L("52.44", 52.44, "power"), L("63.37", 63.37, "power")),
            cmpCell("-6.50", -6.5, L("48.43", 48.43, "residential"), L("41.93", 41.93, "residential")),
          ], { request_type: "compare_emissions" });
        }
        if (g === "category") {
          return envelope([
            cmpCell("+32.97", 32.97, { display_short: "118.69", value: 118.69, group: { category: "Enteric fermentation" } }, { display_short: "151.66", value: 151.66, group: { category: "Enteric fermentation" } }),
          ], { request_type: "compare_emissions" });
        }
        return envelope([cmpCell("+71.83", 71.83, L("394.09", 394.09), L("465.92", 465.92))], { request_type: "compare_emissions" });
      }
      if (url.includes("/query/emissions")) {
        const b = body as unknown as { gases?: string[]; configuration_id?: string; group_by?: string[] };
        if (b.configuration_id === "S_2023_24") {
          return envelope([
            { display: "223.450", display_short: "223.45", value: 223.45, group: { sector_id: "agriculture" }, extra: { share_pct_short: "48.5", rank: 1 } },
            { display: "24.340", display_short: "24.34", value: 24.34, group: { sector_id: "residential" }, extra: { share_pct_short: "5.3", rank: 3 } },
            { display: "63.370", display_short: "63.37", value: 63.37, group: { sector_id: "power" }, extra: { share_pct_short: "13.8", rank: 2 } },
          ]);
        }
        if (b.gases?.[0] === "CH4") {
          return envelope([
            { display: "181.930", display_short: "181.93", value: 181.93, group: { sector_id: "agriculture" }, extra: { share_pct_short: "73.1", rank: 1 } },
          ]);
        }
        return envelope([
          { display: "223.450", display_short: "223.45", value: 223.45, group: { sector_id: "agriculture" }, extra: { share_pct_short: "48.0", rank: 1 } },
          { display: "63.370", display_short: "63.37", value: 63.37, group: { sector_id: "power" }, extra: { share_pct_short: "13.6", rank: 2 } },
          { display: "29.470", display_short: "29.47", value: 29.47, group: { sector_id: "residential" }, extra: { share_pct_short: "6.3", rank: 3 } },
        ]);
      }
      if (url.includes("/query/air")) {
        return envelope([
          { display: "33.090", display_short: "33.09", value: 33.09, unit: "kt BC", unit_short: "kt BC", group: { sector_id: "residential" }, extra: { share_pct_short: "72.2", rank: 1 } },
          { display: "5.100", display_short: "5.10", value: 5.1, unit: "kt BC", unit_short: "kt BC", group: { sector_id: "agriculture" }, extra: { share_pct_short: "11.1", rank: 2 } },
        ], {
          request_type: "query_air",
          completeness: [
            { period_id: "FY2023-24", sector_id: "power", pollutant: "PM2.5", scenario_controlled_kt: "0.6800", scenario_uncontrolled_kt: "1.2100", gap_id: "air-power-controlled" },
          ],
        });
      }
      if (url.includes("/query/uncertainty")) {
        return envelope([
          { display: "151.660", display_short: "151.66", value: 151.66, extra: { category: "Enteric fermentation", envelope: { low_pct: "-30.0", high_pct: "40.0", kind: "structural" } } },
          { display: "63.370", display_short: "63.37", value: 63.37, extra: { category: "Grid electricity", envelope: { low_pct: "-10.0", high_pct: "15.0", kind: "structural" } } },
        ], { request_type: "get_uncertainty" });
      }
      return envelope([{ display: "465.920", display_short: "465.92", value: 465.92 }]);
    }),
  );
});

function mount() {
  const Wrapper = withNuqsTestingAdapter({ searchParams: "", hasMemory: true });
  return render(
    <Wrapper>
      <Providers>
        <ExplorerProvider>
          <Page />
        </ExplorerProvider>
      </Providers>
    </Wrapper>,
  );
}

describe("Analyze", () => {
  it("the change waterfall: endpoints and signed steps from the compare envelopes, a finding in words, and a click that drills into the source", async () => {
    mount();
    expect(await screen.findByTestId("analyze-title")).toHaveTextContent("Analyze");
    // the nav's fourth slot is Analyze, current here
    expect(screen.getAllByTestId("nav-link").find((a) => a.textContent === "Analyze")).toHaveAttribute("aria-current", "page");
    const wf = await screen.findByTestId("change-waterfall");
    expect(wf).toBeInTheDocument();
    expect(screen.getByTestId("change-waterfall-bar-start")).toHaveTextContent("394.09");
    expect(screen.getByTestId("change-waterfall-bar-agriculture")).toHaveTextContent("+46.95");
    expect(screen.getByTestId("change-waterfall-bar-residential")).toHaveTextContent("-6.50");
    expect(screen.getByTestId("change-finding")).toHaveTextContent(
      "Emissions grew by +71.83 Mt CO₂e between 2020–21 and 2023–24 — from 394.09 to 465.92. Agriculture contributed the largest single step of that change: +46.95.",
    );
    // the plain caution rides under the chart; the precise wording folds into "More"
    expect(screen.getByTestId("change-note")).toHaveTextContent("wider than most year-to-year moves");
    expect(screen.getByTestId("analyze-more-change")).toHaveTextContent("compare function");
    // the workspace shell: the map behind, following the To year
    expect(screen.getByTestId("analyze-map-pane")).toContainElement(screen.getByTestId("map-stub"));
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-period", "FY2023-24");
    // drill: agriculture opens into its categories, and the map's sector overlay follows
    fireEvent.click(screen.getByTestId("change-waterfall-bar-agriculture"));
    await waitFor(() => expect(screen.getByTestId("change-scope")).toHaveTextContent("Agriculture"));
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-sector", "agriculture");
    expect(await screen.findByTestId("change-waterfall-bar-Enteric fermentation")).toHaveTextContent("+32.97");
    expect(screen.getByTestId("change-finding")).toHaveTextContent("Inside Agriculture, Enteric fermentation moved the most");
    fireEvent.click(screen.getByTestId("change-back"));
    await waitFor(() => expect(screen.queryByTestId("change-scope")).toBeNull());
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-sector", "");
  });

  it("the matrix: each column its own share, an NE cell that is typed (with the screening's ends), and the scatter's combined-weight finding", async () => {
    mount();
    const cell = await screen.findByTestId("matrix-agriculture-co2e");
    expect(cell).toHaveTextContent("48.0 %");
    expect(screen.getByTestId("matrix-agriculture-CH4")).toHaveTextContent("73.1 %");
    // power is absent from the mocked air envelopes: NE, not zero, with the scenario ends
    const ne = screen.getByTestId("matrix-ne-power-PM2.5");
    expect(ne).toHaveTextContent("NE");
    expect(ne.querySelector("span")?.getAttribute("title")).toContain("0.6800–1.2100 kt");
    expect(screen.getByTestId("scatter-residential")).toBeInTheDocument();
    expect(screen.getByTestId("shared-finding")).toHaveTextContent("carries the largest combined weight");
  });

  it("sensitivity: L beside S with each envelope's own ranks, the stability sentence, and the category envelopes", async () => {
    mount();
    const row = await screen.findByTestId("sensitivity-residential");
    expect(row).toHaveTextContent("29.47");
    expect(row).toHaveTextContent("24.34");
    expect(row).toHaveTextContent("3");
    // no Δ column: compare_emissions misaligns cross-configuration sides (engine defect)
    expect(row).not.toHaveTextContent("-5.13");
    expect(screen.getByTestId("sensitivity-finding")).toHaveTextContent("Agriculture leads the reference estimate and keeps the lead under");
    expect(screen.getByTestId("sensitivity-finding")).toHaveTextContent("no probability attaches");
    expect(await screen.findByTestId("envelope-Enteric fermentation")).toHaveTextContent("-30.0 / +40.0 %");
  });
});
