import "@testing-library/jest-dom/vitest";
/**
 * The framed trend figure, rendered by the real ECharts SVG renderer: the in-figure title and
 * the subtitle built from the envelope (unit as words, scope with the LULUCF status, the year
 * basis); the x-axis carries every period's short label; the ends and the reference year are
 * labelled with their displays; there is no y-axis text at all, so the only decimals in the
 * figure are the envelope's displays; the Result details line sits under the figure unless
 * `showReceipt` is false, and a caller may write the subtitle; the tooltip
 * formatter prints the cell's display and unit, never the axis value; under 420 px only the
 * first, the reference and the last year are labelled.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import type { Envelope } from "@/lib/envelope";
import { envelope } from "@/__tests__/fixtures";
import { THIN_AXIS_BELOW_PX, TrendChart, trendSubtitle } from "./TrendChart";

const SHORT: Record<string, string> = { "FY2015-16": "2015–16", "FY2019-20": "2019–20", "FY2023-24": "2023–24" };
const CELLS = [
  { display: "372.397", display_short: "372.40", value: 372.39677601, group: { period_id: "FY2015-16" } },
  { display: "404.204", display_short: "404.20", value: 404.2041, group: { period_id: "FY2019-20" } },
  { display: "452.347", display_short: "452.35", value: 452.34662, group: { period_id: "FY2023-24" } },
];

function series(): Envelope {
  return envelope(CELLS, { request_type: "get_timeseries", request: JSON.stringify({ _type: "TimeseriesRequest", query: { configuration_id: "REF_2023_24", gwp_basis: "AR5" }, step: "annual" }) }) as unknown as Envelope;
}

/** ECharts needs a laid-out container; jsdom has none, so the box is stubbed. */
function stubBox(width: number, height = 150) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => height });
}

/** Every text node inside the chart's SVG. */
function svgTexts(chart: HTMLElement): string[] {
  return Array.from(chart.querySelectorAll("text")).map((t) => t.textContent ?? "").filter((t) => t.length > 0);
}

let width = 640;
beforeEach(() => {
  stubBox(width);
});
afterEach(() => {
  vi.restoreAllMocks();
  width = 640;
});

async function mount(props: Partial<React.ComponentProps<typeof TrendChart>> = {}) {
  const env = series();
  const view = render(
    <Providers>
      <TrendChart env={env} referencePeriod="FY2023-24" periodLabel={(id) => SHORT[id] ?? id} basisWords="years run July–June" {...props} />
    </Providers>,
  );
  const chart = screen.getByTestId("trend-chart");
  await waitFor(() => expect(chart.querySelector("svg")).not.toBeNull());
  await waitFor(() => expect(svgTexts(chart).length).toBeGreaterThan(0));
  return { ...view, env, chart };
}

