"use client";
/**
 * The Map page's left filter panel: Geography (level and place), Period, Sector, Gas,
 * Estimate (configuration and warming potentials) and Spatial view, every list from the
 * release's dims and labels, every choice written to the URL. Collapses to a rail of icons;
 * an icon re-opens the panel at that section. Under 768 px the panel is a sheet opened from
 * the toolbar. Nothing here prints a number.
 */
import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronsLeft, ChevronsRight, Eye, Factory, MapPin, SlidersHorizontal, Wind, X } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import type { Level } from "@/lib/urlState";
import { configLabel, configTooltip, districtName, gasLabel, gwpLabel, gwpTooltip, periodBasisNote, periodLabel, periodShort, sectorLabel, viewLabel } from "@/lib/labels";
import { SELECT_CLASS } from "@/components/ui/ControlsCard";

export const FILTER_WIDTH = 300;
export const RAIL_WIDTH = 48;
const LEVEL_LABELS: Record<Level, string> = { adm1: "Provinces", adm2: "Districts", grid: "Grid" };

type SectionId = "geography" | "period" | "sector" | "gas" | "estimate" | "view";
const SECTIONS: { id: SectionId; label: string; icon: typeof MapPin }[] = [
  { id: "geography", label: "Geography", icon: MapPin },
  { id: "period", label: "Period", icon: Calendar },
  { id: "sector", label: "Sector", icon: Factory },
  { id: "gas", label: "Gas", icon: Wind },
  { id: "estimate", label: "Estimate", icon: SlidersHorizontal },
  { id: "view", label: "Spatial view", icon: Eye },
];

