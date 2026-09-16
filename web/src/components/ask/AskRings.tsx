/**
 * The gold arcs orbiting the panel's badge.
 *
 * Measured off the reference render (assistant_panel.png at 1.88x): with the badge 83 px across —
 * a radius of 41.5 — the gold sits at radii of about 43, 58, 66 and 90, i.e. from just outside the
 * disc out to a little over twice its radius. They are broken arcs, not rings, each ending in a
 * small round dot; two sweep clockwise and the others counter, so the group reads as drawn rather
 * than as a target.
 *
 * ContourMotif (ui/ContourMotif.tsx) is the house's decorative mark, but it draws open curves
 * across a corner — the wrong geometry for something concentric — so this is the same idea in the
 * same ink: `--color-brand-gold`, hairline strokes, and nothing that says anything (aria-hidden,
 * no pointer events).
 *
 * The viewBox is in BADGE RADII: the disc is the unit circle at the origin, so a caller that
 * resizes the badge gets the arcs at the same proportions without a second set of numbers to keep
 * in step.
 */
const GOLD = "var(--color-brand-gold)";

/** [radius in badge-radii, start angle, sweep, stroke width, opacity] */
const ARCS: [number, number, number, number, number][] = [
  [1.04, 156, 84, 0.035, 0.85],   // the short one hugging the disc, lower left
  [1.40, 188, 132, 0.030, 0.95],  // the long sweep up the left side and over the top
  [1.59, 24, 74, 0.026, 0.75],    // the right-hand arc, shorter
  [2.17, 96, 46, 0.022, 0.4],     // the faint outlier, lower left
];

function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}

function arcPath(r: number, start: number, sweep: number): string {
  const [x0, y0] = polar(r, start);
  const [x1, y1] = polar(r, start + sweep);
  return `M ${x0.toFixed(3)} ${y0.toFixed(3)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
}

export function AskRings({ size, className = "" }: { size: number; className?: string }) {
  // the arcs reach 2.17 badge-radii, so the box is that across in each direction
  const span = 2.4;
  const box = size * span;
  return (
    <svg
      className={`pointer-events-none absolute ${className}`}
      style={{ width: box, height: box, left: "50%", marginLeft: -box / 2, top: -(box - size) / 2 }}
      viewBox={`${-span} ${-span} ${span * 2} ${span * 2}`}
      fill="none"
      aria-hidden="true"
      data-testid="ask-rings"
    >
      {ARCS.map(([r, start, sweep, width, opacity]) => {
        const [ex, ey] = polar(r, start + sweep);
        return (
          <g key={`${r}-${start}`} stroke={GOLD} strokeOpacity={opacity}>
            <path d={arcPath(r, start, sweep)} strokeWidth={width} strokeLinecap="round" />
            {/* the small dot each arc ends on */}
            <circle cx={ex} cy={ey} r={width * 1.6} fill={GOLD} fillOpacity={opacity} stroke="none" />
          </g>
        );
      })}
    </svg>
  );
}
