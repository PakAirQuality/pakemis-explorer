"use client";
/**
 * WHERE THE ASSISTANT IS THE PAGE'S RIGHT COLUMN RATHER THAN A SLIDE-OVER.
 *
 * On the workspace at `/` the assistant is docked: always open, no close control, and the map's
 * chrome is laid out around it. Everywhere else it stays what it was — a drawer behind the round
 * "Ask about this view" button — because the other routes are full-width reading pages with no
 * side rail to dock into.
 *
 * The width threshold is the workspace's OWN threshold. Below 1280 px the workspace already shows
 * one pane at a time (the map or the deck, with a switch in the nav capsule), and a third
 * permanent 440 px column cannot share that screen; so below it nothing docks and `/` behaves
 * exactly as every other route does. That is why the query string lives here as one exported
 * constant and `Workspace` imports it: two components deciding the same thing from two copies of
 * "(min-width: 1280px)" is a drift waiting to happen.
 *
 * Three components read this and must agree: `AskDrawer` (stops translating itself, drops its X),
 * `Workspace` (lays its map buttons and filters card out clear of the panel, and tells the map
 * camera what is covered), and — indirectly — `AskFab`, which hides itself when it sees the
 * drawer's `data-open` go to "1" and so needs no knowledge of this at all. Docked, the panel is
 * simply there: there is no way to fold it away and none is wanted.
 */
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { isActive } from "@/components/shell/NavCapsule";
import { useMediaQuery } from "@/components/shell/useMediaQuery";

/** The workspace's two-pane threshold, and so the assistant's dock threshold. */
export const WIDE_QUERY = "(min-width: 1280px)";

/** The panel's DEFAULT width — docked and drawer alike, so nothing changes size when it stops
 *  sliding. The reader may drag it narrower or wider (useAskPanelWidth below). */
export const ASK_PANEL_WIDTH = 440;

/** The narrowest the reader may drag the panel: three quarters of the default. */
export const ASK_PANEL_MIN = Math.round(ASK_PANEL_WIDTH * 0.75);

/** Where the reader's chosen width is remembered, per browser. */
export const ASK_WIDTH_KEY = "pakemis.askPanelWidth.v1";

/** The gap the map's own chrome keeps from the docked panel's edge. */
export const ASK_PANEL_GAP = 20;

/** True when the assistant is the right-hand column of the page rather than a drawer over it. */
export function useAskDocked(): boolean {
  const pathname = usePathname();
  const wide = useMediaQuery(WIDE_QUERY);
  // isActive(_, "/") is an exact match on the root: /methods does not count as the workspace
  return wide && isActive(pathname, "/");
}

/**
 * ONE PIECE OF CHROME STATE THAT TWO TREES HAVE TO AGREE ON.
 *
 * The panel lives in app/layout.tsx and the workspace's map lives under `{children}`, so the
 * panel's "Change" link cannot reach the filter card the map owns by any ordinary route. It is
 * CHROME, not an answer — it changes what is on screen and never what the release says — so it
 * does not go in the URL, which is the rule Workspace.tsx states for every other panel.
 *
 * A module store in the shape of lib/askBus.ts, then, rather than a context spanning the layout:
 * no provider to thread, and a test can drive it without rendering the whole app.
 */
type FiltersListener = () => void;
const filtersListeners = new Set<FiltersListener>();

/** "Change" beside the panel's scope: ask the workspace to open its filter card. */
export function openFilters() {
  for (const l of Array.from(filtersListeners)) l();
}

export function subscribeOpenFilters(listener: FiltersListener): () => void {
  filtersListeners.add(listener);
  return () => {
    filtersListeners.delete(listener);
  };
}

