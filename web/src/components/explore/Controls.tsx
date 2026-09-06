"use client";
/**
 * The Data page's filter rail (the horizontal control row until 2026-09-06, when the page was
 * recomposed as the workspace's analytical counterpart): one vertical card in the workspace
 * FilterPanel's language — a micro FILTERS header with a « collapse to a 48 px icon rail, then
 * Geography (compact; the header card carries the hero copy of the same control), Period,
 * Sector and, at national grain, the sector's Category, Gas, Measure (CO₂e under either GWP
 * basis · Share of total), then Estimate and Spatial view (the "More" popover dissolved into
 * the rail), the SHOWING summary and Reset filters. Every option's label is a label of the
 * release; an option the state cannot answer is offered disabled with the reason as its title.
 * Each change is one `Action` for lib/explore/query.ts's `transition`; Reset is a push to the
 * bare `/data` path, because the URL is the whole state.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsLeft, ChevronsRight, Factory, MapPin, RotateCcw, Wind } from "lucide-react";
import { Select, type SelectOption } from "@/components/ui/ControlsCard";
import { configLabel, gasLabel, gwpIsDefault, gwpLabel, gwpTooltip, periodShort, sectorLabel, viewLabel, type Dims as GeoDims } from "@/lib/labels";
import type { Labels } from "@/lib/release";
import { placeWords, unavailableReason, type Action, type ExploreContext, type ExploreState } from "@/lib/explore/query";
import { EXPLORE } from "./copy";

export type ControlsProps = {
  state: ExploreState;
  ctx: ExploreContext;
  dispatch: (a: Action) => void;
  labels: Labels;
  dims: GeoDims;
  /** The sector's categories (the category envelope's group values), for the Category select. */
  categories: string[];
  gwps: string[];
  configs: string[];
  views: string[];
  /** Whether the current query partitions a total (Share of total applies). */
  partitions: boolean;
  defaultGwp: string;
};

const W = EXPLORE.controls;
const D = EXPLORE.data;

function Ctl({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1" data-testid={testId}>
      <span className="micro">{label}</span>
      {children}
    </label>
  );
}

