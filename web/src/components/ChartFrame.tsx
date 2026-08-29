"use client";
/**
 * Every chart and table sits in a ChartFrame. Its five affordances - view data, inspect
 * evidence, show calculation, download, cite - are fed ONLY by the Envelope: values.display,
 * calculation.sql, provenance digests, the receipt, the unallocated mass, limitations_hit.
 */
import { useState } from "react";
import { api } from "@/lib/api";
import type { Envelope } from "@/lib/envelope";
import { EnvelopeTable } from "./EnvelopeTable";

type Tab = "chart" | "data" | "evidence" | "calculation" | "download" | "cite";

export function ChartFrame({ title, env, children, tableExtra }: { title: string; env: Envelope; children?: React.ReactNode; tableExtra?: string[] }) {
  const [tab, setTab] = useState<Tab>(children ? "chart" : "data");
  const tabs: [Tab, string][] = [
    ...(children ? ([["chart", "Chart"]] as [Tab, string][]) : []),
    ["data", "View data"],
    ["evidence", "Inspect evidence"],
    ["calculation", "Show calculation"],
    ["download", "Download"],
    ["cite", "Cite"],
  ];
  const prov = env.provenance as { tables?: { table?: string; path: string; sha256: string | null }[] };
  const unalloc = env.unallocated as { by_province?: { province: string; exact: string; n_rows: number }[]; by_module_gas?: { module: string; gas: string; exact: string }[]; note?: string };
  return (
    <section className="chart-frame">
      <header>
        <h3>{title}</h3>
        <span className="receipt mono" title="query receipt: replayable at /v1/receipt/{receipt}">
          receipt {env.receipt}
        </span>
      </header>
      <nav className="tabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === "chart" && <div className="chart-body">{children}</div>}
      {tab === "data" && <EnvelopeTable env={env} extra={tableExtra} />}
      {tab === "evidence" && (
        <div className="panel">
          <h4>Provenance</h4>
          <ul>
            {(prov.tables ?? []).map((t) => (
              <li key={t.path} className="mono small">
                {t.table ? `${t.table}: ` : ""}
                {t.path} sha256 {t.sha256 ?? "(not listed)"}
              </li>
            ))}
          </ul>
          {unalloc.by_province && (
            <>
              <h4>Unallocated mass (retained at ADM1)</h4>
              <table>
                <tbody>
                  {unalloc.by_province.map((u) => (
                    <tr key={u.province}>
                      <td>{u.province}</td>
                      <td className="mono">{u.exact} Mt CO2e AR5 (exact)</td>
                      <td>{u.n_rows} rows</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="small">{unalloc.note}</p>
            </>
          )}
          <h4>Limitations hit</h4>
          <ul>
            {env.limitations_hit.map((l, i) => (
              <li key={i}>
                <strong>{String(l.id)}</strong>
                {l.message ? `: ${String(l.message)}` : ""}
              </li>
            ))}
          </ul>
          {env.context.defaults_applied.length > 0 && <p className="small">Defaults applied by the contract: {env.context.defaults_applied.join(", ")}</p>}
          {Object.keys(env.uncertainty).length > 0 && (
            <details>
              <summary>Uncertainty block</summary>
              <pre className="small">{JSON.stringify(env.uncertainty, null, 1)}</pre>
            </details>
          )}
        </div>
      )}
      {tab === "calculation" && (
        <div className="panel">
          <pre className="small">{JSON.stringify(env.calculation, null, 1)}</pre>
          <p className="small">
            Values: {env.values.length}; formula of cell 0: <span className="mono">{env.values[0]?.formula ?? ""}</span>
          </p>
          <p className="small">result_sha256 {env.result_sha256}</p>
        </div>
      )}
      {tab === "download" && (
        <div className="panel">
          <p>
            <a href={api.downloadCsvUrl(env.receipt)}>canonical CSV</a> · <a href={api.downloadReceiptUrl(env.receipt)}>RECEIPT.json</a>
          </p>
          <p className="small">Both are served by replaying receipt {env.receipt}; the download restates every provenance digest and the licence note.</p>
        </div>
      )}
      {tab === "cite" && (
        <div className="panel">
          <p className="mono">{env.citation}</p>
          <p className="small">
            Context: {env.context.release} · {env.context.basis} · {env.context.configuration_id} · {env.context.gwp_basis} · LULUCF {env.context.lulucf.status}
          </p>
        </div>
      )}
    </section>
  );
}
