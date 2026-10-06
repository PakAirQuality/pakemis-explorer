"use client";
/**
 * The sector catalogue (/methods/sectors): a search over the sectors' labels, categories and
 * sources, and one tile per sector, each a link to its own page. The stream counts that used
 * to sit on the tiles are gone - internal vocabulary the reader's page has no use for.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useExplorer } from "@/components/ExplorerContext";
import { sectorLabel } from "@/lib/labels";
import { useEvidence } from "@/lib/queries";
import { NavHeader } from "@/components/shell/NavCapsule";
import { PageHeader } from "@/components/shell/PageHeader";
import { sectorMatches, METHODS } from "./Methods";
import { sectorStory } from "./sectorText";
import type { Cell } from "@/lib/envelope";
import { MapMotif } from "@/components/shell/MapMotif";
import { MotifCredit } from "@/components/shell/MotifCredit";
import { Loading } from "@/components/ui/RefusalCard";

type StreamCell = Cell & { module?: string };

export function SectorsIndex() {
  const { labels, dims } = useExplorer();
  const [query, setQuery] = useState("");
  const all = useEvidence("_", {});
  const streamsByModule = useMemo(() => {
    const m = new Map<string, StreamCell[]>();
    for (const c of (all.data?.values ?? []) as StreamCell[]) {
      const mod = c.module ?? "";
      m.set(mod, [...(m.get(mod) ?? []), c]);
    }
    return m;
  }, [all.data]);
  const searchable = !!(all.data || all.error);
  const visible = dims.sectors.filter((s) => sectorMatches(query, sectorLabel(labels, s), streamsByModule.get(s) ?? []));
  return (
    <div className="relative min-h-dvh" data-testid="sectors-index">
      <MapMotif />
      <NavHeader />
      <main className="mx-auto max-w-[1200px] px-5 pb-12 pt-4">
        <PageHeader title="Sectors" dek="How each sector's emissions are estimated - choose one to see its sources, method and gaps." />
        <label className="card mt-6 flex items-center gap-2 px-3 py-2" data-testid="search">
          <Search size={15} className="shrink-0 text-muted" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={METHODS.search} aria-label={METHODS.search} className="w-full bg-transparent text-sm text-fg outline-none" data-testid="search-input" />
          {/* a count is a result of the search, and the search is not over until the categories and sources are in */}
          {query && searchable && <span className="shrink-0 text-xs text-muted">{visible.length === 1 ? "one sector" : `${visible.length} sectors`}</span>}
        </label>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="browse">
          {visible.map((s) => (
            <Link key={s} href={`/methods/sectors/${s}`} className="rounded-xl border border-line bg-card px-4 py-3.5 transition-colors hover:bg-surface-3" data-testid="sector-tile" data-sector={s}>
              <div className="text-md font-semibold text-fg">{sectorLabel(labels, s)}</div>
              <div className="mt-1 text-xs text-muted">{sectorStory(s).dek}</div>
            </Link>
          ))}
          {/* The search reads the sector names at once and their categories and sources when the
              evidence arrives. "Nothing matches" used to be printed in between, of a list that had
              not been searched yet, and stayed when the request failed. */}
          {!visible.length && (all.data ? (
            <p className="col-span-full text-sm text-muted" data-testid="search-none">No sector, category or source matches.</p>
          ) : all.error ? (
            <p role="alert" className="col-span-full text-sm text-warn" data-testid="search-failed">No sector name matches. The categories and sources could not be loaded, so they were not searched; reload the page to try again.</p>
          ) : (
            <div className="col-span-full" data-testid="search-loading"><Loading what="the sectors’ categories and sources" /></div>
          ))}
        </div>
      <MotifCredit />
      </main>
    </div>
  );
}
