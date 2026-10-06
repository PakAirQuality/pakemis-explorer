/**
 * The bootstrap store the loading screen reads (components/shell/LoadingScreen.tsx): four named
 * stages the app itself reports as they really happen — `release` (GET /release resolved),
 * `labels` (the release's dims and labels applied), `envelope` (the page's first envelope
 * answered) and `map` (the map's `load` event). A stage is marked once; marking never goes
 * backwards; a late subscriber reads the stages already reached. No React state here: the
 * provider, the pages and the map call `markStage` from wherever the event fires, and
 * `useBootstrap()` (a useSyncExternalStore over this module) is what the screen renders from.
 * Nothing in this module carries a number the user sees: the percentages are the bar's width.
 *
 * A STAGE CAN ALSO FAIL, and only the map does: a browser that cannot give it a WebGL context
 * will never fire `load`. `markFailed` records that beside the stages reached, and a failed stage
 * is one the page stops waiting for — the screen finishes at the last stage that can still
 * happen instead of sitting on a dead one until its ceiling. It is not counted as reached: the
 * bar stays where the real stages put it, and a retry that works marks the stage in the
 * ordinary way and clears the failure.
 */
import { useSyncExternalStore } from "react";

export const STAGES = ["release", "labels", "envelope", "map"] as const;
export type Stage = (typeof STAGES)[number];

/** The bar's width at each stage. */
export const STAGE_PERCENT: Record<Stage, number> = { release: 35, labels: 60, envelope: 85, map: 100 };

export type BootstrapState = { reached: ReadonlySet<Stage>; failed: ReadonlySet<Stage> };

const EMPTY: BootstrapState = { reached: new Set<Stage>(), failed: new Set<Stage>() };
let state: BootstrapState = EMPTY;
const listeners = new Set<() => void>();

/** Record that a stage has happened. Idempotent; unknown names are ignored. */
export function markStage(name: Stage) {
  if (!STAGES.includes(name) || state.reached.has(name)) return;
  const next = new Set(state.reached);
  next.add(name);
  // a stage that failed and then happened (the map, on a retry) has happened
  const failed = state.failed.has(name) ? new Set(Array.from(state.failed).filter((s) => s !== name)) : state.failed;
  state = { reached: next, failed };
  for (const l of Array.from(listeners)) l();
}

/**
 * Record that a stage will not happen. Idempotent; unknown names are ignored, and so is a stage
 * already reached — what has happened cannot fail afterwards as far as the loading screen goes.
 */
export function markFailed(name: Stage) {
  if (!STAGES.includes(name) || state.reached.has(name) || state.failed.has(name)) return;
  const next = new Set(state.failed);
  next.add(name);
  state = { reached: state.reached, failed: next };
  for (const l of Array.from(listeners)) l();
}

export function getBootstrap(): BootstrapState {
  return state;
}

export function subscribeBootstrap(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests: forget every stage and listener. */
export function resetBootstrap() {
  state = EMPTY;
  listeners.clear();
}

/** The stages reached so far, live. */
export function useBootstrap(): BootstrapState {
  return useSyncExternalStore(subscribeBootstrap, getBootstrap, () => EMPTY);
}

/**
 * The stages a page waits for before the loading screen finishes: the map's load event on the
 * pages that carry a map, the first envelope on the pages that ask for one. The workspace at
 * `/` carries both (the deck's first envelope and the full-bleed map); the Grapher at `/data`
 * asks for an envelope; the routes that moved are redirect stubs and wait for neither.
 */
export function stagesFor(pathname: string | null): readonly Stage[] {
  const p = (pathname ?? "/").replace(/\/+$/, "") || "/";
  if (p === "/") return ["release", "labels", "envelope", "map"];
  if (p === "/data") return ["release", "labels", "envelope"];
  return ["release", "labels"];
}

/** The bar's width for a page: the furthest of the page's stages reached, in the page's order. */
export function progressFor(reached: ReadonlySet<Stage>, stages: readonly Stage[]): number {
  let pct = 0;
  for (const s of stages) if (reached.has(s)) pct = Math.max(pct, STAGE_PERCENT[s]);
  return pct;
}

/**
 * Whether the page's last stage has been reached — the last one that can still happen: a failed
 * stage is dropped from what the page waits for, so a dead map hands the finish to the envelope
 * before it rather than to the ceiling.
 */
export function finishedFor(reached: ReadonlySet<Stage>, stages: readonly Stage[], failed?: ReadonlySet<Stage>): boolean {
  const live = failed?.size ? stages.filter((s) => reached.has(s) || !failed.has(s)) : stages;
  const last = live[live.length - 1];
  return !!last && reached.has(last);
}
