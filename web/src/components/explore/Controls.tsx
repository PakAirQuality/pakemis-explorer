"use client";
/**
 * The Explore control row, one line that wraps: Geography (Pakistan · a province · Compare
 * provinces · a district · All districts, with a "Compare with…" second province beside a
 * chosen one), Period (a year · All years · the reference year's months), Sector and, at
 * national grain, the sector's Category, Gas (All · By gas · one gas), Measure (CO₂e under
 * either GWP basis · Share of total) and More (Estimate: reference · survey-based · Compare
 * estimates; Spatial view). Every option's label is a label of the release; an option the
 * state cannot answer is offered disabled with the reason as its title. Each change is one
 * `Action` for lib/explore/query.ts's `transition`.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Select, type SelectOption } from "@/components/ui/ControlsCard";
import { configLabel, gasLabel, gwpLabel, gwpTooltip, periodShort, sectorLabel, viewLabel, type Dims as GeoDims } from "@/lib/labels";
import type { Labels } from "@/lib/release";
import { unavailableReason, type Action, type ExploreContext, type ExploreState } from "@/lib/explore/query";
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
};

const W = EXPLORE.controls;

function Ctl({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <label className="flex min-w-[9rem] flex-col gap-1" data-testid={testId}>
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

export function Controls({ state, ctx, dispatch, labels, dims, categories, gwps, configs, views, partitions }: ControlsProps) {
  const [pickingDistrict, setPickingDistrict] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const provinces = dims.adm1.map((r) => r.name);
  const districts = districtOptions(dims);
  const reason = (by: Parameters<typeof unavailableReason>[2]) => unavailableReason(state, ctx, by, labels) ?? undefined;

  // --- Geography
  const geoValue = state.level === "national" ? "national" : state.allPlaces ? (state.level === "adm2" ? "districts" : "provinces") : state.level === "adm2" ? "district" : pickingDistrict ? "district" : `province:${state.geos[0]}`;
  const geoOptions: SelectOption[] = [
    { value: "national", label: W.pakistan },
    ...provinces.map((p) => ({ value: `province:${p}`, label: labels.geographies[`ADM1:${p}`] ?? p })),
    { value: "provinces", label: W.provinces },
    { value: "district", label: W.district },
    { value: "districts", label: W.districts },
  ];
  const onGeo = (v: string) => {
    setPickingDistrict(v === "district" && state.level !== "adm2");
    if (v === "national") dispatch({ control: "geography", value: "national" });
    else if (v === "provinces") dispatch({ control: "geography", value: "provinces" });
    else if (v === "districts") dispatch({ control: "geography", value: "districts" });
    else if (v.startsWith("province:")) dispatch({ control: "geography", value: "province", id: v.slice("province:".length) });
  };
  const showDistrict = pickingDistrict || (state.level === "adm2" && !state.allPlaces);
  const showSecond = state.level === "adm1" && !state.allPlaces && state.geos.length >= 1;

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

  // --- Estimate (More)
  const estimateValue = state.by === "estimate" ? "compare" : state.config;
  const estimateOptions: SelectOption[] = [...configs.map((c) => ({ value: c, label: configLabel(labels, c), title: labels.configurations[c]?.tooltip })), { value: "compare", label: W.compare, disabled: !!reason("estimate"), title: reason("estimate") }];

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3" data-testid="controls">
      <Ctl label={W.geography}>
        <Select value={geoValue} onChange={onGeo} options={geoOptions} ariaLabel={W.geography} testId="geography-select" />
      </Ctl>
      {showDistrict && (
        <Ctl label="District">
          <Select value={state.level === "adm2" ? state.geos[0] ?? "" : ""} onChange={(v) => v && dispatch({ control: "geography", value: "district", id: v })} options={[{ value: "", label: "Choose a district", disabled: true }, ...districts]} ariaLabel="District" testId="district-select" />
        </Ctl>
      )}
      {showSecond && (
        <Ctl label={W.second}>
          <Select value={state.geos[1] ?? ""} onChange={(v) => dispatch({ control: "geography", value: "second", id: v || null })} options={[{ value: "", label: W.none }, ...provinces.filter((p) => p !== state.geos[0]).map((p) => ({ value: p, label: labels.geographies[`ADM1:${p}`] ?? p }))]} ariaLabel={W.second} testId="second-select" />
        </Ctl>
      )}
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
      <div className="relative" ref={moreRef}>
        <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} className="pill inline-flex items-center gap-1.5 border border-line-strong px-3 py-2 text-sm font-semibold text-fg hover:bg-surface-3" data-testid="more-settings">
          <SlidersHorizontal size={14} aria-hidden="true" /> {W.more} <ChevronDown size={13} aria-hidden="true" />
        </button>
        {moreOpen && (
          <div className="card absolute right-0 z-30 mt-2 flex w-72 flex-col gap-3 p-4" role="dialog" aria-label={W.more} data-testid="more-settings-body">
            <Ctl label={W.estimate}>
              <Select value={estimateValue} onChange={(v) => dispatch({ control: "estimate", value: v === "compare" ? "compare" : { config: v } })} options={estimateOptions} ariaLabel={W.estimate} testId="config-select" />
            </Ctl>
            <Ctl label={W.view}>
              <Select value={state.view} onChange={(v) => dispatch({ control: "view", value: v })} options={views.map((v) => ({ value: v, label: viewLabel(labels, v) }))} ariaLabel={W.view} testId="view-select" />
            </Ctl>
            <p className="caption">The spatial view applies to province and district results; a national total is the same under every view.</p>
          </div>
        )}
      </div>
    </div>
  );
}
