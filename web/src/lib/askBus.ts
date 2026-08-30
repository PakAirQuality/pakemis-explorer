/**
 * The Ask bus: how any page opens the "Ask about this view" drawer (mounted once in app/layout.tsx).
 * `openAsk({question?, scope?})` asks the drawer to open, apply `scope` (a partial URL state)
 * and send `question` once; `closeAsk()` and `toggleAsk()` do what they say. The drawer
 * subscribes with `subscribeAsk`; a request sent before any subscriber exists (a page that
 * calls openAsk during its first render) is kept and delivered to the first subscriber, so
 * nothing is lost while the shell bootstraps. No React here: a page, a link handler or a test
 * can call it.
 */
import type { ExplorerState } from "./urlState";

export type AskRequest = { question?: string; scope?: Partial<ExplorerState> };
export type AskBusEvent = { type: "open"; request: AskRequest } | { type: "close" } | { type: "toggle" };
type Listener = (event: AskBusEvent) => void;

const listeners = new Set<Listener>();
let pending: AskBusEvent | null = null;

function emit(event: AskBusEvent) {
  if (listeners.size === 0) {
    pending = event;
    return;
  }
  for (const l of Array.from(listeners)) l(event);
}

export function openAsk(request: AskRequest = {}) {
  emit({ type: "open", request });
}
export function closeAsk() {
  emit({ type: "close" });
}
export function toggleAsk() {
  emit({ type: "toggle" });
}

/** Subscribe; a request that arrived before any subscriber is delivered at once. Returns the unsubscribe. */
export function subscribeAsk(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) {
    const p = pending;
    pending = null;
    listener(p);
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Tests: forget every listener and any pending request. */
export function resetAskBus() {
  listeners.clear();
  pending = null;
}
