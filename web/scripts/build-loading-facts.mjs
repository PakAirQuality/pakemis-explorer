/**
 * Write the loading screen's facts from the release.
 *
 * WHAT A FACT IS FOR. The loader shows one sentence for a few seconds to someone who has not yet
 * seen the site. The first set of facts written here was eleven correct statistics in the
 * inventory's own vocabulary - "469.64 Mt CO2e", "Enteric fermentation is the largest single
 * category", "second-largest category, at 12.3 % of the total" - and the person they were written
 * for called them very weird. A fact now has to be something a reader would repeat: a comparison
 * that surprises, in words nobody has to look up. Sewage against rubbish dumps. Buffalo against
 * cattle. Farming against power plants, factories and vehicles together.
 *
 * THE RULE THAT DOES NOT CHANGE: nothing numeric is typed here. Every digit in a fact is a string
 * the API returned (`display_short`, `share_pct_short`, the series' `change`, a period's label, the
 * warming potential in the release's own label), recorded beside the sentence with the receipt it
 * came under, and LoadingScreen.test.tsx fails a digit that is not one of them.
 *
 * WHAT PLAIN WORDS ADD, AND HOW EACH IS HELD.
 *   - A PHRASE instead of a decimal. Every one-key breakdown carries the server's `share_phrase`
 *     ("nearly half", "about a third", "most", "almost all"). A fact may use it; it is recorded
 *     like a figure, and the sentence is written around whatever the server says.
 *   - A COMPARISON. "More than power plants, factories and vehicles put together" is a claim, so
 *     it is ASSERTED from the answer's values before it is written (`assertMore`) and the build
 *     stops if a later release makes it false. A surprising sentence that has quietly become
 *     untrue is worse than a dull one.
 *   - A GLOSS. "The methane animals burp" is only true of enteric fermentation, so a fact that
 *     glosses a row names the row it expects (`expectAt`, `named`) and stops if it is not there.
 *   - AN EXPLAINER. A sentence with no number at all - what an estimate is, what it is not. It
 *     carries no figures and no receipt, and the test holds it to containing no digit. An explainer
 *     about how emissions work names the public page it was checked against (SCIENCE, below): the
 *     page was read and the sentence it rests on is quoted beside the address.
 *   - A SOURCE LINE. Every fact carries one small line under it saying whose figure it is, of what
 *     year, and what it leaves out: "Pakistan · 2023–24 · excludes land use and forestry". The year
 *     and the exclusion are the release's own labels, recorded like any other server string. One
 *     fact is shown per visit, so the line is the only context a reader gets.
 *   - A RECORD. The Lahore fact is not an estimate: it is two rows of the vehicle register read
 *     through /query/activity, with the register's own date. Its ratio ("more than three") is
 *     asserted from the two values, and its qualification ("not traffic") from the row's use note.
 *
 * WHAT IS LEFT OUT ON PURPOSE. "Most sulphur dioxide comes from industry" is what the covered air
 * table says and it would mislead: grid power's SO2 is only a screening range in this release and
 * may be larger than everything counted. The two air facts say "counted here" for the same reason.
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

const air = (pollutant) => call("/query/air", { pollutants: [pollutant], periods: [period], group_by: ["sector_id"], ...ranked });

const register = (classes) => call("/query/activity", { table: "fact_activity_vehicles", locations: ["Lahore"], measure: "Registered vehicles", categories: classes });

const [total, sectors, categories, provinces, gases, series, livestock, particles, ammonia, lahore] = await Promise.all([
  emissions({}),
  emissions({ group_by: ["reporting_sector"], ...ranked }),
  emissions({ group_by: ["category"], ...ranked }),
  emissions({ geography_level: "adm1", group_by: ["province"], ...ranked }),
  emissions({ group_by: ["gas"], ...ranked }),
  call("/query/timeseries", { query: {}, step: "annual" }),
  emissions({ categories: ["Enteric fermentation"], group_by: ["subitem"], ...ranked }),
  air("PM2.5"),
  air("NH3"),
  register(["Small cars (4W1)", "Two-wheelers (2W)"]),
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
/**
 * A comparison a sentence is about to make, checked against the answer's own values. `value` is
 * read for the inequality and nothing else - it sizes bars everywhere on the site, and here it
 * decides whether a sentence may be written; it is never printed.
 */
function assertMore(bigger, smaller, what) {
  const sum = (cells) => [].concat(cells).reduce((t, c) => {
    if (typeof c.value !== "number") throw new Error(`${what}: a cell carries no value to compare`);
    return t + c.value;
  }, 0);
  if (!(sum(bigger) > sum(smaller))) throw new Error(`no longer true in this release: ${what} (${sum(bigger)} against ${sum(smaller)})`);
}
const periodName = (id) => {
  const short = labels.periods[id]?.short;
  if (!short) throw new Error(`the release has no short label for ${id}`);
  return short;
};
const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/**
 * One fact. `write` receives `n`, which records a server NUMBER as it places it in the sentence,
 * and `p`, which records a server PHRASE the same way. Nothing reaches a sentence through either
 * unless it is a non-empty string the API returned.
 */
