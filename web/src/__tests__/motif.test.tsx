import "@testing-library/jest-dom/vitest";
/**
 * The district motif: the decoration behind Methods and Downloads.
 *
 * It is generated geometry (scripts/build-map-motif.mjs) drawn from the inventory's own
 * geoBoundaries gbOpen outlines - NOT a capture of the Explore map, which is Mapbox's own imagery
 * under our token. Two things have to stay true of it: it must never contribute text to a page, and
 * it must never appear where a real map already lives.
 */
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { Providers } from "@/components/Providers";
import { ExplorerProvider } from "@/components/shell/ExplorerProvider";
import DownloadsPage from "@/app/downloads/page";
import { MOTIF_CREDIT } from "@/components/shell/MapMotif";
import { RAMP } from "@/lib/palette";
import { RELEASE, envelope, mockFetch } from "./fixtures";

vi.mock("next/navigation", () => ({ usePathname: () => "/downloads", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch((url) => {
    if (url.endsWith("/release")) return RELEASE;
    if (url.endsWith("/products")) return { release: "r", version: "v", count: 0, note: "", products: [], families: [] };
    return envelope([{ display: "452.34662", display_short: "452.35", unit_short: "Mt CO₂e" }]);
  }));
});

function mount() {
  const Wrapper = withNuqsTestingAdapter({ searchParams: "", hasMemory: true });
  return render(
    <Wrapper><Providers><ExplorerProvider><DownloadsPage /></ExplorerProvider></Providers></Wrapper>,
  );
}

const src = (rel: string) => readFileSync(path.join(__dirname, "..", rel), "utf8");

describe("the district motif", () => {
  it("CONTRIBUTES NO TEXT TO THE PAGE", async () => {
    // ⚠ THE ASSERTION I WOULD MOST WANT KEPT HERE. /downloads walks every text node and requires
    // each `\d+\.\d+` to be a string the server sent; this subtree is 3,300 coordinates written by a
    // generator, so one stray label - a debug coordinate, a title, a count - would fail that audit
    // from a file nobody edits by hand. Textless is the contract, asserted rather than assumed.
    mount();
    const motif = await screen.findByTestId("map-motif");
    const walker = document.createTreeWalker(motif, NodeFilter.SHOW_TEXT);
    const text: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n.textContent ?? "").trim()) text.push(n.textContent!.trim());
    expect(text).toEqual([]);
  });

  it("is decoration: hidden from assistive tech, and transparent to the pointer", async () => {
    mount();
    const motif = await screen.findByTestId("map-motif");
    expect(motif).toHaveAttribute("aria-hidden", "true");
    // without this it would sit over the whole viewport and swallow every click on the page
    expect(motif.className).toContain("pointer-events-none");
    expect(motif.className).toContain("fixed");
    expect(motif.className).toContain("-z-10");
  });

  it("EVERY PROVINCE IS PAINTED, AND FROM THE APP'S OWN RAMP", async () => {
    // ⚠ THE ASSERTION I WOULD MOST WANT KEPT HERE. Three provinces - Azad Kashmir,
    // Gilgit-Baltistan, Islamabad - have no row of their own; the API answers for them inside a
    // residual cell called "Other", and the live map paints that cell's colour on each of them.
    // Drop that fallback and they render unpainted on a warm page, which reads as deliberate rather
    // than broken, and the background quietly disagrees with Explore.
    mount();
    const motif = await screen.findByTestId("map-motif");
    const paths = [...motif.querySelectorAll("[data-testid=motif-provinces] path")];
    expect(paths).toHaveLength(7);
    for (const el of paths) {
      const name = el.getAttribute("data-province") ?? "";
      // RAMP is imported, not retyped: a re-palette has to fail here rather than drift
      expect(RAMP as readonly string[], name).toContain(el.getAttribute("fill"));
      expect((el.getAttribute("d") ?? "").length, name).toBeGreaterThan(50);
    }
    // and the ramp is actually used as a ramp - a single flat colour would pass everything above
    expect(new Set(paths.map((el) => el.getAttribute("fill"))).size).toBeGreaterThan(3);
  });

  it("the provinces are projected onto the still, not beside it", async () => {
    // the basemap is a Web Mercator render; geometry left in degrees collapses into the top-left
    // corner of the viewBox and the two layers silently stop being the same map
    mount();
    const motif = await screen.findByTestId("map-motif");
    const svg = motif.querySelector("[data-testid=motif-provinces]")!;
    const [, , w, h] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
    const nums = [...svg.querySelectorAll("path")].flatMap((el) => (el.getAttribute("d") ?? "").match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(w);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(h);
    // Pakistan fills a good part of the frame; degrees-as-pixels would be a speck in the corner
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(h * 0.25);
  });

  it("names whose boundaries these are", async () => {
    // geoBoundaries gbOpen is CC-BY; on the map the attribution control carries it, on a page that
    // only draws the outlines nothing would
    mount();
    const footer = await screen.findByTestId("downloads-footer");
    expect(footer).toHaveTextContent(MOTIF_CREDIT);
    // the still is fetched with attribution and logo suppressed, so the page owes both
    expect(MOTIF_CREDIT).toContain("Mapbox");
    expect(MOTIF_CREDIT).toContain("OpenStreetMap");
  });

  it("IS ABSENT WHERE A REAL MAP ALREADY LIVES", () => {
    // read as source rather than rendered: mounting the workspace means mounting Mapbox, and what
    // matters is the rule - the workspace has the live map, /ask is an opaque column
    const mounts = [
      "components/methods/Methods.tsx", "components/methods/SectorsIndex.tsx",
      "components/methods/SectorRoute.tsx", "components/methods/EvidencePage.tsx",
      "app/methodology/page.tsx", "components/downloads/Downloads.tsx",
    ];
    for (const f of mounts) expect(src(f), f).toContain("<MapMotif />");
    for (const f of ["components/workspace/Workspace.tsx", "app/ask/page.tsx"]) expect(src(f), f).not.toContain("MapMotif");
  });

  it("the routes that draw it paint no opaque ground over it", () => {
    // bg-surface and bg-ground are the same warm colour as body, so a root that keeps one hides the
    // motif completely - the roots drop it and let body's own ground show through instead
    for (const f of ["components/methods/Methods.tsx", "components/methods/SectorsIndex.tsx",
                     "components/methods/SectorRoute.tsx", "components/methods/EvidencePage.tsx",
                     "app/methodology/page.tsx", "components/downloads/Downloads.tsx"]) {
      const root = src(f).split("\n").find((l) => l.includes("<MapMotif />")) ?? "";
      const wrapper = src(f).split("<MapMotif />")[0].split("\n").slice(-3).join("\n");
      expect(root + wrapper, f).not.toMatch(/className="[^"]*bg-(surface|ground)[^"]*"[^>]*data-testid/);
    }
  });
});
