"use client";
/**
 * The filter panel's year slider: one tick per fiscal period the release publishes
 * (`dims.fiscalPeriods`, in order), a saffron thumb, the two ends labelled with the release's
 * own short labels and the chosen year named above the track. Moving it writes `period`
 * (`applyPatch` drops the month with it).
 *
 * The release's spatial products exist for the REFERENCE year only, so the ticks are drawn in
 * two kinds: the reference year filled, every other year HOLLOW, each hollow tick's tooltip
 * saying which year the map shows. Standing on a hollow tick the deck keeps answering
 * nationally, the map greys to its outlines (components/map/ExplorerMap.tsx calls `clearPaint`)
 * and the line under the slider carries THE API'S OWN refusal for that year — the same refusal
 * the legend capsule shows, read from the map's own query key so it is never asked twice, and
 * never a reason invented here. No period id is ever printed and nothing is computed: every
 * label is `periodShort` / `periodLabel` / `periodBasisNote`.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useExplorer } from "@/components/ExplorerContext";
import { api } from "@/lib/api";
import { refusalWords } from "@/lib/envelope";
import { mapBody } from "@/lib/requests";
import { periodBasisNote, periodLabel, periodShort } from "@/lib/labels";
import { mapsPeriod } from "@/components/map/layerModes";
import { refusalOf } from "@/components/ui/RefusalCard";
import { FILTERS } from "./copy";

/** The periods the slider offers, and the index of the current one (0 when the state's period is not among them). */
export function sliderTicks(ids: string[], period: string): { ids: string[]; index: number } {
  const i = ids.indexOf(period);
  return { ids, index: i >= 0 ? i : Math.max(0, ids.length - 1) };
}

export function YearSlider() {
  const { state, setState, labels, dims } = useExplorer();
  const { ids, index } = sliderTicks(dims.fiscalPeriods, state.period);
  const body = useMemo(() => mapBody(state), [state]);
  // the map's own query key: the refusal shown here is the refusal the map received
  const mapQ = useQuery({ queryKey: ["map", body], queryFn: () => api.queryEmissions(body!), enabled: !!body, retry: false });
  if (!ids.length) return null;
  const last = ids.length - 1;
  const current = ids[index];
  const referenceId = ids.find((id) => mapsPeriod(labels, id)) ?? ids[last];
  const mapped = mapsPeriod(labels, current);
  const refusal = refusalOf(mapQ.error);
  return (
    <div data-testid="year-slider">
      <div className="flex items-baseline justify-between gap-2">
        <span className="micro">{FILTERS.year}</span>
        <span className="num text-sm font-semibold text-fg" title={periodLabel(labels, current)} data-testid="year-value">
          {periodShort(labels, current)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={last}
        step={1}
        value={index}
        onChange={(e) => setState({ period: ids[Number(e.target.value)] ?? current })}
        className="mt-1.5 h-1 w-full cursor-pointer accent-amber"
        aria-label={FILTERS.year}
        aria-valuetext={periodShort(labels, current)}
        title={periodBasisNote(labels, current)}
        data-testid="year-range"
      />
      {/* one tick per year: filled for the year the release maps, hollow for the years it answers nationally */}
      <div className="mt-1 flex items-center justify-between px-0.5" role="group" aria-label={FILTERS.year} data-testid="year-ticks">
        {ids.map((id) => {
          const isMapped = mapsPeriod(labels, id);
          const on = id === current;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setState({ period: id })}
              aria-label={periodShort(labels, id)}
              aria-pressed={on}
              title={isMapped ? periodLabel(labels, id) : `${periodLabel(labels, id)} · ${FILTERS.mappedYear(periodShort(labels, referenceId))}`}
              className={`h-2.5 w-2.5 rounded-full border transition-colors ${isMapped ? "border-amber bg-amber" : "border-line-strong bg-transparent"} ${on ? "ring-2 ring-amber/50" : ""}`}
              data-testid="year-tick"
              data-mapped={isMapped ? "1" : "0"}
              data-current={on ? "1" : "0"}
            />
          );
        })}
      </div>
      <div className="mt-0.5 flex justify-between text-micro normal-case tracking-normal text-muted">
        <span data-testid="year-first">{periodShort(labels, ids[0])}</span>
        <span data-testid="year-last">{periodShort(labels, ids[last])}</span>
      </div>
      {!mapped && (
        <p className="mt-1.5 text-xs text-muted" data-testid="year-national-only">
          <span className="font-semibold text-warn">{FILTERS.nationalOnly}</span>
          {" · "}
          <span title={refusal ? `${refusal.error_class}: ${refusalWords(refusal)}` : undefined} data-testid="year-refusal">
            {refusal ? refusalWords(refusal) : FILTERS.asking}
          </span>
        </p>
      )}
    </div>
  );
}
