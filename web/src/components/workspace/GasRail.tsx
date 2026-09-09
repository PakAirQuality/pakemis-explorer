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
  `shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${on ? "bg-accent text-on-accent shadow-sm" : "bg-surface-3 text-fg/70 hover:bg-accent-soft hover:text-fg"}`;

export function GasRail() {
  const { state, setState, labels, dims } = useExplorer();
  const ghg = dims.gases.length ? dims.gases : ["CO2", "CH4", "N2O"];
  const allOn = !state.gas && !state.pol;
  return (
    <div className="mt-4 flex flex-col gap-2.5 border-t border-line pt-3" data-testid="gas-rail">
      <div>
        <div className="micro mb-1.5">Greenhouse</div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={allOn} onClick={() => setState({ gas: null, pol: null })} className={CHIP(allOn)} data-testid="gas-rail-all">
            All (CO₂e)
          </button>
          {ghg.map((g) => (
            <button key={g} type="button" aria-pressed={state.gas === g} onClick={() => setState({ gas: g, pol: null })} className={CHIP(state.gas === g)} data-testid={`gas-rail-${g}`}>
              {gasLabel(labels, g)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="micro mb-1.5">Air pollutants · beta</div>
        <div className="flex flex-wrap gap-1.5">
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
    </div>
  );
}
