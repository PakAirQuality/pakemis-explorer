/**
 * The local-first layer as the panel shows it: a prepared explanation answered without a model
 * call, its sources named, and the two failure paths around it.
 *
 * Three of these guard defects rather than features, all found by opening the panel with no
 * provider key and asking it something:
 *   - the panel disabled itself on `agent.enabled`, which tracks the MODEL, so the explanation
 *     library - the part that needs no key - could not be reached from a browser at all;
 *   - one 503 deleted the user's turn and set a sticky panel-wide disabled state, and discarded
 *     the server's `message` in favour of the bare reason code;
 *   - a library answer's structured sources were invisible (this card renders only the inline
 *     <cite> tags a model writes) and every such turn printed "No engine query stands behind this",
 *     which describes a correct answer as a deficient query result.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { releaseDims, releaseLabels } from "@/lib/release";
import { resolveState, type ExplorerState } from "@/lib/urlState";
import type { ReleaseInfo } from "@/lib/envelope";
import { RELEASE } from "@/__tests__/fixtures";
import { ASK_SUGGESTIONS, ASSISTANT_NAME, ASSISTANT_TITLE, AskDock, BADGE_PX, HERO_PT, motifBox, withFigure, TILE_PX } from "./AskDock";
import { ASK_MOTIF } from "./AskMotif";
import { GLYPH_SHARE } from "@/components/shell/BrandLogo";
import { resetAskChrome } from "./docked";
import { scopeChips, scopeLine } from "./suggestions";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const CID = "c0ffee00deadbeef";
const ES = "Pakistan Economic Survey 2023-24 Agriculture chapter, Tables 2.3/2.4/2.9";
const LIBRARY: [string, unknown][] = [
  [
    "answer",
    {
      card_ids: ["agriculture-inputs"],
      // the titles of the cards it answered from: what the provenance line names (ask/local.py)
      titles: ["Agriculture inputs"],
      citations: [
        // an input document: named, not linked, with the instruction for getting a copy. Its
        // `how_to_obtain` restates the title first, which is what printed every source twice.
        { source_id: "src:activity-agriculture-es-fiscal-series", kind: "inventory_source", title: ES,
          how_to_obtain: `${ES} -- obtain from the Finance Division's survey archive`, url: null },
        // a science reference: reachable, so it is a link
        { source_id: "epa_ghg", kind: "general_science", title: "EPA · Overview of greenhouse gases",
          how_to_obtain: null, url: "https://www.epa.gov/ghgemissions/overview-greenhouse-gases" },
      ],
      elapsed_s: 0.001,
      receipts: [],
      scope: null,
      source: "library",
      text: "Agriculture rests on crop areas and yields, fertiliser offtake and the livestock census.",
    },
  ],
  ["done", { conversation_id: CID, cost_estimate_usd: 0, usage: { input_tokens: 0, output_tokens: 0 } }],
];

function sseResponse(events: [string, unknown][]): Response {
  const text = events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
  const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } });
  return { ok: true, status: 200, statusText: "OK", headers: new Headers({ "content-type": "text/event-stream" }), body } as unknown as Response;
}
function jsonResponse(status: number, payload: unknown): Response {
  return { ok: false, status, statusText: "Service Unavailable", json: async () => payload } as unknown as Response;
}

const DEFAULTS = { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" };
const base: ExplorerState = resolveState({ sector: "agriculture" }, DEFAULTS);
const release = RELEASE as unknown as ReleaseInfo;

/** `enabled` is the MODEL; `library` is the prepared-explanation layer; `usable` is either. */
function ctx(agent: Partial<ExplorerContextValue["agent"]> = {}, setState = vi.fn()): ExplorerContextValue {
  const a = { enabled: true, model: "gemini-test", reason: "", library: "b4e422a0", usable: true, ...agent };
  return { state: base, setState, release, labels: releaseLabels(release), dims: releaseDims(release),
           defaults: DEFAULTS, contract: undefined, agent: a, isMobile: false };
}
function mount(agent: Partial<ExplorerContextValue["agent"]> = {}) {
  return render(
    <Providers>
      <ExplorerContext.Provider value={ctx(agent)}><AskDock /></ExplorerContext.Provider>
    </Providers>,
  );
}
async function ask(text: string) {
  const box = screen.getByTestId("question") as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: text } });
  await act(async () => { fireEvent.keyDown(box, { key: "Enter" }); });
  await waitFor(() => expect(screen.getByTestId("turn").getAttribute("data-status")).not.toBe("streaming"));
}

