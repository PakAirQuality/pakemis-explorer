/** Marks a bounded cell: its display is "[low, high]" and is printed verbatim, never a midpoint. */
import type { Cell } from "@/lib/envelope";

export function isBounded(cell: Pick<Cell, "exactness"> | null | undefined): boolean {
  return !!cell?.exactness && cell.exactness.includes("bounded");
}

export function IntervalBadge({ cell, title }: { cell?: Pick<Cell, "exactness"> | null; title?: string }) {
  if (cell && !isBounded(cell)) return null;
  return (
    <span className="pill inline-flex items-center gap-1 border border-warn/30 bg-refusal px-1.5 py-px text-micro normal-case tracking-normal text-warn" title={title ?? "a bounded interval: the module mixes fossil and biogenic CH4 at the published grain"}>
      <span className="hatch-swatch inline-block h-2.5 w-2.5 rounded-sm border border-warn/40" />
      interval
    </span>
  );
}
