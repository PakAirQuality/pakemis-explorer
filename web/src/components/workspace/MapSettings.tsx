"use client";
/**
 * Map settings: the bottom-right pill (left of the Ask FAB the layout fixes there) and the
 * popover it opens, holding the controls that are
 * about the MAP rather than about the question — the estimate and the warming potentials, the
 * spatial view, the map layer (map/LayerSwitch.tsx), the shading opacity and the grid raster.
 * They left the filter panel with the merge on 2026-08-30, so the panel carries only what
 * drives both the deck and the map. The scale modes (relative / fixed / absolute) join this
 * popover in Wave 4.
 *
 * Every choice but the opacity is written to the URL; the opacity is a display setting the page
 * owns and passes to the map. Every option's word is a release label; nothing here prints a
 * number but the slider's own integer percentage.
 */
import { useEffect, useRef } from "react";
import { Settings2, X } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { configLabel, configTooltip, gwpLabel, gwpTooltip, viewLabel } from "@/lib/labels";
import { SELECT_CLASS } from "@/components/ui/ControlsCard";
import { LayerSwitch } from "@/components/map/LayerSwitch";
import { SETTINGS } from "./copy";

export function MapSettings({ open, onToggle, opacity, onOpacity }: { open: boolean; onToggle: (open: boolean) => void; opacity: number; onOpacity: (pct: number) => void }) {
  const { state, setState, labels, dims, contract } = useExplorer();
  const gwps = contract?.gwp?.length ? contract.gwp : Object.keys(labels.gwp).length ? Object.keys(labels.gwp) : [state.gwp];
  const views = Object.keys(labels.views).length ? Object.keys(labels.views) : [state.view];
  const configs = dims.configurations.length ? dims.configurations : [state.config];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onToggle]);
  return (
    <div className="absolute bottom-5 right-[92px] z-20 flex flex-col items-end gap-2" ref={ref} data-testid="map-settings">
      {open && (
        <div className="card w-[300px] max-w-[calc(100vw-40px)] p-4 shadow-lg" role="dialog" aria-label={SETTINGS.title} data-testid="map-settings-panel">
          <div className="mb-3 flex items-center justify-between">
            <div className="micro">{SETTINGS.title}</div>
            <button type="button" aria-label={SETTINGS.close} onClick={() => onToggle(false)} className="pill p-1 text-muted hover:bg-surface-3 hover:text-fg" data-testid="map-settings-close">
              <X size={14} />
            </button>
          </div>
          <div className="flex flex-col gap-3.5">
            <div>
              <div className="micro mb-1.5">{SETTINGS.estimate}</div>
              <select className={SELECT_CLASS} value={state.config} onChange={(e) => setState({ config: e.target.value })} title={configTooltip(labels, state.config)} aria-label={SETTINGS.estimate} data-testid="config-select">
                {configs.map((c) => (
                  <option key={c} value={c} title={configTooltip(labels, c)}>{configLabel(labels, c)}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="micro mb-1.5">{SETTINGS.gwp}</div>
              <div className="pill flex overflow-hidden border border-line bg-surface p-0.5" role="tablist" aria-label={SETTINGS.gwp} data-testid="gwp-select">
                {gwps.map((g) => (
                  <button key={g} type="button" role="tab" aria-selected={state.gwp === g} onClick={() => setState({ gwp: g })} title={gwpTooltip(labels, g)} className={`pill flex-1 py-1 text-xs ${state.gwp === g ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`}>
                    {gwpLabel(labels, g)}
                  </button>
                ))}
              </div>
              {state.level === "adm2" && labels.limitations.ar6_adm2_ne && <p className="mt-1 text-xs text-muted">{labels.limitations.ar6_adm2_ne}</p>}
            </div>
            <div>
              <div className="micro mb-1.5">{SETTINGS.view}</div>
              <select className={SELECT_CLASS} value={state.view} onChange={(e) => setState({ view: e.target.value })} aria-label={SETTINGS.view} data-testid="view-select">
                {views.map((v) => (
                  <option key={v} value={v}>{viewLabel(labels, v)}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="micro mb-1.5">{SETTINGS.layer}</div>
              <LayerSwitch compact />
            </div>
            <label className="flex items-center justify-between gap-2 text-xs text-muted">
              <span>{SETTINGS.opacity}</span>
              <span className="flex items-center gap-2">
                <input type="range" min={0} max={100} step={5} value={opacity} onChange={(e) => onOpacity(Number(e.target.value))} className="h-1 w-24 cursor-pointer accent-accent" aria-label={SETTINGS.opacity} data-testid="opacity-range" />
                <span className="num w-8 text-right text-fg" data-testid="opacity-value">{Math.round(opacity)}%</span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={state.raster} onChange={(e) => setState({ raster: e.target.checked })} data-testid="raster-toggle" /> {SETTINGS.raster}
            </label>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => onToggle(!open)}
        aria-expanded={open}
        className="glass pill flex h-9 items-center gap-1.5 px-3.5 text-xs font-semibold text-fg"
        data-testid="map-settings-button"
      >
        <Settings2 size={14} aria-hidden="true" /> {SETTINGS.title}
      </button>
    </div>
  );
}
