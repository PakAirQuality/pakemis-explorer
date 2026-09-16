import "@testing-library/jest-dom/vitest";
/**
 * /methods: the sector cards over mocked get_evidence / get_method / get_completeness /
 * query_emissions envelopes (the eyebrow from the module's IPCC codes, the status badge from
 * the NE rows, the four steps with the release's lists and the sector envelope's
 * display_short, the evidence dimensions worded verbatim from dim_evidence_class, the module's
 * NE categories, View equations, Inspect sources, Open data rows), the search narrowing the
 * grid, a tile switching the card through the URL; the methodology prose still renders its
 * sections from the release (the version printed once, under Release); the claim-record
 * browser (Sector → Category → Gas → Place → Period issuing one query_emissions and opening
 * the record of its cell, the URL's ?claim= as the permalink, a category off the national
 * grain refused by name and shown, a permalink reopening the record); and the audits
 * (decimals are server strings, no FY, no raw id, no avoid-list phrase).
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import MethodsPage from "@/app/methods/page";
import MethodologyPage from "@/app/methodology/page";
import { SectorRoute } from "@/components/methods/SectorRoute";
import { SectorsIndex } from "@/components/methods/SectorsIndex";
import { EvidencePage } from "@/components/methods/EvidencePage";
import { RELEASE, envelope, mockFetch, refusal } from "./fixtures";
import { CLAIM } from "./claimFixture";
import { avoidPhrasesIn } from "./vocabulary";

const pathname = { value: "/methods" };
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value, useRouter: () => ({ push, replace }) }));

const BBOXES = { adm1: { "Azad Kashmir": [73, 33, 75, 35], Balochistan: [61, 24, 70, 32], "Gilgit-Baltistan": [72, 34, 77, 37], "Islamabad Capital Territory": [72.8, 33.5, 73.4, 33.9], "Khyber Pakhtunkhwa": [69, 31, 74, 37], Punjab: [69, 27, 75, 34], Sindh: [66, 23, 71, 28] }, adm2: {} };

const stream = (module: string, id: string, code: string, category: string, sub: string, source: string, e: string, t: string, s: string) => ({
  display: `${e} / ${t} / ${s}`, unit: "evidence", value: undefined,
  extra: { source_stream_id: id, module, ipcc_code: code, ipcc_category: category, sub_category: sub, source_id: source, evidence_class: e, temporal_class: t, spatial_class_measured: s, placement_class: "diffuse_by_nature", allocation_surface: "glw_livestock" },
});
const STREAMS = [
  stream("agriculture", "agriculture|enteric-fermentation|buffalo|ch4", "3.A", "Enteric fermentation", "buffalo", "pbs_agricultural_census_and_economic_survey", "E2", "T4", "S3"),
  stream("agriculture", "agriculture|rice|ch4", "3.C", "Rice cultivation", "rice", "economic_survey_2023_24_rice_area", "E3", "T3", "S3"),
  stream("power", "power|grid|coal|co2", "1.A.1.a", "Public electricity and heat production", "coal", "nepra_state_of_industry_plant_fuel", "E1", "T2", "S1"),
  stream("residential", "residential|firewood|ch4", "1.A.4.b", "Residential", "firewood", "hies_2024_25_firewood", "E2", "T3", "S3"),
];
const RULES = [
  { display: "ipcc2006_v4_ch10_eq10.19_enteric_ch4", unit: "method", value: undefined, extra: { sector: "agriculture", category: "Enteric fermentation", method_id: "ipcc2006_v4_ch10_eq10.19_enteric_ch4", tier: "T1", equation: "2006 V4 Ch10 Eq 10.19/10.20", notes: "Country-specific head counts from the agricultural census; IPCC default emission factors by species", uncertainty_model_id: "product_lognormal_activity_x_ef" } },
  { display: "ipcc2006_v4_ch5_eq5.1_rice_ch4", unit: "method", value: undefined, extra: { sector: "agriculture", category: "Rice cultivation", method_id: "ipcc2006_v4_ch5_eq5.1_rice_ch4", tier: "T1", equation: "2006 V4 Ch5 Eq 5.1", notes: "Harvested area by water regime", uncertainty_model_id: "product_lognormal_activity_x_ef" } },
];
const NE = [
  { display: "NE", unit: "notation_key", value: undefined, extra: { code: "3.D", category: "Agricultural soils - N from SOC mineralisation", gas: "N2O", notation_key: "NE", gap_id: "soc", justification: "no series" } },
  { display: "NE", unit: "notation_key", value: undefined, extra: { code: "3.G", category: "Liming", gas: "CO2", notation_key: "NE", gap_id: "liming", justification: "no series" } },
  { display: "NE", unit: "notation_key", value: undefined, extra: { code: "1.A.4.b", category: "Residential - biogas digesters", gas: "CH4", notation_key: "NE", gap_id: "biogas", justification: "no series" } },
  { display: "NE", unit: "notation_key", value: undefined, extra: { code: "(air)", category: "Air pollutants - power generation", gas: "SO2", notation_key: "NE", gap_id: "air", justification: "no series" } },
];

const fetchSpy = vi.fn();
beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal(
    "fetch",
    mockFetch((url, body) => {
      fetchSpy(url, body);
      if (url.endsWith("/release")) return RELEASE;
      if (url.endsWith("/tiles/bboxes")) return BBOXES;
      if (url.endsWith("/openapi.json")) return { paths: {}, components: { schemas: {} } };
      if (url.includes("/evidence/")) {
        const m = new URL(url).searchParams.get("module");
        return envelope(m ? STREAMS.filter((s) => s.extra.module === m) : STREAMS, { request_type: "get_evidence" });
      }
      if (url.includes("/method/")) return envelope(url.endsWith("/agriculture") ? RULES : [], { request_type: "get_method" });
      if (url.includes("/query/completeness")) return envelope(NE, { request_type: "get_completeness" });
      if (url.includes("/claim?")) return CLAIM;
      if (body?.group_by?.[0] === "category") return envelope([{ display: "151.658", display_short: "151.66", group: { category: "Enteric fermentation" } }, { display: "16.550", display_short: "16.55", group: { category: "Rice cultivation" } }]);
      if (body?.categories && body?.geography_level) return refusal("grain_unavailable", "GrainUnavailable", "category filters are national-grain only in this release: the core applies them at national grain only");
      if (body?.categories) return envelope([{ display: "151.658", display_short: "151.66", unit_short: "Mt CO₂e" }], { receipt: "060bde899b5bb984553b61722584952a" });
      if (body?.group_by?.[0] === "reporting_sector")
        return envelope([
          { display: "223.454", display_short: "223.45", unit_short: "Mt CO₂e", group: { reporting_sector: "agriculture" }, extra: { share_pct_short: "49.4" } },
          { display: "63.370", display_short: "63.37", unit_short: "Mt CO₂e", group: { reporting_sector: "power" }, extra: { share_pct_short: "14.0" } },
        ]);
      // the page names a sector on the REPORTING axis, so its scope body filters there (rc54)
      if (body?.reporting_sectors?.[0] === "agriculture") return envelope([{ display: "223.454", display_short: "223.45", unit_short: "Mt CO₂e" }]);
      if (body?.reporting_sectors?.[0] === "power") return envelope([{ display: "63.370", display_short: "63.37", unit_short: "Mt CO₂e" }]);
      return envelope([{ display: "452.34662", display_short: "452.35", unit_short: "Mt CO₂e" }]);
    }),
  );
});

function mountAt(node: React.ReactNode, path: string, search = "", onUrlUpdate?: OnUrlUpdateFunction) {
  pathname.value = path;
  push.mockReset();
  replace.mockReset();
  const Wrapper = withNuqsTestingAdapter({ searchParams: search, onUrlUpdate, hasMemory: true });
  return render(
    <Wrapper>
      <Providers>
        <ExplorerProvider>{node}</ExplorerProvider>
      </Providers>
    </Wrapper>,
  );
}

/** The reader-page vocabulary ban: internal software and database words never render. */
const PROHIBITED: [RegExp, string][] = [
  [/\b(envelope|receipt|digest|canonical|registry|refusal|ledger|stream|configuration)s?\b/i, "internal vocabulary"],
  [/\b[ES][1-4]\b/, "evidence code"],
  [/\bT[1-4]\b/, "timing code"],
  [/registered rules?/i, "registered rules"],
  [/1\.0\.0rc/, "release candidate"],
  [/\b[0-9a-f]{12,}\b/, "hash"],
];
function assertPublicLanguage(el: HTMLElement) {
  const text = el.textContent ?? "";
  for (const [re, what] of PROHIBITED) expect(re.test(text), `${what}: ${text.match(re)?.[0]}`).toBe(false);
}


