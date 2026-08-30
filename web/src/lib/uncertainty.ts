/**
 * The release's headline parametric uncertainty (`get_uncertainty(scope="national")`): one
 * cell per scenario, the `cross_sector` one the headline. Its `interval_short`,
 * `scenario_label` and `display_short` are server strings; nothing here computes.
 */
import type { Cell, Envelope } from "./envelope";

export const HEADLINE_SCENARIO = "cross_sector";

/** The cell of the headline scenario, else the first cell that carries an interval. */
export function headlineCell(env: Envelope | null | undefined): Cell | null {
  if (!env) return null;
  return env.values.find((c) => c.scenario === HEADLINE_SCENARIO && c.interval_short) ?? env.values.find((c) => !!c.interval_short) ?? null;
}

/** "Mt": the magnitude token of the cell's unit, the word an interval or a bare figure ends with. */
export function magnitudeOf(cell: { unit?: string | null; unit_short?: string } | null | undefined): string {
  const unit = cell?.unit_short || cell?.unit || "";
  return unit.trim().split(/\s+/)[0] ?? "";
}
