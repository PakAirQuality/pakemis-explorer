"use client";
/**
 * The opening statement (18 px prose, numbers bold): "In 2023–24, Pakistan emitted an
 * estimated 452.35 Mt CO₂e. Agriculture accounted for 223.45 Mt — 49.4 %, nearly half — of
 * the reconstructed inventory, which excludes land use and forestry." Every figure is a
 * server string of the total envelope (`display_short`, `unit_short`) and the sector
 * breakdown's rank-1 cell (`display_short`, `share_pct_short`, `share_phrase`); the LULUCF
 * phrase is the release's label. Province scope: "In 2023–24, Punjab's allocated emissions
 * were 228.72 Mt CO₂e. Agriculture accounted for … of the province's allocated total." Under
 * it, the muted independence line. A deck card (DECK_CARD) with the `summary` id the scroll spy
 * watches.
 */
import type { Briefing } from "@/lib/queries";
import { shown } from "@/lib/envelope";
import { cellUnit, lulucfShort, periodShort, sectorLabel } from "@/lib/labels";
import { magnitudeOf } from "@/lib/uncertainty";
import { useExplorer } from "@/components/ExplorerContext";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { rankedCells } from "./widgets";
import { INDEPENDENT_LINE } from "./copy";
import { DECK_CARD } from "./deck";

/** "agriculture" in running text: the label with its initial lowered unless it is an acronym. */
export function lowerName(name: string): string {
  return name.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
}

export function OpeningStatement({ data, geo, place }: { data: Briefing; geo: string | null; place: string }) {
  const { state, labels } = useExplorer();
  const total = data.total.data?.values[0];
  const top = rankedCells(data.bySector.data)[0];
  const period = periodShort(labels, state.period);
  return (
    <section id="summary" className={DECK_CARD} data-testid="opening">
      {total ? (
        <p className="text-lg text-fg" data-testid="opening-statement">
          In <b>{period}</b>, {geo ? <>{place}&apos;s allocated emissions were</> : <>{place} emitted an estimated</>} <b className="num whitespace-nowrap">{shown(total)} {cellUnit(total)}</b>.
          {top ? (
            <>
              {" "}
              {sectorLabel(labels, top.group?.[data.bodies.sectorKey])} accounted for <b className="num whitespace-nowrap">{shown(top)} {magnitudeOf(top)}</b>
              {top.share_pct_short ? (
                <>
                  {" "}— <b className="num">{top.share_pct_short} %</b>
                  {top.share_phrase ? `, ${top.share_phrase}` : ""} —
                </>
              ) : null}{" "}
              of {geo ? <>the province&apos;s allocated total</> : <>the reconstructed inventory, which {lulucfShort(labels)}</>}.
            </>
          ) : null}
        </p>
      ) : data.total.error ? (
        <RefusalCard error={data.total.error} compact />
      ) : (
        <Loading what={geo ? "the province's total" : "the national total"} />
      )}
      <p className="mt-3 text-sm text-muted" data-testid="independent-line">{INDEPENDENT_LINE}</p>
    </section>
  );
}
