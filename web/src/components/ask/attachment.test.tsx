import "@testing-library/jest-dom/vitest";
/**
 * The rule that decides what a turn shows besides its prose.
 *
 * THIS IS THE ROUND'S LOAD-BEARING DECISION. The panel used to render the same apparatus under
 * every answer — a bordered card with eight sections, whatever the question was — so a one-sentence
 * reply and a nine-year series looked identical. An answer is now text plus AT MOST ONE attachment,
 * and the common case is none. If someone later "simplifies" this by always drawing the result, the
 * first assertion below is what should stop them.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderAnswer } from "./answerText";
import { attachmentOf, attachmentTitle, disclosureOf, followUps, isModelled, methodDisclosure, periodSpan, restedOn, restedOnTurn, caveatNote, UNCERTAINTY_FOLLOW_UP } from "./attachment";
import { allocationSurfaceWords } from "@/components/methods/evidenceClassText";
import { cellName } from "./answerParts";
import type { AnswerEvent, ToolResultCell, ToolResultEvent } from "./types";
import type { ToolItem } from "./answerParts";

const UNIT = "Mt CO2e AR5";
const answer = (over: Partial<AnswerEvent> = {}): AnswerEvent =>
  ({ text: "t", receipts: [], citations: [], elapsed_s: 1, ...over }) as AnswerEvent;

function tool(cells: ToolResultCell[], over: Partial<ToolResultEvent> = {}, input: Record<string, unknown> = {}): ToolItem {
  const result: ToolResultEvent = {
    k: 1, id: "t1", name: "query_emissions", receipt: "r".repeat(32), request_type: "query_emissions",
    context: { geography_level: "national", periods: ["FY2023-24"] }, n_values: cells.length,
    cells, limitations_hit: [], ...over,
  };
  return { kind: "tool", k: 1, id: "t1", name: result.name, input, result };
}

const cell = (i: number, display: string, group?: Record<string, string>): ToolResultCell =>
  ({ i, display, display_short: display, unit: UNIT, ...(group ? { group } : {}) });

describe("attachmentOf", () => {
  it("GIVES A LONE FIGURE NOTHING, because the prose already cited it", () => {
    // the regression this exists to catch: one cell used to render as a 30 px number in a bordered
    // card directly under the sentence that had just cited it — the same figure, twice
    expect(attachmentOf(tool([cell(0, "469.638")]), answer())).toBe("none");
  });

  it("charts a result grouped over time, and one grouped over categories", () => {
    const series = tool([cell(0, "401.090", { period_id: "FY2015-16" }), cell(1, "469.638", { period_id: "FY2023-24" })]);
    expect(attachmentOf(series, answer())).toBe("chart");
    const breakdown = tool([cell(0, "223.45", { sector_id: "agriculture" }), cell(1, "57.82", { sector_id: "power" })]);
    expect(attachmentOf(breakdown, answer())).toBe("chart");
  });

  it("DRAWS NOTHING IT CANNOT CHART — machine rows never print themselves", () => {
    // THE ASSERTION I WOULD MOST WANT KEPT HERE. Twice a record-shaped result was drawn as a table
    // and put backend rows in the chat: 33 completeness cells reading "NE", then a method registry
    // row with `ipcc2006_…`, `product_lognormal_…` and an unexplained 0. Both times the fix was a
    // special case and the next record type walked past it. A NEW record-shaped tool must fail
    // closed, so this asserts the general rule rather than a list of tool names.
    const ledger = tool(Array.from({ length: 33 }, (_, i) => cell(i, "NE", { category: `c${i}` })),
                        { name: "get_completeness", request_type: "get_completeness" });
    expect(attachmentOf(ledger, answer())).toBe("none");

    // ⚠ a method cell's unit is the literal string "method" - a type tag, not a measure - so a
    // "has a unit" predicate would have let this through. The display is an id, and that is the tell.
    const record = tool([{ i: 0, display: "ipcc2006_v4_ch10_eq10.19_enteric_ch4", unit: "method" }],
                        { name: "get_spatial_lineage", request_type: "get_spatial_lineage" });
    expect(attachmentOf(record, answer())).toBe("none");

    // a bounded interval is a value, but it is still not something a bar can honestly show, and the
    // prose has already cited it
    expect(attachmentOf(tool([cell(0, "[1.20, 1.29]", { shape_id: "x" })]), answer())).toBe("none");
  });

  it("discloses a method in words, and NEVER its ids", () => {
    const method = tool([{ i: 0, display: "ipcc2006_v4_ch10_eq10.19_enteric_ch4", unit: "method",
                           attrs: { tier: "T1", equation: "2006 V4 Ch10 Eq 10.19/10.20",
                                    notes: "Country-specific head counts from the agricultural census",
                                    method_id: "ipcc2006_v4_ch10_eq10.19_enteric_ch4",
                                    uncertainty_model_id: "product_lognormal_activity_x_ef" } }],
                        { name: "get_method", request_type: "get_method" });
    expect(attachmentOf(method, answer())).toBe("method");
    const d = methodDisclosure(method.result!);
    expect(d.method).toBe("Tier 1 · 2006 V4 Ch10 Eq 10.19/10.20");
    expect(d.basis).toContain("agricultural census");
    for (const s of [d.method, d.basis]) {
      expect(s).not.toContain("ipcc2006_v4");             // the machine id
      expect(s).not.toContain("product_lognormal");       // the uncertainty model id
      expect(s).not.toMatch(/\bT1\b/);                    // the bare tier code
    }
  });

  it("finds the method record even when a later call is the principal", () => {
    // answering "how is this estimated" well takes TWO calls - the method record, then get_evidence
    // to check what was actually observed - and the second is the principal. Looking only at the
    // principal skipped the disclosure on exactly the answers that had earned it.
    const method = tool([{ i: 0, display: "id", unit: "method", attrs: { tier: "T1", equation: "2006 V4 Ch10 Eq 10.19/10.20" } }],
                        { name: "get_method", request_type: "get_method" });
    const evidence = { ...tool([{ i: 0, display: "E2", unit: null }], { name: "get_evidence", request_type: "get_evidence" }), k: 2, name: "get_evidence" };
    expect(attachmentOf(evidence, answer(), [method, evidence])).toBe("method");
  });

  it("omits half the disclosure rather than filling it with an id", () => {
    const bare = tool([{ i: 0, display: "x", unit: "method", attrs: { method_id: "some_id" } }],
                      { name: "get_method", request_type: "get_method" });
    expect(methodDisclosure(bare.result!)).toEqual({ method: "", basis: "" });
    expect(attachmentOf(bare, answer())).toBe("none");    // nothing readable to say
  });

  it("shows the intervals when the intervals were the question", () => {
    const unc = tool([cell(0, "456.914")], { name: "get_uncertainty", request_type: "get_uncertainty" });
    expect(attachmentOf({ ...unc, name: "get_uncertainty" }, answer())).toBe("uncertainty");
  });

  it("shows sources for a prepared explanation, and nothing for a model turn that ran no query", () => {
    const sourced = answer({ source: "library", citations: [{ source_id: "s1", title: "A document", kind: "inventory_source" }] } as Partial<AnswerEvent>);
    expect(attachmentOf(null, sourced)).toBe("sources");
    expect(attachmentOf(null, answer({ source: "library" }))).toBe("none");   // a card citing nothing
    expect(attachmentOf(null, answer())).toBe("none");                        // a plain model reply
  });

  it("returns exactly one kind, never a list", () => {
    // the whole simplification is "text plus AN attachment"; a turn that both charts and tables its
    // result is the old stacked card coming back by another name
    const both = tool([cell(0, "1.0", { sector_id: "a" }), cell(1, "2.0", { sector_id: "b" })]);
    expect(typeof attachmentOf(both, answer())).toBe("string");
  });
});

describe("what the line says", () => {
  it("names the grain and the shape, from the result's own context", () => {
    expect(restedOn(tool([cell(0, "1.0", { period_id: "FY2023-24" })]).result!, {})).toBe("National series");
    const prov = tool([cell(0, "1.0", { sector_id: "a" })], { context: { geography_level: "adm1" } });
    expect(restedOn(prov.result!, {})).toBe("Provincial sector totals");
    expect(restedOn(tool([cell(0, "1.0")]).result!, {})).toBe("National total");
  });

  it("titles a chart by its place and what it measures, never by the model's words", () => {
    expect(attachmentTitle(tool([cell(0, "1.0")]).result!)).toBe("National greenhouse-gas emissions");
    const air = tool([{ i: 0, display: "1.0", unit: "kt NOx" }], { context: { geography_level: "adm2" } });
    expect(attachmentTitle(air.result!)).toBe("District emissions");
  });

  it("NEVER PRINTS A RAW PERIOD ID — the panel is barred from the letters F and Y together", () => {
    const short = (id: string) => id.replace("FY", "").replace("-", "–");
    const r = tool([cell(0, "1.0")], { context: { periods: ["FY2015-16", "FY2019-20", "FY2023-24"] } }).result!;
    expect(periodSpan(r, short)).toBe("2015–16 to 2023–24");
    expect(periodSpan(r, short)).not.toContain("FY");
    const one = tool([cell(0, "1.0")], { context: { periods: ["FY2023-24"] } }).result!;
    expect(periodSpan(one, short)).toBe("2023–24");
  });
});

describe("followUps", () => {
  it("offers a change question only for a series, and claims no direction while doing it", () => {
    const series = tool([cell(0, "401.090", { period_id: "FY2015-16" }), cell(1, "469.638", { period_id: "FY2023-24" })]);
    const chips = followUps(series, answer(), false);
    expect(chips).toEqual(["What drove this change?", UNCERTAINTY_FOLLOW_UP]);
    // "the increase" would be a claim the browser could only make by reading the numbers, which is
    // the one arithmetic this panel forbids itself
    for (const c of chips) expect(c).not.toMatch(/increase|decrease|rise|fall|growth/i);
  });

  it("drops the uncertainty question once the turn already carries uncertainty", () => {
    const series = tool([cell(0, "1.0", { period_id: "FY2015-16" }), cell(1, "2.0", { period_id: "FY2023-24" })]);
    expect(followUps(series, answer(), true)).toEqual(["What drove this change?"]);
  });

  it("offers nothing on a prepared explanation, which has no query to go deeper into", () => {
    expect(followUps(null, answer({ source: "library" }), false)).toEqual([]);
    expect(followUps(null, answer(), false)).toEqual([]);
  });

  it("never offers more than two", () => {
    const prov = tool([cell(0, "1.0", { period_id: "FY2015-16" }), cell(1, "2.0", { period_id: "FY2023-24" })],
                      { context: { geography_level: "adm1", geography_ids: ["Punjab"] } });
    expect(followUps(prov, answer(), false, { adm1: [{ name: "Punjab" }, { name: "Sindh" }] } as never).length).toBeLessThanOrEqual(2);
  });
});

/**
 * Found in the browser, not by a test: with the prose unboxed and carrying the answer on its own,
 * the markdown the model actually writes had nowhere to hide.
 */
