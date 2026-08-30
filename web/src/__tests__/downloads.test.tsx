import "@testing-library/jest-dom/vitest";
/**
 * /downloads, purpose-first, against a mocked GET /products catalogue (six families, a registry
 * product, the complete family's archive) and a /release carrying citation and identity_line:
 * the seven purposes lead and nothing else of the catalogue shows before a choice (no version
 * anywhere); a purpose (`?purpose=`) opens its family with the API's title, the products with
 * a button per format that exists (sha256 as the link's ETag hint), the schema panel, the
 * checksums and the citation / identity table — the one place the version appears; the
 * narrowings (allocations = the spatial tables, gridded = the cubes); the complete family's
 * zip; Query through the API and the receipt replay below; the audits.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import DownloadsPage from "@/app/downloads/page";
import { PURPOSES } from "@/components/downloads/copy";
import { RELEASE, envelope, mockFetch } from "./fixtures";
import { avoidPhrasesIn } from "./vocabulary";

vi.mock("next/navigation", () => ({ usePathname: () => "/downloads", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const BASE = "http://localhost:8000/api/v1/emissions/products";
const fmt = (name: string, ext: string, bytes: number, sha: string, identity = "contract") => ({ ext, filename: `${name}.${ext}`, bytes, sha256: sha, identity, url: `${BASE}/${name}.${ext}` });
const PRODUCTS = {
  release: "PakEmis 1.0.0rc42",
  version: "1.0.0rc42",
  count: 7,
  note: "sha256 is the file's identity.",
  products: [
    { name: "fact_annual", kind: "table", table_kind: "fact", formats: [fmt("fact_annual", "csv", 648750, "8e14aaaa"), fmt("fact_annual", "parquet", 108325, "3d61bbbb", "computed")], rows: 1675, columns: ["result_row_id", "period_id", "sector_id", "co2e_Mt_AR5"], primary_key: ["result_row_id"], aggregation_rule: "sum of co2e_Mt over the rows", closure: "fact_annual sums to the national total per period and configuration" },
    { name: "dim_gas", kind: "table", table_kind: "dim", formats: [fmt("dim_gas", "csv", 120, "9f9f")], rows: 3, columns: ["result_row_id", "gas"], primary_key: ["gas"] },
    { name: "fact_monthly", kind: "table", table_kind: "fact", formats: [fmt("fact_monthly", "csv", 7400000, "abcd"), fmt("fact_monthly", "parquet", 900000, "abce", "computed")], rows: 16824, columns: ["month", "co2e_Mt_AR5"], primary_key: ["result_row_id"] },
    { name: "fact_adm2_month", kind: "table", table_kind: "fact", formats: [fmt("fact_adm2_month", "csv", 5000000, "adm2csv")], rows: 40000, columns: ["shape_id", "month"], primary_key: ["result_row_id"] },
    { name: "pakemis_grid_0p05_monthly", kind: "cube", formats: [fmt("pakemis_grid_0p05_monthly", "nc", 5800000, "cube1", "manifest")] },
    { name: "fact_uncertainty", kind: "table", table_kind: "fact", formats: [fmt("fact_uncertainty", "csv", 20000, "unc1")], rows: 80, columns: ["category", "resolution"], primary_key: ["result_row_id"] },
    { name: "emission_factors", kind: "registry", source_path: "data/emission_factors.csv", formats: [fmt("emission_factors", "csv", 30000, "ef01", "manifest_sources")] },
    { name: "semantic_release", kind: "metadata", formats: [fmt("semantic_release", "json", 12000, "0d612d2e", "verified")] },
  ],
  families: [
    { id: "annual", title: "Annual inventory", description: "Nine fiscal years by sector, IPCC category, component, gas, configuration and GWP basis, with every dimension table.", tables: ["fact_annual", "dim_gas"], formats: ["csv", "parquet"] },
    { id: "monthly", title: "Monthly inventory", description: "All 108 months with annual closure, temporal profiles and evidence classifications.", tables: ["fact_monthly"], formats: ["csv", "parquet"] },
    { id: "spatial", title: "Spatial inventory", description: "Reference-year administrative and 0.05-degree allocations with fallback, lineage and unallocated-mass tables.", tables: ["fact_adm2_month", "pakemis_grid_0p05_monthly"], formats: ["csv", "parquet", "nc"] },
    { id: "uncertainty", title: "Uncertainty and scenarios", description: "Common correlated draws, uncertainty summaries, completeness ledgers, transfers and the named structural configurations.", tables: ["fact_uncertainty"], formats: ["csv", "parquet"] },
    { id: "evidence", title: "Evidence and provenance", description: "The evidence classes behind every stream, the stream register, the completeness ledgers, and the registries the claim record joins.", tables: ["emission_factors"], formats: ["csv", "parquet"] },
    { id: "complete", title: "Complete release", description: "Every file of the release payload; also as one zip archive with SHA256SUMS.", tables: ["fact_annual", "dim_gas", "fact_monthly", "fact_adm2_month", "pakemis_grid_0p05_monthly", "fact_uncertainty", "emission_factors", "semantic_release"], formats: ["csv", "parquet", "nc", "json", "zip"], archive: { filename: "complete.zip", url: `${BASE}/complete.zip`, members: 71, note: "every catalogued file under its payload path, plus SHA256SUMS and FETCH.json; streamed, deflated, not itself hashed" } },
  ],
};

const fetchSpy = vi.fn();
beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal(
    "fetch",
    mockFetch((url, body) => {
      fetchSpy(url, body);
      if (url.endsWith("/release")) return RELEASE;
      if (url.endsWith("/products")) return PRODUCTS;
      if (url.endsWith("/openapi.json")) return { paths: {}, components: { schemas: {} } };
      if (url.includes("/receipt/")) return envelope([{ display: "223.454", display_short: "223.45", unit_short: "Mt CO₂e", group: { sector_id: "agriculture" } }], { request: JSON.stringify({ _type: "QueryEmissions", periods: ["FY2023-24"], sectors: ["agriculture"], group_by: ["sector_id"] }), receipt: "0123456789abcdef0123456789abcdef" });
      return envelope([{ display: "452.34662", display_short: "452.35", unit_short: "Mt CO₂e" }]);
    }),
  );
});

function mount(search = "", onUrlUpdate?: OnUrlUpdateFunction) {
  const Wrapper = withNuqsTestingAdapter({ searchParams: search, onUrlUpdate, hasMemory: true });
  return render(
    <Wrapper>
      <Providers>
        <ExplorerProvider>
          <DownloadsPage />
        </ExplorerProvider>
      </Providers>
    </Wrapper>,
  );
}

describe("/downloads", () => {
  it("leads with the seven purposes and shows nothing of the catalogue, nor the version, before a choice", async () => {
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: "Downloads & API" })).toBeInTheDocument();
    expect(screen.getByTestId("api-docs")).toHaveAttribute("href", "http://localhost:8000/api/v1/emissions/docs");
    expect(screen.getByTestId("purpose-question")).toHaveTextContent("What do you want to study?");
    const cards = screen.getAllByTestId("purpose-card");
    expect(cards.map((c) => c.getAttribute("data-purpose"))).toEqual(PURPOSES.map((p) => p.id));
    expect(cards.map((c) => c.querySelector("span")?.textContent)).toEqual(["National and sector totals", "Monthly emissions", "Province and district allocations", "Gridded emissions", "Uncertainty and configurations", "Evidence and provenance", "Complete release"]);
    expect(within(cards[0]).getByTestId("purpose-caption")).toHaveTextContent("2020–21 to 2023–24 · National");
    expect(within(cards[1]).getByTestId("purpose-caption")).toHaveTextContent("4 months · timing evidence graded");
    expect(within(cards[3]).getByTestId("purpose-caption")).toHaveTextContent("2023–24 · Monthly grid");
    expect(screen.getByTestId("purpose-none")).toBeInTheDocument();
    expect(screen.queryByTestId("purpose-panel")).toBeNull();
    expect(screen.queryByTestId("citation-table")).toBeNull();
    expect(document.body.textContent).not.toContain("1.0.0rc");
    expect(screen.getAllByTestId("nav-link").find((a) => a.textContent === "Downloads")).toHaveAttribute("aria-current", "page");
  });
  it("a purpose opens its family: the API's title, a button per format that exists with the sha256 hint, the schema panel, the checksums and the citation table", async () => {
    const onUrlUpdate = vi.fn();
    mount("", onUrlUpdate);
    const cards = await screen.findAllByTestId("purpose-card");
    fireEvent.click(cards[0]);
    const panel = await screen.findByTestId("purpose-panel");
    await waitFor(() => expect(onUrlUpdate.mock.calls.some(([u]) => String((u as { queryString: string }).queryString).includes("purpose=totals"))).toBe(true));
    expect(panel).toHaveAttribute("data-family", "annual");
    expect(cards[0]).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(within(panel).getByTestId("family-title")).toHaveTextContent("Annual inventory"));
    expect(panel).toHaveTextContent("with every dimension table.");
    expect(within(panel).getByTestId("family-formats")).toHaveTextContent("CSV · Parquet");
    const rows = within(panel).getAllByTestId("product-row");
    expect(rows.map((r) => r.getAttribute("data-product"))).toEqual(["fact_annual", "dim_gas"]);
    const buttons = within(rows[0]).getAllByTestId("format-button");
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(["CSV", "Parquet"]);
    expect(buttons[0]).toHaveAttribute("href", `${BASE}/fact_annual.csv`);
    expect(buttons[0]).toHaveAttribute("data-sha256", "8e14aaaa");
    expect(buttons[0]).toHaveAttribute("title", expect.stringContaining("ETag / sha256 8e14aaaa"));
    expect(within(rows[1]).getAllByTestId("format-button").map((b) => b.textContent?.trim())).toEqual(["CSV"]);
    expect(rows[0]).toHaveTextContent("1,675 rows");
    fireEvent.click(within(rows[0]).getByTestId("schema-toggle"));
    const schema = within(rows[0]).getByTestId("schema-panel");
    expect(schema).toHaveTextContent("Columns: result_row_id, period_id, sector_id, co2e_Mt_AR5");
    expect(schema).toHaveTextContent("Primary key: result_row_id");
    expect(schema).toHaveTextContent("Closure: fact_annual sums to the national total per period and configuration");
    expect(schema).toHaveTextContent("fact_annual.csv sha256 8e14aaaa · 648,750 bytes");
    fireEvent.click(within(panel).getByTestId("checksums-toggle"));
    const digests = within(panel).getAllByTestId("digest");
    expect(digests.map((d) => d.textContent)).toEqual(["8e14aaaa", "3d61bbbb", "9f9f"]);
    const cite = within(panel).getByTestId("citation-table");
    expect(within(cite).getByTestId("cite-version")).toHaveTextContent("1.0.0rc42");
    expect(within(cite).getByTestId("identity-rows")).toHaveTextContent("ReleasePakEmis 1.0.0rc42");
    expect(within(cite).getByTestId("identity-rows")).toHaveTextContent("Commitbc1716d6df797d3232daf95122197eaee25fa8bd");
    expect(within(cite).getByTestId("identity-rows")).toHaveTextContent("Data DOIDOI to be inserted at release freeze");
    expect(within(cite).getByTestId("cite-apa")).toHaveTextContent("Ahmad, R. (2026). PakEmis: public-data reconstruction");
    expect(within(cite).getByTestId("cite-bibtex")).toHaveTextContent("@dataset{ahmad2026pakemis,");
    // the version appears inside the citation table only
    const outside = (document.body.textContent ?? "").replace(cite.textContent ?? "", "");
    expect(outside).not.toContain("1.0.0rc");
    fireEvent.click(cards[0]);
    await waitFor(() => expect(screen.queryByTestId("purpose-panel")).toBeNull());
  });
  it("the narrowings: allocations lists the spatial tables, gridded the cubes with NetCDF only; complete carries the zip archive; evidence lists a registry", async () => {
    mount("?purpose=allocations");
    const panel = await screen.findByTestId("purpose-panel");
    await waitFor(() => expect(within(panel).getAllByTestId("product-row").map((r) => r.getAttribute("data-product"))).toEqual(["fact_adm2_month"]));
    fireEvent.click(screen.getAllByTestId("purpose-card")[3]);
    await waitFor(() => expect(screen.getByTestId("purpose-panel")).toHaveAttribute("data-purpose", "gridded"));
    const grid = within(screen.getByTestId("purpose-panel")).getAllByTestId("product-row");
    expect(grid.map((r) => r.getAttribute("data-product"))).toEqual(["pakemis_grid_0p05_monthly"]);
    expect(within(grid[0]).getAllByTestId("format-button").map((b) => b.textContent?.trim())).toEqual(["NetCDF"]);
    fireEvent.click(screen.getAllByTestId("purpose-card")[6]);
    await waitFor(() => expect(screen.getByTestId("purpose-panel")).toHaveAttribute("data-purpose", "complete"));
    const zip = screen.getByTestId("archive-download");
    expect(zip).toHaveAttribute("href", `${BASE}/complete.zip`);
    expect(zip).toHaveTextContent("Download everything as one archive (71 files)");
    expect(screen.getByTestId("archive-note")).toHaveTextContent("not itself hashed");
    expect(within(screen.getByTestId("purpose-panel")).getAllByTestId("product-row")).toHaveLength(8);
    expect(within(screen.getByTestId("purpose-panel")).getByTestId("family-formats")).toHaveTextContent("CSV · Parquet · NetCDF · JSON · ZIP");
    fireEvent.click(screen.getAllByTestId("purpose-card")[5]);
    await waitFor(() => expect(screen.getByTestId("purpose-panel")).toHaveAttribute("data-purpose", "evidence"));
    const reg = within(screen.getByTestId("purpose-panel")).getAllByTestId("product-row");
    expect(reg.map((r) => r.getAttribute("data-kind"))).toEqual(["registry"]);
    fireEvent.click(within(reg[0]).getByTestId("schema-toggle"));
    expect(within(reg[0]).getByTestId("schema-panel")).toHaveTextContent("Registry source: data/emission_factors.csv");
  });
  it("Copy writes the clipboard; Query through the API shows the curl line for the current view; ?receipt= replays the result", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mount("?sector=power&purpose=totals&receipt=0123456789abcdef0123456789abcdef");
    const panel = await screen.findByTestId("purpose-panel");
    fireEvent.click(within(panel).getByTestId("copy-apa"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Ahmad, R. (2026)")));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    fireEvent.click(within(panel).getByTestId("copy-bibtex"));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining("@dataset{ahmad2026pakemis,")));
    const curl = screen.getByTestId("curl-line");
    expect(curl).toHaveTextContent("curl -X POST http://localhost:8000/api/v1/emissions/query/emissions -H 'content-type: application/json' -d '");
    expect(curl).toHaveTextContent('"sectors":["power"]');
    expect(screen.getByTestId("download-metadata")).toHaveAttribute("href", `${BASE}/release_manifest.json`);
    expect(await screen.findByText("Replayed query emissions")).toBeInTheDocument();
    expect(screen.getByText("223.45")).toBeInTheDocument();
    expect(screen.getByText("Show on map")).toHaveAttribute("href", "/?sector=agriculture");
  });
  it("audits: every decimal is a server string; no FY outside the curl line; the version inside the citation table only; no raw id; no avoid-list phrase", async () => {
    const { container } = mount("?purpose=totals");
    const panel = await screen.findByTestId("purpose-panel");
    await waitFor(() => expect(within(panel).getAllByTestId("product-row")).toHaveLength(2));
    fireEvent.click(within(panel).getByTestId("checksums-toggle"));
    const allowed = new Set<string>();
    const add = (s: string) => (s.match(/\d+\.\d+/g) ?? []).forEach((t) => allowed.add(t));
    add(JSON.stringify(RELEASE));
    add(JSON.stringify(PRODUCTS));
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const tokens: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) tokens.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
    for (const t of tokens) expect(allowed.has(t), t).toBe(true);
    const curl = screen.getByTestId("curl-line").textContent ?? "";
    const cite = screen.getByTestId("citation-table").textContent ?? "";
    const text = (container.textContent ?? "").replace(curl, "").replace(cite, "");
    expect(text).not.toContain("FY");
    expect(text).not.toContain("1.0.0rc");
    expect(text).not.toContain("REF_2023_24");
    expect(text).not.toMatch(/(^|[^A-Z0-9(_])AR5(?![)\w])/);
    expect(avoidPhrasesIn(container.textContent ?? "")).toEqual([]);
    for (const el of Array.from(container.querySelectorAll("[title]"))) expect(el.getAttribute("title") ?? "").not.toContain("1.0.0rc");
  });
});
