"""Conservative local intent routing. No inference token is used on this path."""
from __future__ import annotations
from dataclasses import dataclass, field
import re
from .knowledge import Knowledge,normalise
from .models import AskRequest

GAS_PATTERNS={
 'co2e':r'\b(co2e|carbon dioxide equivalent)\b',
 'gas_co2':r'\b(co2|carbon dioxide)\b', 'gas_ch4':r'\b(ch4|methane)\b',
 'gas_n2o':r'\b(n2o|nitrous oxide)\b','gas_nh3':r'\b(nh3|ammonia)\b',
 'gas_nox':r'\b(nox|no2|nitrogen dioxide|nitrogen oxides)\b',
 'gas_so2':r'\b(so2|sulfur dioxide)\b','gas_co':r'\b(co|carbon monoxide)\b',
 'gas_pm25':r'\b(pm2\.5|fine particles)\b','gas_pm10':r'\b(pm10|particulate matter)\b',
 'gas_bc':r'\b(bc|black carbon)\b','gas_nmvoc':r'\b(nmvoc|vocs?|volatile organic)\b',
 'gas_ozone':r'\b(o3|ozone)\b','gas_fgas':r'\b(hfcs?|sf6|fluorinated|f[- ]gases)\b'}
METRIC_CARD={'CO2e':'co2e','CO2':'gas_co2','CH4':'gas_ch4','N2O':'gas_n2o','NH3':'gas_nh3','NOx':'gas_nox','NO2':'gas_nox','SO2':'gas_so2','CO':'gas_co','PM2.5':'gas_pm25','PM10':'gas_pm10','BC':'gas_bc','NMVOC':'gas_nmvoc','O3':'gas_ozone','HFCs':'gas_fgas','SF6':'gas_fgas'}
SECTOR_WORDS={'agriculture':r'\b(agriculture|agricultural|livestock|crops?|rice|manure|fertilisers?)\b','power':r'\b(power|electricity|nepra|generation)\b','transport':r'\b(transport|road|vehicles?|cars?|diesel trucks?)\b','waste':r'\b(waste|wastewater|landfills?|sewers?)\b','residential':r'\b(residential|household|hies|stoves?|dung|firewood)\b','fugitives':r'\b(fugitives?|leakage|leaks?|pipelines?|ufg)\b','ippu':r'\b(ippu|clinker|cement|ammonia production|steel|lubricants?)\b','industry':r'\b(industry|industrial|brick|kilns?|factories)\b','railways':r'\b(railways?|rail|trains?|locomotive)\b','aviation':r'\b(aviation|flights?|aircraft|airports?|pcaa)\b'}
@dataclass
class Plan:
    card_ids:list[str]=field(default_factory=list)
    operation:str|None=None
    notice:str|None=None
    needs_selection:bool=False
    explicit:bool=False


