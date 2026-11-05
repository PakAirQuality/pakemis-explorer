/**
 * The structured answer card over a scripted stream carrying the API's additions (answer.scope,
 * tool_result.uncertainty, n_rows per cell): all eight parts render from the events and the
 * replayed envelope, every decimal on screen is a fixture display, no "FY" is printed; the
 * reasoning folds under "How this was answered"; without the additions the card degrades
 * (scope from the result's context, "Uncertainty not requested" with a one-click follow-up,
 * row counts from the replay or named as not carried); an uncertainty tool result of the turn
 * fills the uncertainty part; a single cell is a figure and a bounded cell a table.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import { resolveState, type ExplorerState } from "@/lib/urlState";
import type { ReleaseInfo } from "@/lib/envelope";
import { RELEASE, envelope } from "@/__tests__/fixtures";
import { AskDock } from "./AskDock";
import { chartKind, principalTool, scopeRows } from "./answerParts";
import { timelineOf } from "./timeline";
import type { AskEvent } from "./types";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/charts/BarsWithAxis", () => ({
  BarsWithAxis: ({ items, ticks }: { items: { name: string; label: string; value: number }[]; ticks?: string[] | null }) => (
    <div data-testid="answer-bars" data-ticks={(ticks ?? []).join("|")}>
      {items.map((i) => (
        <span key={i.name} data-testid="bar" data-value={String(i.value)}>{i.name} {i.label}</span>
      ))}
    </div>
  ),
}));
vi.mock("@/components/charts/ColumnChart", () => ({
  ColumnChart: ({ points, ticks }: { points: { name: string; label: string; reference?: boolean }[]; ticks?: string[] | null }) => (
    <div data-testid="answer-columns" data-ticks={(ticks ?? []).join("|")}>
      {points.map((p) => (
        <span key={p.name} data-testid="column" data-reference={p.reference ? "1" : "0"}>{p.name} {p.label}</span>
      ))}
    </div>
  ),
}));

const RECEIPT = "8328128a5bd1eca6b1a29ad79cf6d910";
const RECEIPT_U = "5eb40940d01be992a296f658fb91ab9e";
const UNIT = "Mt CO2e AR5";
const CID = "c0ffee00deadbeef";
const CELLS = [
  { display: "151.658", display_short: "151.66", group: { category: "Enteric fermentation" }, i: 0, unit: UNIT, n_rows: 6 },
  { display: "20.123", display_short: "20.12", group: { category: "Manure management" }, i: 1, unit: UNIT, n_rows: 4 },
  { display: "9.876", display_short: "9.88", group: { category: "Rice cultivation" }, i: 2, unit: UNIT, n_rows: 1 },
];
const CONTEXT = { basis: "fiscal", configuration_id: "REF_2023_24", defaults_applied: ["basis", "configuration_id", "gwp_basis"], geography_ids: null, geography_level: null, gwp_basis: "AR5", periods: ["FY2023-24"], reporting_period: "FY2023-24", spatial_view: null };
const UNCERTAINTY = {
  rows: [{ result_row_id: "dc95be265a6612d9e004d366", category: "Enteric fermentation", module: "agriculture", resolution: "annual_national", estimate_Mt: "151.65", parametric_low_pct: "-22.22", parametric_high_pct: "29.95", parametric_kind: "probabilistic: 100,000-draw Monte Carlo, 95% interval", timing_pct: "0.0", timing_status: "not-applicable", placement_pct: "0.0", placement_status: "declared-unpriced", envelope_low_pct: "-22.22", envelope_high_pct: "29.95", envelope_kind: "bound, not a distribution", aggregation_rule: "never in quadrature" }],
  interpretation: "per-category envelopes (structural, no probability)",
};
const INPUT = { periods: ["FY2023-24"], sectors: ["agriculture"], group_by: ["category"], gwp_basis: "AR5" };

const FULL: [string, unknown][] = [
  ["status", { phase: "model", turn: 1 }],
  ["thinking", { text: "Agriculture by category answers it." }],
  ["tool_call", { id: "toolu_01", input: INPUT, k: 1, name: "query_emissions" }],
  ["status", { k: 1, name: "query_emissions", phase: "tool" }],
  ["tool_result", { cells: CELLS, context: CONTEXT, id: "toolu_01", k: 1, limitations_hit: ["lulucf_excluded"], n_values: 3, name: "query_emissions", receipt: RECEIPT, request_type: "query_emissions", uncertainty: UNCERTAINTY }],
  ["status", { phase: "model", turn: 2 }],
  ["tool_call", { id: "toolu_02", input: { sector: "agriculture" }, k: 2, name: "set_map_view" }],
  ["map_action", { sector: "agriculture" }],
  ["status", { phase: "model", turn: 3 }],
  [
    "answer",
    {
      citations: [{ attr: "display", cell: 0, k: 1, receipt: RECEIPT, text: "151.658" }],
      elapsed_s: 3.5,
      receipts: [RECEIPT],
      scope: { ...CONTEXT, k: 1, name: "query_emissions", receipt: RECEIPT, request_type: "query_emissions" },
      text: `Livestock (enteric fermentation) contributes <cite k="1" cell="0" receipt="${RECEIPT}">151.658</cite> <cite k="1" cell="0" receipt="${RECEIPT}">${UNIT}</cite> of agriculture in 2023–24.`,
    },
  ],
  ["done", { conversation_id: CID, cost_estimate_usd: 0.002, usage: { input_tokens: 500, output_tokens: 60 } }],
];

/** The same turn without the additions (an older API), and no uncertainty rows. */
const BARE: [string, unknown][] = FULL.map(([n, d]) => {
  if (n === "tool_result") {
    const r = d as Record<string, unknown>;
    return [n, { ...r, cells: CELLS.map((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== "n_rows"))), uncertainty: undefined }];
  }
  if (n === "answer") {
    const a = d as Record<string, unknown>;
    return [n, { ...a, scope: undefined }];
  }
  return [n, d];
});

