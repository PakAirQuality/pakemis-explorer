"use client";
/**
 * Downloads & API (plan §/downloads): the release widget (the reporting window from the labels,
 * the DOI slot's note from /release.citation, Release notes -> /methods#release, Verify
 * checksums -> the digests the release declares and the products' own), the use-case chips
 * highlighting one product family with its footnote, the four product cards from GET /products
 * (titles and descriptions as the API sends them, the mockups' words while it loads; each table
 * downloadable per format with its sha256 as the link's ETag hint, View schema listing columns,
 * primary key, rows, digest and closure), Cite the release (APA and BibTeX from
 * /release.citation with copy buttons), Query through the API (a curl line for the current
 * view's national total, the docs, the manifest) and the receipt replay (?receipt=). The version
 * appears inside the citation strings only.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { BookOpen, Copy, Download, ExternalLink, FileJson, ShieldCheck } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { absoluteApiBase, api } from "@/lib/api";
import { periodRange, periodShort } from "@/lib/labels";
import { bytesWords, familyProducts, productUrl, useProducts, type Product, type ProductFamily } from "@/lib/products";
import { releaseCitation, releaseDoi } from "@/lib/release";
import { useReferencePeriod } from "@/lib/queries";
import { curlLine, scopeBody, stateFromEnvelopeRequest } from "@/lib/requests";
import { hrefForState } from "@/lib/urlState";
import { TopNav } from "@/components/shell/TopNav";
import { CurrentView } from "@/components/shell/CurrentView";
import { ACTION_CLASS, PageHeader } from "@/components/shell/PageHeader";
import { Widget, ICON_BUTTON, WIDGET_TITLE } from "@/components/ui/Widget";
import { Frame } from "@/components/ui/Frame";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { DOWNLOADS, FAMILIES, type FamilyCopy } from "./copy";

const TEXT_BUTTON = "inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline";
const CHIP = "pill border px-3 py-1 text-xs font-semibold transition-colors";

/** "CSV · Parquet · NetCDF": the formats a family offers, as the API lists them. */
export function formatWords(formats: string[]): string {
  const name: Record<string, string> = { csv: "CSV", parquet: "Parquet", nc: "NetCDF", json: "JSON" };
  return formats.map((f) => name[f] ?? f.toUpperCase()).join(" · ");
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
  const [chip, setChip] = useState<string | null>(null);
  const [checksums, setChecksums] = useState(false);
  const [copied, setCopied] = useState<"apa" | "bibtex" | null>(null);
  const [receiptParam, setReceiptParam] = useQueryState("receipt", parseAsString);
  const [draft, setDraft] = useState("");
  const replay = useQuery({ queryKey: ["replay", receiptParam], queryFn: () => api.receipt(receiptParam!), enabled: !!receiptParam && receiptParam.length === 32, retry: false });
  const mapHref = useMemo(() => {
    if (!replay.data) return null;
    const patch = stateFromEnvelopeRequest(replay.data.request);
    return Object.keys(patch).length ? hrefForState({ ...state, ...patch }, defaults, "/map") : null;
  }, [replay.data, state, defaults]);
  const months = Object.values(dims.monthsByPeriod).reduce((n, m) => n + m.length, 0);
  const range = periodRange(dims, labels);
  const tags: Record<string, string> = {
    annual: `${range} · National`,
    monthly: `${months ? `${months} months` : "Every month"} · timing evidence graded`,
    spatial: `${reference ? periodShort(labels, reference) : range} · Monthly grid`,
    uncertainty: "Common draw IDs · Reference and alternatives",
  };
  const curl = curlLine(absoluteApiBase(), { method: "POST", path: "/query/emissions", body: JSON.stringify(scopeBody(state)) });
  const copy = async (kind: "apa" | "bibtex") => {
    if (!citation) return;
    if (await copyText(kind === "apa" ? citation.apa : citation.bibtex)) {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1200);
    }
  };
  const footnote = FAMILIES.find((f) => f.id === chip)?.footnote ?? "";
  const rel = release;
  const digests: [string, string][] = [
    ["semantic_release.json", rel.digests.semantic_release_json],
    ["release_manifest.json", rel.digests.release_manifest_json],
    ...Object.entries(rel.digests.tables).map(([t, h]) => [`${t}.csv`, h] as [string, string]),
    ...Object.entries(rel.digests.products).map(([p, h]) => [p.replace(/^outputs\//, ""), h] as [string, string]),
    ...((products.data?.products ?? []).flatMap((p) => p.formats.filter((f) => f.identity === "computed").map((f) => [f.filename, f.sha256] as [string, string]))),
  ];

  return (
    <div className="min-h-dvh bg-surface" data-testid="downloads-page">
      <TopNav compact />
      <CurrentView compact />
      <main className="mx-auto max-w-6xl px-4 pb-12 pt-8 md:px-6">
        <PageHeader
          title={DOWNLOADS.title}
          dek={DOWNLOADS.dek}
          action={
            <a href={api.docsUrl()} className={ACTION_CLASS} data-testid="api-docs">
              <ExternalLink size={15} /> {DOWNLOADS.docs}
            </a>
          }
        />

        <Widget
          className="mt-6"
          title={DOWNLOADS.release.title}
          testId="release-card"
          tools={
            <>
              <Link href="/methods#release" className={ICON_BUTTON} aria-label={DOWNLOADS.release.notes} title={DOWNLOADS.release.notes} data-testid="release-notes">
                <BookOpen size={14} />
              </Link>
              <button type="button" onClick={() => setChecksums((c) => !c)} aria-expanded={checksums} className={ICON_BUTTON} aria-label={DOWNLOADS.release.verify} title={DOWNLOADS.release.verify} data-testid="verify-checksums">
                <ShieldCheck size={14} />
              </button>
            </>
          }
          sentence={
            <>
              <b>{range}</b> · {DOWNLOADS.release.scope} · {doi.data ? <>data DOI <span className="mono">{doi.data}</span></> : citation?.doi_note?.replace(/^DOI/, "data DOI") ?? DOWNLOADS.release.doiMissing}
            </>
          }
          caption={
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/methods#release" className={TEXT_BUTTON}><BookOpen size={12} /> {DOWNLOADS.release.notes}</Link>
              <button type="button" className={TEXT_BUTTON} onClick={() => setChecksums((c) => !c)}><ShieldCheck size={12} /> {DOWNLOADS.release.verify}</button>
            </span>
          }
        >
          {checksums && (
            <div className="overflow-x-auto" data-testid="digests">
              <p className="mb-2 text-xs text-muted">The sha256 of every file the release serves, as the contract, the manifest and the verification declare them; a download answers with the same digest as its ETag.{products.data?.note ? ` ${products.data.note}` : ""}</p>
              <table className="w-full text-xs">
                <tbody>
                  {digests.map(([name, hash]) => (
                    <tr key={name} className="border-t border-line">
                      <td className="py-1 pr-3 text-muted">{name}</td>
                      <td className="mono break-all py-1" data-testid="digest">{hash}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Widget>

        <section className="mt-6" data-testid="use-cases">
          <h2 className={WIDGET_TITLE}>{DOWNLOADS.which}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {FAMILIES.map((f) => {
              const on = chip === f.id;
              return (
                <button key={f.id} type="button" onClick={() => setChip(on ? null : f.id)} aria-pressed={on} className={`${CHIP} ${on ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:text-fg"}`} data-testid="use-case-chip" data-family={f.id}>
                  {f.useCase}
                </button>
              );
            })}
          </div>
          {footnote && <p className="mt-2 text-xs text-accent" data-testid="use-case-footnote">{footnote}</p>}
        </section>

        <section className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="product-cards">
          {FAMILIES.map((copy) => (
            <ProductCard key={copy.id} copy={copy} family={products.data?.families.find((f) => f.id === copy.id)} products={products.data ? familyProducts(products.data, products.data.families.find((f) => f.id === copy.id) ?? { id: copy.id, title: copy.title, description: copy.description, tables: [], formats: [] }) : []} tag={tags[copy.id] ?? ""} highlighted={chip === copy.id} loading={products.isLoading} error={products.error} />
          ))}
        </section>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Widget title={DOWNLOADS.cite.title} testId="cite-card" share={false}>
            {citation ? (
              <div className="space-y-3">
                <p className="text-sm text-fg" data-testid="cite-apa">{citation.apa}</p>
                {citation.doi_note && <p className="text-xs text-muted" data-testid="cite-doi-note">{citation.doi_note}.</p>}
                <pre className="mono max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-3 p-2 text-xs text-muted" data-testid="cite-bibtex">{citation.bibtex}</pre>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={TEXT_BUTTON} onClick={() => copy("apa")} data-testid="copy-apa"><Copy size={12} /> {copied === "apa" ? DOWNLOADS.cite.copied : DOWNLOADS.cite.copy}</button>
                  <button type="button" className={TEXT_BUTTON} onClick={() => copy("bibtex")} data-testid="copy-bibtex"><Copy size={12} /> {copied === "bibtex" ? DOWNLOADS.cite.copied : DOWNLOADS.cite.bibtex}</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted" data-testid="cite-missing">This API serves no citation block; cite an answer as its envelope&apos;s citation field, which names the receipt.</p>
            )}
          </Widget>
          <Widget title={DOWNLOADS.api.title} testId="api-card" share={false} sentence={DOWNLOADS.api.lead}>
            <pre className="mono overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-surface-3 p-2 text-xs text-muted" data-testid="curl-line">{curl}</pre>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <a href={api.docsUrl()} className={TEXT_BUTTON} data-testid="open-docs"><ExternalLink size={12} /> {DOWNLOADS.api.explorer}</a>
              <a href={productUrl("release_manifest.json")} className={TEXT_BUTTON} data-testid="download-metadata"><FileJson size={12} /> {DOWNLOADS.api.metadata}</a>
              <a href={api.openapiUrl()} className={TEXT_BUTTON}><FileJson size={12} /> openapi.json</a>
            </div>
          </Widget>
        </div>

        <Widget className="mt-4" title={DOWNLOADS.replay.title} testId="replay-card" share={false} sentence={DOWNLOADS.replay.lead}>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setReceiptParam(draft.trim() || null);
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={receiptParam ?? "Result ID: 32 hex characters"} className="mono w-96 max-w-full rounded-md border border-line bg-surface-3 px-2 py-1.5 text-xs" aria-label="Result ID" data-testid="receipt-input" />
            <button type="submit" className="pill bg-fg px-3 py-1.5 text-xs font-semibold text-surface">Replay</button>
          </form>
          {replay.data && (
            <div className="mt-3">
              <Frame title={`Replayed ${replay.data.request_type.replace(/_/g, " ")}`} env={replay.data} labels={labels} dims={dims} maxRows={50} actions={mapHref ? <Link href={mapHref} className="text-micro normal-case tracking-normal text-accent">Show on map</Link> : null} />
            </div>
          )}
          {replay.error && <div className="mt-3"><RefusalCard error={replay.error} what="the receipt" /></div>}
          {receiptParam && receiptParam.length !== 32 && <p className="mt-2 text-xs text-warn">A Result ID is 32 hex characters.</p>}
        </Widget>
      </main>
    </div>
  );
}

function ProductCard({ copy, family, products, tag, highlighted, loading, error }: { copy: FamilyCopy; family?: ProductFamily; products: Product[]; tag: string; highlighted: boolean; loading: boolean; error: unknown }) {
  const [schema, setSchema] = useState(false);
  const [menu, setMenu] = useState(false);
  const formats = family ? formatWords(family.formats) : copy.formats;
  return (
    <section className={`card flex flex-col p-4 ${highlighted ? "ring-1 ring-accent" : ""}`} data-testid="product-card" data-family={copy.id} data-highlighted={highlighted ? "true" : "false"}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className={WIDGET_TITLE}>{family?.title ?? copy.title}</h3>
          <div className="mt-0.5 text-xs text-muted" data-testid="product-formats">{formats}</div>
        </div>
        <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} disabled={!products.length} className="pill inline-flex items-center gap-1.5 bg-accent-fill px-3 py-1.5 text-xs font-semibold text-on-accent hover:brightness-110 disabled:opacity-50" data-testid="product-download">
          <Download size={13} /> {DOWNLOADS.download}
        </button>
      </header>
      <p className="mt-2 text-sm text-fg">{family?.description ?? copy.description}</p>
      {tag && <p className="mt-1 text-xs text-muted" data-testid="product-tag">{tag}</p>}
      {menu && products.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs" data-testid="product-files">
          {products.map((p) => (
            <li key={p.name} className="flex flex-wrap items-baseline gap-x-2">
              <span className="mono text-fg">{p.name}</span>
              {p.formats.map((f) => (
                <a key={f.filename} href={f.url} className="text-accent hover:underline" data-testid="product-file" data-sha256={f.sha256} title={`ETag / sha256 ${f.sha256} · ${bytesWords(f.bytes)}`}>
                  {formatWords([f.ext])}
                </a>
              ))}
            </li>
          ))}
        </ul>
      )}
      {schema && products.length > 0 && (
        <div className="mt-3 space-y-3 border-t border-line pt-3 text-xs" data-testid="product-schema">
          {products.map((p) => (
            <div key={p.name}>
              <div className="mono font-semibold text-fg">{p.name}</div>
              {p.columns?.length ? <p className="mt-0.5 text-muted"><span className="text-fg">Columns:</span> <span className="mono">{p.columns.join(", ")}</span></p> : null}
              {p.primary_key?.length ? <p className="mt-0.5 text-muted"><span className="text-fg">Primary key:</span> <span className="mono">{p.primary_key.join(", ")}</span></p> : null}
              {typeof p.rows === "number" && <p className="mt-0.5 text-muted"><span className="text-fg">Rows:</span> {p.rows.toLocaleString("en-GB")}</p>}
              {p.closure && <p className="mt-0.5 text-muted"><span className="text-fg">Closure:</span> {p.closure}</p>}
              {p.aggregation_rule && <p className="mt-0.5 text-muted"><span className="text-fg">Aggregation:</span> {p.aggregation_rule}</p>}
              {p.formats.map((f) => (
                <p key={f.filename} className="mt-0.5 text-muted"><span className="text-fg">{f.filename}</span> <span className="mono break-all">sha256 {f.sha256}</span> · {bytesWords(f.bytes)}</p>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="flex-1" />
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2">
        {products.length > 0 ? (
          <button type="button" className={TEXT_BUTTON} onClick={() => setSchema((s) => !s)} aria-expanded={schema} data-testid="view-schema">{schema ? DOWNLOADS.hideSchema : DOWNLOADS.schema}</button>
        ) : error ? (
          <RefusalCard error={error} compact />
        ) : loading ? (
          <Loading what="the product catalogue" />
        ) : null}
        {family && <span className="text-micro normal-case tracking-normal text-muted">{family.tables.length === 1 ? "one table" : `${family.tables.length} tables`}</span>}
      </div>
    </section>
  );
}
