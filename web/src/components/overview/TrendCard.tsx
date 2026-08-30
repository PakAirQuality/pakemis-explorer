"use client";
/** "How emissions changed": the national annual series under the view's configuration and basis, as the TrendChart (first, last and reference points labelled with their `display_short`; no invented ticks), with its unit line and Result details. */
import { useMemo } from "react";
import Link from "next/link";
import { useExplorer } from "@/components/ExplorerContext";
import { seriesBody } from "@/lib/requests";
import { useReferencePeriod, useTimeseries } from "@/lib/queries";
import { configWords, figureUnitLine, periodShort } from "@/lib/labels";
import { TrendChart } from "@/components/ui/TrendChart";
import { RefusalCard } from "@/components/ui/RefusalCard";
import { countWords, TREND_CARD } from "./copy";

export function TrendCard() {
  const { state, labels, dims } = useExplorer();
  const body = useMemo(() => seriesBody({ config: state.config, gwp: state.gwp, sector: null, gas: null }), [state.config, state.gwp]);
  const series = useTimeseries(body);
  const reference = useReferencePeriod();
  const label = useMemo(() => (id: string) => periodShort(labels, id), [labels]);
  return (
    <section className="card flex flex-col p-5" data-testid="trend-card">
      <h2 className="text-md font-semibold">{TREND_CARD.title}</h2>
      <div className="text-xs text-muted" data-testid="trend-card-subtitle">
        {countWords(dims.fiscalPeriods.length, "fiscal year")} · {configWords(labels, state.config)}
      </div>
      <div className="mt-4 flex-1">
        {series.error ? <RefusalCard error={series.error} compact /> : <TrendChart env={series.data} referencePeriod={reference} periodLabel={label} height={170} title="Pakistan's greenhouse-gas emissions, by year" subtitle={figureUnitLine(series.data, true)} />}
      </div>
      <div className="mt-3 text-right">
        <Link href="/explore" className="text-xs text-accent hover:underline" data-testid="trend-link">{TREND_CARD.link}</Link>
      </div>
    </section>
  );
}
