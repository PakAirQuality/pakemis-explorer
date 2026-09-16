/**
 * The preview reads the product's own bytes, so what it must never do is show a value the file does
 * not contain. Two ways that happens: a row the range cut in half, and a quoted field with a newline
 * inside it.
 */
import { describe, expect, it } from "vitest";
import { parsePreview, parseRows } from "./preview";

describe("parseRows", () => {
  it("keeps a quoted newline inside its field", () => {
    // ⚠ REAL, NOT HYPOTHETICAL. fact_completeness carries multi-sentence justifications and one of
    // them runs onto a second line inside its quotes. Splitting the text on "\n" first tears that row
    // in half and shifts every column after it — a preview that looks right and is wrong.
    const text = 'code,justification,claim\n(air),"Process particulates from kilns, mills\nand quarrying - distinct from combustion.",not-acquired\n';
    const { rows } = parseRows(text);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveLength(3);
    expect(rows[1][1]).toContain("mills\nand quarrying");
    expect(rows[1][2]).toBe("not-acquired");
  });

  it("keeps a quoted comma out of the column count", () => {
    const { rows } = parseRows('a,b\n1,"x, y"\n');
    expect(rows[1]).toEqual(["1", "x, y"]);
  });

  it('reads "" as one escaped quote', () => {
    const { rows } = parseRows('a\n"he said ""no"""\n');
    expect(rows[1][0]).toBe('he said "no"');
  });
});

describe("parsePreview", () => {
  const head = "period_id,sector,co2e_Mt_AR5\nFY2023-24,agriculture,223.45\nFY2023-24,power,57.82\n";

  it("DROPS THE ROW THE RANGE CUT IN HALF", () => {
    // THE ASSERTION I WOULD MOST WANT KEPT HERE. 64 KB lands wherever it lands, essentially never on
    // a newline, so the last line is a fragment - a number with its tail missing reads exactly like a
    // smaller number. Showing it would put a wrong figure on screen in a product whose whole claim is
    // that its figures are the file's own.
    const cut = `${head}FY2023-24,transp`;
    const p = parsePreview(cut, false);
    expect(p.rows.map((r) => r[1])).toEqual(["agriculture", "power"]);
    expect(p.rows.flat().join(" ")).not.toContain("transp");
    expect(p.complete).toBe(false);
  });

  it("keeps the last row when the bytes were the whole file", () => {
    const p = parsePreview(`${head}FY2023-24,transport,40.19`, true);
    expect(p.rows).toHaveLength(3);
    expect(p.rows[2]).toEqual(["FY2023-24", "transport", "40.19"]);
  });

  it("takes the header from the first real line, not a comment banner", () => {
    // several release tables open with a '#' note explaining units and boundary
    const p = parsePreview(`# tonnes of product, not of nitrogen\n${head}`, true);
    expect(p.columns).toEqual(["period_id", "sector", "co2e_Mt_AR5"]);
    expect(p.rows).toHaveLength(2);
  });

  it("holds to its row limit and survives an empty body", () => {
    const many = `a,b\n${Array.from({ length: 50 }, (_, i) => `${i},x`).join("\n")}\n`;
    expect(parsePreview(many, true, 10).rows).toHaveLength(10);
    expect(parsePreview("a,b\n", true).rows).toEqual([]);
    expect(parsePreview("", true).columns).toEqual([]);
  });
});
