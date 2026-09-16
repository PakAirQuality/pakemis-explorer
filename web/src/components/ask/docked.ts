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
import { usePathname } from "next/navigation";
import { isActive } from "@/components/shell/NavCapsule";
import { useMediaQuery } from "@/components/shell/useMediaQuery";

/** The workspace's two-pane threshold, and so the assistant's dock threshold. */
export const WIDE_QUERY = "(min-width: 1280px)";

/** The docked panel's width — the drawer's own, so nothing changes size when it stops sliding. */
export const ASK_PANEL_WIDTH = 440;

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

/** Tests: forget every listener. */
export function resetAskChrome() {
  filtersListeners.clear();
}
