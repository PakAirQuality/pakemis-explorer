"use client";
/**
 * WHERE AN ANSWER'S LINKS GO. The server sends `<plink to="downloads:activity">Downloads</plink>`
 * only for a link it checked (api/pakemis_api/ask/render.py): the Downloads page, one of its
 * sections, or the entry of a table the release serves. This turns `to` into a route on this site -
 * never an address the model wrote - and, for a table, the title the Downloads page gives it.
 *
 * It also lists the downloads an answer's figures were read from: every tool result names its
 * source tables (`source_tables`, from the envelope's provenance), and the ones the Downloads page
 * offers become the answer's "Data" line.
 */
import { useMemo } from "react";
import { COLLECTION_IDS, collectionsFor, type Collection, type Download } from "@/components/downloads/catalogue";
import { useProducts } from "@/lib/products";
import type { TimelineItem } from "./types";

export type ResolvedLink = { href: string; label: string };

const SECTIONS: readonly string[] = COLLECTION_IDS;
const DOWNLOADS_LABEL = "Downloads";

/** The page's download whose files are this table (CSV or otherwise), if the page offers one. */
export function downloadForTable(collections: Collection[], table: string): Download | null {
  for (const c of collections) {
    for (const d of c.downloads) {
      if (!d.pending && d.files.some((f) => f.replace(/\.[^.]+$/, "") === table)) return d;
    }
  }
  return null;
}

/**
 * A checked link's route and words, or null for a `to` this site does not know - which the
 * renderer then prints as plain text rather than as a link to nowhere.
 */
export function resolveLink(to: string, label: string, collections: Collection[]): ResolvedLink | null {
  if (to === "downloads") return { href: "/downloads", label: label || DOWNLOADS_LABEL };
  if (to.startsWith("downloads:")) {
    const section = to.slice("downloads:".length);
    return SECTIONS.includes(section) ? { href: `/downloads?show=${section}`, label: label || DOWNLOADS_LABEL } : null;
  }
  if (to.startsWith("file:")) {
    const d = downloadForTable(collections, to.slice("file:".length));
    // a table the release serves but the page does not list: the page itself, by its own name
    return d ? { href: `/downloads?item=${encodeURIComponent(d.id)}`, label: d.title } : { href: "/downloads", label: DOWNLOADS_LABEL };
  }
  return null;
}

/** The downloads this turn's figures were read from, each once, in the order first used. */
export function dataFilesOf(items: TimelineItem[], collections: Collection[]): Download[] {
  const out: Download[] = [];
  for (const item of items) {
    if (item.kind !== "tool" || !item.result) continue;
    for (const table of item.result.source_tables ?? []) {
      const d = downloadForTable(collections, table);
      if (d && !out.includes(d)) out.push(d);
    }
  }
  return out;
}

/** The Downloads page's collections: the release's own catalogue when it serves one, else the page's. */
export function useDownloadCollections(): Collection[] {
  const products = useProducts();
  return useMemo(() => collectionsFor(products.data?.download_catalog), [products.data?.download_catalog]);
}
