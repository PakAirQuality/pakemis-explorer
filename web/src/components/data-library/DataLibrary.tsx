"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { Download, Search } from "lucide-react";
import { NavCapsule } from "@/components/shell/NavCapsule";
import { PreviewDrawer } from "@/components/downloads/PreviewDrawer";
import { useProducts, type LibraryAsset } from "@/lib/products";
import { label, libraryPage } from "./filter";

const licences: Record<string, string> = {
  "own-work": "Project work", "own-work-compilation": "Project compilation",
  "public-licence": "Source licence · see provenance", "not-established": "Redistribution terms not established",
};

function Asset({ asset, preview }: { asset: LibraryAsset; preview: (value: { title: string; file: string }) => void }) {
  const csv = asset.formats.find((format) => format.ext === "csv");
  const template = asset.purpose.includes("request");
  return <article className="rounded-card border border-line bg-card p-5" data-testid="library-asset">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="micro">{label(asset.owner_sector)} · {label(asset.purpose)}</p>
        <h2 className="mt-1 text-lg font-semibold text-fg">{asset.title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{asset.description}</p>
        {template && <p className="mt-2 text-sm text-muted">Request template for collecting missing information. Blank fields are not observations.</p>}
        <p className="mt-2 text-xs text-muted">
          {asset.row_count !== undefined && !template ? `${asset.row_count.toLocaleString("en-GB")} rows · ` : ""}
          {licences[asset.license] ?? asset.license}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {csv && <button type="button" className="pill border border-line-strong px-3 py-1.5 text-xs" onClick={() => preview({ title: asset.title, file: csv.filename })}>Preview CSV</button>}
        {asset.formats.map((format) => <a key={format.filename} href={format.url} className="pill inline-flex items-center gap-1 bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent">
          <Download size={12} /> {format.ext.toUpperCase()}
        </a>)}
        {!asset.downloadable && <span className="text-xs text-muted">Metadata only</span>}
      </div>
    </div>
    <details className="mt-4 border-t border-line pt-3 text-xs text-muted">
      <summary className="cursor-pointer font-medium text-fg">Schema and provenance</summary>
      <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-[8rem_1fr]">
        <dt>Asset</dt><dd className="break-all">{asset.asset_id}</dd>
        <dt>Applies to</dt><dd>{asset.sectors.map(label).join(", ")}</dd>
        <dt>Licence record</dt><dd>{asset.license}</dd>
        {asset.source_refs.length > 0 && <><dt>Sources</dt><dd>{asset.source_refs.map((source) => <div key={source} className="break-words">{source.startsWith("https://") || source.startsWith("http://") ? <a href={source} className="underline" target="_blank" rel="noreferrer">{source}</a> : source}</div>)}</dd></>}
        {asset.formats.map((format) => <div key={format.filename} className="contents"><dt>{format.ext.toUpperCase()} checksum</dt><dd className="break-all font-mono">{format.sha256}</dd></div>)}
      </dl>
      {asset.columns && asset.columns.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full text-left">
        <thead><tr className="border-b border-line"><th className="py-2 pr-4">Column</th><th className="py-2 pr-4">Field ID</th><th className="py-2">Unit</th></tr></thead>
        <tbody>{asset.columns.map((column) => <tr key={column.field_id} className="border-b border-line"><td className="py-1.5 pr-4">{column.name}</td><td className="py-1.5 pr-4">{column.field_id}</td><td className="py-1.5">{column.unit || "—"}</td></tr>)}
          {asset.table_id && ["Record ID", "Source row"].map((column) => <tr key={column}><td className="py-1.5 pr-4">{column}</td><td className="py-1.5 pr-4" colSpan={2}>Source lineage</td></tr>)}
        </tbody></table></div>}
    </details>
  </article>;
}

export function DataLibrary() {
  const products = useProducts();
  const library = products.data?.data_library;
  const [filters, setFilters] = useQueryStates({ sector: parseAsString.withDefault(""), purpose: parseAsString.withDefault(""),
    q: parseAsString.withDefault(""), page: parseAsInteger.withDefault(1) });
  const [preview, setPreview] = useState<{ title: string; file: string } | null>(null);
  const result = useMemo(() => libraryPage(library?.assets ?? [], filters), [library, filters]);
  return <div className="min-h-screen bg-surface">
    <header className="flex flex-wrap items-center justify-between gap-4 px-5 pb-3 pt-5"><NavCapsule /><Link href="/downloads" className="text-sm text-accent underline">Curated downloads</Link></header>
    <main className="mx-auto max-w-6xl px-5 pb-16">
      <section className="rounded-card border border-line bg-card px-6 py-6">
        <p className="micro">Public data</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-fg">Data library</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">Browse the activity, geography, parameters and evidence behind the inventory. Shared datasets are listed once, with their applicable sectors.</p>
      </section>
      {products.isPending && <p className="mt-6 text-sm text-muted">Loading the data library…</p>}
      {products.error && <p role="alert" className="mt-6 text-sm text-warn">The data library could not be loaded. Please try again.</p>}
      {products.data && !library && <p className="mt-6 text-sm text-muted">This release predates the data library. Its published files remain available in <Link href="/downloads" className="text-accent underline">curated downloads</Link>.</p>}
      {library && <>
        <div className="mt-5 flex flex-wrap gap-3 rounded-card border border-line bg-card p-4">
          <label className="flex min-w-56 flex-1 items-center gap-2"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search data library" className="w-full bg-transparent text-sm outline-none" placeholder="Search datasets, columns or sources" value={filters.q} onChange={(event) => setFilters({ q: event.target.value, page: 1 })} /></label>
          <label className="flex items-center gap-2 text-sm">Sector<select aria-label="Sector" className="rounded border border-line bg-card p-2" value={filters.sector} onChange={(event) => setFilters({ sector: event.target.value, page: 1 })}><option value="">All sectors</option>{library.sectors.map((sector) => <option key={sector} value={sector}>{label(sector)}</option>)}</select></label>
          <label className="flex items-center gap-2 text-sm">Purpose<select aria-label="Purpose" className="rounded border border-line bg-card p-2" value={filters.purpose} onChange={(event) => setFilters({ purpose: event.target.value, page: 1 })}><option value="">All purposes</option>{library.purposes.map((purpose) => <option key={purpose} value={purpose}>{label(purpose)}</option>)}</select></label>
        </div>
        <p className="my-4 text-sm text-muted" role="status">{result.total.toLocaleString("en-GB")} {result.total === 1 ? "dataset" : "datasets"} · Page {result.page} of {result.pages}</p>
        <div className="space-y-4">{result.items.map((asset) => <Asset key={asset.asset_id} asset={asset} preview={setPreview} />)}</div>
        {result.total === 0 && <p className="rounded-card border border-line bg-card p-6 text-sm text-muted">No datasets match these filters. <button type="button" className="text-accent underline" onClick={() => setFilters({ sector: "", purpose: "", q: "", page: 1 })}>Clear filters</button></p>}
        {result.pages > 1 && <nav aria-label="Library pages" className="mt-6 flex justify-between"><button type="button" disabled={result.page === 1} className="pill border border-line px-4 py-2 text-sm disabled:opacity-40" onClick={() => setFilters({ page: result.page - 1 })}>Previous</button><button type="button" disabled={result.page === result.pages} className="pill border border-line px-4 py-2 text-sm disabled:opacity-40" onClick={() => setFilters({ page: result.page + 1 })}>Next</button></nav>}
      </>}
    </main>
    {preview && <PreviewDrawer title={preview.title} file={preview.file} onClose={() => setPreview(null)} />}
  </div>;
}
