/**
 * Map picks for the composer: while the dock is open, a click on a map feature is also an
 * `@<name>` mention. ExplorerMap emits; the Composer subscribes. No state is kept here.
 */
import type { Level } from "@/lib/urlState";

export type MapPick = { level: Level; id: string; props: Record<string, unknown> };

const listeners = new Set<(p: MapPick) => void>();

export function emitMapPick(pick: MapPick) {
  for (const cb of listeners) cb(pick);
}

export function subscribeMapPick(cb: (p: MapPick) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
