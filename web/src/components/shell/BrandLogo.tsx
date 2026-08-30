/**
 * The Pakistan Air Quality Initiative logo (public/brand/paqi-logo.png; origin and digest in
 * public/brand/README.md). A plain img: the static export serves the file as it is, and the
 * four places that show it (loading screen, nav, Overview header and footer) size it by class.
 */
import type { CSSProperties } from "react";

export const LOGO_SRC = "/brand/paqi-logo.png";
export const LOGO_ALT = "Pakistan Air Quality Initiative";

export function BrandLogo({ className, style }: { className: string; style?: CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={LOGO_SRC} alt={LOGO_ALT} className={className} style={style} draggable={false} data-testid="brand-logo" />;
}
