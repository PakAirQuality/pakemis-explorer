/**
 * The answer's shapes: a list with an intro line above it, a numbered list, a Markdown table whose
 * figures are still cites, and the server's checked links - drawn as links to this site's pages,
 * or as plain words where the destination is unknown.
 */
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "@/components/downloads/catalogue";
import { dataFilesOf, downloadForTable, resolveLink } from "./answerLinks";
import { renderAnswer, type CiteHandlers } from "./answerText";
import type { TimelineItem } from "./types";

const cite = (k: number, cell: number, text: string) => `<cite k="${k}" cell="${cell}" receipt="0123456789abcdef0123456789abcdef">${text}</cite>`;
const handlers = (link?: CiteHandlers["link"]): CiteHandlers => ({ hover: vi.fn(), click: vi.fn(), link });
const linkTo = (to: string, label: string) => resolveLink(to, label, COLLECTIONS);

function show(text: string, h: CiteHandlers = handlers(linkTo)) {
  return render(<div data-testid="answer">{renderAnswer(text, h)}</div>);
}

describe("lists", () => {
  it("draws an intro line and the bullets under it as a sentence and a list, with no bare markers", () => {
    show("Yes. The records include:\n- vehicle registrations\n- livestock populations\n- crop areas\n\nVisit the page.");
    const answer = screen.getByTestId("answer");
    const list = screen.getByTestId("answer-list");
    expect(list.tagName).toBe("UL");
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["vehicle registrations", "livestock populations", "crop areas"]);
    // the intro is its own paragraph, before the list, and nothing prints a dash
    expect(answer.querySelector("p")).toHaveTextContent("Yes. The records include:");
    expect(answer.textContent).not.toMatch(/(^|\s)- /);
    expect(answer.querySelectorAll("p")).toHaveLength(2);
  });

  it("draws a list introduced by a colon even when it has a single item", () => {
    show("One record is held:\n- the vehicle register");
    expect(within(screen.getByTestId("answer-list")).getAllByRole("listitem")).toHaveLength(1);
  });

  it("leaves a lone dash line with no intro as text", () => {
    show("A note\n- not a list");
    expect(screen.queryByTestId("answer-list")).toBeNull();
  });

  it("draws numbered items as an ordered list", () => {
    show("Steps:\n1. open Downloads\n2. pick the table");
    const list = screen.getByTestId("answer-list");
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["open Downloads", "pick the table"]);
  });
});

describe("tables", () => {
  const TABLE = [
    "Lahore's register held these vehicles at 30 June 2023:",
    "",
    `| Class | Registered (${cite(1, 0, "vehicles")}) |`,
    "|---|---:|",
    `| Motorcycles and scooters | ${cite(1, 1, "4,120,330")} |`,
    `| Motor cars, jeeps and station wagons | ${cite(1, 0, "1,561,386")} |`,
  ].join("\n");

  it("draws a Markdown table, header and rows, with its figures still cited", () => {
    show(TABLE);
    const table = screen.getByTestId("answer-table");
    const heads = within(table).getAllByRole("columnheader");
    expect(heads.map((h) => h.textContent)).toEqual(["Class", "Registered (vehicles)"]);
    const rows = screen.getAllByTestId("answer-table-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Motorcycles and scooters", "4,120,330"]);
    // the figure is a cite, not text: hovering it still leads to its result
    expect(within(rows[1]).getByTestId("cite")).toHaveTextContent("1,561,386");
    expect(within(rows[1]).getByTestId("cite")).toHaveAttribute("data-k", "1");
    // the separator row is not printed, nor any pipe
    expect(screen.getByTestId("answer").textContent).not.toMatch(/\||---/);
  });

  it("right-aligns a column the separator marks with a trailing colon", () => {
    show(TABLE);
    const cells = within(screen.getAllByTestId("answer-table-row")[0]).getAllByRole("cell");
    expect(cells[0].className).toContain("text-left");
    expect(cells[1].className).toContain("text-right");
  });

  it("reads a table written straight under its intro line, and pads a ragged row", () => {
    show(`Two classes:\n| Class | Count | Note |\n|---|---:|---|\n| Cars | ${cite(1, 0, "12")} |`);
    expect(screen.getByTestId("answer").querySelector("p")).toHaveTextContent("Two classes:");
    const cells = within(screen.getByTestId("answer-table-row")).getAllByRole("cell");
    expect(cells.map((c) => c.textContent)).toEqual(["Cars", "12", ""]);
  });

  it("scrolls inside its own box rather than widening the panel", () => {
    show(TABLE);
    expect(screen.getByTestId("answer-table-wrap").className).toContain("overflow-x-auto");
  });

  it("leaves a pipe in prose alone", () => {
    show("Use the A | B split as printed.");
    expect(screen.queryByTestId("answer-table")).toBeNull();
  });
});

