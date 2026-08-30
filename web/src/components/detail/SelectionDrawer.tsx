"use client";
/**
 * The Map page's selected-geography drawer: Pakistan when nothing is selected, else the
 * province, the district (ADM2 shape) or the grid cell under `geo` / `cell`, as five tabs
 * (URL `tab`): Summary (the value as `display_short` with its unit, the placed / unallocated
 * sentence from the envelope's `derived`, how to read the map, Ask about this, Open supporting
 * rows) · Breakdown (sectors, or the spatial views, with the server's share) · Trend (the
 * annual series where the release answers it; a typed refusal by name elsewhere) · Evidence
 * (the cell's spatial-evidence fields, the lineage's allocation statuses and absence reasons,
 * the class definitions) · Sources (lineage rows, provenance tables, the release on
 * /downloads). Every request body comes from drawerBodies.ts; every number is a server string;
 * bars are sized by `value` only. A 420 px column beside the map (a white glass panel; the
 * page is light, so the drawer inherits the root tokens and re-declares none); a bottom sheet
 * under 768 px.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, ScrollText, Sparkles, X } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { api } from "@/lib/api";
import { useEmissions, useGridCell, useLineage, useTimeseries } from "@/lib/queries";
import { seriesBody } from "@/lib/requests";
import { adm2RowsForShape, cellUnit, configWords, districtName, envelopeUnitLine, gasLabel, monthLabel, periodShort, scopeWords, sectorLabel, streamLabel } from "@/lib/labels";
import { type Envelope, shown } from "@/lib/envelope";
import { Frame } from "@/components/ui/Frame";
import { BarChart } from "@/components/ui/BarChart";
import { EnvelopeTable } from "@/components/ui/EnvelopeTable";
import { TrendChart } from "@/components/ui/TrendChart";
import { ReceiptFooter } from "@/components/ui/ReceiptFooter";
import { ResultTabs } from "@/components/ui/ResultTabs";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { IntervalBadge, isBounded } from "@/components/ui/IntervalBadge";
import { NoteBox } from "@/components/ui/Widget";
import { useEnvelopeDrawer } from "@/components/ui/EnvelopeDrawer";
import { rampByRank } from "@/lib/palette";
import { joinNames, residualUnit } from "@/lib/geography";
import { useBboxes } from "@/components/map/tiles";
import { SPATIAL_CLASSES, statusWords } from "@/components/map/layerModes";
import { EVIDENCE_CLASS_TEXT, evidenceClassText } from "@/components/methods/evidenceClassText";
import { MAP_TABS, type MapTab } from "@/lib/urlState";
import { drawerBodies, type DrawerBodies } from "./drawerBodies";

export const DRAWER_WIDTH = 420;
const TAB_LABELS: Record<MapTab, string> = { summary: "Summary", breakdown: "Breakdown", trend: "Trend", evidence: "Evidence", sources: "Sources" };
const TEXT_BUTTON = "inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline";

type Snap = "peek" | "half" | "full";
type Q = { data?: Envelope; error?: unknown; isLoading: boolean };
type Unalloc = { by_province?: { province: string; exact: string; n_rows: number; unallocated_short?: string }[]; by_module_gas?: { module: string; gas: string; exact: string }[]; note?: string; level?: string };
type Derived = { unallocated_total_short?: string; placed_short?: string; unallocated_by_province_short?: Record<string, string> };

export function SelectionDrawer({ mobile = false }: { mobile?: boolean }) {
  const { state, setState, dims, labels, defaults } = useExplorer();
  const bboxes = useBboxes();
  const residual = useMemo(() => residualUnit(dims, bboxes.data), [dims, bboxes.data]);
  const bodies = useMemo(() => drawerBodies(state, dims.monthsByPeriod[state.period] ?? []), [state, dims.monthsByPeriod]);
  const tab = state.tab;
  const [snap, setSnap] = useState<Snap>("half");
  const sel = bodies.selection;
  const total = useEmissions(sel.kind === "cell" ? null : bodies.total);
  const bySector = useEmissions(bodies.bySector, tab === "breakdown" && sel.kind !== "cell");
  const byView = useEmissions(bodies.byView, tab === "breakdown" && !!bodies.byView);
  const series = useTimeseries(bodies.series, tab === "trend" && sel.kind !== "cell");
  const nationalSeriesBody = useMemo(() => seriesBody(state), [state]);
  const nationalSeries = useTimeseries(nationalSeriesBody, tab === "trend" && sel.kind !== "national" && sel.kind !== "cell");
  const lineage = useLineage(bodies.lineage, (tab === "evidence" || tab === "sources") && !!bodies.lineage);
  const provinces = useQuery({ queryKey: ["map", bodies.provinces], queryFn: () => api.queryEmissions(bodies.provinces), enabled: sel.kind !== "cell", retry: false });
  const cellQ = useGridCell(bodies.cell, sel.kind === "cell");
  const drawer = useEnvelopeDrawer(labels);

  const place =
    sel.kind === "national" ? "Pakistan" : sel.kind === "province" ? sel.id : sel.kind === "district" ? districtName(dims, sel.id) : `Grid cell ${sel.id}`;
  const kicker =
    sel.kind === "national" ? "Whole inventory" : sel.kind === "province" ? (residual && sel.id === residual.name ? "Territories · one province row" : "Province") : sel.kind === "district" ? `District · ${adm2RowsForShape(dims, sel.id)[0]?.parent_id.replace(/^ADM1:/, "") ?? ""}` : "Grid cell";
  const scope = scopeWords(labels, state, defaults.gwp_basis, state.sector ? sectorLabel(labels, state.sector) : null, state.gas ? gasLabel(labels, state.gas) : null, state.month ? monthLabel(labels, state.month) : null);
  const askQ = `Explain the allocated emissions of ${place} in ${periodShort(labels, state.period)} (${configWords(labels, state.config)})`;
  const close = () => setState({ geo: null, cell: null });

  const body = (
    <div data-testid="selection-drawer" data-kind={sel.kind} data-tab={tab}>
      <div className="pr-8 pt-3">
        <div className="micro">{kicker}</div>
        <h2 className="text-xl font-semibold leading-tight text-fg" data-testid="drawer-title">{place} · allocated emissions</h2>
        <div className="mt-0.5 text-xs text-muted">{sel.kind === "province" && residual && sel.id === residual.name ? <>{joinNames(residual.members)} together · {scope}</> : scope}</div>
      </div>
      <ResultTabs<MapTab> tabs={MAP_TABS.map((id) => ({ id, label: TAB_LABELS[id] }))} value={tab} onChange={(t) => setState({ tab: t })} ariaLabel="Drawer tabs" className="mt-3" testId="drawer-tabs" />
      <div className="mt-3" data-testid={`tab-${tab}`}>
        {sel.kind === "cell" ? (
          <CellBody q={cellQ} tab={tab} />
        ) : tab === "summary" ? (
          <Summary total={total} provinces={provinces} sel={sel} askQ={askQ} onRows={() => total.data && drawer.open(total.data, "sources")} />
        ) : tab === "breakdown" ? (
          <Breakdown bodies={bodies} bySector={bySector} byView={byView} scope={scope} />
        ) : tab === "trend" ? (
          <Trend sel={sel} series={series} national={nationalSeries} place={place} />
        ) : tab === "evidence" ? (
          <Evidence sel={sel} total={total} lineage={lineage} />
        ) : (
          <Sources sel={sel} total={total} lineage={lineage} bodies={bodies} />
        )}
      </div>
      {drawer.node}
    </div>
  );

  if (mobile) {
    const h = snap === "peek" ? "22vh" : snap === "half" ? "52vh" : "88vh";
    return (
      <div className="glass fixed inset-x-0 bottom-0 z-[50] flex flex-col rounded-t-2xl transition-[height] duration-250" style={{ height: h }} data-testid="drawer-sheet">
        <button className="flex items-center justify-center py-2" aria-label="Resize" onClick={() => setSnap(snap === "peek" ? "half" : snap === "half" ? "full" : "peek")}>
          <span className="h-1 w-10 rounded-full bg-line" />
        </button>
        <div className="flex-1 overflow-y-auto px-3 pb-4">{body}</div>
        {sel.kind !== "national" && <button aria-label="Back to Pakistan" onClick={close} className="absolute right-3 top-2 pill p-1 text-muted"><X size={16} /></button>}
      </div>
    );
  }
  return (
    <div className="relative h-full overflow-y-auto px-4 pb-6" data-testid="drawer-column">
      {body}
      {sel.kind !== "national" && <button aria-label="Back to Pakistan" title="Clear the selection" onClick={close} className="absolute right-3 top-3 pill p-1 text-muted hover:bg-surface-3 hover:text-fg" data-testid="drawer-close"><X size={16} /></button>}
      <p className="mt-6 text-micro normal-case tracking-normal text-muted">Every value is the release&apos;s own string; Result details opens its receipt.</p>
    </div>
  );
}

/** The headline: the total as shown (display_short, else display) with its unit, the contract display and exact in the title, an interval badge and the cell's interpretation when bounded. */
function Headline({ q, what }: { q: Q; what: string }) {
  const cell = q.data?.values[0];
  if (q.error) return <div className="my-2"><RefusalCard error={q.error} compact /></div>;
  if (!cell) return <div className="my-2"><Loading what={what} /></div>;
  const bounded = isBounded(cell);
  return (
    <div className="my-2" data-testid="headline">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="num text-3xl font-semibold tracking-tight text-fg" data-testid="headline-display" title={`${cell.display} ${cell.unit} (contract precision) · exact ${cell.exact}`}>{shown(cell)}</span>
        <span className="text-sm text-muted" data-testid="headline-unit">{cellUnit(cell)}</span>
        {bounded && <IntervalBadge cell={cell} title={String((cell as Record<string, unknown>).interpretation ?? "")} />}
      </div>
      {bounded && <div className="mt-0.5 text-xs text-muted">{String((cell as Record<string, unknown>).interpretation ?? "")}</div>}
      {q.data && <ReceiptFooter env={q.data} className="mt-1" />}
    </div>
  );
}

