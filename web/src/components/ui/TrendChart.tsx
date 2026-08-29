"use client";
/**
 * A framed figure of a timeseries envelope (the explainer's visual): an in-figure title, a
 * subtitle that says what is drawn (the unit as words, the sector scope with the LULUCF
 * status, the year basis), an x-axis carrying every period's short label, the first and last
 * points (and the reference year, in amber) labelled with their `display` strings, a hover
 * tooltip of the cell's display and unit, a faint baseline at zero, and the envelope's
 * ReceiptFooter as the source line (`showReceipt`; a caller may also write the `subtitle`). The `value` of each cell sizes the shape and nothing
 * else: there is no y-axis, no tick numbers, no gridlines (ECharts would invent the values).
 * Nothing is summed, rounded or converted here. A skeleton stands in while the envelope loads.
 */
import { useEffect, useRef } from "react";
import type { Envelope } from "@/lib/envelope";
import { unitWords } from "@/lib/labels";
import { ACCENT, AMBER } from "@/lib/palette";
import { ReceiptFooter } from "./ReceiptFooter";

/** Under this container width the axis shows only the first, the reference and the last year. */
export const THIN_AXIS_BELOW_PX = 420;
const FONT = "var(--font-inter), Inter, system-ui, sans-serif";

export type TrendChartProps = {
  env: Envelope | null | undefined;
  referencePeriod?: string;
  height?: number;
  /** The short label of a period id ("2023–24"); the id itself when absent. */
  periodLabel?: (id: string) => string;
  /** The figure's title ("Pakistan's greenhouse-gas emissions, by year"). */
  title?: string;
  /** The scope phrase of the subtitle ("all sectors"); the request's sector filter when absent. */
  scopeWords?: string;
  /** The year-basis phrase of the subtitle ("years run July–June"); omitted when empty. */
  basisWords?: string;
  /** The whole subtitle, when the caller writes it ("Million tonnes CO₂e (AR5), excluding land use"); else built from the envelope. */
  subtitle?: string;
  /** The ReceiptFooter under the figure (the panels keep it; the intro does not). */
  showReceipt?: boolean;
};

/** "all sectors" unless the envelope's request names sectors, then those ids joined. */
function scopeOf(env: Envelope): string {
  try {
    const req = JSON.parse(env.request) as { sectors?: unknown; query?: { sectors?: unknown } };
    const sectors = (req.query?.sectors ?? req.sectors) as unknown;
    if (Array.isArray(sectors) && sectors.length) return sectors.map(String).join(", ");
  } catch {
    /* the request is shown verbatim elsewhere; the scope falls back to "all sectors" */
  }
  return "all sectors";
}

/** The subtitle: unit as words · scope, LULUCF status · year basis. Every phrase is read from the envelope or the release's labels. */
export function trendSubtitle(env: Envelope, scopeWords?: string, basisWords?: string): string {
  const unit = env.values[0]?.unit ? unitWords(env.values[0].unit) : "";
  const status = env.context.lulucf.status;
  const lulucf = status === "excluded" ? "land use excluded" : status ? `land use ${status}` : "";
  const scope = [scopeWords ?? scopeOf(env), lulucf].filter(Boolean).join(", ");
  return [unit, scope, basisWords].filter(Boolean).join(" · ");
}

