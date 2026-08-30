"use client";
/**
 * Horizontal bars with a real x-axis (ECharts, SVG). Each item is the caller's: its name, its
 * colour, its `value` (the envelope's float, which sizes the bar and nothing else) and the
 * label printed at its end (server strings: "223.45 · 49.4 %"). The axis ticks are the
 * envelope's `axis.ticks_short`; without them the chart draws no axis. Dashed gridlines on
 * the line token, axis text muted. Hover and click report the item's id. Nothing is summed,
 * rounded or converted here; `buildBarsOption` is pure so the tests can read it.
 */
import { useEffect, useRef } from "react";
import { chartTheme } from "@/lib/theme";
import { axisFromTicks } from "./axis";

export type BarItem = { id: string; name: string; value: number; label: string; color: string; dim?: boolean };

export const ROW_HEIGHT = 26;

export function buildBarsOption(items: BarItem[], ticks: string[] | null | undefined, t: ReturnType<typeof chartTheme>) {
  const axis = axisFromTicks(ticks);
  return {
    animation: false,
    grid: { left: 140, right: 110, top: 4, bottom: axis ? 22 : 6, containLabel: false },
    xAxis: axis
      ? { type: "value" as const, min: axis.min, max: axis.max, interval: axis.interval, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.muted, fontSize: 11, fontFamily: t.font, formatter: (v: number) => axis.labelFor(v) }, splitLine: { show: true, lineStyle: { color: t.grid, type: "dashed" as const } } }
      : { type: "value" as const, show: false, min: 0, axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: { type: "category" as const, inverse: true, data: items.map((i) => i.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.fg, fontSize: 12, fontFamily: t.font, width: 132, overflow: "truncate" as const } },
    tooltip: { show: false },
    series: [
      {
        type: "bar" as const,
        barCategoryGap: "32%",
        data: items.map((i) => ({ value: i.value, itemStyle: { color: i.color, opacity: i.dim ? 0.3 : 1, borderRadius: [0, 3, 3, 0] } })),
        label: { show: true, position: "right" as const, color: t.fg, fontSize: 11, fontFamily: t.font, formatter: (p: { dataIndex: number }) => items[p.dataIndex]?.label ?? "" },
        cursor: "pointer",
      },
    ],
  };
}

export function BarsWithAxis({ items, ticks, onHover, onSelect, testId = "bars-with-axis" }: { items: BarItem[]; ticks?: string[] | null; onHover?: (id: string | null) => void; onSelect?: (id: string) => void; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const height = items.length * ROW_HEIGHT + (ticks ? 28 : 10);
  useEffect(() => {
    const el = ref.current;
    if (!el || !items.length) return;
    let disposed = false;
    let chart: import("echarts").ECharts | null = null;
    (async () => {
      const echarts = await import("echarts");
      if (disposed) return;
      chart = echarts.init(el, undefined, { renderer: "svg" });
      chart.setOption(buildBarsOption(items, ticks, chartTheme()));
      chart.on("mouseover", (p: { dataIndex: number }) => hoverRef.current?.(items[p.dataIndex]?.id ?? null));
      chart.on("mouseout", () => hoverRef.current?.(null));
      chart.on("click", (p: { dataIndex: number }) => items[p.dataIndex] && selectRef.current?.(items[p.dataIndex].id));
    })();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => chart?.resize()) : null;
    ro?.observe(el);
    return () => {
      disposed = true;
      ro?.disconnect();
      chart?.dispose();
    };
  }, [items, ticks]);
  return <div ref={ref} style={{ width: "100%", height }} data-testid={testId} data-ticks={(ticks ?? []).join("|")} role="img" aria-label={items.map((i) => `${i.name} ${i.label}`).join("; ")} />;
}
