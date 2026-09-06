"use client";
/**
 * The Data page's scope chips card: what the canvas is currently answering for — the sector,
 * the gas and the year — as three saffron-tinted pills under a micro "RESULT · {place}" header
 * (the workspace ScopeChips' language, dispatching the Grapher's own `Action`s instead of the
 * workspace's setState). A chip whose value is not the default carries a × that clears it —
 * the sector and the gas to none, the year to the reference period. Every word is a release
 * label; a chip prints no number.
 */
import { X } from "lucide-react";
import type { Labels } from "@/lib/release";
import { gasLabel, periodShort, sectorLabel } from "@/lib/labels";
import { POLLUTANT_LABELS } from "@/lib/explore/query";
import type { Action, ExploreContext, ExploreState } from "@/lib/explore/query";
import { EXPLORE } from "./copy";

const D = EXPLORE.data;
const CHIP = "inline-flex max-w-full items-center gap-1.5 rounded-full border border-nav-line bg-nav py-1 pl-3 text-xs font-medium text-fg shadow-sm";

type Chip = { id: string; label: string; what: string; onClear: (() => void) | null };

export function ResultChips({ state, ctx, dispatch, labels, place }: { state: ExploreState; ctx: ExploreContext; dispatch: (a: Action) => void; labels: Labels; place: string }) {
  const chips: Chip[] = [
    { id: "sector", label: sectorLabel(labels, state.sector), what: D.chipSector, onClear: state.sector ? () => dispatch({ control: "sector", value: null }) : null },
    state.pollutant
      ? { id: "gas", label: `${POLLUTANT_LABELS[state.pollutant] ?? state.pollutant} (air beta)`, what: D.chipGas, onClear: () => dispatch({ control: "pollutant", value: null }) }
      : { id: "gas", label: gasLabel(labels, state.gas), what: D.chipGas, onClear: state.gas ? () => dispatch({ control: "gas", value: null }) : null },
    { id: "period", label: periodShort(labels, state.period), what: D.chipPeriod, onClear: state.period !== ctx.referencePeriod ? () => dispatch({ control: "period", value: { period: ctx.referencePeriod } }) : null },
  ];
  return (
    <section className="card p-4" data-testid="result-chips">
      <div className="micro mb-2.5">{D.result} · {place}</div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={D.chipsLabel}>
        {chips.map((c) => (
          <span key={c.id} className={`${CHIP} ${c.onClear ? "pr-1" : "pr-3"}`} data-testid={`result-chip-${c.id}`} data-default={c.onClear ? "0" : "1"}>
            <span className="truncate">{c.label}</span>
            {c.onClear && (
              <button type="button" onClick={c.onClear} aria-label={D.clear(c.what)} title={D.clear(c.what)} className="flex h-5 w-5 items-center justify-center rounded-full text-fg/70 hover:bg-accent-soft hover:text-fg" data-testid={`result-chip-${c.id}-clear`}>
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
      </div>
    </section>
  );
}
