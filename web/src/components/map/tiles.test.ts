/**
 * Tile URLs: TileJSON, meta, bboxes and raster frames are all under `{API_BASE}/tiles/…`;
 * nothing is read from this origin's /tiles. rasterFile keeps naming frames as TILES.json does.
 */
import { describe, expect, it, vi } from "vitest";
import { API_BASE } from "@/lib/api";
import { tileJsonUrl } from "./layers";
import { bboxesUrl, fetchBboxes, fetchTilesInfo, rasterFile, rasterUrl, tilesMetaUrl, type RasterInfo } from "./tiles";

describe("tile URLs", () => {
  it("TileJSON per archive, absolute, on the API", () => {
    expect(tileJsonUrl("adm1")).toBe(`${API_BASE}/tiles/adm1`);
    expect(tileJsonUrl("grid", "/api/v1/emissions")).toBe("/api/v1/emissions/tiles/grid");
    expect(tileJsonUrl("adm1")).toMatch(/^https?:\/\//);
  });
  it("meta, bboxes and rasters", () => {
    expect(tilesMetaUrl()).toBe(`${API_BASE}/tiles/meta`);
    expect(bboxesUrl()).toBe(`${API_BASE}/tiles/bboxes`);
    expect(rasterUrl("REF_2023_24/CO2/202307.png")).toBe(`${API_BASE}/tiles/raster/REF_2023_24/CO2/202307.png`);
    expect(rasterUrl("x.png", "https://pakemis.example.org/api/v1/emissions")).toBe("https://pakemis.example.org/api/v1/emissions/tiles/raster/x.png");
  });
  it("fetches meta and bboxes from the API base and refuses a non-2xx", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      seen.push(url);
      const ok = !url.endsWith("/tiles/bboxes");
      return { ok, status: ok ? 200 : 503, statusText: ok ? "OK" : "Unavailable", json: async () => ({ version: "v", promote_id: {} }) } as unknown as Response;
    });
    const info = await fetchTilesInfo();
    expect(info.version).toBe("v");
    await expect(fetchBboxes()).rejects.toThrow(/503/);
    expect(seen).toEqual([`${API_BASE}/tiles/meta`, `${API_BASE}/tiles/bboxes`]);
    vi.unstubAllGlobals();
  });
  it("rasterFile strips the builder's raster/ prefix and finds the annual frame", () => {
    const info = { files: { "raster/REF_2023_24/CO2/202307.png": "", "raster/REF_2023_24/CO2/FY2023-24.png": "" } } as unknown as RasterInfo;
    expect(rasterFile(info, "REF_2023_24", "CO2", "202307")).toBe("REF_2023_24/CO2/202307.png");
    expect(rasterFile(info, "REF_2023_24", "CO2", null)).toBe("REF_2023_24/CO2/FY2023-24.png");
    expect(rasterFile(info, "REF_2023_24", "CH4", null)).toBeNull();
    expect(rasterFile(undefined, "REF_2023_24", "CO2", null)).toBeNull();
  });
});
