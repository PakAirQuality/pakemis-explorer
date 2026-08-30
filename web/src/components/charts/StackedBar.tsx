"use client";
/**
 * One stacked bar (HTML): segments sized by their `value` (the envelope's float), each labelled
 * inside with its `share` (the server's share_pct_short) when wide enough, and a legend row
 * under it with the swatch, the name, the `label` (display_short) and the share. Nothing is
 * summed or rounded here: the widths are flex-grow weights.
 */
export type Segment = { id: string; name: string; value: number; label: string; share?: string; color: string };

export function StackedBar({ segments, unit = "", testId = "stacked-bar" }: { segments: Segment[]; unit?: string; testId?: string }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  return (
    <div data-testid={testId}>
      <div className="flex h-8 w-full overflow-hidden rounded-md" role="img" aria-label={segments.map((s) => `${s.name} ${s.label}${s.share ? ` ${s.share} %` : ""}`).join("; ")}>
        {segments.map((s) => {
          const wide = total > 0 && s.value / total > 0.12;
          return (
            <div key={s.id} className="flex items-center justify-center overflow-hidden text-xs font-semibold text-on-accent" style={{ flexGrow: Math.max(0, s.value), flexBasis: 0, background: s.color }} data-testid="segment" data-id={s.id} title={`${s.name} · ${s.label}${unit ? ` ${unit}` : ""}${s.share ? ` · ${s.share} %` : ""}`}>
              {wide && s.share ? <span className="num">{s.share} %</span> : null}
            </div>
          );
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {segments.map((s) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            <span className="text-fg">{s.name}</span>
            <span className="num text-muted">{s.label}{unit ? ` ${unit}` : ""}</span>
            {s.share && <span className="num text-muted">· {s.share} %</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
