"use client";
/**
 * Downloads, as five collections a reader can name.
 *
 * WHAT THIS REPLACED. The page was a purpose-picker whose rail listed `fact_annual`, `dim_category`,
 * `dim_evidence_class` — the warehouse's own table names, offered as products. Someone who wanted
 * Pakistan's fuel sales or its livestock counts had to learn a star schema to find them, and the
 * most valuable material, the activity data behind the estimates, was not offered at all.
 *
 * Now: Emissions, Activity data, Air pollutants, Methods & uncertainty, Maps & grids. Each download
 * has a title and a sentence saying who it is for; the file underneath comes from `catalogue.ts`,
 * whose every name a test holds against the served catalogue.
 *
 * ⚠ THE AUDIT IN downloads.test.tsx IS THE TIGHTEST CONSTRAINT HERE. It walks every text node and
 * requires each `\d+\.\d+` to be a string the server sent, and forbids `FY`, the version string,
 * `REF_2023_24` and a bare `AR5`. Sizes therefore stay in the `title` attribute through
 * `bytesWords()`, periods go through the release's labels, and the version lives in the citation
 * table alone. "7.4 MB" on screen would fail the build, which is the point.
 *
 * The API mode is unchanged, and `?receipt=` still forces it: that URL is what every receipt in the
 * app links to, including the assistant's answers.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { Copy, Download, ExternalLink, FileJson, Search, Table2, X } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { absoluteApiBase, api } from "@/lib/api";
import { gasLabel, geographyName, periodRange } from "@/lib/labels";
import { bytesWords, productUrl, useProducts, type Product } from "@/lib/products";
import { releaseCitation, releaseDoi, releaseFacts, type Citation } from "@/lib/release";
import { useEmissions } from "@/lib/queries";
import { curlLine, scopeBody, stateFromEnvelopeRequest } from "@/lib/requests";
import { hrefForState } from "@/lib/urlState";
import { NavCapsule } from "@/components/shell/NavCapsule";
import { SEGMENT_GROUP_CLASS, segmentClass } from "@/components/workspace/PaneSwitch";
import { Widget, WIDGET_TITLE } from "@/components/ui/Widget";
import { Frame } from "@/components/ui/Frame";
import { RefusalCard } from "@/components/ui/RefusalCard";
import { DOWNLOADS } from "./copy";
import { COLLECTION_IDS, collectionsFor, matches, type Collection, type Download as Item } from "./catalogue";
import { PreviewDrawer } from "./PreviewDrawer";
import { MapMotif, MOTIF_CREDIT } from "@/components/shell/MapMotif";

const TEXT_BUTTON = "inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline";
const CHIP = "rounded-full border border-nav-line bg-nav px-3 py-1 text-xs font-medium text-fg shadow-sm";
/**
 * The banner's own border and fill, read by the hero AND by every collection card.
 *
 * ⚠ TWO CONSTANTS, READ TWICE EACH, and a test holds them to it. The collection card is supposed to
 * match the banner, and a copied class string is exactly the kind of agreement that quietly stops
 * being true the next time one of them is restyled. They are split because the collection card wears
 * them in different places: the border on the card itself, the fill on its heading band only.
 */
export const PALE_BORDER = "border border-nav-line";
export const PALE_FILL = "bg-nav";
export const PALE_CARD = `rounded-card ${PALE_BORDER} ${PALE_FILL}`;
/**
 * ⚠ ONE TEMPLATE FOR EVERY ROW, AND NO BREAKPOINT. The rows began as flex lines whose first column
 * was `flex-1` and whose action cluster was `auto`, so the cluster's width tracked its own contents
 * and COVERAGE landed at a different x on almost every row - I measured 413, 465, 486, 542, 559 and
 * 635 down one page.
 *
 * The fix is NOT a grid: what aligns the columns is the two TRAILING blocks having fixed widths, so
 * the text column absorbs every pixel of slack and the right-hand pair starts and ends at the same
 * x on every row. A `lg:` grid template did that too, and then rendered stacked on one machine and
 * four-across on another at the same window width - unexplained, and not worth depending on. Flex
 * with fixed trailing widths needs no media query at all: a narrow window wraps, which is exactly
 * what the breakpoint's fallback was doing by hand.
 */
export const ROW_GRID = "flex flex-wrap items-center gap-x-6 gap-y-2.5 px-5 py-3.5";
/** Fixed, and that is the point - an `auto` here is what made the columns ragged. */
export const ROW_COVERAGE = "w-44 shrink-0";
export const ROW_ACTIONS = "flex w-56 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 md:justify-end";
const MODES = ["files", "api"] as const;
const TABS = ["all", ...COLLECTION_IDS] as const;
const TAB_LABEL: Record<string, string> = {
  all: "All data", emissions: "Emissions", activity: "Activity data",
  air: "Air pollutants", methods: "Methods & uncertainty", maps: "Maps & grids",
};

