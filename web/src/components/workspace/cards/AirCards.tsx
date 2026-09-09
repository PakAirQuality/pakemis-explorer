"use client";
/**
 * The deck when a pollutant is the metric (the air beta): query_air envelopes, every figure
 * a server string in native kilotonnes. Since the rc49 spatial family the cards are PLACE-
 * and PERIOD-aware: they follow the map selection (a clicked district shows that district,
 * not its province) and the year slider, on the covered-sources scope the nine-year family
 * carries (six sectors; power's screening bound ships beside the panel and is reachable on
 * the Data page, never silently inside these cards). The 1990-2024 series remains the
 * agriculture layer alone, national, and says so.
 */
import { useState } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import { geoGrain } from "@/lib/geography";
import { shown, type Cell } from "@/lib/envelope";
import { cellUnit, districtName, periodShort, sectorLabel } from "@/lib/labels";
import { useAir } from "@/lib/queries";
import { POLLUTANT_LABELS } from "@/lib/explore/query";
import { rampByRank } from "@/lib/palette";
import { ContourMotif } from "@/components/ui/ContourMotif";
import { BarsWithAxis, type BarItem } from "@/components/charts/BarsWithAxis";
import { ColumnChart, type ColumnPoint } from "@/components/charts/ColumnChart";
import { DeckCard, Pending, Figure } from "./DeckCard";

const AIR_YEARS = Array.from({ length: 35 }, (_, i) => String(1990 + i));
const BETA = "A labelled beta in native kilotonnes, outside the CO₂e totals; covered sources only — power and industry are typed absences, and assurance is uneven across the sectors.";

