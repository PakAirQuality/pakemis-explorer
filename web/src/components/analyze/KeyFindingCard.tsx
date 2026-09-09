"use client";
/**
 * The rail's KEY FINDING card - and, once a sector is clicked, the SECTOR EXPLAINER.
 * National: the span-level answer in words (the bold sentence, the largest
 * contributor, the relative compare's own percent, the largest offset). Drilled: the
 * sector's own step, WHERE it is concentrated (the top same-sign category deltas -
 * never "why": attribution to activity or factors needs year-by-year activity data
 * the release does not publish, and the footer says so), the top category's
 * published envelope, and the door to its sources and method. Every printed number
 * is a server string; the compare bodies are identical to the chart's, so the cache
 * serves both from one fetch.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { useCompare, useUncertainty } from "@/lib/queries";
import { cellUnit, periodShort, sectorLabel } from "@/lib/labels";
import { type Cell } from "@/lib/envelope";
import { DECK_CARD } from "@/components/overview/deck";
import { ANALYZE } from "./copy";
import { alignedDeltas, side, signed, type Drill } from "./ChangeSection";
import type { AnalyzeSettings } from "./Analyze";

const ROW = "flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2";

export function KeyFindingCard({ settings, drill }: { settings: AnalyzeSettings; drill: Drill }) {
  const { labels } = useExplorer();
  const { from: fromP, to: toP, gases } = settings;
  const gasFilter = gases ? { gases } : {};
  const enabled = !!fromP && !!toP && fromP !== toP;
  const total = useCompare({ left: { periods: [fromP], ...gasFilter }, right: { periods: [toP], ...gasFilter }, mode: "absolute" }, enabled);
  const relative = useCompare({ left: { periods: [fromP], ...gasFilter }, right: { periods: [toP], ...gasFilter }, mode: "relative" }, enabled);
  const cmp = useCompare({ left: { periods: [fromP], group_by: ["sector_id"], ...gasFilter }, right: { periods: [toP], group_by: ["sector_id"], ...gasFilter }, mode: "absolute" }, enabled);
  // the drilled sector's category steps: the same body the chart's drill asks for
  const catCmp = useCompare(
    drill.sector
      ? { left: { periods: [fromP], group_by: ["category"], sectors: [drill.sector], ...gasFilter }, right: { periods: [toP], group_by: ["category"], sectors: [drill.sector], ...gasFilter }, mode: "absolute" }
      : null,
    enabled && !!drill.sector,
  );
  const envs = useUncertainty({ scope: "categories", resolution: "annual_national" }, !!drill.sector);

  const totalCell = total.data?.values[0];
  const relCell = relative.data?.values[0];
  const tLeft = totalCell ? side(totalCell, "left") : undefined;
  const deltas = alignedDeltas(cmp.data?.values, "sector_id");
  const unit = tLeft ? cellUnit(tLeft as Cell) : "Mt CO₂e";

  if (drill.sector) {
    const sectorStep = deltas.find((d) => d.id === drill.sector)?.c ?? null;
    const rising = (sectorStep?.value ?? 0) >= 0;
    const catDeltas = alignedDeltas(catCmp.data?.values, "category");
    const sameSign = catDeltas.filter(({ c }) => ((c.value as number) >= 0) === rising);
    const [cat1, cat2] = sameSign;
    const envRow = (envs.data?.values ?? [])
      .map((c) => c as Cell & { category?: string; module?: string; envelope?: { low_pct?: string; high_pct?: string } })
      .find((c) => c.module === drill.sector && c.category === cat1?.id);
    return (
      <section className={DECK_CARD} data-testid="change-key-finding">
        <div className="text-xs font-semibold text-accent" data-testid="explainer-eyebrow">
          <span className="uppercase tracking-[0.08em]">{sectorLabel(labels, drill.sector)}</span>
          {sectorStep ? <> · <span className="num">{signed(sectorStep)} {unit}</span></> : null}
        </div>
        <h2 className="mt-2 text-[17px] font-semibold leading-snug text-fg" data-testid="explainer-title">
          Where the {rising ? "increase" : "reduction"} is concentrated
        </h2>
        {cat1 ? (
          <p className="mt-1.5 text-sm text-muted" data-testid="explainer-sentence">
            The estimated {rising ? "increase" : "decline"} is concentrated in <b className="text-fg">{cat1.id}</b> (<span className="num">{signed(cat1.c)}</span>)
            {cat2 ? <> and <b className="text-fg">{cat2.id}</b> (<span className="num">{signed(cat2.c)}</span>)</> : null}.
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-muted">Comparing…</p>
        )}
        {cat1 && (
          <dl className="mt-3.5 flex flex-col gap-1.5 text-sm">
            <div className={ROW}>
              <dt className="text-muted">{ANALYZE.explainer.mainContributor}</dt>
              <dd className="min-w-0 truncate font-semibold text-fg" data-testid="explainer-main">{cat1.id}</dd>
            </div>
            <div className={ROW}>
              <dt className="text-muted">{ANALYZE.explainer.itsChange}</dt>
              <dd className="num font-semibold text-fg" data-testid="explainer-delta">{signed(cat1.c)} {unit}</dd>
            </div>
            {envRow?.envelope?.low_pct && (
              <div className={ROW}>
                <dt className="text-muted">{ANALYZE.explainer.envelopeRow}</dt>
                <dd className="num font-semibold text-fg" data-testid="explainer-envelope">{envRow.envelope.low_pct} / +{envRow.envelope.high_pct} %</dd>
              </div>
            )}
          </dl>
        )}
        <Link href={`/methods/sectors/${drill.sector}`} className="mt-3.5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline" data-testid="explainer-methods">
          {ANALYZE.explainer.methods} <ArrowRight size={14} aria-hidden="true" />
        </Link>
        <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-relaxed text-muted/90" data-testid="explainer-footer">{ANALYZE.explainer.footer}</p>
      </section>
    );
  }

  const top = deltas[0];
  const largestOffset = deltas.find(({ c }) => (c.value as number) < 0);
  const grew = (totalCell?.value ?? 0) >= 0;

  return (
    <section className={DECK_CARD} data-testid="change-key-finding">
      <div className="micro text-accent">{ANALYZE.change.keyFinding}</div>
      {totalCell && top ? (
        <>
          <p className="mt-2 text-[17px] font-semibold leading-snug text-fg" data-testid="change-finding">
            Emissions {grew ? "increased" : "decreased"} by <span className="num whitespace-nowrap">{signed(totalCell)} {unit}</span> between {periodShort(labels, fromP)} and {periodShort(labels, toP)}.
          </p>
          <p className="mt-1.5 text-sm text-muted" data-testid="change-finding-top">
            {sectorLabel(labels, top.id)} contributed the largest {(top.c.value as number) >= 0 ? "increase" : "decrease"}: <b className="num whitespace-nowrap text-fg">{signed(top.c)} {unit}</b>.
          </p>
          <dl className="mt-3.5 flex flex-col gap-1.5 text-sm">
            {relCell && (
              <div className={ROW}>
                <dt className="text-muted">{ANALYZE.change.overallChange}</dt>
                <dd className="num font-semibold text-fg" data-testid="change-overall-pct">{signed(relCell)} %</dd>
              </div>
            )}
            {largestOffset && (
              <div className={ROW}>
                <dt className="text-muted">{ANALYZE.change.largestOffset}</dt>
                <dd className="num font-semibold text-fg" data-testid="change-largest-offset">{sectorLabel(labels, largestOffset.id)} {signed(largestOffset.c)}</dd>
              </div>
            )}
          </dl>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">Comparing…</p>
      )}
    </section>
  );
}
