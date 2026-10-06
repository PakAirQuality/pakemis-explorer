/**
 * The documentation is held to the release on WHICH YEARS EXIST AT WHICH RESOLUTION.
 *
 * A reviewer found the methodology saying "Spatial products exist for the reference year only"
 * while Downloads listed the same products for nine fiscal years. Both were authored sentences, so
 * neither could notice the other, and the false one was the technical page. This reads the pinned
 * release from disk - the tables themselves, not a fixture, which would only prove the page agrees
 * with itself - and asserts three things: the years Downloads claims for the province and district
 * tables are the years those tables carry; the province, district and unallocated MONTHLY tables
 * hold the reference year alone; and the stale sentence is gone from the source.
 *
 * The grid cubes are NetCDF, which nothing here can open; `api/tests/test_spatial_coverage.py`
 * reads them, and the same file asserts what the API says about all of this.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COLLECTIONS, type Download } from "@/components/downloads/catalogue";

const ROOT = path.join(__dirname, "../../..");
// the PINNED version, as the API reads it: the newest directory is not necessarily the served one
const pinned = /^pinned:\s*(\S+)/m.exec(readFileSync(path.join(ROOT, "RELEASES.md"), "utf8"))?.[1] ?? "";
const SEMANTIC = path.join(ROOT, "data/releases", pinned, "outputs/semantic");

/** The rows of one CSV as objects of the columns asked for. Quote-aware: the dim tables carry commas inside quoted notes. */
function rows(file: string, columns: string[]): Record<string, string>[] {
  const text = readFileSync(path.join(SEMANTIC, file), "utf8");
  const out: Record<string, string>[] = [];
  let header: string[] | null = null;
  let want: number[] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  const endRecord = () => {
    record.push(field);
    field = "";
    if (!header) {
      header = record;
      want = columns.map((c) => header!.indexOf(c));
      expect(want.every((ix) => ix >= 0), `${file} has no column among ${columns.join(", ")}: ${header.join(",")}`).toBe(true);
    } else if (record.length > 1 || record[0] !== "") {
      out.push(Object.fromEntries(columns.map((c, k) => [c, record[want[k]] ?? ""])));
    }
    record = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { record.push(field); field = ""; }
    else if (ch === "\n") endRecord();
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || record.length) endRecord();
  return out;
}
const distinct = (file: string, column: string) => new Set(rows(file, [column]).map((r) => r[column]));

/** The count a coverage line opens with, as the number it words ("Nine fiscal years" -> 9). */
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
function claimed(text: string, noun: string): number {
  const m = new RegExp(`\\b([A-Za-z]+) ${noun}`).exec(text);
  expect(m, `"${text}" states no number of ${noun}`).not.toBeNull();
  const n = WORDS[m![1].toLowerCase()];
  expect(n, `"${m![1]}" is not a number word`).toBeDefined();
  return n;
}
const download = (file: string): Download => {
  const found = COLLECTIONS.flatMap((c) => c.downloads).find((d) => d.files.includes(file));
  expect(found, `no download offers ${file}`).toBeDefined();
  return found!;
};
const source = (rel: string) =>
  readFileSync(path.join(__dirname, "..", rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the spatial documentation agrees with the pinned release", () => {
  it("reads the pinned release, not whichever directory sorts last", () => {
    expect(pinned).toMatch(/^\d+\.\d+\.\d+/);
    expect(existsSync(path.join(SEMANTIC, "fact_adm1_year.csv")), `${pinned} is not fetched under data/releases`).toBe(true);
  });

  // read inside the tests, so a checkout without the payload fails on the assertion above and not at collection
  const fiscalPeriods = () => {
    const periods = rows("dim_period.csv", ["period_id", "basis", "is_reference"]).filter((p) => p.basis === "fiscal");
    return { fiscal: new Set(periods.map((p) => p.period_id)), reference: periods.filter((p) => p.is_reference.toLowerCase() === "true").map((p) => p.period_id) };
  };

  it.each(["fact_adm1_year.csv", "fact_adm2_year.csv", "fact_air_adm1_year.csv", "fact_air_adm2_year.csv"])(
    "%s carries as many fiscal years as Downloads says it does",
    (file) => {
      const { fiscal } = fiscalPeriods();
      const carried = distinct(file, "period_id");
      expect([...carried].sort()).toEqual([...fiscal].sort());
      expect(claimed(download(file).coverage, "fiscal years")).toBe(carried.size);
    },
  );

  it("the province, district and unallocated MONTHLY tables hold the reference year alone, while the national one holds every year", () => {
    const { fiscal, reference } = fiscalPeriods();
    expect(reference).toHaveLength(1);
    const periodOf = new Map(rows("dim_month.csv", ["month", "period_id"]).map((r) => [r.month, r.period_id]));
    const periodsOf = (file: string) => {
      // fact_adm2_month also carries the annual row under month = "all"; it is not a month
      const months = [...distinct(file, "month")].filter((m) => m !== "all");
      expect(months.length, file).toBeGreaterThan(0);
      return [...new Set(months.map((m) => periodOf.get(m)))].sort();
    };
    for (const file of ["fact_adm1_month.csv", "fact_adm2_month.csv", "fact_unallocated.csv"]) expect(periodsOf(file), file).toEqual(reference);
    expect(periodsOf("fact_monthly.csv")).toEqual([...fiscal].sort());
  });

  it("the provincial downloads count the provinces the release has, and name the combined row beside them", () => {
    const adm1 = rows("dim_geography.csv", ["level", "unit_kind"]).filter((r) => r.level === "adm1");
    const provinces = adm1.filter((r) => r.unit_kind === "province").length;
    expect(adm1.length - provinces).toBe(1);
    for (const file of ["fact_adm1_year.csv", "fact_air_adm1_year.csv"]) {
      const coverage = download(file).coverage;
      expect(claimed(coverage, "provinces"), coverage).toBe(provinces);
      expect(coverage).toContain("a combined remainder");
    }
  });

  it("every product that is a back-cast for the years without a geography of their own says so beside its coverage", () => {
    for (const file of ["fact_adm2_year.csv", "fact_air_adm2_year.csv"])
      expect(download(file).dek, file).toMatch(/reference year's pattern, rescaled: a reconstruction, not an observation/);
    const grids = COLLECTIONS.flatMap((c) => c.downloads).filter((d) => ["grid-annual", "grid-air"].includes(d.id));
    expect(grids).toHaveLength(2);
    for (const d of grids) expect(d.dek, d.id).toMatch(/reconstruct/);
  });

  it("THE STALE SENTENCE IS GONE: no source says the spatial products are the reference year's alone, or tags a year national-only", () => {
    // Read from the source with comments stripped, as the caveat guard in methods.test.tsx does: the
    // fixture's two-year release would let a rendered assertion pass whichever sentence was there.
    const methodology = source("components/methods/Methodology.tsx");
    expect(methodology).not.toMatch(/Spatial products exist for the reference year only/i);
    expect(methodology).not.toMatch(/tagged\s+(&ldquo;|“|")national only/i);
    // and the page reads the years from the release rather than restating them
    expect(methodology).toContain("is_reference");
    expect(methodology).toContain("monthsByPeriod");
    expect(methodology).toContain('lim("adm2_history_annual_only")');
    expect(source("components/panels/ExplorePanel.tsx")).not.toMatch(/national only/i);
  });
});