const taker = (into, what) => (value) => {
  if (typeof value !== "string" || value === "") throw new Error(`a ${what} must be a non-empty server string, got ${JSON.stringify(value)}`);
  into.push(value);
  return value;
};
/** `source` is written the same way as the sentence: its year and its exclusion are server strings, recorded apart. */
function fact(envelopes, write, source) {
  const figures = [];
  const phrases = [];
  const sourceFigures = [];
  return { text: write(taker(figures, "figure"), taker(phrases, "phrase")), source: source(taker(sourceFigures, "source string")), figures, sourceFigures, phrases, receipts: envelopes.map((e) => e.receipt) };
}
/** A sentence with no number in it: nothing to record, and the test holds it and its source line to carrying no digit. */
const explain = (text, source) => ({ text, source, figures: [], sourceFigures: [], phrases: [], receipts: [] });
const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const all = total.values[0];
const year = periodName(period);
// "million tonnes" is said in words, so the unit the words stand for is checked, not assumed
if (!String(all.unit_words ?? "").startsWith("million tonnes")) throw new Error(`the total is in '${all.unit_words}', and the sentences here say million tonnes`);

// --- greenhouse gases -----------------------------------------------------------------------
const sector = (id) => named(sectors, "reporting_sector", id);
const farming = expectAt(sectors, "reporting_sector", 1, "agriculture");
assertMore(farming, ["power", "industry", "ippu", "transport", "railways", "aviation"].map(sector), "farming emits more than power plants, factories and vehicles put together");

const enteric = expectAt(categories, "category", 1, "Enteric fermentation");
const electricity = expectAt(categories, "category", 2, "Electricity and heat production");
const road = named(categories, "category", "Road transport");
const sewage = named(categories, "category", "Domestic wastewater");
const dumps = named(categories, "category", "Solid waste disposal");
const rice = named(categories, "category", "Rice cultivation");
const cement = named(categories, "category", "Cement production");
const leaks = named(categories, "category", "Fugitive emissions from oil and gas");
assertMore(sewage, dumps, "sewage emits more than rubbish dumps");
assertMore(rice, dumps, "growing rice emits more than rubbish dumps");

const buffalo = expectAt(livestock, "subitem", 1, "buffalo");
assertMore(buffalo, [named(livestock, "subitem", "dairy_cattle"), named(livestock, "subitem", "other_cattle")], "buffalo produce more livestock methane than all the cattle");

const methane = expectAt(gases, "gas", 1, "CH4");
const carbon = expectAt(gases, "gas", 2, "CO2");
// the warming potential, from the release's own description of its default basis ("CH₄ × 28")
const basis = labels.gwp?.[release.defaults.gwp_basis]?.tooltip ?? "";
const potency = /100-year[^()]*\(CH₄ × (\d+)[,)]/.exec(basis)?.[1];
if (!potency) throw new Error(`the release's warming-potential label no longer states methane's 100-year factor: ${JSON.stringify(basis)}`);

const [firstProvince, secondProvince] = [at(provinces, "province", 1), at(provinces, "province", 2)];
const [trains, planes] = [sector("railways"), sector("aviation")];
if (trains.share_pct_short !== planes.share_pct_short) throw new Error(`trains (${trains.share_pct_short} %) and planes (${planes.share_pct_short} %) no longer share one figure, and a sentence here says "each"`);

const change = series.change;
if (!change || change.direction !== "rose") throw new Error(`the series no longer rises, and a sentence here says it grew: ${JSON.stringify(change)}`);
const span = COUNT_WORDS[series.values.length - 1];
if (!span || series.values[0]?.group?.period_id !== change.from_period || series.values.at(-1)?.group?.period_id !== change.to_period) throw new Error("the series is not one consecutive run from the change's first period to its last");
const unsigned = (s) => s.replace(/^[+-]/, ""); // the direction is said in a word

// --- air pollutants: "counted here", because grid power is outside the covered air total --------
const fires = expectAt(particles, "sector_id", 1, "residential");
const traffic = named(particles, "sector_id", "transport");
const fields = expectAt(ammonia, "sector_id", 1, "agriculture");

