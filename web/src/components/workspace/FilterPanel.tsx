"use client";
/**
 * The workspace's filter panel (it succeeded map/FilterPanel.tsx on 2026-08-30): the four
 * controls that drive both the deck and the map, floating top-right over the map —
 * **Provinces | Districts** (writes `level`), **Sector**, **Gas / metric** and the **Year**
 * slider (YearSlider.tsx) — then the active view in one line and **Reset filters**. `«`
 * collapses it to a 48 px rail whose icons re-open it. Everything else that used to live here
 * — the estimate, the warming potentials, the spatial view, the layer switch, the opacity and
 * the grid raster — moved into Map settings (MapSettings.tsx). Under 1280 px, where the workspace shows one pane at a
 * time, the panel is a full-height sheet opened from the Filters button of whichever pane is on
 * screen.
 *
 * Every list comes from the release's dims and every word from its labels; every choice is
 * written to the URL, so any view is a shareable link. Nothing here prints a number.
 */
import { ChevronsLeft, ChevronsRight, Factory, MapPin, RotateCcw, Wind, X } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import type { Level } from "@/lib/urlState";
import { districtName, gasLabel, gwpIsDefault, gwpLabel, periodShort, sectorLabel } from "@/lib/labels";
import { POLLUTANTS, POLLUTANT_LABELS } from "@/lib/explore/query";
import { SELECT_CLASS } from "@/components/ui/ControlsCard";
import { SEGMENT_GROUP_CLASS, segmentClass } from "./PaneSwitch";
import { YearSlider } from "./YearSlider";
import { FILTERS } from "./copy";

export const FILTER_WIDTH = 340;
export const RAIL_WIDTH = 48;
/** The panel's inset from the map's right edge, and the gap it keeps from the map's own chrome. */
export const FILTER_INSET_PX = 20;
export const FILTER_GAP_PX = 16;

const SEGMENTS: { id: Extract<Level, "adm1" | "adm2">; label: string }[] = [
  { id: "adm1", label: FILTERS.provinces },
  { id: "adm2", label: FILTERS.districts },
];

/** "Pakistan · All sectors · CO₂e · 2023–24": the active view in one line, every part a release label. */
export function summaryLine(
  labels: Parameters<typeof sectorLabel>[0],
  state: { sector: string | null; gas: string | null; pol?: string | null; period: string; gwp: string },
  place: string,
  defaultGwp: string,
): string {
  const metric = state.pol ? `${POLLUTANT_LABELS[state.pol] ?? state.pol} (air beta, kt)` : state.gas ? gasLabel(labels, state.gas) : "CO₂e";
  const parts = [place, sectorLabel(labels, state.sector), metric, state.pol ? "the 2024 layer" : periodShort(labels, state.period)];
  if (!state.pol && !gwpIsDefault(labels, state.gwp, defaultGwp)) parts.push(gwpLabel(labels, state.gwp));
  return parts.join(" · ");
}

export type FilterPanelProps = {
  open: boolean;
  onToggle: (open: boolean) => void;
  /** The place the deck is scoped to, as the release names it. */
  place: string;
  /** Under 1280 px the panel is a sheet rather than a floating card. */
  mobile?: boolean;
  /** Reset filters also hands the camera back: the workspace passes its fit-the-country here. */
  onResetView?: () => void;
};

