/** The words of the Downloads page: purpose-first. The family titles and descriptions the API sends win over the fallbacks here; these fill the panel while it loads or when it is absent. No digit is authored here. */
export const DOWNLOADS = {
  title: "Downloads & API",
  dek: "Start from what you want to study. Every file carries the release's schema, its checksum and the citation that names the release.",
  docs: "API documentation",
  question: "What data do you need?",
  choose: "Choose a purpose above to see its files.",
  files: "Files",
  schema: "Column guide",
  hideSchema: "Hide columns",
  checksums: "Checksums",
  hideChecksums: "Hide checksums",
  archive: "Download everything as one archive",
  cite: { title: "Cite and identify this release", copy: "Copy APA", bibtex: "Copy BibTeX", copied: "Copied" },
  eyebrow: "Data release",
  hero: "Download the data",
  dekLines: ["Choose what you want to study. We\u2019ll show you the relevant files."],
  chooseSub: "Choose a topic to see the available files.",
  completeRelease: "Download all data",
  yourDownload: "Your download",
  always: "Every file comes with its column guide, checksum and citation.",
  downloadAll: (n: number) => (n === 1 ? "Download the file" : `Download ${n} files`),
  preview: "Data guide",
  hidePreview: "Hide the data guide",
  copyCitation: "How to cite",
  refConfig: "Reference configuration",
  refNote: "Files remain tied to the same release and reporting period.",
  modes: { label: "Files or the API", files: "Files", api: "API" },
  researchers: "For researchers and developers",
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
  { id: "totals", title: "National and sector totals", description: "Annual emissions for Pakistan, with breakdowns by sector, gas and reporting category.", family: "annual", fallback: { title: "Annual inventory", description: "Nine fiscal years by sector, IPCC category, component, gas, configuration and GWP basis, with every dimension table." } },
  { id: "monthly", title: "Monthly emissions", description: "Monthly estimates for every year, with a note explaining how each pattern was produced.", family: "monthly", fallback: { title: "Monthly inventory", description: "All months with annual closure, temporal profiles and evidence classifications." } },
  { id: "allocations", title: "Provinces and districts", description: "Emissions estimates for each province and district.", family: "spatial", only: "tables", fallback: { title: "Spatial inventory", description: "Reference-year administrative allocations with fallback, lineage and unallocated-mass tables." } },
  { id: "gridded", title: "Gridded emissions", description: "Monthly emissions estimates shown on a regular grid across Pakistan.", family: "spatial", only: "cubes", fallback: { title: "Spatial inventory", description: "Reference-year gridded allocations as NetCDF cubes." } },
  { id: "uncertainty", title: "Uncertainty and alternative estimates", description: "Ranges showing how certain the estimates are and how the results change under other reasonable assumptions.", family: "uncertainty", fallback: { title: "Uncertainty and scenarios", description: "Common correlated draws, uncertainty summaries, completeness ledgers, transfers and the named structural configurations." } },
  { id: "evidence", title: "Sources and evidence", description: "The public records behind the inventory, with notes on where the evidence is strong or limited.", family: "evidence", fallback: { title: "Evidence and provenance", description: "The evidence classes behind every stream, the stream register, the completeness ledgers and the registries the claim record joins." } },
  { id: "air", title: "Air quality (beta)", description: "Seven sectors\u2019 NOx, SO\u2082, CO, NMVOC, PM\u2082.\u2085, black carbon and NH\u2083, in kilotonnes of each pollutant.", family: "air", fallback: { title: "Air quality (beta)", description: "The companion air-pollutant layer: native kilotonnes, outside the greenhouse-gas totals." } },
  { id: "complete", title: "Complete release", description: "Every file of the release payload, also as one archive with its checksums inside.", family: "complete", fallback: { title: "Complete release", description: "Every file of the release payload, also as one zip archive with SHA256SUMS." } },
];

export function purposeById(id: string | null | undefined): Purpose | undefined {
  return PURPOSES.find((p) => p.id === id);
}