beforeEach(() => window.localStorage.clear());

describe("a prepared explanation", () => {
  it("names the cards it answered from, and keeps its sources one click away", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(LIBRARY)));
    mount();
    await ask("What data drive agriculture?");

    // the provenance line names the CARDS, from the titles the server sends - not a receipt it
    // never minted, and not the apology ("no engine query stands behind this reply") that used to
    // describe a correct answer by what it lacked
    const prov = screen.getByTestId("provenance");
    expect(prov).toHaveTextContent("Agriculture inputs");
    expect(within(prov).getByTestId("provenance-action")).toHaveTextContent("View details");
    // a prepared explanation queried nothing, so there is no map state to offer
    expect(screen.queryByTestId("show-on-map")).toBeNull();
    // a prepared explanation ran no query, so there is no caveat to state
    expect(screen.queryByTestId("answer-caveat")).toBeNull();
    expect(screen.queryByTestId("answer-sources")).toBeNull();     // folded until asked for

    fireEvent.click(within(prov).getByTestId("provenance-action"));
    const sources = screen.getAllByTestId("answer-source");
    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveAttribute("data-kind", "inventory_source");
    expect(sources[0].textContent).toContain(ES);
    expect(within(sources[0]).queryByRole("link")).toBeNull();
    expect(sources[0].textContent).toContain("obtain from the Finance Division");
    // the document is named once, not once as a title and again inside `how_to_obtain`
    expect((sources[0].textContent ?? "").match(/Economic Survey/g)).toHaveLength(1);
    expect(within(sources[1]).getByRole("link")).toHaveAttribute("href", "https://www.epa.gov/ghgemissions/overview-greenhouse-gases");
  });

  it("a model turn that ran no query says nothing at all", async () => {
    // the same shape without `source: "library"` is a MODEL turn that ran no tool. It has no
    // provenance to report - no card, no receipt - so it ends after its text rather than carrying
    // a footnote about what it lacked.
    const modelTurn = LIBRARY.map(([n, d]) => n === "answer"
      ? [n, { ...(d as object), source: undefined, titles: undefined, citations: [] }] : [n, d]) as [string, unknown][];
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(modelTurn)));
    mount();
    await ask("What data drive agriculture?");

    expect(screen.getByTestId("answer-card")).toBeInTheDocument();
    expect(screen.queryByTestId("provenance")).toBeNull();
    expect(screen.queryByTestId("answer-sources")).toBeNull();
    expect(screen.queryByTestId("answer-no-query")).toBeNull();
  });
});

