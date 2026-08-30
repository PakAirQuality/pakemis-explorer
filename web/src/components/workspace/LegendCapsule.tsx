"use client";
/**
 * The map's legend, bottom-left of the map and right of the deck (`left-[calc(20px+420px+16px)]`,
 * the deck's inset plus its column plus the gap): ONE glass line —
 * `Relative · Lower ▬▬▬▬ Higher · ⓘ`. It prints no break numbers: the default shading reads
 * relative, and exact values belong in the cards, the hover tip and the drawer, where they carry
 * their unit and their receipt. The ⓘ says so. The three scale modes (relative / fixed /
 * absolute) and the real quantile paint are Wave 4's; the paint underneath is still the
 * value-scaled ramp, and this capsule deliberately does not describe its breaks.
 */
import { Info } from "lucide-react";
import { RAMP } from "@/lib/palette";
import { LEGEND } from "./copy";

export function LegendCapsule({ className = "" }: { className?: string }) {
  return (
    <div
      className={`glass pill absolute bottom-5 left-[calc(20px+420px+16px)] z-20 hidden items-center gap-2 px-3 py-1.5 text-xs text-muted lg:flex ${className}`}
      aria-label={LEGEND.label}
      data-testid="legend-capsule"
    >
      <span className="font-semibold text-fg">{LEGEND.mode}</span>
      <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
      <span>{LEGEND.lower}</span>
      <span className="h-2 w-20 rounded-full border border-line" style={{ background: `linear-gradient(90deg, ${RAMP.join(", ")})` }} aria-hidden="true" data-testid="legend-ramp" />
      <span>{LEGEND.higher}</span>
      <span className="text-muted/70" title={LEGEND.note} aria-label={LEGEND.note} data-testid="legend-note">
        <Info size={13} aria-hidden="true" />
      </span>
    </div>
  );
}
