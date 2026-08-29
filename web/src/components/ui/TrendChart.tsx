"use client";
/**
 * A restrained area chart of a timeseries envelope (the explainer's visual): the `value` of
 * each cell sizes the shape, only the first and last points are labelled and only with their
 * `display` strings, the reference period is highlighted, no axes or gridlines. Nothing is
 * summed, rounded or converted here. A skeleton stands in while the envelope loads.
 */
import { useEffect, useRef } from "react";
import type { Envelope } from "@/lib/envelope";
import { ACCENT, AMBER } from "@/lib/palette";

export function TrendChart({ env, referencePeriod, height = 160, periodLabel }: { env: Envelope | null | undefined; referencePeriod?: string; height?: number; periodLabel?: (id: string) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!env || !ref.current) return;
    let disposed = false;
    let chart: import("echarts").ECharts | null = null;
    const el = ref.current;
    (async () => {
      const echarts = await import("echarts");
      if (disposed) return;
      chart = echarts.init(el, undefined, { renderer: "svg" });
      const cells = env.values.filter((c) => typeof c.value === "number");
      const last = cells.length - 1;
      chart.setOption({
        animation: false,
        grid: { left: 10, right: 10, top: 30, bottom: 6, containLabel: false },
        xAxis: { type: "category", data: cells.map((c) => c.group?.period_id ?? ""), show: false, boundaryGap: false },
        yAxis: { type: "value", show: false, min: 0 },
        tooltip: { show: false },
        series: [
          {
            type: "line",
            smooth: 0.35,
            symbol: "circle",
            symbolSize: 7,
            lineStyle: { color: ACCENT, width: 2 },
            areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(42,111,151,0.28)" }, { offset: 1, color: "rgba(42,111,151,0.02)" }] } },
            data: cells.map((c, i) => {
              const id = c.group?.period_id ?? "";
              const isRef = !!referencePeriod && id === referencePeriod;
              const edge = i === 0 || i === last;
              return {
                value: c.value as number,
                itemStyle: { color: isRef ? AMBER : ACCENT, opacity: edge || isRef ? 1 : 0, borderColor: "#fff", borderWidth: 1.5 },
                // the end labels hang inward from their point so neither is clipped at the edge
                label: edge ? { show: true, position: "top", align: i === 0 ? "left" : "right", offset: [i === 0 ? -4 : 4, -2], formatter: () => `${periodLabel ? periodLabel(id) : id} · ${c.display}`, color: "#5c6b7a", fontSize: 11, fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" } : { show: false },
              };
            }),
          },
        ],
      });
    })();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => chart?.resize()) : null;
    ro?.observe(el);
    return () => {
      disposed = true;
      ro?.disconnect();
      chart?.dispose();
    };
  }, [env, referencePeriod, periodLabel]);
  if (!env) {
    return (
      <div className="animate-pulse rounded-lg bg-ink/5" style={{ height }} aria-hidden="true" data-testid="trend-skeleton" />
    );
  }
  return <div ref={ref} style={{ height, width: "100%" }} data-testid="trend-chart" role="img" aria-label="The national total across the fiscal years" />;
}