describe("the prose the model actually writes", () => {
  const onCite = { hover: vi.fn(), click: vi.fn() };

  it("renders a list as a list, not as literal asterisks", () => {
    // asked for a nine-year series the model answers with "* 2016-17: …" lines; these arrived on
    // screen with their markers, joined by <br>
    const text = "Here it is:\n\n* 2016-17: 427.07 Mt\n* 2017-18: 450.74 Mt\n- 2018-19: 446.85 Mt";
    render(<div>{renderAnswer(text, onCite)}</div>);
    const list = screen.getByTestId("answer-list");
    expect(list.tagName).toBe("UL");
    expect(within_(list).length).toBe(3);
    expect(list.textContent).not.toContain("*");
    expect(list.textContent).not.toContain("- 2018");
    expect(list.textContent).toContain("2016-17: 427.07 Mt");
  });

  it("does not turn a single line that happens to start with a dash into a list", () => {
    render(<div>{renderAnswer("- just one line", onCite)}</div>);
    expect(screen.queryByTestId("answer-list")).toBeNull();
  });

  it("reads single asterisks as emphasis, so the model's asides are not printed as punctuation", () => {
    // "*(receipt fd12458b…)*" appeared verbatim, asterisks and all
    const { container } = render(<div>{renderAnswer("Totals follow. *(receipt abc123)*", onCite)}</div>);
    expect(container.querySelector("em")?.textContent).toBe("(receipt abc123)");
    expect(container.textContent).not.toContain("*");
  });

  it("still gives bold to double asterisks, which must win over single", () => {
    const { container } = render(<div>{renderAnswer("It is an **open evidence system** today.", onCite)}</div>);
    expect(container.querySelector("strong")?.textContent).toBe("open evidence system");
    expect(container.textContent).not.toContain("*");
  });
});

