"use client";
/**
 * What a page does about a map that is down, in one place, because two pages do it: the workspace
 * at `/` (the deck takes the screen) and the canvas at `/data` (the chart stands in). Both hand
 * `onStatus` and `onFailure` to their ExplorerMap, key it on `attempt`, and read back what to say
 * and what to offer.
 *
 * A MAP THAT IS DOWN STAYS DOWN UNTIL IT HAS DRAWN. The `loading` a context restored before the
 * first load reports is not yet a map, so the page keeps what it put in the map's place rather
 * than flipping to an empty canvas and back; a retry's fresh instance reports nothing until it
 * loads or fails, which holds the same line.
 *
 * THE RETRY IS OFFERED ONLY WHERE IT CAN HELP, AND NEVER FOR EVER. "Try again" remounts the map
 * (a new `attempt` is a new key is a new map). It used to be offered for every failure, which for
 * a browser that cannot draw the map meant two presses spent in an instant on an answer the
 * library had already cached, and for a refused token two requests for the same refusal. Those
 * two reasons get the sentence and the way to the same figures, and no button. The rest get
 * MAP_RETRY_LIMIT attempts. A retry cannot hang either: the map reports `timeout` by itself
 * (MAP_LOAD_TIMEOUT_MS), which is a status like any other and ends "Trying again…".
 *
 * A context the browser took away (`lost`) has no reason of its own: the map was drawn and the
 * browser stopped drawing it, which is the `webgl` case in every way that matters here.
 */
import { useCallback, useState } from "react";
import type { MapFailure, MapStatus } from "./ExplorerMap";

/**
 * How many times "Try again" may remount a map that failed. Bounded on purpose: a control that
 * can be pressed for ever over a blank panel is the defect this replaces. The count lives with
 * whatever mounts the map: on the workspace that is the page, and only a reload resets it; on
 * /data it is the Map representation, and choosing Map again is a new map with a new count.
 */
export const MAP_RETRY_LIMIT = 2;

/** The failures another attempt can cure: everything but a browser that cannot draw the map and a token that is not accepted here. */
const RETRYABLE: ReadonlySet<MapFailure> = new Set<MapFailure>(["webgl", "library", "style", "timeout"]);

export function retryable(reason: MapFailure): boolean {
  return RETRYABLE.has(reason);
}

export type MapRecovery = {
  /** Whether there is a map to look at, as the map itself reports it; `loading` until it says otherwise. */
  status: MapStatus;
  /** `failed` or `lost`: nothing is on the canvas and the page must say so. */
  down: boolean;
  /** Why, for the page's choice of sentence; `webgl` for a lost context and for a map that gave no reason. */
  reason: MapFailure;
  /** The map's React key: each retry is a new one. */
  attempt: number;
  /** A retry has been asked for and the new map has not yet loaded or failed. */
  retrying: boolean;
  /** Whether the page shows the retry control: a curable failure with attempts left, or an attempt in flight. */
  offerRetry: boolean;
  retry: () => void;
  onStatus: (status: MapStatus) => void;
  onFailure: (reason: MapFailure) => void;
};

export function useMapRecovery(): MapRecovery {
  const [status, setStatus] = useState<MapStatus>("loading");
  const [failure, setFailure] = useState<MapFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const onStatus = useCallback((next: MapStatus) => {
    if (next !== "loading") setRetrying(false);
    // a reason belongs to the failure it came with: a map that has drawn has none
    if (next === "ready") setFailure(null);
    setStatus((was) => (next === "loading" && (was === "failed" || was === "lost") ? was : next));
  }, []);
  const down = status === "failed" || status === "lost";
  const reason: MapFailure = status === "failed" && failure ? failure : "webgl";
  const canRetry = down && retryable(reason) && attempt < MAP_RETRY_LIMIT;
  const retry = useCallback(() => {
    if (retrying || !canRetry) return;
    setRetrying(true);
    setAttempt(attempt + 1); // from the value this press saw: two presses in one tick are one retry
  }, [retrying, canRetry, attempt]);
  return { status, down, reason, attempt, retrying, offerRetry: down && (canRetry || retrying), retry, onStatus, onFailure: setFailure };
}
