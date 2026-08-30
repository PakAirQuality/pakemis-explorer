"use client";
/**
 * The filter panel's year slider: one tick per fiscal period the release publishes
 * (`dims.fiscalPeriods`, in order), a saffron thumb, the two ends labelled with the release's
 * own short labels and the chosen year named above the track. Moving it writes `period`
 * (`applyPatch` drops the month with it). A year the release answers nationally only is marked
 * on the track and named under it in the release's own words — the map's grey-out and its
 * typed refusal are Wave 4's. No period id is ever printed and nothing here is computed: every
 * label is `periodShort` / `periodLabel` / `periodBasisNote`.
 */
import { useExplorer } from "@/components/ExplorerContext";
import { periodBasisNote, periodLabel, periodShort } from "@/lib/labels";
import { FILTERS } from "./copy";

/** The periods the slider offers, and the index of the current one (0 when the state's period is not among them). */
export function sliderTicks(ids: string[], period: string): { ids: string[]; index: number } {
  const i = ids.indexOf(period);
  return { ids, index: i >= 0 ? i : Math.max(0, ids.length - 1) };
}

export function YearSlider() {
  const { state, setState, labels, dims } = useExplorer();
  const { ids, index } = sliderTicks(dims.fiscalPeriods, state.period);
  if (!ids.length) return null;
  const last = ids.length - 1;
  const current = ids[index];
  const reference = labels.periods[current]?.is_reference ?? false;
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
        list="year-slider-ticks"
        className="mt-1.5 h-1 w-full cursor-pointer accent-amber"
        aria-label={FILTERS.year}
        aria-valuetext={periodShort(labels, current)}
        title={periodBasisNote(labels, current)}
        data-testid="year-range"
      />
      <datalist id="year-slider-ticks">
        {ids.map((id, i) => (
          <option key={id} value={i} label={periodShort(labels, id)} />
        ))}
      </datalist>
      <div className="mt-0.5 flex justify-between text-micro normal-case tracking-normal text-muted">
        <span data-testid="year-first">{periodShort(labels, ids[0])}</span>
        <span data-testid="year-last">{periodShort(labels, ids[last])}</span>
      </div>
      {!reference && <p className="mt-1 text-xs text-muted" data-testid="year-national-only">{periodLabel(labels, current)} · answered nationally</p>}
    </div>
  );
}
