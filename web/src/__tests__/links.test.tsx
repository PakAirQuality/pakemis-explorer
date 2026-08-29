import "@testing-library/jest-dom/vitest";
/**
 * The static export has no server routes: no link points at /r/<receipt> (a receipt's URL is
 * /data?receipt=<hash>), the app has no app/tiles or app/r route folders and no PMTiles reader,
 * and the ReceiptFooter's Replay item links to /data?receipt=.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
  it("a receipt's URL is /data?receipt=<hash>", () => {
    const id = "0123456789abcdef0123456789abcdef";
    expect(receiptHref(id)).toBe(`/data?receipt=${id}`);
    render(<ReceiptFooter receipt={id} />);
    fireEvent.click(screen.getByLabelText("Receipt menu"));
    const replay = screen.getByRole("menu").querySelector("a[href^='/data?receipt=']");
    expect(replay).not.toBeNull();
    expect(replay).toHaveAttribute("href", `/data?receipt=${id}`);
    expect(screen.getByRole("menu").querySelector("a[href^='/r/']")).toBeNull();
  });
});