describe("the panel without a model key", () => {
  it("is usable, because the explanation library needs none", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(LIBRARY)));
    mount({ enabled: false, model: "", reason: "no provider key configured", usable: true });
    expect(screen.queryByTestId("disabled-card")).toBeNull();
    expect(screen.getByTestId("question")).not.toBeDisabled();
    await ask("What are emissions?");
    expect(screen.getByTestId("answer-card")).toBeInTheDocument();
  });

  it("is disabled only when there is no library either", () => {
    mount({ enabled: false, model: "", library: "", reason: "no provider key configured", usable: false });
    expect(screen.getByTestId("disabled-card")).toBeInTheDocument();
    expect(screen.getByTestId("question")).toBeDisabled();
  });

  it("a 503 keeps the turn, shows the server's message, and leaves the composer usable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(503, {
      error: "agent_disabled", reason: "no_model",
      message: "This question needs the inventory engine, which needs a model key. Explanations still work.",
    })));
    mount({ enabled: false, model: "", usable: true });
    await ask("How much did power emit in 2023-24?");

    // the turn survives - the question is still in the transcript, not deleted
    expect(screen.getByTestId("user-message")).toHaveTextContent("How much did power emit");
    const err = screen.getByTestId("error-card");
    expect(err).toHaveAttribute("data-code", "agent_disabled");
    expect(err).toHaveTextContent("Explanations still work");
    expect(err).not.toHaveTextContent("no_model");   // the reason CODE is not the user's message
    // and the panel did not go sticky-disabled on one failed question
    expect(screen.queryByTestId("disabled-card")).toBeNull();
    expect(screen.getByTestId("question")).not.toBeDisabled();
  });
});

/**
 * The empty state is an invitation, not a feature list. The five "Try these examples" rows that
 * used to sit here named capabilities - explain a chart, compare, download - which told a reader
 * what the panel COULD do and nothing about what they were looking at. They are gone; the four
 * questions are about the current view, and clicking one sends it.
 */
describe("the empty state", () => {
  it("offers four questions about this view, and a click sends one", async () => {
    const fetchMock = vi.fn(async () => sseResponse(LIBRARY));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    expect(screen.getByTestId("ask-title")).toHaveTextContent(ASSISTANT_TITLE);
    const rows = screen.getAllByTestId("suggestion");
    expect(rows).toHaveLength(ASK_SUGGESTIONS);
    // the reference draws these at 22 px in oxblood with a chevron closing the row, not the 17 px
    // muted icon and arrow they started as - measured off assistant_panel.png at 1.88x
    const icon = rows[0].querySelector("svg") as SVGElement;
    expect(icon.getAttribute("width")).toBe("22");
    expect(icon.parentElement?.className).toContain("text-accent");
    const trailing = rows[0].querySelectorAll("svg");
    expect(trailing[trailing.length - 1].getAttribute("width")).toBe("18");
    expect(trailing[trailing.length - 1].getAttribute("class")).toContain("lucide-chevron-right");

    const asked = rows[2].textContent ?? "";
    await act(async () => { fireEvent.click(rows[2]); });
    await waitFor(() => expect(screen.getByTestId("turn").getAttribute("data-status")).not.toBe("streaming"));
    const ask = (fetchMock.mock.calls as unknown as [string, RequestInit][]).find((c) => String(c[0]).endsWith("/ask"));
    expect(JSON.parse(String(ask![1].body)).message).toBe(asked);
    expect(screen.getByTestId("user-message")).toHaveTextContent(asked);
  });

  it("gives way to the transcript: the invitation and the questions go, the composer stays", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(LIBRARY)));
    mount();
    expect(screen.getByTestId("ask-empty")).toBeInTheDocument();
    await ask("What are emissions?");
    expect(screen.queryByTestId("ask-empty")).toBeNull();
    expect(screen.queryByTestId("ask-title")).toBeNull();
    expect(screen.queryAllByTestId("suggestion")).toHaveLength(0);
    expect(screen.getByTestId("composer")).toBeInTheDocument();   // one box, moved to the foot
    expect(screen.queryByTestId("ask-scope")).toBeNull();          // and no scope row beside it
  });

  it("names the scope in the same words the scope line uses", () => {
    // the chips (the restore banner and the history list still word a saved scope with them) and the
    // scope line (the transcript download) can disagree only if they drift apart, so they are one
    // function apart
    const chips = scopeChips(releaseLabels(release), releaseDims(release), base, DEFAULTS).filter((p) => p.primary).map((p) => p.label);
    expect(chips).toEqual(["Pakistan", "agriculture", "All gases", "2023–24"]);
    // the pills are the primary parts; the line is all of them, and the line must never say a
    // different word for the same thing
    const line = scopeLine(releaseLabels(release), releaseDims(release), base, DEFAULTS);
    for (const chip of chips.filter((c) => c !== "All gases")) expect(line).toContain(chip);
    const parts = scopeChips(releaseLabels(release), releaseDims(release), base, DEFAULTS);
    expect(parts.filter((p) => !p.primary).map((p) => p.id)).toEqual(["config"]);
  });
});

