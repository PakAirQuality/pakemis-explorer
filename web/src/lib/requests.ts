/**
 * Every request body the Explorer sends is a pure function of the URL state (lib/urlState.ts):
 * same URL => same bodies => same receipts. `stateFromRequest` is the inverse the agent's
 * "show on map" and `/downloads?receipt=` use to put a request back on the map.
 * Field values here are the contract's own words (openapi descriptions): "annual" is the
 * GridCellRequest's word for the twelve-month sum; group keys name the release's columns.
 */
import type { CompareRequest, GridCellRequest, QueryAir, QueryEmissions, TimeseriesRequest } from "./api";
import { geoGrain } from "./geography";
import type { ExplorerState, Level } from "./urlState";

const GRID_ANNUAL = "annual";

/** Drop empty strings and empty arrays so an unset filter never appears in the request. */
function compact<T extends Record<string, unknown>>(body: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as T;
}

/** The filters shared by every query of the scope (no geography). */
export function scopeBody(s: Pick<ExplorerState, "period" | "config" | "gwp" | "sector" | "gas" | "month">): QueryEmissions {
  return compact({
    periods: [s.period],
    configuration_id: s.config,
    gwp_basis: s.gwp,
    sectors: s.sector ? [s.sector] : [],
    gases: s.gas ? [s.gas] : [],
    months: s.month ? [s.month] : [],
  });
}

export function adm1Body(s: ExplorerState): QueryEmissions {
  return compact({ ...scopeBody(s), geography_level: "adm1", spatial_view: s.view, group_by: ["province"] });
}

export function adm2Body(s: ExplorerState): QueryEmissions {
  return compact({ ...scopeBody(s), geography_level: "adm2", spatial_view: s.view, group_by: ["shape_id"] });
}

/** The choropleth's request for the level, or null at grid level (the raster is visual only). */
export function mapBody(s: ExplorerState): QueryEmissions | null {
  if (s.level === "adm1") return adm1Body(s);
  if (s.level === "adm2") return adm2Body(s);
  return null;
}

/**
 * The air choropleth request: one pollutant on the nine-year spatial family (rc49) - the
 * year slider's period rides the request, and provinces/districts answer for any of the
 * nine fiscal years on the covered-sources scope (six sectors; power's screening bound
 * ships beside the panel, never silently inside a map). No month or GWP: the air tables
 * are native kilotonnes.
 */
export function airMapBody(s: Pick<ExplorerState, "level" | "pol" | "period">): QueryAir | null {
  if (!s.pol) return null;
  const period = s.period ? { periods: [s.period] } : {};
  if (s.level === "adm1") return { pollutants: [s.pol], geography_level: "adm1", ...period, group_by: ["province"] };
  if (s.level === "adm2") return { pollutants: [s.pol], geography_level: "adm2", ...period, group_by: ["shape_id"] };
  return null;
}

export function parseCell(cell: string | null): { lat: number; lon: number } | null {
  if (!cell) return null;
  const [a, b] = cell.split(",").map((x) => Number(x));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { lat: a, lon: b };
}

export function gridCellBody(s: ExplorerState, at?: { lat: number; lon: number } | null): GridCellRequest {
  const p = at ?? parseCell(s.cell);
  return compact({
    ...(p ? { lat: p.lat, lon: p.lon } : {}),
    gas: s.gas ?? "",
    month: s.month ?? GRID_ANNUAL,
    configuration_id: s.config,
  });
}

export type LineageRequest = { id: string; params: { month?: string; gas?: string; configuration_id?: string } };

export type DetailBodies =
  | { kind: "province"; id: string; total: QueryEmissions; byModule: QueryEmissions; byGas: QueryEmissions; byMonth: QueryEmissions; lineage: LineageRequest }
  | { kind: "district"; id: string; total: QueryEmissions; byModule: QueryEmissions; byGas: QueryEmissions; byMonth: QueryEmissions; lineage: LineageRequest }
  | { kind: "cell"; cell: GridCellRequest }
  | { kind: "none" };

