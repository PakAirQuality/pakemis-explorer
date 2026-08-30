"use client";
/**
 * An envelope's values as a table: humanised group columns (the id as secondary text),
 * right-aligned tabular values as shown (display_short, else display), an interval badge on
 * bounded cells, and a "full precision" toggle that switches the column to the contract's
 * `display` and adds the `exact` strings and row counts; sticky header. Nothing is computed;
 * every string is a field as received.
 */
import { useState } from "react";
import { cellLabel, shown, type Envelope, type Cell } from "@/lib/envelope";
import { cellUnit, columnLabel, groupValueLabel, type Dims } from "@/lib/labels";
import { releaseLabels, type Labels } from "@/lib/release";
import { IntervalBadge, isBounded } from "./IntervalBadge";

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

const EMPTY_LABELS: Labels = releaseLabels(undefined);
const EMPTY_DIMS: Dims = { adm1: [], adm2: [] };

export function EnvelopeTable({ env, extra = [], showExact = false, labels = EMPTY_LABELS, dims = EMPTY_DIMS, maxRows, dense = false }: { env: Envelope; extra?: string[]; showExact?: boolean; labels?: Labels; dims?: Dims; maxRows?: number; dense?: boolean }) {
  const [exact, setExact] = useState(showExact);
  const [all, setAll] = useState(false);
  const groupOf = (v: Cell) => v.group ?? ((v as Record<string, unknown>).left as { group?: Record<string, string | null> } | undefined)?.group ?? {};
  const groupKeys = Array.from(new Set(env.values.flatMap((v) => Object.keys(groupOf(v)))));
  const hasDisplay = env.values.some((v) => v.display !== "");
  const rows = maxRows && !all ? env.values.slice(0, maxRows) : env.values;
  const cellPad = dense ? "px-2 py-1" : "px-2 py-1.5";
  return (
    <div className="envelope-table text-xs" data-testid="envelope-table">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="flex items-center gap-1 text-micro normal-case tracking-normal" title="The contract's display and the exact decimal beside every value">
          <input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} data-testid="full-precision" /> full precision
        </label>
        {maxRows && env.values.length > maxRows && (
          <button className="text-micro normal-case tracking-normal text-accent" onClick={() => setAll((a) => !a)}>
            {all ? `first ${maxRows}` : `all ${env.values.length} rows`}
          </button>
        )}
      </div>
      <div className="max-h-[60vh] overflow-auto rounded border border-line">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-surface">
            <tr>
              {groupKeys.length ? groupKeys.map((k) => <th key={k} className={`${cellPad} text-left font-semibold text-muted`}>{columnLabel(k)}</th>) : <th className={`${cellPad} text-left font-semibold text-muted`}>Scope</th>}
              {extra.map((k) => <th key={k} className={`${cellPad} text-left font-semibold text-muted`}>{columnLabel(k)}</th>)}
              {hasDisplay && <th className={`${cellPad} text-right font-semibold text-muted`}>Value</th>}
              {hasDisplay && <th className={`${cellPad} text-left font-semibold text-muted`}>Unit</th>}
              {exact && <th className={`${cellPad} text-left font-semibold text-muted`}>Exact</th>}
              {exact && <th className={`${cellPad} text-right font-semibold text-muted`}>Rows</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((v, i) => {
              const g = groupOf(v);
              return (
                <tr key={i} className="border-t border-line align-top hover:bg-surface-3/60">
                  {groupKeys.length ? (
                    groupKeys.map((k) => {
                      const id = g[k] ?? "";
                      const human = groupValueLabel(labels, dims, k, id);
                      return (
                        <td key={k} className={cellPad}>
                          {human}
                          {human !== id && id ? <span className="mono ml-1 text-muted/80">{id}</span> : null}
                        </td>
                      );
                    })
                  ) : (
                    <td className={cellPad}>{cellLabel(v)}</td>
                  )}
                  {extra.map((k) => <td key={k} className={`${cellPad} break-words`}>{groupValueLabel(labels, dims, k, fmt((v as Record<string, unknown>)[k]))}</td>)}
                  {hasDisplay && (
                    <td className={`${cellPad} num whitespace-nowrap text-right`}>
                      <span className={isBounded(v) ? "mr-1" : ""} data-testid="table-value">{exact ? v.display : shown(v)}</span>
                      {isBounded(v) && <IntervalBadge cell={v} title={String((v as Record<string, unknown>).interpretation ?? "")} />}
                    </td>
                  )}
                  {hasDisplay && <td className={`${cellPad} whitespace-nowrap text-muted`} title={v.unit}>{cellUnit(v)}</td>}
                  {exact && <td className={`${cellPad} mono`}>{v.exact}{v.exact_high && v.exact_high !== v.exact ? ` .. ${v.exact_high}` : ""}</td>}
                  {exact && <td className={`${cellPad} num text-right`}>{v.n_rows ?? v.result_row_ids.length}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
