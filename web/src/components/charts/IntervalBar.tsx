"use client";
/**
 * A horizontal interval figure (HTML): one row per scenario with its label, the 95 % interval
 * as a bar from P2.5 to P97.5, the median as a tick, and an optional marker (the reference
 * estimate) as a vertical line across every row; tick labels along the bottom from the
 * envelope's `axis.ticks_short`. Every printed string is the caller's (server strings); the
 * numbers place the marks and print nothing.
 */
import { axisFromTicks, fraction } from "./axis";

export type IntervalRow = { id: string; label: string; low: string; high: string; lowValue: number; highValue: number; median: string; medianValue: number; headline?: boolean };
export type IntervalMarker = { label: string; display: string; value: number };

export function IntervalBar({ rows, ticks, marker, unit = "", testId = "interval-bar" }: { rows: IntervalRow[]; ticks?: string[] | null; marker?: IntervalMarker | null; unit?: string; testId?: string }) {
  const axis = axisFromTicks(ticks);
  if (!axis) return null;
  const pct = (v: number) => `${(fraction(axis, v) * 100).toFixed(2)}%`;
  return (
    <div data-testid={testId} className="relative" data-ticks={axis.ticks.join("|")}>
      <div className="relative ml-[212px]">
        {rows.map((r) => (
          <div key={r.id} className="relative flex h-9 items-center" data-testid="interval-row" data-scenario={r.id}>
            <div className="absolute -left-[212px] w-[200px] truncate text-right text-xs text-muted" title={r.label}>{r.label}</div>
            <div className="relative h-4 w-full">
              <div className="absolute inset-y-0 rounded-sm" style={{ left: pct(r.lowValue), width: `calc(${pct(r.highValue)} - ${pct(r.lowValue)})`, background: r.headline ? "var(--color-accent)" : "var(--color-accent-soft)", opacity: r.headline ? 0.85 : 1 }} />
              <div className="absolute -inset-y-0.5 w-0.5 bg-fg" style={{ left: pct(r.medianValue) }} title={`median ${r.median}${unit ? ` ${unit}` : ""}`} />
              <span className="num absolute -top-3.5 text-[10px] text-muted" style={{ left: pct(r.lowValue), transform: "translateX(-50%)" }} data-testid="interval-low">{r.low}</span>
              <span className="num absolute -top-3.5 text-[10px] text-muted" style={{ left: pct(r.highValue), transform: "translateX(-50%)" }} data-testid="interval-high">{r.high}</span>
              <span className="num absolute top-4 text-[10px] font-semibold text-fg" style={{ left: pct(r.medianValue), transform: "translateX(-50%)" }} data-testid="interval-median">{r.median}</span>
            </div>
          </div>
        ))}
        {marker && (
          <div className="pointer-events-none absolute inset-y-0" style={{ left: pct(marker.value) }} data-testid="interval-marker">
            <div className="h-full w-px border-l border-dashed border-amber" />
            <div className="num absolute -top-4 whitespace-nowrap text-[10px] text-amber-soft" style={{ transform: "translateX(-50%)" }}>{marker.label} {marker.display}</div>
          </div>
        )}
        <div className="relative mt-5 h-4 border-t border-dashed border-line">
          {axis.ticks.map((tick, i) => (
            <span key={i} className="num absolute top-0.5 text-[10px] text-muted" style={{ left: pct(Number(tick)), transform: "translateX(-50%)" }} data-testid="axis-tick">{tick}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
