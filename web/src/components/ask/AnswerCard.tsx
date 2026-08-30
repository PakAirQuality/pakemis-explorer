"use client";
/**
 * The structured answer: eight parts in one card. (1) the direct answer, its `<cite>` tags
 * linking to the tool cards; (2) the applied scope and filters (the answer's `scope`, else the
 * principal result's context, plus the call's own filters); (3) the principal result's cells
 * as a figure, bars, columns or a table (display_short at the ends, sizes from the replayed
 * envelope's `value`, ticks from its `axis.ticks_short`); (4) uncertainty (the result's
 * `uncertainty` rows, else an uncertainty tool result of the turn, else "not requested" with a
 * one-click follow-up); (5) evidence qualification (limitations hit, exactness, truncation,
 * unallocated mass); (6) the exact source rows (`n_rows` per cell, "Open rows" -> Result
 * details); (7) the expandable query and calculation receipt; (8) the permalink to /explore
 * (stateFromRequest of the call's input), the CSV and the reproduce link. Every number on the
 * card is a string the stream or the replayed envelope carried.
 */
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, ExternalLink, Rows3 } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { BarsWithAxis, type BarItem } from "@/components/charts/BarsWithAxis";
import { ColumnChart, type ColumnPoint } from "@/components/charts/ColumnChart";
import { IntervalBadge, isBounded } from "@/components/ui/IntervalBadge";
import { api, apiUrl, receiptHref } from "@/lib/api";
import type { Envelope } from "@/lib/envelope";
import { cellUnit, columnLabel, functionLabel, limitationText } from "@/lib/labels";
import { gasColor, rampByRank } from "@/lib/palette";
import { stateFromRequest } from "@/lib/requests";
import { applyPatch, hrefForState } from "@/lib/urlState";
import { renderAnswer } from "./answerText";
import { barLabel, cellName, chartKind, downloadTool, exactnessWords, groupKeyOf, principalTool, receiptChips, resultCaption, rowsOf, scopeRows, sizeOf, uncertaintyTool } from "./answerParts";
import { useReceiptDrawer } from "./receiptDrawer";
import type { Highlight } from "./ToolCard";
import type { AnswerEvent, TimelineItem, ToolResultCell } from "./types";

export const UNCERTAINTY_FOLLOW_UP = "How certain is this?";
const MAX_ROWS = 12;
const MAX_UNC_ROWS = 8;

/** "-22.22 … 29.95 %": both ends as the table carries them; "" when the row has neither. */
function pctRange(low: string | null | undefined, high: string | null | undefined): string {
  if (!low && !high) return "";
  return `${low ?? "?"} … ${high ?? "?"} %`;
}
/** "timing 3.1 %" for a half-width the release priced on this resolution; "" when it is not applicable, unpriced or absent (the tooltip still carries the status). */
function pricedWord(what: string, pct: string | null | undefined, status: string | null | undefined): string {
  if (!pct || !status || status !== "priced") return "";
  return `${what} ${pct} %`;
}
const TOOLTIP_SKIP = new Set(["result_row_id"]);
/** Every non-empty field of an uncertainty row as "key: value" lines (the table's own words), for the row's tooltip. */
function uncertaintyTooltip(row: Record<string, string | null>): string {
  return Object.entries(row)
    .filter(([k, v]) => !TOOLTIP_SKIP.has(k) && typeof v === "string" && v.length > 0)
    .map(([k, v]) => `${columnLabel(k).toLowerCase()}: ${v}`)
    .join("\n");
}

function useReplay(receipt: string | null | undefined): Envelope | null {
  const q = useQuery({ queryKey: ["receipt", receipt], queryFn: () => api.receipt(receipt!), enabled: !!receipt, staleTime: Infinity, retry: false });
  return q.data ?? null;
}