/** The detail card's requests. `months` is the period's month list from dims.dim_month.by_period. */
export function detailBodies(s: ExplorerState, months: string[]): DetailBodies {
  if (s.level === "grid" && s.cell) return { kind: "cell", cell: gridCellBody(s) };
  if (!s.geo || s.level === "grid") return { kind: "none" };
  // the geo names the grain (a province selected while districts are displayed is
  // still a province) - the display level only says which polygons are on screen
  const level: Level = geoGrain(s.geo);
  const base = compact({ ...scopeBody(s), geography_level: level, geography_ids: [s.geo], spatial_view: s.view });
  const kind = level === "adm1" ? "province" : "district";
  return {
    kind,
    id: s.geo,
    total: base,
    byModule: compact({ ...base, group_by: ["module"] }),
    byGas: compact({ ...base, group_by: ["gas"] }),
    byMonth: compact({ ...base, months, group_by: ["month"] }),
    lineage: {
      id: s.geo,
      params: compact({
        // a province's full lineage is ~10,000 rows; one month keeps it readable
        month: s.month ?? (kind === "province" ? months[0] : undefined),
        gas: s.gas ?? undefined,
        configuration_id: s.config,
      }),
    },
  };
}

export function compareBody(s: ExplorerState, left: Partial<QueryEmissions>, right: Partial<QueryEmissions>, mode: "absolute" | "relative" = "absolute"): CompareRequest {
  const base = compact({ gwp_basis: s.gwp, sectors: s.sector ? [s.sector] : [], gases: s.gas ? [s.gas] : [] });
  return { left: compact({ ...base, ...left }), right: compact({ ...base, ...right }), mode };
}

export function seriesBody(s: Pick<ExplorerState, "config" | "gwp" | "sector" | "gas">, step: "annual" | "monthly" = "annual"): TimeseriesRequest {
  return { query: compact({ configuration_id: s.config, gwp_basis: s.gwp, sectors: s.sector ? [s.sector] : [], gases: s.gas ? [s.gas] : [] }), step };
}

/** One sector's annual series under the configuration and GWP basis given, every gas (the intro's example). */
export function sectorSeriesBody(s: Pick<ExplorerState, "config" | "gwp">, sector: string): TimeseriesRequest {
  return seriesBody({ config: s.config, gwp: s.gwp, sector, gas: null });
}

/** The transport series: `get_timeseries`, `sectors: ["transport"]`, annual, under the configuration and GWP basis given. */
export function transportSeriesBody(s: Pick<ExplorerState, "config" | "gwp">): TimeseriesRequest {
  return sectorSeriesBody(s, "transport");
}

/**
 * What is selected, from the URL state alone: Pakistan when nothing is, else the province
 * (`adm1`), the district shape (`adm2`) or the grid cell. The selection drawer's own function,
 * lifted here on 2026-08-30 when the drawer was absorbed into the deck's cards, so the request
 * map has one home and one copy.
 */
export type Selection = { kind: "national" } | { kind: "province"; id: string } | { kind: "district"; id: string } | { kind: "cell"; id: string };

export function selectionOf(s: ExplorerState): Selection {
  if (s.level === "grid") return s.cell ? { kind: "cell", id: s.cell } : { kind: "national" };
  if (!s.geo) return { kind: "national" };
  return geoGrain(s.geo) === "adm1" ? { kind: "province", id: s.geo } : { kind: "district", id: s.geo };
}

export type DrawerBodies = {
  selection: Selection;
  total: QueryEmissions;
  bySector: QueryEmissions;
  sectorKey: "sector_id" | "module";
  byView: QueryEmissions | null;
  series: TimeseriesRequest;
  lineage: LineageRequest | null;
  /** The province envelope (every province) whose `unallocated` and `derived` blocks the placement card quotes; the map's own request at ADM1. */
  provinces: QueryEmissions;
  cell: GridCellRequest | null;
};

/**
 * The selected geography's requests, a pure function of the URL state: the total, the one-key
 * sector breakdown (`sector_id` at national grain, `module` at ADM grain — the release carries
 * `sector_id` nationally only), the spatial-view breakdown at ADM grain, the annual series
 * (refused by the release off the national scope, shown by name), the lineage at ADM grain and
 * the province envelope whose `derived` carries the placed / unallocated strings.
 */