export function AirCards({ pol }: { pol: string }) {
  const { state, labels, dims, defaults } = useExplorer();
  const p = POLLUTANT_LABELS[pol] ?? pol;
  const period = state.period ?? defaults.period_id;
  const placeLevel = state.geo && state.level !== "grid" ? geoGrain(state.geo) : null;
  const placeName = !state.geo ? null : placeLevel === "adm2" ? districtName(dims, state.geo) : state.geo;
  const place = state.geo && placeLevel
    ? { geography_level: placeLevel, geography_ids: [state.geo] }
    : {};
  const scope = {
    pollutants: [pol],
    periods: [period],
    ...place,
    ...(state.sector ? { sectors: [state.sector] } : {}),
  };
  const total = useAir(scope);
  const sources = useAir({ ...scope, group_by: ["sector_id"], order_by: "value desc" });
  // the ranking beside the selection: provinces nationally, the province's own
  // districts once one is on screen (the district rows carry their province, so the
  // slice is the envelope's own grouping, not a second geography)
  const province = placeLevel === "adm2" ? null : placeLevel === "adm1" ? state.geo : null;
  const provinces = useAir(
    province
      ? { pollutants: [pol], periods: [period], geography_level: "adm2", group_by: ["province", "shape_id"], order_by: "value desc" }
      : { pollutants: [pol], periods: [period], geography_level: "adm1", group_by: ["province"], order_by: "value desc" }
  );
  const series = useAir({ pollutants: [pol], periods: dims.fiscalPeriods, ...place, group_by: ["period_id"] });
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
  const placeCells = (provinces.data?.values ?? [])
    .filter((c) => typeof c.value === "number")
    .filter((c) => !province || c.group?.province === province)
    .slice(0, province ? 12 : undefined);
  const provBars: BarItem[] = placeCells.map((c, i, all) => ({
    id: String((province ? c.group?.shape_id : c.group?.province) ?? i),
    name: province ? districtName(dims, String(c.group?.shape_id ?? "")) : String(c.group?.province ?? ""),
    value: c.value as number,
    label: c.share_pct_short && !province ? `${shown(c)} · ${c.share_pct_short} %` : shown(c),
    color: rampByRank(i, all.length),
  }));
  const order = new Map(dims.fiscalPeriods.map((id, i) => [id, i]));
  const seriesPoints: ColumnPoint[] = (series.data?.values ?? [])
    .filter((c) => typeof c.value === "number")
    .sort((a, b) => (order.get(String(a.group?.period_id)) ?? 0) - (order.get(String(b.group?.period_id)) ?? 0))
    .map((c) => ({
      id: String(c.group?.period_id ?? ""),
      name: periodShort(labels, String(c.group?.period_id ?? "")),
      value: c.value as number,
      label: shown(c),
    }));
  const sFirst = seriesPoints[0];
  const sLast = seriesPoints[seriesPoints.length - 1];
  const sCell = series.data?.values.find((c) => typeof c.value === "number") as Cell | undefined;
  const points: ColumnPoint[] = (trend.data?.values ?? [])
    .filter((c) => typeof c.value === "number")
    .map((c) => ({ id: String(c.group?.year ?? ""), name: String(c.group?.year ?? ""), value: c.value as number, label: shown(c) }));
  const first = points[0];
  const last = points[points.length - 1];
  const firstCell = trend.data?.values.find((c) => typeof c.value === "number") as Cell | undefined;
  const here = placeName ? `in ${placeName}` : "nationally";

  return (
    <>
      <DeckCard
        id="air-snapshot"
        title={`${p} · ${placeName ?? "air quality beta"}`}
        env={total.data}
        open={isOpen("snap")}
        onToggle={toggle("snap")}
        sentence={cell ? <>In {periodShort(labels, period)}, the covered sources {here} emitted <Figure cell={cell} unit={cellUnit(cell)} />.</> : null}
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
        title={`${p} by sector${placeName ? ` · ${placeName}` : ""}`}
        env={sources.data}
        open={isOpen("sources")}
        onToggle={toggle("sources")}
        sentence={top ? <><b>{sectorLabel(labels, top.group?.sector_id)}</b> is the largest estimated source {here}, at <Figure cell={top} unit={cellUnit(top)} />{top.share_pct_short ? <> (<b className="num">{top.share_pct_short} %</b>)</> : null}.</> : null}
      >
        {bars.length ? <BarsWithAxis items={bars} ticks={sources.data?.axis?.ticks_short} testId="air-sources-bars" /> : <Pending q={sources} what="the sector layers" />}
      </DeckCard>
      {placeLevel !== "adm2" && (
        <DeckCard
          id="air-provinces"
          title={province ? `${p} · districts of ${province}` : `${p} by province`}
          env={provinces.data}
          open={isOpen("prov")}
          onToggle={toggle("prov")}
          caption={province
            ? "The province’s largest district shares of the covered sources, on the anchor streams’ own geography."
            : "Every covered sector placed with its own streams’ geography; aviation’s cruise share is held at the provinces."}
        >
          {provBars.length ? <BarsWithAxis items={provBars} ticks={province ? undefined : provinces.data?.axis?.ticks_short} testId="air-prov-bars" /> : <Pending q={provinces} what={province ? "the district layer" : "the provincial layer"} />}
        </DeckCard>
      )}
      <DeckCard
        id="air-series"
        title={`${p} across the nine years${placeName ? ` · ${placeName}` : ""}`}
        env={series.data}
        open={isOpen("series")}
        onToggle={toggle("series")}
        sentence={sFirst && sLast && sCell ? <>From <b className="num">{sFirst.label}</b> to <b className="num">{sLast.label}</b> {cellUnit(sCell)}, {sFirst.name} to {sLast.name} — covered sources only.</> : null}
        caption="Most years borrow the reference year’s within-province geography, rescaled; the weight registry says which, per stream and year."
      >
        {seriesPoints.length ? <ColumnChart points={seriesPoints} testId="air-series-chart" /> : <Pending q={series} what="the nine-year series" />}
      </DeckCard>
      {!placeName && (
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
      )}
    </>
  );
}
