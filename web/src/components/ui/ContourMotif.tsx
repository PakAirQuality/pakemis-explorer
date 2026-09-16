import type { CSSProperties } from "react";
/**
 * The house motif: a whisper of fine saffron contour lines in a card's corner, drawn inline —
 * no image asset, no dependency, and `aria-hidden` because it says nothing. The place card
 * carries it at the top right and the snapshot card at the bottom right (the mockup's two);
 * a card that shows it must be `relative` and `overflow-hidden`, and its content `relative` so
 * the strokes stay behind the words.
 *
 * `size` is the box the curves stretch into (`preserveAspectRatio="none"`, so they follow it
 * rather than letterboxing). It defaults to the size every card has always drawn; the assistant
 * panel asks for a smaller, steeper sweep, and passing it here rather than through `className`
 * keeps the default a real default instead of two competing classes racing in the stylesheet.
 *
 * `style` is the escape hatch for a caller that must place the box against something else on the
 * page rather than against a corner — the assistant panel pins its curves to the badge's top and
 * middle. When it is given, the size and corner classes step aside rather than compete with it.
 *
 * `opacity` likewise: the cards draw on white and the assistant panel on a warm cream, where the
 * same ink reads fainter, so the panel asks for a little more. Both default to what every existing
 * caller already gets.
 */
export function ContourMotif({ corner = "top-right", className = "", size = "h-32 w-56", opacity = 0.28, style }: { corner?: "top-right" | "bottom-right"; className?: string; size?: string; opacity?: number; style?: CSSProperties }) {
  const bottom = corner === "bottom-right";
  return (
    <svg
      className={`pointer-events-none absolute right-0 ${style ? "" : `${size} ${bottom ? "bottom-0" : "top-0"}`} ${className}`}
      style={style}
      viewBox="0 0 224 128"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="contour-motif"
      data-corner={corner}
    >
      <g transform={bottom ? "translate(0,128) scale(1,-1)" : undefined}>
        {[0, 7, 14, 21, 28, 35, 42].map((d) => (
          <path key={d} d={`M40 ${128 - d} C 96 ${112 - d}, 120 ${52 - d}, 224 ${34 - d}`} stroke="var(--color-brand-gold)" strokeOpacity={opacity} strokeWidth="1" />
        ))}
      </g>
    </svg>
  );
}
