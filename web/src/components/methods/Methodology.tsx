"use client";
/**
 * The methodology prose (today's /about text, moved 2026-08-30 and set under the sector cards
 * with id="methodology"; "Read methodology" and /methods#release land here): what the dataset
 * is, what "emissions data" means here, how to read the map, the territories' sector coverage,
 * the assistant, the release (the one place the version is printed), the licences, a vocabulary
 * note and links. Every release fact is the API's own text.
 */
import Link from "next/link";
import { api, API_BASE } from "@/lib/api";
import { releaseAgent, releaseDims, releaseFacts, releaseLabels, useRelease } from "@/lib/release";
import { configLabel, gasLabel, gwpLabel, gwpTooltip, limitationText, periodLabel, periodRange, periodShort } from "@/lib/labels";
import { joinNames, residualUnit } from "@/lib/geography";
import { useBboxes } from "@/components/map/tiles";
import { ASK_SENTENCES, SHORT_SUMMARY } from "@/components/overview/copy";
import { useMemo } from "react";

/** The repository's public URL when one is configured; this checkout has no remote, so the link is optional. */
const REPOSITORY_URL = process.env.NEXT_PUBLIC_REPOSITORY_URL ?? "";

export function Methodology() {
  const release = useRelease();
  const bboxes = useBboxes();
  const rel = release.data;
  const labels = useMemo(() => releaseLabels(rel), [rel]);
  const dims = useMemo(() => releaseDims(rel), [rel]);
  const facts = releaseFacts(rel);
  const agent = releaseAgent(rel);
  const residual = residualUnit(dims, bboxes.data, labels);
  const fns = (rel?.query_contract.functions as string[] | undefined) ?? [];
  const lim = (id: string) => (labels.limitations[id] ? limitationText(labels, id) : null);
  const gases = dims.gases.map((g) => gasLabel(labels, g));
  const rp = facts.reportingPeriod;
  // the reporting period's label is a period id ("FY2023-24"); a person reads its short label
  const rpShort = rp ? periodShort(labels, rp.label) : "";
  const rpLong = rp ? periodLabel(labels, rp.label) : "";
  const unitName = residual?.label ?? "the residual unit";
  // Which years exist at which resolution, read off the release and never typed: the fiscal
  // years the annual products span, the years that carry months at all, and the one year the
  // release flags as its reference - the only one whose months are held below national level.
  const referenceId = dims.fiscalPeriods.find((p) => labels.periods[p]?.is_reference);
  const refYear = referenceId ? periodShort(labels, referenceId) : "the reference year";
  const annualYears = periodRange(dims, labels);
  const monthlyYears = periodRange({ fiscalPeriods: dims.fiscalPeriods.filter((p) => (dims.monthsByPeriod[p] ?? []).length > 0) }, labels);
  return (
    <div id="methodology" className="scroll-mt-20" data-testid="methodology">
      <div className="max-w-3xl">
        <header className="mb-6">
          <h2 className="text-xl font-semibold">Methodology</h2>
          <p className="text-xs text-muted">What the estimates are, how they were made, and what a reader should know before comparing them.</p>
        </header>

        <section className="card mb-5 p-4 text-sm" data-testid="about-what">
          <h2 className="text-md font-semibold">What this is</h2>
          <p className="mt-2 leading-relaxed">{SHORT_SUMMARY}</p>
          <p className="mt-2 leading-relaxed">
            This site is a window onto one release of that dataset{rp ? <>, whose reporting period is {rpShort} ({rp.start} to {rp.end})</> : null}; the release is named under &ldquo;Release&rdquo; below. It shows nothing it computed itself: every number on the map, in a panel or in an answer is a string the API returned from a query, together with a receipt that replays the query. The browser shades polygons and sizes bars; it never adds, divides or rounds.
          </p>
        </section>

        <section id="methods" className="card mb-5 scroll-mt-4 p-4 text-sm" data-testid="about-data">
          <h2 className="text-md font-semibold">What &ldquo;emissions data&rdquo; means here</h2>
          <p className="mt-2 leading-relaxed">An estimate, not a measurement. Each sector&apos;s emissions are reconstructed from public documents: an activity statistic (fuel sold, animals kept, cement made, waste collected) multiplied by an emission factor, category by category under the IPCC classification, with every step recorded. No instrument was read, and no figure was copied from another inventory as a whole.</p>
          <p className="mt-2 leading-relaxed" data-testid="about-years">
            Years are fiscal years, July to June{rp ? <>: {rpShort} means {rpLong.replace(" – ", " to ")}</> : null}. Every page prints a year that way; the release&apos;s id for it{rp ? <>, <span className="mono" data-allow-fy>{rp.label}</span>,</> : null} appears only in URLs, requests and receipts.
            {rp?.note ? <> The release&apos;s own note on the period: {rp.note}.</> : null} Months and districts are disaggregations of those years, each carrying its own evidence class.
          </p>
          {gases.length > 0 && (
            <p className="mt-2 leading-relaxed">
              The gases are {joinNames(gases)}, reported together as CO₂-equivalent{facts.gwp.reported ? <> on {gwpLabel(labels, facts.gwp.reported)}</> : null}
              {facts.gwp.secondary ? <>, with {gwpLabel(labels, facts.gwp.secondary)} carried as a secondary basis wherever the release can serve it</> : null}.
            </p>
          )}
          {Object.keys(labels.gwp).length > 0 && (
            <div className="mt-3" data-testid="about-gwp">
              <h3 className="text-sm font-semibold">CO₂-equivalent and warming potentials</h3>
              <p className="mt-1 leading-relaxed">
                A total in CO₂-equivalent weighs each gas by a warming potential the IPCC publishes; the release carries the weights of two assessment reports and every number names the one it uses.
                {Object.entries(labels.gwp).map(([id, g]) => (
                  <span key={id}> {g.label}{g.is_default ? " (the default)" : ""}: {gwpTooltip(labels, id) || g.label}.</span>
                ))}
              </p>
            </div>
          )}
          {facts.lulucf.status && (
            <p className="mt-2 leading-relaxed">
              Land use, land-use change and forestry are {facts.lulucf.status} ({facts.lulucf.notation_key}){facts.lulucf.note ? <>: {facts.lulucf.note}</> : null}.
            </p>
          )}
          {dims.configurations.length > 0 && (
            <div className="mt-3" data-testid="about-estimates">
              <h3 className="text-sm font-semibold">Two estimates</h3>
              <p className="mt-1 leading-relaxed">The release can be queried under two estimates; the map and every panel name the one they show:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                {dims.configurations.map((id) => (
                  <li key={id}>
                    <span className="font-semibold">{configLabel(labels, id)}</span>
                    {labels.configurations[id]?.note ? <span className="text-muted"> — {labels.configurations[id].note}</span> : null}
                  </li>
                ))}
              </ul>
              {lim("config_S_residential_only") && <p className="mt-1 text-xs text-muted">{lim("config_S_residential_only")}</p>}
            </div>
          )}
          <p className="mt-2 leading-relaxed">Where nothing is estimated, the cell says so with a notation key rather than a value: NE (not estimated), NO (not occurring) or IE (included elsewhere). A blank is not a zero, and a refusal is not an error.</p>
          <p className="mt-2 leading-relaxed">Every number is graded by the evidence behind it, traceable to the document and the code that produced it, and carries a receipt: a hash of the request, the release and the result that anyone can replay through the API to get the same envelope.</p>
          <p className="mt-2 leading-relaxed" data-testid="about-sector-views">
            <b>Two sector groupings</b> of the same sources. The IPCC grouping files each source where the Guidelines report it: &ldquo;industrial fuel use&rdquo; is the whole of 1.A.2, including the captive self-generation the power module computes, and cement process CO&#8322; is IPPU. The grouping is additive &mdash; the power total loses exactly what the industrial total gains &mdash; so it moves no emissions. Where a source was computed is named beside it.; in IPPU. The economic grouping joins what the IPCC code says is industrial: 1.A.2 fuel use including captive generation, plus the process categories (cement, ammonia, iron and steel, lubricant use). It is additive with the IPCC grouping and its industrial aggregate covers direct industrial sources only; it never stands for Pakistan&apos;s whole industrial sector.
            {lim("economic_sector_view") ? <> {lim("economic_sector_view")}.</> : null}
          </p>
        </section>

        <section className="card mb-5 p-4 text-sm" data-testid="about-map">
          <h2 className="text-md font-semibold">How to read the map</h2>
          <p className="mt-2 leading-relaxed">Three levels: provinces, districts and a grid. At the province and district levels the map paints one envelope per view; a polygon&apos;s colour follows its cell&apos;s value, the hover shows that cell&apos;s display string verbatim, and the legend&apos;s labels are the display strings of real cells at fixed ranks, never client-computed breaks. A click opens the detail card with the unit&apos;s sectors, gases, months and lineage.</p>
          <p className="mt-2 leading-relaxed">The rail at the bottom steps through the fiscal years and, within a year, the months. Provinces and districts are painted for every fiscal year; the grid raster is drawn for {refYear} alone. Where the release refuses a view, the map shows outlines with the API&apos;s refusal in the legend&apos;s place and the panels keep their national numbers.</p>
          {/* This block replaced one sentence that said the spatial products existed for the
              reference year alone, while Downloads listed them for every year. Both cannot be
              right, so the years are read from the release here and the evidence caveat is the
              release's own limitation, quoted: a year on the map is not a year observed. */}
          <div className="mt-3" data-testid="about-coverage">
            <h3 className="text-sm font-semibold">Which years exist at which resolution</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 leading-relaxed">
              <li data-testid="coverage-annual">
                <b>Annual products</b> cover every fiscal year{annualYears ? <> ({annualYears})</> : null} at four resolutions: national, province, district and the 0.05° grid, for the greenhouse gases and for the air pollutants alike. The greenhouse-gas district rows are published for the reference estimate only{facts.gwp.reported ? <>, in CO₂-equivalent on {gwpLabel(labels, facts.gwp.reported)} only</> : null}.
              </li>
              <li data-testid="coverage-monthly">
                <b>Monthly products</b> cover every month of every fiscal year{monthlyYears ? <> ({monthlyYears})</> : null} at national level only. Below it, the months of provinces, districts and the grid are {refYear}&apos;s alone.
              </li>
              <li data-testid="coverage-evidence">
                <b>Own-year evidence or a back-cast.</b> A map for every year is not an observation of every year. Each year has its own national estimate; where that mass sits inside the country follows the year&apos;s own geography only where a source published one. Otherwise it is the reference year&apos;s pattern rescaled to the earlier year&apos;s total: a back-cast, which says where the mass most likely sat and not where it was recorded. No table marks the difference row by row; the release states it as a limitation.
                {lim("adm2_history_annual_only") ? <> In its words: {lim("adm2_history_annual_only")}.</> : null}
                {lim("adm2_frame_is_fixed") ? <> And of the boundaries: {lim("adm2_frame_is_fixed")}.</> : null}
              </li>
              <li data-testid="coverage-national-only">
                <b>National only.</b> Some results stop at the national level: the months of every year but {refYear}, and anything filtered by IPCC category. For these the panels answer nationally and the map has nothing to paint.
              </li>
              <li data-testid="coverage-refused">
                <b>Refused, and unallocated.</b> A combination the release does not hold is refused by name and never filled in; a month of an earlier year at province, district or grid level is one. Mass the allocation could not place in a district is kept as a row of its own, and that table of unallocated mass is published for {refYear} only.
              </li>
            </ul>
          </div>
          <p className="mt-2 leading-relaxed">
            <b>Hatch</b> marks a bounded interval: the cell prints &ldquo;[low, high]&rdquo; and is never collapsed to a midpoint.{lim("adm2_co2e_bounded_power_residential") ? <> {lim("adm2_co2e_bounded_power_residential")}.</> : null}
          </p>
          <p className="mt-2 leading-relaxed">
            <b>A dotted outline</b> marks polygons that share one cell. {residual ? <>{joinNames(residual.members)} are one unit in the release, named &ldquo;{residual.label}&rdquo;; the map paints its single cell on each of them and the hover says so.</> : <>The release&apos;s residual territories unit is drawn as several polygons that carry its single cell.</>}
            {lim("no_polygon_units") ? <> {lim("no_polygon_units")}.</> : null}
          </p>
          <p className="mt-2 leading-relaxed"><b>Unallocated</b> mass is named, not lost: what the allocation cannot place in a district stays at the province as a row of its own, shown on the detail card and in the lineage.</p>
          <p className="mt-2 leading-relaxed"><b>The grid raster</b> is shading only.{lim("grid_not_tabular") ? <> {lim("grid_not_tabular")}.</> : null} A click reads one cell through the API, with its receipt.</p>
          <p className="mt-2 leading-relaxed">Refusals are answers. A scope the release cannot serve is refused by name, and the refusal is shown where the number would have been. Two of the named limitations:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted">
            {(["ar6_adm2_ne", "calendar_basis_ne"] as const).filter((id) => labels.limitations[id]).map((id) => (
              <li key={id}><span className="mono text-fg">{id}</span> — {limitationText(labels, id)}</li>
            ))}
          </ul>
        </section>

        <section className="card mb-5 p-4 text-sm" data-testid="about-territories">
          <h2 className="text-md font-semibold">The territories and the &ldquo;{unitName}&rdquo; unit</h2>
          <p className="mt-2 leading-relaxed">
            The release&apos;s province table has one row without a polygon, named &ldquo;{unitName}&rdquo;{residual ? <>: {joinNames(residual.members)} together</> : null}. The district frame draws no province for them, so their mass is booked to that one row at province level, while at district level each of their districts has a cell of its own. The map draws the row on every member polygon with a dotted outline; clicking any of them opens the unit&apos;s card, and a query for the unit uses its own name as the geography id.
          </p>
          <p className="mt-2 leading-relaxed">
            Coverage of the three territories differs by sector, because each sector&apos;s provincial split rides a different source. Where the split follows the population census (waste burned and disposed, wastewater, and the residential fuels that follow population), the unit is Islamabad Capital Territory alone: Azad Kashmir and Gilgit-Baltistan lie outside the census frame those sectors use. Where it follows OCAC&apos;s provincial petroleum sales (road petrol and diesel), the unit is Gilgit-Baltistan and Azad Kashmir, and Islamabad is folded into Punjab&apos;s figure. The livestock census and the household survey behind the observed-demand configuration cover all three. Piped gas cannot be separated: the northern utility reports Punjab and Azad Kashmir as one figure, so residential gas connections put nothing in the unit and industrial gas reaches it only through Islamabad&apos;s share of that utility&apos;s franchise. Grid power, fugitive oil and gas production, and cement carry nothing there, because no plant, field or kiln in the sources sits in the territories; railway fuel reaches the unit only through the Islamabad trackage of the route model; domestic aviation, by contrast, credits the unit generously, because Islamabad&apos;s airport is assigned to the capital territory and Gilgit, Skardu, Muzaffarabad and Rawalakot are its airports. The unit&apos;s total is therefore a sum of unlike coverages, and a comparison with a province is not like for like.
          </p>
        </section>

        <section className="card mb-5 p-4 text-sm" data-testid="about-ask">
          <h2 className="text-md font-semibold">Ask about this view</h2>
          <p className="mt-2 leading-relaxed">{ASK_SENTENCES[0]}</p>
          <p className="mt-2 leading-relaxed">{ASK_SENTENCES[1]}</p>
          {fns.length > 0 && (
            <ul className="mono mt-2 grid grid-cols-1 gap-0.5 text-xs sm:grid-cols-2">
              {fns.map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">
            Status: {agent.enabled ? <>enabled{agent.model ? <> · model <span className="mono">{agent.model}</span></> : null}</> : <>not enabled — <span className="mono">{agent.reason}</span></>}. No SQL, no Python, no shell, no internet: the agent&apos;s only reach is the typed functions above, against the same release this map reads.
          </p>
        </section>

        <section id="release" className="card mb-5 scroll-mt-20 p-4 text-sm" data-testid="about-release">
          <h2 className="text-md font-semibold">Release</h2>
          <p className="mt-2 leading-relaxed">
            {rel ? <>This Explorer reads <span className="mono">{rel.release_id}</span>{rel.commit ? <> at commit <span className="mono">{rel.commit}</span></> : null}. </> : <>Loading release… </>}
            Releases are versioned so that a published result can be reproduced: the <Link href="/downloads" className="text-accent underline">Downloads</Link> page lists the release identity with the digest of every table it serves.
          </p>
        </section>

        <section className="card mb-5 p-4 text-sm" data-testid="about-licences">
          <h2 className="text-md font-semibold">Licences</h2>
          <p className="mt-2 leading-relaxed">
            Code {facts.licences.code || "MIT"}; data and text {facts.licences.data_and_text || "CC-BY-4.0"}.
          </p>
          {facts.licences.odbl_note && <p className="mt-2 leading-relaxed">{facts.licences.odbl_note}</p>}
          {facts.licences.odbl_carveouts.length > 0 && (
            <>
              <p className="mt-2 text-xs text-muted">The ODbL carve-outs the release names:</p>
              <ul className="mono mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">
                {facts.licences.odbl_carveouts.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </>
          )}
          {facts.licences.undetermined && <p className="mt-2 text-xs text-muted">{facts.licences.undetermined}</p>}
          <p className="mt-2 text-xs text-muted">Cite an answer as the envelope&apos;s <span className="mono">citation</span> field, which names the receipt.</p>
        </section>

        <section className="card mb-5 p-4 text-sm" data-testid="about-vocabulary">
          <h2 className="text-md font-semibold">Vocabulary</h2>
          <p className="mt-2 leading-relaxed">The project calls itself a public-data reconstruction and an evidence-graded product: a monthly estimate, a spatial allocation, a reference configuration with structural alternatives, and cells that are estimated or carry a notation key. It does not call itself an inventory of record, a finished account of the country&apos;s emissions, a measurement of what a grid cell emits, or a system that watches emissions as they happen; and nothing in it was produced by a model guessing a number. Where a word here reads stronger than that, the API&apos;s own text wins.</p>
        </section>

        <section className="card mb-8 p-4 text-sm" data-testid="about-links">
          <h2 className="text-md font-semibold">Further</h2>
          <ul className="mt-2 space-y-1 text-xs">
            <li><Link href="/downloads" className="text-accent underline">Downloads</Link> — replay a receipt, download the sector × gas table, the release identity and digests, the routes.</li>
            <li><a href={api.docsUrl()} className="text-accent underline">{api.docsUrl()}</a> — the API&apos;s interactive documentation; <a href={`${API_BASE}/release`} className="text-accent underline">{API_BASE}/release</a> is the release summary this page reads.</li>
            <li>{REPOSITORY_URL ? <a href={REPOSITORY_URL} className="text-accent underline">The repository</a> : <span>The repository</span>} — the site&apos;s code and its README (<span className="mono">README.md</span> at the root of the checkout; the API&apos;s contract in <span className="mono">api/</span>).</li>
          </ul>
        </section>
        <footer className="pb-6 text-xs text-muted">Every number on this site is a <code>display</code> string from an API envelope carrying a receipt; the browser computes nothing.</footer>
      </div>
    </div>
  );
}
