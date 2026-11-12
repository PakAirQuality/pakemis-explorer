/**
 * Charts in an answer: the server's checked `<pchart>` tag drawn as a figure of its own, in the type
 * the model chose, its figures drawn exactly as given (nothing summed, shared or rescaled here), and
 * a tag that does not parse drawing nothing rather than JSON.
 */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildAnswerChartOption, grouped, parseChartSpec, type ChartSpec } from "./AnswerChart";
import { renderAnswer, type CiteHandlers } from "./answerText";

const handlers: CiteHandlers = { hover: vi.fn(), click: vi.fn() };
const T = { surface: "#fff", fg: "#111", muted: "#666", line: "#ccc", grid: "#eee", accent: "#5e1a2a", accentSoft: "rgba(0,0,0,.1)",
            accentBright: "#7a2436", amber: "#ffb313", amberSoft: "#fff0b3", font: "sans-serif" };

/** The tag as the server writes it: the spec's JSON, HTML-escaped (render.py, chart_tag). */
function tag(spec: unknown): string {
  return `<pchart>${JSON.stringify(spec).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pchart>`;
}

const BAR: ChartSpec = { type: "bar", title: "Vehicles by class", unit: "vehicles", labels: ["Two-wheelers", "Cars"],
                         series: [{ name: "Registered", values: [18434072, 2068471] }] };

describe("a chart in an answer", () => {
  it("draws the tag as a figure of its own, between the paragraphs around it", () => {
    render(<div data-testid="answer">{renderAnswer(`Punjab held 22.2 million vehicles.\n\n${tag(BAR)}\n\nMost are two-wheelers.`, handlers)}</div>);
    const fig = screen.getByTestId("answer-chart");
    expect(fig).toHaveAttribute("data-type", "bar");
    expect(fig).toHaveTextContent("Vehicles by class");
    expect(fig.querySelector("[role=img]")?.getAttribute("aria-label")).toContain("Two-wheelers: 18,434,072");
    const answer = screen.getByTestId("answer");
    expect(answer.querySelectorAll("p")).toHaveLength(2);
    expect(answer.textContent).not.toContain("{");
  });

  it("draws nothing for a tag that does not parse, never its text", () => {
    render(<div data-testid="answer">{renderAnswer(`Before.\n\n<pchart>{&quot;type&quot;:</pchart>\n\nAfter.`, handlers)}</div>);
    expect(screen.queryByTestId("answer-chart")).toBeNull();
    expect(screen.getByTestId("answer").textContent).toBe("Before.After.");
  });

  it("refuses a spec whose series do not match its labels", () => {
    expect(parseChartSpec(JSON.stringify({ ...BAR, series: [{ name: "x", values: [1] }] }))).toBeNull();
    expect(parseChartSpec(JSON.stringify({ ...BAR, type: "radar" }))).toBeNull();
    expect(parseChartSpec(JSON.stringify(BAR))).not.toBeNull();
  });
});

describe("the chart's options", () => {
  it("plots the model's figures as given", () => {
    const o = buildAnswerChartOption(BAR, T) as { series: { type: string; data: number[] }[]; xAxis: { data: string[] } };
    expect(o.series[0].type).toBe("bar");
    expect(o.series[0].data).toEqual([18434072, 2068471]);
    expect(o.xAxis.data).toEqual(["Two-wheelers", "Cars"]);
  });

  it("lays a horizontal bar on its side and stacks a stacked one", () => {
    const o = buildAnswerChartOption({ ...BAR, horizontal: true, stacked: true,
      series: [{ name: "a", values: [1, 2] }, { name: "b", values: [3, 4] }] }, T) as {
      yAxis: { type: string; inverse: boolean }; series: { stack?: string }[]; legend: { show: boolean } };
    expect(o.yAxis.type).toBe("category");
    expect(o.yAxis.inverse).toBe(true);
    expect(o.series.every((s) => s.stack === "all")).toBe(true);
    expect(o.legend.show).toBe(true);
  });

  it("draws a line, an area and a ring", () => {
    const line = buildAnswerChartOption({ ...BAR, type: "line" }, T) as { series: { type: string; areaStyle?: unknown }[] };
    expect(line.series[0].type).toBe("line");
    expect(line.series[0].areaStyle).toBeUndefined();
    const area = buildAnswerChartOption({ ...BAR, type: "area" }, T) as { series: { type: string; areaStyle?: unknown }[] };
    expect(area.series[0].type).toBe("line");
    expect(area.series[0].areaStyle).toBeDefined();
    const pie = buildAnswerChartOption({ ...BAR, type: "pie", donut: true }, T) as { series: { type: string; radius: string[]; data: { name: string; value: number }[] }[] };
    expect(pie.series[0].type).toBe("pie");
    expect(pie.series[0].radius).toHaveLength(2);
    expect(pie.series[0].data).toEqual([expect.objectContaining({ name: "Two-wheelers", value: 18434072 }), expect.objectContaining({ name: "Cars", value: 2068471 })]);
  });

  it("prints a figure grouped, never rounded away", () => {
    expect(grouped(18434072)).toBe("18,434,072");
    expect(grouped(0.275)).toBe("0.275");
    expect(grouped(null)).toBe("–");
  });
});
