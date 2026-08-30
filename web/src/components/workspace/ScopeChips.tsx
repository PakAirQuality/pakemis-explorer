"use client";
/**
 * The deck's scope chips: what the whole workspace is currently answering for — the sector, the
 * gas and the year — as three saffron-tinted pills. A chip whose value is not the default
 * carries a × that clears it back through `setState` (the sector and the gas to none, the year
 * to the release's own default period), so the deck and the map return together. Every word is
 * a release label (`sectorLabel`, `gasLabel`, `periodShort`); a chip prints no number.
 */
import { X } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { gasLabel, periodShort, sectorLabel } from "@/lib/labels";
import { CHIPS } from "./copy";

const CHIP = "inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber/50 bg-amber/15 py-1 pl-3 text-xs font-medium text-fg";

type Chip = { id: string; label: string; what: string; onClear: (() => void) | null };

export function ScopeChips({ className = "" }: { className?: string }) {
  const { state, setState, labels, defaults } = useExplorer();
  const chips: Chip[] = [
    { id: "sector", label: sectorLabel(labels, state.sector), what: CHIPS.sector, onClear: state.sector ? () => setState({ sector: null }) : null },
    { id: "gas", label: gasLabel(labels, state.gas), what: CHIPS.gas, onClear: state.gas ? () => setState({ gas: null }) : null },
    { id: "period", label: periodShort(labels, state.period), what: CHIPS.year, onClear: state.period !== defaults.period_id ? () => setState({ period: defaults.period_id }) : null },
  ];
  return (
    <div className={`pointer-events-auto flex shrink-0 flex-wrap gap-1.5 ${className}`} role="group" aria-label={CHIPS.label} data-testid="scope-chips">
      {chips.map((c) => (
        <span key={c.id} className={`${CHIP} ${c.onClear ? "pr-1" : "pr-3"}`} data-testid={`chip-${c.id}`} data-default={c.onClear ? "0" : "1"}>
          <span className="truncate">{c.label}</span>
          {c.onClear && (
            <button type="button" onClick={c.onClear} aria-label={CHIPS.clear(c.what)} title={CHIPS.clear(c.what)} className="flex h-5 w-5 items-center justify-center rounded-full text-fg/70 hover:bg-amber/40 hover:text-fg" data-testid={`chip-${c.id}-clear`}>
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
