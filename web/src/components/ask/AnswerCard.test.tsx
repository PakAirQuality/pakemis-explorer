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
function ctx(setState = vi.fn()): ExplorerContextValue {
  return { state: base, setState, release, labels, dims, defaults: DEFAULTS, contract: undefined, agent: { enabled: true, model: "gemini-test", reason: "" }, isMobile: false };
}
function mount() {
  return render(
    <Providers>
      <ExplorerContext.Provider value={ctx()}>
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
const ALLOWED = ["151.658", "151.66", "20.123", "20.12", "9.876", "9.88", "67.9", "9.0", "4.4", "3.5", "0.002", "22.22", "29.95", "0.0"];

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
    const rows = scopeRows(labels, dims, CONTEXT, INPUT, { basis: "fiscal", label: "July–June years" });
    expect(rows.map((r) => `${r.name}: ${r.value}`)).toEqual(["Period: 2023–24", "Geography: Pakistan (national)", "Estimate: Reference estimate", "Warming potentials: IPCC 2013 (AR5)", "Basis: July–June years", "Sectors: Agriculture", "Group by: Category", "Filled by default: basis, configuration id, gwp basis"]);
  });
});

describe("AnswerCard", () => {
  it("renders all eight parts from the stream's additions and the replayed envelope", async () => {
    vi.stubGlobal("fetch", fetchFor(FULL));
    mount();
    await askQuestion("How much comes from livestock?");
    const card = screen.getByTestId("answer-card");
    expect(card.getAttribute("data-principal-k")).toBe("1");
    // (1) the direct answer with its cite
    const answer = within(card).getByTestId("answer-part-answer");
    expect(within(answer).getAllByTestId("cite").map((c) => c.textContent)).toEqual(["151.658", UNIT]);
    // (2) the applied scope from answer.scope and the call's filters, through the labels
    const scope = within(card).getByTestId("answer-part-scope");
    const rows = within(scope).getAllByTestId("scope-row").map((r) => r.textContent);
    expect(rows).toEqual(["Period 2023–24", "Geography Pakistan (national)", "Estimate Reference estimate", "Warming potentials IPCC 2013 (AR5)", "Basis July–June years", "Sectors Agriculture", "Group by Category", "Filled by default basis, configuration id, gwp basis"]);
    // (3) the bars: names through the labels, display_short at the end with the replay's share, the replay's ticks
    const result = within(card).getByTestId("answer-part-result");
    expect(within(result).getByTestId("result-caption")).toHaveTextContent("Query emissions · Agriculture · by category · 3 cells");
    await waitFor(() => expect(within(result).getByTestId("answer-bars").getAttribute("data-ticks")).toBe("0|50|100|150|200"));
    expect(within(result).getAllByTestId("bar").map((b) => b.textContent)).toEqual(["Enteric fermentation 151.66 · 67.9 %", "Manure management 20.12 · 9.0 %", "Rice cultivation 9.88 · 4.4 %"]);
    fireEvent.click(within(result).getByTestId("result-toggle"));
    const trs = within(result).getAllByTestId("answer-row");
    expect(trs).toHaveLength(3);
    expect(trs[0]).toHaveTextContent("Enteric fermentation");
    expect(trs[0]).toHaveTextContent("151.66 Mt CO₂e");
    expect(trs[0]).toHaveTextContent("6");
    expect(trs[0].textContent).not.toContain("151.658");
    // (4) the uncertainty rows the result carried
    const unc = within(card).getByTestId("answer-part-uncertainty");
    const uncRow = within(unc).getByTestId("uncertainty-row");
    expect(uncRow).toHaveTextContent("Enteric fermentation");
    expect(uncRow).toHaveTextContent("annual · national");
    expect(uncRow).toHaveTextContent("-22.22 … 29.95 %");
    expect(uncRow.textContent).not.toContain("not-applicable"); // an unpriced half-width stays in the tooltip
    expect(uncRow.getAttribute("title")).toContain("parametric kind: probabilistic: 100,000-draw Monte Carlo, 95% interval");
    expect(uncRow.getAttribute("title")).toContain("timing status: not-applicable");
    expect(uncRow.textContent).not.toContain("151.65"); // the estimate stays in the tooltip, not beside the answer's own figures
    expect(unc).toHaveTextContent("per-category envelopes (structural, no probability)");
    // (5) the limitation humanised
    expect(within(within(card).getByTestId("answer-part-evidence")).getByTestId("limitation-chip")).toHaveTextContent("LULUCF is excluded");
    // (6) the rows per cell
    const rowsPart = within(card).getByTestId("answer-part-rows");
    expect(within(rowsPart).getByTestId("rows-line")).toHaveTextContent("Enteric fermentation 6 rows");
    expect(within(rowsPart).getByTestId("rows-line")).toHaveTextContent("Rice cultivation 1 row");
    expect(within(rowsPart).getByTestId("open-rows")).toBeTruthy();
    // (7) the receipt, expandable
    const receipt = within(card).getByTestId("answer-part-receipt");
    expect(within(receipt).queryByTestId("receipt-body")).toBeNull();
    fireEvent.click(within(receipt).getByTestId("receipt-toggle"));
    expect(within(receipt).getByTestId("receipt-id")).toHaveTextContent(RECEIPT);
    expect(within(receipt).getByText("Agriculture")).toBeTruthy();
    expect(within(receipt).getByText("IPCC 2013 (AR5)")).toBeTruthy(); // the basis worded, never the bare id
    expect(within(receipt).getByTestId("receipt-body").textContent).not.toMatch(/(^|[^(])AR5(?![)\w])/);
    fireEvent.click(within(receipt).getByTestId("open-calculation"));
    expect(await screen.findByTestId("drawer-calculation")).toBeTruthy();
    expect(screen.getByTestId("result-id")).toHaveTextContent(RECEIPT);
    fireEvent.keyDown(window, { key: "Escape" });
    // (8) permalink to /explore from the call's input, the CSV, the reproduce link
    const links = within(card).getByTestId("answer-part-links");
    expect(within(links).getByTestId("explore-permalink")).toHaveAttribute("href", "/data?sector=agriculture");
    expect(within(links).getByTestId("download-csv").getAttribute("href")).toContain(`/download/${RECEIPT}.csv`);
    expect(within(links).getByTestId("reproduce-link")).toHaveAttribute("href", `/downloads?receipt=${RECEIPT}`);
    // the reasoning is folded and opens on demand
    expect(screen.queryByTestId("tool-card")).toBeNull();
    fireEvent.click(screen.getByTestId("how-answered-toggle"));
    expect(screen.getByTestId("how-answered")).toHaveTextContent("1 query");
    expect(screen.getAllByTestId("tool-card")).toHaveLength(2); // the query and the set_map_view call; only the query counts
    expect(screen.getByTestId("map-action")).toBeTruthy();
    // every decimal on screen is a fixture display; no period id anywhere in the chrome (the model's prose is the server's)
    for (const t of decimalsOnScreen()) expect(ALLOWED).toContain(t);
    expect(screen.getByTestId("ask-dock").textContent).not.toContain("FY");
  });

  it("degrades without scope, uncertainty and n_rows: context scope, the follow-up chip sends its question, row counts from the replay", async () => {
    const fetchSpy = fetchFor(BARE);
    vi.stubGlobal("fetch", fetchSpy);
    mount();
    await askQuestion("How much comes from livestock?");
    const card = screen.getByTestId("answer-card");
    expect(within(card).getAllByTestId("scope-row").map((r) => r.textContent)[0]).toBe("Period 2023–24");
    const unc = within(card).getByTestId("answer-part-uncertainty");
    expect(within(unc).getByTestId("uncertainty-missing")).toHaveTextContent("Uncertainty not requested");
    await waitFor(() => expect(within(within(card).getByTestId("answer-part-rows")).getByTestId("rows-line")).toHaveTextContent("Enteric fermentation 6 rows"));
    await act(async () => {
      fireEvent.click(within(unc).getByTestId("uncertainty-follow-up"));
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
    expect(within(card).getByTestId("rows-unknown")).toHaveTextContent("not carried by this stream");
    expect(within(card).getByTestId("answer-bars").getAttribute("data-ticks")).toBe("");
    expect(within(card).getAllByTestId("bar")[0]).toHaveTextContent("Enteric fermentation 151.66");
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
    expect(within(card).getByTestId("result-figure")).toHaveTextContent("452.35 Mt CO₂e");
    const unc = within(card).getByTestId("answer-part-uncertainty");
    expect(within(unc).getByTestId("uncertainty-cells")).toHaveTextContent("factors shared across modules");
    expect(within(unc).getByTestId("uncertainty-cells")).toHaveTextContent("456.91");
    await waitFor(() => expect(within(unc).getByTestId("uncertainty-cells")).toHaveTextContent("407.28–533.73"));
    expect(within(card).getByTestId("rows-line")).toHaveTextContent("1189 rows");
    expect(screen.getByTestId("how-answered")).toHaveTextContent("2 queries");
    for (const t of decimalsOnScreen()) expect(["452.34662", "452.35", "456.914", "456.91", "407.28", "533.73", "2.1"]).toContain(t);
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
    const result = within(card).getByTestId("answer-part-result");
    expect(within(result).queryByTestId("answer-bars")).toBeNull();
    const row = within(result).getByTestId("answer-row");
    expect(row).toHaveTextContent("Lahore");
    expect(row).toHaveTextContent("[1.20, 1.29]");
    expect(row).toHaveTextContent("interval");
    expect(within(card).getAllByTestId("scope-row").map((r) => r.textContent)).toContain("Geography every district");
    expect(within(card).getByTestId("exactness-badge")).toHaveTextContent("bounded");
    expect(within(card).getByTestId("limitation-chip")).toHaveTextContent("their CO2e is a bounded interval, never a midpoint");
    expect(within(card).getByTestId("explore-permalink")).toHaveAttribute("href", "/data?level=adm2&sector=power");
    // the same turn's series as the principal: columns with the reference year
    const tl = timelineOf(events.map(([name, data]) => ({ name, data })));
    expect(chartKind(principalTool(tl.items, { k: 2 })!.result!.cells)).toBe("columns");
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
    expect(within(card).getByTestId("answer-no-query")).toBeTruthy();
    expect(within(card).queryByTestId("answer-part-scope")).toBeNull();
    expect(screen.queryByTestId("how-answered")).toBeNull();
  });
});
