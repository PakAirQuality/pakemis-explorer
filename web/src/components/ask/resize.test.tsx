/**
 * The assistant panel's draggable left edge: the width's bounds (three quarters of the default at
 * the narrowest, half the window at the widest), the reader's width remembered per browser, the
 * camera's settled width lagging a drag until it ends, and the handle itself - shown only while the
 * panel is, absent where the panel is full screen, and driven by pointer or arrow keys.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { ExplorerContext, type ExplorerContextValue } from "@/components/ExplorerContext";
import { AskFab } from "@/components/shell/AskFab";
import { NavCapsule } from "@/components/shell/NavCapsule";
import { resetAskBus } from "@/lib/askBus";
import { releaseDims, releaseLabels } from "@/lib/release";
import { resolveState } from "@/lib/urlState";
import type { ReleaseInfo } from "@/lib/envelope";
import { RELEASE, stubViewport } from "@/__tests__/fixtures";
import { chromePadding } from "@/components/workspace/Workspace";
import { AskDrawer, RESIZE_STEP_PX } from "./AskDrawer";
import {
  ASK_PANEL_MIN, ASK_PANEL_WIDTH, ASK_WIDTH_KEY, clampAskWidth, resetAskChrome, setAskPanelDragging,
  setAskPanelWidth, useAskPanelSettledWidth, useAskPanelWidth,
} from "./docked";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const DEFAULTS = { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" };
const release = RELEASE as unknown as ReleaseInfo;

function ctx(isMobile = false): ExplorerContextValue {
  return {
    state: resolveState({}, DEFAULTS), setState: vi.fn(), release, labels: releaseLabels(release), dims: releaseDims(release),
    defaults: DEFAULTS, contract: undefined, agent: { enabled: true, model: "gemini-test", reason: "", library: "lib", usable: true }, isMobile,
  };
}

function mount(isMobile = false) {
  return render(
    <Providers>
      <ExplorerContext.Provider value={ctx(isMobile)}>
        <NavCapsule />
        <AskFab />
        <AskDrawer />
      </ExplorerContext.Provider>
    </Providers>,
  );
}

/** The window's width as the panel measures it (jsdom reports no clientWidth, so innerWidth). */
function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}

const drawerWidth = () => screen.getByTestId("ask-drawer").style.width;

beforeEach(() => {
  resetAskBus();
  resetAskChrome();
  window.localStorage.clear();
  pathname.value = "/";
  setWindowWidth(1600);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the panel's width bounds", () => {
  it("are three quarters of the default at the narrowest and half the window at the widest", () => {
    expect(ASK_PANEL_MIN).toBe(330);
    expect(clampAskWidth(100, 1600)).toBe(330);
    expect(clampAskWidth(440, 1600)).toBe(440);
    expect(clampAskWidth(5000, 1600)).toBe(800);
    expect(clampAskWidth(5000, 1280)).toBe(640);
    expect(clampAskWidth(500.4, 1600)).toBe(500);
    // a value that is not a number falls back to the default rather than to a bound
    expect(clampAskWidth(Number.NaN, 1600)).toBe(ASK_PANEL_WIDTH);
    // a window too narrow for both bounds keeps the minimum: the panel is full screen there anyway
    expect(clampAskWidth(500, 600)).toBe(330);
  });
});

describe("the remembered width", () => {
  function Probe() {
    return <span data-testid="probe" data-live={useAskPanelWidth()} data-settled={useAskPanelSettledWidth()} />;
  }
  const probe = () => screen.getByTestId("probe");

  it("starts at the default and is remembered once set", () => {
    render(<Probe />);
    expect(probe().dataset.live).toBe(String(ASK_PANEL_WIDTH));
    act(() => setAskPanelWidth(600));
    expect(probe().dataset.live).toBe("600");
    expect(probe().dataset.settled).toBe("600");
    expect(window.localStorage.getItem(ASK_WIDTH_KEY)).toBe("600");
  });

  it("reads the remembered width back, and ignores a stored value that is not a width", () => {
    window.localStorage.setItem(ASK_WIDTH_KEY, "520");
    const view = render(<Probe />);
    expect(probe().dataset.live).toBe("520");
    view.unmount();
    resetAskChrome();
    window.localStorage.setItem(ASK_WIDTH_KEY, "wide");
    render(<Probe />);
    expect(probe().dataset.live).toBe(String(ASK_PANEL_WIDTH));
  });

  it("follows a narrower window and gives the reader's width back when it widens again", () => {
    window.localStorage.setItem(ASK_WIDTH_KEY, "700");
    render(<Probe />);
    expect(probe().dataset.live).toBe("700");
    act(() => { setWindowWidth(1000); window.dispatchEvent(new Event("resize")); });
    expect(probe().dataset.live).toBe("500");
    act(() => { setWindowWidth(1600); window.dispatchEvent(new Event("resize")); });
    expect(probe().dataset.live).toBe("700");
  });

  it("holds the settled width through a drag, and settles and remembers it when the drag ends", () => {
    render(<Probe />);
    act(() => setAskPanelDragging(true));
    act(() => setAskPanelWidth(560));
    act(() => setAskPanelWidth(620));
    expect(probe().dataset.live).toBe("620");
    expect(probe().dataset.settled).toBe(String(ASK_PANEL_WIDTH));    // the camera has not moved yet
    expect(window.localStorage.getItem(ASK_WIDTH_KEY)).toBeNull();     // nor is a half-made choice saved
    act(() => setAskPanelDragging(false));
    expect(probe().dataset.settled).toBe("620");
    expect(window.localStorage.getItem(ASK_WIDTH_KEY)).toBe("620");
  });
});