function sseText(events: [string, unknown][]): string {
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}
function sseResponse(text: string): Response {
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
  return { ok: true, status: 200, statusText: "OK", headers: new Headers({ "content-type": "text/event-stream" }), body } as unknown as Response;
}
const REPLAY = envelope(
  [
    { display: "151.658", display_short: "151.66", group: { category: "Enteric fermentation" }, extra: { share_pct_short: "67.9", result_row_ids: ["a", "b", "c", "d", "e", "f"] } },
    { display: "20.123", display_short: "20.12", group: { category: "Manure management" }, extra: { share_pct_short: "9.0", result_row_ids: ["g", "h", "i", "j"] } },
    { display: "9.876", display_short: "9.88", group: { category: "Rice cultivation" }, extra: { share_pct_short: "4.4", result_row_ids: ["k"] } },
  ],
  { receipt: RECEIPT, axis: { ticks_short: ["0", "50", "100", "150", "200"] }, context: { ...envelope([]).context, periods: ["FY2023-24"] } },
);
function fetchFor(events: [string, unknown][], replay: unknown = REPLAY) {
  return vi.fn(async (url: string) => {
    if (String(url).endsWith("/ask")) return sseResponse(sseText(events));
    if (String(url).includes("/receipt/")) {
      if (!replay) return { ok: false, status: 404, statusText: "Not Found", json: async () => ({ error: "unknown_receipt", error_class: "UnknownReceipt", message: "no such receipt", limitation_id: null, detail: {} }) } as unknown as Response;
      return { ok: true, status: 200, statusText: "OK", json: async () => replay } as unknown as Response;
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

const DEFAULTS = { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" };
const base: ExplorerState = resolveState({ sector: "agriculture" }, DEFAULTS);
const release = RELEASE as unknown as ReleaseInfo;
const labels = releaseLabels(release);
const dims = releaseDims(release);
function ctx(setState = vi.fn(), state: ExplorerState = base): ExplorerContextValue {
  return { state, setState, release, labels, dims, defaults: DEFAULTS, contract: undefined, agent: { enabled: true, model: "gemini-test", reason: "", library: "lib", usable: true }, isMobile: false };
}
function mount(setState = vi.fn(), state: ExplorerState = base) {
  return render(
    <Providers>
      <ExplorerContext.Provider value={ctx(setState, state)}>
        <AskDock />
      </ExplorerContext.Provider>
    </Providers>,
  );
}
async function askQuestion(text: string) {
  const box = screen.getByTestId("question") as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(box, { key: "Enter" });
  });
  await waitFor(() => expect(screen.getByTestId("turn").getAttribute("data-status")).toBe("done"));
}
function decimalsOnScreen(): string[] {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(...((n.textContent ?? "").match(/\d+\.\d+/g) ?? []));
  return out;
}
// The guard is that every DECIMAL on screen is a string the server sent, so the chrome can never
// print a figure it made up. "1.0" is not a figure: it is the leading part of the release identity
// the footer prints (release_id, e.g. "PakEmis 1.0.0rc42"), which is itself a server string. It is
// allowed by name rather than by loosening the rule, so a real invented number still fails.
const RELEASE_IDENTITY_DECIMALS = ["1.0"];
const ALLOWED = ["151.658", "151.66", "20.123", "20.12", "9.876", "9.88", "67.9", "9.0", "4.4", "3.5", "0.002", "22.22", "29.95", "0.0", ...RELEASE_IDENTITY_DECIMALS];

beforeEach(() => window.localStorage.clear());

describe("answerParts", () => {
  it("names the principal tool by the answer's scope, else the last result with cells; reads the chart kind from the cells", () => {
    const events: AskEvent[] = FULL.map(([name, data]) => ({ name, data }));
    const tl = timelineOf(events);
    expect(principalTool(tl.items, tl.answer?.scope)?.k).toBe(1);
    expect(principalTool(tl.items, null)?.k).toBe(1);
    expect(chartKind(CELLS)).toBe("bars");
    expect(chartKind([{ i: 0, display: "452.347", unit: UNIT, group: { period_id: "FY2023-24" } }, { i: 1, display: "372.397", unit: UNIT, group: { period_id: "FY2020-21" } }])).toBe("columns");
    expect(chartKind([{ i: 0, display: "452.347", unit: UNIT }])).toBe("figure");
    expect(chartKind([{ i: 0, display: "[1.20, 1.29]", unit: UNIT, group: { shape_id: "x" }, exactness: "bounded" }])).toBe("table");
    expect(chartKind([])).toBe("none");
    // an answer over calendar years has no period: it is captioned with its own years, never with
    // the release's reporting period (which read "Period: 2023–24" over a 1990-2024 trend)
    const trend = scopeRows(labels, dims, { periods: [], reporting_period: "FY2023-24", geography_level: "national" }, { pollutants: ["NH3"], years: ["1990", "1991", "1992", "1993"], group_by: ["year"] });
    expect(trend.map((r) => `${r.name}: ${r.value}`).filter((r) => /^(Period|Years)/.test(r))).toEqual(["Years: 1990–1993"]);
    expect(scopeRows(labels, dims, { periods: [], reporting_period: "FY2023-24" }, { years: ["1990", "2024"] })[0]).toMatchObject({ name: "Years", value: "1990, 2024" });
    const rows = scopeRows(labels, dims, CONTEXT, INPUT, { basis: "fiscal", label: "July–June years" });
    expect(rows.map((r) => `${r.name}: ${r.value}`)).toEqual(["Period: 2023–24", "Geography: Pakistan (national)", "Estimate: Reference estimate", "Warming potentials: IPCC 2013 (AR5)", "Basis: July–June years", "Sectors: Agriculture", "Group by: Category", "Filled by default: basis, configuration id, gwp basis"]);
  });
});

/** The eight parts live behind the provenance line's "View evidence" now. */
function openEvidence(): HTMLElement {
  fireEvent.click(screen.getByTestId("provenance-action"));
  return screen.getByTestId("evidence-detail");
}

describe("AnswerCard", () => {
  it("is prose and ONE attachment, with the eight parts behind View evidence", async () => {
    // DELIBERATELY RESHAPED. This asserted eight sections stacked under every answer, inside a
    // bordered card, with the tool cards folded under "How this was answered". The answer is a chat
    // message now: text, at most one attachment, and a provenance line. Nothing was deleted - every
    // part below is still asserted, one click further in.
    vi.stubGlobal("fetch", fetchFor(FULL));
    mount();
    await askQuestion("How much comes from livestock?");
    const card = screen.getByTestId("answer-card");
    expect(card.getAttribute("data-principal-k")).toBe("1");

    // (1) the direct answer with its cite, unboxed
    const answer = within(card).getByTestId("answer-part-answer");
    expect(within(answer).getAllByTestId("cite").map((c) => c.textContent)).toEqual(["151.658", UNIT]);

    // (2) THE ONE ATTACHMENT: a grouped result is a chart, titled and unitised from the result
    const att = within(card).getByTestId("answer-attachment");
    expect(att.getAttribute("data-kind")).toBe("chart");
    expect(att).toHaveTextContent("National greenhouse-gas emissions");
    await waitFor(() => expect(within(att).getByTestId("answer-bars").getAttribute("data-ticks")).toBe("0|50|100|150|200"));
    expect(within(att).getAllByTestId("bar").map((b) => b.textContent)).toEqual(["Enteric fermentation 151.66 · 67.9 %", "Manure management 20.12 · 9.0 %", "Rice cultivation 9.88 · 4.4 %"]);
    fireEvent.click(within(att).getByTestId("result-toggle"));
    const trs = within(att).getAllByTestId("answer-row");
    expect(trs).toHaveLength(3);
    expect(trs[0]).toHaveTextContent("Enteric fermentation");
    expect(trs[0]).toHaveTextContent("151.66 Mt CO₂e");
    expect(trs[0]).toHaveTextContent("6");
    expect(trs[0].textContent).not.toContain("151.658");

    // THE TAIL IS ALWAYS THE SAME THINGS, chart or no chart: the answer, the release's caveat, then
    // the way in to the sources. The line used to sit in the chart's footer, which put it somewhere
    // different depending on what the question happened to return.
    const tail = Array.from(card.children).map((el) => el.getAttribute("data-testid"));
    // this fixture's agent DID call set_map_view, so the move is announced where the six-chip
    // "moved the map" block used to be
    expect(tail).toEqual(["answer-part-answer", "answer-attachment", "answer-caveat", "provenance", "map-moved"]);
    // the caveat is stated ONCE, by us, in the release's own words - and the scope sentence that
    // led it is gone: the answer names its own year and place
    const note = within(card).getByTestId("answer-caveat");
    expect(note.textContent).toMatch(/^The release /);
    for (const word of ["These are", "national", "IPCC 2013 (AR5)", "warming potentials", "FY"]) expect(note.textContent).not.toContain(word);
    expect(within(card).getAllByTestId("answer-caveat")).toHaveLength(1);
    expect(within(card).queryByTestId("scope-note")).toBeNull();
    const prov = within(card).getByTestId("provenance");
    expect(within(prov).getByTestId("provenance-action")).toHaveTextContent("View details");
    // the move is stated in the reader's own words, with the way back
    expect(screen.getByTestId("map-moved")).toHaveTextContent("Map updated to");
    expect(screen.getByTestId("map-undo")).toBeInTheDocument();
    expect(screen.queryByTestId("show-on-map")).toBeNull();   // it already moved; do not offer it twice
    expect(prov.textContent).not.toContain("Published release");
    expect(screen.queryByTestId("evidence-detail")).toBeNull();
    fireEvent.click(within(prov).getByTestId("provenance-action"));
    const fold = screen.getByTestId("evidence-detail");

    // (3) the applied scope, in the release's own words
    const rows = within(within(fold).getByTestId("detail-scope")).getAllByTestId("scope-row").map((r) => r.textContent);
    expect(rows).toEqual(["Period 2023–24", "Geography Pakistan (national)", "Estimate Reference estimate", "Warming potentials IPCC 2013 (AR5)", "Basis July–June years", "Sectors Agriculture", "Group by Category", "Filled by default basis, configuration id, gwp basis"]);
    // (4) THE DETAILS ARE READABLE. The tool's own name, its cell count, the per-cell row counts,
    // the raw result table and the bare receipt string are all gone - a reader who opens this to
    // understand an answer must not meet a database row.
    const detailText = fold.textContent ?? "";
    expect(within(fold).queryByTestId("result-caption")).toBeNull();
    expect(within(fold).queryByTestId("answer-rows")).toBeNull();
    expect(within(fold).queryByTestId("rows-line")).toBeNull();
    expect(within(fold).queryByTestId("receipt-id")).toBeNull();
    expect(detailText).not.toContain("Query emissions");
    expect(detailText).not.toContain("3 cells");
    expect(detailText).not.toContain(RECEIPT);
    // (5) the uncertainty rows the result carried
    const unc = within(fold).getByTestId("detail-uncertainty");
    const uncRow = within(unc).getByTestId("uncertainty-row");
    expect(uncRow).toHaveTextContent("Enteric fermentation");
    expect(uncRow).toHaveTextContent("annual · national");
    expect(uncRow).toHaveTextContent("-22.22 … 29.95 %");
    expect(uncRow.textContent).not.toContain("not-applicable"); // an unpriced half-width stays in the tooltip
    expect(uncRow.getAttribute("title")).toContain("parametric kind: probabilistic: 100,000-draw Monte Carlo, 95% interval");
    expect(uncRow.getAttribute("title")).toContain("timing status: not-applicable");
    expect(uncRow.textContent).not.toContain("151.65"); // the estimate stays in the tooltip, not beside the answer's own figures
    expect(unc).toHaveTextContent("per-category envelopes (structural, no probability)");
    // (6) the limitation, in words, with no chip of ids
    expect(within(fold).getByTestId("detail-evidence")).toHaveTextContent("LULUCF is excluded");
    // (7) permalink to /data from the call's input, and the reproduce link
    const links = within(fold).getByTestId("answer-part-links");
    expect(within(links).getByTestId("explore-permalink")).toHaveAttribute("href", "/data?sector=agriculture");
    // NO CSV: the turn ran no export. One used to appear under every answer, exporting the query -
    // for this question, a 33-cell ledger across sectors the reader never asked about.
    expect(within(links).queryByTestId("download-csv")).toBeNull();
    // reproduction is a LINK, not a hash printed into the panel
    expect(within(links).getByTestId("reproduce-link")).toHaveAttribute("href", `/downloads?receipt=${RECEIPT}`);
    // the model's working never appears, and neither does the meta row it sat under
    expect(screen.queryByTestId("tool-card")).toBeNull();
    expect(screen.queryByTestId("thinking-card")).toBeNull();
    expect(screen.queryByTestId("how-answered")).toBeNull();
    expect(screen.queryByTestId("map-action")).toBeNull();   // the six-chip block is gone
    // every decimal on screen is a fixture display; no period id anywhere in the chrome (the model's prose is the server's)
    for (const t of decimalsOnScreen()) expect(ALLOWED).toContain(t);
    expect(screen.getByTestId("ask-dock").textContent).not.toContain("FY");
  });

  it("degrades without scope, uncertainty and n_rows: context scope, the follow-up chip sends its question, row counts from the replay", async () => {
    const fetchSpy = fetchFor(BARE);
    vi.stubGlobal("fetch", fetchSpy);
    mount();
    await askQuestion("How much comes from livestock?");
    const fold = openEvidence();
    expect(within(fold).getAllByTestId("scope-row").map((r) => r.textContent)[0]).toBe("Period 2023–24");
    // NOTHING IS SAID ABOUT UNCERTAINTY WHEN THERE IS NONE. "Uncertainty not requested" told a
    // reader nothing about the answer and everything about the query we happened to run.
    expect(within(fold).queryByTestId("detail-uncertainty")).toBeNull();
    expect(fold.textContent).not.toContain("not requested");
    // and the follow-up that asks for it is a chip under the answer, not a line in the details
    await act(async () => {
      fireEvent.click(screen.getByTestId("follow-up"));
    });
    await waitFor(() => expect(fetchSpy.mock.calls.filter((c) => String(c[0]).endsWith("/ask"))).toHaveLength(2));
    const second = fetchSpy.mock.calls.filter((c) => String(c[0]).endsWith("/ask"))[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(second[1].body)).message).toBe("How certain is this?");
    for (const t of decimalsOnScreen()) expect(ALLOWED).toContain(t);
  });

  it("without a replay the row counts are named as not carried and the bars have no ticks", async () => {
    vi.stubGlobal("fetch", fetchFor(BARE, null));
    mount();
    await askQuestion("How much comes from livestock?");
    const card = screen.getByTestId("answer-card");
    // the chart is the attachment, on the surface; the row counts are in the fold
    expect(within(card).getByTestId("answer-bars").getAttribute("data-ticks")).toBe("");
    expect(within(card).getAllByTestId("bar")[0]).toHaveTextContent("Enteric fermentation 151.66");
    // the row counts are gone from the details entirely - they were a property of the stream, not
    // an answer to anything a reader asked
    const fold = openEvidence();
    expect(within(fold).queryByTestId("rows-unknown")).toBeNull();
    expect(fold.textContent).not.toContain("rows");
  });

  it("an uncertainty tool result of the turn fills the uncertainty part with its cells and the replay's interval", async () => {
    const events: [string, unknown][] = [
      ["tool_call", { id: "t1", input: { periods: ["FY2023-24"] }, k: 1, name: "query_emissions" }],
      ["tool_result", { cells: [{ display: "452.34662", display_short: "452.35", i: 0, unit: UNIT, n_rows: 1189 }], context: CONTEXT, id: "t1", k: 1, limitations_hit: [], n_values: 1, name: "query_emissions", receipt: RECEIPT, request_type: "query_emissions", uncertainty: null }],
      ["tool_call", { id: "t2", input: { scope: "national" }, k: 2, name: "get_uncertainty" }],
      ["tool_result", { cells: [{ display: "456.914", display_short: "456.91", i: 0, unit: UNIT, attrs: { kind: "parametric_reference", scenario: "cross_sector", scenario_label: "factors shared across modules" }, n_rows: 0 }], context: CONTEXT, id: "t2", k: 2, limitations_hit: [], n_values: 1, name: "get_uncertainty", receipt: RECEIPT_U, request_type: "get_uncertainty", uncertainty: null }],
      ["answer", { citations: [], elapsed_s: 2.1, receipts: [RECEIPT, RECEIPT_U], scope: { ...CONTEXT, k: 1, name: "query_emissions", receipt: RECEIPT, request_type: "query_emissions" }, text: `The total is <cite k="1" cell="0" receipt="${RECEIPT}">452.34662</cite>; the median of the draws is <cite k="2" cell="0" receipt="${RECEIPT_U}">456.914</cite>.` }],
      ["done", { conversation_id: CID, cost_estimate_usd: null, usage: { input_tokens: 1, output_tokens: 1 } }],
    ];
    const replayU = envelope([{ display: "456.914", display_short: "456.91", extra: { interval_short: "407.28–533.73", scenario_label: "factors shared across modules" } }], { receipt: RECEIPT_U, request_type: "get_uncertainty" });
    const replayT = envelope([{ display: "452.34662", display_short: "452.35", extra: { result_row_ids: ["r"] } }], { receipt: RECEIPT });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/ask")) return sseResponse(sseText(events));
        const env = String(url).includes(RECEIPT_U) ? replayU : replayT;
        return { ok: true, status: 200, statusText: "OK", json: async () => env } as unknown as Response;
      }),
    );
    mount();
    await askQuestion("How certain is the total?");
    const card = screen.getByTestId("answer-card");
    expect(card.getAttribute("data-principal-k")).toBe("1");
    // A LONE FIGURE GETS NO ATTACHMENT. The principal result is one cell, and the number is already
    // in the sentence as a cite - rendering it again at 30 px under the prose was the figure twice.
    expect(within(card).queryByTestId("answer-attachment")).toBeNull();
    expect(within(card).getAllByTestId("cite").map((c) => c.textContent)).toEqual(["452.34662", "456.914"]);
    const unc = within(openEvidence()).getByTestId("detail-uncertainty");
    expect(within(unc).getByTestId("uncertainty-cells")).toHaveTextContent("factors shared across modules");
    expect(within(unc).getByTestId("uncertainty-cells")).toHaveTextContent("456.91");
    await waitFor(() => expect(within(unc).getByTestId("uncertainty-cells")).toHaveTextContent("407.28–533.73"));
    for (const t of decimalsOnScreen()) expect(["452.34662", "452.35", "456.914", "456.91", "407.28", "533.73", "2.1", ...RELEASE_IDENTITY_DECIMALS]).toContain(t);
  });

  it("a bounded district cell is a table with its interval badge, and a series is columns with the reference year marked", async () => {
    const events: [string, unknown][] = [
      ["tool_call", { id: "t1", input: { geography_level: "adm2", periods: ["FY2023-24"], sectors: ["power"], group_by: ["shape_id"] }, k: 1, name: "query_emissions" }],
      ["tool_result", { cells: [{ display: "[1.20, 1.29]", i: 0, unit: UNIT, group: { shape_id: "60131773B12131197496886" }, exactness: "bounded", n_rows: 2 }], context: { ...CONTEXT, geography_level: "adm2" }, id: "t1", k: 1, limitations_hit: ["adm2_co2e_bounded_power_residential"], n_values: 1, name: "query_emissions", receipt: RECEIPT, request_type: "query_emissions", uncertainty: null }],
      ["tool_call", { id: "t2", input: { query: { sectors: ["power"] }, step: "annual" }, k: 2, name: "get_timeseries" }],
      ["tool_result", { cells: [{ display: "40.123", display_short: "40.12", i: 0, unit: UNIT, group: { period_id: "FY2020-21" }, n_rows: 3 }, { display: "57.612", display_short: "57.61", i: 1, unit: UNIT, group: { period_id: "FY2023-24" }, n_rows: 3 }], context: CONTEXT, id: "t2", k: 2, limitations_hit: [], n_values: 2, name: "get_timeseries", receipt: RECEIPT_U, request_type: "get_timeseries", uncertainty: null }],
      ["answer", { citations: [], elapsed_s: 1.5, receipts: [RECEIPT, RECEIPT_U], scope: { ...CONTEXT, geography_level: "adm2", k: 1, name: "query_emissions", receipt: RECEIPT, request_type: "query_emissions" }, text: `Lahore's power is <cite k="1" cell="0" receipt="${RECEIPT}">[1.20, 1.29]</cite>.` }],
      ["done", { conversation_id: CID, cost_estimate_usd: null, usage: {} }],
    ];
    vi.stubGlobal("fetch", fetchFor(events, null));
    mount();
    await askQuestion("Lahore's power?");
    const card = screen.getByTestId("answer-card");
    // a bounded interval is not something a bar can honestly draw, and it is already cited in the
    // prose - so nothing is attached, and the row lives in the details
    expect(within(card).queryByTestId("answer-attachment")).toBeNull();
    const fold = openEvidence();
    expect(within(fold).getAllByTestId("scope-row").map((r) => r.textContent)).toContain("Geography every district");
    // the qualifications read as words, not as chips of ids
    const quals = within(fold).getByTestId("detail-evidence");
    expect(quals).toHaveTextContent("bounded");
    expect(quals).toHaveTextContent("their CO2e is a bounded interval, never a midpoint");
    expect(within(fold).getByTestId("explore-permalink")).toHaveAttribute("href", "/data?level=adm2&sector=power");
    // the same turn's series as the principal: columns with the reference year
    const tl = timelineOf(events.map(([name, data]) => ({ name, data })));
    expect(chartKind(principalTool(tl.items, { k: 2 })!.result!.cells)).toBe("columns");
  });

  it("OFFERS THE MAP, IT DOES NOT TAKE IT", async () => {
    // THE ASSERTION I WOULD MOST WANT KEPT IN THIS FILE. Asked which agriculture categories are not
    // estimated, the panel used to move the reader's map and then report it as six internal chips
    // (Config / Gwp / Level / Period / Sector / "View all three views") beside a raw URL. A factual
    // question has no business rearranging the view someone is reading.
    const events: [string, unknown][] = [
      ["tool_call", { id: "t1", input: { periods: ["FY2023-24"], sectors: ["agriculture"] }, k: 1, name: "get_completeness" }],
      ["tool_result", { cells: [{ display: "NE", i: 0, unit: null, group: { category: "soc" } }], context: CONTEXT, id: "t1", k: 1,
                        limitations_hit: [], n_values: 1, name: "get_completeness", receipt: RECEIPT, request_type: "get_completeness", uncertainty: null }],
      ["answer", { citations: [], elapsed_s: 1.1, receipts: [RECEIPT], scope: null, text: "Three categories are not estimated." }],
      ["done", { conversation_id: CID, cost_estimate_usd: null, usage: {} }],
    ];
    vi.stubGlobal("fetch", fetchFor(events, null));
    const setState = vi.fn();
    // a map with NO sector applied, so undoing the move has to unset one
    mount(setState, resolveState({}, DEFAULTS));
    await askQuestion("Which parts of agriculture are not estimated?");

    // nothing moved, and nothing was reported as having moved
    expect(screen.queryByTestId("map-moved")).toBeNull();
    expect(screen.queryByTestId("map-action")).toBeNull();
    for (const call of setState.mock.calls) {
      for (const k of ["geo", "level", "sector", "gas", "period"]) expect(call[0]).not.toHaveProperty(k);
    }
    // the move is on offer, and taking it is a click
    const show = screen.getByTestId("show-on-map");
    fireEvent.click(show);
    expect(setState).toHaveBeenCalledWith(expect.objectContaining({ sector: "agriculture" }));
    expect(screen.getByTestId("map-moved")).toHaveTextContent("Map updated to");

    // UNDO NAMES EVERY KEY IT TOUCHED, and an unset one goes back as null. Returning only the keys
    // that had values could never unset anything, so the sector would stay applied and the button
    // would look broken - the same trap as restoring a saved scope.
    fireEvent.click(screen.getByTestId("map-undo"));
    const undo = setState.mock.calls.map((c) => c[0]).at(-1) as Record<string, unknown>;
    expect(undo).toHaveProperty("sector");
    expect(undo.sector).toBeNull();
    expect(screen.queryByTestId("map-moved")).toBeNull();
  });

  it("an answer without any tool result is the text alone", async () => {
    const events: [string, unknown][] = [
      ["answer", { citations: [], elapsed_s: 0.4, receipts: [], scope: null, text: "Ask about a place, a sector or a year." }],
      ["done", { conversation_id: CID, cost_estimate_usd: null, usage: {} }],
    ];
    vi.stubGlobal("fetch", fetchFor(events, null));
    mount();
    await askQuestion("hello");
    const card = screen.getByTestId("answer-card");
    // nothing under the text: the "no engine query stands behind this reply" footnote is gone
    expect(within(card).queryByTestId("answer-no-query")).toBeNull();
    expect(within(card).queryByTestId("answer-part-scope")).toBeNull();
    expect(screen.queryByTestId("how-answered")).toBeNull();
  });
});
