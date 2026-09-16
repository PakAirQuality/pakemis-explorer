/**
 * Bake the Explore map into a page background.
 *
 * TWO LAYERS, because neither alone is the picture. The grey regional basemap is Mapbox's
 * `light-v11` - the same style the live map renders (`map/basemap.ts`) - fetched ONCE through the
 * Static Images API, which is the sanctioned way to get a still and renders at 2560 px with no
 * panels, legend or assistant to crop out. The provinces on top are ours: the release's own ADM1
 * values, banded with the app's own `RAMP` and `rankBand`, over geoBoundaries geometry.
 *
 * ⚠ WEB MERCATOR, NOT EQUIRECTANGULAR. The provinces have to sit on the photograph, so the geometry
 * is projected into the exact pixel box the image request describes - which is knowable because this
 * script chooses the centre, zoom and size on both sides.
 *
 * ⚠ THE RESIDUAL ROW. The API answers with a province called "Other" that owns no polygon; Azad
 * Kashmir, Gilgit-Baltistan and Islamabad have no rows of their own and take its colour, exactly as
 * `cellForFeature()` does on the live map. Skip that and three provinces come out unpainted.
 *
 * The token is read from .env.local and never printed. Run by hand; the outputs are committed.
 *
 *   node scripts/build-map-motif.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import os from "node:os";

const GIS = process.argv[2] ?? join(os.homedir(), "Desktop/emissions/data/gis");
const API = process.env.PAKEMIS_API ?? "http://localhost:8000/api/v1/emissions";
const ROOT = new URL("..", import.meta.url).pathname;
const OUT_TSX = join(ROOT, "src/components/shell/MapMotif.tsx");
const OUT_IMG = join(ROOT, "public/motif/explore-basemap.jpg");

/** The framing. Wider than the workspace's own view on purpose: the page crops this with
 *  object-cover at whatever the window's aspect is, and the margin keeps Pakistan centred. */
const CENTRE = [69.5, 30.4];
const ZOOM = 3.6;
const W = 1280, H = 760;
const STYLE = "mapbox/light-v11";
/** geoBoundaries provinces are coarse enough already; 0.01° keeps the coastline honest. */
const TOLERANCE = 0.01;
/** Straight from lib/palette.ts. The test imports RAMP and holds these to it. */
const RAMP = ["#fff0b3", "#ffb313", "#e87832", "#b4453f", "#5e1a2a"];

// ---- Web Mercator, in the image's own pixels -------------------------------------------------
const WORLD = 512 * 2 ** ZOOM;
const mx = (lon) => ((lon + 180) / 360) * WORLD;
const my = (lat) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * WORLD;
};
const X0 = mx(CENTRE[0]) - W / 2, Y0 = my(CENTRE[1]) - H / 2;
const px = (lon) => mx(lon) - X0, py = (lat) => my(lat) - Y0;

// ---- geometry --------------------------------------------------------------------------------
function simplify(points, tol) {
  if (points.length < 3) return points;
  const sq = tol * tol;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = -1, best = 0;
    const [ax, ay] = points[a], [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i += 1) {
      const [qx, qy] = points[i];
      let d;
      if (len === 0) { const ex = qx - ax, ey = qy - ay; d = ex * ex + ey * ey; }
      else {
        let t = ((qx - ax) * dx + (qy - ay) * dy) / len;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = qx - (ax + t * dx), ey = qy - (ay + t * dy);
        d = ex * ex + ey * ey;
      }
      if (d > best) { best = d; far = i; }
    }
    if (far > 0 && best > sq) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return points.filter((_, i) => keep[i]);
}
const rings = (g) => (g?.type === "Polygon" ? g.coordinates : g?.type === "MultiPolygon" ? g.coordinates.flat() : []);
const r2 = (n) => Number(n.toFixed(1));
const pathOf = (ring) => ring.map(([lo, la], i) => `${i ? "L" : "M"}${r2(px(lo))} ${r2(py(la))}`).join("") + "Z";

