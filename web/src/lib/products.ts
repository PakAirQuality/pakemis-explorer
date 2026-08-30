"use client";
/**
 * The downloadable products of the served release: `GET {base}/products` lists every file
 * the payload publishes (the semantic tables as CSV and Parquet, the two grid cubes, the two
 * metadata files) with the digest that is each file's identity, the schema fields the contract
 * carries (columns, primary key, rows, aggregation rule, closure) and the four families the
 * Downloads page shows. `GET {base}/products/{name}.{ext}` serves one file with `ETag` equal
 * to its sha256. Validated with zod at the boundary; shown as received.
 */
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { API_BASE, RefusalError } from "./api";
import { RefusalSchema, type Envelope } from "./envelope";

export const ProductFormatSchema = z
  .object({
    ext: z.string(),
    filename: z.string(),
    bytes: z.number(),
    sha256: z.string(),
    /** Where the digest comes from: the contract, the manifest, the verification, or computed by the service (a Parquet twin). */
    identity: z.string().optional(),
    url: z.string(),
  })
  .passthrough();

export const ProductSchema = z
  .object({
    name: z.string(),
    kind: z.string(),
    formats: z.array(ProductFormatSchema),
    table_kind: z.string().optional(),
    rows: z.number().nullable().optional(),
    columns: z.array(z.string()).optional(),
    primary_key: z.array(z.string()).optional(),
    aggregation_rule: z.string().optional(),
    closure: z.string().optional(),
  })
  .passthrough();

export const FamilySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    tables: z.array(z.string()),
    formats: z.array(z.string()),
  })
  .passthrough();

export const ProductsSchema = z
  .object({
    release: z.string(),
    version: z.string(),
    count: z.number(),
    products: z.array(ProductSchema),
    families: z.array(FamilySchema),
    note: z.string().optional(),
  })
  .passthrough();

export type ProductFormat = z.infer<typeof ProductFormatSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type ProductFamily = z.infer<typeof FamilySchema>;
export type Products = z.infer<typeof ProductsSchema>;

/** The URL of one product file, by its filename (`fact_annual.csv`, `semantic_release.json`). */
export function productUrl(filename: string): string {
  return `${API_BASE}/products/${encodeURIComponent(filename)}`;
}

export async function fetchProducts(): Promise<Products> {
  const res = await fetch(`${API_BASE}/products`, { headers: { accept: "application/json" } });
  if (res.status === 422) {
    const refusal = RefusalSchema.safeParse(await res.json());
    if (refusal.success) throw new RefusalError(refusal.data);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for /products`);
  return ProductsSchema.parse(await res.json());
}

export function useProducts() {
  return useQuery({ queryKey: ["products"], queryFn: fetchProducts, staleTime: Infinity, retry: false });
}

/** The products of one family, in the family's own order. */
export function familyProducts(products: Products | undefined, family: ProductFamily): Product[] {
  if (!products) return [];
  const byName = new Map(products.products.map((p) => [p.name, p]));
  return family.tables.map((t) => byName.get(t)).filter((p): p is Product => !!p);
}

/** "7.4 MB" is a derived number; the API sends bytes, so a size is shown as the API's integer with its unit. */
export function bytesWords(bytes: number): string {
  return `${bytes.toLocaleString("en-GB")} bytes`;
}

/** A receipt-addressed download (an envelope's canonical CSV) beside the product files. */
export function receiptCsvUrl(env: Pick<Envelope, "receipt">): string {
  return `${API_BASE}/download/${env.receipt}.csv`;
}
