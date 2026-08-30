"use client";
/**
 * The briefing map's bottom-left pill (emissions.web.app's): `Low ▬▬▬ High | Opacity ──●── 80%`.
 * One white glass pill holding the YlOrRd gradient bar between the two words, a hairline, and
 * an Opacity range input (0–100, step 5) that sets the choropleth's fill-opacity. A pure
 * display setting: the percentage shown is the input's own integer, never a data number. The
 * values, the scope, the hatch and shared-cell rows live in the hover tip and on the Map page.
 */
import { RAMP } from "@/lib/palette";

export const OPACITY_DEFAULT = 80;

export function OpacityPill({ value, onChange }: { value: number; onChange: (pct: number) => void }) {
  return (
    <div className="glass flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-xs text-muted" data-testid="opacity-pill">
      <span>Low</span>
      <span className="h-2 w-16 rounded-full border border-line" style={{ background: `linear-gradient(90deg, ${RAMP.join(", ")})` }} aria-hidden="true" data-testid="pill-gradient" />
      <span>High</span>
      <span className="h-4 w-px bg-line-strong" aria-hidden="true" />
      <label className="flex items-center gap-2">
        <span>Opacity</span>
        <input type="range" min={0} max={100} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 w-20 cursor-pointer accent-accent" aria-label="Choropleth opacity" data-testid="opacity-range" />
        <span className="num w-8 text-right text-fg" data-testid="opacity-value">{Math.round(value)}%</span>
      </label>
    </div>
  );
}