describe("TrendChart", () => {
  it("frames the figure: title, subtitle from the envelope, the years on the axis, displays at the ends and the reference, the receipt line", async () => {
    const { chart, env } = await mount({ referencePeriod: "FY2019-20" }); // the reference in the middle: three labelled points
    expect(screen.getByTestId("trend-title")).toHaveTextContent("Pakistan's greenhouse-gas emissions, by year");
    expect(screen.getByTestId("trend-subtitle")).toHaveTextContent("million tonnes CO₂e (AR5) · all sectors, land use excluded · years run July–June");
    const texts = svgTexts(chart);
    for (const id of Object.keys(SHORT)) expect(texts).toContain(SHORT[id]);
    for (const c of CELLS) expect(texts).toContain(c.display_short); // the shown string, never the contract display
    for (const c of CELLS) expect(texts).not.toContain(c.display);
    expect(screen.getByTestId("receipt-footer")).toHaveTextContent("Result details");
    expect(screen.getByTestId("receipt-footer")).toHaveAttribute("data-receipt", env.receipt);
    expect(chart.textContent).not.toContain("FY");
  });
  it("a written subtitle replaces the built one, and showReceipt={false} drops the Result details line", async () => {
    await mount({ title: "Pakistan greenhouse-gas emissions", subtitle: "Million tonnes CO₂e (AR5), excluding land use", showReceipt: false });
    expect(screen.getByTestId("trend-title")).toHaveTextContent("Pakistan greenhouse-gas emissions");
    expect(screen.getByTestId("trend-subtitle")).toHaveTextContent("Million tonnes CO₂e (AR5), excluding land use");
    expect(screen.getByTestId("trend-subtitle")).not.toHaveTextContent("years run");
    expect(screen.queryByTestId("receipt-footer")).toBeNull();
    expect(screen.getByTestId("trend-figure").textContent).not.toContain("receipt");
  });
  it("prints no number it computed: every decimal in the SVG is an envelope display, and there is no y-axis text", async () => {
    const { chart } = await mount(); // the reference is the last year: the ends are labelled, the middle point is not
    const texts = svgTexts(chart);
    const displays = new Set(CELLS.flatMap((c) => [c.display_short, c.display]));
    const years = new Set(Object.values(SHORT));
    for (const t of texts) expect(displays.has(t) || years.has(t)).toBe(true);
    const decimals = texts.join(" ").match(/\d+\.\d+/g) ?? [];
    expect(decimals).toEqual([CELLS[0].display_short, CELLS[2].display_short]);
    for (const d of decimals) expect(displays.has(d)).toBe(true);
    // a y-axis would add round tick values (0, 100, 200 ...): none is present
    expect(texts.filter((t) => /^\d+$/.test(t))).toEqual([]);
  });
  it("the tooltip formatter prints the cell's display and unit as words (never the axis value); the subtitle names a sector filter", async () => {
    const env = series();
    expect(trendSubtitle(env)).toBe("million tonnes CO₂e (AR5) · all sectors, land use excluded");
    expect(trendSubtitle(env, undefined, "years run July–June")).toBe("million tonnes CO₂e (AR5) · all sectors, land use excluded · years run July–June");
    const filtered = { ...env, request: JSON.stringify({ query: { sectors: ["power"] } }) } as Envelope;
    expect(trendSubtitle(filtered)).toBe("million tonnes CO₂e (AR5) · power, land use excluded");
    expect(trendSubtitle(env, "national total")).toBe("million tonnes CO₂e (AR5) · national total, land use excluded");
    const echarts = await import("echarts");
    const { chart: el } = await mount();
    const chart = echarts.getInstanceByDom(el)!;
    const formatter = (chart.getOption() as unknown as { tooltip: { formatter: (p: { dataIndex: number }) => string }[] }).tooltip[0].formatter;
    expect(formatter({ dataIndex: 1 })).toBe("2019–20 · 404.20 million tonnes CO₂e (AR5)");
    expect(formatter({ dataIndex: 2 })).toBe("2023–24 · 452.35 million tonnes CO₂e (AR5)");
  });
  it("a cell without display_short is labelled with its display; a cell with unit_words speaks the server's words", async () => {
    const echarts = await import("echarts");
    const env = envelope([{ display: "372.397", value: 372.397, unit_words: "million tonnes CO₂e (AR5), served", group: { period_id: "FY2015-16" } }, { display: "452.347", value: 452.347, group: { period_id: "FY2023-24" } }], { request_type: "get_timeseries" }) as unknown as Envelope;
    const { chart: el } = await mount({ env });
    const texts = svgTexts(el);
    expect(texts).toContain("372.397");
    expect(texts).toContain("452.347");
    const formatter = (echarts.getInstanceByDom(el)!.getOption() as unknown as { tooltip: { formatter: (p: { dataIndex: number }) => string }[] }).tooltip[0].formatter;
    expect(formatter({ dataIndex: 0 })).toBe("2015–16 · 372.397 million tonnes CO₂e (AR5), served");
  });
  it("under the thin-axis width only the first, the reference and the last year are labelled", async () => {
    width = THIN_AXIS_BELOW_PX - 100;
    stubBox(width);
    const env = envelope(
      [CELLS[0], { display: "380.1", value: 380.1, group: { period_id: "FY2016-17" } }, { display: "390.2", value: 390.2, group: { period_id: "FY2017-18" } }, CELLS[1], CELLS[2]],
      { request_type: "get_timeseries" },
    ) as unknown as Envelope;
    const { chart } = await mount({ env, periodLabel: (id) => ({ ...SHORT, "FY2016-17": "2016–17", "FY2017-18": "2017–18" })[id] ?? id });
    const texts = svgTexts(chart);
    expect(texts).toContain("2015–16");
    expect(texts).toContain("2023–24");
    expect(texts).not.toContain("2016–17");
    expect(texts).not.toContain("2017–18");
  });
  it("shows a skeleton with no text while the envelope loads", () => {
    render(
      <Providers>
        <TrendChart env={null} />
      </Providers>,
    );
    expect(screen.getByTestId("trend-skeleton")).toHaveTextContent("");
    expect(screen.queryByTestId("trend-chart")).toBeNull();
  });
});
