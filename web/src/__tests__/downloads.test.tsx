import "@testing-library/jest-dom/vitest";
/**
 * /downloads against a mocked GET /products catalogue and a /release carrying citation,
 * identity_line and doi: the release widget (the window from the labels, the DOI note,
 * Release notes -> /methods#release, Verify checksums listing the declared digests), the
 * use-case chips highlighting a family with its footnote, the four product cards (the API's
 * titles, the tags from the dims, Download listing every table's formats with the sha256 as the
 * link's ETag hint, View schema with columns / primary key / rows / digest / closure), Cite the
 * release (APA, BibTeX, the copy buttons writing the clipboard), Query through the API (the
 * curl line for the current view), the receipt replay, and the audits (every decimal a server
 * string; no FY; the version inside the citation only; no avoid-list phrase).
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import DownloadsPage from "@/app/downloads/page";
import { RELEASE, envelope, mockFetch } from "./fixtures";
import { avoidPhrasesIn } from "./vocabulary";

vi.mock("next/navigation", () => ({ usePathname: () => "/downloads", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const BASE = "http://localhost:8000/api/v1/emissions/products";
const fmt = (name: string, ext: string, bytes: number, sha: string, identity = "contract") => ({ ext, filename: `${name}.${ext}`, bytes, sha256: sha, identity, url: `${BASE}/${name}.${ext}` });
const PRODUCTS = {
  release: "PakEmis 1.0.0rc42",
  version: "1.0.0rc42",
  count: 4,
  note: "sha256 is the file's identity.",
  products: [
    { name: "fact_annual", kind: "table", table_kind: "fact", formats: [fmt("fact_annual", "csv", 648750, "8e14aaaa"), fmt("fact_annual", "parquet", 108325, "3d61bbbb", "computed")], rows: 1675, columns: ["result_row_id", "period_id", "sector_id", "co2e_Mt_AR5"], primary_key: ["result_row_id"], aggregation_rule: "sum of co2e_Mt over the rows", closure: "fact_annual sums to the national total per period and configuration" },
    { name: "dim_gas", kind: "table", table_kind: "dim", formats: [fmt("dim_gas", "csv", 120, "9f9f")], rows: 3, columns: ["result_row_id", "gas"], primary_key: ["gas"] },
    { name: "fact_monthly", kind: "table", table_kind: "fact", formats: [fmt("fact_monthly", "csv", 7400000, "abcd")], rows: 16824, columns: ["month", "co2e_Mt_AR5"], primary_key: ["result_row_id"] },
    { name: "pakemis_grid_0p05_monthly", kind: "cube", formats: [fmt("pakemis_grid_0p05_monthly", "nc", 5800000, "cube1", "manifest")] },
  ],
  families: [
    { id: "annual", title: "Annual inventory", description: "Nine fiscal years by sector, IPCC category, component, gas, configuration and GWP basis, with every dimension table.", tables: ["fact_annual", "dim_gas"], formats: ["csv", "parquet"] },
    { id: "monthly", title: "Monthly inventory", description: "All 108 months with annual closure, temporal profiles and evidence classifications.", tables: ["fact_monthly"], formats: ["csv", "parquet"] },
    { id: "spatial", title: "Spatial inventory", description: "Reference-year administrative and 0.05-degree allocations with fallback, lineage and unallocated-mass tables.", tables: ["pakemis_grid_0p05_monthly"], formats: ["csv", "parquet", "nc"] },
    { id: "uncertainty", title: "Uncertainty and scenarios", description: "Common correlated draws, uncertainty summaries, completeness ledgers, transfers and the named structural configurations.", tables: [], formats: ["csv", "parquet"] },
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

function mount(search = "") {
  const Wrapper = withNuqsTestingAdapter({ searchParams: search, hasMemory: true });
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
  it("renders the release widget, the product cards from the catalogue and the tags from the dims", async () => {
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: "Downloads & API" })).toBeInTheDocument();
    expect(screen.getByTestId("api-docs")).toHaveAttribute("href", "http://localhost:8000/api/v1/emissions/docs");
    expect(screen.getByTestId("release-card-sentence")).toHaveTextContent("2020–21 to 2023–24 · non-LULUCF · data DOI to be inserted at release freeze");
    expect(screen.getByTestId("release-notes")).toHaveAttribute("href", "/methods#release");
    const cards = await screen.findAllByTestId("product-card");
    expect(cards.map((c) => c.getAttribute("data-family"))).toEqual(["annual", "monthly", "spatial", "uncertainty"]);
    await waitFor(() => expect(within(cards[0]).getByText("Annual inventory")).toBeInTheDocument());
    expect(cards[0]).toHaveTextContent("with every dimension table.");
    expect(within(cards[0]).getByTestId("product-tag")).toHaveTextContent("2020–21 to 2023–24 · National");
    expect(within(cards[0]).getByTestId("product-formats")).toHaveTextContent("CSV · Parquet");
    expect(within(cards[1]).getByTestId("product-tag")).toHaveTextContent("4 months · timing evidence graded");
    expect(within(cards[2]).getByTestId("product-tag")).toHaveTextContent("2023–24 · Monthly grid");
    expect(within(cards[2]).getByTestId("product-formats")).toHaveTextContent("CSV · Parquet · NetCDF");
    expect(within(cards[3]).getByTestId("product-tag")).toHaveTextContent("Common draw IDs · Reference and alternatives");
    expect(within(cards[0])).toBeTruthy();
    expect(cards[0]).toHaveTextContent("2 tables");
    expect(screen.getAllByTestId("nav-link").find((a) => a.textContent === "Downloads")).toHaveAttribute("aria-current", "page");
  });
  it("Download lists every table's formats with the sha256 as the link's ETag hint; View schema lists columns, key, rows, digest and closure", async () => {
    mount();
    const cards = await screen.findAllByTestId("product-card");
    await waitFor(() => expect(within(cards[0]).getByTestId("product-download")).toBeEnabled());
    fireEvent.click(within(cards[0]).getByTestId("product-download"));
    const files = within(cards[0]).getAllByTestId("product-file");
    expect(files.map((f) => f.getAttribute("href"))).toEqual([`${BASE}/fact_annual.csv`, `${BASE}/fact_annual.parquet`, `${BASE}/dim_gas.csv`]);
    expect(files[0]).toHaveAttribute("data-sha256", "8e14aaaa");
    expect(files[0]).toHaveAttribute("title", expect.stringContaining("ETag / sha256 8e14aaaa"));
    expect(files[0]).toHaveTextContent("CSV");
    expect(files[1]).toHaveTextContent("Parquet");
    fireEvent.click(within(cards[0]).getByTestId("view-schema"));
    const schema = within(cards[0]).getByTestId("product-schema");
    expect(schema).toHaveTextContent("Columns: result_row_id, period_id, sector_id, co2e_Mt_AR5");
    expect(schema).toHaveTextContent("Primary key: result_row_id");
    expect(schema).toHaveTextContent("Rows: 1,675");
    expect(schema).toHaveTextContent("Closure: fact_annual sums to the national total per period and configuration");
    expect(schema).toHaveTextContent("fact_annual.csv sha256 8e14aaaa · 648,750 bytes");
    fireEvent.click(within(cards[2]).getByTestId("product-download"));
    expect(within(cards[2]).getAllByTestId("product-file")[0]).toHaveTextContent("NetCDF");
  });
  it("a use-case chip highlights its family with the footnote; Verify checksums lists the declared digests", async () => {
    mount();
    const chips = await screen.findAllByTestId("use-case-chip");
    expect(chips.map((c) => c.textContent)).toEqual(["Compare years", "Study seasonality", "Make a map", "Analyse uncertainty"]);
    fireEvent.click(chips[0]);
    expect(screen.getByTestId("use-case-footnote")).toHaveTextContent("Annual inventory is recommended for comparing fiscal years.");
    const cards = screen.getAllByTestId("product-card");
    expect(cards[0]).toHaveAttribute("data-highlighted", "true");
    expect(cards[1]).toHaveAttribute("data-highlighted", "false");
    fireEvent.click(chips[2]);
    expect(screen.getByTestId("use-case-footnote")).toHaveTextContent("Spatial inventory is recommended for making a map");
    expect(cards[2]).toHaveAttribute("data-highlighted", "true");
    fireEvent.click(screen.getByTestId("verify-checksums"));
    const digests = await screen.findByTestId("digests");
    expect(digests).toHaveTextContent("semantic_release.json");
    expect(digests).toHaveTextContent("0d612d2e19ec055cf7768f86cb5dffd2b803a0856a22a9e36c0a9af03ef28d4d");
    expect(digests).toHaveTextContent("fact_annual.csv");
    await waitFor(() => expect(digests).toHaveTextContent("fact_annual.parquet"));
    expect(digests).toHaveTextContent("3d61bbbb");
  });
  it("Cite the release prints APA and BibTeX and copies them; Query through the API shows the curl line for the current view", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mount("?sector=power");
    expect(await screen.findByTestId("cite-apa")).toHaveTextContent("Ahmad, R. (2026). PakEmis: public-data reconstruction of Pakistan's non-LULUCF emissions, 2020–21 to 2023–24 (Version 1.0.0rc42) [Data set].");
    expect(screen.getByTestId("cite-doi-note")).toHaveTextContent("DOI to be inserted at release freeze.");
    expect(screen.getByTestId("cite-bibtex")).toHaveTextContent("@dataset{ahmad2026pakemis,");
    fireEvent.click(screen.getByTestId("copy-apa"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Ahmad, R. (2026)")));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("copy-bibtex"));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining("@dataset{ahmad2026pakemis,")));
    const curl = screen.getByTestId("curl-line");
    expect(curl).toHaveTextContent("curl -X POST http://localhost:8000/api/v1/emissions/query/emissions -H 'content-type: application/json' -d '");
    expect(curl).toHaveTextContent('"sectors":["power"]');
    expect(curl).toHaveTextContent('"periods":["FY2023-24"]');
    expect(screen.getByTestId("download-metadata")).toHaveAttribute("href", `${BASE}/release_manifest.json`);
    expect(screen.getByTestId("open-docs")).toHaveAttribute("href", "http://localhost:8000/api/v1/emissions/docs");
  });
  it("?receipt= replays the result as a frame with Show on map", async () => {
    mount("?receipt=0123456789abcdef0123456789abcdef");
    expect(await screen.findByText("Replayed query emissions")).toBeInTheDocument();
    expect(screen.getByText("223.45")).toBeInTheDocument();
    expect(screen.getByText("Show on map")).toHaveAttribute("href", "/map?sector=agriculture");
  });
  it("audits: every decimal is a server string; no FY outside the curl line; the version inside the citation only; no avoid-list phrase", async () => {
    const { container } = mount();
    await screen.findByTestId("cite-apa");
    await waitFor(() => expect(screen.getAllByTestId("product-card")[0]).toHaveTextContent("2 tables"));
    fireEvent.click(screen.getByTestId("verify-checksums"));
    const allowed = new Set<string>();
    const add = (s: string) => (s.match(/\d+\.\d+/g) ?? []).forEach((t) => allowed.add(t));
    add(JSON.stringify(RELEASE));
    add(JSON.stringify(PRODUCTS));
    add(JSON.stringify(FAMILIES_COPY_DECIMALS));
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const tokens: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) tokens.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
    for (const t of tokens) expect(allowed.has(t), t).toBe(true);
    const curl = screen.getByTestId("curl-line").textContent ?? "";
    const cite = screen.getByTestId("cite-card").textContent ?? "";
    const text = (container.textContent ?? "").replace(curl, "").replace(cite, "");
    expect(text).not.toContain("FY");
    expect(text).not.toContain("1.0.0rc");
    expect(text).not.toContain("REF_2023_24");
    expect(text).not.toMatch(/(^|[^A-Z0-9(])AR5(?![)\w])/);
    expect(avoidPhrasesIn(container.textContent ?? "")).toEqual([]);
    for (const el of Array.from(container.querySelectorAll("[title]"))) expect(el.getAttribute("title") ?? "").not.toContain("1.0.0rc");
  });
});

/** The mockups' product descriptions carry one decimal ("0.05°"), authored, not a value. */
const FAMILIES_COPY_DECIMALS = ["0.05"];
