"use client";
/**
 * Where to talk to the agent: the accent "Ask PakEmis" pill in the map's top-right chrome (the
 * rail's Ask button stays) toggling `ask=1`, and a one-time hint chip under the scope chips
 * that localStorage remembers dismissing. Neither prints a number.
 */
import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";

export const ASK_HINT_KEY = "pakemis.askHint.dismissed";

export function AskPill() {
  const { state, setState } = useExplorer();
  return (
    <button
      type="button"
      onClick={() => setState({ ask: !state.ask })}
      aria-pressed={state.ask}
      title={state.ask ? "Close Ask PakEmis" : "Ask PakEmis: a question to the inventory, answered from receipts"}
      className={`pill flex h-9 items-center gap-1.5 px-3.5 text-sm font-semibold shadow-pill transition-colors ${state.ask ? "bg-ink text-white" : "bg-accent text-white hover:bg-accent/90"}`}
      data-testid="ask-pill"
    >
      <Sparkles size={15} />
      <span>Ask PakEmis</span>
    </button>
  );
}

function readDismissed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(ASK_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function AskHint() {
  const { state, setState } = useExplorer();
  const [dismissed, setDismissed] = useState(true); // hidden until the client has read localStorage
  useEffect(() => setDismissed(readDismissed()), []);
  const dismiss = () => {
    try {
      window.localStorage.setItem(ASK_HINT_KEY, "1");
    } catch {
      /* private mode: the hint simply returns next time */
    }
    setDismissed(true);
  };
  if (dismissed || state.ask) return null;
  return (
    <div className="glass pill mt-1.5 inline-flex items-center gap-1 py-1 pl-3 pr-1 text-xs text-ink" data-testid="ask-hint">
      <button
        type="button"
        onClick={() => {
          dismiss();
          setState({ ask: true });
        }}
        className="flex items-center gap-1 font-medium text-accent hover:underline"
      >
        <Sparkles size={13} />
        Ask the inventory a question →
      </button>
      <button type="button" onClick={dismiss} title="Dismiss" aria-label="Dismiss the hint" className="ml-1 flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-black/5 hover:text-ink">
        <X size={12} />
      </button>
    </div>
  );
}