def route(req:AskRequest,k:Knowledge)->Plan:
    q=normalise(req.question).strip('?.!')
    if req.card_id:
        if req.card_id not in k.cards:raise ValueError('Unknown explanation card')
        return Plan([req.card_id],explicit=True)
    if re.search(r'\b(ignore (all |previous |your )?instructions|reveal.*(key|secret|prompt)|system prompt|api key|run (python|shell|sql)|execute code|drop table|change.*(inventory|emission)|make.*(emissions|industry).*increase)\b',q):
        return Plan(['assistant'],notice='This assistant explains published evidence; it does not expose credentials, execute arbitrary instructions or change the inventory.')
    if re.search(r'\b(add|sum|combine)\b',q) and (('pm2.5' in q and ('pm10' in q or 'black carbon' in q)) or 'all pollutants' in q):
        return Plan(['gas_pm10'],notice='Overlapping pollutant fractions must not be added. This is not a valid total.')
    if re.search(r'\b(aqi|safe to breathe|health risk|safe for|exposure|air quality index)\b',q):return Plan(['exposure'])
    # Source conflicts are scoped: learning what ammonia is must still work.
    if re.search(r'\b(ammonia|steel|lubricant|ippu)\b',q) and re.search(r'\b(included|estimated|covered|coverage|only cement|missing|absent)\b',q):
        return Plan(['conflict_ippu'],operation='coverage')
    if re.search(r'\b(transport|road)\b',q) and re.search(r'\b(wear|evaporation|exhaust only|air coverage)\b',q):return Plan(['conflict_transport_air'],operation='coverage')
    # Exact editor-authored aliases; no paid classification needed.
    if q in k.aliases:
        id=k.aliases[q]
        op={'source_chain':'provenance','industry_mapping':'coverage','conflict_uncertainty':'uncertainty'}.get(id)
        if req.context.view in {'overview','explore','map','analyze'}:
            op={'patterns':'pattern','uncertainty':'uncertainty'}.get(id,op)
        return Plan([id],operation=op,explicit=True)
    if q in ('why','why do this','why is this important','why is it important','why are they important','tell me more','explain more','more detail','explain that'):
        if req.last_card_id in k.cards:
            id=req.last_card_id
            if id.startswith('mc') and q.startswith('why'):id='mc_why'
            elif id=='emissions' and q.startswith('why'):id='importance'
            return Plan([id])
        if req.context.metric!='CO2e':return Plan([METRIC_CARD[req.context.metric]])
        return Plan(['importance' if q=='why are they important' else 'why_inventory'],notice='No previous topic is selected; this explains emissions generally.' if q=='why are they important' else 'No previous topic is selected; this explains why the inventory is useful.')
    # Conceptual gas comparisons do not need a live inventory query.
    gas_comparison=[id for id,p in GAS_PATTERNS.items() if re.search(p,q)]
    if len(gas_comparison)>1 and re.search(r'compare|difference|versus|vs',q) and not re.search(r'emissions|total|20\d{2}|here|selected|province|district|pakistan',q):
        return Plan(gas_comparison[:2])
    # View-sensitive quantitative requests are never answered by a model-selected card.
    quantitative=bool(re.search(r'\b(how much|how many|compare|highest|lowest|largest emitter|total emissions|exact value|value of|which province)\b',q))
    scoped=bool(re.search(r'\b(this (bar|chart|map|result|view)|here|selected|punjab|sindh|lahore|karachi|balochistan|khyber|fy\d{4}|20\d{2})\b',q))
    if quantitative or (scoped and re.search(r'\b(pattern|trend|uncertainty|increase|decrease|changed|fell|rose)\b',q)):
        op='uncertainty' if re.search(r'uncertain|interval|percentile',q) else 'coverage' if re.search(r'cover|mapped|missing',q) else 'pattern' if re.search(r'pattern|trend|compar|increase|decrease|changed|fell|rose',q) else 'value'
        id={'uncertainty':'uncertainty','coverage':'not_estimated','pattern':'patterns','value':'live_required'}[op]
        return Plan([id],operation=op)
    if 'this gas' in q or 'this pollutant' in q or 'selected gas' in q:
        return Plan([METRIC_CARD[req.context.metric]],notice='CO₂e is the selected metric, not an individual gas.' if req.context.metric=='CO2e' else None)
    source_intent=bool(re.search(r'\b(sources?|data|provenance|underlying|inputs?)\b',q))
    method_intent=bool(re.search(r'\b(method|methodology|calculate|calculated|estimate|estimated|work)\b',q))
    matched_sectors=[s for s,p in SECTOR_WORDS.items() if re.search(p,q)]
    # Prefer specific modes to generic industrial words.
    sector=(matched_sectors[-1] if matched_sectors else req.context.sector)
    if source_intent:
        if re.search(r'\b(this|that|selected|underlying|trace)\b',q):return Plan(['source_chain'],operation='provenance')
        if sector!='all':return Plan([f'{sector}_data'])
        if 'sources of' not in q:return Plan(['sources'])
    if 'monte carlo' in q:
        id='mc_example' if 'example' in q else 'mc_why' if 'why' in q else 'mc_convergence' if re.search('more|draw|converg',q) else 'mc'
        return Plan([id])
    if re.search(r'\b(uncertainty|uncertain)\b',q):
        if 'trend' in q or 'change' in q:return Plan(['trend_uncertainty'])
        candidate=f'{sector}_uncertainty'
        return Plan([candidate if candidate in k.cards else 'uncertainty'])
    if re.search(r'\b(dung|configuration l|configuration s)\b',q):return Plan(['dung'])
    if re.search(r'\b(pattern|trend)\b',q):return Plan(['patterns'])
    if re.search(r'\b(fall|fell|decline|increase|decrease|cause|caused)\b',q) and ('emission' in q or matched_sectors):return Plan(['causality'])
    if method_intent and sector!='all':
        candidate=f'{sector}_method';return Plan([candidate if candidate in k.cards else f'{sector}_data'])
    gas_ids=[id for id,p in GAS_PATTERNS.items() if re.search(p,q)]
    # CO2 does not substring-match CO2e; nitrogen oxide names remain distinct.
    if gas_ids:return Plan(gas_ids[:2])
    if re.search(r'\b(source|document|catalogue|catalog)\b.*\b(disagree|conflict|authoritative|priority)\b',q):return Plan(['product_priority'])
    if re.search(r'\b(importance|important|matter)\b',q) and 'emission' in q:return Plan(['importance'])
    if re.search(r'\b(emission factor|activity data|spatial allocation|global warming potential)\b',q):
        for phrase,id in [('emission factor','factor'),('activity data','activity'),('spatial allocation','mapping'),('global warming potential','gwp')]:
            if phrase in q:return Plan([id])
    # No automatic low-confidence answer: offer candidates, or optional model selection.
    return Plan([],needs_selection=True)
