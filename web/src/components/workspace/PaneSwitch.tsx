"use client";
/**
 * The pane switch: **Dashboard | Map**, the one control a narrow workspace adds. Under 1280 px
 * the two panes cannot share the screen, so the workspace shows one at a time and this segmented
 * control — its own pill at the top left, while the nav docks to the bottom — says which. It
 * wears the filter panel's own segment classes (`SEGMENT_GROUP_CLASS` / `segmentClass`, the
 * Provinces | Districts switch), so the two read as one family: an oxblood fill on the chosen
 * side, muted type on the other.
 *
 * At 1280 px and above the workspace renders both panes and never mounts this, so a wide window
 * carries no switch and no `pane` in its URL.
 */
import type { Pane } from "@/lib/urlState";
import { PANES } from "./copy";

/** The segmented pill both this and the filter panel's Provinces | Districts wear. */
export const SEGMENT_GROUP_CLASS = "pill flex overflow-hidden border border-line bg-surface p-0.5";
/** One segment of it: the chosen side filled oxblood, the other muted. */
export function segmentClass(selected: boolean): string {
  return `pill py-1 text-xs font-medium transition-colors ${selected ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`;
}

const SIDES: { id: Pane; label: string }[] = [
  { id: "dashboard", label: PANES.dashboard },
  { id: "map", label: PANES.map },
];

export function PaneSwitch({ pane, onPane }: { pane: Pane; onPane: (pane: Pane) => void }) {
  return (
    <div className={`${SEGMENT_GROUP_CLASS} shrink-0`} role="group" aria-label={PANES.label} data-testid="pane-switch" data-pane={pane}>
      {SIDES.map((side) => (
        <button
          key={side.id}
          type="button"
          aria-pressed={pane === side.id}
          onClick={() => onPane(side.id)}
          className={`${segmentClass(pane === side.id)} px-3`}
          data-testid={`pane-${side.id}`}
        >
          {side.label}
        </button>
      ))}
    </div>
  );
}
