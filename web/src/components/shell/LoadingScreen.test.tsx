import "@testing-library/jest-dom/vitest";
/**
 * The loading screen: the logo, the title, the subtitle, the bar and a fact; the bar moves with
 * the bootstrap stages and finishes at the page's last one (or a ceiling - a short one once the
 * release has answered, a long one before); the minimum display, the fade and the unmount under
 * fake timers; once per session unless forced; every digit in a fact is a string the pinned
 * release returned, and the facts pass the audits; reduced motion paints a static canvas.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avoidPhrasesIn } from "@/__tests__/vocabulary";
import { markStage, resetBootstrap } from "./bootstrap";
import { CEILING_MS, CREEP_MS, FADE_MS, HARD_CAP_MS, LINE_MS, LoadingScreen, MIN_SHOW_MS, readLoadingQuery, SESSION_KEY } from "./LoadingScreen";
import { FACTS_RELEASE, LOADING_FACTS } from "./loadingFacts.gen";
import { reducedMotion } from "./PlumeCanvas";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

/** Which fact the screen is showing (the first is drawn at random). */
function factShown(): number {
  const text = screen.getByTestId("loading-line").textContent ?? "";
  const ix = LOADING_FACTS.findIndex((f) => f.text === text);
  expect(ix, text).toBeGreaterThanOrEqual(0);
  return ix;
}

const gradient = { addColorStop: () => undefined };
const ctx = { clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), setTransform: vi.fn(), createRadialGradient: () => gradient, fillStyle: "" as unknown };
let raf: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetBootstrap();
  pathname.value = "/";
  window.sessionStorage.clear();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  raf.mockClear();
  ctx.arc.mockClear();
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

/**
 * The fake clock drives requestAnimationFrame too, so a test that runs the clock for most of a
 * minute would also paint some three thousand frames of smoke into a recording mock - which is
 * what ran the first version of these tests out of memory. The tests about time still the smoke.
 */
function fakeClock() {
  mockMatchMedia(true);
  vi.useFakeTimers();
}

