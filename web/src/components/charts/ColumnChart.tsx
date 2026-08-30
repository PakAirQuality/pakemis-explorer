"use client";
/**
 * Columns over a real y-axis (ECharts, SVG): one per point (a period), the reference point in
 * the accent and the others on the line-strong grey, dashed gridlines, y ticks from the
 * envelope's `axis.ticks_short`, value labels (`display_short`) on the first, the last and the
 * reference column. `value` sizes the column and prints nothing; `buildColumnOption` is pure.
 */
import { useEffect, useRef } from "react";
import { chartTheme } from "@/lib/theme";
import { axisFromTicks } from "./axis";

export type ColumnPoint = { id: string; name: string; value: number; label: string; reference?: boolean };

export function buildColumnOption(points: ColumnPoint[], ticks: string[] | null | undefined, t: ReturnType<typeof chartTheme>) {
  const axis = axisFromTicks(ticks);
  const last = points.length - 1;
  const labelled = (i: number) => i === 0 || i === last || !!points[i].reference;
  return {
    animation: false,
    grid: { left: axis ? 44 : 8, right: 8, top: 22, bottom: 24, containLabel: false },
    xAxis: { type: "category" as const, data: points.map((p) => p.name), axisLine: { show: true, lineStyle: { color: t.line } }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: 11, fontFamily: t.font, interval: 0, hideOverlap: true } },
    yAxis: axis
      ? { type: "value" as const, min: axis.min, max: axis.max, interval: axis.interval, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: 11, fontFamily: t.font, formatter: (v: number) => axis.labelFor(v) }, splitLine: { show: true, lineStyle: { color: t.grid, type: "dashed" as const } } }
      : { type: "value" as const, show: false, min: 0, axisLabel: { show: false }, splitLine: { show: false } },
    tooltip: { show: false },
    series: [
      {
        type: "bar" as const,
        barCategoryGap: "38%",
        data: points.map((p, i) => ({
          value: p.value,
          itemStyle: { color: p.reference ? t.accent : t.line, borderRadius: [3, 3, 0, 0] },
          label: { show: labelled(i), position: "top" as const, color: p.reference ? t.accent : t.muted, fontSize: 11, fontFamily: t.font, formatter: () => p.label },
        })),
      },
    ],
  };
}

export function ColumnChart({ points, ticks, height = 200, testId = "column-chart" }: { points: ColumnPoint[]; ticks?: string[] | null; height?: number; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !points.length) return;
    let disposed = false;
    let chart: import("echarts").ECharts | null = null;
    (async () => {
      const echarts = await import("echarts");
      if (disposed) return;
      chart = echarts.init(el, undefined, { renderer: "svg" });
      chart.setOption(buildColumnOption(points, ticks, chartTheme()));
    })();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => chart?.resize()) : null;
    ro?.observe(el);
    return () => {
      disposed = true;
      ro?.disconnect();
      chart?.dispose();
    };
  }, [points, ticks]);
  return <div ref={ref} style={{ width: "100%", height }} data-testid={testId} data-ticks={(ticks ?? []).join("|")} role="img" aria-label={points.map((p) => `${p.name} ${p.label}`).join("; ")} />;
}
