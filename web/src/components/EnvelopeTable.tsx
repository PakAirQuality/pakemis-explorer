"use client";
/** The values of an envelope as a table: group columns, display, unit, and exact on request. */
import { useState } from "react";
import { cellLabel, type Envelope } from "@/lib/envelope";

/** An extra column as received: strings verbatim, objects as compact JSON, never reformatted. */
function fmt(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

export function EnvelopeTable({ env, extra = [], showExact = false }: { env: Envelope; extra?: string[]; showExact?: boolean }) {
  const [exact, setExact] = useState(showExact);
  const groupKeys = Array.from(new Set(env.values.flatMap((v) => Object.keys(v.group ?? {}))));
  return (
    <div className="envelope-table">
      <label className="small">
        <input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} /> show exact decimal strings
      </label>
      <table>
        <thead>
          <tr>
            {groupKeys.length ? groupKeys.map((k) => <th key={k}>{k}</th>) : <th>scope</th>}
            {extra.map((k) => (
              <th key={k}>{k}</th>
            ))}
            <th>display</th>
            <th>unit</th>
            {exact && <th>exact</th>}
            {exact && <th>rows</th>}
          </tr>
        </thead>
        <tbody>
          {env.values.map((v, i) => (
            <tr key={i}>
              {groupKeys.length ? groupKeys.map((k) => <td key={k}>{v.group?.[k] ?? ""}</td>) : <td>{cellLabel(v)}</td>}
              {extra.map((k) => (
                <td key={k}>{fmt((v as Record<string, unknown>)[k])}</td>
              ))}
              <td className="num">{v.display}</td>
              <td>{v.unit}</td>
              {exact && <td className="mono">{v.exact}{v.exact_high && v.exact_high !== v.exact ? ` .. ${v.exact_high}` : ""}</td>}
              {exact && <td>{v.n_rows ?? v.result_row_ids.length}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