export function drawerBodies(s: ExplorerState, months: string[]): DrawerBodies {
  const selection = selectionOf(s);
  const provinces = adm1Body(s);
  if (selection.kind === "province" || selection.kind === "district") {
    const d = detailBodies({ ...s, cell: null }, months);
    if (d.kind === "province" || d.kind === "district") {
      return {
        selection,
        total: d.total,
        bySector: d.byModule,
        sectorKey: "module",
        byView: { ...d.total, group_by: ["spatial_view"] },
        series: { query: { configuration_id: s.config, gwp_basis: s.gwp, ...(s.sector ? { sectors: [s.sector] } : {}), ...(s.gas ? { gases: [s.gas] } : {}), geography_level: selection.kind === "province" ? "adm1" : "adm2", geography_ids: [selection.id], spatial_view: s.view }, step: "annual" },
        lineage: d.lineage,
        provinces,
        cell: null,
      };
    }
  }
  const national = scopeBody(s);
  return {
    selection,
    total: national,
    bySector: { ...national, group_by: ["sector_id"], order_by: "value desc" },
    sectorKey: "sector_id",
    byView: null,
    series: seriesBody(s),
    lineage: null,
    provinces,
    cell: selection.kind === "cell" ? gridCellBody(s) : null,
  };
}

/**
 * What the deck needs beyond the URL state to build its bodies: the period's month list
 * (`dims.dim_month.by_period`, from which the lineage request takes one month, since a whole
 * province's lineage runs to ~10,000 rows) and the ADM2 shape ids that partition the selected
 * district's own province — the peers card's partition, so the share and the order the server
 * returns are those of the province, not of the country.
 */
export type DeckDefaults = { months: string[]; peers: string[] };

/** The partition whose cells carry the snapshot's `share_pct_short` and `rank`, and the id to find in it. */
export type RankedIn = { body: QueryEmissions; key: "sector_id" | "gas" | "province" | "shape_id"; id: string };
/** The composition breakdown: one group key, chosen by the scope, never silently swapped for another. */
export type DeckBreakdown = { body: QueryEmissions; key: "sector_id" | "module" | "category" };

export type DeckBodies = {
  selection: Selection;
  /** The selected thing's own total: the country, the sector, the gas, the province or the district. */
  total: QueryEmissions;
  /**
   * The partition the snapshot quotes its share and rank from — the national sectors, the
   * national gases, the five provinces or the district's peers. Never a browser subtraction:
   * when the server attaches no `share_pct_short` or `rank` to those cells (an ADM2 partition
   * whose cells are bounded intervals), the snapshot prints neither.
   */
  ranked: RankedIn | null;
  /**
   * What the selection is made of. The key is the scope's, not the grain's: a chosen sector asks
   * for its IPCC `category` rows, and at ADM grain the release refuses that key by name — the
   * card shows the refusal rather than falling back to `module` behind the reader's back.
   */
  breakdown: DeckBreakdown;
  /** Every province in the current scope, ordered by value: the places card, and the province partition. */
  provinces: QueryEmissions;
  /** The districts of the selected district's province, ordered by value. */
  peers: QueryEmissions | null;
  /** The annual series in the current scope (the release refuses it off national grain, by name). */
  series: TimeseriesRequest;
  /** The selected geography's lineage rows (the evidence and sources cards). */
  lineage: LineageRequest | null;
};

/**
 * The deck's whole data plan for a state: one body per envelope the cards can ask for, built
 * from the same primitives the map and the old drawer use, so the same URL produces the same
 * bodies and therefore the same receipts. Which of them are actually fetched is the deck's
 * business (a collapsed card asks for nothing); which cards are shown is cards.ts's.
 */
export function deckBodies(s: ExplorerState, defaults: DeckDefaults): DeckBodies {
  const d = drawerBodies(s, defaults.months);
  const selection = d.selection;
  const placed = selection.kind === "province" || selection.kind === "district";
  const geography = placed ? { geography_level: selection.kind === "province" ? "adm1" : "adm2", geography_ids: [selection.id], spatial_view: s.view } : {};
  const key: DeckBreakdown["key"] = s.sector ? "category" : placed ? "module" : "sector_id";
  const provinces = compact({ ...adm1Body(s), order_by: "value desc" });
  const peers =
    selection.kind === "district" && defaults.peers.length
      ? compact({ ...scopeBody(s), geography_level: "adm2", geography_ids: defaults.peers, spatial_view: s.view, group_by: ["shape_id"], order_by: "value desc" })
      : null;
  const ranked: RankedIn | null =
    selection.kind === "province"
      ? { body: provinces, key: "province", id: selection.id }
      : selection.kind === "district"
        ? peers
          ? { body: peers, key: "shape_id", id: selection.id }
          : null
        : s.sector
          ? { body: compact({ ...scopeBody({ ...s, sector: null }), group_by: ["sector_id"], order_by: "value desc" }), key: "sector_id", id: s.sector }
          : s.gas
            ? { body: compact({ ...scopeBody({ ...s, gas: null }), group_by: ["gas"], order_by: "value desc" }), key: "gas", id: s.gas }
            : null;
  return {
    selection,
    total: d.total,
    ranked,
    breakdown: { body: compact({ ...scopeBody(s), ...geography, group_by: [key], order_by: "value desc" }), key },
    provinces,
    peers,
    series: d.series,
    lineage: d.lineage,
  };
}

