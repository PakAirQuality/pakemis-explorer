"use client";
/**
 * The deck when a pollutant is the metric (the air beta): four cards over query_air envelopes,
 * every figure a server string in native kilotonnes. The snapshot names the beta plainly; the
 * sources card is the seven sector layers; the provinces and trend cards are the agriculture
 * layer alone (the only spatial and historical air grains) and say so. A sector filter rides
 * the snapshot and sources; the two agriculture cards ignore it by construction and their
 * captions carry that.
 */
import { useState } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import { shown, type Cell } from "@/lib/envelope";
import { cellUnit, sectorLabel } from "@/lib/labels";
import { useAir } from "@/lib/queries";
import { POLLUTANT_LABELS } from "@/lib/explore/query";
import { rampByRank } from "@/lib/palette";
import { ContourMotif } from "@/components/ui/ContourMotif";
import { BarsWithAxis, type BarItem } from "@/components/charts/BarsWithAxis";
import { ColumnChart, type ColumnPoint } from "@/components/charts/ColumnChart";
import { DeckCard, Pending, Figure } from "./DeckCard";

const AIR_YEARS = Array.from({ length: 35 }, (_, i) => String(1990 + i));
const BETA = "A labelled beta in native kilotonnes, outside the CO₂e totals; assurance is uneven across the sectors.";

export function AirCards({ pol }: { pol: string }) {
  const { state, labels } = useExplorer();
  const p = POLLUTANT_LABELS[pol] ?? pol;
  const scope = { pollutants: [pol], ...(state.sector ? { sectors: [state.sector] } : {}) };
  const total = useAir(scope);
  const sources = useAir({ ...scope, group_by: ["sector_id"], order_by: "value desc" });
  const provinces = useAir({ pollutants: [pol], geography_level: "adm1", group_by: ["province"], order_by: "value desc" });
  const trend = useAir({ pollutants: [pol], years: AIR_YEARS, group_by: ["year"] });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => open[id] !== false;
  const toggle = (id: string) => (o: boolean) => setOpen((c) => ({ ...c, [id]: o }));

  const cell = total.data?.values.find((c) => typeof c.value === "number") ?? null;
  const top = sources.data?.values.find((c) => typeof c.value === "number") ?? null;
  const bars: BarItem[] = (sources.data?.values ?? [])
    .filter((c) => typeof c.value === "number")
    .map((c, i, all) => ({
      id: String(c.group?.sector_id ?? i),
      name: sectorLabel(labels, c.group?.sector_id),
      value: c.value as number,
      label: c.share_pct_short ? `${shown(c)} · ${c.share_pct_short} %` : shown(c),
      color: rampByRank(i, all.length),
    }));
  const provBars: BarItem[] = (provinces.data?.values ?? [])
    .filter((c) => typeof c.value === "number")
    .map((c, i, all) => ({
      id: String(c.group?.province ?? i),
      name: String(c.group?.province ?? ""),
      value: c.value as number,
      label: c.share_pct_short ? `${shown(c)} · ${c.share_pct_short} %` : shown(c),
      color: rampByRank(i, all.length),
    }));
  const points: ColumnPoint[] = (trend.data?.values ?? [])
    .filter((c) => typeof c.value === "number")
    .map((c) => ({ id: String(c.group?.year ?? ""), name: String(c.group?.year ?? ""), value: c.value as number, label: shown(c) }));
  const first = points[0];
  const last = points[points.length - 1];
  const firstCell = trend.data?.values.find((c) => typeof c.value === "number") as Cell | undefined;

  return (
    <>
      <DeckCard
        id="air-snapshot"
        title={`${p} · air quality beta`}
        env={total.data}
        open={isOpen("snap")}
        onToggle={toggle("snap")}
        sentence={cell ? <>In the layer&apos;s own year, the covered sources emitted <Figure cell={cell} unit={cellUnit(cell)} />.</> : null}
        caption={BETA}
      >
        {cell ? (
          <div className="relative" data-testid="air-figure">
            <ContourMotif corner="bottom-right" />
            <div className="relative flex flex-wrap items-baseline gap-x-2">
              <span className="num text-3xl font-semibold tracking-tight text-accent" data-testid="air-display" title={`${cell.display} ${cell.unit}`}>{shown(cell)}</span>
              <span className="text-sm text-muted">{cellUnit(cell)}</span>
            </div>
          </div>
        ) : (
          <Pending q={total} what={`the ${p} total`} />
        )}
      </DeckCard>
      <DeckCard
        id="air-sources"
        title={`${p} by sector`}
        env={sources.data}
        open={isOpen("sources")}
        onToggle={toggle("sources")}
        sentence={top ? <><b>{sectorLabel(labels, top.group?.sector_id)}</b> is the largest estimated source, at <Figure cell={top} unit={cellUnit(top)} />{top.share_pct_short ? <> (<b className="num">{top.share_pct_short} %</b>)</> : null}.</> : null}
      >
        {bars.length ? <BarsWithAxis items={bars} ticks={sources.data?.axis?.ticks_short} testId="air-sources-bars" /> : <Pending q={sources} what="the sector layers" />}
      </DeckCard>
      <DeckCard
        id="air-provinces"
        title={`${p} by province`}
        env={provinces.data}
        open={isOpen("prov")}
        onToggle={toggle("prov")}
        caption="The agriculture layer alone: the only air layer with a provincial allocation."
      >
        {provBars.length ? <BarsWithAxis items={provBars} ticks={provinces.data?.axis?.ticks_short} testId="air-prov-bars" /> : <Pending q={provinces} what="the provincial layer" />}
      </DeckCard>
      <DeckCard
        id="air-trend"
        title={`${p} since 1990`}
        env={trend.data}
        open={isOpen("trend")}
        onToggle={toggle("trend")}
        sentence={first && last && firstCell ? <>From <b className="num">{first.label}</b> to <b className="num">{last.label}</b> {cellUnit(firstCell)}, {first.id} to {last.id} — the agriculture layer alone.</> : null}
      >
        {points.length ? <ColumnChart points={points} testId="air-trend-chart" /> : <Pending q={trend} what="the 1990–2024 series" />}
      </DeckCard>
    </>
  );
}
