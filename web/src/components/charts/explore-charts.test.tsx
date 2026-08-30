import "@testing-library/jest-dom/vitest";
/**
 * The Explore canvas' two new charts invent no number: the line's y-axis labels only the
 * server's ticks and its point labels only the points' labels; the grouped bars print only the
 * strings they were given (the two estimates' display_short and the difference cell's).
 */
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildLineOption } from "./LineChart";
import { GroupedBars } from "./GroupedBars";
import { FALLBACK } from "@/lib/theme";

const T = { surface: FALLBACK["--color-card"], fg: FALLBACK["--color-fg"], muted: FALLBACK["--color-muted"], line: FALLBACK["--color-line-strong"], grid: FALLBACK["--color-line"], accent: FALLBACK["--color-accent"], accentSoft: "rgba(31, 122, 92, 0.18)", accentBright: FALLBACK["--color-accent-bright"], amber: FALLBACK["--color-amber"], amberSoft: FALLBACK["--color-amber-soft"], font: "Inter" };
const TICKS = ["0", "100", "200", "300", "400", "500"];

function decimals(el: HTMLElement): string[] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(...((n.textContent ?? "").match(/\d+(?:\.\d+)?/g) ?? []));
  return out;
}

describe("LineChart", () => {
  const points = [
    { id: "FY2015-16", name: "2015–16", value: 372.39677601, label: "372.40" },
    { id: "FY2019-20", name: "2019–20", value: 421.1, label: "421.10" },
    { id: "FY2023-24", name: "2023–24", value: 452.34662438, label: "452.35", reference: true },
  ];
  it("labels the y-axis with the server's ticks only and the points with their own labels, first, last and reference", () => {
    const o = buildLineOption(points, TICKS, T);
    const y = o.yAxis as { min: number; max: number; interval: number; axisLabel: { formatter: (v: number) => string } };
    expect([y.min, y.max, y.interval]).toEqual([0, 500, 100]);
    const probe = [0, 50, 100, 372.39677601, 400, 452.34662438, 500, 600];
    expect(probe.map((v) => y.axisLabel.formatter(v)).filter(Boolean)).toEqual(["0", "100", "400", "500"]);
    expect((o.xAxis as { data: string[] }).data).toEqual(["2015–16", "2019–20", "2023–24"]);
    const data = o.series[0].data as { label: { show: boolean; formatter: () => string } }[];
    expect(data.map((d) => d.label.show)).toEqual([true, false, true]);
    expect(data.map((d) => d.label.formatter())).toEqual(["372.40", "421.10", "452.35"]);
  });
  it("draws no axis without ticks", () => {
    const o = buildLineOption(points, undefined, T);
    expect((o.yAxis as { show?: boolean }).show).toBe(false);
  });
});

describe("GroupedBars", () => {
  it("prints only the strings it was given: both estimates' labels and the difference", () => {
    const rows = [
      { id: "agriculture", name: "Agriculture", left: { value: 223.45447, label: "223.45" }, right: { value: 223.45447, label: "223.45" }, difference: "0.00" },
      { id: "residential", name: "Residential", left: { value: 29.46705, label: "29.47" }, right: { value: 41.92617, label: "41.93" }, difference: "+12.46" },
    ];
    const { container } = render(<GroupedBars rows={rows} leftName="Reference estimate" rightName="Survey-based estimate" unit="Mt CO₂e" />);
    const el = container.firstElementChild as HTMLElement;
    expect(within(el).getAllByTestId("grouped-row")).toHaveLength(2);
    expect(within(el).getAllByTestId("grouped-difference").map((d) => d.textContent)).toEqual(["0.00", "+12.46"]);
    expect(new Set(decimals(el))).toEqual(new Set(["223.45", "0.00", "29.47", "41.93", "12.46"]));
    expect(el).toHaveTextContent("Difference = survey-based estimate − reference estimate, Mt CO₂e");
    const widths = Array.from(el.querySelectorAll("span[aria-hidden]")).map((s) => (s as HTMLElement).style.width).filter(Boolean);
    expect(widths[0]).toBe("100%");
    expect(widths[2]).not.toBe("100%");
  });
});
