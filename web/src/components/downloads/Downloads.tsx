"use client";
/**
 * Downloads & API, purpose-first (plan §5): "What do you want to study?" leads with seven
 * purposes (National and sector totals · Monthly emissions · Province and district allocations
 * · Gridded emissions · Uncertainty and configurations · Evidence and provenance · Complete
 * release), each mapped to a `/products` family. Only after a choice (`?purpose=`): the
 * family's title and description as the API sends them, its products with a CSV · Parquet ·
 * NetCDF · JSON button wherever that format exists (the file's sha256 as the link's ETag
 * hint), the schema panel (columns, primary key, rows, closure, aggregation rule), the
 * checksums, the complete family's zip archive, and the citation and identity table (APA,
 * BibTeX, release, version, commit, repository, DOI slot) — the ONLY place the version string
 * appears. Query through the API and Reproduce a result (?receipt=) stay below.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { Archive, Copy, Download, ExternalLink, FileJson, ShieldCheck, Table2 } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { absoluteApiBase, api } from "@/lib/api";
import { periodRange, periodShort } from "@/lib/labels";
import { bytesWords, familyProducts, narrowProducts, productUrl, useProducts, type Product, type ProductFamily } from "@/lib/products";
import { releaseCitation, releaseDoi, type Citation } from "@/lib/release";
import { useReferencePeriod } from "@/lib/queries";
import { curlLine, scopeBody, stateFromEnvelopeRequest } from "@/lib/requests";
import { hrefForState } from "@/lib/urlState";
import { NavHeader } from "@/components/shell/NavCapsule";
import { CurrentView } from "@/components/shell/CurrentView";
import { ACTION_CLASS, PageHeader } from "@/components/shell/PageHeader";
import { Widget, WIDGET_TITLE } from "@/components/ui/Widget";
import { Frame } from "@/components/ui/Frame";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { DOWNLOADS, PURPOSES, purposeById, type Purpose } from "./copy";

const TEXT_BUTTON = "inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline";
const FORMAT_BUTTON = "pill inline-flex items-center gap-1 border border-line-strong px-2.5 py-1 text-xs font-semibold text-fg hover:bg-surface-3";
const FORMAT_NAME: Record<string, string> = { csv: "CSV", parquet: "Parquet", nc: "NetCDF", json: "JSON", zip: "ZIP" };

/** "CSV · Parquet · NetCDF": the formats a family offers, as the API lists them. */
export function formatWords(formats: string[]): string {
  return formats.map((f) => FORMAT_NAME[f] ?? f.toUpperCase()).join(" · ");
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function Downloads() {
  const { state, release, labels, dims, defaults } = useExplorer();
  const products = useProducts();
  const citation = releaseCitation(release);
  const doi = releaseDoi(release);
  const reference = useReferencePeriod();
  const [purposeParam, setPurposeParam] = useQueryState("purpose", parseAsString);
  const [receiptParam, setReceiptParam] = useQueryState("receipt", parseAsString);
  const [draft, setDraft] = useState("");
  const replay = useQuery({ queryKey: ["replay", receiptParam], queryFn: () => api.receipt(receiptParam!), enabled: !!receiptParam && receiptParam.length === 32, retry: false });
  const mapHref = useMemo(() => {
    if (!replay.data) return null;
    const patch = stateFromEnvelopeRequest(replay.data.request);
    return Object.keys(patch).length ? hrefForState({ ...state, ...patch }, defaults, "/") : null;
  }, [replay.data, state, defaults]);
  const months = Object.values(dims.monthsByPeriod).reduce((n, m) => n + m.length, 0);
  const range = periodRange(dims, labels);
  const refShort = reference ? periodShort(labels, reference) : range;
  const captions: Record<string, string> = {
    totals: `${range} · National`,
    monthly: `${months ? `${months} months` : "Every month"} · timing evidence graded`,
    allocations: `${refShort} · Provinces and districts`,
    gridded: `${refShort} · Monthly grid`,
    uncertainty: "Common draw IDs · Reference and alternatives",
    evidence: "Evidence classes · Registries",
    complete: "Every file · One archive",
  };
  const purpose = purposeById(purposeParam);
  const curl = curlLine(absoluteApiBase(), { method: "POST", path: "/query/emissions", body: JSON.stringify(scopeBody(state)) });

  return (
    <div className="min-h-dvh bg-surface" data-testid="downloads-page">
      <NavHeader />
      <CurrentView compact />
      <main className="mx-auto max-w-[1500px] px-4 pb-12 pt-8 md:px-6">
        <PageHeader
          title={DOWNLOADS.title}
          dek={DOWNLOADS.dek}
          action={
            <a href={api.docsUrl()} className={ACTION_CLASS} data-testid="api-docs">
              <ExternalLink size={15} /> {DOWNLOADS.docs}
            </a>
          }
        />

        <section className="mt-8" data-testid="purposes">
          <h2 className="text-xl font-semibold text-fg" data-testid="purpose-question">{DOWNLOADS.question}</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PURPOSES.map((p) => {
              const on = purpose?.id === p.id;
              return (
                <button key={p.id} type="button" onClick={() => setPurposeParam(on ? null : p.id)} aria-pressed={on} className={`card flex flex-col p-4 text-left transition-colors ${on ? "ring-1 ring-accent" : "hover:bg-surface-3"}`} data-testid="purpose-card" data-purpose={p.id}>
                  <span className="text-sm font-semibold text-fg">{p.title}</span>
                  <span className="mt-1 text-xs text-muted">{p.description}</span>
                  {captions[p.id] && <span className="mt-2 text-micro normal-case tracking-normal text-muted" data-testid="purpose-caption">{captions[p.id]}</span>}
                </button>
              );
            })}
          </div>
          {!purpose && <p className="mt-3 text-sm text-muted" data-testid="purpose-none">{DOWNLOADS.choose}</p>}
        </section>

        {purpose && (
          <PurposePanel purpose={purpose} family={products.data?.families.find((f) => f.id === purpose.family)} products={products.data ? narrowProducts(familyProducts(products.data, products.data.families.find((f) => f.id === purpose.family) ?? { id: purpose.family, title: purpose.fallback.title, description: purpose.fallback.description, tables: [], formats: [] }), purpose.only) : []} note={products.data?.note} loading={products.isLoading} error={products.error} citation={citation} version={release.version} doi={doi.data} />
        )}

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Widget title={DOWNLOADS.api.title} testId="api-card" share={false} sentence={DOWNLOADS.api.lead}>
            <pre className="mono overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-surface-3 p-2 text-xs text-muted" data-testid="curl-line">{curl}</pre>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <a href={api.docsUrl()} className={TEXT_BUTTON} data-testid="open-docs"><ExternalLink size={12} /> {DOWNLOADS.api.explorer}</a>
              <a href={productUrl("release_manifest.json")} className={TEXT_BUTTON} data-testid="download-metadata"><FileJson size={12} /> {DOWNLOADS.api.metadata}</a>
              <a href={api.openapiUrl()} className={TEXT_BUTTON}><FileJson size={12} /> openapi.json</a>
            </div>
          </Widget>
          <Widget title={DOWNLOADS.replay.title} testId="replay-card" share={false} sentence={DOWNLOADS.replay.lead}>
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setReceiptParam(draft.trim() || null);
              }}
            >
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={receiptParam ?? "Result ID: 32 hex characters"} className="mono w-96 max-w-full rounded-md border border-line bg-surface-3 px-2 py-1.5 text-xs" aria-label="Result ID" data-testid="receipt-input" />
              <button type="submit" className="pill bg-fg px-3 py-1.5 text-xs font-semibold text-card">Replay</button>
            </form>
            {replay.error && <div className="mt-3"><RefusalCard error={replay.error} what="the receipt" /></div>}
            {receiptParam && receiptParam.length !== 32 && <p className="mt-2 text-xs text-warn">A Result ID is 32 hex characters.</p>}
          </Widget>
        </div>
        {replay.data && (
          <div className="mt-4" data-testid="replay-frame">
            <Frame title={`Replayed ${replay.data.request_type.replace(/_/g, " ")}`} env={replay.data} labels={labels} dims={dims} maxRows={50} actions={mapHref ? <Link href={mapHref} className="text-micro normal-case tracking-normal text-accent">Show on map</Link> : null} />
          </div>
        )}
      </main>
    </div>
  );
}