describe("/methods/sectors/[sector]", () => {
  it("the focused page: result with its national share, the four plain stages, included, glance, gaps, actions - and NOTHING of the catalogue", async () => {
    mountAt(<SectorRoute sector="agriculture" />, "/methods/sectors/agriculture");
    const page = await screen.findByTestId("sector-page");
    expect(within(page).getByTestId("sector-title")).toHaveTextContent("Agriculture");
    expect(within(page).getByTestId("sector-dek")).toHaveTextContent("How Pakistan’s agricultural emissions are estimated from livestock, crops and fertiliser data.");
    await waitFor(() => expect(within(page).getByTestId("sector-result-display")).toHaveTextContent("223.45"));
    await waitFor(() => expect(within(page).getByTestId("sector-share")).toHaveTextContent("49.4 % of the national total"));
    expect(within(page).getByTestId("sector-step-1")).toHaveTextContent("Animal counts, crop areas and fertiliser use.");
    expect(within(page).getByTestId("sector-step-2")).toHaveTextContent("Livestock, rice, nitrogen applied to soils and crop residues.");
    expect(within(page).getByTestId("sector-step-3")).toHaveTextContent("Standard IPCC methods are used to calculate emissions.");
    expect(within(page).getByTestId("sector-step-4")).toHaveTextContent("The estimates are added to the national inventory.");
    await waitFor(() => expect(within(page).getAllByTestId("included-chip").map((c) => c.textContent?.trim())).toEqual(["Livestock digestion", "Rice cultivation"]));
    expect(within(page).getByTestId("sector-glance")).toHaveTextContent("Based mainly on published national statistics and figures derived from published statistics.");
    expect(within(page).getByTestId("sector-glance")).toHaveTextContent("Provincial statistics and census data are used to place the estimates.");
    expect(within(page).getByTestId("sector-ne")).toHaveTextContent("Emissions from soil-carbon mineralisation · Liming");
    expect(within(page).getByTestId("view-sector-data")).toHaveAttribute("href", "/data?sector=agriculture");
    expect(within(page).getByTestId("all-sectors")).toHaveAttribute("href", "/methods/sectors");
    // exclusive rendering: nothing of the catalogue, the browser or the prose beneath
    expect(screen.queryByTestId("claim-browser")).toBeNull();
    expect(screen.queryByTestId("methodology")).toBeNull();
    expect(screen.queryByTestId("search")).toBeNull();
    expect(screen.queryByTestId("sector-tile")).toBeNull();
    expect(screen.queryByTestId("sector-card")).toBeNull();
    // the actions row is the page's last section
    const root = screen.getByTestId("sector-page");
    expect(root.lastElementChild).toBe(within(root).getByTestId("sector-actions"));
    // the reader's page speaks public language
    assertPublicLanguage(root);
    // the Methods nav item stays current on the nested route
    expect(screen.getAllByTestId("nav-link").find((a) => a.textContent === "Methods")).toHaveAttribute("aria-current", "page");
  });
  it("See the sources lists plain source names; Technical method opens the dense card in a drawer, where equations and the evidence drawer live", async () => {
    mountAt(<SectorRoute sector="agriculture" />, "/methods/sectors/agriculture");
    const page = await screen.findByTestId("sector-page");
    fireEvent.click(within(page).getByTestId("see-sources"));
    const dialog = await screen.findByTestId("sources-dialog");
    expect(within(dialog).getAllByTestId("source-name").map((s) => s.textContent)).toEqual(["PBS agricultural census and economic survey", "Economic survey 2023 24 rice area"]);
    fireEvent.click(screen.getByTestId("sources-dialog-close"));
    await waitFor(() => expect(screen.queryByTestId("sources-dialog")).toBeNull());
    fireEvent.click(within(page).getByTestId("technical-toggle"));
    const card = await screen.findByTestId("sector-card");
    await within(card).findByTestId("step-method");
    expect(within(card).getByText("IPCC sector 3")).toBeInTheDocument();
    expect(within(card).getByTestId("step-sources")).toHaveTextContent("PBS agricultural census and economic survey");
    await waitFor(() => expect(within(card).getByTestId("step-result")).toHaveTextContent("223.45 Mt CO₂e in 2023–24"));
    fireEvent.click(within(card).getByTestId("view-equations"));
    const eq = await within(card).findByTestId("equations");
    expect(eq).toHaveTextContent("2006 V4 Ch10 Eq 10.19/10.20");
    fireEvent.click(within(card).getByTestId("inspect-sources"));
    expect(await screen.findByTestId("drawer-sources")).toBeInTheDocument();
  });
  it("NEVER RENDERS THE INDUSTRY REPORTED-FUEL CAVEAT, though the release keeps sending it", () => {
    // RE-HOMED from analyze.test.tsx when that page was removed on 2026-09-16. The caveat used to
    // reach a reader three ways at once and put seven sentences of source criticism between them and
    // the number they came for; it was withdrawn from every surface on 2026-09-13. The string still
    // arrives with the release payload, so without a guard it returns on its own.
    //
    // This reads the SOURCE rather than the DOM on purpose. The fixture has no industry sector - and
    // adding one would move three unrelated counts in this file - so a rendered assertion would pass
    // whether or not the caveat was wired up, which is exactly how the first version of this guard
    // sat green while the defect was planted. Comments are stripped so the note explaining the
    // absence does not satisfy the test that enforces it.
    expect(RELEASE.labels.limitations.industry_reported_fuel_series).toBeTruthy();   // it IS in the payload
    const src = readFileSync(path.join(__dirname, "../components/methods/SectorRoute.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toContain("industry_reported_fuel_series");
  });

  it("the page is data-driven: power renders its own words and numbers", async () => {
    mountAt(<SectorRoute sector="power" />, "/methods/sectors/power");
    const page = await screen.findByTestId("sector-page");
    expect(within(page).getByTestId("sector-title")).toHaveTextContent("Power");
    expect(within(page).getByTestId("sector-dek")).toHaveTextContent("each plant’s reported fuel");
    await waitFor(() => expect(within(page).getByTestId("sector-result-display")).toHaveTextContent("63.37"));
    await waitFor(() => expect(within(page).getByTestId("sector-share")).toHaveTextContent("14.0 % of the national total"));
    expect(within(page).getByTestId("sector-glance")).toHaveTextContent("Based mainly on measured or metered records.");
    expect(within(page).queryByTestId("sector-ne")).toBeNull();
    assertPublicLanguage(page);
  });
});

describe("/methods/sectors", () => {
  it("the index: one linking tile per sector with its plain dek, no counts; the search narrows", async () => {
    mountAt(<SectorsIndex />, "/methods/sectors");
    const tiles = await screen.findAllByTestId("sector-tile");
    expect(tiles.map((t) => t.getAttribute("data-sector"))).toEqual(["agriculture", "power", "residential"]);
    expect(tiles[0]).toHaveAttribute("href", "/methods/sectors/agriculture");
    expect(tiles[0]).not.toHaveTextContent("source stream");
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "rice" } });
    await waitFor(() => expect(screen.getAllByTestId("sector-tile").map((t) => t.getAttribute("data-sector"))).toEqual(["agriculture"]));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "hies" } });
    await waitFor(() => expect(screen.getAllByTestId("sector-tile").map((t) => t.getAttribute("data-sector"))).toEqual(["residential"]));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "" } });
    await waitFor(() => expect(screen.getAllByTestId("sector-tile")).toHaveLength(3));
  });
});