describe("the figure in a suggested question", () => {
  const CELL = { display: "469.63822", display_short: "469.64", unit: "Mt CO2e AR5", unit_short: "Mt CO₂e" };

  it("is the envelope's own display string, spliced into the certainty question", () => {
    const [q] = withFigure(["How certain is this estimate?"], CELL);
    expect(q).toBe("How certain is the 469.64 Mt CO₂e estimate?");
    expect(withFigure(["How certain is the agriculture estimate?"], CELL)[0])
      .toBe("How certain is the 469.64 Mt CO₂e estimate?");
  });

  it("keeps the number-free wording when there is no cell, and never invents one", () => {
    // the panel must be usable before the release has answered, and a guessed figure would be a
    // lie of exactly the kind the whole app is built to avoid
    expect(withFigure(["How certain is this estimate?"], null)).toEqual(["How certain is this estimate?"]);
    expect(withFigure(["How certain is this estimate?"], { display: null, display_short: null })).toEqual(["How certain is this estimate?"]);
    // and it touches nothing else
    expect(withFigure(["What is Pakistan's largest source?", "Download the rows used here."], CELL))
      .toEqual(["What is Pakistan's largest source?", "Download the rows used here."]);
  });
});

describe("the panel's name and mark", () => {

  it("the panel is named for what it does, not for the data set", () => {
    expect(ASSISTANT_NAME).toBe("Evidence Assistant");
    expect(ASSISTANT_NAME.toLowerCase()).not.toContain("pakemis");
  });

  it("wears the initiative's own mark, as a badge and not a clipped tile", () => {
    // It was a lucide `Waves` glyph once - a drawing of the idea of a wave, where the initiative
    // has an actual identity. Then it was the identity supplied as a finished tile, clipped to a
    // circle: the glyph filled 58% of the disc because it had been drawn to fill a SQUARE, and it
    // read cramped. The disc is ours now and the glyph sits inside it at the brand's proportion.
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(LIBRARY)));
    mount();
    const hero = screen.getByTestId("ask-empty");
    const badge = within(hero).getByTestId("brand-badge");
    expect(badge.className).toContain("rounded-full");
    expect(badge.className).toContain("bg-accent");
    const glyph = within(badge).getByTestId("brand-mark");
    expect(glyph).toHaveAttribute("src", "/brand/paqi-glyph.png");
    expect(glyph.getAttribute("alt")).toBe("");        // the name is beside it; the badge is decorative
    // the glyph is a FRACTION of the disc, not the whole of it
    expect(GLYPH_SHARE).toBeGreaterThan(0.35);
    expect(GLYPH_SHARE).toBeLessThan(0.6);
    expect(glyph.style.height).toBe(`${Math.round(BADGE_PX * GLYPH_SHARE)}px`);
    expect(badge.style.width).toBe(`${BADGE_PX}px`);
    expect(glyph.className).not.toMatch(/rounded-/);    // nothing is being clipped into shape

    // and the header wears the TILE - the brand's own artwork, flat - while the hero keeps the
    // disc. They are different objects and the header must not borrow the hero's: a 28 px disc
    // with a glyph at 52% of it is illegible, which is why the tile came back instead.
    // The panel's first child is the motif, so the header is found by what it holds, not position.
    const header = screen.getByTestId("ask-menu-toggle").closest("div.border-b") as HTMLElement;
    expect(header.textContent).toContain(ASSISTANT_NAME);
    const tile = within(header).getByTestId("brand-tile");
    expect(tile).toHaveAttribute("src", "/brand/paqi-tile.png");
    expect(tile.getAttribute("alt")).toBe("");          // the name is right beside it
    expect(tile.className).not.toMatch(/rounded-/);     // the artwork's corners are already cut
    expect(tile.style.width).toBe(`${TILE_PX}px`);
    expect(within(header).queryByTestId("brand-badge")).toBeNull();
  });

  it("carries the gold fan in the invitation's upper right, at the design's own proportions", () => {
    // It ran the full width once, crossing behind the header AND the badge - a bounding box that
    // had swallowed the panel's gold top rule. Then two rounds went on resizing it, which could
    // never work: the house motif's rise-to-spread ratio is 2.24 and the design's is 1.40, so a box
    // tall enough to space the strokes correctly makes each one climb half again too far. What is
    // pinned here is therefore what is INSIDE the fan, which is what was wrong, alongside where it
    // sits. Every number is measured off the design at 1:1.
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(LIBRARY)));
    mount();
    const empty = screen.getByTestId("ask-empty");
    const motif = within(empty).getByTestId("ask-motif");
    expect(motif).toHaveAttribute("aria-hidden", "true");   // it says nothing, so it says nothing
    expect(empty.className).toContain("relative");          // or its offsets mean nothing
    expect(within(empty).queryByTestId("contour-motif")).toBeNull();

    expect(ASK_MOTIF.strokes).toBe(7);
    expect(ASK_MOTIF.gap).toBeCloseTo(7.5, 1);
    expect(ASK_MOTIF.spread).toBeCloseTo(45, 0);
    expect(ASK_MOTIF.rise).toBeCloseTo(63, 0);
    expect(motif.querySelectorAll("path")).toHaveLength(ASK_MOTIF.strokes);
    // the viewBox IS the ink: no hidden run-up before the first stroke, which is the trap that
    // turned "move it closer" into "make it wider"
    expect(motif.getAttribute("viewBox")).toBe(`0 0 ${ASK_MOTIF.width} ${ASK_MOTIF.height}`);

    const PANEL = 440, badgeRight = PANEL / 2 + BADGE_PX / 2;
    const box = motifBox();
    expect(motif.style.width).toBe(`${box.width}px`);
    expect(motif.style.height).toBe(`${box.height}px`);
    const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThanOrEqual(2);
    near(box.width, 130);
    near(box.height, 108);
    near(box.left - badgeRight, 49);          // clear air before the first stroke
    near(HERO_PT - box.top, 47);              // the highest stroke, above the badge's top
    near(box.left + box.width, PANEL);        // and it reaches the panel's right edge
  });

  it("the rings orbit the badge in badge-radii, so one number moves both", () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(LIBRARY)));
    mount();
    const rings = screen.getByTestId("ask-rings");
    expect(rings.getAttribute("viewBox")).toBe("-2.4 -2.4 4.8 4.8");
    expect(rings.style.width).toBe(`${BADGE_PX * 2.4}px`);
  });
});

