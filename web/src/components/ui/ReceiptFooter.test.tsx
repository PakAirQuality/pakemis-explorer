import "@testing-library/jest-dom/vitest";
/**
 * Result details: the collapsed footer prints no hex (only the "Result details" button with its
 * title); the drawer shows the six tabs in order, the full Result ID at its foot with Copy and
 * the replay link; the Filters tab names the context through the labels; the API request tab
 * prints the canonical request JSON and a curl line against the prefixed API and contains no
 * key-like string; a receipt-only footer replays the receipt when opened.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { releaseLabels } from "@/lib/release";
import type { Envelope, ReleaseInfo } from "@/lib/envelope";
import { RELEASE, envelope, mockFetch } from "@/__tests__/fixtures";
import { apiCallOf, curlLine, replayBody } from "@/lib/requests";
import { DRAWER_TABS, filterRows } from "./EnvelopeDrawer";
import { RESULT_DETAILS_TITLE, ReceiptFooter, receiptHref } from "./ReceiptFooter";

const REQUEST = { _type: "QueryEmissions", periods: ["FY2023-24"], configuration_id: "REF_2023_24", gwp_basis: "AR5", geography_level: "adm1", geography_ids: ["Punjab"], spatial_view: "all", group_by: ["province"], defaults_applied: ["gwp_basis"] };
/** The body that reproduces the receipt: the defaulted field and the list itself left out. */
const REPLAY = { _type: "QueryEmissions", periods: ["FY2023-24"], configuration_id: "REF_2023_24", geography_level: "adm1", geography_ids: ["Punjab"], spatial_view: "all", group_by: ["province"] };

function env(): Envelope {
  return envelope([{ display: "228.744" }], {
    request: JSON.stringify(REQUEST),
    context: { ...envelope([]).context, periods: ["FY2023-24"], geography_level: "adm1", geography_ids: ["Punjab"], spatial_view: "all", defaults_applied: ["gwp_basis"] },
  }) as unknown as Envelope;
}

const HEX32 = /[0-9a-f]{32}/;
const labels = releaseLabels(RELEASE as unknown as ReleaseInfo);

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch(() => env()));
});

