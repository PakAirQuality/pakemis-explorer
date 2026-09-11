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
    summary: "Direct industrial fuel use, covered sources only (IPCC 1.A.2): the petroleum companies' sectoral sales, the regulator's industrial gas offtake, and the official coal-by-consumer allocation for brick kilns and the cement sector - a reported-fuel estimate whose coal series is under independent reconciliation. Not Pakistan's industrial sector: captive generation is computed in power, cement process CO2 in IPPU, and several industrial sources remain screened or outside the inventory; the Analyze page's economic view joins the covered ones.",
    sources: "Sectoral petroleum sales from the oil companies' advisory council, industrial gas from the oil and gas regulator, and the Finance Division's HDIP coal-by-consumer table (an estimated allocation, not metered).",
    activity: "Each fuel's quantity delivered to industry, with coal split as the source allocates it between brick kilns and the cement sector.",
    method: "Fuel-based combustion factors by fuel.",
  },
  ippu: {
    summary: "Process emissions from cement (the producers' own clinker), ammonia (fertilizer production by product, a factor calibrated to Pakistan's official inventory, net of the CO\u2082 recovered into urea), iron and steel (crude steel at the electric-route factor) and lubricant use (the oxidised share of lubricants sold). Nitric acid is carried as a pair, not a point; soda ash is not an IPPU emission for a Solvay country.",
    sources: "The cement producers' annual reports; NFDC fertilizer production statistics; PBS's Quantum Index of Manufacturing (billets and ingots); OCAC's non-energy sectoral sales.",
    activity: "Clinker made, with the kilns named for placement; ammonia embodied in fertilizer output; crude steel melted; lubricants and greases sold.",
    method: "The clinker-based process equation with the release's clinker factor; IPCC Tier 1 for ammonia (calibrated), steel (EAF) and lubricants (oxidised-during-use fraction).",
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


/**
 * The public sector page's own words (the mockup's register): a one-line dek, and the first
 * two stages of "How this estimate is built". Stages three and four are the same for every
 * sector (standard IPCC methods; added to the national inventory) and live in SectorPage.
 * No digits, no internal vocabulary - this is the reader's layer.
 */
export type SectorStory = { dek: string; step1: string; step2: string };

export const SECTOR_STORY: Record<string, SectorStory> = {
  agriculture: {
    dek: "How Pakistan\u2019s agricultural emissions are estimated from livestock, crops and fertiliser data.",
    step1: "Animal counts, crop areas and fertiliser use.",
    step2: "Livestock, rice, nitrogen applied to soils and crop residues.",
  },
  aviation: {
    dek: "How emissions from domestic flights are estimated from aircraft movements and jet-fuel sales.",
    step1: "Aircraft movements and jet-fuel sales records.",
    step2: "Fuel burnt on domestic flights.",
  },
  fugitives: {
    dek: "How leaks, venting and flaring from oil and gas operations are estimated from industry statistics.",
    step1: "The petroleum regulator\u2019s annual industry statistics.",
    step2: "Wells, processing plants, pipelines and the gas they handle.",
  },
  industry: {
    dek: "How emissions from fuel burnt in manufacturing are estimated from fuel sales records.",
    step1: "Fuel sales to industry from petroleum and gas records.",
    step2: "Each fuel delivered to factories and workshops.",
  },
  ippu: {
    dek: "How process emissions from cement making are estimated from producers\u2019 own reports.",
    step1: "Cement producers\u2019 annual reports.",
    step2: "Clinker, the baked ingredient at the heart of cement.",
  },
  power: {
    dek: "How emissions from electricity generation are estimated from each plant\u2019s reported fuel.",
    step1: "The electricity regulator\u2019s plant-by-plant fuel reports.",
    step2: "Fuel burnt at power stations and in captive generation.",
  },
  railways: {
    dek: "How railway emissions are estimated from the national railway\u2019s own records.",
    step1: "The national railway\u2019s year book.",
    step2: "Diesel burnt by locomotives.",
  },
  residential: {
    dek: "How emissions from cooking and heating at home are estimated from household survey data.",
    step1: "Household surveys and gas-connection records.",
    step2: "Firewood, dung, crop residues, gas and other household fuels.",
  },
  transport: {
    dek: "How road transport emissions are estimated from fuel sales and the vehicle fleet.",
    step1: "Fuel sales records and vehicle registrations.",
    step2: "Petrol, diesel and gas burnt on the roads.",
  },
  waste: {
    dek: "How emissions from waste and wastewater are estimated from population and utility data.",
    step1: "Population statistics and utility records.",
    step2: "Solid waste at disposal sites, open burning and wastewater.",
  },
};

export const GENERIC_STORY: SectorStory = {
  dek: "How this sector\u2019s emissions are estimated from public records.",
  step1: "Published statistics and administrative records.",
  step2: "The quantities the public records report.",
};

export function sectorStory(id: string): SectorStory {
  return SECTOR_STORY[id] ?? GENERIC_STORY;
}

/** Category names in the reader's words; a category the map does not know passes through. */
export const INCLUDED_LABELS: Record<string, string> = {
  "Enteric fermentation": "Livestock digestion",
  "Manure management": "Manure",
  "Field burning of agricultural residues": "Crop-residue burning",
  "Urea application": "Urea use",
  "Product uses as substitutes for ODS (F-gases)": "F-gases",
};

export function includedLabel(category: string): string {
  return INCLUDED_LABELS[category] ?? category;
}

/** Not-yet-estimated names in the reader's words; the fallback is the category as shipped. */
export const PLAIN_GAPS: Record<string, string> = {
  "Agricultural soils - N from SOC mineralisation": "Emissions from soil-carbon mineralisation",
  "Agricultural soils - N from SOC mineralisation (FSOM)": "Emissions from soil-carbon mineralisation",
  "Other carbon-containing fertilizers": "Other carbon-containing fertilisers",
};

export function plainGap(category: string): string {
  return PLAIN_GAPS[category] ?? category;
}
