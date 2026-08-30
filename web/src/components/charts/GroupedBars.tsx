"use client";
/**
 * Grouped bars (HTML) for a compare envelope: one row per group with the left and the right
 * estimate as two bars, each labelled with its own `display_short`, and the difference cell's
 * `display_short` (signed, the server's) at the row's end. The bars are sized by their `value`
 * as a fraction of the largest value among them (placement only); there is no numeric axis,
 * because the envelope's `axis.ticks_short` describe the difference cells, not the two
 * estimates. Nothing is summed, rounded or converted here.
 */
export type GroupedRow = { id: string; name: string; left: { value: number; label: string }; right: { value: number; label: string }; difference: string };

export function GroupedBars({ rows, leftName, rightName, unit = "", testId = "grouped-bars" }: { rows: GroupedRow[]; leftName: string; rightName: string; unit?: string; testId?: string }) {
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(r.left.value), Math.abs(r.right.value)), 0);
  const width = (v: number) => (max > 0 ? `${(Math.abs(v) / max) * 100}%` : "0%");
  return (
    <div data-testid={testId} role="img" aria-label={rows.map((r) => `${r.name}: ${leftName} ${r.left.label}, ${rightName} ${r.right.label}, difference ${r.difference}`).join("; ")}>
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-line-strong" aria-hidden="true" />{leftName}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden="true" />{rightName}</span>
        <span className="text-muted">Difference = {rightName.toLowerCase()} − {leftName.toLowerCase()}{unit ? `, ${unit}` : ""}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-[140px_1fr_84px] items-center gap-3 text-xs" data-testid="grouped-row" data-id={r.id}>
            <span className="truncate text-fg" title={r.name}>{r.name}</span>
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <span className="h-2.5 rounded-r-sm bg-line-strong" style={{ width: width(r.left.value) }} aria-hidden="true" />
                <span className="num whitespace-nowrap text-muted" data-testid="grouped-left">{r.left.label}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 rounded-r-sm bg-accent" style={{ width: width(r.right.value) }} aria-hidden="true" />
                <span className="num whitespace-nowrap text-fg" data-testid="grouped-right">{r.right.label}</span>
              </span>
            </span>
            <span className="num whitespace-nowrap text-right font-semibold text-fg" data-testid="grouped-difference">{r.difference}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
