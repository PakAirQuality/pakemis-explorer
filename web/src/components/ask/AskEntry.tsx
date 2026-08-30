"use client";
/** The accent "Ask PakEmis" pill in the map's top-right chrome, toggling `ask=1` (the Map page's dock). It prints no number. */
import { Sparkles } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";

export function AskPill() {
  const { state, setState } = useExplorer();
  return (
    <button
      type="button"
      onClick={() => setState({ ask: !state.ask })}
      aria-pressed={state.ask}
      title={state.ask ? "Close Ask PakEmis" : "Ask PakEmis: a question to the inventory, answered from receipts"}
      className={`pill flex h-9 items-center gap-1.5 px-3.5 text-sm font-semibold shadow-pill transition-colors ${state.ask ? "bg-fg text-surface" : "bg-accent-fill text-on-accent hover:bg-accent/90"}`}
      data-testid="ask-pill"
    >
      <Sparkles size={15} />
      <span>Ask PakEmis</span>
    </button>
  );
}
