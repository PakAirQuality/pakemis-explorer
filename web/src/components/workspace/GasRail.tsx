"use client";
/**
 * The gas rail: every gas the release estimates, as one selector row on the overview
 * panel - the greenhouse three priced into the CO2e total, a thin divider, then the
 * seven air-beta species in native kilotonnes. Clicking a chip writes the SAME keys
 * the filter panel's Gas/Metric select writes (`gas` for the greenhouse gases, `pol`
 * for the pollutants, each clearing the other), so the whole workspace - map, cards,
 * chips - re-scopes to that gas's metrics; "All" returns to the CO2e total.
 */
import { useExplorer } from "@/components/ExplorerContext";
import { gasLabel } from "@/lib/labels";
import { POLLUTANTS, POLLUTANT_LABELS } from "@/lib/explore/query";

const CHIP = (on: boolean) =>
  `pill shrink-0 px-2.5 py-1 text-xs font-medium transition-colors ${on ? "bg-accent text-on-accent" : "border border-line bg-surface text-muted hover:text-fg"}`;

export function GasRail() {
  const { state, setState, labels, dims } = useExplorer();
  const ghg = dims.gases.length ? dims.gases : ["CO2", "CH4", "N2O"];
  const allOn = !state.gas && !state.pol;
  return (
    <div className="mt-4 border-t border-line pt-3" data-testid="gas-rail">
      <div className="micro mb-2">By gas</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" aria-pressed={allOn} onClick={() => setState({ gas: null, pol: null })} className={CHIP(allOn)} data-testid="gas-rail-all">
          All (CO₂e)
        </button>
        {ghg.map((g) => (
          <button key={g} type="button" aria-pressed={state.gas === g} onClick={() => setState({ gas: g, pol: null })} className={CHIP(state.gas === g)} data-testid={`gas-rail-${g}`}>
            {gasLabel(labels, g)}
          </button>
        ))}
        <span className="mx-1 h-4 w-px shrink-0 bg-line" aria-hidden="true" />
        {POLLUTANTS.map((pl) => (
          <button
            key={pl}
            type="button"
            aria-pressed={state.pol === pl}
            onClick={() => setState({ pol: pl, gas: null, month: null })}
            className={CHIP(state.pol === pl)}
            title="Air-pollutant beta: native kilotonnes, outside the CO₂e totals"
            data-testid={`gas-rail-${pl}`}
          >
            {POLLUTANT_LABELS[pl] ?? pl}
          </button>
        ))}
      </div>
    </div>
  );
}
