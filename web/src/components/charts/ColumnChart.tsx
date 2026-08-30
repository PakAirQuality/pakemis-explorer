"use client";
/**
 * Columns over a real y-axis (ECharts, SVG): one per point (a period). The columns carry the
 * PAQI ramp — saffron at the series' smallest, red at its largest, oxblood on the reference
 * point — so a rising series reads as a warming one; the colour is a visual encoding of the
 * server's own values, never a number of its own. Hairline gridlines from the envelope's
 * `axis.ticks_short`, value labels (`display_short`) on the first, the last and the reference
 * column. `value` sizes the column and prints nothing; `buildColumnOption` is pure.
 */
import { useEffect, useRef } from "react";
import { chartTheme } from "@/lib/theme";
import { RAMP } from "@/lib/palette";
import { axisFromTicks } from "./axis";

export type ColumnPoint = { id: string; name: string; value: number; label: string; reference?: boolean };

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const pair = (a: string, b: string, t: number) => {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  const at = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(ar + (br - ar) * at)}, ${Math.round(ag + (bg - ag) * at)}, ${Math.round(ab + (bb - ab) * at)})`;
};

/**
 * A column's fill: the ramp's saffron at the series' smallest value, its red at the largest.
 * Equal values (a flat series) take the middle, so nothing implies a difference that is not
 * there. A visual encoding only.
 */
export function columnColor(value: number, min: number, max: number): string {
  return pair(RAMP[1], RAMP[3], max > min ? (value - min) / (max - min) : 0.5);
}

export function buildColumnOption(points: ColumnPoint[], ticks: string[] | null | undefined, t: ReturnType<typeof chartTheme>) {
  const axis = axisFromTicks(ticks);
  const last = points.length - 1;
  const labelled = (i: number) => i === 0 || i === last || !!points[i].reference;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    animation: false,
    grid: { left: axis ? 40 : 8, right: 10, top: 26, bottom: 24, containLabel: false },
    xAxis: { type: "category" as const, data: points.map((p) => p.name), axisLine: { show: true, lineStyle: { color: t.line } }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: 11, fontFamily: t.font, interval: 0, hideOverlap: true } },
    yAxis: axis
      ? { type: "value" as const, min: axis.min, max: axis.max, interval: axis.interval, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: 11, fontFamily: t.font, formatter: (v: number) => axis.labelFor(v) }, splitLine: { show: true, lineStyle: { color: t.line, width: 1, opacity: 0.7 } } }
      : { type: "value" as const, show: false, min: 0, axisLabel: { show: false }, splitLine: { show: false } },
    tooltip: { show: false },
    series: [
      {
        type: "bar" as const,
        barCategoryGap: "26%",
        data: points.map((p, i) => ({
          value: p.value,
          itemStyle: { color: p.reference ? t.accent : columnColor(p.value, min, max), borderRadius: [5, 5, 0, 0] },
          emphasis: { itemStyle: { color: p.reference ? t.accentBright : columnColor(p.value, min, max), shadowBlur: 6, shadowColor: "rgba(0,0,0,0.18)" } },
          label: { show: labelled(i), position: "top" as const, distance: 5, color: p.reference ? t.accent : t.muted, fontSize: 11, fontWeight: p.reference ? ("bold" as const) : ("normal" as const), fontFamily: t.font, formatter: () => p.label },
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
