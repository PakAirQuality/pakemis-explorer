/**
 * The reader's labels: every wording comes from /release.labels (the fixture mirrors the
 * server's block); the helpers only look ids up, lower an initial, or drop a basis token.
 */
import { describe, expect, it } from "vitest";
import { releaseLabels } from "./release";
import type { ReleaseInfo } from "./envelope";
import { RELEASE } from "@/__tests__/fixtures";
import { cellUnit, configLabel, configTooltip, configWords, contextPill, envelopeUnitLine, gwpCompact, gwpIsDefault, gwpLabel, gwpTooltip, lulucfCompact, lulucfShort, lulucfTooltip, scopeWords, sectorWords, unitShort, unitWords } from "./labels";

const labels = releaseLabels(RELEASE as unknown as ReleaseInfo);
const bare = releaseLabels(undefined);

describe("GWP labels", () => {
  it("gwpLabel / gwpCompact / gwpTooltip read the release's block and fall back to the id", () => {
    expect(gwpLabel(labels, "AR5")).toBe("IPCC 2013 (AR5)");
    expect(gwpLabel(labels, "AR6")).toBe("IPCC 2021 (AR6)");
    expect(gwpCompact(labels, "AR5")).toBe("IPCC AR5");
    expect(gwpTooltip(labels, "AR5")).toBe("CO₂-equivalent using the IPCC Fifth Assessment Report's 100-year warming potentials (CH₄ × 28, fossil CH₄ × 30, N₂O × 265)");
    expect(gwpTooltip(labels, "AR6")).toContain("Sixth Assessment Report");
    expect(gwpLabel(bare, "AR5")).toBe("AR5");
    expect(gwpTooltip(bare, "AR5")).toBe("");
  });
  it("gwpIsDefault follows the release's is_default, then the caller's default when the labels are silent", () => {
    expect(gwpIsDefault(labels, "AR5")).toBe(true);
    expect(gwpIsDefault(labels, "AR6")).toBe(false);
    expect(gwpIsDefault(bare, "AR5", "AR5")).toBe(true);
    expect(gwpIsDefault(bare, "AR6", "AR5")).toBe(false);
    expect(gwpIsDefault(bare, "AR5")).toBe(false);
  });
});

describe("configuration labels", () => {
  it("configLabel is the server's wording, configWords its running-text form, configTooltip the note", () => {
    expect(configLabel(labels, "REF_2023_24")).toBe("Reference estimate");
    expect(configLabel(labels, "S_2023_24")).toBe("Survey-based estimate");
    expect(configWords(labels, "REF_2023_24")).toBe("reference estimate");
    expect(configWords(labels, "S_2023_24")).toBe("survey-based estimate");
    expect(configTooltip(labels, "REF_2023_24")).toBe("every axis at its reference setting; residential dung on the ledger basis (L)");
    expect(configLabel(bare, "X_1")).toBe("X_1");
    expect(configTooltip(bare, "X_1")).toBe("X_1");
  });
});

describe("LULUCF labels", () => {
  it("short, compact and tooltip come from the release; empty without it", () => {
    expect(lulucfShort(labels)).toBe("excludes land use and forestry");
    expect(lulucfCompact(labels)).toBe("land use excluded");
    expect(lulucfTooltip(labels)).toBe("an exploratory Tier-1 module publishes a provisional sink outside every total");
    expect(lulucfShort(bare)).toBe("");
  });
});

describe("units", () => {
  it("unitWords and unitShort drop the GWP basis token and subscript the species", () => {
    expect(unitWords("Mt CO2e AR5")).toBe("million tonnes CO₂e");
    expect(unitWords("Gg CO2e AR6")).toBe("thousand tonnes CO₂e");
    expect(unitWords("t CH4")).toBe("tonnes CH₄");
    expect(unitWords("rows")).toBe("rows");
    expect(unitShort("Mt CO2e AR5")).toBe("Mt CO₂e");
    expect(unitShort("Mt CO2e AR6")).toBe("Mt CO₂e");
    expect(unitShort("Gg")).toBe("Gg");
    expect(unitShort("t CH4")).toBe("t CH₄");
    expect(unitShort("percent")).toBe("percent");
  });
  it("cellUnit prefers the server's unit_short, else the unit through unitShort", () => {
    expect(cellUnit({ unit: "Mt CO2e AR5", unit_short: "Mt CO₂e (served)" })).toBe("Mt CO₂e (served)");
    expect(cellUnit({ unit: "Mt CO2e AR5" })).toBe("Mt CO₂e");
    expect(cellUnit({ unit: "" })).toBe("");
    expect(cellUnit(null)).toBe("");
  });
  it("envelopeUnitLine capitalises the words and never carries a basis", () => {
    expect(envelopeUnitLine({ values: [{ unit: "Mt CO2e AR5" }] })).toBe("Million tonnes CO₂e");
    expect(envelopeUnitLine({ values: [{ unit: "Mt CO2e AR5", unit_words: "million tonnes CO₂e" }] })).toBe("Million tonnes CO₂e");
    expect(envelopeUnitLine({ values: [] })).toBe("");
    expect(envelopeUnitLine(null)).toBe("");
  });
});

describe("scope lines", () => {
  it("scopeWords: period · configuration, the GWP basis only when it is not the default, then the caller's parts", () => {
    expect(scopeWords(labels, { period: "FY2023-24", config: "REF_2023_24", gwp: "AR5" })).toBe("2023–24 · reference estimate");
    expect(scopeWords(labels, { period: "FY2023-24", config: "REF_2023_24", gwp: "AR6" })).toBe("2023–24 · reference estimate · IPCC 2021 (AR6)");
    expect(scopeWords(labels, { period: "FY2023-24", config: "S_2023_24", gwp: "AR5" }, "AR5", "Agriculture", null, "Jul 2023")).toBe("2023–24 · survey-based estimate · Agriculture · Jul 2023");
    expect(scopeWords(bare, { period: "FY2023-24", config: "REF_2023_24", gwp: "AR5" }, "AR5")).toBe("FY2023-24 · REF_2023_24");
  });
  it("sectorWords says 'all sectors' for no sector", () => {
    expect(sectorWords(labels, null)).toBe("all sectors");
    expect(sectorWords(labels, "agriculture")).toBe("Agriculture");
  });
  it("contextPill: basis · configuration · IPCC ARn · land use, with the long forms as the title and no version anywhere", () => {
    const pill = contextPill(labels, RELEASE.context_bar, { config: "REF_2023_24", gwp: "AR5" });
    expect(pill.words).toBe("July–June years · reference estimate · IPCC AR5 · land use excluded");
    expect(pill.title).toBe("July–June years · Reference estimate · IPCC 2013 (AR5) · excludes land use and forestry: an exploratory Tier-1 module publishes a provisional sink outside every total");
    expect(pill.words + pill.title).not.toContain("1.0.0rc");
    expect(contextPill(labels, { basis: "fiscal" }, { config: "S_2023_24", gwp: "AR6" }).words).toBe("fiscal · survey-based estimate · IPCC AR6 · land use excluded");
  });
});
