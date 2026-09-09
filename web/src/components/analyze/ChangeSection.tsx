"use client";
/**
 * What changed between two years, and which sources did it: one compare_emissions call
 * per grain, each answer a server envelope whose deltas are exact differences of two
 * exact sums. The waterfall walks the left total to the right total; clicking a step
 * re-asks the same question inside that source (sector → categories → streams). The
 * browser signs a positive label and sizes the bars; it subtracts nothing.
 */
import { useEffect, useState } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import { useCompare } from "@/lib/queries";
import { cellUnit, periodShort, sectorLabel } from "@/lib/labels";
import { shown, type Cell } from "@/lib/envelope";
import { SELECT_CLASS } from "@/components/ui/ControlsCard";
import { WaterfallChart, type WaterfallStep } from "@/components/charts/WaterfallChart";
import { ANALYZE } from "./copy";
import { Section, Finding } from "./Section";

type Side = { display_short?: string; value?: number | null; unit?: string; unit_short?: string; group?: Record<string, string | null> };
const side = (c: Cell, which: "left" | "right") => (c as unknown as Record<string, Side | undefined>)[which];
const signed = (c: Cell) => ((c.value ?? 0) > 0 ? `+${c.display_short ?? c.display}` : (c.display_short ?? c.display));

export type ChangeScope = { period: string | null; sector: string | null };

