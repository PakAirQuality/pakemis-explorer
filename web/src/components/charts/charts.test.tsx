import "@testing-library/jest-dom/vitest";
/**
 * The briefing's charts invent no number: an axis from the server's ticks labels a position
 * with a tick's own string or with nothing; the ECharts option builders' label formatters
 * answer only the items' labels; the HTML figures (IntervalBar, StackedBar) carry only the
 * strings they were given.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axisFromTicks, fraction } from "./axis";
import { buildBarsOption } from "./BarsWithAxis";
import { buildColumnOption } from "./ColumnChart";
import { IntervalBar } from "./IntervalBar";
import { StackedBar } from "./StackedBar";
import { FALLBACK } from "@/lib/theme";
import { GAS_HUES, rampByRank } from "@/lib/palette";

const T = { surface: FALLBACK["--color-card"], fg: FALLBACK["--color-fg"], muted: FALLBACK["--color-muted"], line: FALLBACK["--color-line-strong"], grid: FALLBACK["--color-line"], accent: FALLBACK["--color-accent"], accentSoft: "rgba(94, 26, 42, 0.18)", accentBright: FALLBACK["--color-accent-bright"], amber: FALLBACK["--color-amber"], amberSoft: FALLBACK["--color-amber-soft"], font: "Inter" };
const TICKS = ["0", "50", "100", "150", "200", "250"];

function decimals(el: HTMLElement): string[] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(...((n.textContent ?? "").match(/\d+(?:\.\d+)?/g) ?? []));
  return out;
}

describe("axisFromTicks", () => {
  it("labels a tick position with the tick's own string and any other position with nothing", () => {
    const a = axisFromTicks(TICKS)!;
    expect([a.min, a.max, a.interval]).toEqual([0, 250, 50]);
    expect(TICKS.map((t) => a.labelFor(Number(t)))).toEqual(TICKS);
    expect([25, 37.5, 223.45, 260, -1].map((v) => a.labelFor(v))).toEqual(["", "", "", "", ""]);
    expect(axisFromTicks(["0", "0.25", "0.5"])!.labelFor(0.25)).toBe("0.25");
    expect(fraction(a, 125)).toBe(0.5);
    expect(fraction(a, 400)).toBe(1);
  });
  it("draws no axis from fewer than two ticks, a non-numeric tick or a flat range", () => {
    expect(axisFromTicks(["0"])).toBeNull();
    expect(axisFromTicks(["0", "x"])).toBeNull();
    expect(axisFromTicks(["5", "5"])).toBeNull();
    expect(axisFromTicks(undefined)).toBeNull();
  });
});

describe("ECharts option builders", () => {
  const items = [
    // the bars are the PAQI ramp by rank: darkest first, in the order the envelope returned
    { id: "agriculture", name: "Agriculture", value: 223.45447, label: "223.45 · 49.4 %", color: rampByRank(0, 2) },
    { id: "power", name: "Power", value: 63.36998, label: "63.37 · 14.0 %", color: rampByRank(1, 2) },
  ];
  it("BarsWithAxis: the x-axis labels only the server's ticks, the bar labels only the items' labels", () => {
    const o = buildBarsOption(items, TICKS, T);
    const x = o.xAxis as { min: number; max: number; interval: number; axisLabel: { formatter: (v: number) => string } };
    expect([x.min, x.max, x.interval]).toEqual([0, 250, 50]);
    const probe = [0, 12.5, 50, 63.36998, 100, 150, 200, 223.45447, 250, 300];
    for (const v of probe) expect(TICKS.includes(x.axisLabel.formatter(v)) || x.axisLabel.formatter(v) === "", String(v)).toBe(true);
    expect(probe.map((v) => x.axisLabel.formatter(v)).filter(Boolean)).toEqual(TICKS);
    const label = o.series[0].label.formatter;
    expect(items.map((_, i) => label({ dataIndex: i }))).toEqual(items.map((i) => i.label));
    expect(label({ dataIndex: 9 })).toBe("");
    expect((o.yAxis as { data: string[] }).data).toEqual(["Agriculture", "Power"]);
    expect(o.series[0].data.map((d) => d.value)).toEqual(items.map((i) => i.value));
  });
  it("BarsWithAxis without ticks shows no axis at all", () => {
    const o = buildBarsOption(items, undefined, T);
    expect((o.xAxis as { show?: boolean }).show).toBe(false);
  });
  it("ColumnChart: the y-axis labels only the ticks; the first, the last and the reference column carry their display_short", () => {
    const points = [
      { id: "FY2015-16", name: "2015–16", value: 372.39678, label: "372.40" },
      { id: "FY2016-17", name: "2016–17", value: 394.31564, label: "394.32" },
      { id: "FY2023-24", name: "2023–24", value: 452.34662, label: "452.35", reference: true },
    ];
    const ticks = ["0", "100", "200", "300", "400", "500"];
    const o = buildColumnOption(points, ticks, T);
    const y = o.yAxis as { min: number; max: number; interval: number; axisLabel: { formatter: (v: number) => string } };
    expect([y.min, y.max, y.interval]).toEqual([0, 500, 100]);
    expect([0, 100, 250, 372.39678, 500, 600].map((v) => y.axisLabel.formatter(v))).toEqual(["0", "100", "", "", "500", ""]);
    expect(o.series[0].data.map((d) => d.label.show)).toEqual([true, false, true]);
    expect(o.series[0].data.map((d) => d.label.formatter())).toEqual(["372.40", "394.32", "452.35"]);
    expect(o.series[0].data[2].itemStyle.color).toBe(T.accent);
    expect(o.series[0].data[0].itemStyle.color).toBe(T.line);
  });
});

describe("HTML figures", () => {
  it("IntervalBar prints only the rows' strings, the marker's and the ticks", () => {
    const rows = [
      { id: "cross_sector", label: "factors shared across modules", low: "407.28", high: "533.73", lowValue: 407.28, highValue: 533.73, median: "456.91", medianValue: 456.91, headline: true },
      { id: "within_sector", label: "factors shared within a module", low: "407.42", high: "533.41", lowValue: 407.42, highValue: 533.41, median: "456.94", medianValue: 456.94 },
    ];
    const ticks = ["0", "200", "400", "600"];
    const { container } = render(<IntervalBar rows={rows} ticks={ticks} marker={{ label: "reference estimate", display: "452.35", value: 452.34662 }} unit="Mt CO₂e" />);
    const allowed = new Set(["407.28", "533.73", "456.91", "407.42", "533.41", "456.94", "452.35", ...ticks]);
    const found = decimals(container);
    expect(found.length).toBeGreaterThan(8);
    for (const d of found) expect(allowed.has(d), d).toBe(true);
    expect(container.querySelectorAll("[data-testid=interval-row]").length).toBe(2);
  });
  it("IntervalBar draws nothing without ticks", () => {
    const { container } = render(<IntervalBar rows={[]} ticks={undefined} />);
    expect(container.innerHTML).toBe("");
  });
  it("StackedBar prints only the segments' labels and shares", () => {
    const segments = [
      { id: "CH4", name: "CH₄", value: 248.7475, label: "248.75", share: "55.0", color: GAS_HUES.CH4 },
      { id: "CO2", name: "CO₂", value: 161.4564, label: "161.46", share: "35.7", color: GAS_HUES.CO2 },
      { id: "N2O", name: "N₂O", value: 42.1427, label: "42.14", share: "9.3", color: GAS_HUES.N2O },
    ];
    const { container } = render(<StackedBar segments={segments} unit="Mt" />);
    const allowed = new Set(["248.75", "55.0", "161.46", "35.7", "42.14", "9.3"]);
    const found = decimals(container).filter((d) => d.includes("."));
    expect(found.length).toBeGreaterThan(5);
    for (const d of found) expect(allowed.has(d), d).toBe(true);
    expect(container.textContent).not.toContain("452");
  });
});
