/**
 * The card selector, exhaustively: every URL state resolves to exactly one scope, every scope to
 * exactly one ordered card set, and the mapping is the one the product decided — so a card that
 * appears or disappears from a scope shows up here as a diff and not as a surprise on the page.
 */
import { describe, expect, it } from "vitest";
import { CARD_IDS, SCOPE_KINDS, cardsFor, placeIdOf, scopeOf, type CardId, type Scope, type ScopeKind } from "./cards";
import { resolveState, type ExplorerState, type RawState } from "@/lib/urlState";

const DEFAULTS = { period_id: "FY2023-24", configuration_id: "REF_2023_24", gwp_basis: "AR5", spatial_view: "all", grid_gas: "CO2" };
const state = (raw: Partial<RawState> = {}): ExplorerState => resolveState(raw, DEFAULTS);

describe("the scope a state resolves to", () => {
  it("Pakistan, all sectors, all gases", () => {
    expect(scopeOf(state())).toEqual({ kind: "national" });
    expect(scopeOf(state({ level: "adm1" }))).toEqual({ kind: "national" });
    expect(scopeOf(state({ level: "adm2" }))).toEqual({ kind: "national" });
  });
  it("a sector chosen, then a gas chosen; the sector is the more specific of the two", () => {
    expect(scopeOf(state({ sector: "power" }))).toEqual({ kind: "sector", sector: "power" });
    expect(scopeOf(state({ gas: "CH4" }))).toEqual({ kind: "gas", gas: "CH4" });
    expect(scopeOf(state({ sector: "power", gas: "CH4" }))).toEqual({ kind: "sector", sector: "power" });
  });
  it("a selected place wins over a chosen sector or gas: the cards are the place's, the filters re-scope them", () => {
    // a shape id is digit-prefixed in the frozen frame (geoGrain); "60131773B…" is Lahore's shape
    expect(scopeOf(state({ geo: "Punjab" }))).toEqual({ kind: "province", geo: "Punjab" });
    expect(scopeOf(state({ level: "adm2", geo: "60131773B12131197496886" }))).toEqual({ kind: "district", geo: "60131773B12131197496886" });
    expect(scopeOf(state({ geo: "Punjab", sector: "power", gas: "CH4" }))).toEqual({ kind: "province", geo: "Punjab" });
    expect(scopeOf(state({ level: "adm2", geo: "60131773B12131197496886", sector: "power" }))).toEqual({ kind: "district", geo: "60131773B12131197496886" });
  });
  it("the geo names its own grain: a province stays the scope while districts are displayed (click-drills-down)", () => {
    expect(scopeOf(state({ level: "adm2", geo: "Punjab" }))).toEqual({ kind: "province", geo: "Punjab" });
    expect(scopeOf(state({ level: "adm1", geo: "60131773B12131197496886" }))).toEqual({ kind: "district", geo: "60131773B12131197496886" });
  });
  it("a grid cell is not a place the deck answers: the scope is never a province or a district there", () => {
    // at grid level the release fills the gas itself (`grid_gas`), so a bare grid state reads as that gas
    expect(scopeOf(state({ level: "grid", geo: "Punjab" }))).toEqual({ kind: "gas", gas: "CO2" });
    expect(scopeOf(state({ level: "grid", sector: "power" }))).toEqual({ kind: "sector", sector: "power" });
    for (const raw of [{ level: "grid" as const }, { level: "grid" as const, geo: "Punjab" }, { level: "grid" as const, cell: "31,74" }]) {
      expect(["province", "district"]).not.toContain(scopeOf(state(raw)).kind);
    }
  });
  it("the year is not part of the scope: off the reference year the cards are the same ones", () => {
    expect(scopeOf(state({ period: "FY2020-21" }))).toEqual({ kind: "national" });
    expect(cardsFor(scopeOf(state({ period: "FY2020-21" })))).toEqual(cardsFor(scopeOf(state())));
  });
  it("the place id of a scope is the geography, and nothing else", () => {
    expect(placeIdOf({ kind: "national" })).toBeNull();
    expect(placeIdOf({ kind: "sector", sector: "power" })).toBeNull();
    expect(placeIdOf({ kind: "gas", gas: "CH4" })).toBeNull();
    expect(placeIdOf({ kind: "province", geo: "Punjab" })).toBe("Punjab");
    expect(placeIdOf({ kind: "district", geo: "SHAPE" })).toBe("SHAPE");
  });
});

const SCOPES: Record<ScopeKind, Scope> = {
  national: { kind: "national" },
  sector: { kind: "sector", sector: "power" },
  gas: { kind: "gas", gas: "CH4" },
  province: { kind: "province", geo: "Punjab" },
  district: { kind: "district", geo: "SHAPE" },
};

describe("the card set of each scope", () => {
  const EXPECTED: Record<ScopeKind, CardId[]> = {
    national: ["overview", "sectors", "places"],
    sector: ["snapshot", "categories", "trend", "places"],
    gas: ["snapshot", "sectors", "trend"],
    province: ["snapshot", "composition", "peers", "placement"],
    district: ["snapshot", "composition", "peers", "evidence", "sources"],
  };
  for (const kind of SCOPE_KINDS) {
    it(`${kind}: ${EXPECTED[kind].join(" · ")}`, () => {
      expect(cardsFor(SCOPES[kind])).toEqual(EXPECTED[kind]);
    });
  }
  it("every scope leads with its overview (the national one the merged panel), and the two lineage cards belong to a district alone", () => {
    for (const kind of SCOPE_KINDS) expect(cardsFor(SCOPES[kind])[0]).toBe(kind === "national" ? "overview" : "snapshot");
    for (const kind of SCOPE_KINDS) {
      const has = cardsFor(SCOPES[kind]).filter((id) => id === "evidence" || id === "sources");
      expect(has, kind).toEqual(kind === "district" ? ["evidence", "sources"] : []);
    }
  });
  it("every card id the deck knows is reachable from some scope, and no set names an unknown card", () => {
    const shown = new Set(SCOPE_KINDS.flatMap((k) => cardsFor(SCOPES[k])));
    expect([...shown].sort()).toEqual([...CARD_IDS].sort());
    for (const kind of SCOPE_KINDS) for (const id of cardsFor(SCOPES[kind])) expect(CARD_IDS, `${kind}/${id}`).toContain(id);
  });
  it("the returned array is the caller's own: mutating it does not change the next answer", () => {
    const first = cardsFor(SCOPES.national);
    first.pop();
    expect(cardsFor(SCOPES.national)).toEqual(["overview", "sectors", "places"]);
  });
  it("a set never repeats a card", () => {
    for (const kind of SCOPE_KINDS) {
      const ids = cardsFor(SCOPES[kind]);
      expect(new Set(ids).size, kind).toBe(ids.length);
    }
  });
});
