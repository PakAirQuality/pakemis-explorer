"use client";
/**
 * The bottom-centre time rail: fiscal years from dims.dim_period (prev / next + stepped slider)
 * and a month row (Annual | Jul 23 ... Jun 24) from dims.dim_month.by_period. Years without
 * spatial products (every period but the reference year) are tagged "national only": the map
 * shows outlines and the API's refusal; the panels keep their national envelopes.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { monthTiny, periodLabel, periodShort } from "@/lib/labels";

export function TimeRail({ compact = false }: { compact?: boolean }) {
  const { state, setState, dims, labels } = useExplorer();
  const years = dims.fiscalPeriods;
  const i = Math.max(0, years.indexOf(state.period));
  const months = dims.monthsByPeriod[state.period] ?? [];
  const isRef = !!labels.periods[state.period]?.is_reference;
  const go = (k: number) => years[k] && setState({ period: years[k] });
  return (
    <div className={`glass rounded-2xl px-3 py-2 ${compact ? "w-full max-w-[520px]" : "w-full max-w-[560px]"}`} data-testid="time-rail">
      <div className="flex items-center gap-2">
        <button aria-label="Previous year" disabled={i <= 0} onClick={() => go(i - 1)} className="pill flex h-6 w-6 items-center justify-center bg-ink/5 hover:bg-ink/10 disabled:opacity-30"><ChevronLeft size={14} /></button>
        <input type="range" min={0} max={Math.max(0, years.length - 1)} step={1} value={i} onChange={(e) => go(Number(e.target.value))} className="flex-1 accent-amber" aria-label="Fiscal year" />
        <button aria-label="Next year" disabled={i >= years.length - 1} onClick={() => go(i + 1)} className="pill flex h-6 w-6 items-center justify-center bg-ink/5 hover:bg-ink/10 disabled:opacity-30"><ChevronRight size={14} /></button>
        <div className="min-w-[120px] text-right">
          <div className="text-sm font-semibold text-ink" title={periodLabel(labels, state.period)}>{periodShort(labels, state.period)}</div>
          {!isRef && <div className="text-micro normal-case tracking-normal text-warn">national only</div>}
        </div>
      </div>
      {months.length > 0 && (
        <div className="scrollbar-none mt-1.5 flex gap-1 overflow-x-auto">
          <MonthChip active={state.month === null} onClick={() => setState({ month: null })} label="Annual" />
          {months.map((m) => (
            <MonthChip key={m} active={state.month === m} onClick={() => setState({ month: m })} label={monthTiny(labels, m)} title={labels.months[m] ?? m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MonthChip({ active, onClick, label, title }: { active: boolean; onClick: () => void; label: string; title?: string }) {
  return (
    <button onClick={onClick} title={title} className={`pill shrink-0 px-2 py-0.5 text-micro normal-case tracking-normal ${active ? "bg-ink text-white" : "text-muted hover:bg-ink/5 hover:text-ink"}`}>
      {label}
    </button>
  );
}
