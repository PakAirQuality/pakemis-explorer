"use client";
/**
 * An ECharts bar chart of an envelope's cells. The bar length uses the envelope's own `value`
 * field (the float the engine returned beside `exact`); every printed label is the `display`
 * string. Nothing is summed, rounded or converted here.
 */
import { useEffect, useRef } from "react";
import { cellLabel, type Envelope } from "@/lib/envelope";

export function BarChart({ env, horizontal = false, height = 320 }: { env: Envelope; horizontal?: boolean; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let chart: import("echarts").ECharts | null = null;
    (async () => {
      const echarts = await import("echarts");
      if (disposed || !ref.current) return;
      chart = echarts.init(ref.current);
      const labels = env.values.map((v) => cellLabel(v));
      const displays = env.values.map((v) => v.display);
      const data = env.values.map((v) => v.value ?? 0);
      const unit = env.values[0]?.unit ?? "";
      const cat = { type: "category" as const, data: labels, axisLabel: { interval: 0, rotate: horizontal ? 0 : 30 } };
      const val = { type: "value" as const, name: unit, axisLabel: { show: false } };
      chart.setOption({
        grid: { left: horizontal ? 140 : 40, right: 24, bottom: horizontal ? 24 : 80, top: 32 },
        xAxis: horizontal ? val : cat,
        yAxis: horizontal ? cat : val,
        tooltip: { trigger: "item", formatter: (p: { dataIndex: number }) => `${labels[p.dataIndex]}: ${displays[p.dataIndex]} ${unit}` },
        series: [
          {
            type: "bar",
            data,
            itemStyle: { color: "#2a6f97" },
            label: { show: true, position: horizontal ? "right" : "top", formatter: (p: { dataIndex: number }) => displays[p.dataIndex] },
          },
        ],
      });
    })();
    const onResize = () => chart?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      chart?.dispose();
    };
  }, [env, horizontal]);
  return <div ref={ref} style={{ width: "100%", height }} />;
}
