/** The words of the Downloads page: purpose-first. The family titles and descriptions the API sends win over the fallbacks here; these fill the panel while it loads or when it is absent. No digit is authored here. */
export const DOWNLOADS = {
  title: "Downloads & API",
  dek: "Start from what you want to study. Every file carries the release's schema, its checksum and the citation that names the release.",
  docs: "API documentation",
  question: "What do you want to study?",
  choose: "Choose a purpose above to see its files.",
  files: "Files",
  schema: "Schema",
  hideSchema: "Hide schema",
  checksums: "Checksums",
  hideChecksums: "Hide checksums",
  archive: "Download everything as one archive",
  cite: { title: "Cite and identify this release", copy: "Copy APA", bibtex: "Copy BibTeX", copied: "Copied" },
  api: { title: "Query through the API", lead: "An example request: the current view's national total as one POST, answered with an envelope and a Result ID.", explorer: "Open API explorer", metadata: "Download metadata" },
  replay: { title: "Reproduce a result", lead: "A result's Result ID replays its query and returns the same envelope." },
} as const;

export type Purpose = {
  id: string;
  title: string;
  description: string;
  /** The API family the purpose maps to. */
  family: string;
  /** A narrowing of the family's products: the grid cubes only, or the tables only. */
  only?: "cubes" | "tables";
  /** The family's title and description while the catalogue loads. */
  fallback: { title: string; description: string };
};

/** The seven purposes, in the order the page offers them, each mapped to a `/products` family. */
export const PURPOSES: Purpose[] = [
  { id: "totals", title: "National and sector totals", description: "The annual inventory by sector, IPCC category, gas and estimate, with every dimension table.", family: "annual", fallback: { title: "Annual inventory", description: "Nine fiscal years by sector, IPCC category, component, gas, configuration and GWP basis, with every dimension table." } },
  { id: "monthly", title: "Monthly emissions", description: "Every month of every year, closing to the annual totals, with the timing evidence graded.", family: "monthly", fallback: { title: "Monthly inventory", description: "All months with annual closure, temporal profiles and evidence classifications." } },
  { id: "allocations", title: "Province and district allocations", description: "The reference year placed in provinces and districts, with the unallocated mass and the evidence behind each placement.", family: "spatial", only: "tables", fallback: { title: "Spatial inventory", description: "Reference-year administrative allocations with fallback, lineage and unallocated-mass tables." } },
  { id: "gridded", title: "Gridded emissions", description: "The monthly grid cubes of the reference year, one per estimate.", family: "spatial", only: "cubes", fallback: { title: "Spatial inventory", description: "Reference-year gridded allocations as NetCDF cubes." } },
  { id: "uncertainty", title: "Uncertainty and configurations", description: "The intervals by category and resolution, the common draws, the completeness ledgers and the named structural alternatives.", family: "uncertainty", fallback: { title: "Uncertainty and scenarios", description: "Common correlated draws, uncertainty summaries, completeness ledgers, transfers and the named structural configurations." } },
  { id: "evidence", title: "Evidence and provenance", description: "The evidence classes behind every stream, the stream register, and the registries the claim record joins.", family: "evidence", fallback: { title: "Evidence and provenance", description: "The evidence classes behind every stream, the stream register, the completeness ledgers and the registries the claim record joins." } },
  { id: "complete", title: "Complete release", description: "Every file of the release payload, also as one archive with its checksums inside.", family: "complete", fallback: { title: "Complete release", description: "Every file of the release payload, also as one zip archive with SHA256SUMS." } },
];

export function purposeById(id: string | null | undefined): Purpose | undefined {
  return PURPOSES.find((p) => p.id === id);
}
