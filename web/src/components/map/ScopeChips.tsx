"use client";
/**
 * Top-left: the level pill (Provinces | Districts | Grid) and chips for period, configuration,
 * GWP, sector, gas and view, all read from the URL state and labelled from release.labels.
 * A chip opens the Explore panel where the choice is made.
 */
import { useExplorer } from "@/components/ExplorerContext";
import { configLabel, configTooltip, gasLabel, gwpLabel, gwpTooltip, periodShort, sectorLabel, viewLabel } from "@/lib/labels";
import type { Level } from "@/lib/urlState";

const LEVEL_LABELS: Record<Level, string> = { adm1: "Provinces", adm2: "Districts", grid: "Grid" };

export function ScopeChips() {
  const { state, setState, labels } = useExplorer();
  const chip = (label: string, title?: string, key?: string) => (
    <button key={key ?? label} onClick={() => setState({ panel: "explore" })} title={title} className="glass pill max-w-[180px] truncate px-2.5 py-1 text-xs text-fg hover:bg-surface-3" data-testid="scope-chip">
      {label}
    </button>
  );
  return (
    <div className="flex max-w-[calc(100vw-80px)] flex-wrap items-center gap-1.5" data-testid="scope-chips">
      <div className="glass pill flex p-0.5" role="tablist" aria-label="Level">
        {(Object.keys(LEVEL_LABELS) as Level[]).map((l) => (
          <button key={l} role="tab" aria-selected={state.level === l} onClick={() => setState({ level: l })} className={`pill px-3 py-1 text-xs font-medium transition-colors ${state.level === l ? "bg-fg text-surface" : "text-muted hover:text-fg"}`} data-testid={`level-${l}`}>
            {LEVEL_LABELS[l]}
          </button>
        ))}
      </div>
      {chip(periodShort(labels, state.period), labels.periods[state.period]?.label, "period")}
      {chip(configLabel(labels, state.config), configTooltip(labels, state.config), "config")}
      {chip(gwpLabel(labels, state.gwp), gwpTooltip(labels, state.gwp) || "GWP basis", "gwp")}
      {chip(sectorLabel(labels, state.sector), state.sector ?? "all sectors", "sector")}
      {state.gas || state.level === "grid" ? chip(gasLabel(labels, state.gas), state.gas ?? "", "gas") : null}
      {state.view !== "all" && chip(viewLabel(labels, state.view).split(":")[0], viewLabel(labels, state.view), "view")}
    </div>
  );
}