describe("/methodology", () => {
  it("the methodology prose renders its sections from the release; the version is printed once, under Release", async () => {
    mountAt(<MethodologyPage />, "/methodology");
    expect(await screen.findByTestId("methodology")).toBeInTheDocument();
    expect(screen.getByTestId("about-release")).toHaveTextContent("This Explorer reads PakEmis 1.0.0rc42 at commit bc1716d6");
    expect(screen.getByTestId("about-release")).toHaveAttribute("id", "release");
    expect(screen.getAllByText(/1\.0\.0rc42/).length).toBe(1);
    expect(screen.getByTestId("about-what")).toHaveTextContent("rebuilt from public documents");
    const data = screen.getByTestId("about-data");
    expect(data).toHaveTextContent("every sector reports the same twelve months");
    expect(data).toHaveTextContent("on IPCC 2013 (AR5), with IPCC 2021 (AR6) carried as a secondary basis");
    expect(screen.getByTestId("about-gwp")).toHaveTextContent("IPCC 2013 (AR5) (the default): CO₂-equivalent using the IPCC Fifth Assessment Report's 100-year warming potentials (CH₄ × 28, fossil CH₄ × 30, N₂O × 265).");
    expect(screen.getByTestId("about-estimates")).toHaveTextContent("Survey-based estimate — the residential module re-run on observed household demand");
    expect(data).toHaveTextContent("excluded (NE): an exploratory Tier-1 module");
    expect(screen.getByTestId("about-map")).toHaveTextContent("the map tiles are visual only");
    await waitFor(() => expect(screen.getByTestId("about-territories")).toHaveTextContent("Azad Kashmir, Gilgit-Baltistan and Islamabad Capital Territory together"));
    expect(screen.getByTestId("about-ask")).toHaveTextContent("get_timeseries");
    expect(screen.getByTestId("about-licences")).toHaveTextContent("Code MIT; data and text CC-BY-4.0");
    expect(screen.getByTestId("about-licences")).toHaveTextContent("data/gis/rail/pak_rail_network.geojson");
    expect(screen.getByTestId("about-links").querySelector('a[href="/downloads"]')).not.toBeNull();
  });
});

