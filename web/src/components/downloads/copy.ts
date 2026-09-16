/** The words of the Downloads page. The family titles and descriptions the API sends win over the fallbacks here; these fill the panel while it loads or when it is absent. No digit is authored here. */
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
  browseTables: "Browse the tables",
  hero: "Download the data",
  dekLines: ["Emissions estimates and the activity data behind them."],
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

/* The seven PURPOSES and their helpers were removed with the purpose-picker on 2026-09-16. The page
   is five named collections now, and what each download IS lives in catalogue.ts beside the filename
   it resolves to - so there is one place to read rather than a purpose here and a family there. */
