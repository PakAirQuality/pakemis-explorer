"use client";
/**
 * The map's legend, bottom-left of the map and right of the deck (`left-[calc(20px+420px+16px)]`,
 * the deck's inset plus its column plus the gap): ONE glass line with a ⓘ that opens the full
 * panel above it. Which line depends on what the map is showing —
 *
 *   Relative · Lower ▬▬▬▬ Higher · ⓘ    the default: the shading is a quantile RANK, and a rank
 *                                       is a colour, never a label, so nothing is printed
 *   Fixed · {low} ▬▬▬▬ {high} · ⓘ       the two ends are the server's own strings, from the
 *                                       reference year's all-sector, all-gas envelope
 *   Absolute · {n} bands · ⓘ            the ⓘ opens Legend.tsx's rows: the server's breaks
 *   {layer} · ⓘ                         a categorical layer, whose ⓘ opens LayerLegend's panel
 *   Not mapped · {the release's words}   off the reference year, or on any refused request
 *
 * The refusal face prints the API's own `message_worded` and names its error class; it never
 * invents a reason of its own. Every panel ends with the layer's one sentence — the map is an
 * inventory allocation, not an observation — because LayerLegend states it for every layer.
 */
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { refusalWords } from "@/lib/envelope";
import { RAMP } from "@/lib/palette";
import { LayerLegend } from "@/components/map/LayerLegend";
import { LAYERS, mapsPeriod } from "@/components/map/layerModes";
import { useLayerLegendData } from "@/components/map/legendData";
import { legendRanks } from "@/components/map/Legend";
import { RefusalCard, refusalOf } from "@/components/ui/RefusalCard";
import { LEGEND } from "./copy";

/** Which face the capsule wears, from the layer, the year and whether the request was refused. */
export type LegendFace = "refused" | "categorical" | "relative" | "fixed" | "absolute";

export function legendFace({ layer, scale, mapped, refused }: { layer: string; scale: string; mapped: boolean; refused: boolean }): LegendFace {
  if (!mapped || refused) return "refused";
  if (layer !== "magnitude") return "categorical";
  return scale === "fixed" ? "fixed" : scale === "absolute" ? "absolute" : "relative";
}

function Ramp() {
  return <span className="h-2 w-20 shrink-0 rounded-full border border-line" style={{ background: `linear-gradient(90deg, ${RAMP.join(", ")})` }} aria-hidden="true" data-testid="legend-ramp" />;
}

export function LegendCapsule({ className = "" }: { className?: string }) {
  const { state, labels } = useExplorer();
  const data = useLayerLegendData();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const mapped = mapsPeriod(labels, state.period);
  const refusal = refusalOf(data.error);
  const face = legendFace({ layer: state.layer, scale: state.scale, mapped, refused: !!refusal });
  const breaks = data.env ? legendRanks(data.env.values).length : 0;
  const note = face === "fixed" ? LEGEND.fixedNote : face === "absolute" ? LEGEND.absoluteNote : LEGEND.relativeNote;

  const line =
    face === "refused" ? (
      <>
        <span className="shrink-0 font-semibold text-warn">{LEGEND.notMapped}</span>
        <span className="h-3 w-px shrink-0 bg-line-strong" aria-hidden="true" />
        <span className="truncate" data-testid="legend-refusal">{refusal ? refusalWords(refusal) : LEGEND.asking}</span>
      </>
    ) : face === "categorical" ? (
      <span className="truncate font-semibold text-fg" data-testid="legend-layer">{LAYERS[state.layer].label}</span>
    ) : face === "fixed" ? (
      <>
        <span className="shrink-0 font-semibold text-fg">{LEGEND.fixed}</span>
        <span className="h-3 w-px shrink-0 bg-line-strong" aria-hidden="true" />
        <span className="num truncate text-fg" data-testid="legend-low">{data.fixed.ends?.low ?? ""}</span>
        <Ramp />
        <span className="num truncate text-fg" data-testid="legend-high">{data.fixed.ends?.high ?? ""}</span>
      </>
    ) : face === "absolute" ? (
      <>
        <span className="shrink-0 font-semibold text-fg">{LEGEND.absolute}</span>
        <span className="h-3 w-px shrink-0 bg-line-strong" aria-hidden="true" />
        <Ramp />
        <span className="shrink-0" data-testid="legend-bands">{LEGEND.bands(breaks)}</span>
      </>
    ) : (
      <>
        <span className="shrink-0 font-semibold text-fg">{LEGEND.relative}</span>
        <span className="h-3 w-px shrink-0 bg-line-strong" aria-hidden="true" />
        <span>{LEGEND.lower}</span>
        <Ramp />
        <span>{LEGEND.higher}</span>
      </>
    );

  return (
    <div className={`absolute bottom-5 left-[calc(20px+420px+16px)] z-20 hidden max-w-[calc(100vw-880px)] flex-col items-start gap-2 lg:flex ${className}`} data-testid="legend-capsule-slot" data-face={face}>
      {open && (
        <div className="max-h-[60vh] overflow-y-auto" role="dialog" aria-label={LEGEND.label} data-testid="legend-panel">
          {face === "refused" ? (
            <div className="glass w-[300px] rounded-card p-2" data-testid="legend-panel-refusal">
              {refusal ? <RefusalCard refusal={refusal} compact /> : <p className="px-1 py-2 text-xs text-muted">{LEGEND.asking}</p>}
              <p className="px-1 pt-2 text-micro normal-case tracking-normal text-muted">{LAYERS.magnitude.sentence}</p>
            </div>
          ) : face === "absolute" || face === "categorical" ? (
            <LayerLegend {...data} />
          ) : (
            <div className="glass w-[300px] rounded-card px-3 py-2 text-xs" data-testid="legend-panel-note">
              <div className="micro mb-1">{face === "fixed" ? LEGEND.fixed : LEGEND.relative}</div>
              <p className="text-muted">{note}</p>
              <p className="mt-1.5 border-t border-line/70 pt-1.5 text-micro normal-case tracking-normal text-muted">{LAYERS.magnitude.sentence}</p>
            </div>
          )}
        </div>
      )}
      <div className="glass pill flex max-w-full items-center gap-2 px-3 py-1.5 text-xs text-muted" aria-label={LEGEND.label} data-testid="legend-capsule" data-face={face}>
        {line}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? LEGEND.close : LEGEND.open}
          title={face === "refused" || face === "categorical" ? LEGEND.open : note}
          className="shrink-0 text-muted/70 hover:text-fg"
          data-testid="legend-note"
        >
          <Info size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
