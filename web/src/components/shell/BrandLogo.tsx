/**
 * The Pakistan Air Quality Initiative logo (public/brand/paqi-logo.png; origin and digest in
 * public/brand/README.md). A plain img: the static export serves the file as it is, and the
 * three places that show it (loading screen, nav and the Overview footer) size it by class.
 */
import type { CSSProperties } from "react";

export const LOGO_SRC = "/brand/paqi-logo.png";
export const LOGO_ALT = "Pakistan Air Quality Initiative";

export function BrandLogo({ className, style }: { className: string; style?: CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={LOGO_SRC} alt={LOGO_ALT} className={className} style={style} draggable={false} data-testid="brand-logo" />;
}

/**
 * The initiative's mark WITHOUT the wordmark or its tile: the white glyph alone, on transparency.
 *
 * It used to be supplied as a finished badge - glyph already sitting on an oxblood rounded square -
 * and the panel clipped that square to a circle. The result was a circle whose glyph filled 58% of
 * it, because the tile's own glyph was drawn for a square; it read cramped, and squarish. Keying
 * the ground out and drawing the disc ourselves is what lets the glyph be sized against the disc
 * rather than against a picture of one. See web/public/brand/README.md for the derivation.
 *
 * Decorative wherever the name is on screen beside it, hence the empty alt by default.
 */
export const MARK_SRC = "/brand/paqi-glyph.png";

export function BrandMark({ className, alt = "", style }: { className: string; alt?: string; style?: CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={MARK_SRC} alt={alt} className={className} style={style} draggable={false} data-testid="brand-mark" />;
}

/**
 * The mark as a badge: the glyph centred on an oxblood disc, at the proportion the brand uses -
 * 52% of the disc's height, which puts it at 41% of its width. ONE component owns that ratio, so
 * a second call site cannot quietly draw a different badge.
 */
/** The glyph's height as a share of the disc's: the brand's own proportion, and the mockup's. */
export const GLYPH_SHARE = 0.52;

export function BrandBadge({ size, className = "" }: { size: number; className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-accent ${className}`}
      style={{ width: size, height: size }}
      data-testid="brand-badge"
    >
      <BrandMark className="block w-auto" style={{ height: Math.round(size * GLYPH_SHARE) }} />
    </span>
  );
}

/**
 * The identity as the brand supplies it: the glyph on its own oxblood rounded square.
 *
 * THIS IS THE TILE, NOT THE BADGE, and the two are not interchangeable. BrandBadge draws our own
 * disc and sizes the glyph against it; this is the finished artwork, corners already transparent,
 * and it is rendered flat - no `rounded-` class, because clipping a picture of a shape into another
 * shape is exactly what the badge exists to avoid. Small sizes only: at a title's height it reads as
 * a mark, where the wordmark (BrandLogo) would not. Derived from PAQI_final_4096.png; the recipe is
 * in web/public/brand/README.md.
 */
export const TILE_SRC = "/brand/paqi-tile.png";

export function BrandTile({ size, className = "" }: { size: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={TILE_SRC} alt="" className={`block shrink-0 ${className}`} style={{ width: size, height: size }} draggable={false} data-testid="brand-tile" />;
}
