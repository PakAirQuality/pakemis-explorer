/** The words of the Downloads & API page, from the 2026-08-30 mockups. The product titles and descriptions the API sends win over these; these fill the cards while it loads or when it is absent. */
export const DOWNLOADS = {
  title: "Downloads & API",
  dek: "Choose the product that matches your question. Every download carries release metadata, schema information, checksums and citation guidance.",
  docs: "API documentation",
  release: { title: "PakEmis publication release", scope: "non-LULUCF", doiMissing: "data DOI to be inserted at release freeze", notes: "Release notes", verify: "Verify checksums" },
  which: "Which product do you need?",
  cite: { title: "Cite the release", copy: "Copy", bibtex: "BibTeX", copied: "Copied" },
  api: { title: "Query through the API", lead: "An example request: the current view's national total as one POST, answered with an envelope and a Result ID.", explorer: "Open API explorer", metadata: "Download metadata" },
  replay: { title: "Reproduce a result", lead: "A result's Result ID replays its query and returns the same envelope." },
  download: "Download",
  schema: "View schema",
  hideSchema: "Hide schema",
} as const;

export type FamilyCopy = { id: string; title: string; description: string; formats: string; useCase: string; footnote: string };

/** The four product families as the mockups word them, keyed by the API's family ids. */
export const FAMILIES: FamilyCopy[] = [
  { id: "annual", title: "Annual inventory", description: "Nine fiscal years by sector, IPCC category, component, gas, configuration and GWP basis.", formats: "CSV · Parquet", useCase: "Compare years", footnote: "Annual inventory is recommended for comparing fiscal years." },
  { id: "monthly", title: "Monthly inventory", description: "All 108 months with annual closure, temporal profiles and evidence classifications.", formats: "CSV · Parquet", useCase: "Study seasonality", footnote: "Monthly inventory is recommended for studying seasonality within a year." },
  { id: "spatial", title: "Spatial inventory", description: "Reference-year administrative and 0.05° allocations with fallback, lineage and unallocated-mass tables.", formats: "NetCDF · CSV", useCase: "Make a map", footnote: "Spatial inventory is recommended for making a map; its allocations carry an evidence class." },
  { id: "uncertainty", title: "Uncertainty & scenarios", description: "Common correlated draws, uncertainty summaries and named structural configurations.", formats: "CSV · Parquet", useCase: "Analyse uncertainty", footnote: "Uncertainty & scenarios is recommended for analysing uncertainty and the structural alternatives." },
];
