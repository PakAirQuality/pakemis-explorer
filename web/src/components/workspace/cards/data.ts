/**
 * The little readings of an envelope the cards share. Nothing here computes a figure: it only
 * puts the server's own cells in the server's own order and finds the one a scope is about.
 */
import type { Cell, Envelope } from "@/lib/envelope";

/**
 * The numeric cells of a one-key breakdown in rank order: the server's `rank` when every cell
 * carries one, else the order the envelope came in (the request asked `order_by: "value desc"`,
 * so that order is the server's too). The browser never sorts by value itself.
 */
export function rankedCells(env: Envelope | null | undefined): Cell[] {
  const cells = (env?.values ?? []).filter((c) => typeof c.value === "number");
  return cells.every((c) => typeof c.rank === "number") ? [...cells].sort((a, b) => (a.rank as number) - (b.rank as number)) : cells;
}

/** The cell of a partition whose group key holds `id` — the selected sector, gas, province or shape. */
export function cellFor(env: Envelope | null | undefined, key: string, id: string | null | undefined): Cell | null {
  if (!id) return null;
  return (env?.values ?? []).find((c) => c.group?.[key] === id) ?? null;
}

/** "agriculture" in running text: the label with its initial lowered unless it is an acronym. */
export function lowerName(name: string): string {
  return name.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
}
