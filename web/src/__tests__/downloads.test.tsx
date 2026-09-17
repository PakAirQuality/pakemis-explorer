import "@testing-library/jest-dom/vitest";
/**
 * /downloads, reworked 2026-09-16 into five collections a reader can name. The page used to offer
 * `fact_annual` and `dim_category` under a purpose picker; now each download has a title and a
 * sentence, and the filename sits beneath it.
 *
 * Two audits carry this file. The first is the anti-drift check: every filename the authored
 * catalogue names must be a file the release actually ships — an authored layer beside a generated
 * one is the arrangement that rots, and this makes a rename fail the build instead of 404 a reader.
 * The second is the original sweep: every decimal on screen is a string the server sent, and no `FY`,
 * version string, configuration id or bare `AR5` appears outside the citation table.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import DownloadsPage from "@/app/downloads/page";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { RELEASE, envelope, mockFetch } from "./fixtures";
import { COLLECTIONS, catalogueFiles, tableStems } from "@/components/downloads/catalogue";
import { PALE_BORDER, PALE_FILL, ROW_ACTIONS, ROW_COVERAGE, ROW_GRID } from "@/components/downloads/Downloads";
import { avoidPhrasesIn } from "./vocabulary";

vi.mock("next/navigation", () => ({ usePathname: () => "/downloads", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const BASE = "http://localhost:8000/api/v1/emissions/products";
const fmt = (name: string, ext: string, bytes: number, sha: string, identity = "contract") => ({ ext, filename: `${name}.${ext}`, bytes, sha256: sha, identity, url: `${BASE}/${name}.${ext}` });
const PRODUCTS = {
  release: "PakEmis 1.0.0rc42",
  version: "1.0.0rc42",
  count: 26,
  note: "sha256 is the file's identity.",
  products: [
    { name: "fact_annual", kind: "table", table_kind: "fact", formats: [fmt("fact_annual", "csv", 648750, "8e14aaaa"), fmt("fact_annual", "parquet", 108325, "3d61bbbb", "computed")], rows: 1675, columns: ["result_row_id", "period_id", "reporting_sector", "co2e_Mt_AR5"], primary_key: ["result_row_id"], aggregation_rule: "sum of co2e_Mt over the rows", closure: "fact_annual sums to the national total per period and configuration" },
    { name: "dim_gas", kind: "table", table_kind: "dim", formats: [fmt("dim_gas", "csv", 120, "9f9f")], rows: 3, columns: ["result_row_id", "gas"], primary_key: ["gas"] },
    { name: "fact_monthly", kind: "table", table_kind: "fact", formats: [fmt("fact_monthly", "csv", 7400000, "abcd"), fmt("fact_monthly", "parquet", 900000, "abce", "computed")], rows: 16824, columns: ["month", "co2e_Mt_AR5"], primary_key: ["result_row_id"] },
    { name: "fact_adm2_month", kind: "table", table_kind: "fact", formats: [fmt("fact_adm2_month", "csv", 5000000, "adm2csv")], rows: 40000, columns: ["shape_id", "month"], primary_key: ["result_row_id"] },
    { name: "pakemis_grid_0p05_monthly", kind: "cube", formats: [fmt("pakemis_grid_0p05_monthly", "nc", 5800000, "cube1", "manifest")] },
    { name: "fact_uncertainty", kind: "table", table_kind: "fact", formats: [fmt("fact_uncertainty", "csv", 20000, "unc1"), fmt("fact_uncertainty", "parquet", 7000, "unc1p", "computed")], rows: 80, columns: ["category", "resolution"], primary_key: ["result_row_id"] },
    { name: "emission_factors", kind: "registry", source_path: "data/emission_factors.csv", formats: [fmt("emission_factors", "csv", 30000, "ef01", "manifest_sources")] },
    { name: "semantic_release", kind: "metadata", formats: [fmt("semantic_release", "json", 12000, "0d612d2e", "verified")] },
    { name: "fact_adm1_year", kind: "table", table_kind: "fact", formats: [fmt("fact_adm1_year", "csv", 1447347, "adm1yr"), fmt("fact_adm1_year", "parquet", 436618, "adm1yrp", "computed")], rows: 7973, columns: ["province", "reporting_sector", "co2e_Mt_AR5"], primary_key: ["result_row_id"] },
    { name: "fact_adm2_year", kind: "table", table_kind: "fact", formats: [fmt("fact_adm2_year", "csv", 6691971, "adm2yr"), fmt("fact_adm2_year", "parquet", 1668641, "adm2yrp", "computed")], rows: 36387, columns: ["shape_id", "allocation_status"], primary_key: ["result_row_id"] },
    { name: "fact_air_panel", kind: "table", table_kind: "fact", formats: [fmt("fact_air_panel", "csv", 103564, "airpanel"), fmt("fact_air_panel", "parquet", 32755, "airpanelp", "computed")], rows: 900, columns: ["pollutant", "emissions_kt"], primary_key: ["result_row_id"] },
    { name: "fact_air_adm1_year", kind: "table", table_kind: "fact", formats: [fmt("fact_air_adm1_year", "csv", 2236666, "airadm1"), fmt("fact_air_adm1_year", "parquet", 512000, "airadm1p", "computed")], rows: 16104, columns: ["province", "pollutant"], primary_key: ["result_row_id"] },
    { name: "fact_air_adm2_year", kind: "table", table_kind: "fact", formats: [fmt("fact_air_adm2_year", "csv", 11000000, "airadm2c"), fmt("fact_air_adm2_year", "parquet", 3016057, "airadm2", "computed")], rows: 90720, columns: ["shape_id", "pollutant", "allocation_status"], primary_key: ["result_row_id"] },
    { name: "fact_air_absence_screening", kind: "table", table_kind: "fact", formats: [fmt("fact_air_absence_screening", "csv", 24648, "airabs"), fmt("fact_air_absence_screening", "parquet", 9000, "airabsp", "computed")], rows: 126, columns: ["pollutant", "scope"], primary_key: ["result_row_id"] },
    { name: "parameters", kind: "registry", source_path: "data/parameters.csv", formats: [fmt("parameters", "csv", 6962, "params", "manifest_sources")] },
    { name: "fact_uncertainty_series", kind: "table", table_kind: "fact", formats: [fmt("fact_uncertainty_series", "csv", 22139, "uncser"), fmt("fact_uncertainty_series", "parquet", 8000, "uncserp", "computed")], rows: 122, columns: ["kind", "low_pct"], primary_key: ["result_row_id"] },
    { name: "dim_configuration", kind: "table", table_kind: "dim", formats: [fmt("dim_configuration", "csv", 21098, "dimcfg"), fmt("dim_configuration", "parquet", 7100, "dimcfgp", "computed")], rows: 30, columns: ["configuration_id"], primary_key: ["configuration_id"] },
    { name: "fact_completeness", kind: "table", table_kind: "fact", formats: [fmt("fact_completeness", "csv", 47596, "cmp"), fmt("fact_completeness", "parquet", 15000, "cmpp", "computed")], rows: 91, columns: ["notation_key", "claim_class"], primary_key: ["result_row_id"] },
    { name: "fact_completeness_mass", kind: "table", table_kind: "fact", formats: [fmt("fact_completeness_mass", "csv", 11496, "cmpm"), fmt("fact_completeness_mass", "parquet", 5000, "cmpmp", "computed")], rows: 36, columns: ["gap_id"], primary_key: ["result_row_id"] },
    { name: "pakemis_source_register", kind: "registry", source_path: "data/registries/pakemis_source_register.csv", formats: [fmt("pakemis_source_register", "csv", 127863, "srcreg", "manifest_sources")] },
    { name: "pakemis_source_streams", kind: "registry", source_path: "data/registries/pakemis_source_streams.csv", formats: [fmt("pakemis_source_streams", "csv", 136430, "srcstr", "manifest_sources")] },
    { name: "dim_stream", kind: "table", table_kind: "dim", formats: [fmt("dim_stream", "csv", 99995, "dimstr"), fmt("dim_stream", "parquet", 30000, "dimstrp", "computed")], rows: 202, columns: ["source_stream_id"], primary_key: ["source_stream_id"] },
    { name: "pakemis_grid_0p05_annual_ref_fy2015_16_fy2023_24", kind: "cube", formats: [fmt("pakemis_grid_0p05_annual_ref_fy2015_16_fy2023_24", "nc", 9507576, "cubeann", "manifest")] },
    { name: "pakemis_grid_0p05_monthly_survey", kind: "cube", formats: [fmt("pakemis_grid_0p05_monthly_survey", "nc", 3953003, "cubesur", "manifest")] },
    { name: "pakemis_air_grid_0p05_annual_fy2015_16_fy2023_24", kind: "cube", formats: [fmt("pakemis_air_grid_0p05_annual_fy2015_16_fy2023_24", "nc", 8649428, "cubeair", "manifest")] },
    { name: "pakemis_grid_0p1_edgar_aligned", kind: "cube", formats: [fmt("pakemis_grid_0p1_edgar_aligned", "nc", 3035658, "cubeedg", "manifest")] },
    // rc57: the technical record behind the readable activity tables, and their column guide
    { name: "fact_activity_source_details", kind: "table", table_kind: "fact", formats: [fmt("fact_activity_source_details", "csv", 40000000, "actdet")], rows: 101808, columns: ["Record ID", "source_id", "value", "unit"], primary_key: ["result_row_id"] },
    { name: "dim_activity_columns", kind: "table", table_kind: "dim", formats: [fmt("dim_activity_columns", "csv", 60000, "actcol")], rows: 250, columns: ["file", "column", "meaning"], primary_key: ["file", "column"] },
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
      if (url.includes("/receipt/")) return envelope([{ display: "223.454", display_short: "223.45", unit_short: "Mt CO₂e", group: { reporting_sector: "agriculture" } }], { request: JSON.stringify({ _type: "QueryEmissions", periods: ["FY2023-24"], reporting_sectors: ["agriculture"], group_by: ["reporting_sector"] }), receipt: "0123456789abcdef0123456789abcdef" });
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

describe("the catalogue is held to the release", () => {
  it("EVERY FILENAME THE PAGE NAMES IS A FILE THE RELEASE SHIPS", () => {
    // THE ASSERTION I WOULD MOST WANT KEPT IN THIS FILE. catalogue.ts is an authored layer beside a
    // generated one — titles are ours, filenames are the release's — and that is exactly the
    // arrangement that drifts: a table is renamed upstream, the page keeps pointing at the old name,
    // and a reader gets a 404 nobody noticed. Reading the payload rather than a fixture is the point;
    // a fixture would only prove the page agrees with itself.
    //
    // The three roots are the ones ProductCatalog serves from, so this is a faithful stand-in for
    // the API without needing one running.
    const releases = path.join(__dirname, "../../../data/releases");
    const version = readdirSync(releases).filter((d) => d.startsWith("1.")).sort().pop()!;
    const roots = ["outputs/semantic", "outputs", "data/registries"].map((r) => path.join(releases, version, r));
    const shipped = new Set(roots.flatMap((r) => (existsSync(r) ? readdirSync(r) : [])));
    expect(shipped.size).toBeGreaterThan(50);
    const missing = catalogueFiles().filter((f) => !shipped.has(f));
    expect(missing, `named by catalogue.ts but not shipped in ${version}`).toEqual([]);
  });

  it("names no file twice, and every collection has something to say", () => {
    for (const c of COLLECTIONS) {
      expect(c.downloads.length, c.id).toBeGreaterThan(0);
      for (const d of c.downloads) {
        expect(d.title && d.dek, d.id).toBeTruthy();
        // a published collection must offer a file; an unpublished one must explain itself instead
        if (d.pending) expect(d.files, d.id).toEqual([]);
        else expect(d.files.length, d.id).toBeGreaterThan(0);
      }
    }
    const activity = COLLECTIONS.find((c) => c.id === "activity")!;
    expect(activity.downloads.length).toBeGreaterThan(15);
  });

  it("EVERY DOWNLOAD NAMES EXACTLY ONE TABLE", () => {
    // THE ASSERTION I WOULD MOST WANT KEPT IN THIS FILE, beside the drift check. A download's files
    // are the FORMATS of one table. When two different tables shared a row, the page rendered them
    // as "CSV" and "Parquet" - so Air's province/district row handed you provinces from one button
    // and districts from the other, and nothing on screen could tell you. Both buttons downloaded
    // something; both looked right. Only the filenames give it away.
    for (const c of COLLECTIONS) {
      for (const d of c.downloads) {
        expect(tableStems(d), `${d.id} names more than one table`).toHaveLength(d.pending ? 0 : 1);
        // ⚠ AND EXACTLY ONE FORMAT OF IT. The stem check above cannot see the difference between one
        // format and two - `x.csv` and `x.parquet` share a stem - so it would happily let the Parquet
        // link back onto the page. Parquet still ships in the release and is still served by
        // /products; the page offers the CSV, or the NetCDF for a grid, and nothing else.
        expect(d.files.length, `${d.id} offers more than one format`).toBe(d.pending ? 0 : 1);
        expect(d.files.filter((f) => f.endsWith(".parquet")), d.id).toEqual([]);
      }
    }
  });

  it("every download carries a glyph", () => {
    // lucide icons are forwardRef objects, not functions - what matters is that none is missing;
    // that each actually reaches the screen is asserted against the rendered rows below
    for (const c of COLLECTIONS) for (const d of c.downloads) expect(d.icon, d.id).toBeDefined();
  });
});

describe("/downloads", () => {
  it("leads with the five collections, each download titled for a reader; no version anywhere", async () => {
    mount();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Download the data");
    expect(screen.getByTestId("api-docs")).toHaveAttribute("href", "http://localhost:8000/api/v1/emissions/docs");
    expect(screen.getByTestId("archive-download")).toHaveAttribute("href", `${BASE}/complete.zip`);
    expect(screen.getByTestId("hero-chips")).toHaveTextContent("2020–21 to 2023–24");

    const collections = await screen.findAllByTestId("collection");
    expect(collections.map((c) => c.getAttribute("data-collection"))).toEqual(["emissions", "activity", "air", "methods", "maps"]);
    // the reader sees titles, not table names
    const emissions = collections[0];
    expect(within(emissions).getAllByTestId("download-row").map((r) => within(r).getAllByRole("paragraph")[0].textContent))
      .toEqual(["Annual emissions", "Provincial emissions", "District emissions", "Monthly emissions"]);
    // by the file it names, not by its position: an index would pin the order of the action cluster
    // rather than the thing that matters, which is that the row downloads this table's own file
    expect(within(emissions).getAllByTestId("download-row")[0].querySelector('[data-file="fact_annual.csv"]')).toHaveAttribute("href", `${BASE}/fact_annual.csv`);
    expect(within(emissions).getAllByTestId("row-count")[0]).toHaveTextContent("1,675 rows");
    // the version belongs to the citation table, which lives in the API mode
    expect(screen.queryByTestId("citation-table")).toBeNull();
    expect(document.body.textContent).not.toContain("1.0.0rc");
  });

  it("THE TABS AND THE FIRST HEADING SHARE ONE CARD, AND IT IS THE BANNER'S CARD", async () => {
    // ⚠ THE ASSERTION I WOULD MOST WANT KEPT HERE, because it is the whole of what was asked and
    // nothing else in this file can see it: the tab strip sat loose on the page ground, and a later
    // edit could float it back out without a single test noticing. Two halves - the tabs are INSIDE
    // the first collection's header, and that header is the same card as the hero banner. A copied
    // class string would drift; a shared constant read by both cannot.
    mount();
    const collections = await screen.findAllByTestId("collection");
    const first = within(collections[0]).getByTestId("collection-header");
    expect(within(first).getAllByTestId("collection-tab").length).toBe(6);
    expect(within(first).getByRole("heading", { level: 2 })).toHaveTextContent("Emissions estimates");
    // one tab strip on the page, and it is that one
    expect(screen.getAllByTestId("collection-tab")).toHaveLength(6);
    for (const c of collections.slice(1)) {
      expect(within(c).queryAllByTestId("collection-tab"), c.getAttribute("data-collection") ?? "").toEqual([]);
      expect(within(c).getByTestId("collection-header")).toBeInTheDocument();
    }
    // the card still wears the banner's own border and fill - split across two elements now, but
    // read from the same two constants, so they cannot drift apart
    const hero = screen.getByTestId("downloads-hero");
    expect(hero.className).toContain(PALE_BORDER);
    expect(hero.className).toContain(PALE_FILL);
    expect(within(collections[0]).getByTestId("collection-card").className).toContain(PALE_BORDER);
    expect(first.className).toContain(PALE_FILL);
  });

  it("THE HEADING, THE RULE AND THE TABLE ARE ONE CARD, WITH NO GAP BETWEEN THEM", async () => {
    // ⚠ THE ASSERTION I WOULD MOST WANT KEPT HERE. The header and the table were two cards with page
    // ground showing between them, two borders and two saffron lines. Nothing in a test can see a
    // gap, so what is asserted instead is the structure that removes it: one element holds the
    // heading band, the rule and the rows, and it clips - without `overflow-hidden` the band's
    // square corners would poke through the card's round ones and the join would look broken.
    mount();
    const collections = await screen.findAllByTestId("collection");
    for (const c of collections) {
      const id = c.getAttribute("data-collection") ?? "";
      const cards = within(c).getAllByTestId("collection-card");
      expect(cards, id).toHaveLength(1);
      const card = cards[0];
      expect(card.className, id).toContain("overflow-hidden");
      for (const part of ["collection-header", "collection-rule"]) {
        expect(card.contains(within(c).getByTestId(part)), `${id}: ${part} is outside the card`).toBe(true);
      }
      const body = within(c).queryAllByTestId("download-row").concat(within(c).queryAllByTestId("download-card"));
      expect(body.length, id).toBeGreaterThan(0);
      expect(card.contains(body[0]), `${id}: the rows are outside the card`).toBe(true);
      // and nothing between the band and the rule may push them apart
      expect(within(c).getByTestId("collection-rule").className, id).not.toMatch(/\bmt-\d/);
    }
  });

  it("every collection carries the saffron rule, the activity section included", async () => {
    // it used to be skipped there, because that section had no white panel to cap; it has one now,
    // and a skipped rule is exactly the sort of special case that creeps back
    mount();
    const collections = await screen.findAllByTestId("collection");
    expect(collections).toHaveLength(5);
    for (const c of collections) {
      expect(within(c).getAllByTestId("collection-rule"), c.getAttribute("data-collection") ?? "").toHaveLength(1);
    }
  });

  it("EVERY ACTIVITY COLLECTION IS A REAL DOWNLOAD NOW", async () => {
    // ⚠ this page said "not part of the published release yet" for the whole collection until rc55,
    // and for three of its nine until rc56. The assertion that matters is that no card is left
    // claiming to be a placeholder, and that every row actually offers a file.
    mount();
    await screen.findAllByTestId("collection");
    const activity = screen.getAllByTestId("collection").find((c) => c.getAttribute("data-collection") === "activity")!;
    expect(within(activity).queryAllByTestId("download-card")).toEqual([]);
    const rows = within(activity).getAllByTestId("download-row");
    expect(rows.length).toBeGreaterThan(15);
    for (const row of rows) expect(within(row).getAllByTestId("format-button").length).toBe(1);
    for (const c of COLLECTIONS) for (const d of c.downloads) expect(d.pending).toBeUndefined();
  });

  it("the search matches a column name, and a tab narrows to one collection", async () => {
    const onUrlUpdate = vi.fn();
    mount("", onUrlUpdate);
    await screen.findAllByTestId("collection");

    // "allocation_status" is a COLUMN of the two district tables, not a word on either card - the
    // search reaches into the served schema so a reader can find a table by what is in it
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "allocation_status" } });
    await waitFor(() => expect(screen.getAllByTestId("download-row")).toHaveLength(2));
    expect(screen.getAllByTestId("download-row").map((r) => r.getAttribute("data-id"))).toEqual(["district", "air-district"]);

    // livestock is a published table now, not a placeholder card
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "livestock" } });
    await waitFor(() => expect(screen.getAllByTestId("download-row")).toHaveLength(1));
    expect(screen.getByTestId("download-row")).toHaveAttribute("data-id", "livestock");
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "zzzz" } });
    await waitFor(() => expect(screen.getByTestId("no-matches")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "" } });
    fireEvent.click(screen.getAllByTestId("collection-tab").find((t) => t.getAttribute("data-collection") === "maps")!);
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(onUrlUpdate.mock.calls.at(-1)![0].queryString).toContain("show=maps");
  });

  it("EVERY ROW ALIGNS ON FIXED TRAILING COLUMNS, with no breakpoint doing the work", async () => {
    // ⚠ WHAT ACTUALLY ALIGNS THE COLUMNS is the two trailing blocks having FIXED widths - the text
    // column then absorbs every pixel of slack, so COVERAGE starts and the buttons end at the same x
    // on every row. An `auto` action cluster sizes to its own contents, which is how the columns
    // went ragged (413, 465, 486, 542, 559, 635 down one page). Asserting the shared row class alone
    // would not catch that, so the trailing widths are asserted too - and none of it is behind a
    // media query, because a `lg:` grid rendered stacked on one machine and four-across on another
    // at the same window width.
    mount();
    await screen.findAllByTestId("collection");
    const rows = screen.getAllByTestId("download-row");
    expect(rows.length).toBeGreaterThan(10);
    for (const cls of [ROW_GRID, ROW_COVERAGE, ROW_ACTIONS]) expect(cls).not.toMatch(/\b(sm|md|lg|xl):(w-|flex-|grid-)/);
    for (const r of rows) {
      const id = r.getAttribute("data-id") ?? "";
      expect(r.className, id).toContain(ROW_GRID);
      expect(r.querySelector(`.${CSS.escape("w-44")}`), `${id} coverage is not a fixed width`).not.toBeNull();
      expect(r.querySelector(`.${CSS.escape("w-56")}`), `${id} actions are not a fixed width`).not.toBeNull();
      expect(within(r).getByTestId("download-icon")).toBeInTheDocument();
    }
  });

  it("a preview reads the file's own first rows", async () => {
    mount();
    await screen.findAllByTestId("collection");
    // the range comes back mid-row, as a range always does
    const chunk = "period_id,reporting_sector,co2e_Mt_AR5\n2023-24,agriculture,223.45\n2023-24,power,57.8";
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("fact_annual.csv")) {
        expect(String((init?.headers as Record<string, string>).Range)).toContain("bytes=0-");
        return { ok: true, status: 206, text: async () => chunk } as unknown as Response;
      }
      return (inner as typeof fetch)(url, init);
    }));
    fireEvent.click(within(screen.getAllByTestId("download-row")[0]).getByTestId("preview"));
    const drawer = await screen.findByTestId("preview-drawer");
    expect(within(drawer).getByTestId("preview-file")).toHaveTextContent("fact_annual.csv");
    await waitFor(() => expect(within(drawer).getAllByTestId("preview-row")).toHaveLength(1));
    // the second row was cut in half by the range and is NOT shown
    expect(drawer.textContent).toContain("agriculture");
    expect(drawer.textContent).not.toContain("57.8");
    expect(within(drawer).getByTestId("preview-download")).toHaveAttribute("href", `${BASE}/fact_annual.csv`);
  });

  it("audits: every decimal is a server string; no FY, no version, no raw id, no avoid-list phrase", async () => {
    const { container } = mount();
    await screen.findAllByTestId("collection");
    const allowed = new Set<string>();
    const add = (s: string) => (s.match(/\d+\.\d+/g) ?? []).forEach((t) => allowed.add(t));
    add(JSON.stringify(RELEASE));
    add(JSON.stringify(PRODUCTS));
    // ⚠ THIS IS WHY SIZES ARE NOT WORDED ON SCREEN. "7.4 MB" is a decimal the browser computed, and
    // it would fail here exactly as an invented figure would; bytesWords lives in the title instead.
    const sweep = (exclude: string[] = []) => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const tokens: string[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) tokens.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
      for (const t of tokens) expect(allowed.has(t), t).toBe(true);
      let text = container.textContent ?? "";
      for (const x of exclude) text = text.replace(x, "");
      expect(text).not.toContain("FY");
      expect(text).not.toContain("1.0.0rc");
      expect(text).not.toContain("REF_2023_24");
      expect(text).not.toMatch(/(^|[^A-Z0-9(_])AR5(?![)\w])/);
      expect(avoidPhrasesIn(container.textContent ?? "")).toEqual([]);
    };
    sweep();
    fireEvent.click(screen.getByTestId("open-api-mode"));
    const curl = await screen.findByTestId("curl-line");
    await screen.findByTestId("citation-table");
    sweep([curl.textContent ?? "", screen.getByTestId("citation-table").textContent ?? ""]);
    for (const el of Array.from(container.querySelectorAll("[title]"))) expect(el.getAttribute("title") ?? "").not.toContain("1.0.0rc");
  });
});
