"use client";
/**
 * The atlas-style year rail: one tick per fiscal period, the chosen one flagged.
 * CLICKING a tick writes `period` (through the caller's onPick), the same key the
 * year slider writes, so the map and every card follow. Shared by the greenhouse
 * overview panel and the air snapshot — one control, both lanes.
 */
import { periodShort } from "@/lib/labels";

export function YearRail({ periods, current, onPick, labels }: { periods: string[]; current: string; onPick: (id: string) => void; labels: Parameters<typeof periodShort>[0] }) {
  return (
    <div className="mt-4 flex items-end justify-between gap-1" role="radiogroup" aria-label="Fiscal year" data-testid="year-rail">
      {periods.map((id) => {
        const on = id === current;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(id)}
            className="group flex min-w-0 flex-1 flex-col items-center gap-1"
            data-testid={`rail-${id}`}
          >
            <span className={`h-3 w-0.5 rounded-full transition-colors ${on ? "h-4 w-1 bg-accent" : "bg-line group-hover:bg-muted"}`} aria-hidden="true" />
            <span className={`num text-[10px] leading-none ${on ? "font-semibold text-accent" : "text-muted group-hover:text-fg"}`}>
              {periodShort(labels, id)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
