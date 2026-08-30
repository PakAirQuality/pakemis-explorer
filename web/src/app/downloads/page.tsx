"use client";
/**
 * Downloads (today's /data page, moved 2026-08-30; /data redirects here, carrying ?receipt=):
 * replay a receipt, download the sector x gas table for a period, the release identity and
 * digests (the one place the version is printed), the routes (from openapi.json), and the
 * evidence / method / completeness browsers. Every table is a Frame over an envelope.
 */
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { api, API_BASE } from "@/lib/api";
import { useContractOptions } from "@/lib/contract";
import { releaseDefaults, releaseDims, releaseLabels, useRelease } from "@/lib/release";
import { periodShort } from "@/lib/labels";
import { stateFromEnvelopeRequest } from "@/lib/requests";
import { hrefForState, resolveState } from "@/lib/urlState";
import { TopNav } from "@/components/shell/TopNav";
import { Frame } from "@/components/ui/Frame";
import { RefusalCard } from "@/components/ui/RefusalCard";
import { EvidenceBrowser } from "@/components/panels/EvidencePanel";

export default function DownloadsPage() {
  return (
    <Suspense fallback={null}>
      <Downloads />
    </Suspense>
  );
}

function Downloads() {
  const release = useRelease();
  const contract = useContractOptions();
  const [receiptParam, setReceiptParam] = useQueryState("receipt", parseAsString);
  const [draft, setDraft] = useState("");
  const dims = useMemo(() => releaseDims(release.data), [release.data]);
  const labels = useMemo(() => releaseLabels(release.data), [release.data]);
  const d = releaseDefaults(release.data);
  const [period, setPeriod] = useState<string>("");
  const periodId = period || d?.period_id || "";
  const table = useQuery({
    queryKey: ["dl-sector-gas", periodId],
    queryFn: () => api.queryEmissions({ periods: [periodId], group_by: ["sector_id", "gas"], order_by: "value desc" }),
    enabled: !!periodId,
  });
  const replay = useQuery({ queryKey: ["replay", receiptParam], queryFn: () => api.receipt(receiptParam!), enabled: !!receiptParam && receiptParam.length === 32 });
  const mapHref = useMemo(() => {
    if (!replay.data || !d) return null;
    const patch = stateFromEnvelopeRequest(replay.data.request);
    if (!Object.keys(patch).length) return null;
    const defaults = { period_id: d.period_id, configuration_id: d.configuration_id, gwp_basis: d.gwp_basis, spatial_view: d.spatial_view, grid_gas: contract.data?.gridGas ?? "" };
    return hrefForState({ ...resolveState({}, defaults), ...patch }, defaults, "/map");
  }, [replay.data, d, contract.data]);
  const rel = release.data;
  return (
    <div className="min-h-dvh bg-surface">
      <TopNav />
      <div className="mx-auto max-w-5xl px-5 py-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Downloads</h1>
            <p className="text-xs text-muted">Replay a receipt, download a table, read the release identity and its digests, and the API&apos;s routes.</p>
          </div>
          <p className="max-w-md text-xs text-muted">A download is addressed by its receipt: <code>GET {API_BASE}/download/&lt;receipt&gt;.csv</code> replays the stored request and serves the canonical CSV; <code>.receipt.json</code> restates the request, the context, every provenance digest and the licence note.</p>
        </header>

        <section className="card mb-5 p-4">
          <h2 className="text-md font-semibold">Replay a receipt</h2>
          <p className="mt-1 text-xs text-muted">A result&apos;s receipt is its Result ID, shown under &ldquo;Result details&rdquo; wherever a result is printed; replaying it returns the same envelope.</p>
          <form
            className="mt-2 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setReceiptParam(draft.trim() || null);
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={receiptParam ?? "Result ID: 32 hex characters"} className="mono w-96 max-w-full rounded border border-line px-2 py-1 text-xs" aria-label="Result ID" />
            <button type="submit" className="pill bg-fg px-3 py-1 text-xs text-surface">Replay</button>
            {receiptParam && <span className="mono text-xs text-muted">?receipt={receiptParam}</span>}
          </form>
          {replay.data && (
            <div className="mt-3">
              <Frame title={`Replayed ${replay.data.request_type}`} scope={<span className="mono">{replay.data.request}</span>} env={replay.data} labels={labels} dims={dims} maxRows={50} actions={mapHref ? <Link href={mapHref} className="text-micro normal-case tracking-normal text-accent">Show on map</Link> : null} />
            </div>
          )}
          {replay.error && <div className="mt-3"><RefusalCard error={replay.error} what="the receipt" /></div>}
          {receiptParam && receiptParam.length !== 32 && <p className="mt-2 text-xs text-warn">A Result ID is 32 hex characters.</p>}
        </section>

        <section className="mb-5">
          <div className="mb-2 flex items-center gap-3">
            <h2 className="text-md font-semibold">Sector × gas</h2>
            <select value={periodId} onChange={(e) => setPeriod(e.target.value)} className="rounded border border-line bg-surface-2 px-2 py-1 text-xs" aria-label="period">
              {dims.fiscalPeriods.map((p) => (
                <option key={p} value={p}>{periodShort(labels, p)}</option>
              ))}
            </select>
          </div>
          <Frame title={`Sector × gas, ${periodShort(labels, periodId)}`} scope="Download the canonical CSV or RECEIPT.json from the receipt menu" env={table.data} error={table.error} isLoading={table.isLoading} labels={labels} dims={dims} />
        </section>

        {rel && (
          <section className="card mb-5 p-4">
            <h2 className="text-md font-semibold">Release identity</h2>
            <table className="mt-2 w-full text-xs">
              <tbody>
                <tr className="border-t border-line"><td className="py-1 pr-3 text-muted">release</td><td className="mono py-1">{rel.release_id}</td></tr>
                <tr className="border-t border-line"><td className="py-1 pr-3 text-muted">commit</td><td className="mono py-1">{rel.commit}</td></tr>
                <tr className="border-t border-line"><td className="py-1 pr-3 text-muted">semantic_release.json</td><td className="mono break-all py-1">{rel.digests.semantic_release_json}</td></tr>
                <tr className="border-t border-line"><td className="py-1 pr-3 text-muted">release_manifest.json</td><td className="mono break-all py-1">{rel.digests.release_manifest_json}</td></tr>
                {Object.entries(rel.digests.tables).map(([t, h]) => (
                  <tr key={t} className="border-t border-line"><td className="py-1 pr-3 text-muted">{t}</td><td className="mono break-all py-1">{h}</td></tr>
                ))}
                {Object.entries(rel.digests.products).map(([t, h]) => (
                  <tr key={t} className="border-t border-line"><td className="py-1 pr-3 text-muted">{t}</td><td className="mono break-all py-1">{h}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">
              {Object.entries(rel.licences).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(" · ")}
            </p>
          </section>
        )}

        <section className="card mb-5 p-4">
          <h2 className="text-md font-semibold">API</h2>
          <p className="mt-1 text-xs">
            <a className="text-accent underline" href={api.docsUrl()}>{api.docsUrl()}</a> · <a className="text-accent underline" href={api.openapiUrl()}>openapi.json</a> · <a className="text-accent underline" href={`${API_BASE}/release`}>/release</a>
          </p>
          <ul className="mono mt-2 grid grid-cols-1 gap-0.5 text-xs md:grid-cols-2">
            {(contract.data?.routes ?? []).map((r) => <li key={r}>{r}</li>)}
          </ul>
          <p className="mt-2 text-xs text-muted">Typed refusals are HTTP 422 with <code>error_class</code> and <code>limitation_id</code>. {rel ? Object.entries(rel.placeholders).map(([k, v]) => `${k}: ${v}`).join("; ") : ""}</p>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-md font-semibold">Evidence, methods, completeness</h2>
          {rel && <EvidenceBrowser labels={labels} dims={dims} sectors={dims.sectors} wide />}
        </section>
        <footer className="pb-6 text-xs text-muted">Every number on this page is a <code>display</code> string from an API envelope carrying a receipt; the browser computes nothing. Data CC-BY-4.0, code MIT, OSM-derived tables ODbL.</footer>
      </div>
    </div>
  );
}
