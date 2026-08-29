"use client";
/** The controls: level, period, month, configuration, GWP, sector, gas, view, raster. Every list comes from the dims / labels / openapi contract; every select shows the raw id as secondary text. */
import { useExplorer } from "@/components/ExplorerContext";
import { configLabel, gasLabel, monthLabel, periodBasisNote, periodLabel, periodShort, sectorLabel, viewLabel } from "@/lib/labels";
import type { Level } from "@/lib/urlState";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="micro mb-1">{label}</div>
      {children}
      {hint && <div className="mono mt-0.5 text-micro normal-case tracking-normal text-muted/80">{hint}</div>}
    </label>
  );
}
const SEL = "w-full rounded border border-line bg-white px-2 py-1.5 text-sm";

export function ExplorePanel() {
  const { state, setState, labels, dims, contract } = useExplorer();
  const months = dims.monthsByPeriod[state.period] ?? [];
  const gwps = contract?.gwp?.length ? contract.gwp : [state.gwp];
  const views = Object.keys(labels.views).length ? Object.keys(labels.views) : [state.view];
  const configs = dims.configurations.length ? dims.configurations : [state.config];
  return (
    <div className="space-y-4 p-4" data-testid="explore-panel">
      <Field label="Level">
        <div className="pill flex overflow-hidden border border-line bg-white p-0.5">
          {(["adm1", "adm2", "grid"] as Level[]).map((l) => (
            <button key={l} onClick={() => setState({ level: l })} className={`pill flex-1 py-1 text-xs ${state.level === l ? "bg-ink text-white" : "text-muted"}`}>{l === "adm1" ? "Provinces" : l === "adm2" ? "Districts" : "Grid"}</button>
          ))}
        </div>
      </Field>
      <Field label="Fiscal year" hint={periodLabel(labels, state.period)}>
        <select className={SEL} value={state.period} onChange={(e) => setState({ period: e.target.value })} title={periodBasisNote(labels, state.period)}>
          {dims.fiscalPeriods.map((p) => (
            <option key={p} value={p}>{periodShort(labels, p)}{labels.periods[p]?.is_reference ? "" : " · national only"}</option>
          ))}
        </select>
      </Field>
      <Field label="Month" hint={state.month ?? "annual"}>
        <select className={SEL} value={state.month ?? ""} onChange={(e) => setState({ month: e.target.value || null })}>
          <option value="">Annual</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(labels, m)}</option>)}
        </select>
      </Field>
      <Field label="Configuration" hint={state.config}>
        <select className={SEL} value={state.config} onChange={(e) => setState({ config: e.target.value })}>
          {configs.map((c) => <option key={c} value={c}>{configLabel(labels, c)}</option>)}
        </select>
        {labels.configurations[state.config]?.note && <p className="mt-1 text-xs text-muted">{labels.configurations[state.config].note}</p>}
      </Field>
      <Field label="GWP basis" hint={state.gwp}>
        <div className="pill flex overflow-hidden border border-line bg-white p-0.5">
          {gwps.map((g) => <button key={g} onClick={() => setState({ gwp: g })} className={`pill flex-1 py-1 text-xs ${state.gwp === g ? "bg-ink text-white" : "text-muted"}`}>{g}</button>)}
        </div>
        {labels.limitations.ar6_adm2_ne && <p className="mt-1 text-xs text-muted">{labels.limitations.ar6_adm2_ne}</p>}
      </Field>
      <Field label="Sector" hint={state.sector ?? "all"}>
        <select className={SEL} value={state.sector ?? ""} onChange={(e) => setState({ sector: e.target.value || null })}>
          <option value="">All sectors</option>
          {dims.sectors.map((s) => <option key={s} value={s}>{sectorLabel(labels, s)}</option>)}
        </select>
      </Field>
      <Field label="Gas" hint={state.gas ?? "all"}>
        <select className={SEL} value={state.gas ?? ""} onChange={(e) => setState({ gas: e.target.value || null })}>
          {state.level !== "grid" && <option value="">All gases (CO₂e)</option>}
          {dims.gases.map((g) => <option key={g} value={g}>{gasLabel(labels, g)}</option>)}
        </select>
      </Field>
      <Field label="Spatial view" hint={state.view}>
        <select className={SEL} value={state.view} onChange={(e) => setState({ view: e.target.value })}>
          {views.map((v) => <option key={v} value={v}>{viewLabel(labels, v)}</option>)}
        </select>
      </Field>
      <Field label="Layers">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={state.raster} onChange={(e) => setState({ raster: e.target.checked })} /> Grid raster (visual only; values via get_grid_cell)
        </label>
      </Field>
    </div>
  );
}
