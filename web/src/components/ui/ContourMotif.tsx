/**
 * The house motif: a whisper of fine saffron contour lines in a card's corner, drawn inline —
 * no image asset, no dependency, and `aria-hidden` because it says nothing. The place card
 * carries it at the top right and the snapshot card at the bottom right (the mockup's two);
 * a card that shows it must be `relative` and `overflow-hidden`, and its content `relative` so
 * the strokes stay behind the words.
 */
export function ContourMotif({ corner = "top-right", className = "" }: { corner?: "top-right" | "bottom-right"; className?: string }) {
  const bottom = corner === "bottom-right";
  return (
    <svg
      className={`pointer-events-none absolute right-0 h-32 w-56 ${bottom ? "bottom-0" : "top-0"} ${className}`}
      viewBox="0 0 224 128"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="contour-motif"
      data-corner={corner}
    >
      <g transform={bottom ? "translate(0,128) scale(1,-1)" : undefined}>
        {[0, 7, 14, 21, 28, 35, 42].map((d) => (
          <path key={d} d={`M40 ${128 - d} C 96 ${112 - d}, 120 ${52 - d}, 224 ${34 - d}`} stroke="var(--color-brand-gold)" strokeOpacity="0.28" strokeWidth="1" />
        ))}
      </g>
    </svg>
  );
}