describe("/methods/evidence", () => {
  it("the claim-record browser issues one query for the scope and opens the record of its cell; the URL carries ?claim=", async () => {
    const onUrlUpdate = vi.fn();
    mountAt(<EvidencePage />, "/methods/evidence", "", onUrlUpdate);
    const browser = await screen.findByTestId("claim-browser");
    expect(browser).toHaveTextContent("Claim-record browser");
    expect(within(browser).getByTestId("browser-category-select")).toBeDisabled();
    fireEvent.change(within(browser).getByTestId("browser-sector-select"), { target: { value: "agriculture" } });
    await waitFor(() => expect(within(within(browser).getByTestId("browser-category-select")).getAllByRole("option").map((o) => o.textContent)).toEqual(["All categories", "Enteric fermentation", "Rice cultivation"]));
    const categoryCall = fetchSpy.mock.calls.find(([, b]) => b?.group_by?.[0] === "category");
    expect(categoryCall?.[1]).toMatchObject({ reporting_sectors: ["agriculture"], periods: ["FY2023-24"], group_by: ["category"] });
    fireEvent.change(within(browser).getByTestId("browser-category-select"), { target: { value: "Enteric fermentation" } });
    fireEvent.change(within(browser).getByTestId("browser-gas-select"), { target: { value: "CH4" } });
    expect(within(within(browser).getByTestId("browser-place-select")).getAllByRole("option").map((o) => o.textContent).slice(0, 3)).toEqual(["Pakistan", "Balochistan", "Khyber Pakhtunkhwa"]);
    expect(within(within(browser).getByTestId("browser-period-select")).getAllByRole("option").map((o) => o.textContent)).toEqual(["2020–21", "2023–24"]);
    fireEvent.click(within(browser).getByTestId("browser-open"));
    await waitFor(() => expect(fetchSpy.mock.calls.some(([, b]) => b?.categories?.[0] === "Enteric fermentation")).toBe(true));
    const call = fetchSpy.mock.calls.find(([, b]) => b?.categories?.[0] === "Enteric fermentation");
    expect(call?.[1]).toEqual({ periods: ["FY2023-24"], configuration_id: "REF_2023_24", gwp_basis: "AR5", reporting_sectors: ["agriculture"], categories: ["Enteric fermentation"], gases: ["CH4"] });
    const record = await screen.findByTestId("browser-record");
    await waitFor(() => expect(within(record).getByTestId("claim-breadcrumb")).toHaveAttribute("data-text", "Agriculture → Enteric fermentation → CH₄ → Pakistan → 2023–24"));
    expect(fetchSpy.mock.calls.some(([u]) => String(u).endsWith("/claim?receipt=060bde899b5bb984553b61722584952a&cell=0"))).toBe(true);
    expect(within(record).getByTestId("browser-permalink")).toHaveAttribute("href", "/methods/evidence?claim=060bde899b5bb984553b61722584952a%3A0");
    await waitFor(() => expect(onUrlUpdate.mock.calls.some(([u]) => String((u as { queryString: string }).queryString).includes("claim=060bde899b5bb984553b61722584952a"))).toBe(true));
    expect(within(record).getByTestId("reported-short")).toHaveTextContent("151.66");
    expect(within(record).getAllByTestId("source-pages")[0]).toHaveTextContent("Not carried by this release");
  });
  it("a category with a province is sent as asked and the release's GrainUnavailable refusal is shown by name, with no record", async () => {
    mountAt(<EvidencePage />, "/methods/evidence");
    const browser = await screen.findByTestId("claim-browser");
    fireEvent.change(within(browser).getByTestId("browser-sector-select"), { target: { value: "agriculture" } });
    await waitFor(() => expect(within(within(browser).getByTestId("browser-category-select")).getAllByRole("option")).toHaveLength(3));
    fireEvent.change(within(browser).getByTestId("browser-category-select"), { target: { value: "Enteric fermentation" } });
    fireEvent.change(within(browser).getByTestId("browser-place-select"), { target: { value: "adm1:Punjab" } });
    expect(within(browser).getByTestId("browser-category")).toHaveTextContent("Category filters answer at national grain only");
    fireEvent.click(within(browser).getByTestId("browser-open"));
    const card = await within(await screen.findByTestId("browser-refusal")).findByTestId("refusal-card");
    expect(card).toHaveTextContent("Refused: GrainUnavailable");
    expect(card).toHaveTextContent("category filters are national-grain only in this release");
    const call = fetchSpy.mock.calls.find(([, b]) => b?.categories && b?.geography_level);
    expect(call?.[1]).toMatchObject({ geography_level: "adm1", geography_ids: ["Punjab"], categories: ["Enteric fermentation"] });
    expect(screen.queryByTestId("browser-record")).toBeNull();
  });
  it("?claim=<receipt>:<cell> reopens the same record", async () => {
    mountAt(<EvidencePage />, "/methods/evidence", "?claim=060bde899b5bb984553b61722584952a%3A0");
    const record = await screen.findByTestId("browser-record");
    await waitFor(() => expect(within(record).getByTestId("claim-breadcrumb")).toHaveAttribute("data-text", "Agriculture → Enteric fermentation → CH₄ → Pakistan → 2023–24"));
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes("/claim?"))).toHaveLength(1);
    expect(fetchSpy.mock.calls.some(([, b]) => b?.categories)).toBe(false);
  });
});

