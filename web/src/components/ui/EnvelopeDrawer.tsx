"use client";
/**
 * The envelope, opened: Evidence (provenance tables, unallocated mass, limitations hit, defaults
 * applied, uncertainty), Calculation (SQL in mono, formula, result_sha256), Download, Cite.
 * Everything shown is a field of the envelope as received.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/envelope";

export type DrawerTab = "evidence" | "calculation" | "download" | "cite";
const TABS: [DrawerTab, string][] = [["evidence", "Evidence"], ["calculation", "Calculation"], ["download", "Download"], ["cite", "Cite"]];

/** Line breaks before the SQL clauses so the statement reads; no token is changed. */
export function formatSql(sql: string): string {
  return sql.replace(/\s+(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|LEFT JOIN|JOIN|UNION ALL|UNION|WITH|SELECT)\b/g, "\n$1").replace(/\s+(AND|OR)\b/g, "\n  $1").trim();
}

type Prov = { tables?: { table?: string; path: string; sha256: string | null }[] };
type Unalloc = { level?: string; by_province?: { province: string; exact: string; n_rows: number }[]; by_module_gas?: { module: string; gas: string; exact: string }[]; note?: string };

export function EnvelopeDrawer({ env, tab: initial, onClose }: { env: Envelope; tab: DrawerTab; onClose: () => void }) {
  const [tab, setTab] = useState<DrawerTab>(initial);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const prov = env.provenance as Prov;
  const unalloc = env.unallocated as Unalloc;
  const calc = env.calculation as { sql?: string; kind?: string; [k: string]: unknown };
  const unit = env.values[0]?.unit ?? "";
  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-ink/30" onClick={onClose} role="dialog" aria-label="Envelope">
      <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="micro">{env.request_type}</div>
            <div className="mono text-xs text-muted">receipt {env.receipt}</div>
          </div>
          <button aria-label="Close" onClick={onClose} className="pill p-1 text-muted hover:bg-canvas hover:text-ink"><X size={16} /></button>
        </div>
        <div className="flex gap-1 border-b border-line px-3 py-2">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`pill px-3 py-1 text-xs ${tab === id ? "bg-ink text-white" : "text-muted hover:bg-canvas"}`}>{label}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
          {tab === "evidence" && (
            <div className="space-y-4">
              <section>
                <h4 className="micro mb-1">Provenance</h4>
                <ul className="space-y-1">
                  {(prov.tables ?? []).map((t) => (
                    <li key={t.path} className="mono text-xs break-all text-muted">{t.table ? `${t.table}: ` : ""}{t.path} <span className="text-ink/60">sha256 {t.sha256 ?? "(not listed)"}</span></li>
                  ))}
                  {!(prov.tables ?? []).length && <li className="text-xs text-muted">{JSON.stringify(env.provenance)}</li>}
                </ul>
              </section>
              {(unalloc.by_province?.length || unalloc.by_module_gas?.length) ? (
                <section>
                  <h4 className="micro mb-1">Unallocated mass{unalloc.level ? ` (retained at ${unalloc.level})` : ""}</h4>
                  <table className="w-full text-xs">
                    <tbody>
                      {unalloc.by_province?.map((u) => (
                        <tr key={u.province} className="border-b border-line"><td className="py-1">{u.province}</td><td className="mono num py-1">{u.exact}</td><td className="py-1 text-muted">{unit} (exact) · {u.n_rows} rows</td></tr>
                      ))}
                      {unalloc.by_module_gas?.map((u) => (
                        <tr key={`${u.module}|${u.gas}`} className="border-b border-line"><td className="py-1">{u.module} · {u.gas}</td><td className="mono num py-1">{u.exact}</td><td className="py-1 text-muted">{unit} (exact)</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {unalloc.note && <p className="mt-1 text-xs text-muted">{unalloc.note}</p>}
                </section>
              ) : null}
              <section>
                <h4 className="micro mb-1">Limitations hit</h4>
                <ul className="space-y-1">
                  {env.limitations_hit.map((l, i) => (
                    <li key={i} className="text-xs"><span className="mono font-semibold">{String(l.id)}</span>{l.message ? `: ${String(l.message)}` : ""}</li>
                  ))}
                  {!env.limitations_hit.length && <li className="text-xs text-muted">none</li>}
                </ul>
              </section>
              {env.context.defaults_applied.length > 0 && (
                <section>
                  <h4 className="micro mb-1">Defaults applied by the contract</h4>
                  <p className="mono text-xs">{env.context.defaults_applied.join(", ")}</p>
                </section>
              )}
              {Object.keys(env.uncertainty).length > 0 && (
                <section>
                  <h4 className="micro mb-1">Uncertainty</h4>
                  <pre className="mono whitespace-pre-wrap break-all rounded bg-canvas p-2 text-xs">{JSON.stringify(env.uncertainty, null, 1)}</pre>
                </section>
              )}
              {env.completeness.length > 0 && (
                <section>
                  <h4 className="micro mb-1">Completeness</h4>
                  <pre className="mono whitespace-pre-wrap break-all rounded bg-canvas p-2 text-xs">{JSON.stringify(env.completeness, null, 1)}</pre>
                </section>
              )}
            </div>
          )}
          {tab === "calculation" && (
            <div className="space-y-3">
              {calc.kind && <p className="text-xs text-muted">kind <span className="mono">{String(calc.kind)}</span></p>}
              {calc.sql && <pre className="mono whitespace-pre-wrap break-words rounded bg-canvas p-2 text-xs">{formatSql(String(calc.sql))}</pre>}
              {Object.entries(calc).filter(([k]) => k !== "sql" && k !== "kind").map(([k, v]) => (
                <p key={k} className="text-xs"><span className="text-muted">{k}</span> <span className="mono break-all">{typeof v === "string" ? v : JSON.stringify(v)}</span></p>
              ))}
              <p className="text-xs">formula of cell 0 <span className="mono">{env.values[0]?.formula ?? ""}</span></p>
              <p className="text-xs">values {env.values.length} · result_sha256 <span className="mono break-all">{env.result_sha256}</span></p>
            </div>
          )}
          {tab === "download" && (
            <div className="space-y-2 text-sm">
              <p><a className="text-accent underline" href={api.downloadCsvUrl(env.receipt)}>canonical CSV</a> · <a className="text-accent underline" href={api.downloadReceiptUrl(env.receipt)}>RECEIPT.json</a></p>
              <p className="text-xs text-muted">Both are served by replaying receipt {env.receipt}; the download restates every provenance digest and the licence note.</p>
            </div>
          )}
          {tab === "cite" && (
            <div className="space-y-2">
              <p className="mono text-xs break-words">{env.citation}</p>
              <p className="text-xs text-muted">{env.context.release} · {env.context.basis} · {env.context.configuration_id} · {env.context.gwp_basis} · LULUCF {env.context.lulucf.status} ({env.context.lulucf.notation_key})</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
