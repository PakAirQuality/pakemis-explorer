/**
 * Write the loading screen's facts from the release.
 *
 * The loader used to rotate eight sentences about method, with no digit in them, because the rule
 * of this site is that every number on screen is a string the release returned. The sentences
 * were true and nobody read them. This script keeps the rule and drops the dryness: it asks the
 * API the same questions the workspace deck asks (lib/requests.ts - one total, four partitions,
 * one series), and builds each fact ONLY out of strings in the answers - `display_short`,
 * `share_pct_short`, `rank`, the series' `change`, the release's own labels. Nothing numeric is
 * typed here. Each fact is written out with the strings it used and the receipts they came
 * under, and LoadingScreen.test.tsx holds the file to that: a digit in a fact that is not one of
 * its recorded strings fails, and so does a file built from a release other than the pinned one.
 *
 * ⚠ A GLOSS IS PINNED TO WHAT IT GLOSSES. "methane from livestock digestion" is only true of
 * enteric fermentation, so a fact that carries a gloss names the cell it expects at that rank and
 * the script stops if the release has put something else there. A fact with no gloss reads its
 * subject's name from the answer and needs no such pin.
 *
 * Run by hand against a served release; the output is committed.
 *
 *   make facts                                   # the local API (make api)
 *   PAKEMIS_API=https://<host>/api/v1/emissions node scripts/build-loading-facts.mjs
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const API = (process.env.PAKEMIS_API ?? "http://localhost:8000/api/v1/emissions").replace(/\/+$/, "");
const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "src/components/shell/loadingFacts.gen.ts");

async function call(path, body) {
  const res = await fetch(`${API}${path}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const release = await call("/release");
const labels = release.labels;
const period = release.defaults.period_id;
const emissions = (extra) => call("/query/emissions", { periods: [period], ...extra });
const ranked = { order_by: "value desc" };

const [total, sectors, categories, provinces, gases, series] = await Promise.all([
  emissions({}),
  emissions({ group_by: ["reporting_sector"], ...ranked }),
  emissions({ group_by: ["category"], ...ranked }),
  emissions({ geography_level: "adm1", group_by: ["province"], ...ranked }),
  emissions({ group_by: ["gas"], ...ranked }),
  call("/query/timeseries", { query: {}, step: "annual" }),
]);

/** The cell holding a rank, or the cell of a named group; both stop the build when absent. */
function at(env, key, rank) {
  const cell = env.values.find((v) => v.rank === rank);
  if (!cell) throw new Error(`no rank ${rank} in the ${key} partition`);
  return cell;
}
function named(env, key, id) {
  const cell = env.values.find((v) => v.group?.[key] === id);
  if (!cell) throw new Error(`the ${key} partition has no '${id}'`);
  return cell;
}
function expectAt(env, key, rank, id) {
  const cell = at(env, key, rank);
  if (cell.group?.[key] !== id) throw new Error(`rank ${rank} of ${key} is '${cell.group?.[key]}', not '${id}': the sentence written for '${id}' no longer describes it`);
  return cell;
}
const PLACE = ["largest", "second-largest", "third-largest", "fourth-largest", "fifth-largest"];
const placeOf = (cell) => {
  const word = PLACE[cell.rank - 1];
  if (!word) throw new Error(`no word for rank ${cell.rank}`);
  return word;
};
const periodName = (id) => {
  const short = labels.periods[id]?.short;
  if (!short) throw new Error(`the release has no short label for ${id}`);
  return short;
};
const sectorName = (id) => labels.reporting_sectors?.[id] ?? labels.sectors[id] ?? id;

/** One fact: `write` receives `n`, which records a server string as it places it in the sentence. */
function fact(envelopes, write) {
  const figures = [];
  const n = (value) => {
    if (typeof value !== "string" || value === "") throw new Error(`a figure must be a non-empty server string, got ${JSON.stringify(value)}`);
    figures.push(value);
    return value;
  };
  return { text: write(n), figures, receipts: envelopes.map((e) => e.receipt) };
}

