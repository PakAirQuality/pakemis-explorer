import "@testing-library/jest-dom/vitest";
/**
 * The static export has no server routes: no link points at /r/<receipt> (a receipt's URL is
 * /downloads?receipt=<hash>; the old /data?receipt= redirects there), the app has no app/tiles
 * or app/r route folders and no PMTiles reader, and the Result details drawer's "Reproduce
 * this result" link points at /downloads?receipt=.
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
  it("no source links to /data or /about: the two moved to /downloads and /methods and are redirect stubs", () => {
    const hits = walk(SRC)
      .filter((f) => !/app\/(data|about)\/page\.tsx$/.test(f))
      .filter((f) => /["'`]\/(data|about)(["'`?#/])/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
    for (const rel of ["app/data/page.tsx", "app/about/page.tsx"]) expect(readFileSync(path.join(SRC, rel), "utf8")).toContain("<Redirect");
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
