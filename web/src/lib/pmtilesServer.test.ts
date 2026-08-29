/**
 * The PMTiles route helpers against the real archives in public/tiles: TileJSON fields come
 * from the archive header and metadata, a real tile is served as stored (gzip magic when the
 * archive compresses, otherwise a protobuf), and a name outside the allowlist is refused.
 */
import { describe, expect, it } from "vitest";
import { Compression, TileType } from "pmtiles";
import { header, isTileName, requestOrigin, tile, tileJson, TILE_NAMES } from "./pmtilesServer";

describe("pmtilesServer", () => {
  it("refuses names outside the allowlist", () => {
    expect(isTileName("adm1")).toBe(true);
    expect(isTileName("adm1.pmtiles")).toBe(false);
    expect(isTileName("../../etc/passwd")).toBe(false);
    expect(isTileName("TILES.json")).toBe(false);
  });
  it("the request origin honours a proxy's forwarded host", () => {
    const h = (o: Record<string, string>) => ({ url: "http://127.0.0.1:3000/tiles/adm1", headers: { get: (k: string) => o[k.toLowerCase()] ?? null } });
    expect(requestOrigin(h({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(requestOrigin(h({ host: "localhost:3000", "x-forwarded-host": "explorer.example.org", "x-forwarded-proto": "https" }))).toBe("https://explorer.example.org");
    expect(requestOrigin(h({}))).toBe("http://127.0.0.1:3000");
  });
  for (const name of TILE_NAMES) {
    it(`${name}: TileJSON from the archive`, async () => {
      const h = await header(name);
      const tj = await tileJson(name, "http://localhost:3000");
      expect(tj.tilejson).toBe("3.0.0");
      expect(tj.tiles).toEqual([`http://localhost:3000/tiles/${name}/{z}/{x}/{y}.mvt`]);
      expect(tj.minzoom).toBe(h.minZoom);
      expect(tj.maxzoom).toBe(h.maxZoom);
      expect(tj.bounds).toEqual([h.minLon, h.minLat, h.maxLon, h.maxLat]);
      // Pakistan's box
      expect(tj.bounds[0]).toBeGreaterThan(60);
      expect(tj.bounds[2]).toBeLessThan(78);
      expect(tj.bounds[1]).toBeGreaterThan(23);
      expect(tj.bounds[3]).toBeLessThan(38);
      const layers = tj.vector_layers as { id: string; fields: Record<string, string> }[];
      expect(layers.map((l) => l.id)).toEqual([name]);
      expect(h.tileType).toBe(TileType.Mvt);
    });
  }
  it("serves a real tile's bytes as stored", async () => {
    const h = await header("adm1");
    // the tile holding the archive's centre at its minimum zoom always exists
    const z = h.minZoom;
    const n = 1 << z;
    const x = Math.floor(((h.centerLon + 180) / 360) * n);
    const lat = (h.centerLat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n);
    const t = await tile("adm1", z, x, y);
    expect(t).not.toBeNull();
    expect(t!.contentType).toBe("application/vnd.mapbox-vector-tile");
    if (h.tileCompression === Compression.Gzip) {
      expect(t!.encoding).toBe("gzip");
      expect([t!.data[0], t!.data[1]]).toEqual([0x1f, 0x8b]);
    } else {
      expect(t!.encoding).toBeNull();
      // an MVT starts with a layer field (tag 3, wire type 2 = 0x1a)
      expect(t!.data[0]).toBe(0x1a);
    }
    expect(t!.data.byteLength).toBeGreaterThan(20);
  });
  it("answers null for a tile outside the archive", async () => {
    const h = await header("adm2");
    expect(await tile("adm2", h.maxZoom + 1, 0, 0)).toBeNull();
    expect(await tile("adm2", h.maxZoom, 0, 0)).toBeNull(); // the far north-west Pacific, outside the bounds
  });
});