function within_(el: HTMLElement): HTMLLIElement[] {
  return Array.from(el.querySelectorAll("li"));
}

/**
 * The line and the sentence the INTERFACE owns. Both were the model's job until it did them badly:
 * it signed off with raw receipt hashes, and it restated the scope with every figure — twice in one
 * answer, because `lulucf_excluded` rides on every envelope.
 */
describe("what the interface says, so the model does not", () => {
  const words = {
    period: (id: string) => id.replace("FY", "").replace("-", "–"),
    gwp: () => "IPCC 2013 (AR5)",
    place: () => "national",
    lulucf: "excludes land use and forestry",
  };

  it("names EVERY query of the turn, not just the principal one", () => {
    // naming only the principal under-reported the work: a reader following the line to the sources
    // found more queries than the line had admitted to
    const cats = tool([cell(0, "151.66", { category_id: "enteric" })], {}, {});
    const sectors = { ...tool([cell(0, "223.45", { sector_id: "agriculture" })], {}, {}), k: 2 };
    expect(restedOnTurn([cats, sectors])).toBe("National categories and sector totals");
  });

  it("drops the place prefix when the queries do not share one, rather than claiming a false grain", () => {
    const nat = tool([cell(0, "1.0", { sector_id: "a" })], {}, {});
    const dist = { ...tool([cell(0, "1.0", { shape_id: "x" })], { context: { geography_level: "adm2" } }, {}), k: 2 };
    const out = restedOnTurn([nat, dist]);
    expect(out).not.toContain("National");   // "National district totals" would be a lie about one
    expect(out).toContain("and");
  });

  it("ignores the map move and anything that returned no cells", () => {
    const real = tool([cell(0, "1.0", { sector_id: "a" })], {}, {});
    const moved = { ...tool([], { name: "set_map_view" }, {}), k: 2, name: "set_map_view" };
    expect(restedOnTurn([real, moved])).toBe("National sector totals");
    expect(restedOnTurn([moved], "fallback")).toBe("fallback");
  });

  it("keeps the release's caveat, once, and no longer states the scope", () => {
    const note = caveatNote(words.lulucf);
    expect(note).toBe("The release excludes land use and forestry.");
    // the caveat appears once, which is the whole complaint: "(Note: every national total excludes
    // land use and forestry)" was arriving on every answer, sometimes twice
    expect(note.match(/land use/g)).toHaveLength(1);
    // the scope sentence is gone: the answer names its own year and place
    expect(note).not.toMatch(/These are|estimates for|warming potentials/);
  });

  it("says nothing it does not know: no caveat without the release's wording", () => {
    expect(caveatNote("")).toBe("");
  });
});

