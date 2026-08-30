"use client";
/**
 * Map settings: the bottom-right pill (the corner the Ask button left when it moved to the bottom left) and the
 * popover it opens, holding everything that is about the MAP rather than about the question, in
 * this order —
 *
 *   Map layer      the five layers of map/layerModes.ts (URL `layer`)
 *   Scale          Relative | Fixed | Absolute (URL `scale`), one line of explanation each
 *   Opacity        the choropleth's fill-opacity; the page owns it, nothing writes it down
 *   Grid raster    the visual-only raster (URL `raster`)
 *   Basemap        Light | Streets (map/basemap.ts) — a local display choice, no env var
 *   Boundaries     the province and district outlines, shown or hidden
 *   Month          the months of the reference year (URL `month`), where map/TimelineBar.tsx's
 *                  month row went when the year slider replaced the timeline
 *   Estimate · Warming potentials · Spatial view   the three that left the filter panel
 *
 * Every choice with a URL key writes it, so any view stays a shareable link; the opacity, the
 * basemap and the boundaries are chrome and stay in the page's own state. Every option's word
 * is a release label; nothing here prints a number but the opacity slider's own integer.
 */
import { useEffect } from "react";
import { Settings2, X } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { configLabel, configTooltip, gwpLabel, gwpTooltip, monthLabel, periodLabel, viewLabel } from "@/lib/labels";
import { SELECT_CLASS } from "@/components/ui/ControlsCard";
import { LayerSwitch } from "@/components/map/LayerSwitch";
import { BASEMAP_CHOICES, type BasemapChoice } from "@/components/map/basemap";
import { mapsPeriod } from "@/components/map/layerModes";
import { SCALE_MODES, type ScaleMode } from "@/lib/urlState";
import { SCALE_NOTES, SETTINGS } from "./copy";

export type MapSettingsProps = {
  open: boolean;
  onToggle: (open: boolean) => void;
  opacity: number;
  onOpacity: (pct: number) => void;
  basemap: BasemapChoice;
  onBasemap: (choice: BasemapChoice) => void;
  boundaries: boolean;
  onBoundaries: (on: boolean) => void;
};

const GROUP = "pill flex overflow-hidden border border-line bg-surface p-0.5";
const SEGMENT = (on: boolean) => `pill flex-1 py-1 text-xs ${on ? "bg-accent text-on-accent" : "text-muted hover:text-fg"}`;

export function MapSettings({ open, onToggle, opacity, onOpacity, basemap, onBasemap, boundaries, onBoundaries }: MapSettingsProps) {
  const { state, setState, labels, dims, contract } = useExplorer();
  const gwps = contract?.gwp?.length ? contract.gwp : Object.keys(labels.gwp).length ? Object.keys(labels.gwp) : [state.gwp];
  const views = Object.keys(labels.views).length ? Object.keys(labels.views) : [state.view];
  const configs = dims.configurations.length ? dims.configurations : [state.config];
  const months = mapsPeriod(labels, state.period) ? (dims.monthsByPeriod[state.period] ?? []) : [];
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onToggle]);
  return (
    <div className="absolute bottom-5 right-5 z-20 flex flex-col items-end gap-2" data-testid="map-settings">
      {open && (
        <div className="card max-h-[calc(100dvh-140px)] w-[300px] max-w-[calc(100vw-40px)] overflow-y-auto p-4 shadow-lg" role="dialog" aria-label={SETTINGS.title} data-testid="map-settings-panel">
          <div className="mb-3 flex items-center justify-between">
            <div className="micro">{SETTINGS.title}</div>
            <button type="button" aria-label={SETTINGS.close} onClick={() => onToggle(false)} className="pill p-1 text-muted hover:bg-surface-3 hover:text-fg" data-testid="map-settings-close">
              <X size={14} />
            </button>
          </div>
          <div className="flex flex-col gap-3.5">
            <div>
              <div className="micro mb-1.5">{SETTINGS.layer}</div>
              <LayerSwitch compact wrap />
            </div>
            <div>
              <div className="micro mb-1.5">{SETTINGS.scale}</div>
              <div className="flex flex-col gap-1" role="radiogroup" aria-label={SETTINGS.scale} data-testid="scale-select">
                {SCALE_MODES.map((mode: ScaleMode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={state.scale === mode}
                    onClick={() => setState({ scale: mode })}
                    title={SCALE_NOTES[mode].note}
                    className={`rounded-xl border px-2.5 py-1.5 text-left transition-colors ${state.scale === mode ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-3"}`}
                    data-testid={`scale-${mode}`}
                  >
                    <span className={`block text-xs font-semibold ${state.scale === mode ? "text-fg" : "text-muted"}`}>{SCALE_NOTES[mode].label}</span>
                    <span className="block text-micro normal-case tracking-normal text-muted">{SCALE_NOTES[mode].note}</span>
                  </button>
                ))}
              </div>
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
            <div>
              <div className="micro mb-1.5">{SETTINGS.basemap}</div>
              <div className={GROUP} role="tablist" aria-label={SETTINGS.basemap} data-testid="basemap-select">
                {BASEMAP_CHOICES.map((c) => (
                  <button key={c.id} type="button" role="tab" aria-selected={basemap === c.id} onClick={() => onBasemap(c.id)} className={SEGMENT(basemap === c.id)} data-testid={`basemap-${c.id}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted" title={SETTINGS.boundariesNote}>
              <input type="checkbox" checked={boundaries} onChange={(e) => onBoundaries(e.target.checked)} data-testid="boundaries-toggle" /> {SETTINGS.boundaries}
            </label>
            {months.length > 0 && (
              <div>
                <div className="micro mb-1.5">{SETTINGS.month}</div>
                <select className={SELECT_CLASS} value={state.month ?? ""} onChange={(e) => setState({ month: e.target.value || null })} aria-label={SETTINGS.month} title={periodLabel(labels, state.period)} data-testid="month-select">
                  <option value="">{SETTINGS.monthAll}</option>
                  {months.map((m) => (
                    <option key={m} value={m}>{monthLabel(labels, m)}</option>
                  ))}
                </select>
              </div>
            )}
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
              <div className={GROUP} role="tablist" aria-label={SETTINGS.gwp} data-testid="gwp-select">
                {gwps.map((g) => (
                  <button key={g} type="button" role="tab" aria-selected={state.gwp === g} onClick={() => setState({ gwp: g })} title={gwpTooltip(labels, g)} className={SEGMENT(state.gwp === g)}>
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
