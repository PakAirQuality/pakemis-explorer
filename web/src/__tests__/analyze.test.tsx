/**
 * Analyze (/analyze, the mockup layout): settings feed every card; the WHAT CHANGED
 * card (waterfall on server ticks + KEY FINDING panel with the relative compare's own
 * percent), the CLIMATE + CLEAN AIR card (contribution rows with both/climate/air
 * tags, the full matrix in its details), and the ROBUSTNESS card (the pair's served
 * interval + the direction badge). Every printed number is a mocked server string.
 */
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import Page from "@/app/analyze/page";
import { RELEASE, envelope, mockFetch, type MockBody } from "./fixtures";

vi.mock("next/navigation", () => ({ usePathname: () => "/analyze", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

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
      if (url.includes("/timeseries")) {
        return envelope([
          { display: "394.090", display_short: "394.09", value: 394.09, group: { period_id: "FY2020-21" } },
          { display: "465.920", display_short: "465.92", value: 465.92, group: { period_id: "FY2023-24" } },
        ], { request_type: "get_timeseries", axis: { ticks_short: ["0", "200", "400", "600"], unit_short: "Mt CO₂e" } });
      }
      if (url.includes("/query/compare")) {
        const b = body as unknown as { left: { group_by?: string[] }; mode?: string };
        if (b.mode === "relative") {
          return envelope([{ display: "18.230", display_short: "18.23", value: 18.23, unit: "percent", extra: { left: L("394.09", 394.09), right: L("465.92", 465.92) } }], { request_type: "compare_emissions" });
        }
        const g = b.left.group_by?.[0];
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
        const b = body as unknown as { gases?: string[]; configuration_id?: string };
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
        const b = body as unknown as { scope?: string };
        if (b.scope === "series") {
          const q = (lo: string, hi: string) => ({ quantiles: { "P2.5": lo, "P97.5": hi }, quantiles_short: { "P2.5": lo, "P97.5": hi }, interval_short: `${lo}–${hi}` });
          return envelope([
            { display: "71.320", display_short: "71.32", value: 71.32, extra: { scenario: "parameter_typed", ...q("33.24", "113.91") } },
            { display: "71.480", display_short: "71.48", value: 71.48, extra: { scenario: "time_correlated", ...q("60.85", "84.78") } },
            { display: "71.570", display_short: "71.57", value: 71.57, extra: { scenario: "time_independent", ...q("8.08", "137.81") } },
          ], { request_type: "get_uncertainty" });
        }
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
  it("the mockup frame: hero with tabs, one settings card feeding the cards, the nav current", async () => {
    mount();
    expect(await screen.findByTestId("analyze-title")).toHaveTextContent("Analyze");
    expect(screen.getAllByTestId("nav-link").find((a) => a.textContent === "Analyze")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("analyze-tab-change")).toHaveAttribute("aria-current", "true");
    const settings = screen.getByTestId("analyze-settings");
    expect(settings).toHaveTextContent("Analysis settings");
    expect(within(settings).getByTestId("analyze-geo")).toHaveValue("PK");
    expect(within(settings).getByTestId("analyze-metric")).toHaveValue("");
    expect(within(settings).getByTestId("change-from")).toHaveValue("FY2020-21");
    expect(within(settings).getByTestId("change-to")).toHaveValue("FY2023-24");
    // Reset returns the pair to first->latest
    fireEvent.change(within(settings).getByTestId("change-to"), { target: { value: "FY2020-21" } });
    fireEvent.click(screen.getByTestId("analyze-reset"));
    await waitFor(() => expect(within(settings).getByTestId("change-to")).toHaveValue("FY2023-24"));
  });

  it("what changed: the waterfall on server ticks, the key finding with the relative percent and the largest offset, and the drill", async () => {
    mount();
    const wf = await screen.findByTestId("change-waterfall");
    expect(wf).toBeInTheDocument();
    expect(screen.getByTestId("change-waterfall-bar-start")).toHaveTextContent("394.09");
    expect(screen.getByTestId("change-waterfall-bar-agriculture")).toHaveTextContent("+46.95");
    // the y gridlines carry the SERVER's tick labels
    expect(wf).toHaveTextContent("600");
    const panel = screen.getByTestId("change-key-finding");
    expect(panel).toHaveTextContent("Key finding");
    expect(screen.getByTestId("change-finding")).toHaveTextContent("Emissions increased by +71.83 Mt CO₂e between 2020–21 and 2023–24.");
    expect(screen.getByTestId("change-finding-top")).toHaveTextContent("Agriculture contributed the largest increase: +46.95 Mt CO₂e.");
    expect(screen.getByTestId("change-overall-pct")).toHaveTextContent("+18.23 %");
    expect(screen.getByTestId("change-largest-offset")).toHaveTextContent("Residential -6.50");
    expect(screen.getByTestId("change-note")).toHaveTextContent("small year-to-year movements remain uncertain");
    expect(screen.getByTestId("change-download")).toHaveTextContent("Download chart");
    // drill
    fireEvent.click(screen.getByTestId("change-waterfall-bar-agriculture"));
    await waitFor(() => expect(screen.getByTestId("change-scope")).toHaveTextContent("Agriculture"));
    expect(await screen.findByTestId("change-waterfall-bar-Enteric fermentation")).toHaveTextContent("+32.97");
    expect(screen.getByTestId("change-finding")).toHaveTextContent("Inside Agriculture, Enteric fermentation moved the most");
    fireEvent.click(screen.getByTestId("change-back"));
    await waitFor(() => expect(screen.queryByTestId("change-scope")).toBeNull());
  });

  it("climate + clean air: contribution rows with tags from the envelopes' own shares, and the full matrix in the details", async () => {
    mount();
    const agri = await screen.findByTestId("shared-row-agriculture");
    expect(agri).toHaveTextContent("+46.95");
    await waitFor(() => expect(screen.getByTestId("shared-tag-agriculture")).toHaveTextContent("both"));
    expect(screen.getByTestId("shared-tag-power")).toHaveTextContent("climate");
    expect(screen.getByTestId("shared-tag-residential")).toHaveTextContent("both");
    // the matrix still lives in the card's details, NE typed with the screening's ends
    expect(screen.getByTestId("matrix-agriculture-co2e")).toHaveTextContent("48.0 %");
    const ne = screen.getByTestId("matrix-ne-power-PM2.5");
    expect(ne).toHaveTextContent("NE");
    expect(ne.querySelector("span")?.getAttribute("title")).toContain("0.6800–1.2100 kt");
  });

  it("robustness: the pair's served interval, the direction badge, and the L/S table in the details", async () => {
    mount();
    const badge = await screen.findByTestId("robustness-badge");
    expect(badge).toHaveTextContent("Direction is robust");
    expect(screen.getByTestId("robustness-sentence")).toHaveTextContent(
      "The increase is likely between 33.24 and 113.91 Mt CO₂e, with a central estimate of 71.32 Mt CO₂e.",
    );
    expect(screen.getByTestId("robustness-scenarios")).toHaveTextContent("8.08–137.81");
    const row = screen.getByTestId("sensitivity-residential");
    expect(row).toHaveTextContent("29.47");
    expect(row).toHaveTextContent("24.34");
    expect(screen.getByTestId("sensitivity-finding")).toHaveTextContent("Agriculture leads the reference estimate and keeps the lead under");
    expect(screen.getByTestId("envelope-Enteric fermentation")).toHaveTextContent("-30.0 / +40.0 %");
  });
});
