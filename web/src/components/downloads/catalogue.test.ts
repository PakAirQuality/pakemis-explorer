import { describe, expect, it } from "vitest";
import { DownloadCatalogSchema } from "@/lib/products";
import { collectionsFor, COLLECTIONS } from "./catalogue";

describe("release download catalogue", () => {
  it("uses release titles and input files without a frontend catalogue edit", () => {
    const catalog = DownloadCatalogSchema.parse({ schema: "pakemis.download_catalog/v1", collections: [
      { id: "activity", title: "Model source tables", dek: "Shared input data", downloads: [
        { id: "input-new", title: "Newly published fuel", dek: "Exact model input", coverage: "One row", icon: "Fuel", files: ["input_activity_new.csv"] },
      ] },
    ] });
    const [collection] = collectionsFor(catalog);
    expect(collection.title).toBe("Model source tables");
    expect(collection.downloads[0].title).toBe("Newly published fuel");
    expect(collection.downloads[0].files).toEqual(["input_activity_new.csv"]);
    expect(collection.downloads[0].icon).toBeDefined();
  });
  it("continues to support previously published releases", () => {
    expect(collectionsFor(undefined)).toBe(COLLECTIONS);
  });
});