/** The format a filename is, in a reader's word. */
export function formatWord(file: string): string {
  const ext = file.split(".").pop() ?? "";
  return ext === "nc" ? "NetCDF" : ext.toUpperCase();
}

export function Downloads() {
  const { state, release, labels, dims, defaults } = useExplorer();
  const products = useProducts();
  const citation = releaseCitation(release);
  const doi = releaseDoi(release);
  const facts = releaseFacts(release);
  const [modeParam, setModeParam] = useQueryState("mode", parseAsStringLiteral(MODES));
  const [tab, setTabParam] = useQueryState("show", parseAsStringLiteral(TABS));
  // ONE DOWNLOAD, LINKED TO (`?item=<id>`, the assistant's file links): its collection is shown,
  // the page scrolls to it and it is highlighted. Choosing a tab lets go of it.
  const [itemParam, setItemParam] = useQueryState("item", parseAsString);
  const setTab = (next: (typeof TABS)[number] | null) => {
    setItemParam(null);
    setTabParam(next);
  };
  const [receiptParam, setReceiptParam] = useQueryState("receipt", parseAsString);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<{ title: string; file: string } | null>(null);
  // a shared result link (?receipt=) opens straight onto the replay, which lives in the API mode
  const mode = receiptParam ? "api" : modeParam ?? "files";
  const replay = useQuery({ queryKey: ["replay", receiptParam], queryFn: () => api.receipt(receiptParam!), enabled: !!receiptParam && receiptParam.length === 32, retry: false });
  const mapHref = useMemo(() => {
    if (!replay.data) return null;
    const patch = stateFromEnvelopeRequest(replay.data.request);
    return Object.keys(patch).length ? hrefForState({ ...state, ...patch }, defaults, "/") : null;
  }, [replay.data, state, defaults]);
  const curl = useMemo(() => curlLine(absoluteApiBase(), { method: "POST", path: "/query/emissions", body: JSON.stringify(scopeBody(state)) }), [state]);

  // THE VIEW THE READER CAME FROM, as a file. Its receipt is minted by the same query the workspace
  // runs, so the CSV is that view exactly rather than an approximation reassembled from the filters.
  const view = useEmissions(scopeBody(state), mode === "files");

  const byName = useMemo(() => {
    const out = new Map<string, Product>();
    for (const p of products.data?.products ?? []) for (const f of p.formats) out.set(f.filename, p);
    return out;
  }, [products.data]);

  const collections = useMemo(() => collectionsFor(products.data?.download_catalog), [products.data?.download_catalog]);
  // the linked download's collection, when the URL names a published one and no tab was chosen
  const linked = useMemo(() => {
    if (!itemParam) return null;
    const home = collections.find((c) => c.downloads.some((d) => d.id === itemParam && !d.pending));
    return home ? { id: itemParam, collection: home.id as (typeof TABS)[number] } : null;
  }, [itemParam, collections]);
  const activeTab = tab ?? linked?.collection ?? null;
  const shown: Collection[] = useMemo(() => {
    const columnsOf = (item: Item) => item.files.flatMap((f) => byName.get(f)?.columns ?? []);
    const picked = activeTab && activeTab !== "all" ? collections.filter((c) => c.id === activeTab) : collections;
    if (!query.trim()) return picked;
    return picked
      .map((c) => ({ ...c, downloads: c.downloads.filter((d) => matches(d, query, columnsOf(d))) }))
      .filter((c) => c.downloads.length > 0);
  }, [activeTab, query, byName, collections]);
  // scroll the linked download into view once per link, when its row is on the page
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!linked || scrolledTo.current === linked.id) return;
    const row = document.getElementById(downloadAnchor(linked.id));
    if (!row) return;
    scrolledTo.current = linked.id;
    row.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [linked, shown]);

  const setMode = (next: (typeof MODES)[number]) => {
    if (next === "files") setReceiptParam(null);
    setModeParam(next === "files" ? null : next);
  };

  const place = state.geo ? geographyName(labels, state.geo) : "Pakistan";

  return (
    <div className="relative min-h-screen" data-testid="downloads-page">
      <MapMotif />
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pb-3 pt-5">
        <NavCapsule />
        {/* the actions wrap as a group rather than letting the segmented switch fall off the edge */}
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <Link href="/data-library" className={TEXT_BUTTON}>Data library</Link>
          <a href={api.docsUrl()} className={TEXT_BUTTON} data-testid="api-docs"><ExternalLink size={12} /> {DOWNLOADS.docs}</a>
          <a href={productUrl("complete.zip")} className={TEXT_BUTTON} data-testid="archive-download" title={products.data?.families.find((f) => f.id === "complete")?.archive?.note}>
            <Download size={12} /> {DOWNLOADS.completeRelease}
          </a>
          {/* segmentClass carries no horizontal padding - PaneSwitch adds px-3 at the call site, and
              without it the two labels sit on top of each other */}
          <div className={`${SEGMENT_GROUP_CLASS} shrink-0`} role="group" aria-label={DOWNLOADS.modes.label} data-testid="mode-switch">
            {MODES.map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} className={`${segmentClass(mode === m)} px-3`} onClick={() => setMode(m)} data-testid={m === "api" ? "open-api-mode" : "mode-files"}>
                {m === "files" ? DOWNLOADS.modes.files : DOWNLOADS.modes.api}
              </button>
            ))}
          </div>
        </div>
      </header>

      {mode === "files" && (
        <main className="px-5 pb-16">
          <section className={`${PALE_CARD} px-6 py-6`} data-testid="downloads-hero">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0">
                <p className="micro">Public data</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-fg">{DOWNLOADS.hero}</h1>
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">Emissions estimates and the activity data behind them.</p>
                <div className="mt-3 flex flex-wrap gap-2" data-testid="hero-chips">
                  <span className={CHIP}>{periodRange(dims, labels)}</span>
                  {facts.licences.data_and_text && <span className={CHIP}>{facts.licences.data_and_text}</span>}
                </div>
              </div>
              <div className="rounded-card border border-line bg-card px-4 py-3" data-testid="view-download">
                <p className="micro">From Explore</p>
                <p className="mt-1 text-sm font-medium text-fg">{place} · {gasLabel(labels, state.gas)}</p>
                {view.data?.receipt ? (
                  <a href={api.downloadCsvUrl(view.data.receipt)} className={`${TEXT_BUTTON} mt-1.5`} data-testid="download-this-view">
                    <Download size={12} /> Download this view
                  </a>
                ) : (
                  <p className="mt-1.5 text-xs text-muted">Preparing this view&hellip;</p>
                )}
              </div>
            </div>
          </section>

          <div className="mt-6 flex items-center gap-2 rounded-card border border-line bg-card px-4 py-3" data-testid="search">
            <Search size={16} className="shrink-0 text-muted" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fuel sales, livestock, districts…"
              aria-label="Search the downloads"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              data-testid="search-input"
            />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear the search" className="shrink-0 text-muted hover:text-fg"><X size={14} /></button>}
          </div>

          {/* the tabs live in the FIRST header card, and stand alone when nothing matches - without
              that second home a search for "zzzz" would take the tabs off the page with the
              collections and leave no way back */}
          {shown.length === 0 && (
            <div className={`mt-4 ${PALE_CARD} px-6 py-5`} data-testid="collection-header">
              <Tabs tab={activeTab} setTab={setTab} />
              <p className="mt-4 text-sm text-muted" data-testid="no-matches">Nothing matches that. Try a fuel, a place or a column name.</p>
            </div>
          )}

          {shown.map((c, i) => (
            <section key={c.id} className={i === 0 ? "mt-4" : "mt-8"} data-testid="collection" data-collection={c.id}>
              {/* ONE CARD, NOT TWO. The heading band sits directly on its table with the saffron rule
                  as the join; `overflow-hidden` is what lets the band and the table square off against
                  that rule while the card's own corners stay round. */}
              <div className={`overflow-hidden rounded-card ${PALE_BORDER} bg-card shadow-card`} data-testid="collection-card">
                <div className={`${PALE_FILL} px-6 py-5`} data-testid="collection-header">
                  {i === 0 && <Tabs tab={activeTab} setTab={setTab} />}
                  <h2 className={`${i === 0 ? "mt-4 " : ""}text-xl font-semibold tracking-tight text-fg`}>{c.title}</h2>
                  <p className="mt-0.5 text-sm text-muted">{c.dek}</p>

                </div>

                {/* the saffron rule is the JOIN, and every collection has one - it used to be skipped
                    for activity, which had no white panel to cap; it has one now */}
                <div className="h-[3px] bg-brand-gold" aria-hidden="true" data-testid="collection-rule" />
                {/* ⚠ PENDING IS PER DOWNLOAD NOW, not per collection. Six of the nine activity
                    collections shipped in rc55 and three did not, so one section holds both: the
                    published tables as rows, and beneath them the ones still being packaged. */}
                <div>
                  {c.downloads.filter((d) => !d.pending).map((d) => (
                    <ItemRow key={d.id} item={d} product={byName.get(d.files[0])} pending={false} onPreview={setPreview} highlighted={linked?.id === d.id} />
                  ))}
                </div>
                {c.downloads.some((d) => d.pending) && (
                  <div className="grid grid-cols-1 gap-x-8 gap-y-5 border-t border-line px-6 py-5 sm:grid-cols-2 lg:grid-cols-3">
                    {c.downloads.filter((d) => d.pending).map((d) => (
                      <ItemRow key={d.id} item={d} product={undefined} pending onPreview={setPreview} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          ))}

          <p className="mt-10 border-t border-line pt-4 text-xs text-muted" data-testid="downloads-footer">
            Source references and column definitions accompany every collection. {MOTIF_CREDIT}
          </p>
        </main>
      )}

      {mode === "api" && (
        <main className="px-5 pb-12 pt-4">
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

      {preview && <PreviewDrawer title={preview.title} file={preview.file} onClose={() => setPreview(null)} />}
    </div>
  );
}

/**
 * The collection tabs, inside the first header card.
 *
 * No horizontal padding on the buttons: in a `px-6` card the old `px-3` pushed "All data" three
 * units right of the heading directly beneath it. Without it the first tab and the `<h2>` share a
 * left edge, and the active underline hugs its own text the way the nav capsule's does.
 */
function Tabs({ tab, setTab }: { tab: string | null; setTab: (v: (typeof TABS)[number] | null) => void }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-nav-line" role="tablist" aria-label="Collections">
      {TABS.map((id) => {
        const on = (tab ?? "all") === id;
        return (
          <button key={id} type="button" role="tab" aria-selected={on} onClick={() => setTab(id === "all" ? null : id)}
                  className={`-mb-px border-b-2 pb-2.5 text-sm transition-colors ${on ? "border-accent font-semibold text-accent" : "border-transparent text-muted hover:text-fg"}`}
                  data-testid="collection-tab" data-collection={id}>
            {TAB_LABEL[id]}
          </button>
        );
      })}
    </div>
  );
}

/** One download: what it is, what it covers, and the two things a reader does with it. */
/** The element id of a download's row, which `?item=<id>` scrolls to. */
export function downloadAnchor(id: string): string {
  return `download-${id}`;
}

function ItemRow({ item, product, pending, onPreview, highlighted = false }: { item: Item; product?: Product; pending: boolean; onPreview: (p: { title: string; file: string }) => void; highlighted?: boolean }) {
  const Icon = item.icon;
  if (pending) {
    // designed, not yet published: the card says what it will hold and the section above says why
    return (
      <div data-testid="download-card" data-id={item.id}>
        <div className="flex items-start gap-2.5">
          <Icon size={17} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" data-testid="download-icon" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">{item.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.dek}</p>
          </div>
        </div>
        <p className="mt-2 text-micro normal-case tracking-normal text-muted">{item.coverage}</p>
      </div>
    );
  }
  // ONE TABLE, ONE FORMAT: the CSV, or the NetCDF for a grid. Parquet was offered here as a quiet
  // second link until 2026-09-16; it still ships in the release and is still served by /products,
  // it is simply not offered on the page, and a test holds the catalogue to naming one file.
  const [primary] = item.files;
  const csv = item.files.find((f) => f.endsWith(".csv"));
  return (
    <div id={downloadAnchor(item.id)}
         className={`${ROW_GRID} border-b border-line last:border-b-0 ${highlighted ? "bg-accent-soft ring-2 ring-inset ring-accent" : ""}`}
         data-testid="download-row" data-id={item.id} data-highlighted={highlighted ? "1" : undefined}>
      <Icon size={17} className="w-5 shrink-0 text-accent" aria-hidden="true" data-testid="download-icon" />
      {/* ⚠ THE MEASURE GOES ON THE SENTENCE, NOT ON THE COLUMN. A max-width here stops `flex-1` from
          growing, so the whole row bunches to the left and leaves a void where the window continues -
          which is the same complaint as the centred cap, wearing a different hat. The column grows to
          fill; only the prose keeps a readable line length. */}
      <div className="min-w-[20rem] flex-1">
        <p className="text-sm font-semibold text-fg">{item.title}</p>
        <p className="mt-0.5 max-w-[80ch] text-xs leading-relaxed text-muted">{item.dek}</p>
      </div>
      <div className={ROW_COVERAGE}>
        <p className="micro">Coverage</p>
        <p className="mt-0.5 text-xs text-fg">{item.coverage}</p>
        {typeof product?.rows === "number" && <p className="text-xs text-muted" data-testid="row-count">{product.rows.toLocaleString("en")} rows</p>}
      </div>
      <div className={ROW_ACTIONS}>
        {csv && (
          <button type="button" onClick={() => onPreview({ title: item.title, file: csv })} className="pill inline-flex items-center gap-1 border border-line-strong px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-3" data-testid="preview">
            <Table2 size={12} /> Preview
          </button>
        )}
        <a href={productUrl(primary)} className="pill inline-flex items-center gap-1 bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-bright"
           data-testid="format-button" data-file={primary} title={bytesWords(product?.formats.find((x) => x.filename === primary)?.bytes ?? 0)}>
          <Download size={12} /> {formatWord(primary)}
        </a>
      </div>
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

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
