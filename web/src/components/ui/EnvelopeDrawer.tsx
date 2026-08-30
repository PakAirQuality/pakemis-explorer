"use client";
/**
 * Result details: a result's envelope opened as six tabs. Sources (provenance tables,
 * unallocated mass, limitations hit, uncertainty, completeness), Filters (the request's context
 * as the API returned it: periods, configuration, GWP basis, geography, view, basis, defaults
 * applied), Calculation (SQL in mono, formula, result_sha256), API request (the canonical
 * request JSON and a curl line against the prefixed API base), Download, Cite; Calculation also
 * lists every cell as shown, at the contract's precision and exact. The foot carries
 * the Result ID (the receipt, in full, with a copy button) and the replay link. Everything shown
 * is a field of the envelope as received; the labels, when given, only name ids.
 */
import { useCallback, useMemo, useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { Copy, X } from "lucide-react";
import { absoluteApiBase, api, receiptHref } from "@/lib/api";
import { cellLabel, shown, type Envelope } from "@/lib/envelope";
import { apiCallOf, curlLine } from "@/lib/requests";
import { releaseLabels, type Labels } from "@/lib/release";
import { cellUnit, configLabel, geographyName, gwpLabel, lulucfShort, periodShort, viewLabel } from "@/lib/labels";

export type DrawerTab = "sources" | "filters" | "calculation" | "request" | "download" | "cite";
export const DRAWER_TABS: [DrawerTab, string][] = [["sources", "Sources"], ["filters", "Filters"], ["calculation", "Calculation"], ["request", "API request"], ["download", "Download"], ["cite", "Cite"]];

/** Line breaks before the SQL clauses so the statement reads; no token is changed. */
export function formatSql(sql: string): string {
  return sql.replace(/\s+(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|LEFT JOIN|JOIN|UNION ALL|UNION|WITH|SELECT)\b/g, "\n$1").replace(/\s+(AND|OR)\b/g, "\n  $1").trim();
}

/** The canonical request JSON, indented; the string as received when it does not parse. */
export function prettyRequest(request: string): string {
  try {
    return JSON.stringify(JSON.parse(request), null, 2);
  } catch {
    return request;
  }
}

type Prov = { tables?: { table?: string; path: string; sha256: string | null }[] };
type Unalloc = { level?: string; by_province?: { province: string; exact: string; n_rows: number }[]; by_module_gas?: { module: string; gas: string; exact: string }[]; note?: string };

const NO_LABELS = releaseLabels(undefined);

/** The Filters rows: the envelope's context, ids named through the labels where they exist. */
export function filterRows(env: Envelope, labels: Labels = NO_LABELS): { name: string; value: string; id?: string }[] {
  const c = env.context;
  const periods = c.periods ?? [];
  const ids = c.geography_ids ?? [];
  const rows: { name: string; value: string; id?: string }[] = [];
  rows.push({ name: periods.length === 1 ? "Period" : "Periods", value: periods.map((p) => periodShort(labels, p)).join(", ") || "not set" });
  if (c.configuration_id) rows.push({ name: "Configuration", value: configLabel(labels, c.configuration_id), id: c.configuration_id });
  if (c.gwp_basis) rows.push({ name: "Warming potentials", value: gwpLabel(labels, c.gwp_basis), id: c.gwp_basis });
  rows.push({ name: "Geography", value: [c.geography_level || "not set", ids.map((g) => geographyName(labels, g)).join(", ")].filter(Boolean).join(": "), id: ids.length ? ids.join(", ") : undefined });
  if (c.spatial_view) rows.push({ name: "Spatial view", value: viewLabel(labels, c.spatial_view).split(":")[0], id: c.spatial_view });
  if (c.basis) rows.push({ name: "Basis", value: c.basis });
  rows.push({ name: "Defaults applied", value: c.defaults_applied.length ? c.defaults_applied.join(", ") : "none" });
  return rows;
}

/**
 * A page-level drawer opened on demand: `open(env, tab)` shows the EnvelopeDrawer on that
 * envelope at that tab (a result card's "Show calculation" -> calculation, "Inspect evidence"
 * -> sources); `node` is rendered once by the page. Each opening mounts afresh, so the tab asked
 * for is the one shown.
 */
export function useEnvelopeDrawer(labels?: Labels): { open: (env: Envelope, tab?: DrawerTab) => void; close: () => void; node: ReactNode; isOpen: boolean } {
  const [state, setState] = useState<{ env: Envelope; tab: DrawerTab; n: number } | null>(null);
  const open = useCallback((env: Envelope, tab: DrawerTab = "sources") => setState((s) => ({ env, tab, n: (s?.n ?? 0) + 1 })), []);
  const close = useCallback(() => setState(null), []);
  const node = useMemo(() => (state ? <EnvelopeDrawer key={`${state.n}-${state.tab}`} env={state.env} tab={state.tab} labels={labels} onClose={close} /> : null), [state, labels, close]);
  return { open, close, node, isOpen: !!state };
}

export function EnvelopeDrawer({ env, tab: initial, onClose, labels }: { env: Envelope; tab: DrawerTab; onClose: () => void; labels?: Labels }) {
  const [tab, setTab] = useState<DrawerTab>(initial);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const prov = env.provenance as Prov;
  const unalloc = env.unallocated as Unalloc;
  const calc = env.calculation as { sql?: string; kind?: string; [k: string]: unknown };
  const unit = cellUnit(env.values[0]);
  const call = apiCallOf(env.request_type, env.request, env.receipt);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(env.receipt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable: the full id is on screen */
    }
  };
  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-fg/30" onClick={onClose} role="dialog" aria-label="Result details">
      <div className="flex h-full w-full max-w-xl flex-col bg-surface-2 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-fg">Result details</div>
            <div className="mono text-xs text-muted">{env.request_type}</div>
          </div>
          <button aria-label="Close" onClick={onClose} className="pill p-1 text-muted hover:bg-surface-3 hover:text-fg"><X size={16} /></button>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-line px-3 py-2" role="tablist">
          {DRAWER_TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`pill px-3 py-1 text-xs ${tab === id ? "bg-fg text-surface" : "text-muted hover:bg-surface-3"}`}>{label}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 text-sm" data-testid={`drawer-${tab}`}>
          {tab === "sources" && (
            <div className="space-y-4">
              <section>
                <h4 className="micro mb-1">Provenance</h4>
                <ul className="space-y-1">
                  {(prov.tables ?? []).map((t) => (
                    <li key={t.path} className="mono text-xs break-all text-muted">{t.table ? `${t.table}: ` : ""}{t.path} <span className="text-fg/60">sha256 {t.sha256 ?? "(not listed)"}</span></li>
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
              {Object.keys(env.uncertainty).length > 0 && (
                <section>
                  <h4 className="micro mb-1">Uncertainty</h4>
                  <pre className="mono whitespace-pre-wrap break-all rounded bg-surface p-2 text-xs">{JSON.stringify(env.uncertainty, null, 1)}</pre>
                </section>
              )}
              {env.completeness.length > 0 && (
                <section>
                  <h4 className="micro mb-1">Completeness</h4>
                  <pre className="mono whitespace-pre-wrap break-all rounded bg-surface p-2 text-xs">{JSON.stringify(env.completeness, null, 1)}</pre>
                </section>
              )}
            </div>
          )}
          {tab === "filters" && (
            <table className="w-full text-xs" data-testid="filters-table">
              <tbody>
                {filterRows(env, labels).map((r) => (
                  <tr key={r.name} className="border-b border-line align-top">
                    <th scope="row" className="w-32 py-1.5 pr-3 text-left font-semibold text-fg">{r.name}</th>
                    <td className="py-1.5">
                      {r.value}
                      {r.id && r.id !== r.value ? <span className="mono ml-2 text-muted">{r.id}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "calculation" && (
            <div className="space-y-3">
              {calc.kind && <p className="text-xs text-muted">kind <span className="mono">{String(calc.kind)}</span></p>}
              {calc.sql && <pre className="mono whitespace-pre-wrap break-words rounded bg-surface p-2 text-xs">{formatSql(String(calc.sql))}</pre>}
              {Object.entries(calc).filter(([k]) => k !== "sql" && k !== "kind").map(([k, v]) => (
                <p key={k} className="text-xs"><span className="text-muted">{k}</span> <span className="mono break-all">{typeof v === "string" ? v : JSON.stringify(v)}</span></p>
              ))}
              <p className="text-xs">formula of cell 0 <span className="mono">{env.values[0]?.formula ?? ""}</span></p>
              <p className="text-xs">values {env.values.length} · result_sha256 <span className="mono break-all">{env.result_sha256}</span></p>
              {env.values.length > 0 && (
                <section>
                  <h4 className="micro mb-1">Values at every precision</h4>
                  <p className="mb-1 text-xs text-muted">Shown is the release&apos;s reading-precision rendering (display_short); the published value is the contract&apos;s display; exact is the decimal it was rounded from.</p>
                  <table className="w-full text-xs" data-testid="precision-table">
                    <thead>
                      <tr className="text-left text-muted"><th className="py-1 pr-2 font-semibold">Cell</th><th className="py-1 pr-2 text-right font-semibold">Shown</th><th className="py-1 pr-2 text-right font-semibold">Published value (contract precision)</th><th className="py-1 font-semibold">Exact</th></tr>
                    </thead>
                    <tbody>
                      {env.values.slice(0, 50).map((v, i) => (
                        <tr key={i} className="border-t border-line align-top">
                          <td className="py-1 pr-2 text-muted">{cellLabel(v, `cell ${i}`)}</td>
                          <td className="num py-1 pr-2 text-right">{shown(v)}</td>
                          <td className="num py-1 pr-2 text-right" data-testid="published-value">{v.display}</td>
                          <td className="mono break-all py-1" data-testid="exact-value">{v.exact}{v.exact_high && v.exact_high !== v.exact ? ` .. ${v.exact_high}` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {env.values.length > 50 && <p className="mt-1 text-xs text-muted">first 50 of {env.values.length} cells; the CSV carries every one</p>}
                </section>
              )}
            </div>
          )}
          {tab === "request" && (
            <div className="space-y-3">
              <p className="text-xs text-muted">The canonical request this result answers, as the envelope carries it.</p>
              <pre className="mono whitespace-pre-wrap break-all rounded bg-surface p-2 text-xs" data-testid="request-json">{prettyRequest(env.request)}</pre>
              <p className="text-xs text-muted">
                The same call against the API, returning the same envelope and Result ID
                {env.context.defaults_applied.length ? <>: the fields the contract filled by default ({env.context.defaults_applied.join(", ")}) are left out so that it fills them again</> : null}.
              </p>
              <pre className="mono whitespace-pre-wrap break-all rounded bg-surface p-2 text-xs" data-testid="request-curl">{curlLine(absoluteApiBase(), call)}</pre>
            </div>
          )}
          {tab === "download" && (
            <div className="space-y-2 text-sm">
              <p><a className="text-accent underline" href={api.downloadCsvUrl(env.receipt)}>canonical CSV</a> · <a className="text-accent underline" href={api.downloadReceiptUrl(env.receipt)}>RECEIPT.json</a></p>
              <p className="text-xs text-muted">Both are served by replaying this result from its Result ID; the download restates every provenance digest and the licence note.</p>
            </div>
          )}
          {tab === "cite" && (
            <div className="space-y-2">
              <p className="mono text-xs break-words">{env.citation}</p>
              <p className="text-xs text-muted">{[env.context.release, env.context.configuration_id ? configLabel(labels ?? NO_LABELS, env.context.configuration_id) : "", env.context.gwp_basis ? gwpLabel(labels ?? NO_LABELS, env.context.gwp_basis) : "", lulucfShort(labels ?? NO_LABELS) || (env.context.lulucf.status ? `land use ${env.context.lulucf.status}` : "")].filter(Boolean).join(" · ")}</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <div className="min-w-0">
            <div className="micro">Result ID</div>
            <div className="mono break-all text-xs text-fg" data-testid="result-id">{env.receipt}</div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <button type="button" onClick={copy} aria-label="Copy the Result ID" className="flex items-center gap-1 text-xs text-muted hover:text-fg">
              <Copy size={12} /> {copied ? "Copied" : "Copy"}
            </button>
            <Link href={receiptHref(env.receipt)} className="text-xs font-semibold text-accent hover:underline" data-testid="reproduce-link">Reproduce this result →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