export type ContextBodies = { national: QueryEmissions; bySector: QueryEmissions; byGas: QueryEmissions; series: TimeseriesRequest; compareSL: CompareRequest | null };

/** The right column's requests for the scope. `survey` is the other queryable configuration (S) when it covers the period. */
export function contextBodies(s: ExplorerState, survey: { reference: string; survey: string } | null): ContextBodies {
  const national = scopeBody(s);
  return {
    national,
    bySector: compact({ ...national, group_by: ["sector_id"], order_by: "value desc" }),
    byGas: compact({ ...national, group_by: ["gas"] }),
    series: seriesBody(s),
    compareSL: survey
      ? compareBody(s, { periods: [s.period], configuration_id: survey.reference, group_by: ["sector_id"] }, { periods: [s.period], configuration_id: survey.survey, group_by: ["sector_id"] })
      : null,
  };
}



export type NamedRequest = { name: string; body: Record<string, unknown> };

/** The map-facing request of a state (the choropleth's, or the grid cell's at grid level). */
export function requestFromState(s: ExplorerState): NamedRequest {
  if (s.level === "grid") return { name: "get_grid_cell", body: gridCellBody(s) as Record<string, unknown> };
  return { name: "query_emissions", body: (mapBody(s) ?? {}) as Record<string, unknown> };
}

const TYPE_TO_NAME: Record<string, string> = {
  QueryEmissions: "query_emissions",
  GridCellRequest: "get_grid_cell",
  SpatialLineageRequest: "get_spatial_lineage",
  CompareRequest: "compare_emissions",
  TimeseriesRequest: "get_timeseries",
};

function first(v: unknown): string | null {
  return Array.isArray(v) && typeof v[0] === "string" ? v[0] : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length ? v : null;
}

/**
 * The inverse: the URL-state fields a request pins down. Fields a request does not carry are
 * left out (the caller merges over the current state); a national query pins no level.
 */
export function stateFromRequest(req: NamedRequest): Partial<ExplorerState> {
  const name = TYPE_TO_NAME[req.name] ?? req.name;
  const b = req.body;
  const out: Partial<ExplorerState> = {};
  if (name === "query_emissions") {
    const level = str(b.geography_level);
    if (level === "adm1" || level === "adm2") out.level = level;
    const period = first(b.periods);
    if (period) out.period = period;
    const config = str(b.configuration_id);
    if (config) out.config = config;
    const gwp = str(b.gwp_basis);
    if (gwp) out.gwp = gwp;
    const view = str(b.spatial_view);
    if (view) out.view = view;
    out.sector = first(b.sectors);
    out.gas = first(b.gases);
    out.month = first(b.months);
    const geo = first(b.geography_ids);
    if (geo) out.geo = geo;
    if (level === "adm1" || level === "adm2") out.cell = null;
    return out;
  }
  if (name === "get_grid_cell") {
    out.level = "grid";
    const gas = str(b.gas);
    if (gas) out.gas = gas;
    const month = str(b.month);
    out.month = month && month !== GRID_ANNUAL ? month : null;
    const config = str(b.configuration_id);
    if (config) out.config = config;
    if (typeof b.lat === "number" && typeof b.lon === "number") out.cell = `${b.lat},${b.lon}`;
    return out;
  }
  if (name === "get_spatial_lineage") {
    const shape = str(b.shape_id);
    const province = str(b.province);
    if (shape) {
      out.level = "adm2";
      out.geo = shape;
    } else if (province) {
      out.level = "adm1";
      out.geo = province;
    }
    const month = str(b.month);
    if (month) out.month = month;
    const gas = str(b.gas);
    if (gas) out.gas = gas;
    const config = str(b.configuration_id);
    if (config) out.config = config;
    return out;
  }
  if (name === "get_timeseries" && b.query && typeof b.query === "object") {
    return stateFromRequest({ name: "query_emissions", body: b.query as Record<string, unknown> });
  }
  if (name === "compare_emissions" && b.left && typeof b.left === "object") {
    return stateFromRequest({ name: "query_emissions", body: b.left as Record<string, unknown> });
  }
  return out;
}