describe("ReceiptFooter", () => {
  it("collapsed: one quiet button, no hash on screen", () => {
    const e = env();
    render(<ReceiptFooter env={e} />);
    const footer = screen.getByTestId("receipt-footer");
    expect(footer).toHaveTextContent("Result details");
    expect(footer.textContent).not.toMatch(HEX32);
    expect(footer.textContent).not.toContain(e.receipt.slice(0, 8));
    expect(screen.getByTestId("result-details")).toHaveAttribute("title", RESULT_DETAILS_TITLE);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("opens the drawer: six tabs in order, the full Result ID at the foot, Copy and the replay link", () => {
    const e = env();
    render(<ReceiptFooter env={e} labels={labels} />);
    fireEvent.click(screen.getByTestId("result-details"));
    const drawer = screen.getByRole("dialog", { name: "Result details" });
    expect(within(drawer).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Sources", "Filters", "Calculation", "API request", "Download", "Cite"]);
    expect(DRAWER_TABS.map(([id]) => id)).toEqual(["sources", "filters", "calculation", "request", "download", "cite"]);
    expect(within(drawer).getByTestId("result-id")).toHaveTextContent(e.receipt);
    expect(drawer).toHaveTextContent("Result ID");
    expect(within(drawer).getByLabelText("Copy the Result ID")).toBeInTheDocument();
    expect(within(drawer).getByTestId("reproduce-link")).toHaveAttribute("href", `/data?receipt=${e.receipt}`);
    expect(receiptHref(e.receipt)).toBe(`/data?receipt=${e.receipt}`);
    // Sources first: the provenance table and the limitation hit
    expect(within(drawer).getByTestId("drawer-sources")).toHaveTextContent("outputs/semantic/fact_annual.csv");
    expect(within(drawer).getByTestId("drawer-sources")).toHaveTextContent("lulucf_excluded");
  });
  it("Filters names the context through the labels: period short, configuration label, GWP, geography, view, basis, defaults", () => {
    const e = env();
    render(<ReceiptFooter env={e} labels={labels} />);
    fireEvent.click(screen.getByTestId("result-details"));
    fireEvent.click(screen.getByRole("tab", { name: "Filters" }));
    const table = screen.getByTestId("filters-table");
    expect(table).toHaveTextContent("Period2023–24");
    expect(table).toHaveTextContent("ConfigurationReference estimate");
    expect(table).toHaveTextContent("Warming potentialsIPCC 2013 (AR5)");
    expect(table).toHaveTextContent("Geographyadm1: Punjab");
    expect(table).toHaveTextContent("Spatial viewall three views");
    expect(table).toHaveTextContent("Basisfiscal");
    expect(table).toHaveTextContent("Defaults appliedgwp_basis");
    expect(table.textContent).not.toContain("FY");
    expect(filterRows(e).map((r) => r.name)).toEqual(["Period", "Configuration", "Warming potentials", "Geography", "Spatial view", "Basis", "Defaults applied"]);
    expect(filterRows(e)[0].value).toBe("FY2023-24"); // without labels the id stands
  });
  it("API request prints the canonical JSON and a curl line against the prefixed API, and nothing key-like", () => {
    const e = env();
    render(<ReceiptFooter env={e} labels={labels} />);
    fireEvent.click(screen.getByTestId("result-details"));
    fireEvent.click(screen.getByRole("tab", { name: "API request" }));
    const json = screen.getByTestId("request-json");
    expect(JSON.parse(json.textContent ?? "")).toEqual(REQUEST);
    const curl = screen.getByTestId("request-curl").textContent ?? "";
    expect(curl).toBe(`curl -X POST http://localhost:8000/api/v1/emissions/query/emissions -H 'content-type: application/json' -d '${JSON.stringify(REPLAY)}'`);
    expect(screen.getByTestId("drawer-request")).toHaveTextContent("the fields the contract filled by default (gwp_basis) are left out");
    const tab = screen.getByTestId("drawer-request").textContent ?? "";
    expect(tab).not.toMatch(/api[_-]?key|bearer|token|secret|password/i);
    expect(tab).not.toMatch(/GEMINI|MAPBOX/);
  });
  it("apiCallOf: the six POST routes with the replay body (defaults left out at every level), the four GET routes, else the receipt", () => {
    const base = "http://api.test/api/v1/emissions";
    expect(apiCallOf("get_timeseries", '{"step":"annual"}', "r")).toEqual({ method: "POST", path: "/query/timeseries", body: '{"step":"annual"}' });
    expect(replayBody({ _type: "TimeseriesRequest", query: { basis: "fiscal", sectors: ["transport"], defaults_applied: ["basis"] }, step: "annual" })).toEqual({ _type: "TimeseriesRequest", query: { sectors: ["transport"] }, step: "annual" });
    expect(replayBody({ left: { gwp_basis: "AR5", defaults_applied: ["gwp_basis"] }, right: { gwp_basis: "AR6", defaults_applied: [] }, mode: "absolute" })).toEqual({ left: {}, right: { gwp_basis: "AR6" }, mode: "absolute" });
    expect(apiCallOf("get_timeseries", "not json", "r").body).toBe("not json");
    expect(apiCallOf("compare_emissions", "{}", "r").path).toBe("/query/compare");
    expect(apiCallOf("get_grid_cell", "{}", "r").path).toBe("/spatial/grid");
    expect(apiCallOf("get_uncertainty", "{}", "r").path).toBe("/query/uncertainty");
    expect(apiCallOf("get_completeness", "{}", "r").path).toBe("/query/completeness");
    expect(apiCallOf("get_spatial_lineage", '{"province":"Punjab","shape_id":"","month":"202307","gas":"","configuration_id":"REF_2023_24"}', "r")).toEqual({ method: "GET", path: "/spatial/lineage/Punjab?month=202307&configuration_id=REF_2023_24", body: null });
    expect(apiCallOf("get_evidence", '{"source_stream_id":"","module":"power","category":""}', "r").path).toBe("/evidence/_?module=power");
    expect(apiCallOf("get_method", '{"method_id":"","category":"1A1"}', "r").path).toBe("/method/1A1");
    expect(apiCallOf("get_cross_sector_transfer", '{"ledger_id":"x","configuration_id":"REF_2023_24"}', "r").path).toBe("/transfers?ledger_id=x&configuration_id=REF_2023_24");
    expect(apiCallOf("something_else", "{}", "0123456789abcdef0123456789abcdef").path).toBe("/receipt/0123456789abcdef0123456789abcdef");
    expect(curlLine(base, { method: "GET", path: "/receipt/r", body: null })).toBe("curl http://api.test/api/v1/emissions/receipt/r");
  });
  it("a receipt-only footer replays the receipt when opened and then shows the drawer", async () => {
    const id = "0123456789abcdef0123456789abcdef";
    render(<ReceiptFooter receipt={id} />);
    expect(screen.getByTestId("receipt-footer").textContent).not.toMatch(HEX32);
    fireEvent.click(screen.getByTestId("result-details"));
    expect(screen.getByRole("status")).toHaveTextContent("loading the result");
    const drawer = await screen.findByRole("dialog", { name: "Result details" });
    expect(within(drawer).getByTestId("result-id").textContent).toMatch(HEX32);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/receipt/${id}`), expect.anything());
  });
});