// ---- the release's own provincial values -----------------------------------------------------
const env = await fetch(`${API}/query/emissions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ periods: ["FY2023-24"], geography_level: "adm1", group_by: ["province"] }),
}).then((r) => { if (!r.ok) throw new Error(`the API answered ${r.status}; is it running?`); return r.json(); });

const cells = (env.values ?? []).filter((c) => typeof c.value === "number");
const sorted = [...cells].sort((a, b) => a.value - b.value);
/** map/paint.ts: quantile rank banding, which is what the map's default "Relative" scale does. */
const rankBand = (i, n) => Math.min(RAMP.length - 1, Math.floor(((i + 0.5) / n) * RAMP.length));
const colourOf = new Map(sorted.map((c, i) => [c.group.province, RAMP[rankBand(i, sorted.length)]]));
const RESIDUAL = colourOf.get("Other");
if (!RESIDUAL) throw new Error('no "Other" row: the residual fallback would leave provinces unpainted');

const fc = JSON.parse(readFileSync(join(GIS, "PAK_ADM1.geojson"), "utf8"));
const provinces = fc.features.map((f) => {
  const name = f.properties.shapeName;
  // a province with no row of its own is inside the residual cell, and takes its colour
  return { name, fill: colourOf.get(name) ?? RESIDUAL, d: rings(f.geometry).map((r) => simplify(r, TOLERANCE)).filter((r) => r.length > 3).map(pathOf).join("") };
});
const unpainted = provinces.filter((p) => !p.fill);
if (unpainted.length) throw new Error(`unpainted: ${unpainted.map((p) => p.name).join(", ")}`);

// ---- the basemap still -----------------------------------------------------------------------
const TOKEN = (readFileSync(join(ROOT, ".env.local"), "utf8").match(/^NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=(.*)$/m)?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
if (!TOKEN) throw new Error("no NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in .env.local");
const url = `https://api.mapbox.com/styles/v1/${STYLE}/static/${CENTRE[0]},${CENTRE[1]},${ZOOM},0,0/${W}x${H}@2x?attribution=false&logo=false&access_token=${TOKEN}`;
const png = Buffer.from(await fetch(url).then((r) => { if (!r.ok) throw new Error(`Mapbox answered ${r.status}`); return r.arrayBuffer(); }));
mkdirSync(dirname(OUT_IMG), { recursive: true });
const tmp = OUT_IMG.replace(/\.jpg$/, ".png");
writeFileSync(tmp, png);
// a flat map under a scrim at low opacity: JPEG artefacts are invisible and the PNG is four times the size
execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "72", tmp, "--out", OUT_IMG], { stdio: "ignore" });
unlinkSync(tmp);

// ---- the component ---------------------------------------------------------------------------
const period = env.request?.periods?.[0] ?? "the reference year";
const config = env.context?.configuration_id ?? env.request?.configuration_id ?? "the reference configuration";
const tsx = `/**
 * The Explore map, as the page background.
 *
 * GENERATED by \`scripts/build-map-motif.mjs\` - do not edit by hand, regenerate. Two layers, because
 * neither alone is the picture: Mapbox's \`light-v11\` still underneath (one Static Images request,
 * the same style the live map renders, so the greys match), and the release's own provinces on top,
 * banded with the app's own ramp over geoBoundaries geometry.
 *
 * The province geometry is projected in WEB MERCATOR into the exact pixel box the image was
 * requested at, which is why the two layers line up; \`object-cover\` and \`xMidYMid slice\` are the
 * same crop, so they stay aligned at every window size.
 *
 * ⚠ NO TEXT NODE MAY EVER ENTER THIS FILE. \`downloads.test.tsx\` walks every text node on the page
 * and requires each decimal to be a string the server sent; a coordinate rendered as text would fail
 * the build. \`motif.test.tsx\` asserts the subtree is textless.
 *
 * The fills are baked from ${period} on ${config}. A re-base moves them: regenerate.
 */

/** Suppressing Mapbox's own logo and attribution on the still means the page must carry both. */
export const MOTIF_CREDIT = "Basemap © Mapbox © OpenStreetMap. District boundaries: geoBoundaries gbOpen.";

/** The dial, in one place: the still, the provinces, and the scrim that keeps text readable. */
const BASEMAP_OPACITY = 0.45;
const PROVINCE_OPACITY = 0.68;
const SCRIM = "bg-ground/30";

export function MapMotif() {
  return (
    <div aria-hidden="true" data-testid="map-motif" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element -- a decorative static still, not content */}
      <img src="/motif/explore-basemap.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" style={{ opacity: BASEMAP_OPACITY }} />
      <svg
        viewBox="0 0 ${W} ${H}"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        style={{ opacity: PROVINCE_OPACITY }}
        data-testid="motif-provinces"
      >
${provinces.map((p) => `        <path d="${p.d}" fill="${p.fill}" stroke="${p.fill}" strokeWidth={0.5} data-province="${p.name}" />`).join("\n")}
      </svg>
      <div className={\`absolute inset-0 \${SCRIM}\`} />
    </div>
  );
}
`;
writeFileSync(OUT_TSX, tsx);

const bytes = statSync(OUT_IMG).size;
console.log(`${OUT_IMG}\n  basemap still: ${(bytes / 1024).toFixed(0)} KB jpeg (${W * 2}x${H * 2}), from ${STYLE} at zoom ${ZOOM}`);
console.log(`${OUT_TSX}\n  provinces: ${provinces.length}, component ${(tsx.length / 1024).toFixed(1)} KB`);
for (const p of provinces) console.log(`    ${p.fill}  ${p.name}${colourOf.has(p.name) ? "" : "  (residual)"}`);