function LimitationList({ env }: { env: Envelope | undefined }) {
  const { labels } = useExplorer();
  const [open, setOpen] = useState(false);
  if (!env?.limitations_hit.length) return null;
  return (
    <div className="mt-2 text-xs" data-testid="limitation-list">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1 text-muted hover:text-fg">
        {env.limitations_hit.length} limitations apply {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <ul className="mt-1 space-y-1">
          {env.limitations_hit.map((l, i) => (
            <li key={i} className="text-muted" title={String(l.id)}>{labels.limitations[String(l.id)] ?? String(l.message ?? l.id)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Of this total, {placed} is spatially placed and {unallocated} remains explicitly unallocated": the server's derived strings, never a subtraction. */
function PlacedSentence({ total, provinces, sel }: { total: Q; provinces: Q; sel: DrawerBodies["selection"] }) {
  const unit = cellUnit(total.data?.values[0] ?? provinces.data?.values[0]);
  const d = ((sel.kind === "national" ? provinces.data?.derived : total.data?.derived) ?? {}) as Derived;
  const cell = total.data?.values[0] as (Record<string, unknown> & { unallocated_short?: string }) | undefined;
  if (d.placed_short && d.unallocated_total_short)
    return (
      <p className="mt-2 text-sm text-fg" data-testid="placed-sentence">
        Of this total, <b className="num">{d.placed_short}</b> {unit} is spatially placed and <b className="num">{d.unallocated_total_short}</b> {unit} remains explicitly unallocated{sel.kind === "province" ? " (retained at province level)" : ""}.
      </p>
    );
  if (cell?.unallocated_short)
    return (
      <p className="mt-2 text-sm text-fg" data-testid="placed-sentence">
        <b className="num">{cell.unallocated_short}</b> {unit} of this total remains explicitly unallocated, retained at province level.
      </p>
    );
  return null;
}

function Summary({ total, provinces, sel, askQ, onRows }: { total: Q; provinces: Q; sel: DrawerBodies["selection"]; askQ: string; onRows: () => void }) {
  const { dims, labels } = useExplorer();
  const rows = sel.kind === "district" ? adm2RowsForShape(dims, sel.id) : [];
  const province = rows[0]?.parent_id.replace(/^ADM1:/, "") ?? null;
  const u = provinces.data?.unallocated as Unalloc | undefined;
  const provinceRow = province ? u?.by_province?.find((r) => r.province === province) : undefined;
  const unit = cellUnit(total.data?.values[0] ?? provinces.data?.values[0]);
  return (
    <div>
      <Headline q={total} what={sel.kind === "national" ? "the national total" : `the ${sel.kind} total`} />
      {sel.kind === "district" ? (
        <p className="mt-2 text-sm text-fg" data-testid="placed-sentence">
          Districts carry placed mass only{provinceRow ? <>; <b>{provinceRow.province}</b> retains <b className="num">{provinceRow.unallocated_short ?? provinceRow.exact}</b> {unit} at province level that no district receives</> : null}.
        </p>
      ) : (
        <PlacedSentence total={total} provinces={provinces} sel={sel} />
      )}
      {rows.length > 0 && (
        <div className="mt-1 text-xs text-muted" data-testid="shape-rows">
          {rows.length > 1 ? "One shape shared by " : "Census unit "}
          {rows.map((r, i) => (
            <span key={r.geography_id}>
              {i > 0 ? ", " : ""}
              <span className="text-fg">{r.name}</span> <span>({r.status.replace(/_/g, " ")}, {r.unit_kind.replace(/_/g, " ")})</span>
            </span>
          ))}
        </div>
      )}
      <LimitationList env={total.data} />
      <div className="mt-3 flex flex-wrap gap-3">
        <Link href={`/ask?q=${encodeURIComponent(askQ)}`} className={TEXT_BUTTON} data-testid="ask-about"><Sparkles size={13} /> Ask about this</Link>
        <button type="button" onClick={onRows} disabled={!total.data} className={`${TEXT_BUTTON} disabled:opacity-50`} data-testid="open-rows"><ScrollText size={13} /> Open supporting rows</button>
      </div>
      <NoteBox className="mt-4" testId="how-to-read">
        <b>How to read the map.</b> Colour shows where the inventory <i>places</i> each stream&apos;s mass, using its allocation surface; it is an allocation of a national estimate, not a measurement of the place. The Spatial evidence layer shows how much of it rests on native geometry; the Unallocated layer shows the mass each province retains because the release placed it no finer. {labels.lulucf.short ? `Every total ${labels.lulucf.short}.` : ""}
      </NoteBox>
    </div>
  );
}

function Breakdown({ bodies, bySector, byView, scope }: { bodies: DrawerBodies; bySector: Q; byView: Q; scope: string }) {
  const { labels, dims, setState, state } = useExplorer();
  const [mode, setMode] = useState<"sectors" | "views">("sectors");
  const q = mode === "sectors" ? bySector : byView;
  const title = mode === "sectors" ? "Sectors" : "Spatial views";
  const onSector = (c: Envelope["values"][number]) => {
    const id = c.group?.[bodies.sectorKey];
    if (id) setState({ sector: state.sector === id ? null : id });
  };
  return (
    <div>
      {bodies.byView && (
        <div className="mb-2 flex items-center gap-2">
          <ResultTabs<"sectors" | "views"> tabs={[{ id: "sectors", label: "Sectors" }, { id: "views", label: "Spatial views" }]} value={mode} onChange={setMode} ariaLabel="Breakdown" size="xs" testId="breakdown-mode" />
        </div>
      )}
      <Frame title={title} unitLine={envelopeUnitLine(q.data)} scope={mode === "sectors" ? `${scope} · click a sector to filter the map` : `${scope} · ${Object.values(labels.views).length ? "physical, origin and accounting views" : "views"}`} env={q.data} error={q.error} isLoading={q.isLoading} labels={labels} dims={dims} flat defaultTab="chart">
        {q.data && <BarChart env={q.data} horizontal height={Math.max(160, q.data.values.length * 26)} labels={labels} dims={dims} colorBy={mode === "sectors" ? "sector" : "accent"} onClick={mode === "sectors" ? onSector : undefined} selectedIndex={mode === "sectors" && state.sector ? q.data.values.findIndex((c) => c.group?.[bodies.sectorKey] === state.sector) : null} />}
      </Frame>
      {q.data && (
        <div className="mt-2">
          <EnvelopeTable env={q.data} labels={labels} dims={dims} dense maxRows={12} />
        </div>
      )}
      {mode === "views" && <p className="mt-2 text-xs text-muted">{Object.entries(labels.views).filter(([k]) => k !== "all").map(([, v]) => v).join(" · ")}</p>}
    </div>
  );
}

function Trend({ sel, series, national, place }: { sel: DrawerBodies["selection"]; series: Q; national: Q; place: string }) {
  const { labels, dims, state } = useExplorer();
  const ref = dims.periods.find((p) => String(p.is_reference).toLowerCase() === "true")?.period_id;
  const own = sel.kind === "national";
  const shownQ = own ? series : national; // off the national scope the release refuses the series by name; the national one follows for context
  const change = shownQ.data?.change;
  return (
    <div className="space-y-3">
      {!own && (series.error ? <RefusalCard error={series.error} /> : series.data ? null : <Loading what={`the ${place} series`} />)}
      {!own && !!series.error && <p className="text-xs text-muted">The release answers annual series at national grain; the national series follows for context.</p>}
      {shownQ.data || shownQ.error || shownQ.isLoading ? (
        <Frame title="Pakistan · allocated emissions by year" unitLine={envelopeUnitLine(shownQ.data)} scope={`${sectorLabel(labels, state.sector).toLowerCase()} · ${labels.lulucf.short}`} env={shownQ.data} error={shownQ.error} isLoading={shownQ.isLoading} labels={labels} dims={dims} flat defaultTab="chart">
          <TrendChart env={shownQ.data} referencePeriod={ref} height={180} periodLabel={(id) => periodShort(labels, id)} title="" showReceipt={false} />
        </Frame>
      ) : null}
      {change && (
        <p className="text-sm text-fg" data-testid="change-sentence">
          From {periodShort(labels, change.from_period)} to {periodShort(labels, change.to_period)}: <b className="num">{change.change_short}</b> {String(change.unit_short ?? "")} (<b className="num">{change.change_pct_short}%</b>).
        </p>
      )}
    </div>
  );
}

function Evidence({ sel, total, lineage }: { sel: DrawerBodies["selection"]; total: Q; lineage: Q }) {
  const { labels } = useExplorer();
  const cell = (total.data?.values[0] ?? {}) as Record<string, unknown>;
  const spatialClass = typeof cell.spatial_class === "string" ? cell.spatial_class : "";
  const rows = lineage.data?.values ?? [];
  const count = (key: string) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const v = String((r as Record<string, unknown>)[key] ?? "");
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  };
  const u = lineage.data?.unallocated as Unalloc | undefined;
  return (
    <div className="space-y-4 text-sm">
      {sel.kind === "district" && (
        <section data-testid="evidence-fields">
          <h3 className="micro mb-1">Spatial evidence of this district</h3>
          {total.data ? (
            spatialClass ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted">Class</dt><dd className="text-fg">{evidenceClassText(spatialClass)}</dd>
                <dt className="text-muted">Basis</dt><dd className="text-muted">{String(cell.spatial_class_basis ?? "")}</dd>
                <dt className="text-muted">Dominant stream</dt><dd className="text-fg">{typeof cell.dominant_stream === "string" ? streamLabel(labels, cell.dominant_stream) : ""}</dd>
                <dt className="text-muted">Placement</dt><dd className="text-fg">{statusWords(String(cell.placement_class ?? ""))}{cell.allocation_surface ? <span className="text-muted"> on {String(cell.allocation_surface)}</span> : null}</dd>
                <dt className="text-muted">Allocation</dt><dd className="text-fg">{statusWords(String(cell.allocation_status ?? ""))}</dd>
              </dl>
            ) : (
              <p className="text-xs text-muted">The served envelope carries no spatial-evidence fields for this cell.</p>
            )
          ) : total.error ? <RefusalCard error={total.error} compact /> : <Loading what="the district envelope" />}
        </section>
      )}
      {sel.kind !== "national" && (
        <section data-testid="evidence-lineage">
          <h3 className="micro mb-1">Allocation status of the lineage rows</h3>
          {lineage.data ? (
            <>
              <ul className="space-y-0.5 text-xs">
                {count("allocation_status").map(([k, n]) => <li key={k}><span className="text-fg">{statusWords(k)}</span> <span className="text-muted">· {n} rows</span></li>)}
              </ul>
              {count("absence_reason").length > 0 && (
                <>
                  <h4 className="micro mb-1 mt-2">Fallbacks and absences</h4>
                  <ul className="space-y-0.5 text-xs">{count("absence_reason").map(([k, n]) => <li key={k}><span className="text-fg">{statusWords(k)}</span> <span className="text-muted">· {n} rows</span></li>)}</ul>
                </>
              )}
              {count("exactness").length > 0 && <p className="mt-2 text-xs text-muted">Exactness: {count("exactness").map(([k, n]) => `${statusWords(k)} (${n})`).join(", ")}.</p>}
              {u?.by_module_gas?.length ? (
                <table className="mt-2 w-full text-xs" data-testid="unallocated-table">
                  <thead><tr className="text-left text-muted"><th className="py-1">Unallocated · sector</th><th className="py-1">Gas</th><th className="py-1 text-right">Exact</th></tr></thead>
                  <tbody>
                    {u.by_module_gas.map((r, i, rows) => (
                      <tr key={`${r.module}|${r.gas}`} className="border-t border-line">
                        <td className="py-1"><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: rampByRank(i, rows.length) }} />{sectorLabel(labels, r.module)}</td>
                        <td className="py-1">{gasLabel(labels, r.gas)}</td>
                        <td className="mono num py-1 text-right">{r.exact}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <ReceiptFooter env={lineage.data} className="mt-1" />
            </>
          ) : lineage.error ? <RefusalCard error={lineage.error} compact /> : <Loading what="the lineage" />}
        </section>
      )}
      {sel.kind === "national" && <p className="text-xs text-muted">Select a province or a district for the evidence behind its allocation; the classes below are the release&apos;s placement vocabulary.</p>}
      <section data-testid="class-definitions">
        <h3 className="micro mb-1">Spatial placement classes</h3>
        <ul className="space-y-1 text-xs">
          {SPATIAL_CLASSES.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <span className="mt-0.5 inline-block h-3 w-4 shrink-0 rounded-sm border border-line-strong" style={{ background: c.color }} />
              <span><span className="font-semibold text-fg">{c.id}</span> <span className="text-muted">— {EVIDENCE_CLASS_TEXT[c.id]?.definition}</span></span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

type Prov = { tables?: { table?: string; path: string; sha256: string | null }[] };

function Sources({ sel, total, lineage, bodies }: { sel: DrawerBodies["selection"]; total: Q; lineage: Q; bodies: DrawerBodies }) {
  const { labels, dims } = useExplorer();
  const prov = (total.data?.provenance ?? {}) as Prov;
  return (
    <div className="space-y-4 text-sm">
      {sel.kind !== "national" && (
        <Frame title="Lineage rows" scope={`get_spatial_lineage · sector × gas × month × view${bodies.lineage?.params.month ? ` · ${monthLabel(labels, bodies.lineage.params.month)}` : ""}`} env={lineage.data} error={lineage.error} isLoading={lineage.isLoading} labels={labels} dims={dims} maxRows={12} tableExtra={["module", "gas", "month", "spatial_view", "allocation_status"]} defaultTab="table" flat />
      )}
      <section data-testid="provenance">
        <h3 className="micro mb-1">Product and tables</h3>
        {total.data ? (
          <ul className="space-y-1 text-xs">
            {(prov.tables ?? []).map((t) => (
              <li key={t.path} className="break-all text-muted"><span className="mono text-fg">{t.table ?? t.path}</span>{t.table ? ` · ${t.path}` : ""}{t.sha256 ? <span className="mono"> · {t.sha256.slice(0, 12)}</span> : null}</li>
            ))}
            {!(prov.tables ?? []).length && <li className="text-muted">The envelope lists no tables.</li>}
          </ul>
        ) : total.error ? <RefusalCard error={total.error} compact /> : <Loading what="the envelope" />}
        {total.data && <ReceiptFooter env={total.data} className="mt-1" />}
      </section>
      <section data-testid="release-identity">
        <h3 className="micro mb-1">Release</h3>
        <p className="text-xs text-muted">The served release, its manifest digests and the citation are on <Link href="/downloads" className="text-accent underline">Downloads</Link>; every table above is hashed there.</p>
      </section>
    </div>
  );
}

function CellBody({ q, tab }: { q: Q; tab: MapTab }) {
  const { state, labels } = useExplorer();
  const cell = q.data?.values[0] as (Envelope["values"][number] & { lat?: number; lon?: number; row?: number; col?: number; month?: string }) | undefined;
  if (tab !== "summary" && tab !== "sources") return <p className="text-xs text-muted">A grid cell carries its value and its receipt only; the {TAB_LABELS[tab].toLowerCase()} of a place is answered at province or district level.</p>;
  return (
    <div>
      <div className="text-xs text-muted">{gasLabel(labels, state.gas)} · {monthLabel(labels, state.month)} · {configWords(labels, state.config)} · get_grid_cell</div>
      {q.error ? (
        <div className="my-2"><RefusalCard error={q.error} compact /></div>
      ) : cell ? (
        <div className="my-2" data-testid="headline">
          <div className="flex items-baseline gap-2">
            <span className="num text-3xl font-semibold tracking-tight text-fg" data-testid="headline-display" title={`${cell.display} ${cell.unit} (contract precision) · exact ${cell.exact}`}>{shown(cell)}</span>
            <span className="text-sm text-muted">{cellUnit(cell)}</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted">lat</dt><dd className="mono num">{String(cell.lat ?? "")}</dd>
            <dt className="text-muted">lon</dt><dd className="mono num">{String(cell.lon ?? "")}</dd>
            <dt className="text-muted">row</dt><dd className="mono num">{String(cell.row ?? "")}</dd>
            <dt className="text-muted">col</dt><dd className="mono num">{String(cell.col ?? "")}</dd>
            <dt className="text-muted">month</dt><dd className="mono">{String(cell.month ?? "")}</dd>
            <dt className="text-muted">exact</dt><dd className="mono break-all">{cell.exact}</dd>
          </dl>
          <p className="mt-2 text-xs text-muted">{cell.formula}</p>
          {q.data!.limitations_hit.map((l, i) => (
            <p key={i} className="mt-1 text-xs text-muted">{labels.limitations[String(l.id)] ?? String(l.message ?? "")}</p>
          ))}
          <p className="mt-1 text-xs text-warn">The raster under the cursor is shading only; this number is the cube&apos;s.</p>
          <ReceiptFooter env={q.data!} className="mt-2" />
        </div>
      ) : (
        <div className="my-2"><Loading what="the grid cell" /></div>
      )}
    </div>
  );
}