// --- the source lines ---------------------------------------------------------------------------
const excluded = labels.lulucf?.short;
if (!excluded) throw new Error("the release no longer words its land-use exclusion, and every inventory source line states it");
const gwpName = labels.gwp?.[release.defaults.gwp_basis]?.label;
// the horizon is read out of the release's own description of the basis, like the factor above it
const horizon = /(\d+-year)/.exec(basis)?.[1];
if (!gwpName || !horizon) throw new Error("the release no longer names its warming-potential basis and its horizon");
/** "Pakistan · 2023–24 · excludes land use and forestry": whose total, which year, what it leaves out. */
const inventory = (n) => `Pakistan · ${n(year)} · ${n(excluded)}`;
// the air panel is the sources estimated here, with grid power beside it and not in it: the line may
// say so only while the answer itself carries those two limitations
for (const env of [particles, ammonia])
  for (const id of ["air_covered_sources", "air_sector_ne"])
    if (!(env.limitations_hit ?? []).some((l) => l.id === id)) throw new Error(`an air answer no longer carries '${id}', and its source line says grid power is not included`);
const covered = (n) => `Pakistan · ${n(year)} · sources estimated here; grid power not included`;

// --- the register: a record, not an estimate ------------------------------------------------------
const row = (cls) => {
  const cell = lahore.values.find((v) => v.category === cls);
  if (!cell) throw new Error(`Lahore's register has no '${cls}' row`);
  return cell;
};
const [cars, bikes] = [row("Small cars (4W1)"), row("Two-wheelers (2W)")];
if (cars.period !== bikes.period || cars.period_type !== "Snapshot date") throw new Error("the two register rows are not one dated count");
if (!(bikes.value > 3 * cars.value && bikes.value < 4 * cars.value)) throw new Error(`no longer true in this release: more than three (and fewer than four) motorcycles for every car (${bikes.value} against ${cars.value})`);
if (!/not traffic/.test(cars.use_note)) throw new Error("the register's use note no longer says it is not traffic, and the source line does");
if (!cars.display_short.endsWith(" million") || !bikes.display_short.endsWith(" million")) throw new Error("the register's counts are no longer said in millions");

// --- how emissions work: each sentence was checked against the page named, on the date named -----
// Read on 10 October 2026. The quotation is the page's own sentence; the fact says no more than it.
const SCIENCE = {
  exhaust: { source: "US EPA, greenhouse gases from a typical passenger vehicle", url: "https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle", quote: "Most of the weight of the CO2 doesn't come from the gasoline itself, but the oxygen in the air." },
  particles: { source: "US EPA, particulate matter basics", url: "https://www.epa.gov/pm-pollution/particulate-matter-pm-basics", quote: "Most particles form in the atmosphere as a result of complex reactions of chemicals such as sulfur dioxide and nitrogen oxides, which are pollutants emitted from power plants, industries and automobiles." },
  hair: { source: "US EPA, particulate matter basics", url: "https://www.epa.gov/pm-pollution/particulate-matter-pm-basics", quote: "The average human hair is about 70 micrometers in diameter – making it 30 times larger than the largest fine particle." },
  landfill: { source: "US EPA, basic information about landfill gas", url: "https://www.epa.gov/lmop/basic-information-about-landfill-gas", quote: "anaerobic conditions are established and methane-producing bacteria begin to decompose the waste and generate methane." },
};
const OWN = "How this inventory is built";