describe("links", () => {
  it("draws a checked section link as the word Downloads, to that section", () => {
    show('Visit the "The activity behind the estimates" section on the <plink to="downloads:activity">Downloads</plink> page.');
    const link = screen.getByTestId("answer-link");
    expect(link).toHaveTextContent("Downloads");
    expect(link.getAttribute("href")).toBe("/downloads?show=activity");
    expect(screen.getByTestId("answer")).toHaveTextContent('Visit the "The activity behind the estimates" section on the Downloads page.');
  });

  it("draws a file link as the download's own title, to its entry", () => {
    show('The full table is <plink to="file:fact_activity_vehicles">fact_activity_vehicles</plink>.');
    const link = screen.getByTestId("answer-link");
    expect(link).toHaveTextContent("Registered vehicles by district");
    expect(link.getAttribute("href")).toBe("/downloads?item=vehicles");
  });

  it("prints the label as text where the destination is unknown, or no resolver is given", () => {
    show('See <plink to="elsewhere:x">there</plink>.');
    expect(screen.queryByTestId("answer-link")).toBeNull();
    expect(screen.getByTestId("answer")).toHaveTextContent("See there.");
    show('See <plink to="downloads">Downloads</plink>.', handlers());
    expect(screen.queryAllByTestId("answer-link")).toHaveLength(0);
  });

  it("draws links and cites side by side in one sentence", () => {
    show(`It held ${cite(1, 0, "1,561,386")}; the table is on <plink to="downloads">Downloads</plink>.`);
    expect(screen.getByTestId("cite")).toHaveTextContent("1,561,386");
    expect(screen.getByTestId("answer-link").getAttribute("href")).toBe("/downloads");
  });
});

describe("where links go", () => {
  it("knows the page, its five sections, and every table the page offers", () => {
    expect(linkTo("downloads", "Downloads")).toEqual({ href: "/downloads", label: "Downloads" });
    for (const s of ["emissions", "activity", "air", "methods", "maps"]) expect(linkTo(`downloads:${s}`, "Downloads")?.href).toBe(`/downloads?show=${s}`);
    expect(linkTo("downloads:all", "Downloads")).toBeNull();
    expect(linkTo("https://example.com", "x")).toBeNull();
    // a table the release serves but the page does not list goes to the page, not to nowhere
    expect(linkTo("file:dim_gas", "dim_gas")).toEqual({ href: "/downloads", label: "Downloads" });
    for (const c of COLLECTIONS) for (const d of c.downloads.filter((x) => !x.pending)) {
      const stem = d.files[0].replace(/\.[^.]+$/, "");
      expect(downloadForTable(COLLECTIONS, stem)?.id).toBe(d.id);
    }
  });

  it("lists the downloads a turn's figures came from, each once, skipping tables the page does not offer", () => {
    const tool = (k: number, tables: string[]): TimelineItem =>
      ({ kind: "tool", k, name: "query_activity", input: {}, result: { k, source_tables: tables } } as unknown as TimelineItem);
    expect(downloadForTable(COLLECTIONS, "fact_not_offered")).toBeNull();
    const files = dataFilesOf([tool(1, ["fact_activity_vehicles"]), tool(2, ["fact_activity_vehicles", "fact_not_offered", "fact_activity_livestock"])], COLLECTIONS);
    expect(files.map((d) => d.id)).toEqual(["vehicles", "livestock"]);
    expect(dataFilesOf([], COLLECTIONS)).toEqual([]);
  });
});
