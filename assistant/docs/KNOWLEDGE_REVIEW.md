# Prepared-answer review book

Knowledge digest: `e916651935428c1a39a75ff46841f980b2419f104c2d924e36367a1b88c4af9c`

Status: drafted for owner review. These entries are the exact prepared content used by the app, not an independent validation of the underlying inventory. General-science primers are distinct from project source inputs.

## What are emissions?
ID: `emissions` · Basics

**Short answer**
Emissions are substances released from a source. Here we are mainly talking about gases and particles released into the air—for example, carbon dioxide from burning fuel, methane from livestock, or particles from smoke.

**Fuller explanation**
An emissions inventory estimates how much is released during a stated period. It is different from an air-quality monitor, which measures the concentration at a particular place. A number in tonnes per year is not a reading of the air you are breathing.

**References**
- [EPA · Overview of greenhouse gases; general-science webpage](https://www.epa.gov/ghgemissions/overview-greenhouse-gases)
- [EPA · Particulate matter basics; general-science webpage](https://www.epa.gov/pm-pollution/particulate-matter-pm-basics)
- [TN05 · Residential fuels; PDF page(s) 3](../sources/residential.pdf)

Review: pending.

## Why do emissions matter?
ID: `importance` · Basics

**Short answer**
Different emissions matter for different reasons. Greenhouse gases change Earth’s heat balance. Air pollutants can damage air quality. The same activity can release both, but a climate total and an air-pollution total answer different questions.

**Fuller explanation**
Knowing the source, quantity and uncertainty helps identify where to investigate reductions and where better data are needed. An emissions ranking alone does not tell us which intervention saves the most lives or is cheapest; those questions need additional evidence.

**References**
- [NASA · Causes of climate change; general-science webpage](https://science.nasa.gov/climate-change/causes/)
- [EPA · Particulate matter basics; general-science webpage](https://www.epa.gov/pm-pollution/particulate-matter-pm-basics)
- [National data-description article; PDF page(s) 3](../sources/national.pdf)
- [TN05 · Residential fuels; PDF page(s) 1](../sources/residential.pdf)

Review: pending.

## What is a greenhouse gas?
ID: `greenhouse` · Basics

**Short answer**
A greenhouse gas absorbs and emits infrared radiation, slowing the loss of heat from Earth to space. The natural greenhouse effect makes Earth warmer than it would otherwise be; adding more of these gases changes that balance.

**Fuller explanation**
Carbon dioxide, methane and nitrous oxide are examples. They differ in how strongly they affect radiation and how long their effects persist, so an equal mass of each is not an equal climate contribution.

**References**
- [NASA · Causes of climate change; general-science webpage](https://science.nasa.gov/climate-change/causes/)
- [EPA · Overview of greenhouse gases; general-science webpage](https://www.epa.gov/ghgemissions/overview-greenhouse-gases)

Review: pending.

## Carbon dioxide · CO₂
ID: `gas_co2` · Gases

**Short answer**
Carbon dioxide is a greenhouse gas released by fuel combustion and some chemical processes. It is also part of the natural carbon cycle. Human activity adds carbon dioxide and changes how much natural systems can remove.

**Fuller explanation**
For PakEmis, fossil-fuel combustion and clinker calcination are separate sources. The fuel burned to heat a cement kiln is not the same emission as the carbon dioxide released by the reaction that makes clinker. Carbon monoxide, CO, is a different substance.

**References**
- [EPA · Carbon dioxide emissions; general-science webpage](https://www.epa.gov/ghgemissions/carbon-dioxide-emissions)
- [TN07 · Industrial processes and product use; PDF page(s) 2](../sources/ippu.pdf)

Review: pending.

## Methane · CH₄
ID: `gas_ch4` · Gases

**Short answer**
Methane is a greenhouse gas. Human-related sources include livestock, decomposing organic waste and leaks in fossil-fuel systems. It has a shorter atmospheric lifetime than carbon dioxide and a stronger warming effect per unit mass over the usual comparison periods.

**Fuller explanation**
PakEmis treats methane from biological sources and fossil sources separately when converting to carbon-dioxide equivalent. The selected GWP metric and time horizon belong beside that comparison; “methane is X times stronger” is incomplete without them.

**References**
- [EPA · Methane emissions; general-science webpage](https://www.epa.gov/ghgemissions/methane-emissions)
- [National data-description article; PDF page(s) 6](../sources/national.pdf)

Review: pending.

## Nitrous oxide · N₂O
ID: `gas_n2o` · Gases

**Short answer**
Nitrous oxide is a greenhouse gas associated with nitrogen cycling, including agricultural soils, manure and wastewater. Combustion and some industrial processes also release it.

**Fuller explanation**
In this inventory, soil nitrogen and the factors describing its conversion to nitrous oxide are important parts of the estimate. N₂O is not the same as nitrogen dioxide, NO₂, or the NOx group: their chemistry, effects and accounting are different.

**References**
- [EPA · Nitrous oxide emissions; general-science webpage](https://www.epa.gov/ghgemissions/nitrous-oxide-emissions)
- [EPA · Nitrogen dioxide basics; general-science webpage](https://www.epa.gov/no2-pollution/basic-information-about-no2)
- [TN01 · Agriculture; PDF page(s) 2, 3](../sources/agriculture.pdf)

Review: pending.

## Ammonia · NH₃
ID: `gas_nh3` · Gases

**Short answer**
Ammonia is a nitrogen-containing gas. The agriculture note links its emissions to manure and fertiliser and explains that it can contribute to secondary fine-particle formation away from the original source.

**Fuller explanation**
PakEmis reports agricultural ammonia in its air-pollutant layer, not as an extra term in the greenhouse-gas CO₂e total. Ammonia emitted to the air and carbon dioxide emitted during ammonia manufacture are different inventory quantities.

**References**
- [TN01 · Agriculture; PDF page(s) 2, 3](../sources/agriculture.pdf)
- [TN07 · Industrial processes and product use; PDF page(s) 2](../sources/ippu.pdf)

Review: pending.

## Nitrogen oxides · NOx
ID: `gas_nox` · Gases

**Short answer**
NOx is a group of nitrogen oxides, especially nitric oxide and nitrogen dioxide, associated with fuel combustion. These gases contribute to air-pollution chemistry, including ozone and particle formation.

**Fuller explanation**
The transport note reports NOx as NO₂-equivalent mass. That convention does not turn NOx into nitrous oxide, N₂O, which is separately counted as a greenhouse gas.

**References**
- [EPA · Nitrogen dioxide basics; general-science webpage](https://www.epa.gov/no2-pollution/basic-information-about-no2)
- [TN03 · Road and off-road transport; PDF page(s) 4](../sources/transport.pdf)

Review: pending.

## Sulfur dioxide · SO₂
ID: `gas_so2` · Gases

**Short answer**
Sulfur dioxide is a gas produced when sulfur-containing fuels or materials are processed or burned. It affects air quality and participates in particle formation.

**Fuller explanation**
The railway note makes fuel sulfur content an explicit scenario because no single measured national diesel-sulfur value is established there. A sulfur specification is not necessarily a measurement of the fuel actually burned.

**References**
- [EPA · Sulfur dioxide basics; general-science webpage](https://www.epa.gov/so2-pollution/sulfur-dioxide-basics)
- [TN09 · Railways; PDF page(s) 4](../sources/railways.pdf)
- [Railways supplementary methods; PDF page(s) 1](../sources/railways_supplement.pdf)

Review: pending.

## Carbon monoxide · CO
ID: `gas_co` · Gases

**Short answer**
Carbon monoxide is a gas released when carbon-containing fuel burns incompletely. It is a different molecule from carbon dioxide, CO₂. Carbon monoxide matters for air quality because breathing it can reduce oxygen delivery in the body.

**Fuller explanation**
An emissions inventory estimates the amount released; it cannot determine someone’s exposure or the safety of a room from an annual emissions value.

**References**
- [EPA · Carbon monoxide basics; general-science webpage](https://www.epa.gov/co-pollution/basic-information-about-carbon-monoxide-co-outdoor-air-pollution)
- [TN05 · Residential fuels; PDF page(s) 3](../sources/residential.pdf)

Review: pending.

## Fine particles · PM₂.₅
ID: `gas_pm25` · Gases

**Short answer**
PM₂.₅ is not a gas. It is a size class of fine particles and droplets, generally 2.5 micrometres or smaller. Some particles are emitted directly; others form in the atmosphere from gases.

**Fuller explanation**
The primary-PM₂.₅ figures in PakEmis describe emitted particle mass. They are not ambient concentration, an AQI reading, or the complete secondary-particle burden. Black carbon can already be part of PM₂.₅, so adding the two would double count part of the mass.

**References**
- [EPA · Particulate matter basics; general-science webpage](https://www.epa.gov/pm-pollution/particulate-matter-pm-basics)
- [National supplement; PDF page(s) 1, 3, 4](../sources/national_supplement.pdf)

Review: pending.

## Particles · PM₁₀
ID: `gas_pm10` · Gases

**Short answer**
PM₁₀ is a particle-size class that includes particles generally 10 micrometres or smaller. PM₂.₅ is contained within PM₁₀, not a separate quantity to add to it.

**Fuller explanation**
PakEmis keeps named pollutant species and size fractions separate. A sum of PM₁₀, PM₂.₅ and black carbon would count overlapping material more than once.

**Always-visible caveats**
PM₂.₅ is contained within PM₁₀; adding both would double-count the fine fraction.

**References**
- [EPA · Particulate matter basics; general-science webpage](https://www.epa.gov/pm-pollution/particulate-matter-pm-basics)
- [National supplement; PDF page(s) 1](../sources/national_supplement.pdf)

Review: pending.

## Black carbon · BC
ID: `gas_bc` · Gases

**Short answer**
Black carbon is a light-absorbing component of soot produced by incomplete combustion. It is a particle component, not a greenhouse gas. It matters for climate and air quality; deposition on snow or ice can reduce reflectivity.

**Fuller explanation**
In PakEmis, black carbon is reported as a pollutant in its own mass units. Where it is included in a PM₂.₅ estimate, it is a component of that mass rather than an additional amount.

**References**
- [Climate & Clean Air Coalition · Black carbon; general-science webpage](https://www.ccacoalition.org/short-lived-climate-pollutants/black-carbon)
- [National supplement; PDF page(s) 1](../sources/national_supplement.pdf)

Review: pending.

## Non-methane volatile organic compounds
ID: `gas_nmvoc` · Gases

**Short answer**
NMVOC means non-methane volatile organic compounds: a group of compounds, not one gas. Volatile organic compounds participate with nitrogen oxides in the chemistry that forms ground-level ozone.

**Fuller explanation**
The transport documentation separates exhaust, evaporation and other processes. The group name alone does not identify the chemical mixture, and a national NMVOC mass is not a toxicity or exposure estimate.

**References**
- [EPA · Ground-level ozone basics; general-science webpage](https://www.epa.gov/ground-level-ozone-pollution/ground-level-ozone-basics)
- [Transport supplementary methods; PDF page(s) 6](../sources/transport_supplement.pdf)

Review: pending.

## Ground-level ozone · O₃
ID: `gas_ozone` · Gases

**Short answer**
Ground-level ozone is an air pollutant formed mainly through chemical reactions involving nitrogen oxides and volatile organic compounds in sunlight. It is not usually emitted directly in the same way as smoke from a stack.

**Fuller explanation**
An emissions inventory of ozone precursors is not an ozone-concentration map. Converting precursor emissions into concentrations needs atmospheric chemistry and transport modelling.

**References**
- [EPA · Ground-level ozone basics; general-science webpage](https://www.epa.gov/ground-level-ozone-pollution/ground-level-ozone-basics)

Review: pending.

## Fluorinated gases
ID: `gas_fgas` · Gases

**Short answer**
Fluorinated gases are a family of synthetic greenhouse gases used in applications such as refrigeration and industrial equipment. Their climate effects differ by substance; an undifferentiated tonne of “F-gas” is not enough for a valid CO₂e conversion.

**Fuller explanation**
The IPPU note distinguishes gas supplied to a country from gas released out of equipment. Its equipment-bank screening is outside the reference total. Supply, equipment charge and annual leakage must not be treated as interchangeable.

**References**
- [EPA · Fluorinated gas emissions; general-science webpage](https://www.epa.gov/ghgemissions/fluorinated-gas-emissions)
- [TN07 · Industrial processes and product use; PDF page(s) 4](../sources/ippu.pdf)

Review: pending.

## What does CO₂e mean?
ID: `co2e` · Basics

**Short answer**
CO₂e means carbon-dioxide equivalent. It is a comparison unit, not a gas: each greenhouse gas’s mass is multiplied by a chosen global-warming-potential factor and the converted amounts are added.

**Fuller explanation**
The national note declares its AR5 GWP-100 convention and distinguishes fossil from biogenic methane. Changing the GWP metric changes the CO₂e total without changing the underlying gas masses. Air-pollutant masses are not added to this greenhouse-gas total.

**Always-visible caveats**
CO₂e is a comparison metric, not a gas or an air-quality reading.

**References**
- [National data-description article; PDF page(s) 6](../sources/national.pdf)
- [National supplement; PDF page(s) 1](../sources/national_supplement.pdf)

Review: pending.

## What is global warming potential?
ID: `gwp` · Basics

**Short answer**
Global warming potential, or GWP, compares the integrated climate effect of emitting a unit mass of a gas with the effect of emitting the same mass of carbon dioxide over a specified time horizon.

**Fuller explanation**
PakEmis stores AR5 and AR6 conversions alongside native gas masses rather than silently replacing one with the other. Comparisons must use the same metric, methane-origin treatment and time horizon.

**References**
- [EPA · Overview of greenhouse gases; general-science webpage](https://www.epa.gov/ghgemissions/overview-greenhouse-gases)
- [National data-description article; PDF page(s) 6](../sources/national.pdf)

Review: pending.

## What is PakEmis?
ID: `inventory` · Basics

**Short answer**
PakEmis is a reproducible public-data reconstruction of covered greenhouse-gas sources in Pakistan. Its canonical panel uses fiscal years from July to June and keeps land use, land-use change and forestry outside the reference national total.

**Fuller explanation**
Emission Flow is the interface you are building around that inventory. This assistant explains the supplied documentation; a live result must come from the connected, version-matched inventory products, not from the assistant’s recollection.

**References**
- [National data-description article; PDF page(s) 1, 6](../sources/national.pdf)

Review: pending.

## Why build an emissions inventory?
ID: `why_inventory` · Basics

**Short answer**
An inventory makes the accounting visible: what is estimated, which activities and factors drive it, where it is allocated, and what remains uncertain or unestimated.

**Fuller explanation**
PakEmis is organised so shared fuel and material flows are counted consistently across sectors. That helps track revisions and identify useful data improvements. Accounting consistency does not by itself prove that the activity data or emission factors are correct.

**References**
- [National data-description article; PDF page(s) 2, 6, 7, 35](../sources/national.pdf)

Review: pending.

## What are activity data?
ID: `activity` · Methods

**Short answer**
Activity data describe how much of the emitting activity occurred: fuel consumed, animals counted, crop area, clinker produced, waste generated or aircraft movements. The appropriate activity depends on the process.

**Fuller explanation**
The number used to set a national total can be different from the information used to map it. For example, livestock counts can determine the total while a livestock-density surface distributes that total within an area.

**References**
- [National data-description article; PDF page(s) 6, 12](../sources/national.pdf)
- [TN01 · Agriculture; PDF page(s) 3, 5](../sources/agriculture.pdf)

Review: pending.

## What is an emission factor?
ID: `factor` · Methods

**Short answer**
An emission factor describes emissions per unit of an activity—for example, a mass of gas per unit of fuel energy. PakEmis records the factor’s source and units alongside the activity it multiplies.

**Fuller explanation**
The correct factor depends on the gas, fuel and process. A factor for a power station is not automatically appropriate for a household stove or a locomotive, even when the fuel has the same name.

**References**
- [National data-description article; PDF page(s) 6](../sources/national.pdf)
- [National supplement; PDF page(s) 4, 5](../sources/national_supplement.pdf)

Review: pending.

## How are emissions calculated?
ID: `calculation` · Methods

**Short answer**
A common calculation is activity × emission factor, with unit conversions applied explicitly. For a fuel, that may mean converting litres to mass, mass to energy, and energy to each gas’s emissions.

**Fuller explanation**
Not every category is a one-line calculation. The waste-disposal model tracks waste still decaying from earlier years, and agriculture uses shared nitrogen and residue accounts. The assistant explains these methods; it does not replace them with its own arithmetic.

**Data chain**
Published activity → Recorded unit conversion → Process-appropriate factor or model → Native gas mass → Declared CO₂e metric

**References**
- [TN09 · Railways; PDF page(s) 3](../sources/railways.pdf)
- [TN04 · Waste; PDF page(s) 4, 5](../sources/waste.pdf)
- [TN01 · Agriculture; PDF page(s) 2](../sources/agriculture.pdf)

Review: pending.

## What sources does PakEmis use?
ID: `sources` · Sources

**Short answer**
The supplied notes describe Pakistani regulator and statistical records, household and agricultural surveys, producer filings, and published methods. Source roles differ: some set emissions totals, some distribute them, and some only evaluate the result.

**Fuller explanation**
Examples include PBS and NFDC for agricultural activity; NEPRA and OGRA for energy records; OCAC for petroleum customer classes; Pakistan Railways and PCAA for transport activity; and household, population and sanitation records for residential and waste estimates. IPCC and EMEP/EEA provide method and factor families. A source cited by a note is not necessarily a primary file included in this assistant package.

**References**
- [National data-description article; PDF page(s) 12](../sources/national.pdf)
- [TN01 · Agriculture; PDF page(s) 5](../sources/agriculture.pdf)
- [TN10 · Domestic aviation; PDF page(s) 2](../sources/aviation.pdf)
- [TN05 · Residential fuels; PDF page(s) 3](../sources/residential.pdf)
- [TN04 · Waste; PDF page(s) 3, 4](../sources/waste.pdf)

Review: pending.

## What data are behind this result?
ID: `source_chain` · Sources

**Short answer**
A traceable result needs a chain from the published source to the output: source document and period, extracted activity, conversions, factors, calculation method, and any timing or spatial allocation.

**Fuller explanation**
The national note names a source register and a source-to-stream table for this purpose. To trace the exact bar or map cell, the live adapter must return its stream identifiers and row-level references. A list of organisations is not enough to prove a particular number.

**Data chain**
Source document and edition → Table, cell or reported row → Activity and unit → Factor and method → Timing and placement, where used → Output and release digest

**References**
- [National data-description article; PDF page(s) 12, 13](../sources/national.pdf)

Review: pending.

## Do you hold every original source?
ID: `source_custody` · Sources

**Short answer**
Not every reference in a technical note is an archived primary dataset. The documentation distinguishes retained source files, derived inputs and sources that were used but not retained.

**Fuller explanation**
This prototype includes the uploaded notes and their page references, not every government report or activity file they cite. The inventory’s source register should supply the actual URL, hash and custody status when the live connection is added.

**References**
- [National data-description article; PDF page(s) 12, 15](../sources/national.pdf)
- [National supplement; PDF page(s) 6](../sources/national_supplement.pdf)

Review: pending.

## Are these measured emissions?
ID: `estimated` · Methods

**Short answer**
The inventory estimates emissions. Some inputs are measured or administratively reported, while others are surveyed, modelled, transferred from another period or explicitly assumed. A measured fuel quantity does not make every derived emission or map cell a direct measurement.

**Fuller explanation**
The source, activity, factor, time profile and spatial allocation should each keep their own evidence status. A mass-conserving map can be internally consistent while still having uncertain placement.

**References**
- [National data-description article; PDF page(s) 6, 12, 35](../sources/national.pdf)
- [National supplement; PDF page(s) 8, 9](../sources/national_supplement.pdf)

Review: pending.

## What do Tier 1, Tier 2 and Tier 3 mean?
ID: `tiers` · Methods

**Short answer**
In the agriculture note, Tier 1 combines standard equations and default factors with activity data; Tier 2 adds country-specific parameters or more detailed activity characterisation; Tier 3 uses more detailed models or measurement systems.

**Fuller explanation**
A higher tier is not a blanket quality label for the whole dataset. The note assigns tier status by category, and a detailed spatial grid does not automatically upgrade the emissions calculation’s tier.

**References**
- [TN01 · Agriculture; PDF page(s) 3](../sources/agriculture.pdf)

Review: pending.

## What is uncertainty?
ID: `uncertainty` · Uncertainty

**Short answer**
Uncertainty describes what we do not know precisely about an estimate. Fuel quantities, animal counts, emission factors, missing sources and the way emissions are distributed across time or space can all contribute.

**Fuller explanation**
PakEmis separates parameter uncertainty from timing, placement, structural choices and completeness. A narrow probability interval can still sit beside an important unestimated source or unresolved model choice.

**Always-visible caveats**
A national annual interval must not be reused as the uncertainty of a district, month or trend.

**References**
- [National data-description article; PDF page(s) 34, 35, 44](../sources/national.pdf)

Review: pending.

## What are Monte Carlo estimates?
ID: `mc` · Uncertainty

**Short answer**
Monte Carlo estimation repeats the emissions calculation using many plausible combinations of uncertain inputs. Rather than treating every activity and factor as exact, it samples from their declared distributions and records the resulting totals.

**Fuller explanation**
The collection of totals shows how uncertainty propagates through the calculation. Shared inputs must move together where the model declares a dependency. These are simulated calculations, not repeated observations of Pakistan.

**Always-visible caveats**
Monte Carlo draws are simulated calculations, not additional observations. The interval is conditional on the modelled inputs and assumptions.

**References**
- [National data-description article; PDF page(s) 34, 37](../sources/national.pdf)
- [Agriculture supplementary methods; PDF page(s) 5](../sources/agriculture_supplement.pdf)

Review: pending.

## Why use Monte Carlo?
ID: `mc_why` · Uncertainty

**Short answer**
It helps propagate uncertain inputs through calculations that are not well summarised by one symmetric “plus or minus” value. It can preserve bounded inputs, skewed outcomes and dependencies between quantities.

**Fuller explanation**
The national note combines the waste and fugitives engines’ own draws with other components’ draws. Running more simulations reduces simulation noise; it does not improve missing source data or decide which structural scenario is true.

**References**
- [National data-description article; PDF page(s) 34, 35](../sources/national.pdf)
- [TN06 · Oil and gas fugitives; PDF page(s) 5](../sources/fugitives.pdf)

Review: pending.

## Monte Carlo, with an example
ID: `mc_example` · Uncertainty

**Short answer**
Imagine estimating a boiler’s emissions. You are unsure about both its annual fuel use and the emission factor. One simulation uses a plausible fuel quantity and a plausible factor, multiplies them, and saves the result. Repeating that process produces a distribution of totals.

**Fuller explanation**
This is a teaching example, not a PakEmis measurement or a new inventory run. For the real system, the distributions, shared inputs and accounting constraints must come from the published uncertainty model.

**References**
- [National data-description article; PDF page(s) 34, 37](../sources/national.pdf)

Review: pending.

## What does a 95% interval mean?
ID: `interval` · Uncertainty

**Short answer**
For a Monte Carlo result, the 2.5th to 97.5th percentiles enclose the central 95% of the simulated outcomes under the specified input distributions and model configuration.

**Fuller explanation**
That is conditional on the assumptions used to generate the simulations. It is not a guarantee that every uncertainty, missing source or alternative model has been included. Read the percentile endpoints, unit, configuration and reference point together.

**Always-visible caveats**
This does not establish that all missing sources or alternative model choices are covered.

**References**
- [National data-description article; PDF page(s) 34, 35](../sources/national.pdf)
- [Fugitives supplementary methods; PDF page(s) 4](../sources/fugitives_supplement.pdf)

Review: pending.

## Why do the reference, mean and median differ?
ID: `mean_median` · Uncertainty

**Short answer**
The deterministic reference is one calculation at the inventory’s selected inputs. The Monte Carlo mean is the average of simulated results; the median is the point with half the results on each side.

**Fuller explanation**
When the calculation is nonlinear or the distributions are skewed, those values need not coincide. A percentage measured relative to the median must not be attached to the deterministic reference as though the centres were interchangeable.

**References**
- [National data-description article; PDF page(s) 34, 37](../sources/national.pdf)

Review: pending.

## Why do shared uncertainties matter?
ID: `correlation` · Uncertainty

**Short answer**
When two estimates use the same uncertain input, they can move together. Drawing a separate independent value for that same input in each place can understate or misrepresent the uncertainty of their combined result.

**Fuller explanation**
The national model records parameter dependencies and uses a common draw identifier across linked products. Positive and negative dependencies have different effects, and the selected dependence structure remains an assumption that should be stated.

**References**
- [National data-description article; PDF page(s) 37, 38, 43, 44](../sources/national.pdf)

Review: pending.

## How is a scenario different from an uncertainty interval?
ID: `structural` · Uncertainty

**Short answer**
A scenario changes a declared reading of the evidence or model structure—for example, where an unresolved fuel flow belongs. A parametric interval varies uncertain inputs while holding that selected structure fixed.

**Fuller explanation**
PakEmis publishes named structural alternatives separately. Their spread is not automatically a probability distribution, and averaging them would require weights the evidence may not support.

**References**
- [National data-description article; PDF page(s) 42, 43, 44](../sources/national.pdf)
- [TN06 · Oil and gas fugitives; PDF page(s) 5](../sources/fugitives.pdf)

Review: pending.

## How uncertain is a change over time?
ID: `trend_uncertainty` · Uncertainty

**Short answer**
A change has its own uncertainty. It should be calculated by subtracting matched years inside each shared simulation, so common errors can cancel or persist according to the model.

**Fuller explanation**
Borrowing an annual national percentage for a year-to-year change is not valid. The national note describes a separate trend-uncertainty product and alternative temporal-correlation assumptions; the selected result must come from that product.

**References**
- [National data-description article; PDF page(s) 44, 45](../sources/national.pdf)

Review: pending.

## Does a narrow interval mean the result is correct?
ID: `validation` · Uncertainty

**Short answer**
No. An uncertainty interval describes variation within an assumed model. Validation asks how the result compares with evidence that can reveal errors in that model or its inputs.

**Fuller explanation**
PakEmis separates checks of magnitude, timing and geography. Matching a national total does not validate a map, and finding a satellite hotspot near a facility does not validate its annual emission total. Exact sums test accounting, not independent accuracy.

**References**
- [National data-description article; PDF page(s) 35](../sources/national.pdf)
- [TN01 · Agriculture; PDF page(s) 4](../sources/agriculture.pdf)

Review: pending.

## Would more Monte Carlo runs make the data better?
ID: `mc_convergence` · Uncertainty

**Short answer**
More draws can make the simulated percentiles more stable by reducing Monte Carlo sampling noise. They do not turn an uncertain activity datum into a measured one.

**Fuller explanation**
The national note reports a larger national run and a smaller common-ensemble prefix for different products. The draw count, seed and convergence diagnostics belong to each product; one count should not be repeated as though every sector and output uses it.

**References**
- [National data-description article; PDF page(s) 34, 43, 44](../sources/national.pdf)

Review: pending.

## How should I read an emissions pattern?
ID: `patterns` · Patterns

**Short answer**
First identify the quantity: gas mass or CO₂e, sector boundary, geography, period and configuration. Then distinguish the size of the emissions from the way they have been allocated over months or places.

**Fuller explanation**
A pattern can reflect activity data, an allocation proxy or an assumption. A flat monthly line may mean that timing was not observed, not that real emissions were constant. Exact values for a selected chart must come from the chart’s version-matched data.

**Always-visible caveats**
A visual pattern alone does not establish its physical cause.

**References**
- [National data-description article; PDF page(s) 6, 29](../sources/national.pdf)
- [National supplement; PDF page(s) 7, 8](../sources/national_supplement.pdf)

Review: pending.

## Does a falling bar tell us why emissions fell?
ID: `causality` · Patterns

**Short answer**
A contribution-to-change table can identify which recorded streams increased or decreased. It does not, by itself, separate changes caused by output, efficiency, fuel switching, revised source data or reporting coverage.

**Fuller explanation**
The explanation should state what the published data actually show and keep proposed causes labelled as hypotheses unless a supporting decomposition or independent evidence is available. A preferred direction is not evidence for changing the inventory.

**References**
- [National data-description article; PDF page(s) 6, 9, 10, 35](../sources/national.pdf)

Review: pending.

## Where do the monthly estimates come from?
ID: `monthly` · Methods

**Short answer**
The release distinguishes observed monthly data (TE1), reconstruction from monthly administrative records (TE2), process-based profiles (TE3), and declared flat profiles (TE4). These are different evidence classes, not interchangeable observations.

**Fuller explanation**
For a fuel stream, monthly sales can describe timing; for a process, production or a process-specific profile may be used instead. The twelve allocated months must reconcile to that year’s total, but this identity does not prove the monthly shape is correct.

**References**
- [National supplement; PDF page(s) 7, 8](../sources/national_supplement.pdf)

Review: pending.

## How are emissions put on the map?
ID: `mapping` · Methods

**Short answer**
The inventory places emissions using source locations or process-related spatial information, then reconciles the allocation to its control total. The map may use facilities, tracks, livestock, crop area or another declared proxy.

**Fuller explanation**
The spatial evidence classes describe the basis of placement. A detailed grid is not a network of direct measurements, and an unallocated quantity must remain visible rather than being spread over arbitrary cells.

**Always-visible caveats**
Mapped detail is not the same as direct measurement or complete source coverage.

**References**
- [TN01 · Agriculture; PDF page(s) 3, 4](../sources/agriculture.pdf)
- [National supplement; PDF page(s) 8, 9](../sources/national_supplement.pdf)

Review: pending.

## Physical, origin and accounting views
ID: `spatial_views` · Methods

**Short answer**
A physical view aims to place emissions where the emitting process occurs. An origin view can place a waste flow where it was generated. An accounting view can follow the location where fuel sales were recorded.

**Fuller explanation**
Those labels describe different meanings of location. For example, the place waste originates is not necessarily the disposal site that releases methane. The assistant must preserve the selected view and the product’s aggregation rules.

**References**
- [National supplement; PDF page(s) 8](../sources/national_supplement.pdf)

Review: pending.

## What do NE, IE, NO and NA mean?
ID: `not_estimated` · Methods

**Short answer**
NE means not estimated; IE means included elsewhere; NO means not occurring; and NA means not applicable. These distinguish reasons why a numerical estimate is absent.

**Fuller explanation**
An unestimated source must not become zero when a chart or answer is generated. The same applies to gaps in time or geography: an unavailable district estimate does not establish that the district emitted nothing.

**References**
- [National data-description article; PDF page(s) 8, 9](../sources/national.pdf)
- [Fugitives supplementary methods; PDF page(s) 2, 3](../sources/fugitives_supplement.pdf)

Review: pending.

## Why can industry or power have two different totals?
ID: `boundaries` · Methods

**Short answer**
A software module describes where a calculation is performed. An IPCC category describes where the resulting emission is reported. They are not necessarily the same grouping.

**Fuller explanation**
The power note computes grid generation and industrial captive gas generation in one module, but reports them in different IPCC categories. Comparisons must keep the same reporting boundary rather than silently changing between module, IPCC and economic-sector views.

**References**
- [National data-description article; PDF page(s) 16](../sources/national.pdf)
- [TN02 · Electricity generation; PDF page(s) 5](../sources/power.pdf)

Review: pending.

## Is an emissions map an air-quality map?
ID: `exposure` · Basics

**Short answer**
No. An emissions map describes estimated releases. Concentration depends on where the material goes, how it disperses and reacts, and the weather; exposure also depends on where people are and how long they are there.

**Fuller explanation**
The residential and national documentation explicitly separate emitted mass from exposure. The assistant cannot turn an annual mass into an AQI or a personal health-risk estimate.

**References**
- [TN05 · Residential fuels; PDF page(s) 3](../sources/residential.pdf)
- [National data-description article; PDF page(s) 3](../sources/national.pdf)
- [National supplement; PDF page(s) 3, 4](../sources/national_supplement.pdf)

Review: pending.

## Are external inventories the ground truth?
ID: `benchmarks` · Methods

**Short answer**
External inventories are useful comparisons, not automatic ground truth. A fair comparison needs matching years, gases, scope and GWP conventions. Shared activity data can make two estimates less independent than their different publishers suggest.

**Fuller explanation**
The aviation note distinguishes a calibration input from an external comparison. The agriculture note similarly keeps benchmark totals separate from inputs used to construct its own inventory.

**References**
- [TN01 · Agriculture; PDF page(s) 3, 5](../sources/agriculture.pdf)
- [TN10 · Domestic aviation; PDF page(s) 2, 3](../sources/aviation.pdf)

Review: pending.

## Data behind agriculture
ID: `agriculture_data` · Sources

**Short answer**
The agriculture note uses the PBS agricultural census for livestock, Pakistani crop statistics for area and production, and NFDC records for fertiliser nitrogen. It distinguishes the fiscal inventory panel from a longer FAOSTAT-based calendar-year reconstruction.

**Fuller explanation**
Its mapping and evaluation sources serve different roles: livestock-density and crop-area layers support placement, while fire detections help allocate residue burning. Satellite fire locations do not independently set the national burned mass.

**Data chain**
PBS livestock / crop statistics / NFDC nitrogen → Agricultural activity and nitrogen ledgers → IPCC and EMEP/EEA methods → Separate timing and spatial proxies

**References**
- [TN01 · Agriculture; PDF page(s) 3, 5, 6](../sources/agriculture.pdf)

Review: pending.

## Why agriculture produces different gases
ID: `agriculture_method` · Methods

**Short answer**
The agriculture module separates enteric fermentation, manure management, rice cultivation, managed soils, residue burning and urea application. Different processes produce different gases, so one factor cannot represent all agriculture.

**Fuller explanation**
A shared nitrogen account follows nitrogen through manure and soils, while residue and dung-fuel transfers connect to residential combustion. Some management shares are declared judgements or unresolved provenance pointers, not national measurements.

**References**
- [TN01 · Agriculture; PDF page(s) 2, 3](../sources/agriculture.pdf)
- [Agriculture supplementary methods; PDF page(s) 3, 4, 5](../sources/agriculture_supplement.pdf)

Review: pending.

## Data behind electricity generation
ID: `power_data` · Sources

**Short answer**
The power note uses NEPRA’s national fuel-energy table as a control and its plant tables to describe the generating fleet. Industrial captive gas activity comes from OGRA and a captive-plant register.

**Fuller explanation**
It keeps grid generation separate from industrial self-generation and distinguishes fuel data used for magnitude from generation records used for structure and checks. The coal-energy conversion and K-Electric boundary remain declared structural questions in that note.

**Data chain**
NEPRA fuel-energy controls / OGRA captive gas → Fuel-specific conversion and factors → Grid versus industrial captive categories → Plant and temporal allocation

**References**
- [TN02 · Electricity generation; PDF page(s) 1, 3, 4, 5](../sources/power.pdf)

Review: pending.

## Why electricity estimates have alternative cases
ID: `power_uncertainty` · Uncertainty

**Short answer**
The power note describes alternative readings of the grid fuel-energy control, including a plant-implied coal calorific conversion and K-Electric coverage. Those are structural choices, not random fluctuations around a settled total.

**Fuller explanation**
A parametric interval is conditional on the selected member of that family. The assistant should not silently select the lowest or highest reading or mix the alternatives into an unweighted probability interval.

**References**
- [TN02 · Electricity generation; PDF page(s) 1, 2](../sources/power.pdf)
- [National data-description article; PDF page(s) 44](../sources/national.pdf)

Review: pending.

## Data behind road and off-road transport
ID: `transport_data` · Sources

**Short answer**
The transport note anchors fuel quantities to OCAC petroleum customer classes and metered transport CNG. Vehicle counts, travel assumptions and fuel intensities distribute the fuel between classes rather than determining the total fuel supply.

**Fuller explanation**
Retail customer labels do not perfectly identify end uses. The note retains unresolved agricultural and captive diesel uses and distinguishes mixed off-road machinery from the road category.

**Data chain**
OCAC road petroleum / OGRA transport gas → Conserved fuel-claimant ledger → Vehicle-class allocation → Gas-specific factors and declared reporting boundary

**References**
- [TN03 · Road and off-road transport; PDF page(s) 1, 3, 4, 5](../sources/transport.pdf)
- [Transport supplementary methods; PDF page(s) 4, 5](../sources/transport_supplement.pdf)

Review: pending.

## Data behind waste emissions
ID: `waste_data` · Sources

**Short answer**
The waste note uses a district population panel, waste-generation and collection assumptions, waste composition, and sanitation-pathway shares. These are model inputs, not nationally metered landfill tonnages or wastewater flows.

**Fuller explanation**
One waste quantity is divided among disposal, burning and unresolved fates. Disposal emissions depend on earlier deposits still decaying, while wastewater emissions depend on the organic and nitrogen loads and their treatment pathways.

**Data chain**
Population and sanitation records → Generation, collection and composition inputs → Shared waste-fate balance → Decay / burning / wastewater equations

**References**
- [TN04 · Waste; PDF page(s) 3, 4, 5](../sources/waste.pdf)

Review: pending.

## Why waste uncertainty can be wide
ID: `waste_uncertainty` · Uncertainty

**Short answer**
Waste estimates depend on uncertain waste quantities, disposal conditions and wastewater pathways. The methane correction factor describes how much organic material is treated as decomposing under methane-producing conditions.

**Fuller explanation**
The waste note publishes alternative sewer interpretations rather than claiming that comparison with another inventory settles the hydraulic condition. Its Monte Carlo reruns the parameterised accounts, preserving the waste-fate relationships.

**References**
- [TN04 · Waste; PDF page(s) 1, 3, 4, 5](../sources/waste.pdf)

Review: pending.

## Data behind household fuel emissions
ID: `residential_data` · Sources

**Short answer**
The residential note combines regulatory gas and petroleum records, HIES household-survey quantities, a cross-sector biomass ledger and an expenditure-derived generator estimate.

**Fuller explanation**
These inputs do not have equal status. It explicitly transfers the nearest household-survey round to the reference period, keeps that date mismatch visible, and separates measured household demand from a ledger-derived biomass destination.

**Data chain**
OGRA / OCAC + HIES survey → Fuel quantities and declared vintage transfer → Dung and residue links to agriculture → Fuel and gas factors

**References**
- [TN05 · Residential fuels; PDF page(s) 3, 4, 5](../sources/residential.pdf)

Review: pending.

## Why are there L and S configurations?
ID: `dung` · Uncertainty

**Short answer**
In the residential note, L assigns the biomass ledger’s diverted dung fuel to household combustion. S uses the household survey’s observed demand and keeps the destination of the remaining diverted material unresolved.

**Fuller explanation**
The ledger can conserve mass without establishing where it was used. These are different readings of an unresolved flow, not the lower and upper percentiles of a single statistical distribution.

**References**
- [TN05 · Residential fuels; PDF page(s) 1, 2, 4](../sources/residential.pdf)
- [National data-description article; PDF page(s) 43](../sources/national.pdf)

Review: pending.

## Data behind oil and gas leaks
ID: `fugitives_data` · Sources

**Short answer**
Fugitive emissions are releases across oil and gas systems, including leaks and other losses. The note uses production, refinery, pipeline, customer and gas-use controls to represent different supply-chain segments.

**Fuller explanation**
Flare observations and methane-plume detections are separate evaluation or memo layers. The note does not annualise every plume into a national total or add observed flaring on top of factors that already include it.

**Data chain**
Production and OGRA infrastructure controls → Segment-specific activity → IPCC practice-dependent factors → Separate gas-balance and satellite checks

**References**
- [TN06 · Oil and gas fugitives; PDF page(s) 1, 2, 3, 4](../sources/fugitives.pdf)

Review: pending.

## Why leakage estimates depend on practice
ID: `fugitives_uncertainty` · Uncertainty

**Short answer**
Leakage factors depend on equipment and practices that aggregate production figures do not reveal. The fugitives note identifies distribution-pipe material, leak detection and post-meter factors as important unresolved inputs.

**Fuller explanation**
Unaccounted-for gas is not the same as methane emitted: it can include theft, meter error and accounting effects as well as physical losses. Structural practice cases and conditional parametric intervals remain separate.

**References**
- [TN06 · Oil and gas fugitives; PDF page(s) 3, 5](../sources/fugitives.pdf)
- [Fugitives supplementary methods; PDF page(s) 4](../sources/fugitives_supplement.pdf)

Review: pending.

## Data behind industrial processes
ID: `ippu_data` · Sources

**Short answer**
The IPPU note reconciles cement and clinker statistics, clinker trade and company-reported clinker production. It keeps chemical process emissions separate from fuel burned for heat.

**Fuller explanation**
Other processes require their own activity definitions: ammonia needs carbon and recovery accounting; steel needs the production route; product-use gases need equipment and flow information. The uploaded set contains conflicting coverage statements, so current category status must be read from the generated completeness and product catalogues.

**Always-visible caveats**
Current ammonia, steel and lubricant activation is conflicted in the supplied prose. Consult the release catalogue.

**Data chain**
PBS / SBP production and trade → Producer clinker filings → Process-specific material balance → Process factors and separate combustion boundary

**References**
- [TN07 · Industrial processes and product use; PDF page(s) 1, 2, 3, 5](../sources/ippu.pdf)
- [National data-description article; PDF page(s) 16](../sources/national.pdf)

Review: pending.

## Data behind industrial combustion
ID: `industry_data` · Sources

**Short answer**
The national article describes industrial combustion from OGRA gas, OCAC industrial petroleum customer classes, and HDIP coal-by-consumer figures republished in the Statistical Supplement. Captive gas generation is computed in the power module but reported with industrial combustion.

**Fuller explanation**
These are fuel-stream accounts, not a complete factory census. A combined cement/other-industry coal label should not be presented as a clean, separately observed cement-only quantity. Coal-allocation and end-use questions remain part of the evidence record.

**Data chain**
OGRA gas / OCAC petroleum / HDIP coal → Reported consuming classes → Fuel energy and manufacturing factors → Reporting-category regrouping including captive gas

**References**
- [National data-description article; PDF page(s) 9, 10, 16](../sources/national.pdf)
- [TN02 · Electricity generation; PDF page(s) 3, 5](../sources/power.pdf)

Review: pending.

## What does the industrial map establish?
ID: `industry_mapping` · Methods

**Short answer**
The national supplement says industrial streams have been placed using kiln locations, the clinker register and built-up proxies. That is a mapping method, not proof of complete factory coverage or directly measured emissions at every location.

**Fuller explanation**
To state how much of the current industrial total has facility-based placement, use the release’s spatial profile and source-stream ledger. To state what fraction of all Pakistani industry is included, a separately defined completeness denominator is also required.

**Always-visible caveats**
A spatially allocated total does not establish the percentage of all Pakistani factories or industrial emissions covered.

**References**
- [National supplement; PDF page(s) 8, 9](../sources/national_supplement.pdf)
- [National data-description article; PDF page(s) 9, 16](../sources/national.pdf)

Review: pending.

## Data behind railway emissions
ID: `railways_data` · Sources

**Short answer**
The railway note starts with the operator’s annual fuel-consumption account, preserves units and converts fuel through density, net calorific value and railway-specific gas factors.

**Fuller explanation**
Locomotive traction is separated from the reported non-traction claimant. Track and yard geography constrain placement, while corridor weights remain declared assumptions rather than observed train traffic everywhere.

**Data chain**
Pakistan Railways fuel records → Density and net calorific conversion → Traction versus non-traction boundary → Rail factors and route-constrained allocation

**References**
- [TN09 · Railways; PDF page(s) 1, 3, 4](../sources/railways.pdf)
- [Railways supplementary methods; PDF page(s) 1, 2](../sources/railways_supplement.pdf)

Review: pending.

## Data behind domestic aviation
ID: `aviation_data` · Sources

**Short answer**
The aviation note uses PCAA movements and traffic controls, OCAC aviation fuel customer rows, and several flight and fuel models. It distinguishes who bought the fuel from whether a flight was domestic or international.

**Fuller explanation**
A domestic flight has both endpoints in Pakistan, regardless of airline nationality. A calibrated OECD partition is not independent validation, and reconstructed route–aircraft records must not be described as observed flights.

**Data chain**
PCAA movements / OCAC fuel customers → Domestic–international boundary bridge → Named movement or route model → Separate calibration and evaluation

**References**
- [TN10 · Domestic aviation; PDF page(s) 1, 2, 4](../sources/aviation.pdf)
- [Aviation supplementary methods; PDF page(s) 1, 2](../sources/aviation_supplement.pdf)

Review: pending.

## Why aviation has more than one estimate
ID: `aviation_uncertainty` · Uncertainty

**Short answer**
The aviation note separates an aggregate-movement estimate, route-based estimates, a calibrated fuel bridge and a route–aircraft Monte Carlo. These methods have different activity support and evidence roles.

**Fuller explanation**
The route–aircraft interval must not be attached to the aggregate estimate carried by the national inventory. More detailed modelling is not automatically the selected reference, and the calibrated bridge cannot validate itself.

**References**
- [TN10 · Domestic aviation; PDF page(s) 1, 4, 5, 6](../sources/aviation.pdf)
- [Aviation supplementary methods; PDF page(s) 6](../sources/aviation_supplement.pdf)

Review: pending.

## Which source wins when documents disagree?
ID: `product_priority` · Sources

**Short answer**
The uploaded notes explicitly give the generated release product catalogue priority when a sector report disagrees with the shipped products. Reports can lag the engine.

**Fuller explanation**
The assistant therefore needs two levels: a version-matched catalogue and semantic data for current values and coverage, and documents for explaining methods. Until that connection is available, disputed claims are marked as documentation conflicts rather than silently resolved.

**References**
- [TN07 · Industrial processes and product use; PDF page(s) 1](../sources/ippu.pdf)
- [National supplement; PDF page(s) 1](../sources/national_supplement.pdf)

Review: pending.

## Industrial-process coverage needs a catalogue check
ID: `conflict_ippu` · Evidence checks

**Short answer**
The uploaded national category table lists ammonia production, iron and steel, and lubricant use alongside cement. The IPPU technical note and some national prose still describe those non-cement categories as not estimated.

**Fuller explanation**
This is a documented conflict, not a reason to select either statement by retrieval score. The live release catalogue and category-level facts must resolve current coverage. The assistant can explain both passages but does not infer an activation status from the conflicting prose alone.

**Always-visible caveats**
Current coverage status is not resolved by the uploaded prose alone.

**References**
- [National data-description article; PDF page(s) 10, 11, 12, 16](../sources/national.pdf)
- [TN07 · Industrial processes and product use; PDF page(s) 1, 5](../sources/ippu.pdf)

Review: pending.

## Uncertainty percentages need a source check
ID: `conflict_uncertainty` · Evidence checks

**Short answer**
The national note reports percentile endpoints, a deterministic reference, a Monte Carlo median and percentage summaries. Some printed percentage summaries differ between the prose and the comparison table.

**Fuller explanation**
For a current answer, use the uncertainty table’s actual percentile endpoints and its declared centre. Do not attach a percentage from one passage to a different centre or silently repair the source inside a public explanation.

**Always-visible caveats**
The precise live uncertainty result requires the generated uncertainty product.

**References**
- [National data-description article; PDF page(s) 34, 37](../sources/national.pdf)

Review: pending.

## Road-pollutant scope needs a catalogue check
ID: `conflict_transport_air` · Evidence checks

**Short answer**
The supplied transport supplement contains evaporation and tyre, brake and road-wear factors. Some older-style passages in the transport note and national supplement still describe the air layer as an exhaust-only or uncited diagnostic.

**Fuller explanation**
The actual activated air-process rows and coverage matrix must determine the public answer. A factor being listed in a document is not, by itself, proof that it entered a particular result.

**Always-visible caveats**
Do not infer current air-layer process coverage from one prose passage.

**References**
- [TN03 · Road and off-road transport; PDF page(s) 2, 4](../sources/transport.pdf)
- [Transport supplementary methods; PDF page(s) 6, 7](../sources/transport_supplement.pdf)
- [National supplement; PDF page(s) 2, 4](../sources/national_supplement.pdf)

Review: pending.

## What pattern does the national report describe?
ID: `document_pattern` · Patterns

**Short answer**
The national article’s reference-year composition figure places agriculture above the other computational modules. Its category table separates livestock, soils, rice and other processes, and distinguishes grid generation from industrial captive generation.

**Fuller explanation**
This describes the supplied rc54 report, not a live query for another year, gas or configuration. Climate and air-pollutant rankings can differ, and an emissions ranking is not an exposure ranking.

**Always-visible caveats**
This describes the uploaded report, not the current selection or a freshly queried inventory.

**References**
- [National data-description article; PDF page(s) 15, 16](../sources/national.pdf)
- [National supplement; PDF page(s) 3, 4](../sources/national_supplement.pdf)

Review: pending.

## What can this assistant do?
ID: `assistant` · Basics

**Short answer**
I can explain emissions, gases, methods, sources and uncertainty using a prepared knowledge library and the uploaded technical notes. I can show the supporting document and page rather than asking you to trust an unsupported answer.

**Fuller explanation**
Exact chart questions are sent to a separate inventory adapter. In this starter, that live connection is not configured. I cannot change inventory values, run arbitrary code or browse the web from a public question. Optional AI only helps select existing explanation cards.

**References**

Review: pending.

## This question needs the selected data
ID: `live_required` · Evidence checks

**Short answer**
This question needs a version-matched inventory result for the selected sector, gas, geography, period and configuration. This documentation starter is not connected to that result yet.

**Fuller explanation**
I can explain the method and evidence requirements now, but I will not invent a value, a trend or an uncertainty interval from report fragments. The live adapter must return the authoritative result and its limitations.

**References**
- [National data-description article; PDF page(s) 6, 16](../sources/national.pdf)
- [National supplement; PDF page(s) 1](../sources/national_supplement.pdf)

Review: pending.
