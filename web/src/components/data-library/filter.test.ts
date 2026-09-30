import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "@/lib/products";
import { libraryPage } from "./filter";

const asset = (index: number): LibraryAsset => ({ asset_id: `shared.${index}`, title: `Fuel ${String(index).padStart(3, "0")}`,
  description: "Source observations", owner_sector: "shared", sectors: ["power", "industry"], purpose: "activity",
  kind: "table", license: "own-work", source_refs: ["NEPRA"], downloadable: true, formats: [],
  columns: [{ field_id: "amount", name: "Fuel consumed" }] });

describe("data library filters", () => {
  it("lists shared assets once and searches readable column names", () => {
    const result = libraryPage([asset(1)], { sector: "industry", purpose: "activity", q: "NEPRA consumed", page: 1 });
    expect(result.total).toBe(1);
    expect(libraryPage([asset(1)], { sector: "aviation", purpose: "", q: "", page: 1 }).total).toBe(0);
  });
  it("limits each page to 50 and clamps a copied page URL to valid results", () => {
    const values = Array.from({ length: 107 }, (_, index) => asset(index));
    const second = libraryPage(values, { sector: "", purpose: "", q: "", page: 2 });
    expect(second.items).toHaveLength(50);
    expect(second.items[0].asset_id).toBe("shared.50");
    const end = libraryPage(values, { sector: "shared", purpose: "activity", q: "", page: 999 });
    expect(end.page).toBe(3);
    expect(end.items).toHaveLength(7);
  });
});
