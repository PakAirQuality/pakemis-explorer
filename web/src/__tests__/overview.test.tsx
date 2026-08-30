import "@testing-library/jest-dom/vitest";
/**
 * The public Overview against mocked envelopes that carry the server's presentation fields
 * (`share_pct_short` + `partition` on the sector breakdown, `interval_short` +
 * `scenario_label` on the national uncertainty cells): the KPI, the interval line, the share
 * caption, the chips and the question box linking to /ask?q=, the sector explanation, the
 * trend, the CTAs; and the four audits: every decimal on the page is a server string, no
 * "FY", no raw id (bare AR5, "(NE)", "LULUCF", a version), no avoid-list phrase.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import Page from "@/app/page";
import { RELEASE, envelope, mockFetch } from "./fixtures";
import { avoidPhrasesIn } from "./vocabulary";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/components/ui/TrendChart", () => ({
  TrendChart: ({ env, title, subtitle }: { env?: { values: { display_short?: string; display: string }[] }; title: string; subtitle?: string }) =>
    env ? <div data-testid="trend-stub">{title} · {subtitle} · {env.values.map((v) => v.display_short ?? v.display).join(" ")}</div> : <div data-testid="trend-skeleton" />,
}));

const SECTORS = [
  { display: "223.454", display_short: "223.45", unit_short: "Mt CO₂e", group: { sector_id: "agriculture" }, extra: { share_pct_short: "49.4" } },
  { display: "63.370", display_short: "63.37", unit_short: "Mt CO₂e", group: { sector_id: "power" }, extra: { share_pct_short: "14.0" } },
  { display: "41.926", display_short: "41.93", unit_short: "Mt CO₂e", group: { sector_id: "transport" }, extra: { share_pct_short: "9.3" } },
  { display: "37.914", display_short: "37.91", unit_short: "Mt CO₂e", group: { sector_id: "waste" }, extra: { share_pct_short: "8.4" } },
  { display: "29.467", display_short: "29.47", unit_short: "Mt CO₂e", group: { sector_id: "residential" }, extra: { share_pct_short: "6.5" } },
  { display: "24.694", display_short: "24.69", unit_short: "Mt CO₂e", group: { sector_id: "fugitives" }, extra: { share_pct_short: "5.5" } },
];
const PARTITION = { of: "the sum of these cells", n: 6, share_field: "share_pct_short", rule: "100 x exact / the sum of exact" };
const UNCERTAINTY = [
  { display: "456.940", display_short: "456.94", unit_short: "Mt CO₂e", value: 456.94, extra: { kind: "parametric_reference", key: "national|TOTAL", scenario: "within_sector", scenario_label: "factors shared within a module", quantiles_short: { "P2.5": "407.42", "P97.5": "533.41" }, interval_short: "407.42–533.41" } },
  { display: "456.910", display_short: "456.91", unit_short: "Mt CO₂e", value: 456.91, extra: { kind: "parametric_reference", key: "national|TOTAL", scenario: "cross_sector", scenario_label: "factors shared across modules", quantiles_short: { "P2.5": "407.28", "P97.5": "533.73" }, interval_short: "407.28–533.73" } },
];
const EVIDENCE = [
  { display: "E2 / T4 / S3", unit: "evidence", value: undefined, extra: { source_stream_id: "agriculture|enteric-fermentation|buffalo|ch4", module: "agriculture", evidence_class: "E2", ipcc_category: "Enteric fermentation" } },
  { display: "E3 / T4 / S3", unit: "evidence", value: undefined, extra: { source_stream_id: "agriculture|rice|ch4", module: "agriculture", evidence_class: "E3", ipcc_category: "Rice cultivation" } },
];
const METHOD = [{ display: "ipcc2006_v4_ch10_eq10.19_enteric_ch4", unit: "method", value: undefined, extra: { sector: "agriculture", category: "Enteric fermentation", method_id: "ipcc2006_v4_ch10_eq10.19_enteric_ch4", tier: "T1", equation: "2006 V4 Ch10 Eq 10.19/10.20", notes: "Country-specific head counts from the agricultural census; IPCC default emission factors by species" } }];

const fetchSpy = vi.fn();
beforeEach(() => {
  fetchSpy.mockReset();
  push.mockReset();
  vi.stubGlobal(
    "fetch",
    mockFetch((url, body) => {
      fetchSpy(url, body);
      if (url.endsWith("/release")) return RELEASE;
      if (url.endsWith("/openapi.json")) return { paths: { "/api/v1/emissions/release": {} }, components: { schemas: { QueryEmissions: { properties: { gwp_basis: { description: "AR5 | AR6" }, spatial_view: { description: "all | physical | origin | accounting" } } }, GridCellRequest: { properties: { gas: { default: "CO2" }, month: { description: 'YYYYMM or "annual"' } } } } } };
      if (url.includes("/query/uncertainty")) return envelope(UNCERTAINTY, { request_type: "get_uncertainty" });
      if (url.includes("/evidence/")) return envelope(EVIDENCE, { request_type: "get_evidence" });
      if (url.includes("/method/")) return envelope(METHOD, { request_type: "get_method" });
      if (url.includes("/timeseries")) return envelope([{ display: "372.397", display_short: "372.40", group: { period_id: "FY2020-21" } }, { display: "452.347", display_short: "452.35", group: { period_id: "FY2023-24" } }], { request_type: "get_timeseries" });
      if (body?.group_by?.includes("sector_id")) return envelope(SECTORS, { partition: PARTITION });
      return envelope([{ display: "452.34662", display_short: "452.35", unit_short: "Mt CO₂e" }]);
    }),
  );
});

function mount(search = "") {
  const Wrapper = withNuqsTestingAdapter({ searchParams: search });
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

/** Every decimal token the mocked server sent: displays, shorts, shares, quantiles and the interval's ends. */
function serverDecimals(): Set<string> {
  const out = new Set<string>();
  const add = (s: string) => (s.match(/\d+\.\d+/g) ?? []).forEach((t) => out.add(t));
  for (const c of [...SECTORS, ...UNCERTAINTY, ...EVIDENCE, ...METHOD]) add(JSON.stringify(c));
  add("452.34662 452.35 372.397 372.40 452.347");
  add(JSON.stringify(RELEASE));
  return out;
}

