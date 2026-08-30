import "@testing-library/jest-dom/vitest";
/**
 * The claim record over a record GET /claim returned (trimmed): the humanised breadcrumb,
 * every one of the eleven sections rendered with the API's strings (reported estimate,
 * calculation, activity, factors and the method rule, the monthly and spatial bases with the
 * class definitions on hover and inline, the uncertainty rows, the sources with "Not carried
 * by this release" for the pages, the validation rows, the limitation and the completeness
 * justification, the exact rows with their download links); a sparse record says "Not carried
 * by this release" in every empty section; the audits (every decimal a fixture string, no FY
 * or raw id outside the mono blocks, no version, no avoid-list phrase); a typed 422 in the
 * route's own shape is the RefusalCard; the Result details drawer's Evidence tab fetches the
 * chosen cell; ClaimLink opens the drawer.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { releaseDims, releaseLabels } from "@/lib/release";
import type { Envelope, ReleaseInfo } from "@/lib/envelope";
import { ClaimSchema, breadcrumbText, claimHref, parseClaimParam, sectionState, type Claim } from "@/lib/claim";
import { ClaimRecord } from "./ClaimRecord";
import { ClaimLink, ClaimPanel } from "./ClaimDrawer";
import { EnvelopeDrawer } from "@/components/ui/EnvelopeDrawer";
import { RELEASE, envelope, mockFetch } from "@/__tests__/fixtures";
import { CLAIM } from "@/__tests__/claimFixture";
import { avoidPhrasesIn } from "@/__tests__/vocabulary";

vi.mock("next/navigation", () => ({ usePathname: () => "/methods", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const release = RELEASE as unknown as ReleaseInfo;
const labels = releaseLabels(release);
const dims = releaseDims(release);
const claim: Claim = ClaimSchema.parse(CLAIM);

const SECTIONS = ["reported", "calculation", "activity", "emission_factors", "monthly_basis", "spatial_basis", "uncertainty", "sources", "validation", "limitations", "rows"];

function decimalsOf(root: Node): string[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const tokens: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) tokens.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
  return tokens;
}

describe("ClaimRecord", () => {
  it("renders the humanised breadcrumb and every section from the API's strings", () => {
    render(<ClaimRecord claim={claim} labels={labels} dims={dims} />);
    expect(screen.getByTestId("claim-breadcrumb")).toHaveAttribute("data-text", "Agriculture → Enteric fermentation → CH₄ → Pakistan → 2023–24");
    expect(screen.getAllByTestId("crumb").map((c) => c.getAttribute("data-level"))).toEqual(["sector", "category", "gas", "geography", "period"]);
    expect(screen.getAllByTestId("crumb-label").map((c) => c.textContent)).toEqual(["Agriculture", "Enteric fermentation", "CH₄", "Pakistan", "2023–24"]);
    expect(breadcrumbText(labels, dims, claim)).toBe("Agriculture → Enteric fermentation → CH₄ → Pakistan → 2023–24");
    for (const id of SECTIONS) expect(screen.getByTestId(`claim-${id}`)).toHaveAttribute("data-state", "data");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Reported estimate", "Calculation", "Activity data", "Emission factors", "Monthly allocation basis", "Spatial allocation basis", "Uncertainty", "Source documents and pages", "Validation tests", "Known limitation", "Exact machine-readable rows"]);
    // reported
    const reported = screen.getByTestId("claim-reported");
    expect(within(reported).getByTestId("reported-short")).toHaveTextContent("151.66");
    expect(within(reported).getByTestId("reported-headline")).toHaveTextContent("Mt CO₂e");
    expect(within(reported).getByTestId("reported-exact")).toHaveTextContent("151.657649530000000000");
    expect(reported).toHaveTextContent("Published value151.658 Mt CO₂e");
    expect(reported).toHaveTextContent("IPCC 2013 (AR5)");
    expect(reported).toHaveTextContent("Reference estimate");
    expect(reported).toHaveTextContent("Period2023–24");
    expect(reported).toHaveTextContent("PlacePakistan");
    expect(reported).toHaveTextContent("Rows summed6");
    expect(within(reported).getByTestId("reported-release")).toHaveTextContent("commit bc1716d6df79");
    expect(within(reported).getByTestId("reported-release")).toHaveAttribute("title", "PakEmis 1.0.0rc42");
    // calculation
    const calc = screen.getByTestId("claim-calculation");
    expect(within(calc).getByTestId("claim-sql")).toHaveTextContent("SUM(CAST(co2e_Mt_AR5 AS DECIMAL(38,18)))");
    expect(within(calc).getByTestId("result-sha256")).toHaveTextContent("e7538d58a2417fa46a8d72378700b0851876cb97a55ab02f8bc131b2315985b1");
    expect(calc).toHaveTextContent("Rows summed6");
    // activity
    const activity = screen.getByTestId("activity-table");
    expect(activity).toHaveTextContent("Agriculture › enteric fermentation › buffalo › CH₄");
    expect(activity).toHaveTextContent("2625.61024 Gg");
    expect(activity).toHaveTextContent("observed");
    expect(within(activity).getAllByTestId("class-code")[0]).toHaveAttribute("title", "published statistic for this source and period, not independently verified");
    expect(screen.getByTestId("activity-parameters")).toHaveTextContent("47738368.0 head");
    // emission factors + method rule
    const ef = screen.getByTestId("ef-table");
    expect(ef).toHaveTextContent("55 kg CH4/head/yr");
    expect(ef).toHaveTextContent("40 %");
    expect(ef).toHaveTextContent("IPCC 2006 V4 Ch10 Table 10.10");
    expect(screen.getByTestId("method-rules")).toHaveTextContent("2006 V4 Ch10 Eq 10.19/10.20");
    expect(screen.getByTestId("method-rules")).toHaveTextContent("T1");
    // monthly basis: the class with its definition inline and on hover
    const monthly = screen.getByTestId("claim-monthly_basis");
    expect(monthly).toHaveTextContent("T4 — flat or weakly-informed profile; no monthly evidence for this source");
    expect(monthly).toHaveTextContent("Timing gradeTE4");
    expect(monthly).toHaveTextContent("flat — flat: the activity is a livestock census enumeration and carries no month");
    expect(monthly).toHaveTextContent("Closure basisnative mass");
    expect(within(monthly).getByTestId("monthly-by-stream")).toHaveTextContent("Per stream (2)");
    // spatial basis
    const spatial = screen.getByTestId("claim-spatial_basis");
    expect(spatial).toHaveTextContent("S3 — administrative statistic (provincial sales, registrations, census counts)");
    expect(spatial).toHaveTextContent("Placementdiffuse by nature");
    expect(spatial).toHaveTextContent("Allocation surfaceglw livestock");
    expect(spatial).toHaveTextContent("Fallback events3");
    expect(within(spatial).getByTestId("spatial-rationale")).toHaveTextContent("census heads by district");
    expect(within(spatial).getByTestId("spatial-by-stream")).toHaveTextContent("1.24 Mt CO₂e");
    // uncertainty rows
    const unc = screen.getByTestId("uncertainty-table");
    expect(unc).toHaveTextContent("annual adm2");
    expect(unc).toHaveTextContent("-22.22 % to 29.95 %");
    expect(unc).toHaveTextContent("151.65 Mt CO₂e");
    expect(unc).toHaveTextContent("declared unpriced");
    // sources: pages not carried
    const sources = screen.getAllByTestId("source-row");
    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveTextContent("Pakistan Economic Survey 2023-24, Agriculture chapter, Fig-2.3");
    expect(sources[0]).toHaveTextContent("Licenceundetermined");
    expect(within(sources[0]).getByTestId("source-pages")).toHaveTextContent("Not carried by this release — no register carries page numbers; pages appear only as prose in the notes");
    // validation
    const validation = screen.getAllByTestId("validation-row");
    expect(validation).toHaveLength(2);
    expect(validation[0]).toHaveTextContent("abs-agriculture-timing");
    expect(validation[0]).toHaveTextContent("declared absent");
    expect(validation[1]).toHaveTextContent("pass=7");
    // limitation + completeness
    const lim = screen.getByTestId("claim-limitations");
    expect(within(lim).getByTestId("limitation-row")).toHaveTextContent("lulucf_excluded");
    expect(within(lim).getByTestId("limitation-row")).toHaveTextContent("no land-use, land-use-change or forestry flux enters any total");
    expect(within(lim).getByTestId("completeness-block")).toHaveTextContent("Tier 1 EFs (Indian Subcontinent) x census livestock; dominant category.");
    // rows
    const rows = screen.getByTestId("claim-rows");
    expect(rows).toHaveTextContent("Rows2");
    expect(within(rows).getByTestId("rows-download-csv")).toHaveAttribute("href", "http://localhost:8000/api/v1/emissions/download/060bde899b5bb984553b61722584952a.csv");
    expect(within(rows).getByTestId("rows-receipt-json")).toHaveAttribute("href", "http://localhost:8000/api/v1/emissions/download/060bde899b5bb984553b61722584952a.receipt.json");
    expect(within(rows).getByTestId("records-table")).toHaveTextContent("075504638360167dc7d81e24");
    expect(screen.getByTestId("claim-provenance")).toHaveTextContent("Tables and registries read (3)");
  });

  it("a sparse record says 'Not carried by this release' in every empty section, with the API's message where it names one", () => {
    const sparse: Claim = ClaimSchema.parse({
      breadcrumb: [{ level: "sector", id: null, label: "All sectors", n: 3 }, { level: "geography", id: "ADM1:Punjab", label: "ADM1:Punjab" }, { level: "period", id: "FY2020-21", label: "FY2020-21" }],
      reported: { display: "228.7168", display_short: "228.72", exact: "228.7168", unit: "Mt CO2e AR5", unit_short: "Mt CO₂e", n_rows: 3, release: { release: "PakEmis 1.0.0rc42", version: "1.0.0rc42", commit: "bc1716d6" } },
      calculation: null,
      activity: [],
      emission_factors: null,
      method: null,
      monthly_basis: null,
      spatial_basis: { spatial_class_measured: null, by_stream: [] },
      uncertainty: [],
      sources: null,
      validation: [],
      limitations: [],
      completeness: null,
      rows: null,
      class_definitions: {},
      missing: [{ section: "emission_factors", message: "not carried by this release: no factor row joins these streams" }, { section: "sources.pages", message: "not carried by this release: no register carries page numbers" }],
    });
    render(<ClaimRecord claim={sparse} labels={labels} dims={dims} />);
    expect(screen.getByTestId("claim-breadcrumb")).toHaveAttribute("data-text", "All sectors → Punjab → 2020–21");
    expect(screen.getAllByTestId("crumb-label")[0]).toHaveTextContent("All sectors (3)");
    expect(screen.getByTestId("claim-reported")).toHaveAttribute("data-state", "data");
    expect(screen.getByTestId("claim-reported")).toHaveTextContent("PlacePakistan");
    const missing = screen.getAllByTestId("not-carried");
    expect(missing).toHaveLength(10);
    for (const m of missing) expect(m).toHaveTextContent("Not carried by this release");
    expect(screen.getByTestId("claim-emission_factors")).toHaveTextContent("Not carried by this release — no factor row joins these streams");
    expect(sectionState(sparse, "spatial_basis")).toEqual({ kind: "missing", message: "" });
    expect(sectionState(claim, "spatial_basis")).toEqual({ kind: "data" });
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("FY");
    expect(text).not.toContain("1.0.0rc");
  });

  it("audits: every decimal is a fixture string; no FY, raw id, GWP token or version outside the mono blocks; no avoid-list phrase", () => {
    const { container } = render(<ClaimRecord claim={claim} labels={labels} dims={dims} />);
    const allowed = new Set((JSON.stringify(CLAIM).match(/\d+\.\d+/g) ?? []));
    const tokens = decimalsOf(container);
    expect(tokens.length).toBeGreaterThan(10);
    for (const t of tokens) expect(allowed.has(t), t).toBe(true);
    for (const el of Array.from(container.querySelectorAll("[data-allow-raw]"))) el.remove();
    const text = container.textContent ?? "";
    expect(text).not.toContain("FY");
    expect(text).not.toContain("REF_2023_24");
    expect(text).not.toContain("Mt CO2e");
    expect(text).not.toContain("1.0.0rc");
    expect(text).not.toMatch(/(^|[^A-Z0-9(])AR5(?![)\w])/);
    expect(avoidPhrasesIn(text)).toEqual([]);
    for (const el of Array.from(container.querySelectorAll("[title]"))) expect(el.getAttribute("title") ?? "").not.toContain("FY");
  });

  it("the permalink round-trips", () => {
    expect(claimHref({ receipt: "060bde899b5bb984553b61722584952a", cell: 0 })).toBe("/methods?claim=060bde899b5bb984553b61722584952a%3A0");
    expect(parseClaimParam("060bde899b5bb984553b61722584952a:2")).toEqual({ receipt: "060bde899b5bb984553b61722584952a", cell: 2 });
    expect(parseClaimParam("nonsense")).toBeNull();
  });
});

describe("ClaimPanel, the Evidence tab and ClaimLink", () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        fetchSpy(url);
        if (url.includes("/claim?")) {
          const u = new URL(url);
          if (u.searchParams.get("receipt")?.startsWith("dead")) return { __status: 422, body: { detail: { error: "no_rows", message: "cell 0 of receipt dead sums no rows (right - left (two exact sums))" } } };
          return CLAIM;
        }
        return RELEASE;
      }),
    );
  });

  it("renders the record for a selector and the permalink to Methods", async () => {
    render(
      <Providers>
        <ClaimPanel selector={{ receipt: "060bde899b5bb984553b61722584952a", cell: 0 }} labels={labels} dims={dims} />
      </Providers>,
    );
    expect(await screen.findByTestId("claim-record")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:8000/api/v1/emissions/claim?receipt=060bde899b5bb984553b61722584952a&cell=0");
    expect(screen.getByTestId("claim-permalink")).toHaveAttribute("href", "/methods?claim=060bde899b5bb984553b61722584952a%3A0");
  });

  it("a typed 422 in the route's own shape is the RefusalCard by name", async () => {
    render(
      <Providers>
        <ClaimPanel selector={{ receipt: "deadbeefdeadbeefdeadbeefdeadbeef", cell: 0 }} labels={labels} dims={dims} />
      </Providers>,
    );
    const card = await screen.findByTestId("refusal-card");
    expect(card).toHaveTextContent("Refused: NoRows");
    expect(card).toHaveTextContent("no_rows");
    expect(card).toHaveTextContent("sums no rows");
    expect(screen.queryByTestId("claim-record")).toBeNull();
  });

  it("the Result details drawer's Evidence tab fetches the chosen cell of the envelope", async () => {
    const env = envelope([{ display: "223.454", display_short: "223.45", group: { sector_id: "agriculture" } }, { display: "63.370", display_short: "63.37", group: { sector_id: "power" } }], { receipt: "060bde899b5bb984553b61722584952a" }) as unknown as Envelope;
    render(
      <Providers>
        <EnvelopeDrawer env={env} tab="evidence" labels={labels} onClose={() => undefined} />
      </Providers>,
    );
    expect(screen.getByRole("tab", { name: "Evidence" })).toHaveAttribute("aria-selected", "true");
    const picker = screen.getByTestId("evidence-cell");
    expect(within(picker).getAllByRole("option").map((o) => o.textContent)).toEqual(["Agriculture · 223.45", "power · 63.37"]);
    expect(await screen.findByTestId("claim-record")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/claim?receipt=060bde899b5bb984553b61722584952a&cell=0"));
    fireEvent.change(picker, { target: { value: "1" } });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("&cell=1")));
  });

  it("ClaimLink opens the drawer on its receipt and cell", async () => {
    render(
      <Providers>
        <ClaimLink receipt="060bde899b5bb984553b61722584952a" cell={0} />
      </Providers>,
    );
    fireEvent.click(screen.getByTestId("claim-link"));
    expect(screen.getByRole("dialog", { name: "Claim record" })).toBeInTheDocument();
    expect(await screen.findByTestId("claim-record")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("claim-drawer-crumb")).toHaveTextContent("Agriculture → Enteric fermentation → CH₄ → Pakistan → 2023–24"));
  });
});
