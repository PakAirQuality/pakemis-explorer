"use client";
/** Compare: S vs L for FY2023-24, and two fiscal periods under L; the difference is the API's. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ChartFrame } from "@/components/ChartFrame";
import { BarChart } from "@/components/BarChart";
import { Status } from "@/components/Status";
import { useRelease } from "@/components/ContextBar";

export default function Compare() {
  const release = useRelease();
  const periods = ((release.data?.dims.dim_period?.values as { period_id: string; basis: string }[] | undefined) ?? []).filter((p) => p.basis === "fiscal").map((p) => p.period_id);
  const [left, setLeft] = useState("FY2015-16");
  const [right, setRight] = useState("FY2023-24");
  const [mode, setMode] = useState<"absolute" | "relative">("absolute");
  const sVsL = useQuery({
    queryKey: ["cmp-s-l"],
    queryFn: () => api.compare({ left: { periods: ["FY2023-24"], configuration_id: "REF_2023_24" }, right: { periods: ["FY2023-24"], configuration_id: "S_2023_24" }, mode: "absolute" }),
  });
  const sVsLSectors = useQuery({
    queryKey: ["cmp-s-l-sectors"],
    queryFn: () =>
      api.compare({
        left: { periods: ["FY2023-24"], configuration_id: "REF_2023_24", group_by: ["sector_id"] },
        right: { periods: ["FY2023-24"], configuration_id: "S_2023_24", group_by: ["sector_id"] },
        mode: "absolute",
      }),
  });
  const twoPeriods = useQuery({
    queryKey: ["cmp-periods", left, right, mode],
    queryFn: () => api.compare({ left: { periods: [left], group_by: ["sector_id"] }, right: { periods: [right], group_by: ["sector_id"] }, mode }),
  });
  const series = useQuery({ queryKey: ["cmp-series"], queryFn: () => api.timeseries({ query: {}, step: "annual" }) });
  return (
    <>
      <h1>Compare</h1>
      <h2>Configuration S against L, FY2023-24</h2>
      {sVsL.data ? (
        <p>
          National total, S minus L: <strong className="num">{sVsL.data.values[0].display}</strong> {sVsL.data.values[0].unit} (formula: <span className="mono">{sVsL.data.values[0].formula}</span>; receipt <span className="mono">{sVsL.data.receipt}</span>)
        </p>
      ) : (
        <Status isLoading={sVsL.isLoading} error={sVsL.error} what="S vs L" />
      )}
      {sVsLSectors.data ? (
        <ChartFrame title="S minus L by sector (only residential differs by construction)" env={sVsLSectors.data}>
          <BarChart env={sVsLSectors.data} horizontal />
        </ChartFrame>
      ) : (
        <Status isLoading={sVsLSectors.isLoading} error={sVsLSectors.error} what="S vs L by sector" />
      )}
      <h2>Two periods under L</h2>
      <div className="controls">
        <label>
          left
          <select value={left} onChange={(e) => setLeft(e.target.value)}>
            {(periods.length ? periods : [left]).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          right
          <select value={right} onChange={(e) => setRight(e.target.value)}>
            {(periods.length ? periods : [right]).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          mode
          <select value={mode} onChange={(e) => setMode(e.target.value as "absolute" | "relative")}>
            <option value="absolute">absolute (right minus left)</option>
            <option value="relative">relative (percent of left)</option>
          </select>
        </label>
      </div>
      {twoPeriods.data ? (
        <ChartFrame title={`${right} minus ${left}, by sector (${mode})`} env={twoPeriods.data}>
          <BarChart env={twoPeriods.data} horizontal />
        </ChartFrame>
      ) : (
        <Status isLoading={twoPeriods.isLoading} error={twoPeriods.error} what="the two periods" />
      )}
      {series.data ? (
        <ChartFrame title="National total by fiscal year, configuration L, AR5" env={series.data}>
          <BarChart env={series.data} />
        </ChartFrame>
      ) : (
        <Status isLoading={series.isLoading} error={series.error} what="the series" />
      )}
    </>
  );
}
