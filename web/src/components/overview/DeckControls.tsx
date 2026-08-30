"use client";
/**
 * The deck controls: two white pills side by side — "Sections (n)"
 * (n is the number of widget cards, a count of components, never a data number) and the
 * collapse-all toggle ("Collapse all sections" while any card is open, "Expand all sections"
 * once every card is collapsed), which flips every widget card's switch at once.
 */
import { ChevronsDownUp, ChevronsUpDown, LayoutGrid } from "lucide-react";
import { DECK } from "./copy";

const PILL = "pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-accent shadow-md";
/** `inline`: the same controls INSIDE a card (the workspace deck's header row) — no shadow, no white ground of their own. */
const INLINE_PILL = "pointer-events-auto inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-3 px-3 text-xs font-medium text-accent";

export function DeckControls({ count, allCollapsed, onToggleAll, inline = false }: { count: number; allCollapsed: boolean; onToggleAll: () => void; inline?: boolean }) {
  const pill = inline ? INLINE_PILL : PILL;
  const size = inline ? 13 : 15;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2" data-testid="deck-controls">
      {!inline && (
        <span className={pill} data-testid="deck-sections">
          <LayoutGrid size={size} aria-hidden="true" />
          {DECK.sections(count)}
        </span>
      )}
      <button type="button" onClick={onToggleAll} className={`${pill} transition-colors hover:bg-surface-3`} aria-pressed={allCollapsed} data-testid="deck-collapse-all">
        {allCollapsed ? <ChevronsUpDown size={size} aria-hidden="true" /> : <ChevronsDownUp size={size} aria-hidden="true" />}
        {inline ? (allCollapsed ? DECK.expandAllShort : DECK.collapseAllShort) : allCollapsed ? DECK.expandAll : DECK.collapseAll}
      </button>
    </div>
  );
}