describe("the drag handle", () => {
  it("is on the docked panel, and drags its left edge: left widens, right narrows, within the bounds", () => {
    stubViewport(1600);   // docked: the workspace at 1280 px and over
    mount();
    expect(drawerWidth()).toBe(`${ASK_PANEL_WIDTH}px`);
    const handle = screen.getByTestId("ask-resize");
    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.getAttribute("aria-valuemin")).toBe("330");
    expect(handle.getAttribute("aria-valuemax")).toBe("800");
    // grabbed a little off the edge: the panel follows the distance moved, it does not jump
    fireEvent.pointerDown(handle, { button: 0, clientX: 1163, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 1063, pointerId: 1 });
    expect(drawerWidth()).toBe("540px");
    fireEvent.pointerMove(handle, { clientX: 0, pointerId: 1 });
    expect(drawerWidth()).toBe("800px");                        // half the window, no more
    fireEvent.pointerMove(handle, { clientX: 1590, pointerId: 1 });
    expect(drawerWidth()).toBe("330px");                        // three quarters of the default, no less
    fireEvent.pointerUp(handle, { clientX: 1590, pointerId: 1 });
    expect(window.localStorage.getItem(ASK_WIDTH_KEY)).toBe("330");
    // after the drag the pointer moves nothing
    fireEvent.pointerMove(handle, { clientX: 900, pointerId: 1 });
    expect(drawerWidth()).toBe("330px");
    expect(handle.getAttribute("aria-valuenow")).toBe("330");
  });

  it("moves with the arrow keys, further with Shift, and is remembered", () => {
    stubViewport(1600);
    mount();
    const handle = screen.getByTestId("ask-resize");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(drawerWidth()).toBe(`${ASK_PANEL_WIDTH + RESIZE_STEP_PX}px`);
    fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    expect(drawerWidth()).toBe(`${ASK_PANEL_WIDTH + RESIZE_STEP_PX - 3 * RESIZE_STEP_PX}px`);
    expect(window.localStorage.getItem(ASK_WIDTH_KEY)).toBe(String(ASK_PANEL_WIDTH - 2 * RESIZE_STEP_PX));
  });

  it("is not there while the drawer is closed, and appears when it opens", () => {
    pathname.value = "/methods";   // not the workspace: the panel is a drawer
    stubViewport(1600);
    mount();
    expect(screen.queryByTestId("ask-resize")).toBeNull();
    fireEvent.click(screen.getByTestId("ask-fab"));
    expect(screen.getByTestId("ask-resize")).toBeInTheDocument();
  });

  it("is not there where the panel is full screen", () => {
    pathname.value = "/methods";
    stubViewport(600);
    mount(true);
    fireEvent.click(screen.getByTestId("ask-fab"));
    expect(screen.getByTestId("ask-drawer").getAttribute("data-open")).toBe("1");
    expect(screen.queryByTestId("ask-resize")).toBeNull();
    expect(drawerWidth()).toBe("");
  });

  it("opens a returning reader's panel at the width they left it", () => {
    window.localStorage.setItem(ASK_WIDTH_KEY, "612");
    stubViewport(1600);
    mount();
    expect(drawerWidth()).toBe("612px");
  });
});

describe("the map's padding", () => {
  it("pads the docked panel's side by the panel's width", () => {
    expect(chromePadding({ deck: true, docked: true, wide: true }).right).toBe(ASK_PANEL_WIDTH + 12);
    expect(chromePadding({ deck: true, docked: true, wide: true, askWidth: 640 }).right).toBe(640 + 12);
    // not docked: the panel is a drawer over the page and the padding does not depend on it
    expect(chromePadding({ deck: true, docked: false, wide: true, askWidth: 640 }).right)
      .toBe(chromePadding({ deck: true, docked: false, wide: true }).right);
  });
});