/** The district rows of the release, one per drawn shape, by name. */
export function districtOptions(dims: GeoDims): SelectOption[] {
  const seen = new Set<string>();
  const out: SelectOption[] = [];
  for (const r of dims.adm2) {
    if (!r.shape_id || seen.has(r.shape_id) || r.has_polygon !== "yes") continue;
    seen.add(r.shape_id);
    out.push({ value: r.shape_id, label: r.shape_name || r.name });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The geography control, shared by the header card (its hero select) and the rail (its compact
 * one): the value, the options and the change handler over the same `Action`s, plus whether the
 * conditional District and "Compare with…" selects apply. `picking` (a district chosen as an
 * intent before an id exists) is the caller's state, so the two copies stay independent.
 */
export function geographyControl(state: ExploreState, labels: Labels, dims: GeoDims, dispatch: (a: Action) => void, picking: boolean, setPicking: (v: boolean) => void) {
  const provinces = dims.adm1.map((r) => r.name);
  const value = state.level === "national" ? "national" : state.allPlaces ? (state.level === "adm2" ? "districts" : "provinces") : state.level === "adm2" ? "district" : picking ? "district" : `province:${state.geos[0]}`;
  const options: SelectOption[] = [
    { value: "national", label: W.pakistan },
    ...provinces.map((p) => ({ value: `province:${p}`, label: labels.geographies[`ADM1:${p}`] ?? p })),
    { value: "provinces", label: W.provinces },
    { value: "district", label: W.district },
    { value: "districts", label: W.districts },
  ];
  const onChange = (v: string) => {
    setPicking(v === "district" && state.level !== "adm2");
    if (v === "national") dispatch({ control: "geography", value: "national" });
    else if (v === "provinces") dispatch({ control: "geography", value: "provinces" });
    else if (v === "districts") dispatch({ control: "geography", value: "districts" });
    else if (v.startsWith("province:")) dispatch({ control: "geography", value: "province", id: v.slice("province:".length) });
  };
  return {
    value,
    options,
    onChange,
    provinces,
    showDistrict: picking || (state.level === "adm2" && !state.allPlaces),
    showSecond: state.level === "adm1" && !state.allPlaces && state.geos.length >= 1,
  };
}

/** "Pakistan · All sectors · CO₂e · 2023–24": the active view in one line, every part a release label. */
export function summaryLine(state: ExploreState, labels: Labels, dims: GeoDims, defaultGwp: string): string {
  const parts = [placeWords(state, dims), sectorLabel(labels, state.sector), state.gas ? gasLabel(labels, state.gas) : "CO₂e", periodShort(labels, state.period)];
  if (!gwpIsDefault(labels, state.gwp, defaultGwp)) parts.push(gwpLabel(labels, state.gwp));
  return parts.join(" · ");
}

const RAIL_ICON = "flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface-3 hover:text-fg";

export function Controls({ state, ctx, dispatch, labels, dims, categories, gwps, configs, views, partitions, defaultGwp }: ControlsProps) {
  const router = useRouter();
  const [pickingDistrict, setPickingDistrict] = useState(false);
  const [open, setOpen] = useState(true);
  const reason = (by: Parameters<typeof unavailableReason>[2]) => unavailableReason(state, ctx, by, labels) ?? undefined;

  const geo = geographyControl(state, labels, dims, dispatch, pickingDistrict, setPickingDistrict);

  // --- Period
  const periodValue = state.range ? "range" : state.by === "month" ? "months" : state.period;
  const periodOptions: SelectOption[] = [
    ...ctx.periods.map((p) => ({ value: p, label: periodShort(labels, p), title: labels.periods[p]?.label })),
    { value: "range", label: `${W.range} (${periodShort(labels, ctx.periods[0])} to ${periodShort(labels, ctx.periods[ctx.periods.length - 1])})`, disabled: !!reason("period"), title: reason("period") },
    { value: "months", label: `${W.months} ${periodShort(labels, ctx.referencePeriod)}`, disabled: !!unavailableReason({ ...state, period: ctx.referencePeriod }, ctx, "month", labels), title: unavailableReason({ ...state, period: ctx.referencePeriod }, ctx, "month", labels) ?? undefined },
  ];
  const onPeriod = (v: string) => dispatch({ control: "period", value: v === "range" ? "range" : v === "months" ? "months" : { period: v } });

  // --- Sector and category
  const sectorOptions: SelectOption[] = [{ value: "", label: W.allSectors }, ...Object.keys(labels.sectors).map((s) => ({ value: s, label: sectorLabel(labels, s) }))];
  const categoryOptions: SelectOption[] = [{ value: "", label: `${W.wholeSector} ${sectorLabel(labels, state.sector).toLowerCase()}` }, ...categories.map((c) => ({ value: c, label: c }))];

  // --- Gas
  const gasValue = state.by === "gas" && !state.gas ? "by" : state.gas ?? "";
  const gasOptions: SelectOption[] = [{ value: "", label: W.allGases }, { value: "by", label: W.byGas }, ...Object.keys(labels.gases).map((g) => ({ value: g, label: gasLabel(labels, g) }))];

  // --- Measure
  const measureValue = state.share ? "share" : state.gwp;
  const shareReason = partitions ? undefined : "Share of total applies to a breakdown that partitions a total: not to a series or a comparison.";
  const measureOptions: SelectOption[] = [...gwps.map((g) => ({ value: g, label: `${W.co2e} · ${gwpLabel(labels, g)}`, title: gwpTooltip(labels, g) })), { value: "share", label: W.share, disabled: !!shareReason, title: shareReason }];

  // --- Estimate
  const estimateValue = state.by === "estimate" ? "compare" : state.config;
  const estimateOptions: SelectOption[] = [...configs.map((c) => ({ value: c, label: configLabel(labels, c), title: labels.configurations[c]?.tooltip })), { value: "compare", label: W.compare, disabled: !!reason("estimate"), title: reason("estimate") }];

  if (!open) {
    return (
      <aside className="flex w-12 flex-col items-center gap-1 self-start rounded-2xl bg-card p-1.5 shadow-card" data-testid="filter-rail" data-open="0">
        <button type="button" aria-label={D.expand} title={D.expand} onClick={() => setOpen(true)} className={RAIL_ICON} data-testid="filters-expand">
          <ChevronsRight size={16} />
        </button>
        <button type="button" aria-label={W.geography} title={W.geography} onClick={() => setOpen(true)} className={RAIL_ICON}>
          <MapPin size={16} />
        </button>
        <button type="button" aria-label={W.sector} title={W.sector} onClick={() => setOpen(true)} className={RAIL_ICON}>
          <Factory size={16} />
        </button>
        <button type="button" aria-label={W.gas} title={W.gas} onClick={() => setOpen(true)} className={RAIL_ICON}>
          <Wind size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="card flex flex-col gap-4 p-4" data-testid="filter-rail" data-open="1">
      <div className="flex items-center justify-between">
        <div className="micro">{D.filters}</div>
        <button type="button" aria-label={D.collapse} title={D.collapse} onClick={() => setOpen(false)} className="pill p-1 text-muted hover:bg-surface-3 hover:text-fg" data-testid="filters-collapse">
          <ChevronsLeft size={14} />
        </button>
      </div>
      <Ctl label={W.geography}>
        <Select value={geo.value} onChange={geo.onChange} options={geo.options} ariaLabel={W.geography} testId="geography-select" />
      </Ctl>
      <Ctl label={W.period}>
        <Select value={periodValue} onChange={onPeriod} options={periodOptions} ariaLabel={W.period} testId="period-select" />
      </Ctl>
      <Ctl label={W.sector}>
        <Select value={state.sector ?? ""} onChange={(v) => dispatch({ control: "sector", value: v || null })} options={sectorOptions} ariaLabel={W.sector} testId="sector-select" />
      </Ctl>
      {state.sector && state.level === "national" && (
        <Ctl label={W.category}>
          <Select value={state.category ?? ""} onChange={(v) => dispatch({ control: "category", value: v || null })} options={categoryOptions} ariaLabel={W.category} testId="category-select" />
        </Ctl>
      )}
      <Ctl label={W.gas}>
        <Select value={gasValue} onChange={(v) => dispatch({ control: "gas", value: v === "by" ? "by" : v || null })} options={gasOptions} ariaLabel={W.gas} testId="gas-select" />
      </Ctl>
      <Ctl label={W.measure}>
        <Select value={measureValue} onChange={(v) => dispatch({ control: "measure", value: v === "share" ? "share" : { gwp: v } })} options={measureOptions} ariaLabel={W.measure} testId="measure-select" />
      </Ctl>
      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <Ctl label={W.estimate}>
          <Select value={estimateValue} onChange={(v) => dispatch({ control: "estimate", value: v === "compare" ? "compare" : { config: v } })} options={estimateOptions} ariaLabel={W.estimate} testId="config-select" />
        </Ctl>
        <Ctl label={W.view}>
          <Select value={state.view} onChange={(v) => dispatch({ control: "view", value: v })} options={views.map((v) => ({ value: v, label: viewLabel(labels, v) }))} ariaLabel={W.view} testId="view-select" />
        </Ctl>
        <p className="caption">The spatial view applies to province and district results; a national total is the same under every view.</p>
      </div>
      <p className="mt-auto border-t border-line pt-3 text-xs text-muted" data-testid="active-view">
        <span className="micro mr-1.5">{D.showing}</span>
        {summaryLine(state, labels, dims, defaultGwp)}
      </p>
      <button type="button" onClick={() => router.push("/data")} className="flex items-center gap-1.5 self-start text-xs font-semibold text-accent hover:underline" data-testid="reset-filters">
        <RotateCcw size={13} aria-hidden="true" /> {D.reset}
      </button>
    </aside>
  );
}
