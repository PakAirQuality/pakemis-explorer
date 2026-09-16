/**
 * The gold contour fan in the panel's upper right.
 *
 * WHY THIS IS NOT ui/ContourMotif. The house motif draws a fixed shape whose rise-to-spread ratio
 * is 94:42 = 2.24; the design's fan is 63:45 = 1.40. No box can turn one into the other —
 * stretching the box to space the strokes out only makes each stroke climb further, and shrinking
 * it to calm the climb pulls the strokes together. Two rounds were spent resizing a drawing that
 * was the wrong drawing. AskRings.tsx sits beside this for the same reason.
 *
 * Every number is measured off the design at 1:1 (the badge is 83 px in both it and a screenshot of
 * the build): seven strokes 7.5 px apart, so the fan spreads 45 px; each climbing 63 px across a
 * 130 px span; the whole thing 130 x 108.
 *
 * THE VIEWBOX IS THE INK. The house component's paths begin a fifth of the way into its box, so its
 * box is much wider than what it draws — which is the trap that made "bring the ink 27 px closer"
 * turn into "make the box 60 px wider". Here the box is what you see.
 */
const W = 130;              // the span the strokes cross
const RISE = 63;            // how far each one climbs over that span
const GAP = 7.5;            // between neighbouring strokes
const N = 7;
const SPREAD = GAP * (N - 1);
const H = RISE + SPREAD;    // 108: the lowest stroke's start down to the highest one's end

/** The house curve's control points, as fractions of the span and the rise — the same drawing. */
const C1 = [0.304, 0.17];
const C2 = [0.435, 0.809];

function stroke(i: number): string {
  const y0 = H - GAP * i;                       // i = 0 is the lowest stroke
  return `M 0 ${y0.toFixed(2)} C ${(C1[0] * W).toFixed(2)} ${(y0 - C1[1] * RISE).toFixed(2)},`
    + ` ${(C2[0] * W).toFixed(2)} ${(y0 - C2[1] * RISE).toFixed(2)},`
    + ` ${W} ${(y0 - RISE).toFixed(2)}`;
}

export const ASK_MOTIF = { width: W, height: H, strokes: N, gap: GAP, spread: SPREAD, rise: RISE };

export function AskMotif({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={`pointer-events-none absolute ${className}`}
      style={style}
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="ask-motif"
    >
      {Array.from({ length: N }, (_, i) => (
        <path key={i} d={stroke(i)} stroke="var(--color-brand-gold)" strokeOpacity="0.4" strokeWidth="1" />
      ))}
    </svg>
  );
}
