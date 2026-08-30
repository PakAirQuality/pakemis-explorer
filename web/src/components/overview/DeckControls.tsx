"use client";
/**
 * The deck controls, the deck's second card: two white pills side by side — "Sections (n)"
 * (n is the number of widget cards, a count of components, never a data number) and the
 * collapse-all toggle ("Collapse all sections" while any card is open, "Expand all sections"
 * once every card is collapsed), which flips every widget card's switch at once.
 */
import { ChevronsDownUp, ChevronsUpDown, LayoutGrid } from "lucide-react";
import { DECK } from "./copy";

const PILL = "pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-accent shadow-md";

export function DeckControls({ count, allCollapsed, onToggleAll }: { count: number; allCollapsed: boolean; onToggleAll: () => void }) {
  return (
    <div className="flex shrink-0 flex-wrap gap-2" data-testid="deck-controls">
      <span className={PILL} data-testid="deck-sections">
        <LayoutGrid size={15} aria-hidden="true" />
        {DECK.sections(count)}
      </span>
      <button type="button" onClick={onToggleAll} className={`${PILL} transition-colors hover:bg-surface-3`} aria-pressed={allCollapsed} data-testid="deck-collapse-all">
        {allCollapsed ? <ChevronsUpDown size={15} aria-hidden="true" /> : <ChevronsDownUp size={15} aria-hidden="true" />}
        {allCollapsed ? DECK.expandAll : DECK.collapseAll}
      </button>
    </div>
  );
}
