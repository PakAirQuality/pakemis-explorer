"use client";
/** Compare: two periods (under the state's configuration) or two configurations for one period; the difference is the API's. */
import { useState } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import { compareBody } from "@/lib/requests";
import { useCompare } from "@/lib/queries";
import { configLabel, periodShort } from "@/lib/labels";
import { Frame } from "@/components/ui/Frame";
import { BarChart } from "@/components/ui/BarChart";

const SEL = "w-full rounded border border-line bg-white px-2 py-1 text-xs";

export function ComparePanel() {
  const { state, labels, dims } = useExplorer();
  const [mode, setMode] = useState<"periods" | "configurations">("periods");
  const [diff, setDiff] = useState<"absolute" | "relative">("absolute");
  const [left, setLeft] = useState(dims.fiscalPeriods[0] ?? state.period);
  const [rightCfg, setRightCfg] = useState(dims.configurations.find((c) => c !== state.config) ?? state.config);
  const periods = mode === "periods" ? compareBody(state, { periods: [left], configuration_id: state.config, group_by: ["sector_id"] }, { periods: [state.period], configuration_id: state.config, group_by: ["sector_id"] }, diff) : compareBody(state, { periods: [state.period], configuration_id: state.config, group_by: ["sector_id"] }, { periods: [state.period], configuration_id: rightCfg, group_by: ["sector_id"] }, diff);
  const totals = mode === "periods" ? compareBody(state, { periods: [left], configuration_id: state.config }, { periods: [state.period], configuration_id: state.config }, diff) : compareBody(state, { periods: [state.period], configuration_id: state.config }, { periods: [state.period], configuration_id: rightCfg }, diff);
  const bySector = useCompare(periods);
  const total = useCompare(totals);
  const title = mode === "periods" ? `${periodShort(labels, state.period)} minus ${periodShort(labels, left)}` : `${configLabel(labels, rightCfg)} minus ${configLabel(labels, state.config)}`;
  return (
    <div className="space-y-3 p-3" data-testid="compare-panel">
      <div className="pill flex overflow-hidden border border-line bg-white p-0.5">
        <button onClick={() => setMode("periods")} className={`pill flex-1 py-1 text-xs ${mode === "periods" ? "bg-ink text-white" : "text-muted"}`}>Two periods</button>
        <button onClick={() => setMode("configurations")} className={`pill flex-1 py-1 text-xs ${mode === "configurations" ? "bg-ink text-white" : "text-muted"}`}>Two configurations</button>
      </div>
      {mode === "periods" ? (
        <label className="block">
          <div className="micro mb-1">Left period (right = the rail&apos;s {periodShort(labels, state.period)})</div>
          <select className={SEL} value={left} onChange={(e) => setLeft(e.target.value)}>
            {dims.fiscalPeriods.map((p) => <option key={p} value={p}>{periodShort(labels, p)}</option>)}
          </select>
        </label>
      ) : (
        <label className="block">
          <div className="micro mb-1">Right configuration (left = {configLabel(labels, state.config)})</div>
          <select className={SEL} value={rightCfg} onChange={(e) => setRightCfg(e.target.value)}>
            {dims.configurations.map((c) => <option key={c} value={c}>{configLabel(labels, c)}</option>)}
          </select>
        </label>
      )}
      <label className="block">
        <div className="micro mb-1">Mode</div>
        <select className={SEL} value={diff} onChange={(e) => setDiff(e.target.value as "absolute" | "relative")}>
          <option value="absolute">absolute (right minus left)</option>
          <option value="relative">relative (percent of left)</option>
        </select>
      </label>
      <Frame title={`${title}, total`} scope={state.gwp} env={total.data} error={total.error} isLoading={total.isLoading} labels={labels} dims={dims} />
      <Frame title={`${title}, by sector`} scope={state.gwp} env={bySector.data} error={bySector.error} isLoading={bySector.isLoading} labels={labels} dims={dims}>
        {bySector.data && <BarChart env={bySector.data} horizontal height={Math.max(200, bySector.data.values.length * 24)} labels={labels} dims={dims} />}
      </Frame>
    </div>
  );
}
