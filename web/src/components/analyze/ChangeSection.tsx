"use client";
/**
 * The WHAT CHANGED card: the waterfall at the left on a real y-axis (the national
 * series envelope's own tick labels), the KEY FINDING panel at the right - the bold
 * sentence, the overall relative change (the compare function's own percent cell),
 * and the largest offsetting source. Every delta is compare_emissions' exact
 * difference; clicking a bar re-asks the question inside that source. The browser
 * signs positive labels and sizes bars; it subtracts nothing.
 */
import { useRef } from "react";
import { Download } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { useCompare, useNationalSeries } from "@/lib/queries";
import { cellUnit, periodShort, sectorLabel } from "@/lib/labels";
import { type Cell } from "@/lib/envelope";
import { WaterfallChart, type WaterfallStep } from "@/components/charts/WaterfallChart";
import { ANALYZE } from "./copy";
import { AnalysisCard, InfoStrip } from "./Section";
import type { AnalyzeSettings } from "./Analyze";

type Side = { display_short?: string; value?: number | null; unit?: string; unit_short?: string; group?: Record<string, string | null> };
export const side = (c: Cell, which: "left" | "right") => (c as unknown as Record<string, Side | undefined>)[which];
export const signed = (c: Cell) => ((c.value ?? 0) > 0 ? `+${c.display_short ?? c.display}` : (c.display_short ?? c.display));

/** The sector compare's aligned delta cells (misaligned pairs dropped - the engine
 * zips by position; found 2026-09-09), sorted by magnitude. */
export function alignedDeltas(cells: Cell[] | undefined, groupKey: string) {
  return (cells ?? [])
    .filter((c) => typeof c.value === "number")
    .filter((c) => {
      const l = side(c, "left")?.group?.[groupKey];
      const r = side(c, "right")?.group?.[groupKey];
      return l != null && l === r;
    })
    .map((c) => ({ c, id: String(side(c, "left")?.group?.[groupKey] ?? "") }))
    .sort((a, b) => Math.abs(b.c.value as number) - Math.abs(a.c.value as number));
}

export type Drill = { sector: string | null; category: string | null };

