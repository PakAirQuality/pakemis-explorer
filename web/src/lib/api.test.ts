/**
 * The API base: NEXT_PUBLIC_API_BASE wins (absolute or same-origin), the old
 * NEXT_PUBLIC_PAKEMIS_API origin still resolves for one release with the prefix appended, the
 * default is the local API under /api/v1/emissions; every route is relative to the base (the
 * old /v1 segment lives inside the base now); API-returned paths join through apiUrl.
 */
import { describe, expect, it, vi } from "vitest";
import { api, API_BASE, API_PREFIX, absoluteApiBase, apiUrl, resolveApiBase } from "./api";
import { RELEASE, mockFetch } from "@/__tests__/fixtures";

describe("resolveApiBase", () => {
  it("defaults to the local API under the prefix", () => {
    expect(resolveApiBase({})).toBe("http://localhost:8000/api/v1/emissions");
    expect(API_PREFIX).toBe("/api/v1/emissions");
  });
  it("reads NEXT_PUBLIC_API_BASE as given, without a trailing slash", () => {
    expect(resolveApiBase({ NEXT_PUBLIC_API_BASE: "https://pakemis.example.org/api/v1/emissions/" })).toBe("https://pakemis.example.org/api/v1/emissions");
    expect(resolveApiBase({ NEXT_PUBLIC_API_BASE: "/api/v1/emissions" })).toBe("/api/v1/emissions");
  });
  it("falls back to the old NEXT_PUBLIC_PAKEMIS_API origin plus the prefix for one release", () => {
    expect(resolveApiBase({ NEXT_PUBLIC_PAKEMIS_API: "http://api.internal:8000/" })).toBe("http://api.internal:8000/api/v1/emissions");
    expect(resolveApiBase({ NEXT_PUBLIC_API_BASE: "/api/v1/emissions", NEXT_PUBLIC_PAKEMIS_API: "http://api.internal:8000" })).toBe("/api/v1/emissions");
  });
  it("the module constant is one of the three", () => {
    expect(API_BASE.endsWith("/api/v1/emissions")).toBe(true);
    expect(API_BASE.endsWith("/")).toBe(false);
  });
});

describe("absoluteApiBase / apiUrl", () => {
  it("resolves a same-origin base against the page origin", () => {
    expect(absoluteApiBase("/api/v1/emissions")).toBe(`${window.location.origin}/api/v1/emissions`);
    expect(absoluteApiBase("http://localhost:8000/api/v1/emissions")).toBe("http://localhost:8000/api/v1/emissions");
  });
  it("joins an API-returned path under the prefix, the /v1 alias, or relative to the base", () => {
    const base = "http://localhost:8000/api/v1/emissions";
    expect(apiUrl("/api/v1/emissions/download/abc.csv", base)).toBe("http://localhost:8000/api/v1/emissions/download/abc.csv");
    expect(apiUrl("/v1/download/abc.csv", base)).toBe("http://localhost:8000/v1/download/abc.csv");
    expect(apiUrl("/download/abc.csv", base)).toBe("http://localhost:8000/api/v1/emissions/download/abc.csv");
    expect(apiUrl("download/abc.csv", base)).toBe("http://localhost:8000/api/v1/emissions/download/abc.csv");
    expect(apiUrl("https://elsewhere.example/x.csv", base)).toBe("https://elsewhere.example/x.csv");
    expect(apiUrl("/api/v1/emissions/download/abc.csv", "/api/v1/emissions")).toBe(`${window.location.origin}/api/v1/emissions/download/abc.csv`);
  });
});

describe("routes are relative to the base", () => {
  it("GET /release, POST /query/emissions, /receipt, /ask, /download, /openapi.json", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetch((url) => {
        seen.push(url);
        return RELEASE;
      }),
    );
    await api.release();
    expect(seen[0]).toBe(`${API_BASE}/release`);
    expect(api.downloadCsvUrl("r1")).toBe(`${API_BASE}/download/r1.csv`);
    expect(api.downloadReceiptUrl("r1")).toBe(`${API_BASE}/download/r1.receipt.json`);
    expect(api.askUrl()).toBe(`${API_BASE}/ask`);
    // the schema and docs live at the app root; the prefixed path is the second candidate (the rewrite's)
    expect(api.openapiUrls()).toEqual(["http://localhost:8000/openapi.json", `${API_BASE}/openapi.json`]);
    expect(api.openapiUrl()).toBe("http://localhost:8000/openapi.json");
    expect(api.docsUrl()).toBe("http://localhost:8000/docs");
    for (const u of [api.downloadCsvUrl("r1"), api.askUrl(), `${API_BASE}/release`]) expect(u.replace(API_PREFIX, "")).not.toContain("/v1/");
    vi.unstubAllGlobals();
  });
});
