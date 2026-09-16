import "@testing-library/jest-dom/vitest";
/**
 * The static export has no server routes: no link points at /r/<receipt> (a receipt's URL is
 * /downloads?receipt=<hash>), the app has no app/tiles or app/r route folders and no PMTiles
 * reader, the Result details drawer's "Reproduce this result" link points at
 * /downloads?receipt=, and nothing links at a route that has become a redirect stub (/map,
 * /explore, /about) — the four sections are /, /data, /methods and /downloads.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Envelope } from "@/lib/envelope";
import { envelope } from "./fixtures";
import { ReceiptFooter, receiptHref } from "@/components/ui/ReceiptFooter";

const SRC = path.resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("static-export link scheme", () => {
  it("no source links to /r/<receipt>", () => {
    const short = ["/r", "/"].join(""); // built at runtime so this file never matches itself
    const hits = walk(SRC).filter((f) => {
      const s = readFileSync(f, "utf8");
      return s.includes(`"${short}`) || s.includes(`'${short}`) || s.includes(`\`${short}`) || s.includes(`href={${short}`);
    });
    expect(hits).toEqual([]);
  });
  it("the server-side route folders and the PMTiles reader are gone", () => {
    for (const rel of ["app/tiles", "app/r", "lib/pmtilesServer.ts"]) expect(existsSync(path.join(SRC, rel)), rel).toBe(false);
  });
  it("no source links to /map, /explore or /about: the three are redirect stubs, and /data is the Grapher's own route", () => {
    // the three routes that moved: the workspace absorbed /map, the Grapher moved to /data, /about is /methods
    const hits = walk(SRC)
      .filter((f) => !/app\/(map|explore|about)\/page\.tsx$/.test(f))
      .filter((f) => /["'`]\/(map|explore|about)(["'`?#/])/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
    for (const rel of ["app/map/page.tsx", "app/explore/page.tsx", "app/about/page.tsx"]) expect(readFileSync(path.join(SRC, rel), "utf8")).toContain("<Redirect");
    // /data stays a real page (the Grapher, reachable from Downloads)
    expect(readFileSync(path.join(SRC, "app/data/page.tsx"), "utf8")).toContain("<Explore");
    // ANALYZE JOINED THEM on 2026-09-16: the Evidence Assistant answers what the page was built
    // for, so the route is a stub like /map and /explore and nothing links to it any more.
    expect(readFileSync(path.join(SRC, "app/analyze/page.tsx"), "utf8")).toContain("<Redirect");
    expect(readFileSync(path.join(SRC, "components/shell/NavCapsule.tsx"), "utf8")).not.toContain('href: "/analyze"');
    expect(existsSync(path.join(SRC, "components/analyze"))).toBe(false);
  });
  it("a receipt's URL is /downloads?receipt=<hash>", () => {
    const id = "0123456789abcdef0123456789abcdef";
    expect(receiptHref(id)).toBe(`/downloads?receipt=${id}`);
    render(<ReceiptFooter env={envelope([{ display: "1.0" }], { receipt: id }) as unknown as Envelope} />);
    fireEvent.click(screen.getByTestId("result-details"));
    const drawer = screen.getByRole("dialog");
    const replay = drawer.querySelector("a[href^='/downloads?receipt=']");
    expect(replay).not.toBeNull();
    expect(replay).toHaveAttribute("href", `/downloads?receipt=${id}`);
    expect(drawer.querySelector("a[href^='/data?receipt=']")).toBeNull();
    expect(drawer.querySelector("a[href^='/r/']")).toBeNull();
  });
});
