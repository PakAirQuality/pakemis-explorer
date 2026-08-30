"use client";
/**
 * The detail card, routed on `geo` / `cell`: a province, a district (ADM2 shape) or a grid
 * cell. Every request body comes from requests.ts (detailBodies); every number shown is an
 * envelope's display / exact string; bars are sized by `value` only. Slides in over the map's
 * right edge; a three-snap bottom sheet under 768 px.
 */
import { useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { detailBodies, type DetailBodies } from "@/lib/requests";
import { useEmissions, useGridCell, useLineage } from "@/lib/queries";
import { adm2RowsForShape, cellUnit, configWords, envelopeUnitLine, gasLabel, monthLabel, periodShort, scopeWords, sectorLabel } from "@/lib/labels";
import { type Envelope, shown } from "@/lib/envelope";
import { Frame } from "@/components/ui/Frame";
import { BarChart } from "@/components/ui/BarChart";
import { ReceiptFooter } from "@/components/ui/ReceiptFooter";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { IntervalBadge, isBounded } from "@/components/ui/IntervalBadge";
import { sectorColor } from "@/lib/palette";
import { joinNames, residualUnit } from "@/lib/geography";
import { useBboxes } from "@/components/map/tiles";

type Snap = "peek" | "half" | "full";

export function DetailCard() {
  const { state, setState, dims, isMobile } = useExplorer();
  const months = dims.monthsByPeriod[state.period] ?? [];
  const bodies = useMemo(() => detailBodies(state, months), [state, months]);
  const [snap, setSnap] = useState<Snap>("half");
  if (bodies.kind === "none") return null;
  const close = () => setState({ geo: null, cell: null });
  const body = bodies.kind === "cell" ? <CellCard bodies={bodies} /> : bodies.kind === "province" ? <ProvinceCard bodies={bodies} /> : <DistrictCard bodies={bodies} />;
  if (isMobile) {
    const h = snap === "peek" ? "22vh" : snap === "half" ? "52vh" : "88vh";
    return (
      <div className="fixed inset-x-0 bottom-12 z-[50] flex flex-col rounded-t-2xl bg-surface-2 shadow-card transition-[height] duration-250" style={{ height: h }} data-testid="detail-card">
        <button className="flex items-center justify-center py-2" aria-label="Resize" onClick={() => setSnap(snap === "peek" ? "half" : snap === "half" ? "full" : "peek")}>
          <span className="h-1 w-10 rounded-full bg-line" />
        </button>
        <div className="flex-1 overflow-y-auto px-3 pb-4">{body}</div>
        <button aria-label="Close" onClick={close} className="absolute right-3 top-2 pill p-1 text-muted"><X size={16} /></button>
      </div>
    );
  }
  return (
    <div className="absolute bottom-24 right-4 top-[92px] z-[45] w-[380px] max-w-[calc(100%-2rem)] animate-[slide-in_.25s_ease-out]" data-testid="detail-card">
      <div className="card flex h-full flex-col overflow-hidden bg-surface-2/97">
        <div className="flex-1 overflow-y-auto px-3 pb-3">{body}</div>
        <button aria-label="Close" onClick={close} className="absolute right-2 top-2 pill p-1 text-muted hover:bg-surface-3 hover:text-fg"><X size={16} /></button>
      </div>
      <style>{`@keyframes slide-in { from { transform: translateX(24px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
    </div>
  );
}

function Header({ kicker, title, sub }: { kicker: string; title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="pr-8 pt-3">
      <div className="micro">{kicker}</div>
      <h2 className="text-xl font-semibold leading-tight text-fg">{title}</h2>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** The headline: the total as shown (display_short, else display) with its unit, the contract display and exact in the title, an interval badge and the cell's interpretation when bounded. */
function Headline({ q, what }: { q: { data?: Envelope; error?: unknown; isLoading: boolean }; what: string }) {
  const cell = q.data?.values[0];
  if (q.error) return <div className="my-2"><RefusalCard error={q.error} compact /></div>;
  if (!cell) return <div className="my-2"><Loading what={what} /></div>;
  const bounded = isBounded(cell);
  return (
    <div className="my-2" data-testid="headline">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="num text-3xl font-semibold tracking-tight text-fg" data-testid="headline-display" title={`${cell.display} ${cell.unit} (contract precision) · exact ${cell.exact}`}>{shown(cell)}</span>
        <span className="text-sm text-muted">{cellUnit(cell)}</span>
        {bounded && <IntervalBadge cell={cell} title={String((cell as Record<string, unknown>).interpretation ?? "")} />}
      </div>
      {bounded && <div className="mt-0.5 text-xs text-muted">{String((cell as Record<string, unknown>).interpretation ?? "")}</div>}
      {q.data && <ReceiptFooter env={q.data} className="mt-1" />}
    </div>
  );
}

function Limitations({ env }: { env: Envelope | undefined }) {
  if (!env?.limitations_hit.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1" data-testid="limitation-chips">
      {env.limitations_hit.map((l, i) => (
        <span key={i} className="pill border border-line bg-surface px-2 py-0.5 text-micro normal-case tracking-normal text-muted" title={String(l.message ?? "")}>
          {String(l.id)}
        </span>
      ))}
    </div>
  );
}

type Unalloc = { by_province?: { province: string; exact: string; n_rows: number }[]; by_module_gas?: { module: string; gas: string; exact: string }[]; note?: string; level?: string };

function UnallocatedLine({ env, province }: { env: Envelope | undefined; province: string }) {
  const u = env?.unallocated as Unalloc | undefined;
  const row = u?.by_province?.find((r) => r.province === province);
  if (!row) return null;
  return (
    <p className="mt-2 text-xs text-muted" data-testid="unallocated-line">
      Unallocated, retained at ADM1: <span className="mono text-fg">{row.exact}</span> {cellUnit(env?.values[0])} (exact, {row.n_rows} rows) — {u?.note}
    </p>
  );
}

function GasChips({ q }: { q: { data?: Envelope; error?: unknown; isLoading: boolean } }) {
  const { labels } = useExplorer();
  if (!q.data) return q.error ? <RefusalCard error={q.error} compact /> : null;
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1.5" data-testid="gas-chips">
        {q.data.values.map((c, i) => (
          <span key={i} className="pill border border-line bg-surface-2 px-2 py-0.5 text-xs">
            <span className="text-muted">{gasLabel(labels, c.group?.gas ?? "")}</span> <span className="num font-semibold">{shown(c)}</span>
          </span>
        ))}
      </div>
      <ReceiptFooter env={q.data} className="mt-1" />
    </div>
  );
}

function scopeLine(state: ReturnType<typeof useExplorer>["state"], labels: ReturnType<typeof useExplorer>["labels"], defaultGwp?: string): string {
  return scopeWords(labels, state, defaultGwp, state.sector ? sectorLabel(labels, state.sector) : null, state.gas ? gasLabel(labels, state.gas) : null, state.month ? monthLabel(labels, state.month) : null);
}

function ProvinceCard({ bodies }: { bodies: Extract<DetailBodies, { kind: "province" }> }) {
  const { state, setState, labels, dims, defaults } = useExplorer();
  const bboxes = useBboxes();
  const residual = useMemo(() => residualUnit(dims, bboxes.data), [dims, bboxes.data]);
  const total = useEmissions(bodies.total);
  const byModule = useEmissions(bodies.byModule);
  const byGas = useEmissions(bodies.byGas);
  const byMonth = useEmissions(bodies.byMonth);
  const lineage = useLineage(bodies.lineage);
  const scope = scopeLine(state, labels, defaults.gwp_basis);
  const u = lineage.data?.unallocated as Unalloc | undefined;
  return (
    <div>
      <Header kicker={residual && bodies.id === residual.name ? "Territories · one ADM1 unit" : "Province"} title={bodies.id} sub={residual && bodies.id === residual.name ? <>{joinNames(residual.members)} together · {scope}</> : scope} />
      <Headline q={total} what="the province total" />
      <UnallocatedLine env={total.data} province={bodies.id} />
      <Limitations env={total.data} />
      <GasChips q={byGas} />
      <div className="mt-3 space-y-3">
        <Frame title="Sectors" unitLine={envelopeUnitLine(byModule.data)} scope={scope} env={byModule.data} error={byModule.error} isLoading={byModule.isLoading} labels={labels} dims={dims}>
          {byModule.data && <BarChart env={byModule.data} horizontal height={Math.max(160, byModule.data.values.length * 24)} labels={labels} dims={dims} onClick={(c) => setState({ sector: c.group?.module ?? null })} />}
        </Frame>
        <Frame title="Months" unitLine={envelopeUnitLine(byMonth.data)} scope={`${periodShort(labels, state.period)} · click a month`} env={byMonth.data} error={byMonth.error} isLoading={byMonth.isLoading} labels={labels} dims={dims}>
          {byMonth.data && <BarChart env={byMonth.data} height={140} labels={labels} dims={dims} colorBy="accent" compact onClick={(c) => setState({ month: c.group?.month ?? null })} selectedIndex={state.month ? byMonth.data.values.findIndex((c) => c.group?.month === state.month) : null} />}
        </Frame>
        <Frame title="Lineage: unallocated by sector × gas" unitLine={envelopeUnitLine(lineage.data)} scope={`get_spatial_lineage · ${monthLabel(labels, bodies.lineage.params.month)}`} env={lineage.data} error={lineage.error} isLoading={lineage.isLoading} labels={labels} dims={dims} maxRows={12} tableExtra={["module", "gas", "month", "spatial_view", "allocation_status"]}>
          {lineage.data && (
            <div>
              {u?.by_module_gas?.length ? (
                <table className="w-full text-xs" data-testid="unallocated-table">
                  <thead><tr className="text-left text-muted"><th className="py-1">Sector</th><th className="py-1">Gas</th><th className="py-1 text-right">Exact</th></tr></thead>
                  <tbody>
                    {u.by_module_gas.map((r) => (
                      <tr key={`${r.module}|${r.gas}`} className="border-t border-line">
                        <td className="py-1"><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: sectorColor(r.module) }} />{sectorLabel(labels, r.module)}</td>
                        <td className="py-1">{gasLabel(labels, r.gas)}</td>
                        <td className="mono num py-1 text-right">{r.exact}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-muted">No unallocated mass in this lineage.</p>
              )}
              <p className="mt-1 text-xs text-muted">{lineage.data.values.length} lineage rows (module × gas × month × view); open the table for the rows.</p>
            </div>
          )}
        </Frame>
      </div>
    </div>
  );
}

function DistrictCard({ bodies }: { bodies: Extract<DetailBodies, { kind: "district" }> }) {
  const { state, setState, labels, dims, defaults } = useExplorer();
  const rows = adm2RowsForShape(dims, bodies.id);
  const total = useEmissions(bodies.total);
  const byModule = useEmissions(bodies.byModule);
  const byGas = useEmissions(bodies.byGas);
  const byMonth = useEmissions(bodies.byMonth);
  const lineage = useLineage(bodies.lineage);
  const scope = scopeLine(state, labels, defaults.gwp_basis);
  const u = lineage.data?.unallocated as Unalloc | undefined;
  const name = rows[0]?.shape_name || bodies.id;
  const province = rows[0]?.parent_id.replace(/^ADM1:/, "") ?? "";
  return (
    <div>
      <Header kicker={`District · ${province}`} title={name} sub={scope} />
      <Headline q={total} what="the district total" />
      {rows.length > 0 && (
        <div className="mt-1 text-xs text-muted" data-testid="shape-rows">
          {rows.length > 1 ? "One shape shared by " : "Census unit "}
          {rows.map((r, i) => (
            <span key={r.geography_id}>
              {i > 0 ? ", " : ""}
              <span className="text-fg">{r.name}</span> <span className="mono">({r.status}, {r.unit_kind})</span>
            </span>
          ))}
          {" · "}
          <span className="mono">{bodies.id}</span>
        </div>
      )}
      <Limitations env={total.data} />
      <GasChips q={byGas} />
      <div className="mt-3 space-y-3">
        <Frame title="Sectors" unitLine={envelopeUnitLine(byModule.data)} scope="hatched bars are bounded intervals (mixed CH₄ origin)" env={byModule.data} error={byModule.error} isLoading={byModule.isLoading} labels={labels} dims={dims}>
          {byModule.data && <BarChart env={byModule.data} horizontal height={Math.max(160, byModule.data.values.length * 24)} labels={labels} dims={dims} onClick={(c) => setState({ sector: c.group?.module ?? null })} />}
        </Frame>
        <Frame title="Months" unitLine={envelopeUnitLine(byMonth.data)} scope={`${periodShort(labels, state.period)} · click a month`} env={byMonth.data} error={byMonth.error} isLoading={byMonth.isLoading} labels={labels} dims={dims}>
          {byMonth.data && <BarChart env={byMonth.data} height={140} labels={labels} dims={dims} colorBy="accent" compact onClick={(c) => setState({ month: c.group?.month ?? null })} selectedIndex={state.month ? byMonth.data.values.findIndex((c) => c.group?.month === state.month) : null} />}
        </Frame>
        <Frame title="Lineage" unitLine={envelopeUnitLine(lineage.data)} scope={`get_spatial_lineage · module × gas × month × view${bodies.lineage.params.month ? ` · ${monthLabel(labels, bodies.lineage.params.month)}` : ""}`} env={lineage.data} error={lineage.error} isLoading={lineage.isLoading} labels={labels} dims={dims} maxRows={24} tableExtra={["module", "gas", "month", "spatial_view", "allocation_status"]} defaultTab="table" />
        {u?.by_module_gas?.length ? (
          <p className="text-xs text-muted" data-testid="unallocated-line">
            Unallocated at ADM1 (not placed in any district):{" "}
            {u.by_module_gas.map((r, i) => (
              <span key={`${r.module}|${r.gas}`} className="whitespace-nowrap">
                {i > 0 ? " · " : ""}
                {sectorLabel(labels, r.module)} {gasLabel(labels, r.gas)} <span className="mono text-fg">{r.exact}</span>
              </span>
            ))}
            {" "}{cellUnit(lineage.data?.values[0])} (exact)
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CellCard({ bodies }: { bodies: Extract<DetailBodies, { kind: "cell" }> }) {
  const { state, labels } = useExplorer();
  const q = useGridCell(bodies.cell);
  const cell = q.data?.values[0] as (Envelope["values"][number] & { lat?: number; lon?: number; row?: number; col?: number; month?: string }) | undefined;
  return (
    <div>
      <Header kicker="Grid cell" title={`${gasLabel(labels, state.gas)} · ${monthLabel(labels, state.month)}`} sub={`${configWords(labels, state.config)} · get_grid_cell`} />
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
            <p key={i} className="mt-1 text-xs text-muted"><span className="mono">{String(l.id)}</span>: {String(l.message ?? "")}</p>
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
