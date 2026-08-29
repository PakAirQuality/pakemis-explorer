/**
 * Smoke: the pages render against a mocked /v1/release and a mocked envelope, and every number
 * on screen is the envelope's display string. Charts and the map are stubbed (no canvas in jsdom).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Providers } from "@/components/Providers";
import { ContextBar } from "@/components/ContextBar";
import Overview from "@/app/page";
import Ask from "@/app/ask/page";
import Downloads from "@/app/downloads/page";
import Inventory from "@/app/inventory/page";
import Compare from "@/app/compare/page";
import Evidence from "@/app/evidence/page";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/components/BarChart", () => ({ BarChart: () => <div data-testid="chart" /> }));

const RELEASE = {
  api_version: "0.1.0",
  version: "1.0.0rc42",
  release_id: "PakEmis 1.0.0rc42",
  commit: "bc1716d6",
  defaults: { basis: "fiscal" },
  context_bar: {
    release: "PakEmis 1.0.0rc42",
    basis: "fiscal",
    configuration_id: "REF_2023_24",
    gwp_basis: "AR5",
    geography_id: "PK",
    reporting_period: { label: "FY2023-24", start: "2023-07-01", end: "2024-06-30" },
    lulucf: { status: "excluded", notation_key: "NE", note: "" },
  },
  dims: { dim_period: { values: [{ period_id: "FY2023-24", basis: "fiscal" }] } },
  digests: { semantic_release_json: "0d612d2e19ec055cf7768f86cb5dffd2b803a0856a22a9e36c0a9af03ef28d4d", release_manifest_json: "630d1122", tables: { fact_annual: "8e14" }, products: {} },
  known_limitations: [],
  query_contract: { functions: ["query_emissions", "compare_emissions"], placeholder_rule: "a consumer may print only {{result_cell_n}} values the server inserts" },
  licences: {},
  placeholders: { auth: "none" },
};

function envelope(display: string, group?: Record<string, string>) {
  return {
    request_type: "query_emissions",
    request: "{}",
    context: { release: "PakEmis 1.0.0rc42", version: "1.0.0rc42", commit: "bc1716d6", basis: "fiscal", configuration_id: "REF_2023_24", gwp_basis: "AR5", lulucf: { status: "excluded", notation_key: "NE", note: "" }, defaults_applied: [] },
    values: [{ exact: display + "000", value: Number(display), display, unit: "Mt CO2e AR5", result_row_ids: ["a"], formula: "SUM", group: group ?? {}, ipcc_category: "Enteric fermentation", source_stream_id: "s" }],
    calculation: { kind: "sum", sql: "SELECT 1" },
    provenance: { tables: [{ table: "fact_annual", path: "outputs/semantic/fact_annual.csv", sha256: "8e14" }] },
    uncertainty: {},
    evidence: {},
    unallocated: {},
    completeness: [],
    limitations_hit: [{ id: "lulucf_excluded", message: "LULUCF is excluded" }],
    citation: "Ahmad, R. (2026). PakEmis 1.0.0rc42; query receipt 5eb40940d01be992a296f658fb91ab9e",
    result_sha256: "abc",
    receipt: "5eb40940d01be992a296f658fb91ab9e",
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      let payload: unknown = RELEASE;
      if (!String(url).endsWith("/v1/release")) {
        const s = body.configuration_id === "S_2023_24" ? "447.21383" : "452.34662";
        payload = envelope(body.group_by?.length ? "223.454" : s, body.group_by?.length ? { sector_id: "agriculture" } : undefined);
      }
      return { ok: true, status: 200, statusText: "OK", json: async () => payload } as Response;
    }),
  );
});

function mount(node: React.ReactNode) {
  return render(<Providers>{node}</Providers>);
}

describe("PakEmis Explorer pages", () => {
  it("renders the context bar from /v1/release", async () => {
    mount(<ContextBar />);
    expect(await screen.findByText("PakEmis 1.0.0rc42")).toBeTruthy();
    expect(screen.getByText("excluded (NE)")).toBeTruthy();
    expect(screen.getByText("REF_2023_24")).toBeTruthy();
  });
  it("overview shows the L and S totals as display strings with receipts", async () => {
    mount(<Overview />);
    expect(await screen.findByTestId("total-REF_2023_24-AR5")).toHaveTextContent("452.34662");
    expect(await screen.findByTestId("total-S_2023_24-AR5")).toHaveTextContent("447.21383");
    expect((await screen.findAllByText(/5eb40940d01be992a296f658fb91ab9e/)).length).toBeGreaterThan(0);
  });
  it("inventory, compare, evidence, downloads, ask render", async () => {
    mount(<Inventory />);
    expect(await screen.findByText("Inventory Explorer")).toBeTruthy();
    expect((await screen.findAllByText("452.34662")).length).toBeGreaterThan(0);
    mount(<Compare />);
    expect(await screen.findByText("Compare")).toBeTruthy();
    mount(<Evidence />);
    expect(await screen.findByText("Evidence & Methods")).toBeTruthy();
    mount(<Downloads />);
    expect(await screen.findByText("Downloads & API")).toBeTruthy();
    mount(<Ask />);
    expect(await screen.findByText("Beta, not enabled")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ask \(disabled\)/ })).toBeDisabled();
  });
});