export function TrendChart({ env, referencePeriod, height = 160, periodLabel, title = "Pakistan's greenhouse-gas emissions, by year", scopeWords, basisWords, subtitle: given, showReceipt = true }: TrendChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!env || !ref.current) return;
    let disposed = false;
    let chart: import("echarts").ECharts | null = null;
    const el = ref.current;
    const cells = env.values.filter((c) => typeof c.value === "number");
    const ids = cells.map((c) => c.group?.period_id ?? "");
    const short = (id: string) => (periodLabel ? periodLabel(id) : id);
    const unit = cells[0]?.unit ? unitWords(cells[0].unit) : "";
    const last = cells.length - 1;
    const isRef = (i: number) => !!referencePeriod && ids[i] === referencePeriod;
    const labelled = (i: number) => i === 0 || i === last || isRef(i);
    // the axis label rule: every year when the container is wide enough, else the ends and the reference
    const axisInterval = () => (el.clientWidth && el.clientWidth < THIN_AXIS_BELOW_PX ? (i: number) => labelled(i) : 0);
    (async () => {
      const echarts = await import("echarts");
      if (disposed) return;
      chart = echarts.init(el, undefined, { renderer: "svg" });
      chart.setOption({
        animation: false,
        grid: { left: 12, right: 12, top: 28, bottom: 24, containLabel: false },
        xAxis: {
          type: "category",
          data: ids.map(short),
          boundaryGap: false,
          // the baseline at zero: yAxis.min is 0, so the category axis line sits on it
          axisLine: { show: true, lineStyle: { color: "#dfe4ea", width: 1 } },
          axisTick: { show: false },
          axisLabel: { show: true, interval: axisInterval(), color: "#5c6b7a", fontSize: 11, fontFamily: FONT, margin: 8, hideOverlap: true },
        },
        // no labels, ticks or split lines: the only numbers on the figure are the envelope's displays
        yAxis: { type: "value", show: false, min: 0, axisLabel: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
        tooltip: {
          trigger: "item",
          confine: true,
          textStyle: { fontSize: 12, fontFamily: FONT },
          // the cell's own display and unit, never the axis value
          formatter: (p: { dataIndex: number }) => `${short(ids[p.dataIndex])} · ${cells[p.dataIndex].display} ${unit}`.trim(),
        },
        series: [
          {
            type: "line",
            smooth: 0.35,
            symbol: "circle",
            symbolSize: 7,
            lineStyle: { color: ACCENT, width: 2 },
            areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(42,111,151,0.28)" }, { offset: 1, color: "rgba(42,111,151,0.02)" }] } },
            data: cells.map((c, i) => ({
              value: c.value as number,
              itemStyle: { color: isRef(i) ? AMBER : ACCENT, opacity: labelled(i) ? 1 : 0, borderColor: "#fff", borderWidth: 1.5 },
              // the end labels hang inward from their point so neither is clipped at the edge; the reference point's sits above it
              label: labelled(i)
                ? { show: true, position: "top", align: i === 0 ? "left" : i === last ? "right" : "center", offset: [i === 0 ? -4 : i === last ? 4 : 0, -2], formatter: () => c.display, color: isRef(i) ? "#92400e" : "#5c6b7a", fontSize: 11, fontFamily: FONT }
                : { show: false },
            })),
          },
        ],
      });
    })();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            chart?.setOption({ xAxis: { axisLabel: { interval: axisInterval() } } });
            chart?.resize();
          })
        : null;
    ro?.observe(el);
    return () => {
      disposed = true;
      ro?.disconnect();
      chart?.dispose();
    };
  }, [env, referencePeriod, periodLabel]);
  if (!env) {
    return (
      <div data-testid="trend-skeleton" aria-hidden="true">
        <div className="h-4 w-2/3 animate-pulse rounded bg-ink/5" />
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-ink/5" />
        <div className="mt-3 animate-pulse rounded-lg bg-ink/5" style={{ height }} />
      </div>
    );
  }
  const subtitle = given ?? trendSubtitle(env, scopeWords, basisWords);
  return (
    <figure data-testid="trend-figure" className="m-0">
      <figcaption>
        <div className="text-sm font-semibold text-ink" data-testid="trend-title">{title}</div>
        <div className="mt-0.5 text-xs text-muted" data-testid="trend-subtitle">{subtitle}</div>
      </figcaption>
      <div ref={ref} className="mt-2" style={{ height, width: "100%" }} data-testid="trend-chart" role="img" aria-label={`${title}: ${subtitle}`} />
      {showReceipt && <ReceiptFooter env={env} className="mt-1" />}
    </figure>
  );
}