describe("template syntax never renders", () => {
  const onCite = { hover: vi.fn(), click: vi.fn() };

  it("strips a placeholder that survived, because saved transcripts still carry one", () => {
    // the server strikes these now, but `?c=` replays what is already on the device
    const { container } = render(<div>{renderAnswer("The total is 469.64 Mt {{result_2_cell_0.attrs.share_phrase}}.", onCite)}</div>);
    const text = container.textContent ?? "";
    expect(text).not.toContain("{{");
    expect(text).not.toContain("share_phrase");
    expect(text).toBe("The total is 469.64 Mt.");     // tidied: no gap, no stranded stop
  });

  it("strips receipt hashes the model wrote into its prose, without touching the cites' own", () => {
    const R = "a".repeat(32);
    const text = `Agriculture contributed <cite k="1" cell="0" receipt="${R}">223.45</cite> Mt. Receipts: receipt ${R}.`;
    const { container } = render(<div>{renderAnswer(text, onCite)}</div>);
    expect(container.textContent).toBe("Agriculture contributed 223.45 Mt.");
    // the citation keeps its receipt - that is how a number reaches its source
    expect(container.querySelector("[data-testid=cite]")?.getAttribute("data-receipt")).toBe(R);
  });

  it("strips a parenthetical receipt aside too", () => {
    const { container } = render(<div>{renderAnswer(`The total is 469.64 Mt (receipt ${"b".repeat(32)}).`, onCite)}</div>);
    expect(container.textContent).toBe("The total is 469.64 Mt.");
  });

  it("renders ***bold-italic*** without orphaning an asterisk", () => {
    // "**" could not start at index 0 of "***x***", so it matched the inner pair and left a stray
    // asterisk each side - the ":*" that appeared at the end of the model's list items
    const { container } = render(<div>{renderAnswer("***Livestock Populations:*** the headcounts.", onCite)}</div>);
    expect(container.textContent).toBe("Livestock Populations: the headcounts.");
    expect(container.querySelector("strong em")?.textContent).toBe("Livestock Populations:");
  });

  it("strips an unbalanced asterisk rather than printing it", () => {
    const { container } = render(<div>{renderAnswer("Emission Factors:* because local data is thin.", onCite)}</div>);
    expect(container.textContent).toBe("Emission Factors: because local data is thin.");
  });

  it("leaves ordinary braces in prose alone", () => {
    const { container } = render(<div>{renderAnswer("Use { and } freely.", onCite)}</div>);
    expect(container.textContent).toBe("Use { and } freely.");
  });
});