export type ApiCall = { method: "GET" | "POST"; path: string; body: string | null };

/** The six functions the API takes as a POST body, by the envelope's `request_type`. */
const POST_ROUTES: Record<string, string> = {
  query_emissions: "/query/emissions",
  compare_emissions: "/query/compare",
  get_timeseries: "/query/timeseries",
  get_uncertainty: "/query/uncertainty",
  get_completeness: "/query/completeness",
  get_grid_cell: "/spatial/grid",
};

function query(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v.length) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * The canonical request as a body that reproduces the same receipt: the fields the contract
 * filled by default (those named in `defaults_applied`, at every level: a timeseries' `query`,
 * a compare's `left` and `right`) are left out together with the list itself, so the API
 * applies the same defaults again and canonicalises to the same request. Posting the canonical
 * form verbatim would fill those fields explicitly, apply no default, and hash differently.
 */
export function replayBody(fields: unknown): unknown {
  if (Array.isArray(fields)) return fields.map(replayBody);
  if (!fields || typeof fields !== "object") return fields;
  const obj = fields as Record<string, unknown>;
  const defaulted = new Set(Array.isArray(obj.defaults_applied) ? obj.defaults_applied.map(String) : []);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "defaults_applied" || defaulted.has(k)) continue;
    out[k] = replayBody(v);
  }
  return out;
}

/**
 * The HTTP call that reproduces an envelope, from its `request_type` and canonical `request`
 * (the JSON the envelope carries, `_type` included: the API accepts it as posted). The six
 * POST functions post the replay body (`replayBody`) to their route; the four GET functions
 * take their fields as path and query; any other type is addressed by its receipt. The path is
 * relative to the prefixed API base; nothing here is a credential.
 */
export function apiCallOf(requestType: string, request: string, receipt: string): ApiCall {
  let fields: Record<string, unknown> = {};
  let body = request;
  try {
    fields = JSON.parse(request) as Record<string, unknown>;
    body = JSON.stringify(replayBody(fields));
  } catch {
    /* an unparseable request is posted verbatim */
  }
  const post = POST_ROUTES[requestType];
  if (post) return { method: "POST", path: post, body };
  if (requestType === "get_spatial_lineage") return { method: "GET", path: `/spatial/lineage/${encodeURIComponent(str(fields.shape_id) ?? str(fields.province) ?? "")}${query({ month: fields.month, gas: fields.gas, configuration_id: fields.configuration_id })}`, body: null };
  if (requestType === "get_evidence") return { method: "GET", path: `/evidence/${encodeURIComponent(str(fields.source_stream_id) ?? "_")}${query({ module: fields.module, category: fields.category })}`, body: null };
  if (requestType === "get_method") return { method: "GET", path: `/method/${encodeURIComponent(str(fields.method_id) ?? str(fields.category) ?? "")}`, body: null };
  if (requestType === "get_cross_sector_transfer") return { method: "GET", path: `/transfers${query({ ledger_id: fields.ledger_id, configuration_id: fields.configuration_id })}`, body: null };
  return { method: "GET", path: `/receipt/${receipt}`, body: null };
}

/** The call as one curl line against the base given (the JSON body single-quoted; JSON holds no single quote). */
export function curlLine(base: string, call: ApiCall): string {
  if (call.method === "POST") return `curl -X POST ${base}${call.path} -H 'content-type: application/json' -d '${call.body ?? ""}'`;
  return `curl ${base}${call.path}`;
}

/** The same inverse for an envelope: its `request` field is the canonical JSON with `_type`. */
export function stateFromEnvelopeRequest(requestJson: string): Partial<ExplorerState> {
  try {
    const body = JSON.parse(requestJson) as Record<string, unknown>;
    const type = str(body._type) ?? "";
    return stateFromRequest({ name: type, body });
  } catch {
    return {};
  }
}