export function ChangeSection({ settings, drill, onDrill }: { settings: AnalyzeSettings; drill: Drill; onDrill: (d: Drill) => void }) {
  const { labels } = useExplorer();
  const { from: fromP, to: toP, gases } = settings;
  const setDrill = onDrill;
  const chartRef = useRef<HTMLDivElement>(null);

  const gasFilter = gases ? { gases } : {};
  const enabled = !!fromP && !!toP && fromP !== toP;
  const pair = (extra: object, group: string, mode: "absolute" | "relative" = "absolute") => ({
    left: { periods: [fromP], group_by: [group], ...gasFilter, ...extra },
    right: { periods: [toP], group_by: [group], ...gasFilter, ...extra },
    mode,
  });
  const total = useCompare({ left: { periods: [fromP], ...gasFilter }, right: { periods: [toP], ...gasFilter }, mode: "absolute" }, enabled);
  const grain = drill.category && drill.sector
    ? pair({ sectors: [drill.sector], categories: [drill.category] }, "subitem")
    : drill.sector
      ? pair({ sectors: [drill.sector] }, "category")
      : pair({}, "sector_id");
  const cmp = useCompare(grain, enabled);
  const sectorCmp = useCompare(pair({}, "sector_id"), enabled);
  const series = useNationalSeries();

  const totalCell = total.data?.values[0];
  const tLeft = totalCell ? side(totalCell, "left") : undefined;
  const tRight = totalCell ? side(totalCell, "right") : undefined;
  const groupKey = drill.category ? "subitem" : drill.sector ? "category" : "sector_id";
  const nameOf = (id: string) => (groupKey === "sector_id" ? sectorLabel(labels, id) : id);
  const deltas = alignedDeltas(cmp.data?.values, groupKey);

  const steps: WaterfallStep[] = [];
  if (!drill.sector && totalCell && tLeft && tRight) {
    steps.push({ id: "start", name: periodShort(labels, fromP), value: (tLeft.value as number) ?? 0, label: tLeft.display_short ?? "", kind: "start" });
  }
  for (const { c, id } of deltas) steps.push({ id, name: nameOf(id), value: c.value as number, label: signed(c), kind: "delta" });
  if (!drill.sector && totalCell && tLeft && tRight) {
    steps.push({ id: "end", name: periodShort(labels, toP), value: (tRight.value as number) ?? 0, label: tRight.display_short ?? "", kind: "end" });
  }

  const top = deltas[0];
  const unit = tLeft ? cellUnit(tLeft as Cell) : "Mt CO₂e";
  const title = drill.category ?? (drill.sector ? sectorLabel(labels, drill.sector) : null);

  // THE HEADING ANSWERS THE TAB. The denominator for "most of" is the scope's own
  // total: the national change, or the drilled sector's own step. Sign and ratio
  // are compared, never printed - every printed number stays a server string.
  const sectorDeltas = alignedDeltas(sectorCmp.data?.values, "sector_id");
  const denomCell: Cell | null = drill.category
    ? null
    : drill.sector
      ? (sectorDeltas.find((d) => d.id === drill.sector)?.c ?? null)
      : (totalCell ?? null);
  const wordOf = (v: number, rise: string, fall: string, flat: string) => (v > 0 ? rise : v < 0 ? fall : flat);
  const spanWords = `${periodShort(labels, fromP)} → ${periodShort(labels, toP)}`;
  const eyebrow = title ? `${title} · ${spanWords}` : spanWords;
  const headline = ((): string => {
    if (!top) return ANALYZE.change.loading;
    const name = nameOf(top.id);
    const d = top.c.value as number;
    const t = denomCell?.value;
    if (typeof t !== "number" || t === 0) return `${name} made the largest contribution to the change`;
    if (t > 0 && d >= 0) return Math.abs(d) > Math.abs(t) / 2 ? `${name} drove most of the rise` : `${name} made the largest contribution to the rise`;
    if (t < 0 && d <= 0) return Math.abs(d) > Math.abs(t) / 2 ? `${name} accounted for most of the reduction` : `${name} accounted for the largest reduction`;
    return `${name} made the largest contribution to the change`;
  })();
  const dek = ((): string | undefined => {
    if (drill.category) return `How each stream contributed to the change inside ${drill.category}.`;
    if (drill.sector && denomCell) return `How each category contributed to ${sectorLabel(labels, drill.sector)}'s ${signed(denomCell)} ${unit} ${wordOf(denomCell.value ?? 0, "increase", "decrease", "change")}.`;
    if (totalCell) return `How each sector contributed to the ${totalCell.display_short ?? totalCell.display} ${unit} ${wordOf(totalCell.value ?? 0, "increase", "decrease", "change")}.`;
    return undefined;
  })();

  const download = () => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pakemis-change-${fromP}-${toP}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <AnalysisCard
      id="change"
      eyebrow={eyebrow}
      title={headline}
      dek={dek}
      action={
        <button type="button" onClick={download} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft" data-testid="change-download">
          <Download size={14} aria-hidden="true" /> {ANALYZE.change.download}
        </button>
      }
    >
      {title && (
        <div className="mb-3 flex items-center gap-3" data-testid="change-breadcrumb">
          <button type="button" className="pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-accent-soft" onClick={() => setDrill(drill.category ? { sector: drill.sector, category: null } : { sector: null, category: null })} data-testid="change-back">
            {ANALYZE.change.back}
          </button>
          <span className="text-sm font-semibold text-fg" data-testid="change-scope">{title}</span>
        </div>
      )}

      <div ref={chartRef}>
        {steps.length > (drill.sector ? 0 : 2) ? (
          <WaterfallChart
            steps={steps}
            unit={unit}
            ticks={drill.sector ? undefined : series.data?.axis?.ticks_short}
            onPick={drill.category ? undefined : (id) => setDrill(drill.sector ? { sector: drill.sector, category: id } : { sector: id, category: null })}
            testId="change-waterfall"
          />
        ) : (
          <p className="py-10 text-sm text-muted" data-testid="change-pending">{cmp.isError ? "The release refuses this comparison." : "Comparing…"}</p>
        )}
        {drill.sector && top && (
          <p className="mt-1 text-sm text-muted" data-testid="change-drill-finding">
            Inside <b className="text-fg">{title}</b>, <b className="text-fg">{top.id}</b> moved the most between {periodShort(labels, fromP)} and {periodShort(labels, toP)}: <b className="num whitespace-nowrap text-fg">{signed(top.c)} {unit}</b>.
          </p>
        )}
      </div>

      <InfoStrip>{ANALYZE.change.caution}</InfoStrip>
    </AnalysisCard>
  );
}
