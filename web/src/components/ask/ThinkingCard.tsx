"use client";
/** The model's summarised reasoning: collapsed to one italic line, expandable. */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function ThinkingCard({ text, live = false }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false);
  const trimmed = text.trim();
  return (
    <div className="rounded-card border border-line bg-surface px-3 py-1.5" data-testid="thinking-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-1.5 text-left">
        <span className="mt-0.5 shrink-0 text-muted">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
        <span className="micro shrink-0">Thinking{live ? "…" : ""}</span>
        {!open && <span className="min-w-0 flex-1 truncate text-xs italic text-muted">{trimmed}</span>}
      </button>
      {open && <p className="mt-1 whitespace-pre-wrap pl-4 text-xs italic text-muted">{trimmed}</p>}
    </div>
  );
}
