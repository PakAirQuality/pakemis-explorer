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
export const CARD_IDS = ["overview", "sectors", "categories", "places", "composition", "peers", "placement", "evidence", "sources"] as const;
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
 * EVERY scope opens with the same overview panel (the atlas pattern): the figure, the nine-year
 * rail, the nine-year series with the server's change sentence, and the gas rail. Through
 * 2026-09-17 a sector, a province and a district opened with a single-year snapshot instead (a
 * sector with a separate trend card, a place with none), so clicking Punjab reduced nine years to
 * one; the panel now serves all five scopes, and the release answers its series at every grain
 * (fact_adm1_year / fact_adm2_year, AR5) - what it refuses (ADM2 under AR6) it refuses by name.
 *
 * · Pakistan, all sectors, all gases — the panel, where it comes from, where it is placed.
 * · A sector — the panel against the national partition, its IPCC categories, its provincial split.
 * · A gas — the panel against the gas partition, which sectors emit it. No placement card: the
 *   release's placed / unallocated strings are a property of the geography, not of the gas.
 * · A province — the panel with its share and rank from the province partition, what it is made
 *   of, the five provinces ranked, and what the province retains unplaced.
 * · A district — the panel (a bounded total, no share), what it is made of, its peers within its
 *   own province, then the two cards the map drawer used to carry: the spatial evidence of the
 *   allocation and its sources.
 *
 * Off the reference year nothing here changes: the cards are asked as usual and each card the
 * release cannot answer carries its own typed refusal instead of a figure.
 */
const CARDS: Record<ScopeKind, readonly CardId[]> = {
  national: ["overview", "sectors", "places"],
  sector: ["overview", "categories", "places"],
  gas: ["overview", "sectors"],
  province: ["overview", "composition", "peers", "placement"],
  district: ["overview", "composition", "peers", "evidence", "sources"],
};

export function cardsFor(scope: Scope): CardId[] {
  return [...CARDS[scope.kind]];
}

/** The place the scope is about, for the deck's header and the cards' titles; the caller names ids. */
export function placeIdOf(scope: Scope): string | null {
  return scope.kind === "province" || scope.kind === "district" ? scope.geo : null;
}