describe("Overview", () => {
  it("renders the hero, the KPI as the server's short string, the interval line from interval_short and the scenario named", async () => {
    mount();
    expect(await screen.findByTestId("national-kpi")).toHaveTextContent("452.35");
    expect(screen.getByTestId("national-kpi")).toHaveAttribute("title", expect.stringContaining("452.34662"));
    expect(screen.getByTestId("national-kpi-unit")).toHaveTextContent("Mt CO₂e");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Understand where emissions come from—and how certain we are.");
    expect(screen.getByTestId("national-kpi-line")).toHaveTextContent("2023–24 · Reference estimate · excludes land use and forestry");
    const line = await screen.findByTestId("interval-line");
    expect(line).toHaveTextContent("Uncertainty interval: approximately 407.28–533.73 Mt");
    const note = screen.getByTestId("interval-note");
    expect(note).toHaveTextContent("factors shared across modules");
    expect(note).toHaveTextContent("456.91 Mt CO₂e");
    expect(note).toHaveTextContent("the headline is the reference estimate");
    expect(note.textContent).not.toContain("407.42"); // the other scenario is not the headline
    expect(screen.getByTestId("total-card").querySelectorAll("[data-testid=receipt-footer]").length).toBe(2);
    // the national scope was asked of the API, never the series
    const calls = fetchSpy.mock.calls.filter(([u]) => String(u).includes("/query/uncertainty"));
    expect(calls.length).toBeGreaterThan(0);
    for (const [, body] of calls) expect(body).toEqual({ scope: "national" });
  });
  it("the interval is not shown when the view leaves the release's national scope", async () => {
    mount("?sector=power");
    await screen.findByTestId("national-kpi");
    expect(screen.queryByTestId("interval")).toBeNull();
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes("/query/uncertainty"))).toEqual([]);
  });
  it("lists the five largest sectors with their short displays and captions the top cell's share_pct_short", async () => {
    mount();
    const rows = await screen.findAllByTestId("sector-row");
    expect(rows.map((r) => r.getAttribute("data-sector"))).toEqual(["agriculture", "power", "transport", "waste", "residential"]);
    expect(rows[0]).toHaveTextContent("Agriculture");
    expect(rows[0]).toHaveTextContent("223.45");
    expect(rows[0].textContent).not.toContain("223.454");
    expect(screen.getByTestId("sector-caption")).toHaveTextContent("Agriculture accounts for 49.4% of the reference estimate. Select any sector for a plain-language explanation.");
    expect(screen.getByTestId("sectors-link")).toHaveAttribute("href", "/explore");
    expect(screen.getByTestId("trend-link")).toHaveAttribute("href", "/explore");
  });
  it("without share_pct_short the caption carries no share (the browser computes none)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url, body) => {
        if (url.endsWith("/release")) return RELEASE;
        if (url.endsWith("/openapi.json")) return { paths: {}, components: { schemas: {} } };
        if (url.includes("/query/uncertainty")) return envelope(UNCERTAINTY);
        if (body?.group_by?.includes("sector_id")) return envelope(SECTORS.map((c) => ({ ...c, extra: {} })));
        if (url.includes("/timeseries")) return envelope([{ display: "452.347", display_short: "452.35", group: { period_id: "FY2023-24" } }]);
        return envelope([{ display: "452.34662", display_short: "452.35" }]);
      }),
    );
    mount();
    await screen.findAllByTestId("sector-row");
    expect(screen.getByTestId("sector-caption")).toHaveTextContent("Select any sector for a plain-language explanation.");
    expect(screen.getByTestId("sector-caption").textContent).not.toContain("%");
  });
  it("selecting a sector explains it from get_evidence and get_method and links the Map filtered to it", async () => {
    mount();
    const rows = await screen.findAllByTestId("sector-row");
    fireEvent.click(rows[0]);
    const panel = await screen.findByTestId("sector-explain");
    expect(panel).toHaveAttribute("data-sector", "agriculture");
    expect(await within(panel).findByTestId("sector-method")).toHaveTextContent("Enteric fermentation: Country-specific head counts from the agricultural census; IPCC default emission factors by species (2006 V4 Ch10 Eq 10.19/10.20, tier T1)");
    expect(within(panel).getByTestId("sector-evidence")).toHaveTextContent("Evidence class E2, E3 across 2 source streams");
    expect(within(panel).getByTestId("sector-map-link")).toHaveAttribute("href", "/map?sector=agriculture");
    const methodCall = fetchSpy.mock.calls.find(([u]) => String(u).includes("/method/"));
    expect(String(methodCall?.[0])).toContain("/method/Enteric%20fermentation");
    fireEvent.click(rows[0]);
    expect(screen.queryByTestId("sector-explain")).toBeNull();
  });
  it("the chips and the question box go to /ask?q=", async () => {
    mount();
    await screen.findByTestId("national-kpi");
    const chips = screen.getAllByTestId("question-chip");
    expect(chips.map((c) => c.textContent)).toEqual(["What is Pakistan's largest source?", "Have emissions increased?", "How certain is this estimate?"]);
    expect(chips[0]).toHaveAttribute("href", `/ask?q=${encodeURIComponent("What is Pakistan's largest source?")}`);
    fireEvent.change(screen.getByTestId("question-input"), { target: { value: "  Which sector grew most?  " } });
    fireEvent.submit(screen.getByTestId("question-input").closest("form")!);
    expect(push).toHaveBeenCalledWith(`/ask?q=${encodeURIComponent("Which sector grew most?")}`);
    expect(screen.getByTestId("deeper-map")).toHaveAttribute("href", "/map");
    expect(screen.getByTestId("deeper-download")).toHaveAttribute("href", "/downloads");
    expect(screen.getByTestId("nav-ask")).toHaveAttribute("href", "/ask");
  });
  it("the trend card reads 'Two fiscal years · reference estimate' from the dims and draws the series", async () => {
    mount();
    expect(await screen.findByTestId("trend-stub")).toHaveTextContent("372.40 452.35");
    expect(screen.getByTestId("trend-card-subtitle")).toHaveTextContent("Two fiscal years · reference estimate");
    expect(screen.getByTestId("trend-stub")).toHaveTextContent("Million tonnes CO₂e, excluding land use");
  });
  it("audits: every decimal is a server string; no FY; no raw id; no avoid-list phrase; the footer names the licences and no version", async () => {
    mount();
    await screen.findByTestId("interval-line");
    await screen.findAllByTestId("sector-row");
    await screen.findByTestId("trend-stub");
    fireEvent.click(screen.getAllByTestId("sector-row")[0]);
    await screen.findByTestId("sector-method");
    const allowed = serverDecimals();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const tokens: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) tokens.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
    expect(tokens.length).toBeGreaterThan(5);
    for (const t of tokens) expect(allowed.has(t), t).toBe(true);
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("FY");
    expect(text).not.toMatch(/(^|[^A-Z0-9(])AR5(?![)\w])/);
    expect(text).not.toContain("(NE)");
    expect(text).not.toContain("LULUCF");
    expect(text).not.toContain("1.0.0rc");
    expect(text).not.toContain("REF_2023_24");
    expect(text).not.toContain("Mt CO2e");
    expect(avoidPhrasesIn(text)).toEqual([]);
    for (const el of Array.from(document.body.querySelectorAll("[title]"))) {
      expect(el.getAttribute("title") ?? "").not.toContain("FY");
      expect(el.getAttribute("title") ?? "").not.toContain("1.0.0rc");
    }
    expect(screen.getByTestId("footer")).toHaveTextContent("Data and text CC-BY-4.0 · code MIT · OSM-derived tables ODbL");
    expect(screen.getByTestId("explainers")).toHaveTextContent("Estimate, not a live reading");
    expect(screen.getByTestId("explainers")).toHaveTextContent("Location has an evidence grade");
    expect(screen.getByTestId("explainers")).toHaveTextContent("Every answer is traceable");
  });
});