const facts = [
  fact([lahore], (n) => `More than three motorcycles for every car: Lahore's register listed ${n(bikes.display_short)} motorcycles and ${n(cars.display_short)} cars, jeeps and station wagons.`,
    (n) => `${cars.source_series} · ${n(cars.period_label)} · registered vehicles, not traffic`),
  fact([sectors], (n, p) => `${sentence(p(farming.share_phrase))} of Pakistan's greenhouse gases come from farming — more than power plants, factories and vehicles put together.`, inventory),
  fact([categories], (n, p) => `The biggest single source is not a chimney or an exhaust pipe. It is livestock: the methane animals burp is ${p(enteric.share_phrase)} of the total.`, inventory),
  fact([livestock], (n, p) => `Buffalo alone produce ${p(buffalo.share_phrase)} of Pakistan's livestock methane — more than all the cattle.`, inventory),
  // "OUTWEIGHS CARBON DIOXIDE HERE: 53.0 % AGAINST 38.0 %" SAID NEITHER WHAT WAS WEIGHED NOR WHERE.
  // "Outweighs" reads as mass, and methane's mass is a small fraction of carbon dioxide's; "here"
  // named no quantity. The two figures are shares of the year's total once each gas is counted by
  // the heat it traps over a century, and the source line names the convention that does the counting.
  fact([gases], (n) => `Methane traps about ${n(potency)} times more heat than carbon dioxide over a century. Counted that way it is ${n(methane.share_pct_short)} % of Pakistan's greenhouse gases; carbon dioxide is ${n(carbon.share_pct_short)} %.`,
    (n) => `Pakistan · ${n(year)} · ${n(gwpName)} ${n(horizon)} values · ${n(excluded)}`),
  fact([series], (n) => `Pakistan's emissions grew by ${n(unsigned(change.change_pct_short))} % in ${span} years, from ${n(periodName(change.from_period))} to ${n(periodName(change.to_period))}.`,
    (n) => `Pakistan · ${n(excluded)}`),
  fact([total], (n) => `In ${n(year)} Pakistan released an estimated ${n(all.display_short)} million tonnes of greenhouse gases, counted as carbon dioxide.`, inventory),
  fact([categories], (n, p) => `Power stations, the source most people think of first, come second: ${p(electricity.share_phrase)} of the total.`, inventory),
  fact([provinces], (n, p) => `${firstProvince.group.province} accounts for ${p(firstProvince.share_phrase)} of the country's emissions, and ${secondProvince.group.province} for ${p(secondProvince.share_phrase)}.`, inventory),
  fact([categories], (n) => `Sewage emits more than rubbish dumps: ${n(sewage.share_pct_short)} % of the total against ${n(dumps.share_pct_short)} %.`, inventory),
  fact([categories], () => `Flooded rice fields make methane. Growing rice emits more than all the country's rubbish dumps.`, inventory),
  fact([categories], (n) => `Making cement releases carbon dioxide in two ways: fuel heats the kiln, and the limestone itself gives off ${n(cement.display_short)} million tonnes a year.`, inventory),
  fact([categories], (n) => `Gas that leaks from wells and pipelines before it is ever burned still warms the planet: ${n(leaks.share_pct_short)} % of the total.`, inventory),
  fact([categories, sectors], (n) => `Road vehicles emit ${n(road.share_pct_short)} % of the total. Trains and planes: about ${n(trains.share_pct_short)} % each.`, inventory),
  fact([particles], (n, p) => `Cooking and heating fires at home produce ${p(fires.share_phrase)} of the fine-particle pollution counted here: ${n(fires.share_pct_short)} %. Transport: ${n(traffic.share_pct_short)} %.`, covered),
  fact([ammonia], (n, p) => `${sentence(p(fields.share_phrase))} of the ammonia counted here comes from farming — fertiliser and animal manure: ${n(fields.share_pct_short)} %.`, covered),
  explain("Most of the weight of the carbon dioxide from an exhaust pipe comes from the air: burning joins the fuel's carbon to oxygen.", SCIENCE.exhaust.source),
  explain("Some particle pollution forms in the air itself: gases from power plants, factories and vehicles react to make fine particles.", SCIENCE.particles.source),
  explain("Waste can warm the planet without burning. Buried food and plant waste makes methane as it rots without oxygen.", SCIENCE.landfill.source),
  explain("A human hair is about thirty times wider than the largest fine particle. Most of this pollution is too small to see.", SCIENCE.hair.source),
  explain("Nobody measures these emissions directly. They are worked out from records: fuel sold, animals counted, crops grown, cement made.", OWN),
  explain("An estimate of what was released is not a measurement of the air you breathe. Wind and weather decide where it goes.", OWN),
];
// "thirty" is the page's own figure said in a word; held here so the word cannot drift from the page
if (!/30 times larger/.test(SCIENCE.hair.quote)) throw new Error("the hair comparison no longer matches the page it cites");

const file = `// GENERATED by scripts/build-loading-facts.mjs from the release named below. Do not edit:
// \`make facts\` rewrites it, and LoadingScreen.test.tsx fails a digit that is not one of a fact's
// own recorded strings, or a file built from a release other than the pinned one.
export type LoadingFact = {
  /** The sentence the loading screen shows. */
  text: string;
  /** The small line under it: whose figure, of what date, and what it leaves out; or the public page an explanation was checked against. */
  source: string;
  /** Every numeric string in the sentence, verbatim from the answers (a signed change loses its sign). */
  figures: readonly string[];
  /** Every server string in the source line that carries a digit (the year, a register's date, the warming-potential basis). */
  sourceFigures: readonly string[];
  /** Every share phrase in it ("nearly half"), verbatim from the answers; a sentence may open with one capitalised. */
  phrases: readonly string[];
  /** The receipts of the envelopes those strings came from; none for a sentence that states no figure and no phrase. */
  receipts: readonly string[];
};

export const FACTS_RELEASE = ${JSON.stringify(release.version)};

export const LOADING_FACTS: readonly LoadingFact[] = [
${facts.map((f) => `  ${JSON.stringify(f)},`).join("\n")}
];
`;
writeFileSync(OUT, file);
console.log(`${facts.length} facts from release ${release.version} -> ${OUT}`);
for (const f of facts) console.log(`  ${f.text}\n      ${f.source}`);
