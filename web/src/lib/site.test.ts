import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SECTOR_TEXT } from "@/components/methods/sectorText";
import { resolveSiteUrl, sitePaths } from "./site";

const APP = path.resolve(__dirname, "..", "app");

/** Every page.tsx under app/ that is a page rather than a redirect stub, as its exported path. */
function exportedPages(dir: string, route = "", out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) exportedPages(p, `${route}/${name}`, out);
    else if (name === "page.tsx" && !/\bRedirect\b/.test(readFileSync(p, "utf8"))) out.push(`${route}/`);
  }
  return out;
}

describe("the site's public address", () => {
  it("is an origin with no trailing slash, and nothing when unset", () => {
    expect(resolveSiteUrl(" https://emissions.example.org/ ")).toBe("https://emissions.example.org");
    expect(resolveSiteUrl(undefined)).toBe("");
    expect(resolveSiteUrl("  ")).toBe("");
  });
  it("the sitemap's paths are exactly the pages the export writes, redirect stubs left out", () => {
    const sectors = Object.keys(SECTOR_TEXT);
    const pages = exportedPages(APP).flatMap((route) =>
      route.includes("[sector]") ? sectors.map((s) => route.replace("[sector]", s)) : [route],
    );
    expect(sitePaths(sectors).sort()).toEqual(pages.sort());
  });
});
