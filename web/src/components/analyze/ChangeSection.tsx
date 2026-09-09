"use client";
/**
 * The WHAT CHANGED card: the waterfall at the left on a real y-axis (the national
 * series envelope's own tick labels), the KEY FINDING panel at the right - the bold
 * sentence, the overall relative change (the compare function's own percent cell),
 * and the largest offsetting source. Every delta is compare_emissions' exact
 * difference; clicking a bar re-asks the question inside that source. The browser
 * signs positive labels and sizes bars; it subtracts nothing.
 */
import { useRef, useState } from "react";
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

export function ChangeSection({ settings }: { settings: AnalyzeSettings }) {
  const { labels } = useExplorer();
  const { from: fromP, to: toP, gases } = settings;
  const [drill, setDrill] = useState<{ sector: string | null; category: string | null }>({ sector: null, category: null });
  const chartRef = useRef<HTMLDivElement>(null);

  const gasFilter = gases ? { gases } : {};
  const enabled = !!fromP && !!toP && fromP !== toP;
  const pair = (extra: object, group: string, mode: "absolute" | "relative" = "absolute") => ({
    left: { periods: [fromP], group_by: [group], ...gasFilter, ...extra },
    right: { periods: [toP], group_by: [group], ...gasFilter, ...extra },
    mode,
  });
  const total = useCompare({ left: { periods: [fromP], ...gasFilter }, right: { periods: [toP], ...gasFilter }, mode: "absolute" }, enabled);
  const relative = useCompare({ left: { periods: [fromP], ...gasFilter }, right: { periods: [toP], ...gasFilter }, mode: "relative" }, enabled);
  const grain = drill.category && drill.sector
    ? pair({ sectors: [drill.sector], categories: [drill.category] }, "subitem")
    : drill.sector
      ? pair({ sectors: [drill.sector] }, "category")
      : pair({}, "sector_id");
  const cmp = useCompare(grain, enabled);
  const series = useNationalSeries();

  const totalCell = total.data?.values[0];
  const relCell = relative.data?.values[0];
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
  const largestOffset = deltas.find(({ c }) => (c.value as number) < 0);
  const unit = tLeft ? cellUnit(tLeft as Cell) : "Mt CO₂e";
  const grew = (totalCell?.value ?? 0) >= 0;
  const title = drill.category ?? (drill.sector ? sectorLabel(labels, drill.sector) : null);

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
      eyebrow={ANALYZE.change.eyebrow}
      title={ANALYZE.change.title}
      action={
        <button type="button" onClick={download} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft" data-testid="change-download">
          <Download size={14} aria-hidden="true" /> {ANALYZE.change.download}
        </button>
      }
      more={ANALYZE.change.more}
    >
      {title && (
        <div className="mb-3 flex items-center gap-3" data-testid="change-breadcrumb">
          <button type="button" className="pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-accent-soft" onClick={() => setDrill(drill.category ? { sector: drill.sector, category: null } : { sector: null, category: null })} data-testid="change-back">
            {ANALYZE.change.back}
          </button>
          <span className="text-sm font-semibold text-fg" data-testid="change-scope">{title}</span>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
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
        </div>

        <aside className="rounded-xl bg-surface p-4" data-testid="change-key-finding">
          <div className="micro">{ANALYZE.change.keyFinding}</div>
          {totalCell && tLeft && tRight && top ? (
            <>
              <p className="mt-2 text-[15px] font-semibold leading-snug text-fg" data-testid="change-finding">
                {drill.sector ? (
                  <>Inside {title}, <b>{top.id}</b> moved the most: <span className="num whitespace-nowrap">{signed(top.c)} {unit}</span>.</>
                ) : (
                  <>Emissions {grew ? "increased" : "decreased"} by <span className="num whitespace-nowrap">{signed(totalCell)} {unit}</span> between {periodShort(labels, fromP)} and {periodShort(labels, toP)}.</>
                )}
              </p>
              {!drill.sector && (
                <p className="mt-1.5 text-sm text-muted" data-testid="change-finding-top">
                  {nameOf(top.id)} contributed the largest {(top.c.value as number) >= 0 ? "increase" : "decrease"}: <b className="num whitespace-nowrap text-fg">{signed(top.c)} {unit}</b>.
                </p>
              )}
              <dl className="mt-3.5 flex flex-col gap-1.5 text-sm">
                {relCell && (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2">
                    <dt className="text-muted">{ANALYZE.change.overallChange}</dt>
                    <dd className="num font-semibold text-fg" data-testid="change-overall-pct">{signed(relCell)} %</dd>
                  </div>
                )}
                {!drill.sector && largestOffset && (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2">
                    <dt className="text-muted">{ANALYZE.change.largestOffset}</dt>
                    <dd className="num font-semibold text-fg" data-testid="change-largest-offset">{nameOf(largestOffset.id)} {signed(largestOffset.c)}</dd>
                  </div>
                )}
              </dl>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">Comparing…</p>
          )}
        </aside>
      </div>

      <InfoStrip>{ANALYZE.change.caution}</InfoStrip>
    </AnalysisCard>
  );
}
