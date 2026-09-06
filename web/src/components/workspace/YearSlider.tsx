"use client";
/**
 * The filter panel's year slider: one step per fiscal period the release publishes
 * (`dims.fiscalPeriods`, in order) with a saffron thumb, and the year it stands on named once
 * beside the label. (The tick row and the two end labels it used to carry underneath printed
 * the same dates a second time; they went on 2026-08-31.) Moving it writes `period`
 * (`applyPatch` drops the month with it).
 *
 * Since 1.0.0rc47 the polygon levels are YEAR-AWARE (fact_adm2_year serves all nine
 * periods), so the slider no longer declares years unmapped: the line beneath it appears
 * only when the release itself refuses the map's request (its message_worded, read from
 * the map's own query key so it is never asked twice) or on the grid level off the
 * reference year, whose value rasters are built from the reference cubes alone.
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
  const mapped = mapsPeriod(labels, current, state.level);
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
      {(!mapped || refusal) && (
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
