"use client";
/**
 * "Current view: 2023–24 · Pakistan · Reference estimate":
 * the scope every page's numbers share, in the release's own words (the period's short label,
 * the geography by its name, the configuration's label, the warming-potential basis only when
 * it is not the release's default, then a sector, gas or month when one is chosen). The IPCC
 * basis is the line's tooltip. "Change view" opens a
 * popover with the ExplorePanel's controls, which write the same URL state.
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { configLabel, configTooltip, districtName, gasLabel, geographyName, gwpIsDefault, gwpLabel, gwpTooltip, monthLabel, periodLabel, periodShort, sectorLabel } from "@/lib/labels";
import type { Labels } from "@/lib/release";
import type { ExplorerState, StateDefaults } from "@/lib/urlState";
import type { Dims } from "@/components/ExplorerContext";
import { ExplorePanel } from "@/components/panels/ExplorePanel";

/** The place of the view: the selected district or province by its name, else Pakistan. */
export function viewPlace(labels: Labels, dims: Dims, s: Pick<ExplorerState, "level" | "geo">): string {
  if (!s.geo) return "Pakistan";
  return s.level === "adm2" ? districtName(dims, s.geo) : geographyName(labels, s.geo);
}

/** The words of the line and their tooltip. */
export function currentViewWords(labels: Labels, dims: Dims, s: ExplorerState, d: StateDefaults): { words: string; title: string } {
  const parts = [periodShort(labels, s.period), viewPlace(labels, dims, s), configLabel(labels, s.config)];
  if (!gwpIsDefault(labels, s.gwp, d.gwp_basis)) parts.push(gwpLabel(labels, s.gwp));
  if (s.sector) parts.push(sectorLabel(labels, s.sector));
  if (s.gas) parts.push(gasLabel(labels, s.gas));
  if (s.month) parts.push(monthLabel(labels, s.month));
  const basis = gwpTooltip(labels, s.gwp) ? `${gwpLabel(labels, s.gwp)}: ${gwpTooltip(labels, s.gwp)}` : gwpLabel(labels, s.gwp);
  const title = [periodLabel(labels, s.period), configTooltip(labels, s.config), basis].filter(Boolean).join(" · ");
  return { words: parts.filter(Boolean).join(" · "), title };
}

export function CurrentView({ compact = false }: { compact?: boolean }) {
  const { state, labels, dims, defaults } = useExplorer();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { words, title } = currentViewWords(labels, dims, state, defaults);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);
  return (
    <div className="border-b border-line bg-surface" data-testid="current-view">
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-xs ${compact ? "" : "mx-auto max-w-[1500px] md:px-6"}`}>
        <span className="text-muted">Current view:</span>
        <span className="text-fg" data-testid="current-view-line" title={title}>
          {words}
        </span>
        <div ref={box} className="relative ml-auto">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" className="pill border border-line-strong px-2.5 py-1 text-xs text-fg hover:bg-surface-3" data-testid="change-view">
            Change view
          </button>
          {open && (
            <div role="dialog" aria-label="Change view" className="card absolute right-0 top-full z-50 mt-1 max-h-[70dvh] w-[min(92vw,360px)] overflow-y-auto" data-testid="change-view-popover">
              <div className="flex items-center justify-between border-b border-line px-4 py-2">
                <div className="micro">Change view</div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="pill p-1 text-muted hover:bg-surface-3 hover:text-fg">
                  <X size={14} />
                </button>
              </div>
              <ExplorePanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
