/**
 * Grid power, said beside an air total instead of inside it.
 *
 * The air panel covers the sources the release ESTIMATES. Grid power is not one of them: for a
 * pollutant it is priced only as a pair of scenarios - a controlled case and an uncontrolled one -
 * and the release's own rule is that neither end is ever a cell of a total, a ranking or a share
 * ("a covered total plus a scenario end is neither an estimate nor a bound"). The API honours that
 * by carrying the pair in the envelope's `completeness` block, outside `values`.
 *
 * A note saying so stood under these cards for one afternoon and was removed; after that the pair
 * was visible only as raw JSON in the details drawer, and a reader comparing this page with the
 * data page - which was reading a different product, with power as a row - had nothing to tell
 * them the two were not the same total. The two strings are the server's, printed as returned.
 */
import type { Envelope } from "@/lib/envelope";
import { sectorLabel } from "@/lib/labels";
import type { Labels } from "@/lib/release";

export type ScreeningRange = { sector: string; controlled: string; uncontrolled: string };

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The screening pairs the envelope carries beside its values (one per sector kept out of the total). */
export function screeningRanges(env: Pick<Envelope, "completeness"> | null | undefined): ScreeningRange[] {
  const out: ScreeningRange[] = [];
  for (const row of env?.completeness ?? []) {
    const sector = text(row.sector_id);
    const controlled = text(row.scenario_controlled_kt);
    const uncontrolled = text(row.scenario_uncontrolled_kt);
    if (sector && controlled && uncontrolled) out.push({ sector, controlled, uncontrolled });
  }
  return out;
}

export function AirScreeningNote({ env, labels }: { env: Pick<Envelope, "completeness" | "context"> | null | undefined; labels: Labels }) {
  const ranges = screeningRanges(env);
  if (!ranges.length) return null;
  // THE PAIR IS THE NATION'S, whatever place the result is for: the release prices grid power for
  // the country and places none of it. Beside a province's or a district's total it is said to be
  // national, so the range is not read as that place's.
  const placed = ((env?.context as { geography_ids?: unknown[] } | undefined)?.geography_ids ?? []).length > 0;
  return (
    <div className="mt-3 rounded-md border border-line bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted" data-testid="air-screening-note">
      {ranges.map((r) => (
        <p key={r.sector} data-sector={r.sector}>
          <b className="text-fg">{sectorLabel(labels, r.sector)} is not in this total.</b> The release prices grid generation only as a {placed ? "national " : ""}screening range, from{" "}
          <b className="num whitespace-nowrap">{r.controlled} kt</b> with emission controls to <b className="num whitespace-nowrap">{r.uncontrolled} kt</b> without. Neither end is an estimate, so it is not
          added to the total, ranked or given a share{placed ? ", and none of it is placed in a province or district" : ""}.
        </p>
      ))}
    </div>
  );
}
