import "@testing-library/jest-dom/vitest";
/**
 * The loading screen: the logo, the title, the subtitle, the bar and a status line; the bar
 * moves with the bootstrap stages and finishes at the page's last one (or the ceiling); the
 * minimum display, the fade and the unmount under fake timers; once per session unless forced;
 * the lines carry no digit and pass the four audits; reduced motion paints a static canvas.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avoidPhrasesIn } from "@/__tests__/vocabulary";
import { markStage, resetBootstrap } from "./bootstrap";
import { CEILING_MS, FADE_MS, LINE_MS, LoadingScreen, MIN_SHOW_MS, readLoadingQuery, SESSION_KEY } from "./LoadingScreen";
import { LOADING_LINES } from "./loadingLines";
import { reducedMotion } from "./ParticleCanvas";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

const ctx = { clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), setTransform: vi.fn(), fillStyle: "" };
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

function mockMatchMedia(matches: boolean) {
  (window as { matchMedia?: unknown }).matchMedia = vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

describe("LoadingScreen", () => {
  it("renders the logo, PakEmis, the initiative, an empty bar and the first line", () => {
    render(<LoadingScreen force />);
    const screenEl = screen.getByTestId("loading-screen");
    expect(screenEl).toHaveAttribute("data-phase", "shown");
    expect(screenEl.className).toContain("fixed inset-0 z-[99999]");
    expect(screenEl.style.background).toMatch(/#f8f9fa|rgb\(248, 249, 250\)/);
    expect(screen.getByAltText("Pakistan Air Quality Initiative")).toHaveAttribute("src", "/brand/paqi-logo.png");
    expect(screen.getByTestId("loading-title")).toHaveTextContent("PakEmis");
    expect(screen.getByTestId("loading-subtitle")).toHaveTextContent("Pakistan Air Quality Initiative");
    expect(screen.getByTestId("loading-progress")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByTestId("loading-fill").style.width).toBe("0%");
    expect(screen.getByTestId("loading-line")).toHaveTextContent(LOADING_LINES[0]);
    expect(screen.getByTestId("particle-canvas")).toBeInTheDocument();
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
    act(() => vi.advanceTimersByTime(FADE_MS));
    expect(screen.queryByTestId("loading-screen")).toBeNull();
  });
  it("on the home page the map's load is the last stage; the six-second ceiling finishes the bar regardless", () => {
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
  it("the status line advances and is re-keyed so its animation replays", () => {
    vi.useFakeTimers();
    render(<LoadingScreen force />);
    const first = screen.getByTestId("loading-line");
    act(() => vi.advanceTimersByTime(LINE_MS));
    const second = screen.getByTestId("loading-line");
    expect(second).toHaveTextContent(LOADING_LINES[1]);
    expect(second).not.toBe(first);
    act(() => vi.advanceTimersByTime(LINE_MS * (LOADING_LINES.length - 1)));
    expect(screen.getByTestId("loading-line")).toHaveTextContent(LOADING_LINES[0]);
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
  it("every line is digit-free and passes the audits: no FY, no avoid-list phrase, no raw id", () => {
    expect(LOADING_LINES.length).toBe(8);
    for (const line of LOADING_LINES) {
      expect(line, line).not.toMatch(/\d/);
      expect(line).not.toContain("FY");
      expect(line).not.toMatch(/(^|[^A-Z0-9(])AR5(?![)\w])/);
      expect(line).not.toContain("LULUCF");
      expect(line).not.toMatch(/\b[A-Z]{2,}_[A-Z0-9_]+\b/); // REF_2023_24 and its kind
      expect(line).not.toMatch(/\b[0-9][A-Z][0-9a-z]*\b/); // 1A3b and its kind
      expect(avoidPhrasesIn(line)).toEqual([]);
    }
    render(<LoadingScreen force />);
    const text = screen.getByTestId("loading-screen").textContent ?? "";
    expect(text).not.toMatch(/\d/);
    expect(avoidPhrasesIn(text)).toEqual([]);
  });
  it("prefers-reduced-motion paints one static frame and starts no animation loop", () => {
    mockMatchMedia(true);
    expect(reducedMotion()).toBe(true);
    render(<LoadingScreen force />);
    expect(screen.getByTestId("particle-canvas")).toHaveAttribute("data-motion", "static");
    expect(raf).not.toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
  });
  it("the listeners and the frame go with the unmount", () => {
    mockMatchMedia(false);
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<LoadingScreen force />);
    expect(screen.getByTestId("particle-canvas")).toHaveAttribute("data-motion", "animated");
    const added = add.mock.calls.map((c) => c[0]);
    expect(added).toEqual(expect.arrayContaining(["resize", "pointermove"]));
    unmount();
    const removed = remove.mock.calls.map((c) => c[0]);
    expect(removed).toEqual(expect.arrayContaining(["resize", "pointermove", "pointerdown", "pointerleave"]));
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });
});
