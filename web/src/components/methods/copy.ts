/**
 * The Methods pages' words, in one place. The story (/methods) follows the mock-up's six
 * illustrated chapters - each illustration shows how the previous step becomes the next - and
 * the sector pages keep their step titles and action labels here too. No number is written in
 * this file: the two live figures the story prints (the covered total, the count of categories
 * recorded NE) are server strings spliced in by Story.tsx. Tone: present-tense facts, no
 * adjective beyond estimated / reconstructed / allocated, and none of the internal vocabulary
 * the reader-page ban lists (tests/methods: PROHIBITED).
 */

/** The seven illustrations, shipped as static files under web/public/methods (see its README). */
export const ILLUSTRATION_DIR = "/methods";

export type StoryStep = {
  /** The anchor id stem and the illustration's file stem ("sources" -> #step-sources, 01-sources.svg). */
  id: "sources" | "calculations" | "sectors" | "totals" | "time-place" | "limits";
  /** The two-digit chapter number, as printed. */
  n: string;
  /** The strip label ("Sources"). */
  short: string;
  title: string;
  body: string;
  link: { label: string; href: string };
  file: string;
  alt: string;
};

export const STORY = {
  eyebrow: "How we built the inventory",
  headline: "From public records to Pakistan’s emissions",
  dek: "Follow the evidence, the calculations and the choices behind each estimate.",
  scope: "Greenhouse gases · Air pollutants (beta)",
  follow: "Follow the story",
  browse: "Browse the evidence",
  readMethodology: "Read the methodology",
  heroFile: "00-overview.svg",
  heroAlt: "Public records become emissions estimates, which together form a national picture.",
  strip: "The story behind the numbers",
  /** Step 4's caption; the figure and its unit are the server's. */
  totalCaption: (period: string) => `In ${period}, the sources the inventory covers add up to`,
  /** Step 6's caption; the count is the completeness table's. */
  gapsCaption: (n: number | null) => (n === null ? "" : n === 1 ? "One category is recorded NE." : `${n} categories are recorded NE.`),
  lulucfLead: "Land use and forestry remain outside the main total:",
  close: {
    title: "Follow a number back to its source.",
    dek: "Explore the data, methods and assumptions behind Pakistan’s emissions.",
    explore: "Explore the inventory",
    evidence: "Browse the evidence",
  },
} as const;

export const STEPS: readonly StoryStep[] = [
  {
    id: "sources", n: "01", short: "Sources",
    title: "Every number starts with a source",
    body: "Public reports, surveys and statistics provide the activity data. Each figure keeps a link to its source.",
    link: { label: "Browse the sources", href: "/methods/sectors" },
    file: "01-sources.svg",
    alt: "An agricultural census page with its livestock row highlighted, and the record extracted from it: source, year, quantity and unit.",
  },
  {
    id: "calculations", n: "02", short: "Calculations",
    title: "Turn activity into an estimate",
    body: "Combine activity data with the appropriate emissions method. Keep the data and assumptions visible.",
    link: { label: "See an example", href: "/methods/evidence" },
    file: "02-calculation.svg",
    alt: "A livestock example: livestock numbers multiplied by methane per animal give an estimated methane figure.",
  },
  {
    id: "sectors", n: "03", short: "Sectors",
    title: "Different sectors. Consistent accounting.",
    body: "Each sector uses its own methods, with common periods, units and checks to prevent gaps and double counting.",
    link: { label: "Explore sector methods", href: "/methods/sectors" },
    file: "03-sectors.svg",
    alt: "Agriculture, power, transport and other sectors each produce records that join one consistent table, checked for aligned periods, units and double counting.",
  },
  {
    id: "totals", n: "04", short: "Totals",
    title: "Build the national picture",
    body: "Add compatible records into sector and national totals. Greenhouse gases share a CO₂-equivalent basis; air pollutants stay separate.",
    link: { label: "Explore the totals", href: "/data" },
    file: "04-totals.svg",
    alt: "Sector totals adding into one national greenhouse-gas total, with separate totals for each air pollutant.",
  },
  {
    id: "time-place", n: "05", short: "Time & place",
    title: "Show when and where",
    body: "Break annual estimates down by month and place. Label where detail is observed and where it is allocated using proxies.",
    link: { label: "Explore the map", href: "/" },
    file: "05-time-place.svg",
    alt: "An annual record broken into twelve months and placed on a map of Pakistan, with reported detail, proxy allocation and no-data cells told apart.",
  },
  {
    id: "limits", n: "06", short: "Limits",
    title: "Make uncertainty and gaps visible",
    body: "Show the range around estimates and what remains unestimated or outside scope. Missing data is never treated as zero.",
    link: { label: "See the limitations", href: "/methodology" },
    file: "06-limits.svg",
    alt: "An estimate with its uncertainty range, beside a legend for categories estimated, not estimated and outside scope.",
  },
];

/** The sector pages' step titles and action labels (the technical register). */
export const METHODS = {
  search: "Find a sector, IPCC category or source",
  steps: ["Source records", "Activity", "Method", "Result"],
  methodLead: "Registered IPCC category equations",
  dimensions: "Evidence dimensions",
  limitations: "Known limitations",
  equations: "View equations",
  sources: "Inspect sources",
  rows: "Open data rows",
} as const;