export function FilterPanel({ open, onToggle, place, mobile = false, onResetView }: FilterPanelProps) {
  const { state, setState, labels, dims, defaults } = useExplorer();
  const districts = districtOptions(dims);
  const reset = () => {
    setState({ level: "adm1", geo: null, cell: null, sector: null, gas: null, pol: null, period: defaults.period_id, month: null });
    onResetView?.();
  };
  const controls = (
    <div className="flex flex-col gap-4">
      <div>
        <div className="micro mb-1.5">{FILTERS.level}</div>
        <div className={SEGMENT_GROUP_CLASS} role="tablist" aria-label={FILTERS.level}>
          {SEGMENTS.map((sgm) => (
            <button
              key={sgm.id}
              type="button"
              role="tab"
              aria-selected={state.level === sgm.id}
              onClick={() => setState({ level: sgm.id })}
              className={`${segmentClass(state.level === sgm.id)} flex-1`}
              data-testid={`level-${sgm.id}`}
            >
              {sgm.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="micro mb-1.5">{FILTERS.sector}</div>
        <select className={SELECT_CLASS} value={state.sector ?? ""} onChange={(e) => setState({ sector: e.target.value || null })} aria-label={FILTERS.sector} data-testid="sector-select">
          <option value="">{sectorLabel(labels, null)}</option>
          {dims.sectors.map((s) => (
            <option key={s} value={s}>{sectorLabel(labels, s)}</option>
          ))}
        </select>
      </div>
      <div>
        <div className="micro mb-1.5">{FILTERS.gas}</div>
        <select
          className={SELECT_CLASS}
          value={state.pol ? `pol:${state.pol}` : state.gas ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("pol:")) setState({ pol: v.slice(4), gas: null, month: null, period: defaults.period_id });
            else setState({ gas: v || null, pol: null });
          }}
          aria-label={FILTERS.gas}
          data-testid="gas-select"
        >
          <option value="">All gases (CO₂e)</option>
          {dims.gases.map((g) => (
            <option key={g} value={g}>{gasLabel(labels, g)}</option>
          ))}
          <option value="sep" disabled>— Air pollutants (beta) —</option>
          {POLLUTANTS.map((pl) => (
            <option key={pl} value={`pol:${pl}`}>{POLLUTANT_LABELS[pl] ?? pl}</option>
          ))}
        </select>
      </div>
      {state.pol ? (
        <div data-testid="air-year-note">
          <div className="micro mb-1.5">Year</div>
          <p className="text-xs text-muted">Single-year layer (calendar 2024; power and aviation on the 2023–24 fiscal year). The slider returns with the CO₂e metric.</p>
        </div>
      ) : (
        <YearSlider />
      )}
      {state.level === "adm2" && districts.length > 0 && (
        <div>
          <div className="micro mb-1.5">{FILTERS.districts}</div>
          <select className={SELECT_CLASS} value={state.geo ?? ""} onChange={(e) => setState({ geo: e.target.value || null })} aria-label={FILTERS.districts} data-testid="district-select">
            <option value="">Pakistan · every district</option>
            {districts.map(([province, list]) => (
              <optgroup key={province} label={province}>
                {list.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
      <p className="border-t border-line pt-3 text-xs text-muted" data-testid="active-view">
        <span className="micro mr-1.5">{FILTERS.showing}</span>
        {summaryLine(labels, state, place, defaults.gwp_basis)}
      </p>
      <button type="button" onClick={reset} className="flex items-center gap-1.5 self-start text-xs font-semibold text-accent hover:underline" data-testid="reset-filters">
        <RotateCcw size={13} aria-hidden="true" /> {FILTERS.reset}
      </button>
    </div>
  );

  if (mobile) {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-[55] flex flex-col bg-card" data-testid="filter-panel" data-open="1">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="micro">{FILTERS.title}</div>
          <button type="button" aria-label="Close the filters" onClick={() => onToggle(false)} className="pill p-1 text-muted hover:bg-surface-3 hover:text-fg" data-testid="filters-close">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{controls}</div>
      </div>
    );
  }

  if (!open) {
    return (
      <aside className="absolute right-5 top-5 z-20 flex flex-col items-center gap-1 rounded-2xl bg-card p-1.5 shadow-lg" style={{ width: RAIL_WIDTH }} data-testid="filter-panel" data-open="0">
        <button type="button" aria-label={FILTERS.expand} title={FILTERS.expand} onClick={() => onToggle(true)} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg" data-testid="filters-expand">
          <ChevronsRight size={16} />
        </button>
        <button type="button" aria-label={FILTERS.level} title={FILTERS.level} onClick={() => onToggle(true)} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg" data-testid="rail-level">
          <MapPin size={16} />
        </button>
        <button type="button" aria-label={FILTERS.sector} title={FILTERS.sector} onClick={() => onToggle(true)} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg" data-testid="rail-sector">
          <Factory size={16} />
        </button>
        <button type="button" aria-label={FILTERS.gas} title={FILTERS.gas} onClick={() => onToggle(true)} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg" data-testid="rail-gas">
          <Wind size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="card absolute right-5 top-5 z-20 max-h-[calc(100dvh-40px)] w-[340px] overflow-y-auto p-4 shadow-lg" data-testid="filter-panel" data-open="1">
      <div className="mb-3 flex items-center justify-between">
        <div className="micro">{FILTERS.title}</div>
        <button type="button" aria-label={FILTERS.collapse} title={FILTERS.collapse} onClick={() => onToggle(false)} className="pill p-1 text-muted hover:bg-surface-3 hover:text-fg" data-testid="filters-collapse">
          <ChevronsLeft size={14} />
        </button>
      </div>
      {controls}
    </aside>
  );
}

/** The districts of the release's dims, grouped by their province and named by their shape. */
function districtOptions(dims: ReturnType<typeof useExplorer>["dims"]): [string, { id: string; name: string }[]][] {
  const byProvince = new Map<string, { id: string; name: string }[]>();
  const seen = new Set<string>();
  for (const r of dims.adm2) {
    if (!r.shape_id || seen.has(r.shape_id)) continue;
    seen.add(r.shape_id);
    const p = r.parent_id.replace(/^ADM1:/, "");
    const list = byProvince.get(p) ?? [];
    list.push({ id: r.shape_id, name: districtName(dims, r.shape_id) });
    byProvince.set(p, list);
  }
  return Array.from(byProvince.entries()).map(([p, list]) => [p, list.sort((a, b) => a.name.localeCompare(b.name))]);
}
