"use client";
/** Downloads & API: receipt-addressed CSV and RECEIPT.json, the release digests, the routes. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, API_BASE } from "@/lib/api";
import { ChartFrame } from "@/components/ChartFrame";
import { Status } from "@/components/Status";
import { useRelease } from "@/components/ContextBar";

export default function Downloads() {
  const release = useRelease();
  const [receipt, setReceipt] = useState("");
  const [lookup, setLookup] = useState("");
  const total = useQuery({ queryKey: ["dl-total"], queryFn: () => api.queryEmissions({ periods: ["FY2023-24"], group_by: ["sector_id", "gas"], order_by: "value desc" }) });
  const replay = useQuery({ queryKey: ["replay", lookup], queryFn: () => api.receipt(lookup), enabled: lookup.length === 32 });
  return (
    <>
      <h1>Downloads &amp; API</h1>
      <p className="small">
        A download is addressed by its receipt. <code>GET {API_BASE}/v1/download/&lt;receipt&gt;.csv</code> replays the stored request and serves the canonical CSV; <code>.receipt.json</code> restates the request, the context, every provenance digest and the licence note.
      </p>
      {total.data ? (
        <ChartFrame title="Sector x gas, FY2023-24, L, AR5 (download from the Download tab)" env={total.data} />
      ) : (
        <Status isLoading={total.isLoading} error={total.error} what="the sector x gas table" />
      )}
      <h2>Replay a receipt</h2>
      <div className="controls">
        <label>
          receipt (32 hex characters)
          <input value={receipt} onChange={(e) => setReceipt(e.target.value.trim())} className="mono" style={{ minWidth: 340 }} />
        </label>
        <button onClick={() => setLookup(receipt)}>replay</button>
      </div>
      {replay.data && <ChartFrame title={`Replayed ${replay.data.request_type}`} env={replay.data} />}
      <Status isLoading={replay.isLoading} error={replay.error} what="the receipt" />
      <h2>Release identity</h2>
      {release.data && (
        <table>
          <tbody>
            <tr>
              <td>release</td>
              <td className="mono">{release.data.release_id}</td>
            </tr>
            <tr>
              <td>commit</td>
              <td className="mono">{release.data.commit}</td>
            </tr>
            <tr>
              <td>semantic_release.json sha256</td>
              <td className="mono">{release.data.digests.semantic_release_json}</td>
            </tr>
            <tr>
              <td>release_manifest.json sha256</td>
              <td className="mono">{release.data.digests.release_manifest_json}</td>
            </tr>
            {Object.entries(release.data.digests.tables).map(([t, d]) => (
              <tr key={t}>
                <td className="small">{t}</td>
                <td className="mono small">{d}</td>
              </tr>
            ))}
            {Object.entries(release.data.digests.products).map(([t, d]) => (
              <tr key={t}>
                <td className="small">{t}</td>
                <td className="mono small">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2>API</h2>
      <p>
        OpenAPI: <a href={`${API_BASE}/docs`}>{API_BASE}/docs</a> · <a href={`${API_BASE}/openapi.json`}>openapi.json</a> · <a href={`${API_BASE}/v1/release`}>/v1/release</a>
      </p>
      <p className="small">Typed refusals are HTTP 422 with <code>error_class</code> and <code>limitation_id</code>. Placeholders in this release: {release.data ? Object.entries(release.data.placeholders).map(([k, v]) => `${k}: ${v}`).join("; ") : ""}</p>
    </>
  );
}
