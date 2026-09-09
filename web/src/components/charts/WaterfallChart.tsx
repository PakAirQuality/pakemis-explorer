"use client";
/**
 * A waterfall: the left total, one floating step per source's contribution to the change,
 * the right total. Pure SVG. `value` sizes and positions the bars and prints nothing; every
 * printed number is the server's own label string. Rises take the house ramp BY MAGNITUDE
 * (saffron at the smallest, oxblood at the largest - ColumnChart's own encoding), falls
 * grade in the gold family, the two totals sit on the neutral ground: colour restates the
 * server's values and signs, it never invents a number.
 */
import { columnColor } from "./ColumnChart";

const GOLD = [255, 179, 19];       // --color-brand-gold
const GOLD_DEEP = [138, 90, 12];   // --color-amber-soft
/** The falls' two-stop grade: brand gold at the smallest cut, deep amber at the largest. */
function fallColor(magnitude: number, max: number): string {
  const t = max > 0 ? Math.max(0, Math.min(1, magnitude / max)) : 0;
  const c = GOLD.map((a, i) => Math.round(a + (GOLD_DEEP[i] - a) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
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
const H = 320;
const PAD = { top: 26, bottom: 44, left: 52, right: 8 };

export function WaterfallChart({ steps, unit, ticks, selected = null, onPick, testId = "waterfall" }: { steps: WaterfallStep[]; unit?: string; ticks?: readonly string[] | null; selected?: string | null; onPick?: (id: string) => void; testId?: string }) {
  if (!steps.length) return null;
  // geometry only: the running level after each bar
  let level = 0;
  const bars = steps.map((s) => {
    const from = s.kind === "delta" ? level : 0;
    const to = s.kind === "delta" ? level + s.value : s.value;
    level = to;
    return { ...s, from, to };
  });
  // the y scale: the server's own tick labels when given (parsed for geometry only,
  // the axisFromTicks convention), else the bars' own extent
  const tickVals = (ticks ?? []).map((t) => parseFloat(t)).filter((v) => Number.isFinite(v));
  const lo = Math.min(0, ...bars.flatMap((b) => [b.from, b.to]), ...tickVals);
  const hi = Math.max(...bars.flatMap((b) => [b.from, b.to]), ...tickVals);
  const span = hi - lo || 1;
  const y = (v: number) => PAD.top + ((hi - v) / span) * (H - PAD.top - PAD.bottom);
  const innerW = W - PAD.left - PAD.right;
  const slot = innerW / bars.length;
  const barW = Math.min(64, slot * 0.62);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={bars.map((b) => `${b.name} ${b.label}`).join("; ")} data-testid={testId}>
      {(ticks ?? []).map((t, i) => {
        const v = tickVals[i];
        if (!Number.isFinite(v)) return null;
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y(v)} x2={W - PAD.right} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--color-muted)" className="num">{t}</text>
          </g>
        );
      })}
      {unit && (
        <text x={12} y={H / 2} textAnchor="middle" fontSize={10.5} fill="var(--color-muted)" transform={`rotate(-90 12 ${H / 2})`}>{`Emissions (${unit})`}</text>
      )}
      {(() => {
        const rises = bars.filter((b) => b.kind === "delta" && b.value >= 0).map((b) => b.value);
        const falls = bars.filter((b) => b.kind === "delta" && b.value < 0).map((b) => Math.abs(b.value));
        const riseMin = rises.length ? Math.min(...rises) : 0;
        const riseMax = rises.length ? Math.max(...rises) : 1;
        const fallMax = falls.length ? Math.max(...falls) : 1;
        return bars.map((b, i) => {
        const x = PAD.left + slot * i + (slot - barW) / 2;
        const top = y(Math.max(b.from, b.to));
        const h = Math.max(1.5, Math.abs(y(b.from) - y(b.to)));
        const fill = b.kind !== "delta"
          ? "var(--color-fg)"
          : b.value >= 0
            ? columnColor(b.value, riseMin, riseMax)
            : fallColor(Math.abs(b.value), fallMax);
        const isSelected = selected != null && b.id === selected;
        const dimmed = selected != null && b.kind === "delta" && !isSelected;
        const next = bars[i + 1];
        return (
          <g key={b.id} data-testid={`${testId}-bar-${b.id}`} data-selected={isSelected ? "1" : undefined} onClick={onPick && b.kind === "delta" ? () => onPick(b.id) : undefined} className={onPick && b.kind === "delta" ? "cursor-pointer" : undefined}>
            <rect x={x} y={top} width={barW} height={h} rx={3} fill={fill} opacity={isSelected ? 1 : dimmed ? 0.35 : 1} stroke={isSelected ? "var(--color-fg)" : undefined} strokeWidth={isSelected ? 1.5 : undefined}>
              <title>{`${b.name}: ${b.label}${unit ? ` ${unit}` : ""}`}</title>
            </rect>
            {next && <line x1={x + barW} y1={y(b.to)} x2={PAD.left + slot * (i + 1) + (slot - barW) / 2} y2={y(b.to)} stroke="var(--color-line-strong)" strokeDasharray="3 3" strokeWidth={1} />}
            <text x={x + barW / 2} y={top - 6} textAnchor="middle" fontSize={11} fill="var(--color-fg)" className="num">{b.label}</text>
            <text x={x + barW / 2} y={H - PAD.bottom + 16} textAnchor="middle" fontSize={10.5} fill="var(--color-muted)">
              {b.name.length > 12 ? `${b.name.slice(0, 11)}…` : b.name}
            </text>
          </g>
        );
        });
      })()}
    </svg>
  );
}