describe("/methods (the story)", () => {
  it("the story opens the page: hero, pipeline with the envelope's total, module chips, the gaps note; Browse the evidence crosses to the catalogue", async () => {
    const updates: string[] = [];
    mountAt(<MethodsPage />, "/methods", "", ({ queryString }) => updates.push(queryString));
    expect(await screen.findByRole("heading", { level: 1, name: "From public records to Pakistan\u2019s emissions inventory" })).toBeInTheDocument();
    // the inventory circle prints the envelope's own string, never a client sum
    expect(await screen.findByTestId("story-total-display")).toHaveTextContent("452.35");
    // the modules card and chips count the release's dims (three in this fixture)
    expect(screen.getByTestId("story-modules")).toHaveTextContent("3 sector modules");
    expect(within(screen.getByTestId("story-module-chips")).getAllByRole("link").map((a) => a.textContent)).toEqual(["Agriculture", "Power", "Residential"]);
    expect(within(screen.getByTestId("story-module-chips")).getAllByRole("link")[0]).toHaveAttribute("href", "/methods/sectors/agriculture");
    // the source chips come from the evidence envelope through sourceWords
    expect(screen.getByTestId("story-sources")).toHaveTextContent("PBS");
    // months from the release's month dim (two per period in the fixture)
    expect(screen.getByTestId("story-months")).toHaveTextContent("Monthly estimates");
    // the gaps note counts the NE rows and quotes the release's LULUCF sentence
    await waitFor(() => expect(screen.getByTestId("story-gaps")).toHaveTextContent("4 categories are recorded NE"));
    expect(screen.getByTestId("follow-reconstruction")).toHaveAttribute("href", "#reconstruction");
    expect(screen.getByTestId("read-methodology")).toHaveAttribute("href", "/methodology");
    // the outline CTA navigates to the sector catalogue route
    fireEvent.click(screen.getByTestId("browse-evidence"));
    expect(push).toHaveBeenCalledWith("/methods/sectors/");
  });
  it("the legacy single-page URLs replace to their routes", async () => {
    const a = mountAt(<MethodsPage />, "/methods", "?mode=catalogue&sector=power");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/methods/sectors/power/"));
    a.unmount();
    const b = mountAt(<MethodsPage />, "/methods", "?mode=catalogue");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/methods/sectors/"));
    b.unmount();
    mountAt(<MethodsPage />, "/methods", "?claim=060bde899b5bb984553b61722584952a%3A0");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/methods/evidence/?claim=060bde899b5bb984553b61722584952a%3A0"));
  });
  it("audits: every decimal on the story and the sector page is a server string; no FY; no avoid-list phrase", async () => {
    const allowed = new Set<string>();
    const add = (x: string) => (x.match(/\d+\.\d+/g) ?? []).forEach((t) => allowed.add(t));
    add(JSON.stringify(RELEASE));
    add(JSON.stringify([...STREAMS, ...RULES, ...NE]));
    add("223.454 223.45 452.34662 452.35 49.4 63.370 63.37 14.0");
    const sweep = (container: HTMLElement) => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode())
        for (const t of (n.textContent ?? "").match(/\d+\.\d+/g) ?? []) expect(allowed.has(t), t).toBe(true);
      const text = container.textContent ?? "";
      expect(text).not.toContain("FY");
      expect(avoidPhrasesIn(text)).toEqual([]);
    };
    const story = mountAt(<MethodsPage />, "/methods");
    await screen.findByTestId("story-total-display");
    await screen.findByTestId("story-gaps");
    sweep(story.container);
    story.unmount();
    const sector = mountAt(<SectorRoute sector="agriculture" />, "/methods/sectors/agriculture");
    await screen.findByTestId("sector-share");
    sweep(sector.container);
  });
});