/**
 * THE PANEL'S WIDTH, WHICH THE READER CAN DRAG.
 *
 * Three trees read it: AskDrawer (its own width and the drag handle), AskDock (the empty state's
 * motif is placed against it) and Workspace (the map's buttons, the filter card and the deck keep
 * clear of it, and the camera's padding keeps Pakistan centred in what is visible). A module store
 * for the same reason as the filters listener above: the panel lives in app/layout.tsx and the
 * map under `{children}`.
 *
 * Bounds: ASK_PANEL_MIN at the narrowest, half the page at the widest. The PREFERRED width is what
 * the reader chose (and what is remembered); the width used is that, clamped to the current
 * window, so shrinking the window narrows the panel and widening it again gives the choice back.
 *
 * LIVE AND SETTLED. While a drag is in progress the panel and the chrome around it follow every
 * pointer move, but re-padding the map camera on each one would make the country swim under the
 * pointer; `useAskPanelSettledWidth` holds the width the last drag ended on, for the camera alone.
 */
let preferred: number | null = null;   // null: not read from storage yet
let settled: number | null = null;
let dragging = false;
const widthListeners = new Set<() => void>();

/** The page's width as a fixed-position panel sees it: the viewport without a vertical scrollbar. */
export function viewportWidth(): number {
  if (typeof window === "undefined") return 0;
  return document.documentElement.clientWidth || window.innerWidth;
}

/** A width inside the bounds for a viewport this wide: never under the minimum, never over half. */
export function clampAskWidth(width: number, viewport: number): number {
  const max = Math.max(ASK_PANEL_MIN, Math.floor(viewport / 2));
  const w = Number.isFinite(width) ? Math.round(width) : ASK_PANEL_WIDTH;
  return Math.min(max, Math.max(ASK_PANEL_MIN, w));
}

function readStoredWidth(): number {
  try {
    const raw = window.localStorage.getItem(ASK_WIDTH_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : ASK_PANEL_WIDTH;
  } catch {
    return ASK_PANEL_WIDTH;   // storage blocked (private window, previews): the default, unremembered
  }
}

function preferredWidth(): number {
  if (preferred === null) {
    preferred = typeof window === "undefined" ? ASK_PANEL_WIDTH : readStoredWidth();
    settled = preferred;
  }
  return preferred;
}

function notifyWidth() {
  for (const l of Array.from(widthListeners)) l();
}

function persistWidth(width: number) {
  try {
    window.localStorage.setItem(ASK_WIDTH_KEY, String(width));
  } catch {
    /* storage blocked: the width still applies for this visit */
  }
}

/**
 * Set the reader's width (clamped to the current window). During a drag it moves the live width
 * only; otherwise - a key press - it settles and is remembered at once.
 */
export function setAskPanelWidth(width: number) {
  preferredWidth();
  preferred = clampAskWidth(width, viewportWidth());
  if (!dragging) {
    settled = preferred;
    persistWidth(preferred);
  }
  notifyWidth();
}

/** A drag begins or ends. Ending it settles the width and remembers it. */
export function setAskPanelDragging(on: boolean) {
  preferredWidth();
  dragging = on;
  if (!on) {
    settled = preferred;
    persistWidth(preferred!);
  }
  notifyWidth();
}

function subscribeWidth(listener: () => void): () => void {
  widthListeners.add(listener);
  window.addEventListener("resize", listener);
  return () => {
    widthListeners.delete(listener);
    window.removeEventListener("resize", listener);
  };
}

const serverWidth = () => ASK_PANEL_WIDTH;

/** The panel's width now, following a drag as it happens. */
export function useAskPanelWidth(): number {
  return useSyncExternalStore(subscribeWidth, () => clampAskWidth(preferredWidth(), viewportWidth()), serverWidth);
}

/** The width the last drag ended on (clamped to the window): what the map camera pads for. */
export function useAskPanelSettledWidth(): number {
  return useSyncExternalStore(subscribeWidth, () => {
    preferredWidth();
    return clampAskWidth(settled!, viewportWidth());
  }, serverWidth);
}

/** Tests: forget every listener, and the width (it is read from storage again on next use). */
export function resetAskChrome() {
  filtersListeners.clear();
  widthListeners.clear();
  preferred = null;
  settled = null;
  dragging = false;
}
