"use client";
/**
 * The Ask panel: the body of the AskDrawer (every page), of the /ask permalink page and of the
 * Map page's right column when `ask=1`. Header: the title, the one-line contract ("The
 * assistant interprets your question; the inventory engine supplies every number…"), the model,
 * New conversation and — in the drawer — Close. Under it the scope line the drawer inherits
 * from the URL state ("Scope: Punjab · agriculture · 2023–24 · reference estimate"). The empty
 * state lists the scope-derived suggested questions (suggestions.ts; a click sends one). The
 * turns render as ReasoningTimeline (AnswerCard each). Disabled (no key: /release.agent.enabled
 * false, or a 503 on send) shows the DisabledCard. `map_action` events are applied to the URL
 * state as they arrive; the conversation id is written to `c` and the log kept in localStorage
 * (store.ts). A `seed` is sent once per `seedKey` (the page's `?q=`, or an openAsk request)
 * with `seedScope` applied to the URL state and to the ui_state of that send; `onSeeded` is
 * then called.
 */
import { useCallback, useEffect, useRef } from "react";
import { RotateCcw, X } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { applyPatch, type ExplorerState } from "@/lib/urlState";
import { Composer } from "./Composer";
import { DisabledCard } from "./DisabledCard";
import { ReasoningTimeline } from "./ReasoningTimeline";
import { scopeLine, suggestedQuestions } from "./suggestions";
import { useAskStream } from "./useAskStream";
import type { MapActionEvent } from "./types";

export const ASK_CONTRACT = "The assistant interprets your question; the inventory engine supplies every number. It never calculates from documents or prose.";

/** The URL state the agent is told about: the scope keys, not the chrome (tab, layer, cam, raster, c). */
export function uiStateOf(s: ExplorerState): Record<string, unknown> {
  const out: Record<string, unknown> = { level: s.level, period: s.period, config: s.config, gwp: s.gwp, view: s.view };
  for (const k of ["month", "sector", "gas", "geo", "cell"] as const) if (s[k]) out[k] = s[k];
  return out;
}

export type AskDockProps = {
  seed?: string | null;
  seedScope?: Partial<ExplorerState> | null;
  /** Changes with every new request; a seed is sent once per key. */
  seedKey?: number;
  onSeeded?: () => void;
  variant?: "dock" | "drawer";
  onClose?: () => void;
};

export function AskDock({ seed = null, seedScope = null, seedKey = 0, onSeeded, variant = "dock", onClose }: AskDockProps = {}) {
  const { state, setState, release, agent, labels, dims, defaults } = useExplorer();
  const stateRef = useRef(state);
  stateRef.current = state;
  const setStateRef = useRef(setState);
  setStateRef.current = setState;
  const scopeOverride = useRef<Partial<ExplorerState> | null>(null);
  const onMapAction = useCallback((a: MapActionEvent) => {
    const patch: Partial<ExplorerState> = {};
    for (const [k, v] of Object.entries(a)) if (typeof v === "string" && v) (patch as Record<string, unknown>)[k] = v;
    if (Object.keys(patch).length) setStateRef.current(patch);
  }, []);
  const onConversationId = useCallback((id: string) => setStateRef.current({ c: id }, { history: "replace" }), []);
  const uiState = useCallback(() => {
    const s = scopeOverride.current ? applyPatch(stateRef.current, scopeOverride.current) : stateRef.current;
    scopeOverride.current = null;
    return uiStateOf(s);
  }, []);
  const ask = useAskStream({ conversationId: state.c, uiState, onMapAction, onConversationId });
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ask.turns]);

  const fns = (release.query_contract.functions as string[] | undefined) ?? [];
  const rule = (release.query_contract.placeholder_rule as string | undefined) ?? "";
  const disabled = ask.disabled ? ask.disabled.reason : !agent.enabled ? agent.reason : null;
  // the seeded question: sent once per seedKey, on the first render that can send it
  const sentKey = useRef<number | null>(null);
  const sendRef = useRef(ask.send);
  sendRef.current = ask.send;
  useEffect(() => {
    const text = seed?.trim();
    if (!text || sentKey.current === seedKey || disabled !== null || ask.streaming) return;
    sentKey.current = seedKey;
    if (seedScope && Object.keys(seedScope).length) {
      scopeOverride.current = seedScope;
      setStateRef.current(seedScope);
    }
    sendRef.current(text);
    onSeeded?.();
  }, [seed, seedScope, seedKey, disabled, ask.streaming, onSeeded]);
  const reset = () => {
    ask.reset();
    setState({ c: null }, { history: "replace" });
  };
  const scope = scopeLine(labels, dims, state, defaults);
  const suggestions = suggestedQuestions(labels, dims, state);
  const empty = ask.turns.length === 0 && disabled === null;
  return (
    <div className="flex h-full flex-col bg-card" data-testid="ask-dock" data-variant={variant}>
      <div className="border-b border-line px-4 pb-3 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-fg">Ask about this view</div>
            <div className="mono text-micro normal-case tracking-normal text-muted">
              {agent.enabled ? agent.model : "disabled"}
              {ask.conversationId ? ` · ${ask.conversationId.slice(0, 8)}` : ""}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={reset} className="pill flex items-center gap-1 border border-line px-2 py-1 text-xs text-muted hover:bg-surface-3 hover:text-fg" title="Start a new conversation" data-testid="new-conversation">
              <RotateCcw size={12} /> New conversation
            </button>
            {onClose && (
              <button type="button" onClick={onClose} aria-label="Close the assistant" className="pill p-1.5 text-muted hover:bg-surface-3 hover:text-fg" data-testid="ask-close">
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs leading-snug text-muted" data-testid="ask-contract">{ASK_CONTRACT}</p>
        <p className="mt-2 text-xs text-fg" data-testid="ask-scope" title="The current URL scope, sent with every question">
          <span className="text-muted">Scope:</span> {scope}
        </p>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {disabled !== null ? (
          <DisabledCard reason={disabled} model={agent.model} functions={fns} rule={rule} />
        ) : empty ? (
          <div className="px-4 py-4" data-testid="ask-empty">
            <div className="micro mb-2">Suggested for this scope</div>
            <ul className="flex flex-col gap-1.5">
              {suggestions.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => ask.send(s)} className="w-full rounded-card border border-line bg-surface px-3 py-2 text-left text-sm text-fg hover:border-accent hover:text-accent" data-testid="suggestion">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">Every answer shows the query it came from, the rows summed, the limitations hit and a link to reproduce it. A scope the release cannot answer is refused by name.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-3 py-3">
            {ask.turns.map((t) => (
              <ReasoningTimeline key={t.id} turn={t} onFollowUp={ask.send} />
            ))}
          </div>
        )}
      </div>
      <Composer onSend={ask.send} onStop={reset} streaming={ask.streaming} disabled={disabled !== null} />
    </div>
  );
}
