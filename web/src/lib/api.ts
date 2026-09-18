/**
 * The typed client. Every function returns an Envelope validated by zod; a 422 becomes a
 * thrown `RefusalError` carrying the typed refusal. Request bodies are the generated OpenAPI
 * types (src/types.gen.ts), so a body that diverges from the contract fails to compile.
 */
import { EnvelopeSchema, RefusalSchema, ReleaseSchema, type Envelope, type Refusal, type ReleaseInfo } from "./envelope";
import { authedFetch } from "./embedAuth";
import type { components } from "@/types.gen";

/** Every request field has a contract default server-side, so a body may omit any of them. */
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type QueryEmissions = DeepPartial<components["schemas"]["QueryEmissions"]>;
export type QueryAir = DeepPartial<components["schemas"]["QueryAir"]>;
export type CompareRequest = DeepPartial<components["schemas"]["CompareRequest"]>;
export type TimeseriesRequest = DeepPartial<components["schemas"]["TimeseriesRequest"]>;
export type UncertaintyRequest = DeepPartial<components["schemas"]["UncertaintyRequest"]>;
export type CompletenessRequest = DeepPartial<components["schemas"]["CompletenessRequest"]>;
export type GridCellRequest = DeepPartial<components["schemas"]["GridCellRequest"]>;

/** The route prefix every PakEmis route lives under (the same prefix the Firebase rewrite forwards). */
export const API_PREFIX = "/api/v1/emissions";
const DEFAULT_API_BASE = `http://localhost:8000${API_PREFIX}`;

/**
 * The API base URL, prefix included: `NEXT_PUBLIC_API_BASE` (an absolute URL, or a same-origin
 * path such as `/api/v1/emissions` behind the hosting rewrite); for one release the old
 * `NEXT_PUBLIC_PAKEMIS_API` (the bare origin of the `/v1/*` era) still resolves, with the
 * prefix appended; else the local API. Trailing slashes are dropped so `${API_BASE}/release`
 * is always one path.
 */
export function resolveApiBase(env: { NEXT_PUBLIC_API_BASE?: string; NEXT_PUBLIC_PAKEMIS_API?: string }): string {
  const strip = (s: string) => s.trim().replace(/\/+$/, "");
  if (env.NEXT_PUBLIC_API_BASE?.trim()) return strip(env.NEXT_PUBLIC_API_BASE);
  if (env.NEXT_PUBLIC_PAKEMIS_API?.trim()) return `${strip(env.NEXT_PUBLIC_PAKEMIS_API)}${API_PREFIX}`;
  return DEFAULT_API_BASE;
}

// Next.js inlines NEXT_PUBLIC_* only when each is read as a literal `process.env.NAME`.
export const API_BASE = resolveApiBase({ NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE, NEXT_PUBLIC_PAKEMIS_API: process.env.NEXT_PUBLIC_PAKEMIS_API });

const isAbsolute = (s: string) => /^https?:\/\//i.test(s);

/**
 * The base as an absolute URL: a same-origin base (`/api/v1/emissions`) is resolved against
 * the page's origin. Mapbox GL is handed absolute source URLs so nothing is resolved against a
 * style URL; in Node (tests, the export build) a relative base is returned as is.
 */
export function absoluteApiBase(base: string = API_BASE): string {
  if (isAbsolute(base)) return base;
  return typeof window !== "undefined" ? `${window.location.origin}${base.startsWith("/") ? "" : "/"}${base}` : base;
}

/**
 * An API-returned path (the Ask dock's `download.csv`, a link in a payload) as a URL. A path
 * already under the prefix, or under the one-release `/v1/` alias, is joined to the base's
 * origin; anything else is taken relative to the base; an absolute URL passes through.
 */
export function apiUrl(path: string, base: string = API_BASE): string {
  if (isAbsolute(path)) return path;
  const abs = absoluteApiBase(base);
  const origin = isAbsolute(abs) ? new URL(abs).origin : "";
  const prefix = (isAbsolute(abs) ? new URL(abs).pathname : abs).replace(/\/+$/, "");
  if (prefix && path.startsWith(`${prefix}/`)) return `${origin}${path}`;
  if (path.startsWith("/v1/")) return `${origin}${path}`;
  return `${abs}${path.startsWith("/") ? "" : "/"}${path}`;
}

