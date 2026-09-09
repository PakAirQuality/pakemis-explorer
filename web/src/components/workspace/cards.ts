/**
 * Which cards the insight deck shows, as a pure function of what is selected. The deck does not
 * hard-code a card list per page: it reads the URL state, resolves it to one `Scope` and asks
 * `cardsFor` for the ordered card ids. One rule per card — what is selected · what explains it ·
 * how it compares — so the mapping below is the whole product decision, inspectable in one place
 * and covered by cards.test.ts.
 *
 * The scope is resolved in one order, most specific first: a selected place (a district at
 * `adm2` grain, a province at `adm1`) wins over a chosen sector, which wins over a chosen gas.
 * A sector or a gas chosen WITH a place selected does not change the card set — it stays the
 * place's — but it does re-scope every request behind those cards (lib/requests.ts deckBodies),
 * which is why the composition card asks for a sector's IPCC categories at ADM grain, where the
 * release refuses that key by name rather than silently answering with modules.
 *
 * Nothing here fetches, computes or prints a number; the words live in overview/copy.ts.
 */
import { geoGrain } from "@/lib/geography";
import type { ExplorerState } from "@/lib/urlState";

/** Every card the deck can show. The id is also the card's `data-testid` stem and its collapse key. */
export const CARD_IDS = ["overview", "snapshot", "sectors", "categories", "trend", "places", "composition", "peers", "placement", "evidence", "sources"] as const;
export type CardId = (typeof CARD_IDS)[number];

export type Scope =
  | { kind: "national" }
  | { kind: "sector"; sector: string }
  | { kind: "gas"; gas: string }
  | { kind: "province"; geo: string }
  | { kind: "district"; geo: string };
export type ScopeKind = Scope["kind"];
export const SCOPE_KINDS = ["national", "sector", "gas", "province", "district"] as const;

/**
 * The scope of the current URL state. A `geo` carries a province name OR an ADM2 shape id and
 * NAMES ITS OWN GRAIN (lib/geography geoGrain): clicking Punjab descends the map to districts
 * while the deck stays Punjab's, and the next click - a district - makes it that district's.
 * At grid level (no polygon selection the deck can answer) the scope is the country.
 */
export function scopeOf(s: Pick<ExplorerState, "level" | "geo" | "sector" | "gas">): Scope {
  if (s.geo && s.level !== "grid") {
    return geoGrain(s.geo) === "adm2" ? { kind: "district", geo: s.geo } : { kind: "province", geo: s.geo };
  }
  if (s.sector) return { kind: "sector", sector: s.sector };
  if (s.gas) return { kind: "gas", gas: s.gas };
  return { kind: "national" };
}

/**
 * The card set of each scope, in the order the deck stacks them.
 *
 * · Pakistan, all sectors, all gases — the total, where it comes from, how it changed, where it
 *   is placed.
 * · A sector — its total against the national partition, its IPCC categories, its own series,
 *   its provincial split.
 * · A gas — its total against the gas partition, which sectors emit it, its own series. No
 *   placement card: the release's placed / unallocated strings are a property of the geography,
 *   not of the gas.
 * · A province — its total, share and rank from the province partition, what it is made of, the
 *   five provinces ranked, and what the province retains unplaced.
 * · A district — its total, what it is made of, its peers within its own province, then the two
 *   cards the map drawer used to carry: the spatial evidence of the allocation and its sources.
 *
 * Off the reference year nothing here changes: the national cards are asked as usual and each
 * spatial card carries the release's own typed refusal instead of a figure.
 */
const CARDS: Record<ScopeKind, readonly CardId[]> = {
  // one LARGE panel nationally (the atlas pattern): figure + nine-year rail +
  // series + the three gases, folding the old snapshot and trend cards into it
  national: ["overview", "sectors", "places"],
  sector: ["snapshot", "categories", "trend", "places"],
  gas: ["snapshot", "sectors", "trend"],
  province: ["snapshot", "composition", "peers", "placement"],
  district: ["snapshot", "composition", "peers", "evidence", "sources"],
};

export function cardsFor(scope: Scope): CardId[] {
  return [...CARDS[scope.kind]];
}

/** The place the scope is about, for the deck's header and the cards' titles; the caller names ids. */
export function placeIdOf(scope: Scope): string | null {
  return scope.kind === "province" || scope.kind === "district" ? scope.geo : null;
}
