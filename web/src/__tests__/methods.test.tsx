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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import MethodsPage from "@/app/methods/page";
import { RELEASE, envelope, mockFetch, refusal } from "./fixtures";
import { CLAIM } from "./claimFixture";
import { avoidPhrasesIn } from "./vocabulary";

vi.mock("next/navigation", () => ({ usePathname: () => "/methods", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

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
      if (body?.sectors?.[0] === "agriculture") return envelope([{ display: "223.454", display_short: "223.45", unit_short: "Mt CO₂e" }]);
      if (body?.sectors?.[0] === "power") return envelope([{ display: "63.370", display_short: "63.37", unit_short: "Mt CO₂e" }]);
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
          <MethodsPage />
        </ExplorerProvider>
      </Providers>
    </Wrapper>,
  );
}

describe("/methods", () => {
  it("renders the first sector's card from the registry, the streams, the ledger and the sector envelope", async () => {
    mount("?mode=catalogue");
    expect(await screen.findByRole("heading", { level: 1, name: "Methods & evidence" })).toBeInTheDocument();
    expect(screen.getByTestId("identity-line")).toHaveTextContent("PakEmis · public-data reconstruction");
    expect(screen.getByTestId("read-methodology")).toHaveAttribute("href", "#methodology");
    expect(screen.getAllByTestId("nav-link").find((a) => a.textContent === "Methods")).toHaveAttribute("aria-current", "page");
    const tiles = await screen.findAllByTestId("sector-tile");
    expect(tiles.map((t) => t.getAttribute("data-sector"))).toEqual(["agriculture", "power", "residential"]);
    expect(tiles[0]).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(tiles[0]).toHaveTextContent("2 source streams"));
    const card = screen.getByTestId("sector-card");
    await waitFor(() => expect(within(card).getByText("IPCC sector 3")).toBeInTheDocument());
    expect(within(card).getByTestId("sector-name")).toHaveTextContent("Agriculture");
    await waitFor(() => expect(within(card).getByTestId("status-badge")).toHaveTextContent("Estimated with explicit gaps"));
    expect(within(card).getByTestId("sector-summary")).toHaveTextContent("Livestock digestion and manure");
    expect(within(card).getByTestId("step-1")).toHaveTextContent("1 · Source records");
    expect(within(card).getByTestId("step-sources")).toHaveTextContent("PBS agricultural census and economic survey");
    expect(within(card).getByTestId("step-activity")).toHaveTextContent("buffalo · rice");
    await waitFor(() => expect(within(card).getByTestId("step-method")).toHaveTextContent("2 registered rules: Enteric fermentation, Rice cultivation"));
    expect(within(card).getByTestId("step-3")).toHaveTextContent("Registered IPCC category equations");
    await waitFor(() => expect(within(card).getByTestId("step-result")).toHaveTextContent("223.45 Mt CO₂e in 2023–24"));
    expect(within(card).getByTestId("dim-annual")).toHaveTextContent("E2 — published statistic for this source and period, not independently verified");
    expect(within(card).getByTestId("dim-annual")).toHaveTextContent("E3 — derived from a related published quantity (a share, a ratio, a balance)");
    expect(within(card).getByTestId("dim-monthly")).toHaveTextContent("T3 — process-based seasonal profile (degree days, crop calendar, fire counts)");
    expect(within(card).getByTestId("dim-spatial")).toHaveTextContent("S3 — administrative statistic (provincial sales, registrations, census counts)");
    expect(within(card).getByTestId("dim-uncertainty")).toHaveTextContent("one uncertainty model (product lognormal activity x ef)");
    const ne = within(card).getAllByTestId("ne-row");
    expect(ne.map((r) => r.textContent)).toEqual(["NEAgricultural soils - N from SOC mineralisation · N2O", "NELiming · CO2"]);
    expect(within(card).getByTestId("open-rows")).toHaveAttribute("href", "/data?sector=agriculture");
    const methodCall = fetchSpy.mock.calls.find(([u]) => String(u).includes("/method/"));
    expect(String(methodCall?.[0])).toMatch(/\/method\/agriculture$/);
  });
  it("View equations lists the rules; Inspect sources opens Result details on the evidence envelope", async () => {
    mount("?mode=catalogue");
    const card = await screen.findByTestId("sector-card");
    await within(card).findByTestId("step-method");
    fireEvent.click(within(card).getByTestId("view-equations"));
    const eq = await within(card).findByTestId("equations");
    expect(eq).toHaveTextContent("2006 V4 Ch10 Eq 10.19/10.20");
    expect(eq).toHaveTextContent("Country-specific head counts from the agricultural census");
    fireEvent.click(within(card).getByTestId("inspect-sources"));
    expect(await screen.findByTestId("drawer-sources")).toBeInTheDocument();
  });
  it("a tile switches the card through the URL; the search narrows the grid by category or source", async () => {
    mount("?mode=catalogue");
    const tiles = await screen.findAllByTestId("sector-tile");
    fireEvent.click(tiles[1]);
    const card = screen.getByTestId("sector-card");
    await waitFor(() => expect(within(card).getByTestId("sector-name")).toHaveTextContent("Power"));
    await waitFor(() => expect(within(card).getByText("IPCC sector 1")).toBeInTheDocument());
    await waitFor(() => expect(within(card).getByTestId("step-result")).toHaveTextContent("63.37 Mt CO₂e in 2023–24"));
    await waitFor(() => expect(within(card).getByTestId("status-badge")).toHaveTextContent("Estimated"));
    expect(within(card).getByTestId("ne-none")).toBeInTheDocument();
    expect(within(card).getByTestId("dim-annual")).toHaveTextContent("E1 — measured or metered quantity for this source and period");
    await waitFor(() => expect(within(card).getByTestId("step-method")).toHaveTextContent("0 registered rules"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "rice" } });
    await waitFor(() => expect(screen.getAllByTestId("sector-tile").map((t) => t.getAttribute("data-sector"))).toEqual(["agriculture"]));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "hies" } });
    await waitFor(() => expect(screen.getAllByTestId("sector-tile").map((t) => t.getAttribute("data-sector"))).toEqual(["residential"]));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "" } });
    await waitFor(() => expect(screen.getAllByTestId("sector-tile")).toHaveLength(3));
  });
  it("the methodology prose renders its sections from the release; the version is printed once, under Release", async () => {
    mount("?mode=catalogue");
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
  it("the claim-record browser issues one query for the scope and opens the record of its cell; the URL carries ?claim=", async () => {
    const onUrlUpdate = vi.fn();
    mount("?mode=catalogue", onUrlUpdate);
    const browser = await screen.findByTestId("claim-browser");
    expect(browser).toHaveTextContent("Claim-record browser");
    expect(within(browser).getByTestId("browser-category-select")).toBeDisabled();
    fireEvent.change(within(browser).getByTestId("browser-sector-select"), { target: { value: "agriculture" } });
    await waitFor(() => expect(within(within(browser).getByTestId("browser-category-select")).getAllByRole("option").map((o) => o.textContent)).toEqual(["All categories", "Enteric fermentation", "Rice cultivation"]));
    const categoryCall = fetchSpy.mock.calls.find(([, b]) => b?.group_by?.[0] === "category");
    expect(categoryCall?.[1]).toMatchObject({ sectors: ["agriculture"], periods: ["FY2023-24"], group_by: ["category"] });
    fireEvent.change(within(browser).getByTestId("browser-category-select"), { target: { value: "Enteric fermentation" } });
    fireEvent.change(within(browser).getByTestId("browser-gas-select"), { target: { value: "CH4" } });
    expect(within(within(browser).getByTestId("browser-place-select")).getAllByRole("option").map((o) => o.textContent).slice(0, 3)).toEqual(["Pakistan", "Balochistan", "Khyber Pakhtunkhwa"]);
    expect(within(within(browser).getByTestId("browser-period-select")).getAllByRole("option").map((o) => o.textContent)).toEqual(["2020–21", "2023–24"]);
    fireEvent.click(within(browser).getByTestId("browser-open"));
    await waitFor(() => expect(fetchSpy.mock.calls.some(([, b]) => b?.categories?.[0] === "Enteric fermentation")).toBe(true));
    const call = fetchSpy.mock.calls.find(([, b]) => b?.categories?.[0] === "Enteric fermentation");
    expect(call?.[1]).toEqual({ periods: ["FY2023-24"], configuration_id: "REF_2023_24", gwp_basis: "AR5", sectors: ["agriculture"], categories: ["Enteric fermentation"], gases: ["CH4"] });
    const record = await screen.findByTestId("browser-record");
    await waitFor(() => expect(within(record).getByTestId("claim-breadcrumb")).toHaveAttribute("data-text", "Agriculture → Enteric fermentation → CH₄ → Pakistan → 2023–24"));
    expect(fetchSpy.mock.calls.some(([u]) => String(u).endsWith("/claim?receipt=060bde899b5bb984553b61722584952a&cell=0"))).toBe(true);
    expect(within(record).getByTestId("browser-permalink")).toHaveAttribute("href", "/methods?claim=060bde899b5bb984553b61722584952a%3A0");
    await waitFor(() => expect(onUrlUpdate.mock.calls.some(([u]) => String((u as { queryString: string }).queryString).includes("claim=060bde899b5bb984553b61722584952a"))).toBe(true));
    expect(within(record).getByTestId("reported-short")).toHaveTextContent("151.66");
    expect(within(record).getAllByTestId("source-pages")[0]).toHaveTextContent("Not carried by this release");
  });
  it("a category with a province is sent as asked and the release's GrainUnavailable refusal is shown by name, with no record", async () => {
    mount("?mode=catalogue");
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
    mount("?claim=060bde899b5bb984553b61722584952a%3A0");
    const record = await screen.findByTestId("browser-record");
    await waitFor(() => expect(within(record).getByTestId("claim-breadcrumb")).toHaveAttribute("data-text", "Agriculture → Enteric fermentation → CH₄ → Pakistan → 2023–24"));
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes("/claim?"))).toHaveLength(1);
    expect(fetchSpy.mock.calls.some(([, b]) => b?.categories)).toBe(false);
  });
  it("the story opens the page: hero, pipeline with the envelope's total, module chips, the gaps note; Browse the evidence crosses to the catalogue", async () => {
    const updates: string[] = [];
    mount("", ({ queryString }) => updates.push(queryString));
    expect(await screen.findByRole("heading", { level: 1, name: "From public records to a national emissions inventory" })).toBeInTheDocument();
    // the inventory circle prints the envelope's own string, never a client sum
    expect(await screen.findByTestId("story-total-display")).toHaveTextContent("452.35");
    // the modules card and chips count the release's dims (three in this fixture)
    expect(screen.getByTestId("story-modules")).toHaveTextContent("3 tested modules");
    expect(within(screen.getByTestId("story-module-chips")).getAllByRole("link").map((a) => a.textContent)).toEqual(["Agriculture", "Power", "Residential"]);
    expect(within(screen.getByTestId("story-module-chips")).getAllByRole("link")[0]).toHaveAttribute("href", "/methods?mode=catalogue&sector=agriculture");
    // the source chips come from the evidence envelope through sourceWords
    expect(screen.getByTestId("story-sources")).toHaveTextContent("PBS");
    // months from the release's month dim (two per period in the fixture)
    expect(screen.getByTestId("story-months")).toHaveTextContent("2 months");
    // the gaps note counts the NE rows and quotes the release's LULUCF sentence
    await waitFor(() => expect(screen.getByTestId("story-gaps")).toHaveTextContent("4 categories are recorded NE"));
    expect(screen.getByTestId("follow-reconstruction")).toHaveAttribute("href", "#reconstruction");
    expect(screen.getByTestId("read-methodology")).toHaveAttribute("href", "/methods?mode=catalogue#methodology");
    // the outline CTA crosses to the catalogue and the URL carries the mode
    fireEvent.click(screen.getByTestId("browse-evidence"));
    expect(await screen.findByTestId("sector-card")).toBeInTheDocument();
    expect(updates.at(-1)).toContain("mode=catalogue");
    // and Story returns, clearing the mode back to the default
    fireEvent.click(screen.getByTestId("mode-story"));
    expect(await screen.findByTestId("story")).toBeInTheDocument();
    expect(updates.at(-1)).not.toContain("mode=");
  });
  it("audits: every decimal is a server string; no FY; no raw id outside the Release section; no avoid-list phrase", async () => {
    const { container } = render(
      <Providers>
        <ExplorerProvider>
          <MethodsPage />
        </ExplorerProvider>
      </Providers>,
      { wrapper: withNuqsTestingAdapter({ searchParams: "", hasMemory: true }) },
    );
    // the story opens; audit it, then cross to the catalogue and audit that too
    await screen.findByTestId("story-total-display");
    await screen.findByTestId("story-gaps");
    const allowed = new Set<string>();
    const add = (s: string) => (s.match(/\d+\.\d+/g) ?? []).forEach((t) => allowed.add(t));
    add(JSON.stringify(RELEASE));
    add(JSON.stringify([...STREAMS, ...RULES, ...NE]));
    add("223.454 223.45");
    add("452.34662 452.35");
    const sweep = () => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const tokens: string[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) tokens.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
      for (const t of tokens) expect(allowed.has(t), t).toBe(true);
      return tokens.length;
    };
    expect(sweep()).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("mode-catalogue"));
    const card = await screen.findByTestId("sector-card");
    await within(card).findByTestId("step-result");
    await within(card).findByTestId("step-method");
    await screen.findByTestId("about-territories");
    expect(sweep()).toBeGreaterThan(0);
    // the prose names the period id once, on purpose, in a span marked data-allow-fy
    for (const el of Array.from(container.querySelectorAll("[data-allow-fy]"))) el.remove();
    const text = container.textContent ?? "";
    expect(text).not.toContain("FY");
    expect(text).not.toContain("REF_2023_24");
    expect(text).not.toContain("Mt CO2e");
    expect(avoidPhrasesIn(text)).toEqual([]);
    // the version appears in the Release section only
    const outside = (container.textContent ?? "").replace(screen.getByTestId("about-release").textContent ?? "", "");
    expect(outside).not.toContain("1.0.0rc");
    for (const el of Array.from(container.querySelectorAll("[title]"))) expect(el.getAttribute("title") ?? "").not.toContain("FY");
  });
});
