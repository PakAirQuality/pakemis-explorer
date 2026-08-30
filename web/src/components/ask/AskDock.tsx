"use client";
/**
 * The Ask dock (the /ask page, and the Map page's right column when `ask=1`): header (model,
 * New conversation), the turns (ReasoningTimeline each), the Composer. Disabled (no key:
 * /release.agent.enabled false, or a 503 on send) shows the DisabledCard with the API's reason
 * and the contract's functions. `map_action` events are applied to the URL state as they
 * arrive; the conversation id is written to `c`. A `seed` (the page's `?q=`) is sent once as
 * the first message, then `onSeeded` is called so the caller clears it.
 */
import { useCallback, useEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import type { ExplorerState } from "@/lib/urlState";
import { Composer } from "./Composer";
import { DisabledCard } from "./DisabledCard";
import { ReasoningTimeline } from "./ReasoningTimeline";
import { useAskStream } from "./useAskStream";
import type { MapActionEvent } from "./types";

/** The URL state the agent is told about: the scope keys, not the chrome (panel, ask, cam, raster, c). */
export function uiStateOf(s: ExplorerState): Record<string, unknown> {
  const out: Record<string, unknown> = { level: s.level, period: s.period, config: s.config, gwp: s.gwp, view: s.view };
  for (const k of ["month", "sector", "gas", "geo", "cell"] as const) if (s[k]) out[k] = s[k];
  return out;
}

export function AskDock({ seed = null, onSeeded }: { seed?: string | null; onSeeded?: () => void } = {}) {
  const { state, setState, release, agent } = useExplorer();
  const stateRef = useRef(state);
  stateRef.current = state;
  const setStateRef = useRef(setState);
  setStateRef.current = setState;
  const onMapAction = useCallback((a: MapActionEvent) => {
    const patch: Partial<ExplorerState> = {};
    for (const [k, v] of Object.entries(a)) if (typeof v === "string" && v) (patch as Record<string, unknown>)[k] = v;
    if (Object.keys(patch).length) setStateRef.current(patch);
  }, []);
  const onConversationId = useCallback((id: string) => setStateRef.current({ c: id }, { history: "replace" }), []);
  const uiState = useCallback(() => uiStateOf(stateRef.current), []);
  const ask = useAskStream({ conversationId: state.c, uiState, onMapAction, onConversationId });
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ask.turns]);

  const fns = (release.query_contract.functions as string[] | undefined) ?? [];
  const rule = (release.query_contract.placeholder_rule as string | undefined) ?? "";
  const disabled = ask.disabled ? ask.disabled.reason : !agent.enabled ? agent.reason : null;
  // the seeded question: sent once, on the first render that can send it
  const seeded = useRef(false);
  const sendRef = useRef(ask.send);
  sendRef.current = ask.send;
  useEffect(() => {
    const text = seed?.trim();
    if (!text || seeded.current || disabled !== null || ask.streaming) return;
    seeded.current = true;
    sendRef.current(text);
    onSeeded?.();
  }, [seed, disabled, ask.streaming, onSeeded]);
  const reset = () => {
    ask.reset();
    setState({ c: null }, { history: "replace" });
  };
  return (
    <div className="flex h-full flex-col" data-testid="ask-dock">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div>
          <div className="micro">Ask PakEmis</div>
          <div className="mono text-micro normal-case tracking-normal text-muted">
            {agent.enabled ? agent.model : "disabled"}
            {ask.conversationId ? ` · ${ask.conversationId.slice(0, 8)}` : ""}
          </div>
        </div>
        <button type="button" onClick={reset} className="pill flex items-center gap-1 border border-line px-2 py-1 text-xs text-muted hover:bg-surface-3 hover:text-fg" title="Start a new conversation" data-testid="new-conversation">
          <RotateCcw size={12} /> New conversation
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {disabled !== null ? (
          <DisabledCard reason={disabled} model={agent.model} functions={fns} rule={rule} />
        ) : ask.turns.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted" data-testid="ask-empty">
            <p>Ask about a place, a sector, a year or a method. The agent can only call the release&apos;s typed functions; every number it says is a placeholder the server fills from an envelope with a receipt, and a scope the release cannot answer is refused by name.</p>
            <p className="mt-2 text-xs">Tool calls, results and refusals are shown as they happen. Click a cited number to see the call it came from.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-3 py-3">
            {ask.turns.map((t) => (
              <ReasoningTimeline key={t.id} turn={t} />
            ))}
          </div>
        )}
      </div>
      <Composer onSend={ask.send} onStop={reset} streaming={ask.streaming} disabled={disabled !== null} showSuggestions={ask.turns.length === 0 && disabled === null} />
    </div>
  );
}
