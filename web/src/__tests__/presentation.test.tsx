import "@testing-library/jest-dom/vitest";
/**
 * Presentation precision: every number a reader sees by default is the cell's `display_short`
 * (the server's two-decimal rendering, release.rounding.presentation) and falls back to the
 * contract's `display` when a cell carries none; the full `display` and `exact` stay one step
 * away: the EnvelopeTable's "full precision" toggle, the Result details Calculation tab, and
 * the title of a headline. The browser derives none of these strings.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { shown, type Envelope } from "@/lib/envelope";
import { envelopeUnitLine } from "@/lib/labels";
import { envelope } from "./fixtures";
import { EnvelopeTable } from "@/components/ui/EnvelopeTable";
import { EnvelopeDrawer } from "@/components/ui/EnvelopeDrawer";

const CELLS = [
  { display: "452.34662", display_short: "452.35", group: { sector_id: "agriculture" } },
  { display: "9.010", display_short: "9.01", group: { sector_id: "industry" } },
  { display: "0.00312", display_short: "<0.01", group: { sector_id: "aviation" } },
  { display: "[12.2565, 12.2769]", display_short: "[12.26, 12.28]", group: { sector_id: "waste" }, exactness: "bounded_mixed_ch4_origin", exact_high: "12.2769" },
  { display: "63.370", group: { sector_id: "power" } }, // no display_short: the display stands
];

function env(): Envelope {
  return envelope(CELLS) as unknown as Envelope;
}

describe("presentation precision", () => {
  it("shown(): display_short when present, else display", () => {
    expect(shown({ display: "452.34662", display_short: "452.35" })).toBe("452.35");
    expect(shown({ display: "63.370" })).toBe("63.370");
    expect(shown({ display: "63.370", display_short: null })).toBe("63.370");
    expect(shown({ display: "[12.2565, 12.2769]", display_short: "[12.26, 12.28]" })).toBe("[12.26, 12.28]");
    expect(shown({ display: null })).toBe("");
  });
  it("the table shows display_short by default and falls back to display; full precision switches to display and adds exact", () => {
    render(<EnvelopeTable env={env()} />);
    const values = () => screen.getAllByTestId("table-value").map((e) => e.textContent);
    expect(values()).toEqual(["452.35", "9.01", "<0.01", "[12.26, 12.28]", "63.370"]);
    expect(screen.getByTestId("envelope-table").textContent).not.toContain("452.34662");
    expect(screen.queryByText("Exact")).toBeNull();
    fireEvent.click(screen.getByTestId("full-precision"));
    expect(values()).toEqual(["452.34662", "9.010", "0.00312", "[12.2565, 12.2769]", "63.370"]);
    expect(screen.getByText("Exact")).toBeInTheDocument();
    expect(screen.getByTestId("envelope-table")).toHaveTextContent(env().values[0].exact);
    expect(screen.getByTestId("envelope-table")).toHaveTextContent(".. 12.2769");
  });
  it("Result details keeps the full display and exact: the Calculation tab lists every cell as shown, published and exact", () => {
    const e = env();
    render(<EnvelopeDrawer env={e} tab="calculation" onClose={() => undefined} />);
    const table = screen.getByTestId("precision-table");
    expect(table).toHaveTextContent("Published value (contract precision)");
    expect(within(table).getAllByTestId("published-value").map((x) => x.textContent)).toEqual(CELLS.map((c) => c.display));
    expect(within(table).getAllByTestId("exact-value").map((x) => x.textContent)).toEqual(e.values.map((v) => v.exact + (v.exact_high && v.exact_high !== v.exact ? ` .. ${v.exact_high}` : "")));
    expect(table).toHaveTextContent("452.35");
    expect(table).toHaveTextContent("452.34662");
  });
  it("the unit line prefers the server's unit_words", () => {
    expect(envelopeUnitLine(envelope([{ display: "1.0", unit_words: "million tonnes CO₂e (AR5), served" }]) as unknown as Envelope)).toBe("million tonnes CO₂e (AR5), served");
    expect(envelopeUnitLine(envelope([{ display: "1.0" }]) as unknown as Envelope)).toBe("million tonnes CO₂e (AR5)");
    expect(envelopeUnitLine(null)).toBe("");
  });
});
