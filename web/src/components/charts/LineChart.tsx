"use client";
/**
 * A line over a real y-axis (ECharts, SVG): one point per period, the y ticks from the
 * envelope's `axis.ticks_short`, value labels (`display_short`) on the first, the last and the
 * reference point, the area under the line in the accent at 18 %. `value` places the point and
 * prints nothing; `buildLineOption` is pure so the tests can read it.
 */
import { useEffect, useRef } from "react";
import { chartTheme } from "@/lib/theme";
import { axisFromTicks } from "./axis";

export type LinePoint = { id: string; name: string; value: number; label: string; reference?: boolean };

export function buildLineOption(points: LinePoint[], ticks: string[] | null | undefined, t: ReturnType<typeof chartTheme>) {
  const axis = axisFromTicks(ticks);
  const last = points.length - 1;
  const labelled = (i: number) => i === 0 || i === last || !!points[i].reference;
  return {
    animation: false,
    grid: { left: axis ? 44 : 8, right: 24, top: 26, bottom: 24, containLabel: false },
    xAxis: { type: "category" as const, boundaryGap: false, data: points.map((p) => p.name), axisLine: { show: true, lineStyle: { color: t.line } }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: 11, fontFamily: t.font, interval: 0, hideOverlap: true } },
    yAxis: axis
      ? { type: "value" as const, min: axis.min, max: axis.max, interval: axis.interval, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: 11, fontFamily: t.font, formatter: (v: number) => axis.labelFor(v) }, splitLine: { show: true, lineStyle: { color: t.grid, type: "dashed" as const } } }
      : { type: "value" as const, show: false, min: 0, axisLabel: { show: false }, splitLine: { show: false } },
    tooltip: { show: false },
    series: [
      {
        type: "line" as const,
        symbol: "circle",
        symbolSize: 7,
        lineStyle: { color: t.accent, width: 2 },
        itemStyle: { color: t.accent },
        areaStyle: { color: t.accentSoft },
        data: points.map((p, i) => ({
          value: p.value,
          itemStyle: { color: p.reference ? t.accent : t.surface, borderColor: t.accent, borderWidth: 2 },
          // the first label sits to the right of its point so it never overlaps the y-axis ticks
          label: { show: labelled(i), position: "top" as const, offset: i === 0 ? [18, 0] : [0, 0], color: p.reference ? t.accent : t.muted, fontSize: 11, fontFamily: t.font, formatter: () => p.label },
        })),
      },
    ],
  };
}

export function LineChart({ points, ticks, height = 280, testId = "line-chart" }: { points: LinePoint[]; ticks?: string[] | null; height?: number; testId?: string }) {
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
      chart.setOption(buildLineOption(points, ticks, chartTheme()));
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