/**
 * The header's two controls. Both were chosen over a close X: the panel is part of the page, so it
 * folds rather than leaves, and the actions that used to hide behind an info fold are a menu.
 */
describe("the header's controls", () => {
  beforeEach(() => resetAskChrome());

  it("the + starts a clean conversation and the ⋮ clears, deletes or downloads it", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(LIBRARY)));
    mount();
    expect(screen.queryByTestId("ask-menu")).toBeNull();
    fireEvent.click(screen.getByTestId("ask-menu-toggle"));
    // nothing to act on before anything has been asked
    expect(screen.getByTestId("clear-conversation")).toBeDisabled();
    expect(screen.getByTestId("download-conversation")).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("ask-menu")).toBeNull();

    await ask("What are emissions?");
    // DELETING ASKS ONCE. There is no confirm dialog anywhere in this app, so the item asks in
    // place rather than inventing a modal for one button.
    fireEvent.click(screen.getByTestId("ask-menu-toggle"));
    fireEvent.click(screen.getByTestId("delete-conversation"));
    expect(screen.getByTestId("delete-conversation-confirm")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });

    // clear empties the transcript in place
    fireEvent.click(screen.getByTestId("ask-menu-toggle"));
    fireEvent.click(screen.getByTestId("clear-conversation"));
    expect(screen.getByTestId("ask-empty")).toBeInTheDocument();

    // and + is the way to a clean one
    await ask("What are emissions?");
    fireEvent.click(screen.getByTestId("new-conversation"));
    expect(screen.getByTestId("ask-empty")).toBeInTheDocument();
  });


  it("the status bar says the data is published, names the release and says nothing can be written", () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(LIBRARY)));
    mount();
    const bar = screen.getByTestId("ask-identity");
    expect(bar).toHaveTextContent("Published data");
    expect(bar).toHaveTextContent("Read only");
    // the release id is the server's identity string, never typed into this file
    expect(bar).toHaveTextContent(String(RELEASE.release_id));
    expect(bar.textContent).not.toContain("1.0.0rc99");
  });
});