function PurposePanel({ purpose, family, products, note, loading, error, citation, version, doi }: { purpose: Purpose; family?: ProductFamily; products: Product[]; note?: string; loading: boolean; error: unknown; citation: Citation | null; version: string; doi: string }) {
  const [schema, setSchema] = useState<string | null>(null);
  const [checksums, setChecksums] = useState(false);
  const [copied, setCopied] = useState<"apa" | "bibtex" | null>(null);
  const copy = async (kind: "apa" | "bibtex") => {
    if (!citation) return;
    if (await copyText(kind === "apa" ? citation.apa : citation.bibtex)) {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1200);
    }
  };
  const archive = purpose.family === "complete" ? family?.archive : null;
  const formats = family ? family.formats.filter((f) => f !== "zip" || !!archive) : [];
  const identity: [string, React.ReactNode][] = citation
    ? [
        ["Release", citation.cite_as ?? ""],
        ["Version", <span key="v" className="mono" data-testid="cite-version">{version}</span>],
        ["Commit", citation.commit ? <span key="c" className="mono break-all">{citation.commit}</span> : ""],
        ["Repository", citation.repository ? <a key="r" href={citation.repository} className="text-accent hover:underline">{citation.repository}</a> : ""],
        ["Reporting window", citation.period_span ?? ""],
        ["Data DOI", doi ? <span key="d" className="mono">{doi}</span> : citation.doi_note || ""],
      ]
    : [];
  return (
    <section className="card mt-6 p-5" data-testid="purpose-panel" data-purpose={purpose.id} data-family={purpose.family}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <div className="micro">{purpose.title}</div>
          <h3 className="mt-1 text-lg font-semibold text-fg" data-testid="family-title">{family?.title ?? purpose.fallback.title}</h3>
          <p className="mt-1 text-sm text-fg">{family?.description ?? purpose.fallback.description}</p>
          {formats.length > 0 && <p className="mt-1 text-xs text-muted" data-testid="family-formats">{formatWords(formats)}</p>}
        </div>
        {archive && (
          <a href={archive.url} className="pill inline-flex items-center gap-1.5 bg-accent-fill px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110" data-testid="archive-download" title={archive.note ?? ""}>
            <Archive size={14} /> {DOWNLOADS.archive}{typeof archive.members === "number" ? ` (${archive.members} files)` : ""}
          </a>
        )}
      </header>
      {archive?.note && <p className="mt-2 text-xs text-muted" data-testid="archive-note">{archive.note}</p>}

      <div className="mt-4">
        <h4 className={WIDGET_TITLE}>{DOWNLOADS.files}</h4>
        {products.length > 0 ? (
          <ul className="mt-2 divide-y divide-line" data-testid="product-list">
            {products.map((p) => {
              const open = schema === p.name;
              return (
                <li key={p.name} className="py-2" data-testid="product-row" data-product={p.name} data-kind={p.kind}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="mono text-sm text-fg">{p.name}</span>
                    <span className="rounded bg-surface-3 px-1.5 py-0.5 text-micro normal-case tracking-normal text-muted">{p.table_kind ?? p.kind}</span>
                    {typeof p.rows === "number" && <span className="text-xs text-muted">{p.rows.toLocaleString("en-GB")} rows</span>}
                    <span className="flex-1" />
                    {p.formats.map((f) => (
                      <a key={f.filename} href={f.url} className={FORMAT_BUTTON} data-testid="format-button" data-format={f.ext} data-sha256={f.sha256} title={`${f.filename} · ETag / sha256 ${f.sha256} · ${bytesWords(f.bytes)}`}>
                        <Download size={12} aria-hidden="true" /> {FORMAT_NAME[f.ext] ?? f.ext.toUpperCase()}
                      </a>
                    ))}
                    <button type="button" className={TEXT_BUTTON} onClick={() => setSchema(open ? null : p.name)} aria-expanded={open} data-testid="schema-toggle">
                      <Table2 size={12} aria-hidden="true" /> {open ? DOWNLOADS.hideSchema : DOWNLOADS.schema}
                    </button>
                  </div>
                  {open && (
                    <div className="mt-2 space-y-1 rounded-md bg-surface-3/60 p-3 text-xs" data-testid="schema-panel">
                      {p.columns?.length ? <p className="text-muted"><span className="text-fg">Columns:</span> <span className="mono">{p.columns.join(", ")}</span></p> : null}
                      {p.primary_key?.length ? <p className="text-muted"><span className="text-fg">Primary key:</span> <span className="mono">{p.primary_key.join(", ")}</span></p> : null}
                      {typeof p.rows === "number" && <p className="text-muted"><span className="text-fg">Rows:</span> {p.rows.toLocaleString("en-GB")}</p>}
                      {p.closure && <p className="text-muted"><span className="text-fg">Closure:</span> {p.closure}</p>}
                      {p.aggregation_rule && <p className="text-muted"><span className="text-fg">Aggregation:</span> {p.aggregation_rule}</p>}
                      {p.source_path && <p className="text-muted"><span className="text-fg">Registry source:</span> <span className="mono">{p.source_path}</span></p>}
                      {p.formats.map((f) => (
                        <p key={f.filename} className="text-muted"><span className="text-fg">{f.filename}</span> <span className="mono break-all">sha256 {f.sha256}</span> · {bytesWords(f.bytes)}{f.identity ? ` · identity: ${f.identity}` : ""}</p>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : error ? (
          <div className="mt-2"><RefusalCard error={error} compact /></div>
        ) : loading ? (
          <div className="mt-2"><Loading what="the product catalogue" /></div>
        ) : (
          <p className="mt-2 text-xs text-muted">The catalogue lists no file for this purpose.</p>
        )}
      </div>

      {products.length > 0 && (
        <div className="mt-4">
          <button type="button" className={TEXT_BUTTON} onClick={() => setChecksums((c) => !c)} aria-expanded={checksums} data-testid="checksums-toggle">
            <ShieldCheck size={12} aria-hidden="true" /> {checksums ? DOWNLOADS.hideChecksums : DOWNLOADS.checksums}
          </button>
          {checksums && (
            <div className="mt-2 overflow-x-auto" data-testid="checksums">
              <p className="mb-2 text-xs text-muted">The sha256 of every file of this purpose, as the contract, the manifest and the verification declare them; a download answers with the same digest as its ETag.{note ? ` ${note}` : ""}</p>
              <table className="w-full text-xs">
                <tbody>
                  {products.flatMap((p) => p.formats).map((f) => (
                    <tr key={f.filename} className="border-t border-line">
                      <td className="py-1 pr-3 text-muted">{f.filename}</td>
                      <td className="mono break-all py-1" data-testid="digest">{f.sha256}</td>
                      <td className="py-1 pl-3 text-muted">{f.identity ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 border-t border-line pt-4" data-testid="citation-table">
        <h4 className={WIDGET_TITLE}>{DOWNLOADS.cite.title}</h4>
        {citation ? (
          <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <dl className="grid grid-cols-[minmax(8rem,max-content)_1fr] gap-x-4 gap-y-1 text-xs" data-testid="identity-rows">
              {identity.filter(([, v]) => v !== "" && v !== null && v !== undefined).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-semibold text-muted">{k}</dt>
                  <dd className="min-w-0 break-words text-fg">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="space-y-2">
              <p className="text-sm text-fg" data-testid="cite-apa">{citation.apa}</p>
              <pre className="mono max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-3 p-2 text-xs text-muted" data-testid="cite-bibtex">{citation.bibtex}</pre>
              <div className="flex flex-wrap gap-3">
                <button type="button" className={TEXT_BUTTON} onClick={() => copy("apa")} data-testid="copy-apa"><Copy size={12} /> {copied === "apa" ? DOWNLOADS.cite.copied : DOWNLOADS.cite.copy}</button>
                <button type="button" className={TEXT_BUTTON} onClick={() => copy("bibtex")} data-testid="copy-bibtex"><Copy size={12} /> {copied === "bibtex" ? DOWNLOADS.cite.copied : DOWNLOADS.cite.bibtex}</button>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted" data-testid="cite-missing">This API serves no citation block; cite an answer as its envelope&apos;s citation field, which names the receipt.</p>
        )}
      </div>
    </section>
  );
}
