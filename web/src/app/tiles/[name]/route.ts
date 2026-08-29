/** TileJSON for one PMTiles archive (adm1 | adm2 | grid); anything else is a 404. */
import { NextResponse, type NextRequest } from "next/server";
import { isTileName, requestOrigin, tileJson } from "@/lib/pmtilesServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isTileName(name)) return NextResponse.json({ error: "unknown tile set" }, { status: 404 });
  const body = await tileJson(name, requestOrigin(req));
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