export class RefusalError extends Error {
  refusal: Refusal;
  constructor(refusal: Refusal) {
    super(`${refusal.error_class}: ${refusal.message}`);
    this.refusal = refusal;
  }
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  // authedFetch IS fetch in the public build; in an embedded one it carries the reader's identity
  const res = await authedFetch(`${API_BASE}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (res.status === 422) {
    const body = await res.json();
    const refusal = RefusalSchema.safeParse(body);
    if (refusal.success) throw new RefusalError(refusal.data);
    throw new Error(`422: ${JSON.stringify(body)}`);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return res.json();
}

async function envelope(path: string, init?: RequestInit): Promise<Envelope> {
  return EnvelopeSchema.parse(await call(path, init));
}

function post(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

/** The URL of a receipt: the /downloads page replays it (static export has no dynamic /r/<receipt> route; /data redirects there). */
export function receiptHref(receipt: string): string {
  return `/downloads?receipt=${encodeURIComponent(receipt)}`;
}

/**
 * The claim record behind one number: `GET /claim?receipt=<r>&cell=<n>` (or `?row_ids=a,b,c`).
 * A typed 4xx (`no_rows` for a compare difference cell, `unknown_cell`, `unknown_receipt`,
 * `GrainUnavailable`) becomes a thrown `RefusalError`; the route's own 422 shape
 * (`{detail: {error, message}}`) is read into the same Refusal, its error id kept and the
 * class spelled from it. The record is returned as received: every field a string from the
 * release's tables; nothing here computes.
 */
export type ClaimSelector = { receipt: string; cell: number } | { row_ids: string[] };

export function claimPath(selector: ClaimSelector): string {
  const params = "row_ids" in selector ? new URLSearchParams({ row_ids: selector.row_ids.join(",") }) : new URLSearchParams({ receipt: selector.receipt, cell: String(selector.cell) });
  return `/claim?${params}`;
}

function refusalFromDetail(body: unknown): Refusal | null {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (!detail || typeof detail !== "object") return null;
  const d = detail as { error?: unknown; error_class?: unknown; message?: unknown; limitation_id?: unknown };
  if (typeof d.error !== "string" || typeof d.message !== "string") return null;
  const spelled = d.error.split("_").map((w) => w.replace(/^\w/, (c) => c.toUpperCase())).join("");
  return { error: d.error, error_class: typeof d.error_class === "string" ? d.error_class : spelled, message: d.message, limitation_id: typeof d.limitation_id === "string" ? d.limitation_id : null, detail: {} };
}

export async function fetchClaim(selector: ClaimSelector): Promise<unknown> {
  const path = claimPath(selector);
  const res = await authedFetch(`${API_BASE}${path}`, { headers: { accept: "application/json" } });
  if (res.status >= 400 && res.status < 500) {
    const body = await res.json().catch(() => null);
    const refusal = RefusalSchema.safeParse(body);
    if (refusal.success) throw new RefusalError(refusal.data);
    const fromDetail = refusalFromDetail(body);
    if (fromDetail) throw new RefusalError(fromDetail);
    throw new Error(`${res.status}: ${JSON.stringify(body)}`);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return res.json();
}

export const api = {
  release: async (): Promise<ReleaseInfo> => ReleaseSchema.parse(await call("/release")),
  claim: fetchClaim,
  queryEmissions: (body: QueryEmissions) => envelope("/query/emissions", post(body)),
  queryAir: (body: QueryAir) => envelope("/query/air", post(body)),
  compare: (body: CompareRequest) => envelope("/query/compare", post(body)),
  timeseries: (body: TimeseriesRequest) => envelope("/query/timeseries", post(body)),
  uncertainty: (body: UncertaintyRequest) => envelope("/query/uncertainty", post(body)),
  completeness: (body: CompletenessRequest) => envelope("/query/completeness", post(body)),
  evidence: (streamId: string, params: { module?: string; category?: string } = {}) =>
    envelope(`/evidence/${encodeURIComponent(streamId || "_")}?${new URLSearchParams(params as Record<string, string>)}`),
  method: (methodOrCategory: string) => envelope(`/method/${encodeURIComponent(methodOrCategory)}`),
  transfers: (ledgerId: string, configurationId = "") =>
    envelope(`/transfers?${new URLSearchParams({ ledger_id: ledgerId, configuration_id: configurationId })}`),
  lineage: (shapeOrProvince: string, params: { month?: string; gas?: string; configuration_id?: string } = {}) =>
    envelope(`/spatial/lineage/${encodeURIComponent(shapeOrProvince)}?${new URLSearchParams(params as Record<string, string>)}`),
  gridCell: (body: GridCellRequest) => envelope("/spatial/grid", post(body)),
  receipt: (receipt: string) => envelope(`/receipt/${receipt}`),
  downloadCsvUrl: (receipt: string) => `${API_BASE}/download/${receipt}.csv`,
  downloadReceiptUrl: (receipt: string) => `${API_BASE}/download/${receipt}.receipt.json`,
  /** The SSE endpoint of the assistant (POST). */
  askUrl: () => `${API_BASE}/ask`,
  /**
   * The schema and the interactive docs. The API serves both under the prefix
   * (`{base}/openapi.json`, `{base}/docs`), which is what reaches it behind the hosting rewrite,
   * and keeps root copies (`/openapi.json`, `/docs`) for a direct base. `openapiUrls` lists the
   * prefixed URL first and, for an absolute base, the root copy second; the contract fetch takes
   * the first that answers.
   */
  openapiUrls: () => (isAbsolute(API_BASE) ? [`${API_BASE}/openapi.json`, `${new URL(API_BASE).origin}/openapi.json`] : [`${API_BASE}/openapi.json`]),
  openapiUrl: () => api.openapiUrls()[0],
  docsUrl: () => `${API_BASE}/docs`,
};
