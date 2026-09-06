"use client";
/**
 * Downloads, purpose-first, in the workspace's language (regenerated 2026-09-07 to the user's
 * mockup): a Files | API pill beside the nav capsule; the Files mode opens with a hero —
 * eyebrow, "Download the inventory", the two-line promise, the reporting window and licence as
 * chips, and the complete release's archive as the primary action — then "What do you want to
 * study?" with six purpose cards on the left and the YOUR DOWNLOAD rail on the right: the
 * chosen purpose's family as the API titles it, one row per file with a button per format that
 * exists (the sha256 as the link's ETag hint), the always-included note, a Download-N-files
 * action that clicks every file's first format, Preview columns and Copy citation, the
 * checksums, and the reference configuration in the release's own labels. The API mode holds
 * Query through the API, Reproduce a result (`?receipt=` forces this mode) and the citation /
 * identity table — the ONLY place the version string appears.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { Archive, BarChart3, CalendarDays, Check, Copy, Download, ExternalLink, FileJson, FileText, Info, Layers, LineChart, MapPin, ShieldCheck, Table2, Wind } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { absoluteApiBase, api } from "@/lib/api";
import { configLabel, gwpLabel, periodRange, periodShort } from "@/lib/labels";
import { bytesWords, familyProducts, narrowProducts, productUrl, useProducts, type Product, type ProductFamily } from "@/lib/products";
import { releaseCitation, releaseDoi, releaseFacts, type Citation } from "@/lib/release";
import { useReferencePeriod } from "@/lib/queries";
import { curlLine, scopeBody, stateFromEnvelopeRequest } from "@/lib/requests";
import { hrefForState } from "@/lib/urlState";
import { NavCapsule } from "@/components/shell/NavCapsule";
import { SEGMENT_GROUP_CLASS, segmentClass } from "@/components/workspace/PaneSwitch";
import { Widget, WIDGET_TITLE } from "@/components/ui/Widget";
import { Frame } from "@/components/ui/Frame";
import { RefusalCard, Loading } from "@/components/ui/RefusalCard";
import { DOWNLOADS, PURPOSES, purposeById, type Purpose } from "./copy";

const TEXT_BUTTON = "inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline";
const FORMAT_BUTTON = "pill inline-flex items-center gap-1 border border-line-strong px-2.5 py-1 text-xs font-semibold text-fg hover:bg-surface-3";
const PRIMARY = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-bright";
const OUTLINE = "inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-card px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-3";
const CHIP = "rounded-full border border-nav-line bg-nav px-3 py-1 text-xs font-medium text-fg shadow-sm";
const FORMAT_NAME: Record<string, string> = { csv: "CSV", parquet: "Parquet", nc: "NetCDF", json: "JSON", zip: "ZIP" };
const MODES = ["files", "api"] as const;
const PURPOSE_ICON: Record<string, React.ReactNode> = {
  totals: <BarChart3 size={18} className="text-accent" aria-hidden="true" />,
  monthly: <CalendarDays size={18} className="text-accent" aria-hidden="true" />,
  allocations: <MapPin size={18} className="text-accent" aria-hidden="true" />,
  gridded: <Layers size={18} className="text-accent" aria-hidden="true" />,
  uncertainty: <LineChart size={18} className="text-accent" aria-hidden="true" />,
  evidence: <FileText size={18} className="text-accent" aria-hidden="true" />,
  air: <Wind size={18} className="text-accent" aria-hidden="true" />,
};

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
  const facts = releaseFacts(release);
  const reference = useReferencePeriod();
  const [modeParam, setModeParam] = useQueryState("mode", parseAsStringLiteral(MODES));
  const [purposeParam, setPurposeParam] = useQueryState("purpose", parseAsString);
  const [receiptParam, setReceiptParam] = useQueryState("receipt", parseAsString);
  const [draft, setDraft] = useState("");
  // a shared result link (?receipt=) opens straight onto the replay, which lives in the API mode
  const mode = receiptParam ? "api" : modeParam ?? "files";
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
    totals: range,
    monthly: months ? `${months} months` : "Every month",
    allocations: refShort,
    gridded: `${refShort} · Monthly`,
    uncertainty: "",
    evidence: "",
    air: "Seven sectors · Agriculture mapped and 1990 to 2024",
    complete: "Every file · One archive",
  };
  // the six purpose cards; the complete release is the hero's own action
  const offered = PURPOSES.filter((p) => p.id !== "complete");
  const purpose = purposeById(purposeParam) ?? offered[0];
  const complete = products.data?.families.find((f) => f.id === "complete");
  const family = products.data?.families.find((f) => f.id === purpose.family);
  const railProducts = products.data ? narrowProducts(familyProducts(products.data, family ?? { id: purpose.family, title: purpose.fallback.title, description: purpose.fallback.description, tables: [], formats: [] }), purpose.only) : [];
  // the technical drawers, out of the main reading path (the researchers section owns them)
  const [guide, setGuide] = useState(false);
  const [checksums, setChecksums] = useState(false);
  const [cite, setCite] = useState(false);
  const curl = curlLine(absoluteApiBase(), { method: "POST", path: "/query/emissions", body: JSON.stringify(scopeBody(state)) });

  const pickMode = (next: (typeof MODES)[number]) => {
    if (next === "files") setReceiptParam(null);
    setModeParam(next === "files" ? null : next);
  };

  return (
    <div className="min-h-dvh bg-surface" data-testid="downloads-page">
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-5" data-testid="top-nav">
        <NavCapsule />
        <div className={SEGMENT_GROUP_CLASS} role="group" aria-label={DOWNLOADS.modes.label} data-testid="mode-switch">
          <button type="button" onClick={() => pickMode("files")} aria-pressed={mode === "files"} className={`${segmentClass(mode === "files")} px-3`} data-testid="mode-files">
            {DOWNLOADS.modes.files}
          </button>
          <button type="button" onClick={() => pickMode("api")} aria-pressed={mode === "api"} className={`${segmentClass(mode === "api")} px-3`} data-testid="mode-api">
            {DOWNLOADS.modes.api}
          </button>
        </div>
      </header>

      {mode === "files" && (
        <main className="mx-auto max-w-[1500px] px-5 pb-12 pt-4">
          <section className="flex flex-wrap items-start justify-between gap-6" data-testid="downloads-hero">
            <div className="max-w-[44em]">
              <div className="micro">{DOWNLOADS.eyebrow}</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg md:text-4xl">{DOWNLOADS.hero}</h1>
              {DOWNLOADS.dekLines.map((l) => (
                <p key={l} className="mt-1 text-md text-muted first-of-type:mt-3">{l}</p>
              ))}
              <div className="mt-4 flex flex-wrap gap-2" data-testid="hero-chips">
                {range && <span className={CHIP}>{range}</span>}
                {facts.licences.data_and_text && <span className={CHIP}>{facts.licences.data_and_text}</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {complete?.archive && (
                <a href={complete.archive.url} className={PRIMARY} title={complete.archive.note ?? ""} data-testid="archive-download">
                  <Archive size={15} aria-hidden="true" /> {DOWNLOADS.completeRelease}
                </a>
              )}
              <a href={api.docsUrl()} className={OUTLINE} data-testid="api-docs">
                <ExternalLink size={15} aria-hidden="true" /> {DOWNLOADS.docs}
              </a>
            </div>
          </section>

          <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <section data-testid="purposes">
              <h2 className="text-xl font-semibold text-fg" data-testid="purpose-question">{DOWNLOADS.question}</h2>
              <p className="mt-1 text-sm text-muted">{DOWNLOADS.chooseSub}</p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {offered.map((p) => {
                  const on = purpose.id === p.id;
                  return (
                    <button key={p.id} type="button" onClick={() => setPurposeParam(p.id === offered[0].id ? null : p.id)} aria-pressed={on} className={`relative flex flex-col rounded-xl border p-4 text-left transition-colors ${on ? "border-brand-gold bg-nav shadow-card" : "border-line bg-card hover:bg-surface-3"}`} data-testid="purpose-card" data-purpose={p.id}>
                      {on && (
                        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-on-accent" aria-hidden="true">
                          <Check size={12} />
                        </span>
                      )}
                      {PURPOSE_ICON[p.id]}
                      <span className="mt-2 text-sm font-semibold text-fg">{p.title}</span>
                      <span className="mt-1 text-xs text-muted">{p.description}</span>
                      {captions[p.id] && <span className="mt-2 text-micro normal-case tracking-normal text-muted" data-testid="purpose-caption">{captions[p.id]}</span>}
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 border-t border-line pt-5" data-testid="researchers">
                <div className="micro">{DOWNLOADS.researchers}</div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                  <button type="button" className={TEXT_BUTTON} onClick={() => setGuide((v) => !v)} aria-expanded={guide} data-testid="preview-columns">
                    <Table2 size={12} aria-hidden="true" /> {guide ? DOWNLOADS.hidePreview : DOWNLOADS.preview}
                  </button>
                  <button type="button" className={TEXT_BUTTON} onClick={() => setChecksums((c) => !c)} aria-expanded={checksums} data-testid="checksums-toggle">
                    <ShieldCheck size={12} aria-hidden="true" /> {checksums ? DOWNLOADS.hideChecksums : DOWNLOADS.checksums}
                  </button>
                  <button type="button" className={TEXT_BUTTON} onClick={() => setCite((c) => !c)} aria-expanded={cite} data-testid="cite-toggle">
                    <Copy size={12} aria-hidden="true" /> {DOWNLOADS.copyCitation}
                  </button>
                  <button type="button" className={TEXT_BUTTON} onClick={() => pickMode("api")} data-testid="open-api-mode">
                    <ExternalLink size={12} aria-hidden="true" /> {DOWNLOADS.modes.api}
                  </button>
                </div>
                {checksums && railProducts.length > 0 && (
                  <div className="mt-3 overflow-x-auto" data-testid="checksums">
                    <p className="mb-2 text-xs text-muted">The sha256 of every file of this topic, as the contract, the manifest and the verification declare them; a download answers with the same digest as its ETag.{products.data?.note ? ` ${products.data.note}` : ""}</p>
                    <table className="w-full text-xs">
                      <tbody>
                        {railProducts.flatMap((pr) => pr.formats).map((f) => (
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
                {cite && <CitationTable citation={citation} version={release.version} doi={doi.data} />}
              </div>
            </section>

            <DownloadRail
              purpose={purpose}
              family={family}
              products={railProducts}
              guide={guide}
              loading={products.isLoading}
              error={products.error}
              configuration={`${configLabel(labels, defaults.configuration_id)} · ${gwpLabel(labels, defaults.gwp_basis)}`}
            />
          </div>
        </main>
      )}

      {mode === "api" && (
        <main className="mx-auto max-w-[1500px] px-5 pb-12 pt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
          <CitationTable citation={citation} version={release.version} doi={doi.data} />
        </main>
      )}
    </div>
  );
}

/** The YOUR DOWNLOAD rail: the chosen topic's files and nothing technical - the column guide opens per row (or all at once from the researchers section's Data guide). */
function DownloadRail({ purpose, family, products, guide, loading, error, configuration }: { purpose: Purpose; family?: ProductFamily; products: Product[]; guide: boolean; loading: boolean; error: unknown; configuration: string }) {
  const [schema, setSchema] = useState<string | null>(null);
  const downloadAll = () => {
    for (const p of products) {
      const f = p.formats[0];
      if (!f) continue;
      const a = document.createElement("a");
      a.href = f.url;
      a.download = f.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };
  return (
    <aside className="overflow-hidden rounded-2xl border border-nav-line border-t-[3px] border-t-brand-gold bg-card p-5 shadow-card lg:sticky lg:top-6" data-testid="purpose-panel" data-purpose={purpose.id} data-family={purpose.family}>
      <div className="micro text-accent">{DOWNLOADS.yourDownload}</div>
      <h3 className="mt-1 text-lg font-semibold text-fg" data-testid="family-title">{family?.title ?? purpose.fallback.title}</h3>
      <p className="mt-1 text-sm text-muted">{family?.description ?? purpose.fallback.description}</p>
      {family && family.formats.length > 0 && <p className="mt-1 text-xs text-muted" data-testid="family-formats">{formatWords(family.formats.filter((f) => f !== "zip"))}</p>}

      {products.length > 0 ? (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line" data-testid="product-list">
          {products.map((p) => {
            const open = guide || schema === p.name;
            return (
              <li key={p.name} className="p-3" data-testid="product-row" data-product={p.name} data-kind={p.kind}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="mono min-w-0 break-all text-sm text-fg">{p.name}</span>
                  {typeof p.rows === "number" && <span className="text-xs text-muted">{p.rows.toLocaleString("en-GB")} rows</span>}
                  <span className="flex-1" />
                  {p.formats.map((f) => (
                    <a key={f.filename} href={f.url} className={FORMAT_BUTTON} data-testid="format-button" data-format={f.ext} data-sha256={f.sha256} title={`${f.filename} · ETag / sha256 ${f.sha256} · ${bytesWords(f.bytes)}`}>
                      <Download size={12} aria-hidden="true" /> {FORMAT_NAME[f.ext] ?? f.ext.toUpperCase()}
                    </a>
                  ))}
                  <button type="button" className={TEXT_BUTTON} onClick={() => setSchema(schema === p.name ? null : p.name)} aria-expanded={open} data-testid="schema-toggle">
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
        <div className="mt-4"><RefusalCard error={error} compact /></div>
      ) : loading ? (
        <div className="mt-4"><Loading what="the product catalogue" /></div>
      ) : (
        <p className="mt-4 text-xs text-muted">The catalogue lists no file for this purpose.</p>
      )}

      <p className="note mt-3 flex items-center gap-1.5 text-xs" data-testid="always-included">
        <Info size={13} className="shrink-0" aria-hidden="true" /> {DOWNLOADS.always}
      </p>

      {products.length > 0 && (
        <button type="button" onClick={downloadAll} className={`${PRIMARY} mt-3 w-full`} data-testid="download-all">
          <Download size={15} aria-hidden="true" /> {DOWNLOADS.downloadAll(products.length)}
        </button>
      )}

      <div className="mt-4 border-t border-line pt-3" data-testid="reference-configuration">
        <div className="micro">{DOWNLOADS.refConfig}</div>
        <p className="mt-1 text-sm font-semibold text-fg">{configuration}</p>
        <p className="mt-0.5 text-xs text-muted">{DOWNLOADS.refNote}</p>
      </div>
    </aside>
  );
}

/** Cite and identify this release: the identity rows and the copyable APA / BibTeX — the version's one home. */
function CitationTable({ citation, version, doi }: { citation: Citation | null; version: string; doi: string }) {
  const [copied, setCopied] = useState<"apa" | "bibtex" | null>(null);
  const copy = async (kind: "apa" | "bibtex") => {
    if (!citation) return;
    if (await copyText(kind === "apa" ? citation.apa : citation.bibtex)) {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1200);
    }
  };
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
    <div className="card mt-4 p-5" data-testid="citation-table">
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
  );
}
