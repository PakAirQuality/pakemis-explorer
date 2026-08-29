/** One vector tile, as stored in the archive (gzip declared through Content-Encoding); 204 when absent. */
import { NextResponse, type NextRequest } from "next/server";
import { isTileName, tile } from "@/lib/pmtilesServer";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string; z: string; x: string; y: string }> }) {
  const p = await params;
  if (!isTileName(p.name)) return NextResponse.json({ error: "unknown tile set" }, { status: 404 });
  const [z, x, y] = [p.z, p.x, p.y.replace(/\.(mvt|pbf|png|jpg|webp)$/, "")].map((s) => (/^\d+$/.test(s) ? Number(s) : NaN));
  if (![z, x, y].every(Number.isFinite)) return NextResponse.json({ error: "bad tile address" }, { status: 400 });
  const t = await tile(p.name, z, x, y);
  const cache = "public, max-age=31536000, immutable";
  if (!t) return new NextResponse(null, { status: 204, headers: { "Cache-Control": cache } });
  const headers: Record<string, string> = { "Content-Type": t.contentType, "Cache-Control": cache, "Content-Length": String(t.data.byteLength) };
  if (t.encoding) headers["Content-Encoding"] = t.encoding;
  return new NextResponse(t.data as unknown as BodyInit, { status: 200, headers });
}
