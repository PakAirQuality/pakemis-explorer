"use client";
/**
 * A waterfall: the left total, one floating step per source's contribution to the change,
 * the right total. Pure SVG. `value` sizes and positions the bars and prints nothing; every
 * printed number is the server's own label string. Rises take the accent, falls the brand
 * gold, the two totals the neutral ground — the same encoding rule as the column chart:
 * colour restates the server's sign, it never invents a number.
 */
export type WaterfallStep = {
  id: string;
  name: string;
  /** The server's numeric value (a total for the ends, a signed delta for a step). */
  value: number;
  /** The printed number: the cell's display_short, signed by the caller for steps. */
  label: string;
  kind: "start" | "delta" | "end";
};

const W = 840;
const H = 300;
const PAD = { top: 26, bottom: 44, left: 8, right: 8 };

export function WaterfallChart({ steps, unit, onPick, testId = "waterfall" }: { steps: WaterfallStep[]; unit?: string; onPick?: (id: string) => void; testId?: string }) {
  if (!steps.length) return null;
  // geometry only: the running level after each bar
  let level = 0;
  const bars = steps.map((s) => {
    const from = s.kind === "delta" ? level : 0;
    const to = s.kind === "delta" ? level + s.value : s.value;
    level = to;
    return { ...s, from, to };
  });
  const lo = Math.min(0, ...bars.flatMap((b) => [b.from, b.to]));
  const hi = Math.max(...bars.flatMap((b) => [b.from, b.to]));
  const span = hi - lo || 1;
  const y = (v: number) => PAD.top + ((hi - v) / span) * (H - PAD.top - PAD.bottom);
  const innerW = W - PAD.left - PAD.right;
  const slot = innerW / bars.length;
  const barW = Math.min(64, slot * 0.62);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={bars.map((b) => `${b.name} ${b.label}`).join("; ")} data-testid={testId}>
      {bars.map((b, i) => {
        const x = PAD.left + slot * i + (slot - barW) / 2;
        const top = y(Math.max(b.from, b.to));
        const h = Math.max(1.5, Math.abs(y(b.from) - y(b.to)));
        const fill = b.kind !== "delta" ? "var(--color-line-strong)" : b.value >= 0 ? "var(--color-accent-bright)" : "var(--color-brand-gold)";
        const next = bars[i + 1];
        return (
          <g key={b.id} data-testid={`${testId}-bar-${b.id}`} onClick={onPick && b.kind === "delta" ? () => onPick(b.id) : undefined} className={onPick && b.kind === "delta" ? "cursor-pointer" : undefined}>
            <rect x={x} y={top} width={barW} height={h} rx={3} fill={fill} opacity={b.kind === "delta" ? 0.92 : 1}>
              <title>{`${b.name}: ${b.label}${unit ? ` ${unit}` : ""}`}</title>
            </rect>
            {next && <line x1={x + barW} y1={y(b.to)} x2={PAD.left + slot * (i + 1) + (slot - barW) / 2} y2={y(b.to)} stroke="var(--color-line-strong)" strokeDasharray="3 3" strokeWidth={1} />}
            <text x={x + barW / 2} y={top - 6} textAnchor="middle" fontSize={11} fill="var(--color-fg)" className="num">{b.label}</text>
            <text x={x + barW / 2} y={H - PAD.bottom + 16} textAnchor="middle" fontSize={10.5} fill="var(--color-muted)">
              {b.name.length > 12 ? `${b.name.slice(0, 11)}…` : b.name}
            </text>
          </g>
        );
      })}
      {unit && <text x={W - PAD.right} y={14} textAnchor="end" fontSize={10.5} fill="var(--color-muted)">{unit}</text>}
    </svg>
  );
}
