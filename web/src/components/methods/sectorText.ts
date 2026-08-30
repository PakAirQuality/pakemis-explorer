/**
 * The per-sector summary sentence and the four-step narrative of the Methods page. The release
 * carries no module summaries, so these are authored here (prose, no digits): each step names
 * what the module's source streams, activity descriptors and registered rules are, and the
 * page prints the release's own lists beside them (source records from the streams'
 * `source_id`, activity from `sub_category`, methods from the registry's rules, the result from
 * the sector envelope). A module the text does not know gets the generic entry.
 */
export type SectorText = { summary: string; sources: string; activity: string; method: string };

export const SECTOR_TEXT: Record<string, SectorText> = {
  agriculture: {
    summary: "Livestock digestion and manure, rice paddies, fertilised soils and burnt residues, reconstructed from the agricultural census, the economic survey and the fertiliser offtake series.",
    sources: "Animal counts and crop areas from the agricultural census and the economic survey; nitrogen from the fertiliser offtake annexes.",
    activity: "Head of livestock by species, rice area and its water regime, nitrogen applied and residue burnt.",
    method: "IPCC default factors category by category: enteric and manure equations by species, the rice and managed-soils equations for the crops.",
  },
  aviation: {
    summary: "Domestic civil aviation from aircraft movements and the jet-fuel sales the petroleum companies report; international flights sit outside the total.",
    sources: "Aircraft movements from the civil aviation authority and jet fuel from the oil companies' advisory council.",
    activity: "Fuel burnt on domestic flights, with the airports named for placement.",
    method: "Fuel-based combustion factors for jet kerosene.",
  },
  fugitives: {
    summary: "Leaks, venting and flaring along oil and gas production, processing and transmission, from the regulator's segment-by-segment infrastructure statistics.",
    sources: "The oil and gas regulator's annual state-of-industry report, segment by segment.",
    activity: "Wells, processing throughput, pipeline length and the gas handled at each segment.",
    method: "Segment factors from the IPCC guidelines applied to each part of the chain.",
  },
  industry: {
    summary: "Fuel burnt in manufacturing, from the petroleum companies' sectoral sales and the regulator's industrial gas offtake.",
    sources: "Sectoral petroleum sales from the oil companies' advisory council and industrial gas from the oil and gas regulator.",
    activity: "Each fuel's quantity delivered to industry.",
    method: "Fuel-based combustion factors by fuel.",
  },
  ippu: {
    summary: "Process emissions from cement, from the producers' own annual reports and the clinker they declare.",
    sources: "The cement producers' annual reports.",
    activity: "Clinker made, with the kilns named for placement.",
    method: "The clinker-based process equation with the release's clinker factor.",
  },
  power: {
    summary: "Grid electricity from every plant's fuel as the regulator reports it, with captive generation from industrial gas and sugar-mill bagasse.",
    sources: "The electricity regulator's state-of-industry report by plant and fuel; captive gas from the oil and gas regulator; bagasse from the sugar crushing statistics.",
    activity: "Fuel burnt per plant and per captive source.",
    method: "Fuel-based combustion factors, plant by plant.",
  },
  railways: {
    summary: "Diesel burnt by the national railway, from its own year book, with a stationary and off-road share the sources cannot yet separate.",
    sources: "The railway's year book.",
    activity: "Diesel consumed, with the network for placement.",
    method: "Fuel-based combustion factors for diesel, the unresolved split declared as such.",
  },
  residential: {
    summary: "Household cooking and heating from the household survey's fuels, piped gas connections and the dung the manure ledger carries; a survey-based alternative re-runs the module on observed demand.",
    sources: "The household integrated economic survey for firewood, residues and generator fuel; the gas utilities for connections; the agriculture module's manure nitrogen ledger for dung.",
    activity: "Each fuel's quantity burnt in homes.",
    method: "Fuel-based combustion factors by fuel, with the dung basis a named configuration axis.",
  },
  transport: {
    summary: "Road transport from the petroleum companies' sales by customer class and metered compressed natural gas, with the off-road share for farms and fisheries.",
    sources: "Sectoral road sales from the oil companies' advisory council and metered gas from the oil and gas regulator.",
    activity: "Each fuel's quantity sold to road users, split by vehicle class.",
    method: "Fuel-based combustion factors with the class split for the non-carbon-dioxide gases.",
  },
  waste: {
    summary: "Landfilled and openly burnt solid waste and domestic wastewater, scaled from the population census by district.",
    sources: "The population census by district.",
    activity: "Waste generated, disposed and burnt; wastewater treated and discharged, per person.",
    method: "The IPCC first-order decay, open-burning and wastewater equations with default parameters.",
  },
};

export const GENERIC_TEXT: SectorText = {
  summary: "Reconstructed from public activity records and registered IPCC category equations.",
  sources: "The public documents the module's source streams name.",
  activity: "The activity quantities the streams carry.",
  method: "The registered category equations.",
};

export function sectorText(id: string): SectorText {
  return SECTOR_TEXT[id] ?? GENERIC_TEXT;
}

/** A source id ("pbs_agricultural_census_and_economic_survey") as words, the known acronyms kept upper-case. */
const ACRONYMS = new Set(["pbs", "ocac", "ogra", "nepra", "pcaa", "hies", "nfdc", "sorpi", "cng", "ipcc", "glw", "osm"]);
export function sourceWords(id: string): string {
  return id
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w, i) => (ACRONYMS.has(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** The status badge from the completeness ledger: the module has estimated categories, and whether any of its categories is NE. */
export function statusBadge(estimated: boolean, neCount: number): string {
  if (!estimated) return "Not estimated";
  return neCount > 0 ? "Estimated with explicit gaps" : "Estimated";
}
