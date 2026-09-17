"use client";
/**
 * An ECharts bar chart of an envelope's cells. Bar length = the envelope's own `value` (the
 * float the engine returned beside `exact`); every printed label is the `display` string.
 * The PAQI ramp by rank (the cell's order in the envelope) when `colorBy` is "sector"; a
 * diagonal decal on bounded cells. Nothing is summed, rounded or converted here, and a rank
 * picks a colour and prints nothing.
 */
import { useEffect, useRef } from "react";
import { cellLabel, type Cell, type Envelope, shown } from "@/lib/envelope";
import { rampByRank } from "@/lib/palette";
import { chartTheme } from "@/lib/theme";
import { cellUnit, groupValueLabel, type Dims } from "@/lib/labels";
import type { Labels } from "@/lib/release";
import { isBounded } from "./IntervalBadge";

export type BarChartProps = {
  env: Envelope;
  horizontal?: boolean;
  height?: number;
  labels?: Labels;
  dims?: Dims;
  colorBy?: "sector" | "accent";
  onClick?: (cell: Cell, index: number) => void;
  selectedIndex?: number | null;
  compact?: boolean;
};

export function BarChart({ env, horizontal = false, height = 220, labels, dims, colorBy = "sector", onClick, selectedIndex = null, compact = false }: BarChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  useEffect(() => {
    let disposed = false;
    let chart: import("echarts").ECharts | null = null;
    (async () => {
      const echarts = await import("echarts");
      if (disposed || !ref.current) return;
      chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
      const t = chartTheme(); // the theme's colours, read from the CSS variables at render
      const names = env.values.map((v) => {
        const g = v.group ?? ((v as Record<string, unknown>).left as { group?: Record<string, string | null> } | undefined)?.group ?? {};
        const keys = Object.keys(g);
        if (labels && dims && keys.length) return keys.map((k) => groupValueLabel(labels, dims, k, g[k])).join(" · ");
        return cellLabel(v);
      });
      const displays = env.values.map((v) => shown(v));
      const unit = cellUnit(env.values[0]);
      const data = env.values.map((v, i) => {
        const value = typeof v.value === "number" ? v.value : 0;
        const color = colorBy === "sector" ? rampByRank(i, env.values.length) : t.accent;
        const bounded = isBounded(v);
        const dim = selectedIndex !== null && selectedIndex !== i;
        return {
          value,
          itemStyle: {
            color: bounded ? { type: "pattern" as const, image: hatchCanvas(color, t.surface), repeat: "repeat" as const } : color,
            opacity: dim ? 0.35 : 1,
            borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0],
          },
        };
      });
      const cat = { type: "category" as const, data: names, axisLabel: { interval: 0, rotate: horizontal ? 0 : 35, fontSize: 11, color: t.muted, fontFamily: t.font, width: horizontal ? 96 : undefined, overflow: "truncate" as const }, axisTick: { show: false }, axisLine: { lineStyle: { color: t.line } } };
      const val = { type: "value" as const, axisLabel: { show: false }, splitLine: { lineStyle: { color: t.grid, type: "dashed" } } };
      chart.setOption({
        animation: false,
        grid: { left: horizontal ? 104 : 8, right: horizontal ? 64 : 8, bottom: horizontal ? 8 : compact ? 24 : 56, top: compact ? 8 : 16, containLabel: !horizontal },
        xAxis: horizontal ? val : cat,
        yAxis: horizontal ? { ...cat, inverse: true } : val,
        tooltip: { trigger: "item", formatter: (p: { dataIndex: number }) => `${names[p.dataIndex]}<br/><b>${displays[p.dataIndex]}</b> ${unit}`, backgroundColor: t.surface, borderColor: t.line, textStyle: { fontSize: 12, color: t.fg, fontFamily: t.font } },
        series: [
          {
            type: "bar",
            data,
            barMaxWidth: 22,
            label: { show: !compact, position: horizontal ? "right" : "top", fontSize: 11, color: t.fg, fontFamily: t.font, formatter: (p: { dataIndex: number }) => displays[p.dataIndex] },
            cursor: clickRef.current ? "pointer" : "default",
          },
        ],
      });
      chart.on("click", (p: { dataIndex: number }) => clickRef.current?.(env.values[p.dataIndex], p.dataIndex));
    })();
    const onResize = () => chart?.resize();
    window.addEventListener("resize", onResize);
    const ro = typeof ResizeObserver !== "undefined" && ref.current ? new ResizeObserver(() => chart?.resize()) : null;
    if (ro && ref.current) ro.observe(ref.current);
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
      chart?.dispose();
    };
  }, [env, horizontal, labels, dims, colorBy, selectedIndex, compact]);
  return <div ref={ref} style={{ width: "100%", height }} data-testid="bar-chart" />;
}

/** The same 8x8 diagonal hatch the map uses, on the sector colour, stroked in the surface colour. */
function hatchCanvas(color: string, stroke: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 8, 8);
    ctx.strokeStyle = stroke;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-2, 6);
    ctx.lineTo(6, -2);
    ctx.moveTo(2, 10);
    ctx.lineTo(10, 2);
    ctx.stroke();
  }
  return c;
}
