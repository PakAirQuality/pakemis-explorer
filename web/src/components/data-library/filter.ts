import type { LibraryAsset } from "@/lib/products";

export const PAGE_SIZE = 50;
export const label = (value: string) => value === "ippu" ? "IPPU" : value === "gis" ? "Maps and geography" :
  value.replace(/[_-]/g, " ").replace(/^./, (letter) => letter.toUpperCase());

export function libraryPage(assets: LibraryAsset[], filters: { sector: string; purpose: string; q: string; page: number }) {
  const words = filters.q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = assets.filter((asset) => {
    if (filters.sector && asset.owner_sector !== filters.sector && !asset.sectors.includes(filters.sector)) return false;
    if (filters.purpose && asset.purpose !== filters.purpose) return false;
    const searchable = [asset.title, asset.description, asset.asset_id, ...asset.source_refs,
      ...(asset.columns ?? []).map((column) => column.name)].join(" ").toLocaleLowerCase();
    return words.every((word) => searchable.includes(word));
  }).sort((left, right) => left.title.localeCompare(right.title) || left.asset_id.localeCompare(right.asset_id));
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page), pages);
  return { items: matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: matches.length, pages, page };
}
