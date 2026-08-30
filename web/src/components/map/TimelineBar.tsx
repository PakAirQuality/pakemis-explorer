"use client";
/**
 * The timeline along the bottom of the map: the fiscal years from dims.dim_period as steps,
 * and for the reference year the month row (Annual | Jul 23 … Jun 24) from
 * dims.dim_month.by_period. Any other year is tagged "national only" and the map's typed
 * refusal for it is shown here in the API's words; the drawer keeps its national envelopes.
 */
import { refusalWords } from "@/lib/envelope";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useExplorer } from "@/components/ExplorerContext";
import { api } from "@/lib/api";
import { mapBody } from "@/lib/requests";
import { monthLabel, monthTiny, periodLabel, periodShort } from "@/lib/labels";
import { refusalOf } from "@/components/ui/RefusalCard";

export function TimelineBar({ compact = false }: { compact?: boolean }) {
  const { state, setState, dims, labels } = useExplorer();
  const years = dims.fiscalPeriods;
  const i = Math.max(0, years.indexOf(state.period));
  const months = dims.monthsByPeriod[state.period] ?? [];
  const isRef = !!labels.periods[state.period]?.is_reference;
  const body = mapBody(state);
  // the same key as the map's own query, so the refusal shown here is the one the map received
  const mapQ = useQuery({ queryKey: ["map", body], queryFn: () => api.queryEmissions(body!), enabled: !!body, retry: false });
  const refusal = refusalOf(mapQ.error);
  const go = (k: number) => years[k] && setState({ period: years[k] });
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-gray-200/50 bg-white/90 backdrop-blur shadow-md px-3 ${compact ? "py-1.5" : "py-2"}`} data-testid="time-rail">
      <div className="flex items-center gap-1.5">
        <button aria-label="Previous year" disabled={i <= 0} onClick={() => go(i - 1)} className="pill flex h-6 w-6 items-center justify-center bg-fg/5 hover:bg-fg/10 disabled:opacity-30"><ChevronLeft size={14} /></button>
        <div className="scrollbar-none flex gap-0.5 overflow-x-auto" role="tablist" aria-label="Year">
          {years.map((y) => (
            <button key={y} role="tab" aria-selected={y === state.period} onClick={() => setState({ period: y })} title={periodLabel(labels, y)} className={`pill shrink-0 px-2 py-0.5 text-xs ${y === state.period ? "bg-fg font-semibold text-card" : labels.periods[y]?.is_reference ? "text-fg hover:bg-fg/5" : "text-muted hover:bg-fg/5 hover:text-fg"}`} data-testid="year-chip">
              {periodShort(labels, y)}
            </button>
          ))}
        </div>
        <button aria-label="Next year" disabled={i >= years.length - 1} onClick={() => go(i + 1)} className="pill flex h-6 w-6 items-center justify-center bg-fg/5 hover:bg-fg/10 disabled:opacity-30"><ChevronRight size={14} /></button>
      </div>
      {isRef && months.length > 0 ? (
        <div className="scrollbar-none flex min-w-0 flex-1 gap-1 overflow-x-auto" data-testid="month-row">
          <MonthChip active={state.month === null} onClick={() => setState({ month: null })} label="Annual" title={periodLabel(labels, state.period)} />
          {months.map((m) => (
            <MonthChip key={m} active={state.month === m} onClick={() => setState({ month: m })} label={monthTiny(labels, m)} title={monthLabel(labels, m)} />
          ))}
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs" data-testid="national-only">
          <span className="pill border border-warn/40 bg-refusal px-2 py-0.5 text-micro normal-case tracking-normal text-warn">national only</span>
          <span className="truncate text-muted" title={refusalWords(refusal)}>
            {refusal ? `${refusalWords(refusal)} (${refusal.error_class})` : mapQ.isLoading ? "asking the release for this year…" : "spatial products exist for the reference year only; the national envelopes answer this year"}
          </span>
        </div>
      )}
    </div>
  );
}

function MonthChip({ active, onClick, label, title }: { active: boolean; onClick: () => void; label: string; title?: string }) {
  return (
    <button onClick={onClick} title={title} className={`pill shrink-0 px-2 py-0.5 text-micro normal-case tracking-normal ${active ? "bg-fg text-card" : "text-muted hover:bg-fg/5 hover:text-fg"}`} data-testid="month-chip">
      {label}
    </button>
  );
}
