import "@testing-library/jest-dom/vitest";
/**
 * /explore against mocked envelopes carrying the server's presentation fields: the identity
 * line from the API, the Showing sentence from the labels, the three stat cards (display_short,
 * share_pct_short, interval_short), the result widget's sentence and Share column, the
 * breakdown select re-querying (gas; month sends the period's months; province disabled with
 * its reason), a sector row selecting the sector and switching the breakdown to categories,
 * Show calculation opening Result details at Calculation, the Interpret card's NE count, and
 * the four audits (every decimal a server string; no FY; no raw id incl. a version; no
 * avoid-list phrase, "Not an official inventory" allowed as written).
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import Page from "@/app/explore/page";
import { RELEASE, envelope, mockFetch } from "./fixtures";
import { avoidPhrasesIn } from "./vocabulary";

vi.mock("next/navigation", () => ({ usePathname: () => "/explore", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/ui/BarChart", () => ({
  BarChart: ({ env }: { env: { values: { display_short?: string; display: string }[] } }) => <div data-testid="bar-chart">{env.values.map((v) => v.display_short ?? v.display).join(" ")}</div>,
}));

const SECTORS = [
  { display: "223.454", display_short: "223.45", unit_short: "Mt CO₂e", unit_words: "million tonnes CO₂e", group: { sector_id: "agriculture" }, extra: { share_pct_short: "49.4" } },
  { display: "63.370", display_short: "63.37", unit_short: "Mt CO₂e", unit_words: "million tonnes CO₂e", group: { sector_id: "power" }, extra: { share_pct_short: "14.0" } },
  { display: "29.467", display_short: "29.47", unit_short: "Mt CO₂e", unit_words: "million tonnes CO₂e", group: { sector_id: "residential" }, extra: { share_pct_short: "6.5" } },
];
const CATEGORIES = [
  { display: "151.662", display_short: "151.66", unit_short: "Mt CO₂e", unit_words: "million tonnes CO₂e", group: { category: "Enteric fermentation" }, extra: { share_pct_short: "67.9" } },
  { display: "28.531", display_short: "28.53", unit_short: "Mt CO₂e", unit_words: "million tonnes CO₂e", group: { category: "Managed soils" }, extra: { share_pct_short: "12.8" } },
];
const GASES = [
  { display: "248.751", display_short: "248.75", unit_short: "Mt CO₂e", unit_words: "million tonnes CO₂e", group: { gas: "CH4" }, extra: { share_pct_short: "55.0" } },
  { display: "161.462", display_short: "161.46", unit_short: "Mt CO₂e", unit_words: "million tonnes CO₂e", group: { gas: "CO2" }, extra: { share_pct_short: "35.7" } },
];
const MONTHS = [
  { display: "41.538", display_short: "41.54", unit_short: "Mt CO₂e", unit_words: "million tonnes CO₂e", group: { month: "202307" }, extra: { share_pct_short: "9.2" } },
  { display: "42.411", display_short: "42.41", unit_short: "Mt CO₂e", unit_words: "million tonnes CO₂e", group: { month: "202308" }, extra: { share_pct_short: "9.4" } },
];
const PARTITION = { of: "the sum of these cells", n: 3, share_field: "share_pct_short", rule: "100 x exact / the sum of exact" };
const UNCERTAINTY = [
  { display: "456.940", display_short: "456.94", unit_short: "Mt CO₂e", value: 456.94, extra: { kind: "parametric_reference", scenario: "within_sector", scenario_label: "factors shared within a module", interval_short: "407.42–533.41" } },
  { display: "456.910", display_short: "456.91", unit_short: "Mt CO₂e", value: 456.91, extra: { kind: "parametric_reference", scenario: "cross_sector", scenario_label: "factors shared across modules", interval_short: "407.28–533.73" } },
];
const NE = [
  { display: "NE", unit: "notation_key", value: undefined, extra: { code: "3.D", category: "Agricultural soils - N from SOC mineralisation", gas: "N2O", notation_key: "NE", gap_id: "soc-mineralisation", justification: "no series" } },
  { display: "NE", unit: "notation_key", value: undefined, extra: { code: "2.A.2", category: "Lime production", gas: "CO2", notation_key: "NE", gap_id: "lime", justification: "no series" } },
  { display: "NE", unit: "notation_key", value: undefined, extra: { code: "(air)", category: "Air pollutants - road transport cold-start excess", gas: "CO", notation_key: "NE", gap_id: "cold-start", justification: "no series" } },
  { display: "NE", unit: "notation_key", value: undefined, extra: { code: "1.A.4.b", category: "Residential - biogas digesters", gas: "CH4", notation_key: "NE", gap_id: "biogas", justification: "no series" } },
];
const EVIDENCE = [
  { display: "E2 / T4 / S3", unit: "evidence", value: undefined, extra: { source_stream_id: "agriculture|enteric-fermentation|buffalo|ch4", module: "agriculture", evidence_class: "E2", ipcc_code: "3.A", ipcc_category: "Enteric fermentation" } },
  { display: "E3 / T3 / S3", unit: "evidence", value: undefined, extra: { source_stream_id: "agriculture|rice|ch4", module: "agriculture", evidence_class: "E3", ipcc_code: "3.C", ipcc_category: "Rice cultivation" } },
];

const fetchSpy = vi.fn();
beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal(
    "fetch",
    mockFetch((url, body) => {
      fetchSpy(url, body);
      if (url.endsWith("/release")) return RELEASE;
      if (url.endsWith("/openapi.json")) return { paths: {}, components: { schemas: { QueryEmissions: { properties: { gwp_basis: { description: "AR5 | AR6" }, spatial_view: { description: "all | physical | origin | accounting" } } }, GridCellRequest: { properties: { gas: { default: "CO2" }, month: { description: 'YYYYMM or "annual"' } } } } } };
      if (url.includes("/query/uncertainty")) return envelope(UNCERTAINTY, { request_type: "get_uncertainty" });
      if (url.includes("/query/completeness")) return envelope(NE, { request_type: "get_completeness" });
      if (url.includes("/evidence/")) return envelope(EVIDENCE, { request_type: "get_evidence" });
      const key = body?.group_by?.[0];
      if (key === "sector_id") return envelope(SECTORS, { partition: PARTITION });
      if (key === "category") return envelope(CATEGORIES, { partition: PARTITION });
      if (key === "gas") return envelope(GASES, { partition: PARTITION });
      if (key === "month") return envelope(MONTHS, { partition: PARTITION });
      if (body?.sectors?.[0] === "agriculture") return envelope([{ display: "223.454", display_short: "223.45", unit_short: "Mt CO₂e" }]);
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
          <Page />
        </ExplorerProvider>
      </Providers>
    </Wrapper>,
  );
}

function serverDecimals(): Set<string> {
  const out = new Set<string>();
  const add = (s: string) => (s.match(/\d+\.\d+/g) ?? []).forEach((t) => out.add(t));
  for (const c of [...SECTORS, ...CATEGORIES, ...GASES, ...MONTHS, ...UNCERTAINTY, ...NE, ...EVIDENCE]) add(JSON.stringify(c));
  add("452.34662 452.35 223.454 223.45");
  add(JSON.stringify(RELEASE));
  return out;
}

const emissionsCalls = () => fetchSpy.mock.calls.filter(([u]) => String(u).includes("/query/emissions")).map(([, b]) => b as Record<string, unknown>);

describe("/explore", () => {
  it("renders the header from the API's identity line, the Showing sentence from the labels and the three stat cards from server strings", async () => {
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: "Explore the inventory" })).toBeInTheDocument();
    expect(screen.getByTestId("identity-line")).toHaveTextContent("PakEmis · public-data reconstruction of Pakistan's non-LULUCF emissions · 2020–21 to 2023–24");
    expect(screen.getByTestId("showing-line-text")).toHaveTextContent("Pakistan's 2023–24 reference emissions, all sectors, grouped by sector, using IPCC 2013 warming factors.");
    expect(await screen.findByTestId("stat-national-value")).toHaveTextContent("452.35");
    expect(screen.getByTestId("stat-national-unit")).toHaveTextContent("Mt CO₂e");
    expect(screen.getByTestId("stat-national-caption")).toHaveTextContent("Land-use change is excluded");
    expect(await screen.findByTestId("stat-largest-value")).toHaveTextContent("49.4");
    expect(screen.getByTestId("stat-largest-unit")).toHaveTextContent("%");
    expect(screen.getByTestId("stat-largest-caption")).toHaveTextContent("Agriculture · 223.45 Mt CO₂e");
    expect(await screen.findByTestId("stat-interval-value")).toHaveTextContent("407.28–533.73");
    expect(screen.getByTestId("stat-interval-unit")).toHaveTextContent("Mt");
    expect(screen.getByTestId("stat-interval-caption")).toHaveTextContent("Structural alternatives shown separately");
    expect(screen.getByTestId("result-card-sentence")).toHaveTextContent("Agriculture accounts for 49.4% of the 2023–24 reference estimate.");
    expect(screen.getByTestId("result-caption")).toHaveTextContent("Select the sector to examine its categories, evidence and sources.");
    expect(screen.getByTestId("frame-unit")).toHaveTextContent("Million tonnes CO₂e");
    expect(screen.getByTestId("ask-about-view")).toHaveAttribute("href", `/ask?q=${encodeURIComponent("Pakistan's 2023–24 reference emissions, all sectors, grouped by sector, using IPCC 2013 warming factors. Explain this view.")}`);
    expect(screen.getAllByTestId("nav-link").find((a) => a.textContent === "Explore data")).toHaveAttribute("aria-current", "page");
    // the toolbar: Result details, the receipt CSV, the share button
    expect(screen.getByTestId("result-card-download")).toHaveAttribute("href", expect.stringMatching(/\/download\/[0-9a-f]{32}\.csv$/));
    expect(screen.getByTestId("result-card-share")).toBeInTheDocument();
    // the uncertainty was asked at the release's national scope
    for (const [, body] of fetchSpy.mock.calls.filter(([u]) => String(u).includes("/query/uncertainty"))) expect(body).toEqual({ scope: "national" });
  });
  it("the table tab carries the server's Share column; a sector row selects the sector and re-runs the breakdown by category", async () => {
    const updates: string[] = [];
    mount("", ({ queryString }) => updates.push(queryString));
    await screen.findByTestId("stat-largest-value");
    fireEvent.click(screen.getByTestId("figure-tabs-table"));
    const rows = await screen.findAllByTestId("envelope-row");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByTestId("table-share")).toHaveTextContent("49.4%");
    expect(within(rows[0]).getByTestId("table-value")).toHaveTextContent("223.45");
    fireEvent.click(rows[0]);
    await waitFor(() => expect(updates.at(-1)).toContain("sector=agriculture"));
    expect(updates.at(-1)).toContain("by=ipcc");
    expect(await screen.findByText("Largest category")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("stat-largest-caption")).toHaveTextContent("Enteric fermentation · 151.66 Mt CO₂e"));
    expect(screen.getByTestId("showing-line-text")).toHaveTextContent("Pakistan's 2023–24 reference emissions, agriculture, grouped by IPCC category, using IPCC 2013 warming factors.");
    const cat = emissionsCalls().find((b) => (b.group_by as string[])?.[0] === "category");
    expect(cat).toMatchObject({ sectors: ["agriculture"], group_by: ["category"], order_by: "value desc", periods: ["FY2023-24"] });
    // the NE count narrows to the sector's codes (3.D under agriculture's 3.*)
    await waitFor(() => expect(screen.getByTestId("interpret-ne")).toHaveTextContent("One category is marked NE under Agriculture."));
  });
  it("the breakdown select re-queries: gas groups by gas, month sends the period's months, province is offered disabled with the reason", async () => {
    const updates: string[] = [];
    mount("", ({ queryString }) => updates.push(queryString));
    await screen.findByTestId("stat-largest-value");
    fireEvent.change(screen.getByTestId("by-select"), { target: { value: "gas" } });
    await waitFor(() => expect(screen.getByTestId("result-card-sentence")).toHaveTextContent("CH₄ accounts for 55.0% of the 2023–24 reference estimate."));
    expect(updates.at(-1)).toContain("by=gas");
    expect(emissionsCalls().find((b) => (b.group_by as string[])?.[0] === "gas")).toMatchObject({ group_by: ["gas"], order_by: "value desc" });
    expect(screen.getByText("Emissions by gas")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("by-select"), { target: { value: "month" } });
    await waitFor(() => expect(screen.getByTestId("result-card-sentence")).toHaveTextContent("Jul 2023 accounts for 9.2% of the 2023–24 reference estimate."));
    const month = emissionsCalls().find((b) => (b.group_by as string[])?.[0] === "month");
    expect(month).toMatchObject({ group_by: ["month"], months: ["202307", "202308"] });
    expect(month).not.toHaveProperty("month");
    const province = screen.getByTestId("by-select").querySelector('option[value="province"]') as HTMLOptionElement;
    expect(province.disabled).toBe(true);
    expect(province.title).toContain("no province column at national grain");
    expect(emissionsCalls().find((b) => (b.group_by as string[])?.[0] === "province")).toBeUndefined();
  });
  it("Show calculation opens Result details at Calculation; Inspect evidence at Sources; the Interpret card counts every NE row", async () => {
    mount();
    await screen.findByTestId("result-card-sentence");
    fireEvent.click(screen.getByTestId("show-calculation"));
    expect(await screen.findByTestId("drawer-calculation")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByTestId("inspect-evidence"));
    expect(await screen.findByTestId("drawer-sources")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.getByTestId("interpret-ne")).toHaveTextContent("Categories without adequate activity data remain explicitly marked NE. 4 categories are marked NE in this release."));
    expect(screen.getByTestId("interpret-not-official")).toHaveTextContent("Not an official inventory");
    expect(screen.getByTestId("interpret-not-official")).toHaveTextContent("PakEmis independently reconstructs emissions from public activity data.");
    expect(screen.getByTestId("interpret-estimate")).toHaveTextContent("Reference estimate");
    expect(screen.getByTestId("interpret-estimate")).toHaveTextContent("Structural alternatives (Survey-based estimate) are selectable under More settings.");
    expect(screen.getByTestId("interpret-exact")).toHaveTextContent("Every value can expose its data rows, calculation, release and query receipt.");
    // More settings reveals the estimate, the warming potentials and the spatial view
    fireEvent.click(screen.getByTestId("more-settings"));
    expect(screen.getByTestId("config-select")).toHaveValue("REF_2023_24");
    expect(screen.getByTestId("gwp-select")).toHaveTextContent("IPCC 2013 (AR5)");
    expect(screen.getByTestId("view-select")).toBeInTheDocument();
  });
  it("audits: every decimal is a server string; no FY; no raw id; no avoid-list phrase", async () => {
    mount();
    await screen.findByTestId("stat-interval-value");
    await screen.findByTestId("result-card-sentence");
    await waitFor(() => expect(screen.getByTestId("interpret-ne")).toHaveTextContent("marked NE in this release"));
    fireEvent.click(screen.getByTestId("figure-tabs-table"));
    await screen.findAllByTestId("envelope-row");
    const allowed = serverDecimals();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const tokens: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) tokens.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
    expect(tokens.length).toBeGreaterThan(5);
    for (const t of tokens) expect(allowed.has(t), t).toBe(true);
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("FY");
    expect(text).not.toMatch(/(^|[^A-Z0-9(])AR5(?![)\w])/);
    expect(text).not.toContain("1.0.0rc");
    expect(text).not.toContain("REF_2023_24");
    expect(text).not.toContain("Mt CO2e");
    expect(text).not.toContain("(L)");
    expect(text).toContain("Not an official inventory");
    expect(avoidPhrasesIn(text)).toEqual([]);
    for (const el of Array.from(document.body.querySelectorAll("[title]"))) {
      expect(el.getAttribute("title") ?? "").not.toContain("FY");
      expect(el.getAttribute("title") ?? "").not.toContain("1.0.0rc");
    }
  });
});
