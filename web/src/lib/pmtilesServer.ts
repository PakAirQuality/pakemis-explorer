/**
 * The PMTiles archives under public/tiles served to Mapbox GL JS (which has no addProtocol) as
 * plain TileJSON + z/x/y tiles by the route handlers in app/tiles/[name]. `pmtiles` reads the
 * archive through a Source that range-reads the local file; the tile bytes are served as
 * stored (the archive's own gzip, declared through Content-Encoding) so nothing is recompressed.
 * The archives carry geometry and identifiers only; no value is read or written here.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { PMTiles, ResolvedValueCache, findTile, zxyToTileId, type Header, type RangeResponse, type Source, Compression, TileType } from "pmtiles";

export const TILE_NAMES = ["adm1", "adm2", "grid"] as const;
export type TileName = (typeof TILE_NAMES)[number];

export function isTileName(name: string): name is TileName {
  return (TILE_NAMES as readonly string[]).includes(name);
}

/** Range reads against one local archive (the package's Source interface). */
export class FileSource implements Source {
  constructor(private readonly file: string) {}
  getKey(): string {
    return this.file;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const fh = await fs.open(this.file, "r");
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      const out = buf.subarray(0, bytesRead);
      return { data: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) };
    } finally {
      await fh.close();
    }
  }
}

export type TileJSON = {
  tilejson: "3.0.0";
  name: string;
  scheme: "xyz";
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  bounds: [number, number, number, number];
  center: [number, number, number];
  vector_layers?: unknown;
  attribution?: string;
};

export type Tile = { data: Uint8Array; encoding: "gzip" | null; contentType: string };

type Archive = { pm: PMTiles; source: FileSource; cache: ResolvedValueCache };

const archives = new Map<TileName, Archive>();

export function tilesDir(): string {
  return process.env.PAKEMIS_TILES_DIR ?? path.join(process.cwd(), "public", "tiles");
}

function archive(name: TileName): Archive {
  let a = archives.get(name);
  if (!a) {
    const source = new FileSource(path.join(tilesDir(), `${name}.pmtiles`));
    const cache = new ResolvedValueCache();
    a = { pm: new PMTiles(source, cache), source, cache };
    archives.set(name, a);
  }
  return a;
}

export async function header(name: TileName): Promise<Header> {
  return archive(name).pm.getHeader();
}

function ext(t: TileType): string {
  return t === TileType.Mvt ? ".mvt" : t === TileType.Png ? ".png" : t === TileType.Jpeg ? ".jpg" : t === TileType.Webp ? ".webp" : "";
}

function contentType(t: TileType): string {
  return t === TileType.Mvt ? "application/vnd.mapbox-vector-tile" : t === TileType.Png ? "image/png" : t === TileType.Jpeg ? "image/jpeg" : t === TileType.Webp ? "image/webp" : "application/octet-stream";
}

/** The origin the browser used (behind a proxy, the forwarded host and protocol), for absolute tile URLs. */
export function requestOrigin(req: { url: string; headers: { get(name: string): string | null } }): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

/** TileJSON 3.0.0 for one archive; `origin` is the request's origin so the tile URLs are absolute. */
export async function tileJson(name: TileName, origin: string, mount = "/tiles"): Promise<TileJSON> {
  const { pm } = archive(name);
  const h = await pm.getHeader();
  const meta = (await pm.getMetadata()) as { vector_layers?: unknown; attribution?: string } | null;
  return {
    tilejson: "3.0.0",
    name,
    scheme: "xyz",
    tiles: [`${origin}${mount}/${name}/{z}/{x}/{y}${ext(h.tileType)}`],
    minzoom: h.minZoom,
    maxzoom: h.maxZoom,
    bounds: [h.minLon, h.minLat, h.maxLon, h.maxLat],
    center: [h.centerLon, h.centerLat, h.centerZoom],
    ...(meta?.vector_layers !== undefined ? { vector_layers: meta.vector_layers } : {}),
    ...(meta?.attribution ? { attribution: meta.attribution } : {}),
  };
}

/**
 * One tile's bytes exactly as stored (PMTiles.getZxy would decompress them; the directory walk
 * is the same as the package's getZxyAttempt). Null when the archive holds no such tile.
 */
export async function tile(name: TileName, z: number, x: number, y: number): Promise<Tile | null> {
  const { pm, source, cache } = archive(name);
  const h = await pm.getHeader();
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < h.minZoom || z > h.maxZoom || x < 0 || y < 0 || x >= 1 << z || y >= 1 << z) return null;
  const id = zxyToTileId(z, x, y);
  let offset = h.rootDirectoryOffset;
  let length = h.rootDirectoryLength;
  for (let depth = 0; depth <= 3; depth++) {
    const dir = await cache.getDirectory(source, offset, length, h);
    const entry = findTile(dir, id);
    if (!entry) return null;
    if (entry.runLength > 0) {
      const r = await source.getBytes(h.tileDataOffset + entry.offset, entry.length);
      if (h.tileCompression !== Compression.Gzip && h.tileCompression !== Compression.None && h.tileCompression !== Compression.Unknown) throw new Error(`unsupported tile compression ${h.tileCompression}`);
      const encoding = h.tileCompression === Compression.Gzip ? "gzip" : null;
      return { data: new Uint8Array(r.data), encoding, contentType: contentType(h.tileType) };
    }
    offset = h.leafDirectoryOffset + entry.offset;
    length = entry.length;
  }
  throw new Error("maximum directory depth exceeded");
}