export function FilterPanel({ open, onToggle, mobile = false }: { open: boolean; onToggle: (open: boolean) => void; mobile?: boolean }) {
  const [focus, setFocus] = useState<SectionId | null>(null);
  const refs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});
  useEffect(() => {
    if (open && focus) {
      refs.current[focus]?.scrollIntoView?.({ block: "start", behavior: "smooth" });
      setFocus(null);
    }
  }, [open, focus]);
  const openAt = (id: SectionId) => {
    setFocus(id);
    onToggle(true);
  };
  if (mobile) {
    if (!open) return null;
    return (
      <div className="glass fixed inset-x-0 bottom-0 top-14 z-[55] flex flex-col rounded-t-xl" data-testid="filter-panel">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="micro">Filters</div>
          <button aria-label="Close the filters" onClick={() => onToggle(false)} className="pill p-1 text-muted hover:bg-surface-3 hover:text-fg"><X size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto"><Sections refs={refs} /></div>
      </div>
    );
  }
  return (
    <aside className="relative z-30 flex h-full shrink-0 border-r border-gray-200/50 bg-white/90 backdrop-blur shadow-md transition-[width] duration-250 ease-out" style={{ width: open ? FILTER_WIDTH : RAIL_WIDTH }} data-testid="filter-panel" data-open={open ? "1" : "0"}>
      {open ? (
        <div className="flex h-full min-w-0 flex-1 flex-col" style={{ width: FILTER_WIDTH }}>
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <div className="micro">Filters</div>
            <button aria-label="Collapse the filters" title="Collapse to icons" onClick={() => onToggle(false)} className="pill p-1 text-muted hover:bg-surface-3 hover:text-fg" data-testid="filters-collapse"><ChevronsLeft size={14} /></button>
          </div>
          <div className="flex-1 overflow-y-auto"><Sections refs={refs} /></div>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center gap-1 py-2" data-testid="filter-rail">
          <button aria-label="Expand the filters" title="Show the filters" onClick={() => onToggle(true)} className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-fg" data-testid="filters-expand"><ChevronsRight size={16} /></button>
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" aria-label={s.label} title={s.label} onClick={() => openAt(s.id)} className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-3 hover:text-fg" data-testid={`rail-${s.id}`}>
              <s.icon size={16} />
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

function Section({ id, title, children, refs }: { id: SectionId; title: string; children: React.ReactNode; refs: React.MutableRefObject<Partial<Record<SectionId, HTMLElement | null>>> }) {
  return (
    <section ref={(el) => { refs.current[id] = el; }} className="border-b border-line px-4 py-3" data-testid={`filter-${id}`}>
      <div className="micro mb-1.5">{title}</div>
      {children}
    </section>
  );
}

function Sections({ refs }: { refs: React.MutableRefObject<Partial<Record<SectionId, HTMLElement | null>>> }) {
  const { state, setState, labels, dims, contract } = useExplorer();
  const gwps = contract?.gwp?.length ? contract.gwp : Object.keys(labels.gwp).length ? Object.keys(labels.gwp) : [state.gwp];
  const views = Object.keys(labels.views).length ? Object.keys(labels.views) : [state.view];
  const configs = dims.configurations.length ? dims.configurations : [state.config];
  const provinces = dims.adm1.map((r) => r.name);
  const districtsByProvince = new Map<string, { id: string; name: string }[]>();
  const seenShape = new Set<string>();
  for (const r of dims.adm2) {
    if (!r.shape_id || seenShape.has(r.shape_id)) continue;
    seenShape.add(r.shape_id);
    const p = r.parent_id.replace(/^ADM1:/, "");
    const list = districtsByProvince.get(p) ?? [];
    list.push({ id: r.shape_id, name: districtName(dims, r.shape_id) });
    districtsByProvince.set(p, list);
  }
  const placeValue = state.level === "grid" ? "" : (state.geo ?? "");
  return (
    <div>
      <Section id="geography" title="Geography" refs={refs}>
        <div className="pill flex overflow-hidden border border-line bg-surface p-0.5" role="tablist" aria-label="Level">
          {(Object.keys(LEVEL_LABELS) as Level[]).map((l) => (
            <button key={l} role="tab" aria-selected={state.level === l} onClick={() => setState({ level: l })} className={`pill flex-1 py-1 text-xs font-medium transition-colors ${state.level === l ? "bg-fg text-card" : "text-muted hover:text-fg"}`} data-testid={`level-${l}`}>
              {LEVEL_LABELS[l]}
            </button>
          ))}
        </div>
        {state.level !== "grid" && (
          <select className={`${SELECT_CLASS} mt-2`} value={placeValue} onChange={(e) => setState({ geo: e.target.value || null })} aria-label="Place" data-testid="place-select">
            <option value="">Pakistan · every {state.level === "adm1" ? "province" : "district"}</option>
            {state.level === "adm1"
              ? provinces.map((p) => <option key={p} value={p}>{p}</option>)
              : Array.from(districtsByProvince.entries()).map(([p, list]) => (
                  <optgroup key={p} label={p}>
                    {list.sort((a, b) => a.name.localeCompare(b.name)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </optgroup>
                ))}
          </select>
        )}
        {state.level === "grid" && <p className="mt-2 text-xs text-muted">Click a grid cell to read it from the cube ({labels.limitations.grid_not_tabular ?? "the raster is visual only"}).</p>}
      </Section>
      <Section id="period" title="Period" refs={refs}>
        <select className={SELECT_CLASS} value={state.period} onChange={(e) => setState({ period: e.target.value })} title={periodBasisNote(labels, state.period)} aria-label="Period" data-testid="period-select">
          {dims.fiscalPeriods.map((p) => (
            <option key={p} value={p} title={periodLabel(labels, p)}>{periodShort(labels, p)}{labels.periods[p]?.is_reference ? "" : " · national only"}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted" title={periodBasisNote(labels, state.period)}>{periodLabel(labels, state.period)}</p>
      </Section>
      <Section id="sector" title="Sector" refs={refs}>
        <select className={SELECT_CLASS} value={state.sector ?? ""} onChange={(e) => setState({ sector: e.target.value || null })} aria-label="Sector" data-testid="sector-select">
          <option value="">{sectorLabel(labels, null)}</option>
          {dims.sectors.map((s) => <option key={s} value={s}>{sectorLabel(labels, s)}</option>)}
        </select>
      </Section>
      <Section id="gas" title="Gas" refs={refs}>
        <select className={SELECT_CLASS} value={state.gas ?? ""} onChange={(e) => setState({ gas: e.target.value || null })} aria-label="Gas" data-testid="gas-select">
          {state.level !== "grid" && <option value="">All gases (CO₂e)</option>}
          {dims.gases.map((g) => <option key={g} value={g}>{gasLabel(labels, g)}</option>)}
        </select>
      </Section>
      <Section id="estimate" title="Estimate" refs={refs}>
        <select className={SELECT_CLASS} value={state.config} onChange={(e) => setState({ config: e.target.value })} title={configTooltip(labels, state.config)} aria-label="Estimate" data-testid="config-select">
          {configs.map((c) => <option key={c} value={c} title={configTooltip(labels, c)}>{configLabel(labels, c)}</option>)}
        </select>
        <div className="micro mb-1 mt-3">Warming potentials</div>
        <div className="pill flex overflow-hidden border border-line bg-surface p-0.5" data-testid="gwp-select" role="tablist" aria-label="Warming potentials">
          {gwps.map((g) => <button key={g} role="tab" aria-selected={state.gwp === g} onClick={() => setState({ gwp: g })} title={gwpTooltip(labels, g)} className={`pill flex-1 py-1 text-xs ${state.gwp === g ? "bg-fg text-card" : "text-muted hover:text-fg"}`}>{gwpLabel(labels, g)}</button>)}
        </div>
        {state.level === "adm2" && labels.limitations.ar6_adm2_ne && <p className="mt-1 text-xs text-muted">{labels.limitations.ar6_adm2_ne}</p>}
      </Section>
      <Section id="view" title="Spatial view" refs={refs}>
        <select className={SELECT_CLASS} value={state.view} onChange={(e) => setState({ view: e.target.value })} aria-label="Spatial view" data-testid="view-select">
          {views.map((v) => <option key={v} value={v}>{viewLabel(labels, v)}</option>)}
        </select>
        <label className="mt-3 flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={state.raster} onChange={(e) => setState({ raster: e.target.checked })} /> Grid raster (visual only)
        </label>
      </Section>
    </div>
  );
}