/**
 * Saying plainly that a number is modelled — and never printing an id to do it.
 */
describe("modelled figures", () => {
  const placed = (surface: string, placement = "diffuse_by_nature") =>
    ({ i: 0, display: "27.4887", display_short: "27.49", unit: "Mt CO2e AR5", group: { province: "Punjab" },
       attrs: { spatial_class: "S3", placement_class: placement, allocation_surface: surface } }) as ToolResultCell;

  it("marks a figure placed by a proxy, and leaves a measured one alone", () => {
    // Punjab 27.49 and Sindh 8.36 were shown as provincial road-transport data; both are a national
    // fuel total spread by road density. Neither province was measured.
    expect(isModelled(placed("road_density"))).toBe(true);
    expect(isModelled(placed("builtup+population_fallback", "proxy_with_fallback"))).toBe(true);
    // a facility coordinate IS where the emission is
    expect(isModelled({ i: 0, display: "1.0", unit: "Mt", attrs: { spatial_class: "S1", placement_class: "native_geometry" } } as ToolResultCell)).toBe(false);
    expect(isModelled(undefined)).toBe(false);
    expect(isModelled({ i: 0, display: "1.0", unit: "Mt" } as ToolResultCell)).toBe(false);
  });

  it("builds the disclosure from the release's own fields, in words", () => {
    const method = { method: "Tier 1 · 2006 V2 Ch3 Eq 3.2.1", basis: "fuel sold (OCAC Road rows; OGRA metered CNG)" };
    const d = disclosureOf([placed("road_density"), placed("builtup")], method,
                           { surface: allocationSurfaceWords, plainClass: () => "", level: "adm1" });
    expect(d.estimate).toBe("Modelled provincial allocation");
    expect(d.data).toBe("fuel sold (OCAC Road rows; OGRA metered CNG)");
    expect(d.proxies).toBe("road density · built-up area");
    expect(d.method).toBe("Tier 1 · 2006 V2 Ch3 Eq 3.2.1");
    // never the raw ids, and never the source register's OCAC title - which is "OCAC_FY2016_17.pdf",
    // a filename AND the wrong fiscal year
    for (const v of Object.values(d)) {
      expect(v).not.toContain("road_density");
      expect(v).not.toContain("builtup");
      expect(v).not.toContain(".pdf");
    }
  });

  it("says nothing about allocation when the figure is not allocated", () => {
    const native = { i: 0, display: "1.0", unit: "Mt", attrs: { placement_class: "native_geometry" } } as ToolResultCell;
    const d = disclosureOf([native], null, { surface: allocationSurfaceWords, plainClass: () => "", level: "adm1" });
    expect(d.estimate).toBe("");
    expect(d.proxies).toBe("");
  });
});

describe("cellName", () => {
  it("NEVER RETURNS A MACHINE ID — the line that leaked twice", () => {
    // it used to end `|| Object.values(a).join(" · ")`, so a cell with no group was labelled with
    // every attribute it carried. That produced the enteric row, then
    // "ipcc2006_v2_ch3_eq3.2.1_road_co2 · lognormal_ef_normal_activity_uniform_split". Both times it
    // looked like a problem with the tool called; it was always this fallback.
    const labels = {} as never;
    const dims = {} as never;
    const record = { i: 0, display: "x", unit: "method",
                     attrs: { method_id: "ipcc2006_v2_ch3_eq3.2.1_road_co2", tier: "T1",
                              uncertainty_model_id: "lognormal_ef_normal_activity_uniform_split" } } as ToolResultCell;
    expect(cellName(labels, dims, record)).toBe("");
    // a readable attribute IS used
    expect(cellName(labels, dims, { i: 0, display: "x", unit: "u", attrs: { category: "Enteric fermentation" } } as ToolResultCell))
      .toBe("Enteric fermentation");
    // and an id sitting in a readable slot is still refused
    expect(cellName(labels, dims, { i: 0, display: "x", unit: "u", attrs: { category: "road_density" } } as ToolResultCell)).toBe("");
  });
});
