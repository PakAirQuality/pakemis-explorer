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
 * details); (7) the expandable query and calculation receipt; (8) the permalink to /data
 * (stateFromRequest of the call's input), the CSV and the reproduce link. Every number on the
 * card is a string the stream or the replayed envelope carried.
 */
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { BarsWithAxis, type BarItem } from "@/components/charts/BarsWithAxis";
import { ColumnChart, type ColumnPoint } from "@/components/charts/ColumnChart";
import { IntervalBadge, isBounded } from "@/components/ui/IntervalBadge";
import { api, apiUrl, receiptHref } from "@/lib/api";
import type { Envelope } from "@/lib/envelope";
import { cellUnit, columnLabel, geographyName, inputChips, limitationText, periodShort, gwpLabel } from "@/lib/labels";
import { gasColor, rampByRank } from "@/lib/palette";
import { stateFromRequest } from "@/lib/requests";
import { applyPatch, hrefForState, resolveState } from "@/lib/urlState";
import { renderAnswer } from "./answerText";
import { barLabel, cellName, chartKind, downloadTool, exactnessWords, groupKeyOf, principalTool, rowsOf, scopeRows, sizeOf, uncertaintyTool } from "./answerParts";
import { useReceiptDrawer } from "./receiptDrawer";
import { MapMovedLine, ProvenanceLine } from "./Provenance";
import { WORD_KEYS, mapPatchFromInput, movesMap, previousOf, undoPatch, type MapMove } from "./mapMove";
import { activityNote, activityScopeRows, activitySources, isActivity } from "./activity";
import { attachmentOf, attachmentTitle, disclosureOf, followUps, isModelled, methodDisclosure, methodTool, periodSpan, scopeNote } from "./attachment";
import { allocationSurfaceWords } from "@/components/methods/evidenceClassText";
import type { Highlight } from "./ToolCard";
import type { AnswerEvent, LibrarySource, TimelineItem, ToolResultCell, ToolResultEvent } from "./types";

/** Re-exported: the question lives beside the follow-up rules that offer it. */
export { UNCERTAINTY_FOLLOW_UP } from "./attachment";
import { UNCERTAINTY_FOLLOW_UP } from "./attachment";
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

/** "national", "Punjab", "district-level" - the place the note names, through the release's labels. */
function placeWords(labels: Parameters<typeof geographyName>[0], r: ToolResultEvent): string {
  const level = typeof r.context?.geography_level === "string" ? r.context.geography_level : "national";
  const ids = Array.isArray(r.context?.geography_ids) ? (r.context.geography_ids as unknown[]).filter((x): x is string => typeof x === "string") : [];
  if (level === "national") return "national";
  if (ids.length === 1) return geographyName(labels, ids[0]);
  return level === "adm1" ? "provincial" : level === "adm2" ? "district-level" : "grid-cell";
}

/** One labelled line of the details: a name on the left, words on the right. */
function Row({ name, testid, children }: { name: string; testid: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2" data-testid={testid}>
      <dt className="w-28 shrink-0 text-muted">{name}</dt>
      <dd className="min-w-0 flex-1 text-fg">{children}</dd>
    </div>
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

export function AnswerCard({ answer, items, onCite, onFollowUp, agentMove = null, onUndoAgentMove }: {
  answer: AnswerEvent;
  items: TimelineItem[];
  onCite: { hover: (h: Highlight) => void; click: (h: Highlight) => void };
  onFollowUp: (question: string) => void;
  agentMove?: MapMove | null;
  onUndoAgentMove?: () => void;
}) {
  const { labels, dims, state, setState, defaults, release } = useExplorer();
  const principal = principalTool(items, answer.scope);
  const unc = uncertaintyTool(items);
  const dl = downloadTool(items);
  const r = principal?.result ?? null;
  const env = useReplay(r?.receipt);
  const uncEnv = useReplay(unc && unc !== principal ? unc.result?.receipt : null);
  const drawer = useReceiptDrawer(labels);
  const [asTable, setAsTable] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [clicked, setClicked] = useState<MapMove | null>(null);
  // one line for both paths: the reader clicked Show on map, or the agent honoured "show me X"
  const move = clicked ?? agentMove;
  const [sourcesOpen, setSourcesOpen] = useState(false);

  // `how_to_obtain` in the source register restates the document and then says how to get it, so
  // printing both put every source on screen twice. Only the instruction is new information.
  const obtainTail = (s: LibrarySource) => {
    const raw = (s.how_to_obtain ?? "").trim();
    if (!raw) return "";
    const tail = raw.includes(" -- ") ? raw.slice(raw.indexOf(" -- ") + 4) : raw;
    // case-insensitively: the register's own wording is sentence-cased into a title, so the
    // restatement and the title differ in their first letter and nothing else
    const head = s.title.slice(0, 40).toLowerCase();
    return tail.toLowerCase().startsWith(head) ? "" : tail;
  };
  // the library's own turns carry `source: "library"` and structured source records rather than
  // the inline <cite k cell receipt> tags a model writes
  const fromLibrary = (answer as { source?: string }).source === "library";
  const librarySources = (answer.citations ?? []).filter(
    (c): c is LibrarySource => typeof (c as LibrarySource).source_id === "string");
  // UNBOXED. The prose used to sit inside a bordered, shadowed card whether it was one sentence or
  // twenty - the same furniture for every answer. It is a chat message now.
  //
  // A CITE STILL LEADS SOMEWHERE. Clicking a cited number used to scroll to the tool card that
  // produced it; those cards are gone, so it opens the evidence instead - the same destination,
  // which is the call, its filters and its receipt.
  const citeHandlers = {
    hover: onCite.hover,
    click: (h: Highlight) => { setEvidenceOpen(true); onCite.click(h); },
    modelled: ({ k, cell }: { k: number; cell: number; text: string }) => {
      const t = items.find((i) => i.kind === "tool" && i.k === k);
      const cells = t && t.kind === "tool" ? t.result?.cells ?? [] : [];
      return isModelled(cells.find((c: ToolResultCell) => c.i === cell));
    },
  };
  const answerBody = (
    <div className="text-sm leading-relaxed text-fg" data-testid="answer-part-answer">
      {renderAnswer(answer.text, citeHandlers)}
    </div>
  );
  const attachment = attachmentOf(principal, answer, items);
  if (!principal || !r) {
    // A PREPARED EXPLANATION IS NOT A DEFICIENT QUERY. When the library answers there is no tool
    // call by design: the question was about what something MEANS, and the answer carries sources
    // instead of a receipt. Its provenance line names the cards it was built from - the server
    // sends their titles - and opening it shows the sources rather than a receipt it never minted.
    const sources = fromLibrary ? librarySources : [];
    const titles = (answer as { titles?: string[] }).titles ?? [];
    const what = titles.length ? titles.join(" · ") : "Prepared explanation";
    return (
      <div className="flex flex-col gap-2.5" data-testid="answer-card" data-from="library">
        {answerBody}
        {fromLibrary && (
          <ProvenanceLine what={what} open={sourcesOpen} onToggle={() => setSourcesOpen((o) => !o)} />
        )}
        {fromLibrary && sourcesOpen && (
          <ul className="rounded-card border border-line bg-card px-3 py-1.5" data-testid="answer-sources">
            {sources.map((s) => (
              <li key={s.source_id} className="py-1 text-xs leading-snug" data-testid="answer-source" data-kind={s.kind}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{s.title}</a>
                ) : (
                  <span className="text-fg">{s.title}</span>
                )}
                {obtainTail(s) ? <span className="block text-muted">{obtainTail(s)}</span> : null}
              </li>
            ))}
            {sources.length === 0 && <li className="py-1 text-xs text-muted">This explanation cites no document.</li>}
          </ul>
        )}
      </div>
    );
  }

  const cells = r.cells;
  const kind = chartKind(cells);
  const key = groupKeyOf(cells);
  const shownCells = cells.slice(0, MAX_ROWS);
  const showChart = !asTable && (kind === "bars" || kind === "columns");
  // THE SCOPE FOLLOWS THE FIGURES. `answer.scope` is the LAST tool result's context, which is not
  // necessarily the one the answer's numbers came from - so provincial figures were captioned
  // "Pakistan (national)". The principal result is by definition where the figures are from.
  const context = r.context;
  const cb = release.context_bar;
  // A RECORD HAS ITS OWN SCOPE. A count from the vehicle register is about a place and a date, not
  // about a gas, a warming-potential basis or the fiscal year the map happens to show; see activity.ts.
  const activity = isActivity(r, principal.name);
  const rows = activity ? activityScopeRows(r) : scopeRows(labels, dims, context, principal.input, cb.basis_label ? { basis: cb.basis, label: cb.basis_label } : undefined);
  const recordSources = activity ? activitySources(r) : null;
  const ticks = env?.axis?.ticks_short ?? null;
  // the gases keep their three hues; every other set is the PAQI ramp by rank (the cell's order in the envelope), a visual encoding that prints nothing
  const colorOf = (c: ToolResultCell, i: number) => (key === "gas" ? gasColor(c.group?.[key]) : rampByRank(i, shownCells.length));
  const bars: BarItem[] = shownCells.map((c, i) => ({ id: String(c.i), name: cellName(labels, dims, c), value: sizeOf(c, env), label: barLabel(c, env), color: colorOf(c, i) }));
  const columns: ColumnPoint[] = shownCells.map((c) => ({ id: String(c.i), name: cellName(labels, dims, c), value: sizeOf(c, env), label: c.display_short ?? c.display ?? "", reference: key === "period_id" && c.group?.period_id === defaults.period_id }));
  const uncRows = r.uncertainty?.rows ?? [];
  const uncCells = unc?.result?.cells ?? [];
  const exactness = exactnessWords(cells);
  const evidenceWords = [
    ...r.limitations_hit.map((l) => limitationText(labels, l)),
    ...exactness,
    ...(r.unallocated ? ["some mass is unallocated at this grain"] : []),
  ].filter(Boolean);
  const patch = principal.name === "set_map_view" || activity ? {} : stateFromRequest({ name: principal.name, body: principal.input });
  // THE LINK OPENS THE ANSWER'S SCOPE, NOT THE READER'S LATEST. It was the request's fields patched
  // over the current state, so anything selected since the question rode along: an answer about
  // the whole country opened on the province now on screen, and a greenhouse answer opened as a
  // PM₂.₅ page if a pollutant had been chosen meanwhile. The base is the release's defaults.
  const exploreHref = Object.keys(patch).length ? hrefForState(applyPatch(resolveState({}, defaults), patch, defaults), defaults, "/data") : null;
  // A CSV ONLY WHEN ONE WAS ASKED FOR. The fallback that used to sit here - `api.downloadCsvUrl(r.receipt)`
  // - put an export under every answer, and what it exported was the QUERY, not the answer: a
  // question about three agriculture categories offered a 33-cell national completeness ledger
  // across unrelated sectors. That is backend output presented as a feature. `download_query_result`
  // runs only when the reader asks to export, so its presence IS the asking.
  const csv = dl?.result?.download?.csv ? apiUrl(dl.result.download.csv) : null;
  const turnHasUncertainty = uncRows.length > 0 || uncCells.length > 0;
  const suggestions = followUps(principal, answer, turnHasUncertainty, dims);

  // THE CHANGE PILL IS A SERVER STRING OR IT IS ABSENT. The envelope carries `change` already
  // (change_pct_short, direction, and a note saying it compares the first and last period only);
  // the browser computing "+17.1 %" from the cells is the one thing this panel may never do.
  const change = env?.change ?? null;
  const mt = methodTool(items);
  const methodRecord = mt?.result ? methodDisclosure(mt.result) : null;
  const level = typeof r.context?.geography_level === "string" ? r.context.geography_level : "";
  const disclosure = disclosureOf(cells, methodRecord, { surface: allocationSurfaceWords, plainClass: () => "", level });
  const spanWords = periodSpan(r, (id) => periodShort(labels, id));

  const resultTable = (
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
  );

  const uncertaintyBody =
    uncRows.length > 0 ? (
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
    );

  // SHOW ON MAP IS AN OFFER, NOT AN ACT. It is derived here from the call's own input, so it is
  // available whether or not the agent chose to move the map - and nothing moves until it is
  // clicked. `stateFromRequest` is the same mapping the "Open in Explore" link already uses.
  const mapPatch = mapPatchFromInput(principal.input, principal.name);
  const mapWouldMove = movesMap(state, mapPatch);
  const showOnMap = () => {
    setClicked({ patch: mapPatch, previous: previousOf(state, mapPatch) });
    setState(mapPatch);
  };

  const provenance = (
    <ProvenanceLine
      open={evidenceOpen}
      onToggle={() => setEvidenceOpen((o) => !o)}
      extra={
        mapWouldMove && !move ? (
          <button type="button" onClick={showOnMap}
                  className="shrink-0 font-medium text-accent underline underline-offset-2 hover:text-accent-bright"
                  data-testid="show-on-map">
            Show on map
          </button>
        ) : undefined
      }
    />
  );

  // THE SCOPE, SAID ONCE, BY US. See attachment.scopeNote: the model used to write this and wrote it
  // twice. It reads as the answer's last sentence, muted so it does not pretend to be the model's.
  const note = activity ? activityNote(r) : scopeNote(r, {
    period: (id) => periodShort(labels, id),
    gwp: (id) => gwpLabel(labels, id),
    place: (res) => placeWords(labels, res),
    lulucf: labels.lulucf?.short ?? "",
  });

  const attachmentNode =
    attachment === "none" ? null : (
      <div className="overflow-hidden rounded-card border border-line bg-card" data-testid="answer-attachment" data-kind={attachment}>
        <div className="flex items-start gap-2 px-3.5 pt-3">
          {/* "National greenhouse-gas emissions / Mt CO2e · 2023-24" describes a chart. Over a method
              record it described nothing, which is how "National emissions / method · 2023–24" came
              to sit above a registry row. */}
          <h4 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-fg">
            {attachment === "method" ? "How this is estimated" : attachment === "uncertainty" ? "Uncertainty" : attachmentTitle(r)}
          </h4>
          {change?.change_pct_short && (
            <span className="pill shrink-0 bg-note-bg px-2 py-0.5 text-xs font-semibold text-note-text" data-testid="change-pill" title={change.note ?? undefined}>
              {change.change_pct_short} %
            </span>
          )}
          {(kind === "bars" || kind === "columns") && (
            <button type="button" onClick={() => setAsTable((t) => !t)} className="shrink-0 text-micro normal-case tracking-normal text-accent hover:underline" data-testid="result-toggle">
              {asTable ? "Chart" : "Table"}
            </button>
          )}
        </div>
        {attachment === "chart" && (
          <p className="px-3.5 pt-0.5 text-xs text-muted">
            {cellUnit(cells[0])}{spanWords ? ` · ${spanWords}` : ""}
          </p>
        )}
        <div className="px-3.5 pb-2 pt-3">
          {attachment === "uncertainty" ? uncertaintyBody : null}
          {attachment === "method" && methodRecord ? (
            <dl className="space-y-1 text-xs" data-testid="method-disclosure">
              <div className="flex gap-1.5"><dt className="shrink-0 text-muted">Method:</dt><dd className="text-fg">{methodRecord.method}</dd></div>
              {methodRecord.basis ? (
                <div className="flex gap-1.5"><dt className="shrink-0 text-muted">Basis:</dt><dd className="text-fg">{methodRecord.basis}</dd></div>
              ) : null}
            </dl>
          ) : null}
          {attachment === "chart" && showChart && kind === "bars" && <BarsWithAxis items={bars} ticks={ticks} testId="answer-bars" />}
          {attachment === "chart" && showChart && kind === "columns" && <ColumnChart points={columns} ticks={ticks} height={168} testId="answer-columns" />}
          {attachment === "chart" && asTable ? resultTable : null}
          {cells.length > MAX_ROWS && <p className="mt-1 text-xs text-muted">first {MAX_ROWS} of {String(cells.length)} cells; the CSV carries every one</p>}
          {r.truncated && <p className="mt-1 text-xs text-muted">{r.truncated}</p>}
          {/* the envelope's own caveat, and the reason it matters: the series this compares is not
              monotonic, so the percentage alone would read as a steady climb */}
          {change?.note && <p className="mt-1.5 text-xs text-muted" data-testid="change-note">{change.note}</p>}
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-2.5" data-testid="answer-card" data-principal-k={principal.k}>
      {answerBody}
      {attachmentNode}
      {/* ALWAYS THIS ORDER, chart or no chart: the answer, then what it is scoped to, then the way in
          to its sources. The line used to live in the chart's footer, which put it in a different
          place depending on what the question happened to return. */}
      {/* THE DISCLOSURE. Two provinces derived from one national fuel total are equally modelled;
          this says so once, in the release's own vocabulary, under the figures that say it too. */}
      {(disclosure.estimate || disclosure.data || disclosure.proxies || disclosure.method) && (
        <dl className="space-y-0.5 text-xs" data-testid="disclosure">
          {disclosure.estimate && <Row name="Estimate type" testid="disclosure-estimate">{disclosure.estimate}</Row>}
          {disclosure.data && <Row name="National data" testid="disclosure-data">{disclosure.data}</Row>}
          {disclosure.proxies && <Row name="Spatial proxies" testid="disclosure-proxies">{disclosure.proxies}</Row>}
          {disclosure.method && <Row name="Method" testid="disclosure-method">{disclosure.method}</Row>}
        </dl>
      )}
      <p className="text-xs leading-relaxed text-muted" data-testid="scope-note">{note}</p>
      {provenance}
      {move && (
        <MapMovedLine
          words={inputChips(labels, dims, Object.fromEntries(WORD_KEYS.map((k) => [k, (move.patch as Record<string, unknown>)[k]]).filter(([, v]) => v))).map((c) => c.value).join(" · ")}
          onUndo={() => { if (clicked) { setState(undoPatch(clicked)); setClicked(null); } else { onUndoAgentMove?.(); } }}
        />
      )}

      {evidenceOpen && (
        <div className="overflow-hidden rounded-card border border-line bg-card px-4 py-3" data-testid="evidence-detail">
          {/* HUMAN-READABLE ONLY. This held the result as the engine returned it - "Scope | Value |
              Rows", the tool's own name and cell count, per-cell row counts, the bare receipt string
              and "Uncertainty not requested". All of it was machine-facing, and a reader who opened
              "View details" to understand an answer met a database row. Reproduction is the link at
              the foot, which is what a receipt is for. */}
          <dl className="space-y-2 text-xs" data-testid="detail-rows">
            {disclosure.estimate && (
              <Row name="Estimate type" testid="detail-estimate">{disclosure.estimate}</Row>
            )}
            {rows.length > 0 && (
              <Row name="Applied to" testid="detail-scope">
                <span className="flex flex-wrap gap-1">
                  {rows.map((row) => (
                    <span key={row.name + row.value} className="pill border border-line bg-surface px-2 py-px" data-testid="scope-row">
                      <span className="text-muted">{row.name}</span> {row.value}
                    </span>
                  ))}
                </span>
              </Row>
            )}
            {disclosure.data && <Row name="National data" testid="detail-data">{disclosure.data}</Row>}
            {disclosure.proxies && <Row name="Spatial proxies" testid="detail-proxies">{disclosure.proxies}</Row>}
            {disclosure.method && <Row name="Method" testid="detail-method">{disclosure.method}</Row>}
            {/* a record's source as the release prints it, and the whole of what it may not be read as */}
            {recordSources?.reference && <Row name="Source" testid="detail-record-source">{recordSources.reference}</Row>}
            {recordSources?.note && <Row name="Read it as" testid="detail-record-note">{recordSources.note}</Row>}
            {/* uncertainty appears only when there IS some: "Uncertainty not requested" told a
                reader nothing about the answer and everything about the query we happened to run */}
            {(uncRows.length > 0 || uncCells.length > 0) && <Row name="Uncertainty" testid="detail-uncertainty">{uncertaintyBody}</Row>}
            {evidenceWords.length > 0 && <Row name="Qualifications" testid="detail-evidence">{evidenceWords.join(" · ")}</Row>}
            {librarySources.length > 0 && (
              <Row name="Sources" testid="detail-sources">
                {librarySources.map((src) => src.title).join(" · ")}
              </Row>
            )}
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2.5 text-xs" data-testid="answer-part-links">
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
              <Link href={receiptHref(r.receipt)} className="text-accent hover:underline" data-testid="reproduce-link">Reproduce this result →</Link>
            )}
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="follow-ups">
          {suggestions.map((q) => (
            <button key={q} type="button" onClick={() => onFollowUp(q)}
                    className="pill border border-line px-3 py-1.5 text-xs text-accent hover:bg-accent-soft" data-testid="follow-up">
              {q}
            </button>
          ))}
        </div>
      )}
      {drawer.node}
    </div>
  );
}
