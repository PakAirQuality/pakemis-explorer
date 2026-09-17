/**
 * Every static asset a shipped component names under web/public exists, and every Methods
 * illustration shipped under public/methods is named by the story's copy - the guard the
 * repository lacked until the Methods redesign (2026-09-18): a `src="/brand/…"` or a copy-module
 * file name could point at nothing and no test would say so until a reader saw a broken image.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ILLUSTRATION_DIR, STEPS, STORY } from "@/components/methods/copy";

const SRC = path.resolve(__dirname, "..");
const PUBLIC = path.resolve(__dirname, "..", "..", "public");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("public assets", () => {
  it("every public path a shipped source names is a file under web/public", () => {
    const named = new Set<string>();
    for (const file of walk(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/["'`]\/(brand|motif|methods)\/([A-Za-z0-9._-]+\.(png|jpg|jpeg|svg|json))["'`]/g)) named.add(`/${m[1]}/${m[2]}`);
    }
    expect(named.size).toBeGreaterThan(0);
    for (const rel of named) expect(existsSync(path.join(PUBLIC, rel)), `${rel} is named but not shipped`).toBe(true);
  });
  it("the Methods illustrations: every file the copy names exists, and every shipped SVG is named", () => {
    const named = [STORY.heroFile, ...STEPS.map((s) => s.file)];
    for (const f of named) expect(existsSync(path.join(PUBLIC, ILLUSTRATION_DIR.slice(1), f)), f).toBe(true);
    const shipped = readdirSync(path.join(PUBLIC, ILLUSTRATION_DIR.slice(1))).filter((f) => f.endsWith(".svg")).sort();
    expect(shipped).toEqual([...named].sort());
    // self-contained vector drawings: no raster, script or remote reference may ride in
    for (const f of shipped) {
      const svg = readFileSync(path.join(PUBLIC, ILLUSTRATION_DIR.slice(1), f), "utf8");
      expect(svg, f).not.toMatch(/<image\b|<script\b|(href|src)=["']https?:|url\(["']?https?:|data:/);
      expect(svg, f).toMatch(/viewBox="0 0 960 440"/);
    }
  });
});
