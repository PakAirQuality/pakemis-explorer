"use client";
/**
 * A chart the assistant drew in its answer: `<pchart>{spec}</pchart>`, the JSON the server checked
 * (api/pakemis_api/ask/render.py, chart_spec) from the model's ```chart block. Bar (horizontal,
 * stacked), line, area and pie (donut), drawn with ECharts in the site's chart theme. The figures are
 * the model's - taken from the results and the server's add_up / calculate - and are drawn as given:
 * nothing here sums, shares or rescales them. `buildAnswerChartOption` is pure so the tests can read it.
 */
import { useEffect, useMemo, useRef } from "react";
import { chartTheme } from "@/lib/theme";
import { rampByRank } from "@/lib/palette";

export type ChartSpec = {
  type: "bar" | "line" | "area" | "pie";
  title?: string;
  unit?: string;
  labels: string[];
  series: { name: string; values: (number | null)[] }[];
  stacked?: boolean;
  horizontal?: boolean;
  donut?: boolean;
};

const TYPES = ["bar", "line", "area", "pie"];

/** The checked spec out of a `<pchart>` tag's (unescaped) text, or null when it is not one. */
export function parseChartSpec(text: string): ChartSpec | null {
  try {
    const raw = JSON.parse(text) as Partial<ChartSpec>;
    if (!raw || !TYPES.includes(raw.type as string) || !Array.isArray(raw.labels) || !Array.isArray(raw.series) || raw.series.length === 0) return null;
    const n = raw.labels.length;
    if (!raw.series.every((s) => s && Array.isArray(s.values) && s.values.length === n)) return null;
    return raw as ChartSpec;
  } catch {
    return null;
  }
}

/** 18434072 -> "18,434,072"; 0.275 -> "0.275": the figure as written, grouped for reading. */
export function grouped(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return v.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** An axis tick, short: 18,434,072 -> "18.4M". */
function compact(v: number): string {
  return Number.isFinite(v) ? v.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 }) : "";
}

function seriesColor(i: number, count: number, accent: string): string {
  return count === 1 ? accent : rampByRank(i, count);
}

export function buildAnswerChartOption(spec: ChartSpec, t: ReturnType<typeof chartTheme>) {
  const unit = spec.unit ? ` ${spec.unit}` : "";
  const text = { color: t.muted, fontSize: 11, fontFamily: t.font };
  const tooltipBase = { backgroundColor: t.surface, borderColor: t.line, textStyle: { fontSize: 12, color: t.fg, fontFamily: t.font } };
  const multi = spec.series.length > 1;
  const legend = { show: multi || spec.type === "pie", bottom: 0, type: "scroll" as const, textStyle: text, itemWidth: 12, itemHeight: 8 };
  if (spec.type === "pie") {
    const s = spec.series[0];
    return {
      animation: false,
      legend,
      tooltip: { ...tooltipBase, trigger: "item" as const, formatter: (p: { name: string; value: number }) => `${p.name}<br/><b>${grouped(p.value)}</b>${unit}` },
      series: [{
        type: "pie" as const,
        radius: spec.donut ? ["42%", "68%"] : "68%",
        center: ["50%", "45%"],
        label: { ...text, formatter: "{b}" },
        data: spec.labels.map((name, i) => ({ name, value: s.values[i], itemStyle: { color: rampByRank(i, spec.labels.length) } })),
      }],
    };
  }
  const horizontal = spec.type === "bar" && !!spec.horizontal;
  const category = {
    type: "category" as const,
    data: spec.labels,
    boundaryGap: spec.type === "bar",
    axisTick: { show: false },
    axisLine: { lineStyle: { color: t.line } },
    axisLabel: { ...text, interval: horizontal ? 0 : ("auto" as const), hideOverlap: true, width: horizontal ? 110 : undefined, overflow: "truncate" as const },
  };
  const value = {
    type: "value" as const,
    axisLabel: { ...text, formatter: (v: number) => compact(v) },
    splitLine: { lineStyle: { color: t.grid, type: "dashed" as const } },
  };
  return {
    animation: false,
    legend,
    grid: { left: 8, right: 16, top: 12, bottom: multi ? 40 : 8, containLabel: true },
    xAxis: horizontal ? value : category,
    yAxis: horizontal ? { ...category, inverse: true } : value,
    tooltip: {
      ...tooltipBase,
      trigger: "axis" as const,
      formatter: (ps: { axisValueLabel: string; seriesName: string; value: number | null; color: string }[]) =>
        [ps[0]?.axisValueLabel ?? ""].concat(ps.map((p) => `${multi ? `${p.seriesName}: ` : ""}<b>${grouped(p.value)}</b>${unit}`)).join("<br/>"),
    },
    series: spec.series.map((s, i) => {
      const color = seriesColor(i, spec.series.length, t.accent);
      const common = { name: s.name, data: s.values, itemStyle: { color } };
      if (spec.type === "bar") {
        return { ...common, type: "bar" as const, barMaxWidth: 22, stack: spec.stacked ? "all" : undefined,
                 itemStyle: { color, borderRadius: spec.stacked ? 0 : horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] } };
      }
      return { ...common, type: "line" as const, symbol: "circle", symbolSize: 5, connectNulls: false,
               lineStyle: { color, width: 2 },
               stack: spec.type === "area" && spec.stacked ? "all" : undefined,
               areaStyle: spec.type === "area" ? { color, opacity: spec.stacked ? 0.55 : 0.18 } : undefined };
    }),
  };
}

function heightOf(spec: ChartSpec): number {
  if (spec.type === "bar" && spec.horizontal) return Math.max(200, spec.labels.length * 24 + (spec.series.length > 1 ? 70 : 40));
  return spec.type === "pie" ? 260 : 240;
}

/**
 * Keyed on the spec's JSON TEXT, not a parsed object: the answer is re-rendered on every streamed
 * line, and an object parsed afresh each time would tear the chart down and draw it again.
 */
export function AnswerChart({ json }: { json: string }) {
  const spec = useMemo(() => parseChartSpec(json), [json]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !spec) return;
    let disposed = false;
    let chart: import("echarts").ECharts | null = null;
    (async () => {
      const echarts = await import("echarts");
      if (disposed) return;
      chart = echarts.init(el, undefined, { renderer: "svg" });
      chart.setOption(buildAnswerChartOption(spec, chartTheme()));
    })();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => chart?.resize()) : null;
    ro?.observe(el);
    return () => {
      disposed = true;
      ro?.disconnect();
      chart?.dispose();
    };
  }, [spec]);
  if (!spec) return null;
  const label = [spec.title, ...spec.labels.map((l, i) => `${l}: ${spec.series.map((s) => grouped(s.values[i])).join(", ")}`)].filter(Boolean).join("; ");
  return (
    <figure className="my-1" data-testid="answer-chart" data-type={spec.type}>
      {(spec.title || spec.unit) && (
        <figcaption className="mb-1 text-xs font-semibold text-muted">
          {spec.title}
          {spec.unit && <span className="font-normal">{spec.title ? " · " : ""}{spec.unit}</span>}
        </figcaption>
      )}
      <div ref={ref} style={{ width: "100%", height: heightOf(spec) }} role="img" aria-label={label} />
    </figure>
  );
}