export function ChangeSection({ onScope }: { onScope?: (s: ChangeScope) => void }) {
  const { labels, dims } = useExplorer();
  const periods = dims.fiscalPeriods;
  const [fromP, setFromP] = useState(periods[0] ?? "");
  const [toP, setToP] = useState(periods[periods.length - 1] ?? "");
  const [drill, setDrill] = useState<{ sector: string | null; category: string | null }>({ sector: null, category: null });

  // the map beside the column mirrors this section: the To year and the source under study
  useEffect(() => onScope?.({ period: toP || null, sector: drill.sector }), [onScope, toP, drill.sector]);

  const pair = (extra: object, group: string) => ({
    left: { periods: [fromP], group_by: [group], ...extra },
    right: { periods: [toP], group_by: [group], ...extra },
    mode: "absolute" as const,
  });
  const total = useCompare({ left: { periods: [fromP] }, right: { periods: [toP] }, mode: "absolute" }, !!fromP && !!toP && fromP !== toP);
  const grain = drill.category && drill.sector
    ? pair({ sectors: [drill.sector], categories: [drill.category] }, "subitem")
    : drill.sector
      ? pair({ sectors: [drill.sector] }, "category")
      : pair({}, "sector_id");
  const cmp = useCompare(grain, !!fromP && !!toP && fromP !== toP);

  const totalCell = total.data?.values[0];
  const tLeft = totalCell ? side(totalCell, "left") : undefined;
  const tRight = totalCell ? side(totalCell, "right") : undefined;
  const groupKey = drill.category ? "subitem" : drill.sector ? "category" : "sector_id";
  const nameOf = (id: string) => (groupKey === "sector_id" ? sectorLabel(labels, id) : id);
  const deltas = (cmp.data?.values ?? [])
    .filter((c) => typeof c.value === "number")
    // compare_emissions pairs its two sides by position; a cell whose sides disagree on
    // the group is a misaligned pair (engine defect, 2026-09-09) and must not be drawn
    .filter((c) => {
      const l = side(c, "left")?.group?.[groupKey];
      const r = side(c, "right")?.group?.[groupKey];
      return l != null && l === r;
    })
    .map((c) => ({ c, id: String(side(c, "left")?.group?.[groupKey] ?? "") }))
    .sort((a, b) => Math.abs(b.c.value as number) - Math.abs(a.c.value as number));

  const startEnd = ((): { start: WaterfallStep; end: WaterfallStep } | null => {
    if (!totalCell || !tLeft || !tRight) return null;
    if (!drill.sector) {
      return {
        start: { id: "start", name: periodShort(labels, fromP), value: (tLeft.value as number) ?? 0, label: tLeft.display_short ?? "", kind: "start" },
        end: { id: "end", name: periodShort(labels, toP), value: (tRight.value as number) ?? 0, label: tRight.display_short ?? "", kind: "end" },
      };
    }
    // inside a source the chart shows the steps alone: their endpoint sums belong to
    // the parent grain's envelope, and nothing here re-adds them
    return null;
  })();

  const steps: WaterfallStep[] = [];
  if (!drill.sector && startEnd) steps.push(startEnd.start);
  for (const { c, id } of deltas) steps.push({ id, name: nameOf(id), value: c.value as number, label: signed(c), kind: "delta" });
  if (!drill.sector && startEnd) steps.push(startEnd.end);

  const top = deltas[0];
  const unit = tLeft ? cellUnit(tLeft as Cell) : "Mt CO₂e";
  const grewOrFell = totalCell && (totalCell.value ?? 0) >= 0 ? "grew" : "fell";

  const title = drill.category ?? (drill.sector ? sectorLabel(labels, drill.sector) : null);
  return (
    <Section id="change" title={ANALYZE.change.title} dek={ANALYZE.change.dek} more={ANALYZE.change.more}>
      <div className="mb-4 flex flex-wrap items-end gap-3" data-testid="change-controls">
        <label className="flex flex-col gap-1 text-xs text-muted">
          {ANALYZE.change.from}
          <select className={SELECT_CLASS} value={fromP} onChange={(e) => setFromP(e.target.value)} data-testid="change-from">
            {periods.map((p) => <option key={p} value={p}>{periodShort(labels, p)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {ANALYZE.change.to}
          <select className={SELECT_CLASS} value={toP} onChange={(e) => setToP(e.target.value)} data-testid="change-to">
            {periods.map((p) => <option key={p} value={p}>{periodShort(labels, p)}</option>)}
          </select>
        </label>
        {title && (
          <button type="button" className="pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-accent-soft" onClick={() => setDrill(drill.category ? { sector: drill.sector, category: null } : { sector: null, category: null })} data-testid="change-back">
            {ANALYZE.change.back}
          </button>
        )}
        {title && <span className="text-sm font-semibold text-fg" data-testid="change-scope">{title}</span>}
      </div>

      {steps.length > (drill.sector ? 0 : 2) ? (
        <WaterfallChart
          steps={steps}
          unit={unit}
          onPick={drill.category ? undefined : (id) => setDrill(drill.sector ? { sector: drill.sector, category: id } : { sector: id, category: null })}
          testId="change-waterfall"
        />
      ) : (
        <p className="py-8 text-sm text-muted" data-testid="change-pending">{cmp.isError ? "The release refuses this comparison." : "Comparing…"}</p>
      )}

      {totalCell && tLeft && tRight && top && !drill.sector ? (
        <Finding testId="change-finding">
          Emissions {grewOrFell} by <b className="num whitespace-nowrap">{signed(totalCell)} {unit}</b> between{" "}
          <b>{periodShort(labels, fromP)}</b> and <b>{periodShort(labels, toP)}</b> — from{" "}
          <b className="num whitespace-nowrap">{tLeft.display_short}</b> to <b className="num whitespace-nowrap">{tRight.display_short}</b>.{" "}
          <b>{nameOf(top.id)}</b> contributed the largest single step of that change: <b className="num whitespace-nowrap">{signed(top.c)}</b>.
        </Finding>
      ) : top && drill.sector ? (
        <Finding testId="change-finding">
          Inside <b>{title}</b>, <b>{top.id}</b> moved the most between <b>{periodShort(labels, fromP)}</b> and{" "}
          <b>{periodShort(labels, toP)}</b>: <b className="num whitespace-nowrap">{signed(top.c)} {unit}</b>.
        </Finding>
      ) : null}

      <p className="mt-3 text-xs text-muted/90" data-testid="change-note">{ANALYZE.change.caution}</p>
    </Section>
  );
}