/**
 * THE MODEL'S REASONING IS NO LONGER SHOWN, so there is no thinking card to test. It streamed in
 * as `**A title**` and prose and was rendered verbatim, the most prominent thing on screen under a
 * one-sentence answer; the panel shows the answer's PROVENANCE instead, and the model's private
 * working stays private. The `thinking` events are still received and still stored in the
 * transcript - only nothing renders them.
 */
describe("the model's reasoning stays private", () => {
  // a stream that carries ALL of it: summarised reasoning, a tool call, elapsed, and token usage
  const NOISY: [string, unknown][] = [
    ["thinking", { text: "**Defining the project** Zeroing in on what it is." }],
    ["tool_call", { k: 1, id: "t1", name: "query_emissions", input: { periods: ["FY2023-24"] } }],
    ["tool_result", { k: 1, id: "t1", name: "query_emissions", receipt: "a".repeat(32), request_type: "query_emissions",
                      context: { geography_level: "national", periods: ["FY2023-24"] }, n_values: 1,
                      cells: [{ i: 0, display: "469.638", display_short: "469.64", unit: "Mt CO2e AR5", n_rows: 12 }],
                      limitations_hit: [] }],
    ["answer", { text: "The national total is <cite k=\"1\" cell=\"0\" receipt=\"" + "a".repeat(32) + "\">469.64</cite> Mt.",
                 receipts: ["a".repeat(32)], citations: [], elapsed_s: 6.697, scope: null }],
    ["done", { conversation_id: CID, cost_estimate_usd: 0.0031, usage: { input_tokens: 15551, output_tokens: 518 } }],
  ];

  it("never reaches the screen, and neither do tokens, cost or latency", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(NOISY)));
    mount();
    await ask("What did Pakistan emit?");

    expect(screen.getByTestId("answer-card")).toBeInTheDocument();
    expect(screen.queryByTestId("thinking-card")).toBeNull();
    expect(screen.queryByTestId("usage-line")).toBeNull();
    expect(screen.queryByTestId("how-answered")).toBeNull();
    expect(screen.queryByTestId("tool-card")).toBeNull();
    const text = screen.getByTestId("ask-dock").textContent ?? "";
    expect(text).not.toContain("Thinking");
    expect(text).not.toContain("Zeroing in");                // the reasoning's own words
    expect(text).not.toMatch(/\bin \d+ · out \d+/);          // the token line
    expect(text).not.toMatch(/\d+\.\d+ s\b/);                // the elapsed seconds
    expect(text).not.toMatch(/\d+ quer(y|ies)\b/);            // "0 queries"
    expect(text).not.toContain("6.697");
    expect(text).not.toContain("15551");
  });
});