function Part({ id, title, children, action }: { id: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3" data-testid={`answer-part-${id}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h4 className="micro">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function Value({ cell }: { cell: ToolResultCell }) {
  return (
    <span className="num whitespace-nowrap">
      <span className="font-semibold text-fg" title={cell.display ? `${cell.display} (contract precision)` : undefined}>{cell.display_short ?? cell.display ?? ""}</span> <span className="text-muted">{cellUnit(cell)}</span>
      {isBounded(cell) && <span className="ml-1"><IntervalBadge cell={cell} title={cell.interpretation ?? cell.exactness} /></span>}
    </span>
  );
}

export function AnswerCard({ answer, items, onCite, onFollowUp }: { answer: AnswerEvent; items: TimelineItem[]; onCite: { hover: (h: Highlight) => void; click: (h: Highlight) => void }; onFollowUp: (question: string) => void }) {
  const { labels, dims, state, defaults, release } = useExplorer();
  const principal = principalTool(items, answer.scope);
  const unc = uncertaintyTool(items);
  const dl = downloadTool(items);
  const r = principal?.result ?? null;
  const env = useReplay(r?.receipt);
  const uncEnv = useReplay(unc && unc !== principal ? unc.result?.receipt : null);
  const drawer = useReceiptDrawer(labels);
  const [asTable, setAsTable] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const answerBody = (
    <div className="px-4 py-3 text-sm leading-relaxed text-fg" data-testid="answer-part-answer">
      {renderAnswer(answer.text, onCite)}
    </div>
  );
  if (!principal || !r) {
    return (
      <article className="rounded-card border border-line bg-card shadow-card" data-testid="answer-card">
        {answerBody}
        <p className="border-t border-line px-4 py-2 text-xs text-muted" data-testid="answer-no-query">No engine query stands behind this reply; it carries no figure.</p>
      </article>
    );
  }

  const cells = r.cells;
  const kind = chartKind(cells);
  const key = groupKeyOf(cells);
  const shownCells = cells.slice(0, MAX_ROWS);
  const showChart = !asTable && (kind === "bars" || kind === "columns");
  const context = (answer.scope && typeof answer.scope === "object" ? answer.scope : null) ?? r.context;
  const cb = release.context_bar;
  const rows = scopeRows(labels, dims, context, principal.input, cb.basis_label ? { basis: cb.basis, label: cb.basis_label } : undefined);
  const ticks = env?.axis?.ticks_short ?? null;
  // the gases keep their three hues; every other set is the PAQI ramp by rank (the cell's order in the envelope), a visual encoding that prints nothing
  const colorOf = (c: ToolResultCell, i: number) => (key === "gas" ? gasColor(c.group?.[key]) : rampByRank(i, shownCells.length));
  const bars: BarItem[] = shownCells.map((c, i) => ({ id: String(c.i), name: cellName(labels, dims, c), value: sizeOf(c, env), label: barLabel(c, env), color: colorOf(c, i) }));
  const columns: ColumnPoint[] = shownCells.map((c) => ({ id: String(c.i), name: cellName(labels, dims, c), value: sizeOf(c, env), label: c.display_short ?? c.display ?? "", reference: key === "period_id" && c.group?.period_id === defaults.period_id }));
  const uncRows = r.uncertainty?.rows ?? [];
  const uncCells = unc?.result?.cells ?? [];
  const exactness = exactnessWords(cells);
  const patch = principal.name === "set_map_view" ? {} : stateFromRequest({ name: principal.name, body: principal.input });
  const exploreHref = Object.keys(patch).length ? hrefForState(applyPatch({ ...state, c: null }, patch), defaults, "/explore") : null;
  const csv = dl?.result?.download?.csv ? apiUrl(dl.result.download.csv) : r.receipt ? api.downloadCsvUrl(r.receipt) : null;
  const chips = receiptChips(labels, dims, principal.input);
  const rowCounts = shownCells.map((c) => ({ name: cellName(labels, dims, c), n: rowsOf(c, env) }));
  const known = rowCounts.filter((x) => x.n !== null);

  return (
    <article className="rounded-card border border-line bg-card shadow-card" data-testid="answer-card" data-principal-k={principal.k}>
      {answerBody}

      <Part id="scope" title="Applied scope and filters">
        {rows.length ? (
          <div className="flex flex-wrap gap-1" data-testid="scope-rows">
            {rows.map((row) => (
              <span key={row.name + row.value} className={`pill border border-line px-2 py-px text-xs ${row.muted ? "text-muted" : "bg-surface text-fg"}`} title={row.id ? `${row.name} = ${row.id}` : row.name} data-testid="scope-row">
                <span className="text-muted">{row.name}</span> {row.value}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">The result carried no scope.</p>
        )}
      </Part>

      <Part
        id="result"
        title="Result"
        action={
          (kind === "bars" || kind === "columns") && (
            <button type="button" onClick={() => setAsTable((t) => !t)} className="text-micro normal-case tracking-normal text-accent hover:underline" data-testid="result-toggle">
              {asTable ? "Show as chart" : "Show as table"}
            </button>
          )
        }
      >
        <p className="caption mb-1.5" data-testid="result-caption">{functionLabel(principal.name)} · {resultCaption(labels, r, principal.input)}</p>
        {kind === "none" && <p className="text-xs text-muted">No rows in this scope.</p>}
        {kind === "figure" && (
          <div className="flex items-baseline gap-2" data-testid="result-figure">
            <span className="num text-3xl font-semibold text-fg" title={cells[0].display ? `${cells[0].display} (contract precision)` : undefined}>{cells[0].display_short ?? cells[0].display ?? ""}</span>{" "}
            <span className="text-sm text-muted">{cellUnit(cells[0])}</span>
            {isBounded(cells[0]) && <IntervalBadge cell={cells[0]} title={cells[0].interpretation ?? cells[0].exactness} />}
          </div>
        )}
        {showChart && kind === "bars" && <BarsWithAxis items={bars} ticks={ticks} testId="answer-bars" />}
        {showChart && kind === "columns" && <ColumnChart points={columns} ticks={ticks} height={180} testId="answer-columns" />}
        {(kind === "table" || (asTable && (kind === "bars" || kind === "columns"))) && (
          <table className="w-full text-xs" data-testid="answer-rows">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 pr-2 font-semibold">{key ? columnLabel(key) : "Scope"}</th>
                <th className="py-1 pr-2 text-right font-semibold">Value</th>
                <th className="py-1 text-right font-semibold">Rows</th>
              </tr>
            </thead>
            <tbody>
              {shownCells.map((c) => (
                <tr key={c.i} className="border-t border-line align-top" data-testid="answer-row">
                  <td className="py-1 pr-2 text-fg">{cellName(labels, dims, c)}</td>
                  <td className="py-1 pr-2 text-right"><Value cell={c} /></td>
                  <td className="num py-1 text-right text-muted">{rowsOf(c, env) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {cells.length > MAX_ROWS && <p className="mt-1 text-xs text-muted">first {MAX_ROWS} of {String(cells.length)} cells; the CSV carries every one</p>}
        {r.truncated && <p className="mt-1 text-xs text-muted">{r.truncated}</p>}
      </Part>

      <Part id="uncertainty" title="Uncertainty">
        {uncRows.length > 0 ? (
          <div data-testid="uncertainty-rows">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 pr-2 font-semibold">Category · resolution</th>
                  <th className="py-1 pr-2 text-right font-semibold" title="the probabilistic interval of the parameter draws, as a percentage of the estimate">Parametric</th>
                  <th className="py-1 text-right font-semibold" title="the parametric interval widened by the structural half-widths">Envelope</th>
                </tr>
              </thead>
              <tbody>
                {uncRows.slice(0, MAX_UNC_ROWS).map((row, i) => {
                  const priced = [pricedWord("timing", row.timing_pct, row.timing_status), pricedWord("placement", row.placement_pct, row.placement_status)].filter(Boolean).join(" · ");
                  return (
                    <tr key={i} className="border-t border-line align-top" data-testid="uncertainty-row" title={uncertaintyTooltip(row)}>
                      <td className="py-1 pr-2">
                        <div className="text-fg">{row.category || row.module || row.sector || ""}</div>
                        <div className="text-muted">{(row.resolution ?? "").replace(/_/g, " · ")}{priced ? ` · ${priced}` : ""}</div>
                      </td>
                      <td className="num whitespace-nowrap py-1 pr-2 text-right" title={row.parametric_kind ?? undefined}>{pctRange(row.parametric_low_pct, row.parametric_high_pct)}</td>
                      <td className="num whitespace-nowrap py-1 text-right" title={row.envelope_kind ?? undefined}>{pctRange(row.envelope_low_pct, row.envelope_high_pct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {uncRows.length > MAX_UNC_ROWS && <p className="mt-1 text-xs text-muted">first {MAX_UNC_ROWS} of {String(uncRows.length)} rows</p>}
            {r.uncertainty?.interpretation && <p className="caption mt-1">{r.uncertainty.interpretation}</p>}
          </div>
        ) : uncCells.length > 0 ? (
          <div data-testid="uncertainty-cells">
            <ul className="space-y-1 text-xs">
              {uncCells.slice(0, 6).map((c) => {
                const interval = (uncEnv?.values[c.i] as Record<string, unknown> | undefined)?.interval_short;
                return (
                  <li key={c.i} className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-fg">{cellName(labels, dims, c)}</span>
                    <span>
                      <Value cell={c} />
                      {typeof interval === "string" && interval ? <span className="num ml-2 text-muted" title="95 % interval, as the envelope carries it">{interval}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            {unc?.result?.uncertainty?.interpretation && <p className="caption mt-1">{unc.result.uncertainty.interpretation}</p>}
          </div>
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted" data-testid="uncertainty-missing">
            Uncertainty not requested —
            <button type="button" onClick={() => onFollowUp(UNCERTAINTY_FOLLOW_UP)} className="pill border border-line bg-surface px-2 py-0.5 text-xs text-accent hover:border-accent" data-testid="uncertainty-follow-up">
              ask &ldquo;{UNCERTAINTY_FOLLOW_UP}&rdquo;
            </button>
          </p>
        )}
      </Part>

      <Part id="evidence" title="Evidence qualification">
        <div className="flex flex-wrap gap-1" data-testid="evidence-chips">
          {r.limitations_hit.map((l) => (
            <span key={l} className="pill border border-warn/30 bg-refusal px-2 py-px text-micro normal-case tracking-normal text-warn" title={l} data-testid="limitation-chip">
              {limitationText(labels, l)}
            </span>
          ))}
          {exactness.map((e) => (
            <span key={e} className={`pill border px-2 py-px text-micro normal-case tracking-normal ${e.includes("bounded") ? "border-warn/30 bg-refusal text-warn" : "border-line bg-surface text-muted"}`} data-testid="exactness-badge">
              {e}
            </span>
          ))}
          {r.unallocated && <span className="pill border border-line bg-surface px-2 py-px text-micro normal-case tracking-normal text-muted">some mass is unallocated at this grain</span>}
          {!r.limitations_hit.length && !exactness.length && !r.unallocated && <span className="text-xs text-muted">No limitation recorded on this result.</span>}
        </div>
      </Part>

      <Part
        id="rows"
        title="Exact source rows"
        action={
          r.receipt && (
            <button type="button" onClick={() => drawer.open(r.receipt!, "calculation")} className="flex items-center gap-1 text-micro normal-case tracking-normal text-accent hover:underline" data-testid="open-rows">
              <Rows3 size={12} /> Open rows
            </button>
          )
        }
      >
        {known.length === 0 ? (
          <p className="text-xs text-muted" data-testid="rows-unknown">Row counts are not carried by this stream; Open rows lists them.</p>
        ) : known.length === 1 && cells.length === 1 ? (
          <p className="text-xs text-fg" data-testid="rows-line"><span className="num font-semibold">{String(known[0].n)}</span> {known[0].n === 1 ? "row" : "rows"} summed from the release tables</p>
        ) : (
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" data-testid="rows-line">
            {known.slice(0, 8).map((x) => (
              <li key={x.name}><span className="text-muted">{x.name}</span> <span className="num font-semibold">{String(x.n)}</span> {x.n === 1 ? "row" : "rows"}</li>
            ))}
            {known.length > 8 && <li className="text-muted">… {String(known.length)} cells in all</li>}
          </ul>
        )}
      </Part>

      <section className="border-t border-line px-4 py-2" data-testid="answer-part-receipt">
        <button type="button" onClick={() => setReceiptOpen((o) => !o)} aria-expanded={receiptOpen} className="flex w-full items-center gap-1 text-left" data-testid="receipt-toggle">
          {receiptOpen ? <ChevronDown size={12} className="text-muted" /> : <ChevronRight size={12} className="text-muted" />}
          <span className="micro">Query and calculation receipt</span>
        </button>
        {receiptOpen && (
          <div className="mt-2 space-y-2 text-xs" data-testid="receipt-body">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-fg">{functionLabel(principal.name)}</span>
              <span className="mono text-muted">{principal.name}</span>
              {r.request_type && r.request_type !== principal.name ? <span className="mono text-muted">{r.request_type}</span> : null}
            </div>
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {chips.map((c) => (
                  <span key={c.key} className="pill border border-line bg-surface px-2 py-px" title={`${c.key} = ${c.raw}`}>
                    <span className="text-muted">{c.label}</span> {c.value}
                  </span>
                ))}
              </div>
            )}
            {r.receipt && (
              <div>
                <span className="micro">Result ID</span> <span className="mono break-all text-fg" data-testid="receipt-id">{r.receipt}</span>
              </div>
            )}
            {r.receipt && (
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => drawer.open(r.receipt!, "calculation")} className="text-accent hover:underline" data-testid="open-calculation">Calculation</button>
                <button type="button" onClick={() => drawer.open(r.receipt!, "request")} className="text-accent hover:underline" data-testid="open-request">API request</button>
                <button type="button" onClick={() => drawer.open(r.receipt!, "sources")} className="text-accent hover:underline" data-testid="open-sources">Sources</button>
              </div>
            )}
          </div>
        )}
      </section>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-xs" data-testid="answer-part-links">
        {exploreHref && (
          <Link href={exploreHref} className="flex items-center gap-1 font-semibold text-accent hover:underline" data-testid="explore-permalink">
            <ExternalLink size={12} /> Open in Explore
          </Link>
        )}
        {csv && (
          <a href={csv} className="flex items-center gap-1 text-accent hover:underline" data-testid="download-csv">
            <Download size={12} /> Download CSV
          </a>
        )}
        {r.receipt && (
          <Link href={receiptHref(r.receipt)} className="text-muted hover:text-fg" data-testid="reproduce-link">Reproduce this result →</Link>
        )}
      </footer>
      {drawer.node}
    </article>
  );
}
