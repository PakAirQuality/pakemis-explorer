/**
 * The typed client. Every function returns an Envelope validated by zod; a 422 becomes a
 * thrown `RefusalError` carrying the typed refusal. Request bodies are the generated OpenAPI
 * types (src/types.gen.ts), so a body that diverges from the contract fails to compile.
 */
import { EnvelopeSchema, RefusalSchema, ReleaseSchema, type Envelope, type Refusal, type ReleaseInfo } from "./envelope";
import type { components } from "@/types.gen";

/** Every request field has a contract default server-side, so a body may omit any of them. */
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type QueryEmissions = DeepPartial<components["schemas"]["QueryEmissions"]>;
export type CompareRequest = DeepPartial<components["schemas"]["CompareRequest"]>;
export type TimeseriesRequest = DeepPartial<components["schemas"]["TimeseriesRequest"]>;
export type UncertaintyRequest = DeepPartial<components["schemas"]["UncertaintyRequest"]>;
export type CompletenessRequest = DeepPartial<components["schemas"]["CompletenessRequest"]>;
export type GridCellRequest = DeepPartial<components["schemas"]["GridCellRequest"]>;

export const API_BASE = process.env.NEXT_PUBLIC_PAKEMIS_API ?? "http://localhost:8000";

export class RefusalError extends Error {
  refusal: Refusal;
  constructor(refusal: Refusal) {
    super(`${refusal.error_class}: ${refusal.message}`);
    this.refusal = refusal;
  }
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
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

export const api = {
  release: async (): Promise<ReleaseInfo> => ReleaseSchema.parse(await call("/v1/release")),
  queryEmissions: (body: QueryEmissions) => envelope("/v1/query/emissions", post(body)),
  compare: (body: CompareRequest) => envelope("/v1/query/compare", post(body)),
  timeseries: (body: TimeseriesRequest) => envelope("/v1/query/timeseries", post(body)),
  uncertainty: (body: UncertaintyRequest) => envelope("/v1/query/uncertainty", post(body)),
  completeness: (body: CompletenessRequest) => envelope("/v1/query/completeness", post(body)),
  evidence: (streamId: string, params: { module?: string; category?: string } = {}) =>
    envelope(`/v1/evidence/${encodeURIComponent(streamId || "_")}?${new URLSearchParams(params as Record<string, string>)}`),
  method: (methodOrCategory: string) => envelope(`/v1/method/${encodeURIComponent(methodOrCategory)}`),
  transfers: (ledgerId: string, configurationId = "") =>
    envelope(`/v1/transfers?${new URLSearchParams({ ledger_id: ledgerId, configuration_id: configurationId })}`),
  lineage: (shapeOrProvince: string, params: { month?: string; gas?: string; configuration_id?: string } = {}) =>
    envelope(`/v1/spatial/lineage/${encodeURIComponent(shapeOrProvince)}?${new URLSearchParams(params as Record<string, string>)}`),
  gridCell: (body: GridCellRequest) => envelope("/v1/spatial/grid", post(body)),
  receipt: (receipt: string) => envelope(`/v1/receipt/${receipt}`),
  downloadCsvUrl: (receipt: string) => `${API_BASE}/v1/download/${receipt}.csv`,
  downloadReceiptUrl: (receipt: string) => `${API_BASE}/v1/download/${receipt}.receipt.json`,
};
