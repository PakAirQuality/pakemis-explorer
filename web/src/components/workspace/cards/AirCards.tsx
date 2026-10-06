"use client";
/**
 * The deck when a pollutant is the metric (the air beta): query_air envelopes, every figure
 * a server string in native kilotonnes. Since the rc49 spatial family the cards are PLACE-
 * and PERIOD-aware: they follow the map selection (a clicked district shows that district,
 * not its province) and the year slider, on the covered-sources scope the nine-year family
 * carries: the sectors the release estimates, with grid power kept OUT of every total, ranking
 * and share and stated beside the total as the screening range it is (AirScreeningNote). The
 * bodies are lib/requests.ts airDeckBodies - the same ones the data page and the map send, so
 * the three cannot name different products. The 1990-2024 series remains the agriculture layer
 * alone, national, and says so.
 */
import { useEffect } from "react";
import { useExplorer } from "@/components/ExplorerContext";
import { markStage } from "@/components/shell/bootstrap";
import { geoGrain } from "@/lib/geography";
import { airDeckBodies } from "@/lib/requests";
import { AirScreeningNote } from "@/components/ui/AirScreeningNote";
import { shown, type Cell } from "@/lib/envelope";
import { cellUnit, districtName, periodShort, sectorLabel } from "@/lib/labels";
import { magnitudeOf } from "@/lib/uncertainty";
import { useAir } from "@/lib/queries";
import { POLLUTANT_LABELS } from "@/lib/explore/query";
import { rampByRank } from "@/lib/palette";
import { ContourMotif } from "@/components/ui/ContourMotif";
import { BarsWithAxis, type BarItem } from "@/components/charts/BarsWithAxis";
import { ColumnChart, type ColumnPoint } from "@/components/charts/ColumnChart";
import { DeckCard, Pending, Figure } from "./DeckCard";
import { GasRail } from "../GasRail";
import { YearRail } from "../YearRail";

const BETA = "Beta emissions estimate · covered sources only";


/** The air deck's collapse keys, owned by the Deck's one collapsed map so Collapse all
 * reaches these cards exactly as it reaches the greenhouse set. */
export const AIR_OPEN_IDS = ["snap", "sources", "prov", "trend"] as const;

export function AirCards({ pol, isOpen, toggle }: { pol: string; isOpen: (id: string) => boolean; toggle: (id: string) => (open: boolean) => void }) {
  const { state, setState, labels, dims, defaults } = useExplorer();
  const p = POLLUTANT_LABELS[pol] ?? pol;
  const period = state.period ?? defaults.period_id;
  const placeLevel = state.geo && state.level !== "grid" ? geoGrain(state.geo) : null;
  const placeName = !state.geo ? null : placeLevel === "adm2" ? districtName(dims, state.geo) : state.geo;
  // the ranking beside the selection: provinces nationally, the province's own
  // districts once one is on screen (the district rows carry their province, so the
  // slice is the envelope's own grouping, not a second geography)
  const province = placeLevel === "adm2" ? null : placeLevel === "adm1" ? state.geo : null;
  const bodies = airDeckBodies({ pol, period, sector: state.sector, geo: state.level === "grid" ? null : state.geo }, dims.fiscalPeriods);
  const total = useAir(bodies?.total ?? null);
  const sources = useAir(bodies?.sources ?? null);
  const provinces = useAir(bodies?.places ?? null);
  const series = useAir(bodies?.series ?? null);
  const trend = useAir(bodies?.trend ?? null);
  // the loading screen's third stage, for a visit that opens on a pollutant: this deck's first
  // envelope answered or was refused (the greenhouse deck asks for nothing here, so it cannot)
  useEffect(() => {
    if (total.data || total.isError) markStage("envelope");
  }, [total.data, total.isError]);

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
  const reference = dims.periods.find((x) => String(x.is_reference).toLowerCase() === "true")?.period_id ?? dims.fiscalPeriods[dims.fiscalPeriods.length - 1] ?? "";
  const seriesPoints: ColumnPoint[] = (series.data?.values ?? [])
    .filter((c) => typeof c.value === "number")
    .sort((a, b) => (order.get(String(a.group?.period_id)) ?? 0) - (order.get(String(b.group?.period_id)) ?? 0))
    .map((c) => ({
      id: String(c.group?.period_id ?? ""),
      name: periodShort(labels, String(c.group?.period_id ?? "")),
      value: c.value as number,
      label: shown(c),
      reference: c.group?.period_id === reference,
    }));
  const sCell = series.data?.values.find((c) => typeof c.value === "number") as Cell | undefined;
  const sChange = series.data?.change;
  const sUpDown = sChange?.direction === "rose" ? "up" : sChange?.direction === "fell" ? "down" : null;
  const sPct = sChange?.change_pct_short ? sChange.change_pct_short.replace(/^[+-]/, "") : null;
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
        title={`${p} emissions · ${placeName ?? "Pakistan"}`}
        env={total.data}
        open={isOpen("snap")}
        onToggle={toggle("snap")}
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
        <AirScreeningNote env={total.data} labels={labels} />

        <YearRail periods={dims.fiscalPeriods} current={period} onPick={(pd) => setState({ period: pd })} labels={labels} />

        <div className="mt-4" data-testid="air-series">
          {seriesPoints.length ? <ColumnChart points={seriesPoints} testId="air-series-chart" /> : <Pending q={series} what="the nine-year series" />}
          {cell ? (
            <p className="mt-2 text-xs text-muted" data-testid="air-summary">
              Covered sources emitted <b className="num whitespace-nowrap">{shown(cell)} {cellUnit(cell)}</b> in <b>{periodShort(labels, period)}</b>
              {!sChange || !sCell ? <>.</>
                : period === sChange.to_period ? (
                  sUpDown && sPct
                    ? <> — {sUpDown} <b className="num whitespace-nowrap">{sPct} %</b> from <b className="num whitespace-nowrap">{sChange.from_short} {magnitudeOf(sCell)}</b> in <b>{periodShort(labels, sChange.from_period)}</b>.</>
                    : <> — unchanged since <b>{periodShort(labels, sChange.from_period)}</b>.</>
                ) : sUpDown && sPct ? (
                  <>, {sUpDown === "up" ? "rising" : "falling"} to <b className="num whitespace-nowrap">{sChange.to_short} {magnitudeOf(sCell)}</b> by <b>{periodShort(labels, sChange.to_period)}</b> — {sUpDown === "up" ? "an increase" : "a decrease"} of <b className="num whitespace-nowrap">{sPct} %</b>{period !== sChange.from_period ? <> since <b>{periodShort(labels, sChange.from_period)}</b></> : null}.</>
                ) : (
                  <>; emissions were unchanged between <b>{periodShort(labels, sChange.from_period)}</b> and <b>{periodShort(labels, sChange.to_period)}</b>.</>
                )}
            </p>
          ) : null}
        </div>

        <GasRail />
      </DeckCard>
      <DeckCard
        id="air-sources"
        title={`${p} by sector${placeName ? ` · ${placeName}` : ""}`}
        env={sources.data}
        open={isOpen("sources")}
        onToggle={toggle("sources")}
        sentence={top ? <><b>{sectorLabel(labels, top.group?.sector_id)}</b> is the largest estimated source {here}, at <Figure cell={top} unit={cellUnit(top)} />{top.share_pct_short ? <> (<b className="num">{top.share_pct_short} %</b> of the sources estimated here)</> : null}.</> : null}
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