function mockMatchMedia(matches: boolean) {
  (window as { matchMedia?: unknown }).matchMedia = vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

describe("LoadingScreen", () => {
  it("renders the logo, the initiative, its one-line description, an empty bar and a fact", () => {
    render(<LoadingScreen force />);
    const screenEl = screen.getByTestId("loading-screen");
    expect(screenEl).toHaveAttribute("data-phase", "shown");
    expect(screenEl.className).toContain("fixed inset-0 z-[99999]");
    expect(screenEl.style.background).toMatch(/#f6f4f1|rgb\(246, 244, 241\)/);
    expect(screen.getByAltText("Pakistan Air Quality Initiative")).toHaveAttribute("src", "/brand/paqi-logo.png");
    expect(screen.getByTestId("loading-title")).toHaveTextContent("Pakistan Air Quality Initiative");
    expect(screen.getByTestId("loading-subtitle")).toHaveTextContent("Pakistan's greenhouse-gas emissions, reconstructed from public documents");
    expect(screen.getByTestId("loading-progress")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByTestId("loading-fill").style.width).toBe("0%");
    factShown();
    expect(screen.getByTestId("plume-canvas")).toBeInTheDocument();
    expect(raf).toHaveBeenCalled();
  });
  it("the bar follows the stages the app marks, on the home page through the map", () => {
    render(<LoadingScreen force />);
    const bar = () => screen.getByTestId("loading-screen").getAttribute("data-progress");
    act(() => markStage("release"));
    expect(bar()).toBe("35");
    act(() => markStage("labels"));
    expect(bar()).toBe("60");
    act(() => markStage("envelope"));
    expect(bar()).toBe("85");
    expect(screen.getByTestId("loading-fill").style.width).toBe("85%");
    act(() => markStage("map"));
    expect(bar()).toBe("100");
  });
  it("a page without a map or an envelope finishes at the labels: minimum display, then the fade, then unmount", () => {
    vi.useFakeTimers();
    pathname.value = "/methods/";
    render(<LoadingScreen force />);
    act(() => {
      markStage("release");
      markStage("labels");
    });
    expect(screen.getByTestId("loading-screen")).toHaveAttribute("data-phase", "shown");
    act(() => vi.advanceTimersByTime(MIN_SHOW_MS));
    expect(screen.getByTestId("loading-screen")).toHaveAttribute("data-phase", "fading");
    expect(screen.getByTestId("loading-screen").className).toContain("opacity-0");
    expect(document.body.style.overflow).toBe("hidden");
    act(() => vi.advanceTimersByTime(FADE_MS));
    expect(screen.queryByTestId("loading-screen")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
  it("on the home page the map's load is the last stage; six seconds after the release answered, the ceiling finishes the bar regardless", () => {
    vi.useFakeTimers();
    render(<LoadingScreen force />);
    act(() => {
      markStage("release");
      markStage("labels");
      markStage("envelope");
    });
    act(() => vi.advanceTimersByTime(MIN_SHOW_MS + 100));
    expect(screen.getByTestId("loading-screen")).toHaveAttribute("data-phase", "shown");
    expect(screen.getByTestId("loading-screen")).toHaveAttribute("data-progress", "85");
    act(() => vi.advanceTimersByTime(CEILING_MS));
    expect(screen.getByTestId("loading-screen")).toHaveAttribute("data-progress", "100");
    expect(screen.getByTestId("loading-screen")).toHaveAttribute("data-phase", "fading");
    act(() => vi.advanceTimersByTime(FADE_MS));
    expect(screen.queryByTestId("loading-screen")).toBeNull();
  });
  it("a cold start is waited for: before the release answers the six-second ceiling does not apply, and the bar eases toward its first stage", () => {
    fakeClock();
    render(<LoadingScreen force />);
    const el = () => screen.getByTestId("loading-screen");
    act(() => vi.advanceTimersByTime(CREEP_MS * 3));
    const early = Number(el().getAttribute("data-progress"));
    expect(early).toBeGreaterThan(0);
    // well past the short ceiling and the minimum display, with nothing answered: still here
    act(() => vi.advanceTimersByTime(CEILING_MS * 5));
    expect(el()).toHaveAttribute("data-phase", "shown");
    const late = Number(el().getAttribute("data-progress"));
    expect(late).toBeGreaterThan(early);
    expect(late).toBeLessThan(35); // toward the first stage, never to it: only the release puts it there
    act(() => markStage("release"));
    expect(el()).toHaveAttribute("data-progress", "35");
    // and from the answer the short ceiling runs
    act(() => vi.advanceTimersByTime(CEILING_MS));
    expect(el()).toHaveAttribute("data-progress", "100");
    expect(el()).toHaveAttribute("data-phase", "fading");
  });
  it("an API that never answers does not trap anyone: the hard cap lets the page through", () => {
    fakeClock();
    render(<LoadingScreen force />);
    act(() => vi.advanceTimersByTime(HARD_CAP_MS - 100));
    expect(screen.getByTestId("loading-screen")).toHaveAttribute("data-phase", "shown");
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByTestId("loading-screen")).toHaveAttribute("data-phase", "fading");
    act(() => vi.advanceTimersByTime(FADE_MS));
    expect(screen.queryByTestId("loading-screen")).toBeNull();
  });
  it("the fact advances and is re-keyed so its animation replays; a fast load shows one fact whole", () => {
    expect(LINE_MS).toBeGreaterThan(MIN_SHOW_MS);
    fakeClock();
    render(<LoadingScreen force />);
    const first = screen.getByTestId("loading-line");
    const start = factShown();
    act(() => vi.advanceTimersByTime(LINE_MS));
    const second = screen.getByTestId("loading-line");
    expect(factShown()).toBe((start + 1) % LOADING_FACTS.length);
    expect(second).not.toBe(first);
    act(() => vi.advanceTimersByTime(LINE_MS * (LOADING_FACTS.length - 1)));
    expect(factShown()).toBe(start);
  });
  it("shown once per session: the second mount renders nothing, unless forced by the query", () => {
    const { unmount } = render(<LoadingScreen />);
    expect(screen.getByTestId("loading-screen")).toBeInTheDocument();
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBe("1");
    unmount();
    render(<LoadingScreen />);
    expect(screen.queryByTestId("loading-screen")).toBeNull();
    expect(readLoadingQuery("?hidden=render&loading=1")).toEqual({ force: true, pin: null });
    expect(readLoadingQuery("?loading=1&stage=labels")).toEqual({ force: true, pin: "labels" });
    expect(readLoadingQuery("?stage=nothing")).toEqual({ force: false, pin: null });
  });
  it("a pinned stage holds the bar for a capture and never finishes", () => {
    vi.useFakeTimers();
    render(<LoadingScreen force pin="labels" />);
    act(() => {
      markStage("release");
      markStage("labels");
      markStage("envelope");
      markStage("map");
    });
    act(() => vi.advanceTimersByTime(CEILING_MS + MIN_SHOW_MS));
    expect(screen.getByTestId("loading-screen")).toHaveAttribute("data-progress", "60");
    expect(screen.getByTestId("loading-screen")).toHaveAttribute("data-phase", "shown");
  });
  it("every digit in a fact is a string the pinned release returned; the facts pass the audits", () => {
    // the file is generated (scripts/build-loading-facts.mjs): a release bump fails here until `make facts` reruns
    const pinned = /^pinned:\s*(\S+)/m.exec(readFileSync(join(__dirname, "..", "..", "..", "..", "RELEASES.md"), "utf8"))?.[1];
    expect(FACTS_RELEASE).toBe(pinned);
    expect(LOADING_FACTS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(LOADING_FACTS.map((f) => f.text)).size).toBe(LOADING_FACTS.length);
    for (const fact of LOADING_FACTS) {
      expect(fact.figures.length, fact.text).toBeGreaterThan(0);
      expect(fact.receipts.length, fact.text).toBeGreaterThan(0);
      for (const receipt of fact.receipts) expect(receipt).toMatch(/^[0-9a-f]{32}$/);
      // take each recorded server string out of the sentence, longest first; no digit may be left
      let rest: string = fact.text;
      for (const figure of [...fact.figures].sort((a, b) => b.length - a.length)) {
        expect(rest, `${figure} in: ${fact.text}`).toContain(figure);
        rest = rest.replace(figure, "");
      }
      expect(rest, fact.text).not.toMatch(/\d/);
      expect(fact.text).not.toContain("FY");
      expect(fact.text).not.toMatch(/(^|[^A-Z0-9(])AR5(?![)\w])/);
      expect(fact.text).not.toContain("LULUCF");
      expect(fact.text).not.toMatch(/\b[A-Z]{2,}_[A-Z0-9_]+\b/); // REF_2023_24 and its kind
      expect(fact.text).not.toMatch(/\b[0-9][A-Z][0-9a-z]*\b/); // 1A3b and its kind
      expect(avoidPhrasesIn(fact.text)).toEqual([]);
    }
    // on screen: the fact is the only place a digit appears
    render(<LoadingScreen force />);
    const line = screen.getByTestId("loading-line").textContent ?? "";
    expect(LOADING_FACTS.map((f) => f.text)).toContain(line);
    const text = (screen.getByTestId("loading-screen").textContent ?? "").replace(line, "");
    expect(text).not.toMatch(/\d/);
    expect(avoidPhrasesIn(text)).toEqual([]);
  });
  it("prefers-reduced-motion paints one static frame and starts no animation loop", () => {
    mockMatchMedia(true);
    expect(reducedMotion()).toBe(true);
    render(<LoadingScreen force />);
    expect(screen.getByTestId("plume-canvas")).toHaveAttribute("data-motion", "static");
    expect(raf).not.toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
  });
  it("the listeners and the frame go with the unmount", () => {
    mockMatchMedia(false);
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<LoadingScreen force />);
    expect(screen.getByTestId("plume-canvas")).toHaveAttribute("data-motion", "animated");
    const added = add.mock.calls.map((c) => c[0]);
    expect(added).toEqual(expect.arrayContaining(["resize", "pointermove"]));
    unmount();
    const removed = remove.mock.calls.map((c) => c[0]);
    expect(removed).toEqual(expect.arrayContaining(["resize", "pointermove", "pointerdown", "pointerup", "pointercancel"]));
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });
});