/**
 * The three states the panel moves between, and the rule that keeps reopening safe.
 */
describe("recent conversations", () => {
  beforeEach(() => window.localStorage.clear());

  it("replaces the transcript while it is open, and gives it back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(LIBRARY)));
    mount();
    await ask("What are emissions?");
    expect(screen.getByTestId("turn")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("ask-history-toggle"));
    // the three states are exclusive: history showing means neither the welcome nor the transcript
    expect(screen.getByTestId("ask-history")).toBeInTheDocument();
    expect(screen.queryByTestId("ask-empty")).toBeNull();
    expect(screen.queryByTestId("turn")).toBeNull();

    fireEvent.click(screen.getByTestId("history-back"));
    expect(screen.queryByTestId("ask-history")).toBeNull();
    expect(screen.getByTestId("turn")).toBeInTheDocument();
  });

  it("lists the conversation it saved, and opening it writes ONLY the conversation id", async () => {
    // THE SCOPE RULE. Reopening an old question must not rearrange the map under the reader, and it
    // holds here because nothing is written - `c` is chrome, and no scope key goes with it.
    const setState = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(LIBRARY)));
    render(
      <Providers>
        <ExplorerContext.Provider value={ctx({}, setState)}><AskDock /></ExplorerContext.Provider>
      </Providers>,
    );
    await ask("What are emissions?");
    fireEvent.click(screen.getByTestId("ask-history-toggle"));
    const row = screen.getAllByTestId("history-row")[0];
    expect(row).toHaveTextContent("What are emissions?");

    setState.mockClear();
    fireEvent.click(within(row).getByTestId("history-open"));
    expect(setState).toHaveBeenCalledTimes(1);
    const [patch] = setState.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(Object.keys(patch)).toEqual(["c"]);
    for (const k of ["level", "period", "config", "gwp", "view", "month", "sector", "gas", "geo", "cell"]) {
      expect(patch).not.toHaveProperty(k);
    }
  });

  it("names the scope it was SAVED with, and restoring clears what the saved scope did not have", async () => {
    // Found in the browser, not here: `uiStateOf` drops the optional keys when they are unset, so
    // a saved scope used as a patch could never UNSET one. A conversation asked with no sector,
    // read while a sector is selected, described itself as having that sector and could not clear
    // it. A saved scope is a whole scope.
    const setState = vi.fn();
    const withSector = { ...base, sector: "power" };
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(LIBRARY)));
    const value = { ...ctx({}, setState), state: withSector };
    render(
      <Providers>
        <ExplorerContext.Provider value={value}><AskDock /></ExplorerContext.Provider>
      </Providers>,
    );
    // the turn is captured under a scope WITHOUT a sector by asking before the sector is on state…
    await ask("What are emissions?");
    const banner = screen.queryByTestId("ask-restore");
    if (banner) {
      expect(banner.textContent).not.toContain("power");
      fireEvent.click(screen.getByTestId("ask-restore-view"));
      const [patch] = setState.mock.calls[setState.mock.calls.length - 1] as unknown as [Record<string, unknown>];
      for (const k of ["month", "sector", "gas", "geo", "cell"]) expect(patch).toHaveProperty(k);
      expect(patch.sector).toBeNull();
    }
  });

  it("the conversation carries its own line, and the composer asks for a follow-up", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(LIBRARY)));
    mount();
    expect(screen.queryByTestId("ask-conversation-line")).toBeNull();      // nothing to name yet
    expect(screen.getByTestId("question")).toHaveAttribute("placeholder", "What would you like to understand?");
    await ask("What are emissions?");
    expect(screen.getByTestId("ask-conversation-line")).toHaveTextContent("What are emissions?");
    expect(screen.getByTestId("ask-conversation-line")).toHaveTextContent("Current conversation");
    expect(screen.getByTestId("question")).toHaveAttribute("placeholder", "Ask a follow-up…");
  });
});
