import "@testing-library/jest-dom/vitest";
/**
 * The naming rule: "PakEmis" is the DATASET's name and belongs to the citation, the Downloads
 * identity table, the API examples and the receipts. It is not the interface's name — the chrome
 * carries the initiative's name ("Pakistan Air Quality Initiative") and calls the assistant "Ask
 * about this view". This file asserts both halves: the chrome components render without the
 * dataset's name and no shipped source file outside a named allowlist carries it, while the
 * release fixture's citation and identity table still do.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ASK_CONTRACT } from "@/components/ask/AskDock";
import { DisabledCard } from "@/components/ask/DisabledCard";
import { EXPLORE } from "@/components/explore/copy";
import { ASK_SENTENCES, INDEPENDENT_LINE, SHORT_SUMMARY } from "@/components/overview/copy";
import { AskFab } from "@/components/shell/AskFab";
import { LoadingScreen } from "@/components/shell/LoadingScreen";
import { TopNav } from "@/components/shell/TopNav";
import { identityLine } from "@/lib/labels";
import type { Labels } from "@/lib/release";
import { RELEASE } from "./fixtures";
import { ASK_LABEL, DATASET_NAME, INITIATIVE_NAME, namesDataset } from "./vocabulary";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

/** Every string a rendered component puts on screen or into an accessible name. */
function renderedText(el: HTMLElement): string {
  return `${el.textContent ?? ""} ${el.innerHTML}`;
}

describe("the chrome carries the initiative's name, not the dataset's", () => {
  it("the document title is the initiative's", () => {
    // app/layout.tsx cannot be imported under jsdom (next/font), so its metadata is read as source
    const layout = readFileSync(join(__dirname, "..", "app", "layout.tsx"), "utf8");
    const title = /^\s*title: "([^"]+)",$/m.exec(layout)?.[1];
    expect(title).toBe("Pakistan Air Quality Initiative — emissions");
    expect(namesDataset(layout)).toBe(false);
  });
  it("the nav: the sections, the brand mark and the Ask button", () => {
    const { container } = render(<TopNav />);
    expect(namesDataset(renderedText(container))).toBe(false);
    expect(screen.getByTestId("nav-ask")).toHaveTextContent(ASK_LABEL);
    expect(screen.getByTestId("brand")).toHaveAttribute("title", INITIATIVE_NAME);
  });
  it("the Ask FAB is labelled for the view, not the dataset", () => {
    const { container } = render(<AskFab />);
    const fab = screen.getByTestId("ask-fab");
    expect(fab).toHaveAttribute("aria-label", ASK_LABEL);
    expect(fab.getAttribute("title")).toContain(ASK_LABEL);
    expect(namesDataset(renderedText(container))).toBe(false);
  });
  it("the loading screen names the initiative and describes the dataset without naming it", () => {
    const { container } = render(<LoadingScreen force />);
    expect(screen.getByTestId("loading-title")).toHaveTextContent(INITIATIVE_NAME);
    expect(namesDataset(renderedText(container))).toBe(false);
  });
  it("the assistant's disabled card, its contract line and its empty-state sentences", () => {
    const { container } = render(<DisabledCard reason="not mounted" model="" functions={["query_emissions"]} rule="every figure is a placeholder" />);
    expect(screen.getByTestId("disabled-card")).toHaveTextContent(ASK_LABEL);
    expect(namesDataset(renderedText(container))).toBe(false);
    expect(ASK_CONTRACT).toBe("The assistant interprets your question; the inventory engine supplies every number. It never calculates from documents or prose.");
    for (const s of [ASK_CONTRACT, ...ASK_SENTENCES]) expect(namesDataset(s), s.slice(0, 40)).toBe(false);
  });
  it("the Overview's and the Grapher's own copy", () => {
    for (const s of [SHORT_SUMMARY, INDEPENDENT_LINE, EXPLORE.reading.notOfficial.text]) expect(namesDataset(s), s.slice(0, 40)).toBe(false);
  });
  it("the identity line falls back to the initiative when the API sends none", () => {
    const dims = { fiscalPeriods: ["FY2023_24"] };
    const labels = { periods: { FY2023_24: { short: "2023–24" } } } as unknown as Labels;
    expect(identityLine(undefined, dims, labels)).toContain(INITIATIVE_NAME);
    expect(namesDataset(identityLine(undefined, dims, labels))).toBe(false);
    // …and prints the API's own string verbatim when it sends one, which does name the dataset
    expect(identityLine(RELEASE as unknown as Record<string, unknown>, dims, labels)).toBe(RELEASE.identity_line);
  });
});

describe("the dataset keeps its name where it belongs", () => {
  it("the release's citation, its identity line and its cite-as", () => {
    expect(namesDataset(RELEASE.citation.apa)).toBe(true);
    expect(namesDataset(RELEASE.citation.bibtex)).toBe(true);
    expect(RELEASE.citation.cite_as).toContain(DATASET_NAME);
    expect(RELEASE.identity_line).toContain(DATASET_NAME);
  });
});

// --- the static sweep

const SRC = join(__dirname, "..");

/**
 * The two shipped files that may still write the dataset's name, and why: `map/basemap.ts`
 * credits the API the values come from (an attribution, of a kind with the citation) and
 * `lib/api.ts` documents the route prefix the API itself serves. Everything else under src —
 * the tests and the fixtures aside, which carry the API's own payloads — must not.
 */
const ALLOWED = ["components/map/basemap.ts", "lib/api.ts"];

function shippedFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__") shippedFiles(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.[tj]sx?$/.test(name) && name !== "types.gen.ts") {
      out.push(p);
    }
  }
  return out;
}

describe("no shipped source file names the dataset in the interface", () => {
  const files = shippedFiles(SRC);
  it("finds the shipped files (the sweep is not scanning an empty tree)", () => {
    expect(files.length).toBeGreaterThan(100);
  });
  it("only the attribution and the API's route prefix carry it", () => {
    const carriers = files.map((f) => f.slice(SRC.length + 1)).filter((rel) => readFileSync(join(SRC, rel), "utf8").includes(DATASET_NAME));
    expect(carriers.sort()).toEqual([...ALLOWED].sort());
  });
});