const all = total.values[0];
const unit = all.unit_short;
const year = periodName(period);
const topSector = at(sectors, "reporting_sector", 1);
const enteric = expectAt(categories, "category", 1, "Enteric fermentation");
const electricity = expectAt(categories, "category", 2, "Electricity and heat production");
const road = named(categories, "category", "Road transport");
const homes = named(categories, "category", "Residential fuel combustion");
const methane = expectAt(gases, "gas", 1, "CH4");
const carbon = expectAt(gases, "gas", 2, "CO2");
const nitrous = expectAt(gases, "gas", 3, "N2O");
if (gases.values.length !== 3) throw new Error(`the gas partition has ${gases.values.length} gases, and a sentence here says three`);
const [firstProvince, secondProvince] = [at(provinces, "province", 1), at(provinces, "province", 2)];
const waste = named(sectors, "reporting_sector", "waste");
const change = series.change;
if (!change || !["rose", "fell"].includes(change.direction)) throw new Error(`the series carries no rise or fall to state: ${JSON.stringify(change)}`);
const unsigned = (s) => s.replace(/^[+-]/, ""); // the direction is said in a word, as the overview says it

const facts = [
  fact([total], (n) => `In ${n(year)}, Pakistan emitted an estimated ${n(all.display_short)} ${unit} of greenhouse gases.`),
  fact([sectors], (n) => `${sectorName(topSector.group.reporting_sector)} is Pakistan's largest source of emissions: ${n(topSector.display_short)} ${unit}, or ${n(topSector.share_pct_short)} % of the national total.`),
  fact([categories], (n) => `Enteric fermentation — methane from the digestion of cattle, buffalo and other livestock — is the largest single category, at ${n(enteric.share_pct_short)} % of the total.`),
  fact([gases], (n) => `Methane, not carbon dioxide, is the leading gas: ${n(methane.share_pct_short)} % of the total against ${n(carbon.share_pct_short)} %.`),
  fact([series], (n) => `Emissions ${change.direction} ${n(unsigned(change.change_pct_short))} % between ${n(periodName(change.from_period))} and ${n(periodName(change.to_period))}, from ${n(change.from_short)} to ${n(change.to_short)} ${change.unit_short}.`),
  fact([provinces], (n) => `${firstProvince.group.province} accounts for ${n(firstProvince.share_pct_short)} % of national emissions; ${secondProvince.group.province} follows at ${n(secondProvince.share_pct_short)} %.`),
  fact([categories], (n) => `Electricity and heat production is the second-largest category, at ${n(electricity.share_pct_short)} % of the total.`),
  fact([categories], (n) => `Road transport emitted ${n(road.display_short)} ${unit} in ${n(year)} — ${n(road.share_pct_short)} % of the total.`),
  fact([categories], (n) => `Household cooking and heating — residential fuel combustion — accounts for ${n(homes.share_pct_short)} % of the total.`),
  fact([sectors], (n) => `Waste is the ${placeOf(waste)} source, at ${n(waste.share_pct_short)} % of the total.`),
  fact([gases], (n) => `Nitrous oxide is the smallest of the three gases counted, at ${n(nitrous.share_pct_short)} % of the total.`),
];

const file = `// GENERATED by scripts/build-loading-facts.mjs from the release named below. Do not edit:
// \`make facts\` rewrites it, and LoadingScreen.test.tsx fails a digit that is not one of a fact's
// own recorded strings, or a file built from a release other than the pinned one.
export type LoadingFact = {
  /** The sentence the loading screen shows. */
  text: string;
  /** Every numeric string in it, verbatim from the answers (a signed change loses its sign). */
  figures: readonly string[];
  /** The receipts of the envelopes those strings came from. */
  receipts: readonly string[];
};

export const FACTS_RELEASE = ${JSON.stringify(release.version)};

export const LOADING_FACTS: readonly LoadingFact[] = [
${facts.map((f) => `  ${JSON.stringify(f)},`).join("\n")}
];
`;
writeFileSync(OUT, file);
console.log(`${facts.length} facts from release ${release.version} -> ${OUT}`);
for (const f of facts) console.log(`  ${f.text}`);
