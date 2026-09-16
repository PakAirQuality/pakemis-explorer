from __future__ import annotations
from collections import OrderedDict
import difflib,hashlib,json,re
from .knowledge import Knowledge,normalise,canonical
from .models import AskRequest
from .provider import GeminiSelector
from .routing import route
from .settings import Settings
from .state import State

SUGGESTED=['emissions','importance','gas_ch4','sources','mc','uncertainty','mapping','patterns']

class AssistantService:
    def __init__(self,settings:Settings,selector=None):
        self.settings=settings;self.k=Knowledge(settings.root);settings.validate(self.k.digest)
        self.state=State(settings.state_path,settings.state_secret)
        self.selector=selector if selector is not None else GeminiSelector(settings)

    def _base(self,req):
        return dict(release_id='1.0.0rc54',knowledge_digest=self.k.digest,context=req.context.model_dump(),
          editorial_status='owner-reviewed' if self.settings.production else 'draft_for_owner_review',
          live_result=False,model_calls=0,cache_hit=False,
          mode='curated',blocks=[],citations=[],limitations=[],notices=[],suggestions=[])

    def _render_cards(self,ids,req):
        # Shared cache contains only curated card content and public enum/ID context.
        # It never includes raw visitor questions, personal history or provider outputs.
        key=hashlib.sha256(canonical({'version':1,'ids':ids,'context':req.context.model_dump(),'depth':req.depth,'knowledge':self.k.digest}).encode()).hexdigest()
        cached=self.state.cache_get(key)
        if cached:return cached,True
        blocks=[];citations=OrderedDict();limitations=[]
        for id in ids:
            c=self.k.cards[id];refs=[]
            for ref in c['citations']:
                ck=canonical(ref);citations[ck]=self.k.cite(ref);refs.append(ck)
            paragraphs=[c['summary']]
            if req.depth=='detail' and c['detail']:paragraphs.append(c['detail'])
            # Important caveats are always visible, never hidden behind Read more.
            blocks.append(dict(card_id=id,title=c['title'],category=c['category'],paragraphs=paragraphs,
              more_available=req.depth=='simple' and bool(c['detail']),data_chain=c['data_chain'],
              citation_keys=refs,source_basis='general science and project documentation' if any(self.k.sources[r['source_id']]['kind']=='general_science' for r in c['citations']) else 'project documentation'))
            limitations.extend(c['caveats'])
        cites=[];indices={}
        for n,(ck,c) in enumerate(citations.items(),1):indices[ck]=n;cites.append(dict(number=n,**c))
        for b in blocks:b['citation_numbers']=[indices[r] for r in b.pop('citation_keys')]
        out={'blocks':blocks,'citations':cites,'limitations':list(dict.fromkeys(limitations))}
        self.state.cache_put(key,out);return out,False

    def _scope_notice(self,req):
        """Do not silently answer an explicit different geography/gas/year from the page filters.
        The v1 adapter is selected-view-only. A richer NL query parser is an integration task.
        """
        q=normalise(req.question)
        if re.search(r'\b(highest|lowest|largest emitter|top \d+|which province)\b',q):
            return 'Ranking queries are not enabled in this selected-view adapter. Choose the comparison in the inventory, then ask about that view.'
        places={'punjab':'PK-PB','sindh':'PK-SD','balochistan':'PK-BA','khyber pakhtunkhwa':'PK-KP','lahore':'LAHORE','karachi':'KARACHI'}
        mentioned=[v for n,v in places.items() if re.search(r'\b'+re.escape(n)+r'\b',q)]
        if mentioned and (len(mentioned)>1 or mentioned[0]!=req.context.geography_id):
            return 'The place named in the question differs from, or goes beyond, the selected view. Select the intended geography before requesting a numerical result.'
        fiscal=re.findall(r'fy(\d{4})[-–](\d{2})',q)
        allowed={req.context.start_period,req.context.end_period}
        if any(f'FY{a}-{b}' not in allowed for a,b in fiscal):return 'The requested fiscal period is not selected. Update the period before requesting a numerical result.'
        years=re.findall(r'(?<!fy)\b(20\d{2})\b',q)
        if years and not fiscal:return 'A bare calendar year is not a July–June fiscal period. Specify the intended period in the view.'
        from .routing import GAS_PATTERNS,METRIC_CARD,SECTOR_WORDS
        named_sectors=[s for s,p in SECTOR_WORDS.items() if re.search(p,q)]
        if named_sectors and (len(named_sectors)>1 or named_sectors[0]!=req.context.sector):
            return 'The named sector differs from, or goes beyond, the selected sector. Select the intended sector before requesting its numerical result or coverage.'
        named_categories={'ammonia':'2.B.1','steel':'2.C.1','lubricant':'2.D.1','cement':'2.A.1'}
        required=[code for name,code in named_categories.items() if re.search(r'\b'+name+r's?\b',q)]
        if required and re.search(r'include|cover|estimate|total|how much',q):
            if len(required)>1 or req.context.category_id!=required[0]:
                return 'This asks about a particular process category. Select its category before requesting the current coverage or value; the documentation explanation remains available.'
        named=[id for id,p in GAS_PATTERNS.items() if re.search(p,q)]
        if named and (len(named)>1 or named[0]!=METRIC_CARD[req.context.metric]):
            # Ammonia/steel process coverage is not a selected emitted gas question.
            if not re.search(r'included|coverage|covered|production',q):return 'The named gas or metric is different from the selected metric. Update it before requesting a numerical result.'
        return None

    async def ask(self,req:AskRequest,client:str):
        response=self._base(req)
        if req.context.release_id!='1.0.0rc54':
            response['mode']='release_mismatch';response['notices']=['This library documents 1.0.0rc54. It will not answer a different release from these notes.'];return response
        plan=route(req,self.k)
        if plan.notice:response['notices'].append(plan.notice)
        if plan.operation:
            # THE NUMBERS PATH IS NOT HERE ANY MORE (2026-09-14). A pinned pre-rendered export used
            # to answer this branch. It could not: the adapter matched all fifteen context fields
            # exactly, so one stored answer served one selection, and a deliberately small slice of
            # the interface already needed 1.7 million entries against a 10 MB ceiling. The Explorer
            # query service answers any selection in under a tenth of a second and mints a
            # replayable receipt, so `needs_query` hands this to the caller's tool loop and this
            # module answers the METHOD beside it. What survives unchanged is the refusal: a
            # question whose scope differs from the selection is still answered with a request to
            # select it, never with the selection's number.
            mismatch=self._scope_notice(req)
            response['mode']='needs_query' if not mismatch else 'needs_selection'
            response['notices'].append(mismatch or 'This asks for the selected result, which comes from the inventory query, not from these notes. The explanation below is about the method.')
        ids=plan.card_ids
        if plan.needs_selection:
            ranked=self.k.rank_cards(req.question,6)
            # High lexical agreement can catch small wording differences without a paid call.
            best_alias=difflib.get_close_matches(normalise(req.question).strip('?.!'),self.k.aliases.keys(),n=1,cutoff=.92)
            if best_alias:
                id=self.k.aliases[best_alias[0]]
                # Never bypass a live/conflict path via fuzzy aliases.
                if id not in {'source_chain','industry_mapping','conflict_ippu','conflict_uncertainty','conflict_transport_air','live_required'}:ids=[id]
            if not ids and self.settings.paid_enabled and req.allow_external_model and ranked:
                reservation=self.state.reserve(client,self.settings.reservation,self.settings.monthly_cap,self.settings.client_daily_paid_limit)
                if reservation:
                    cost=None;response['model_calls']=1
                    try:
                        candidates=[{'id':id,'title':self.k.cards[id]['title'],'description':self.k.cards[id]['summary'][:350]} for _,id in ranked if id not in {'live_required','conflict_ippu','conflict_uncertainty','conflict_transport_air','industry_mapping','source_chain'}]
                        if candidates:
                            ids,cost=await self.selector.select(req.question,candidates,{'sector':req.context.sector,'metric':req.context.metric,'last_topic':req.last_card_id if req.last_card_id in self.k.cards else None})
                            if any(id not in {c['id'] for c in candidates} for id in ids):ids=[]
                            if ids:response['mode']='model_routed_curated'
                        else:cost=0;response['model_calls']=0
                    except Exception:
                        # No raw prompt, API key or exception detail leaves the service.
                        response['notices'].append('Optional language matching is unavailable. Saved explanations still work.')
                    finally:self.state.settle(reservation,cost)
                else:response['notices'].append('The optional AI allowance is unavailable or exhausted. Saved explanations still work.')
            if not ids:
                response['mode']='suggestions'
                response['notices'].append('I do not have a sufficiently specific prepared answer. These are related explanations, not a claimed answer to your question.')
                response['suggestions']=[{'card_id':id,'title':self.k.cards[id]['title']} for _,id in ranked[:4]]
                return response
        rendered,hit=self._render_cards(ids,req)
        response.update(rendered);response['cache_hit']=hit
        if any(id.startswith('conflict_') for id in ids):response['mode']='documentation_conflict'
        if ids:
            response['last_card_id']=ids[-1]
            topics=set(t for id in ids for t in self.k.cards[id]['topics'])
            related=[id for id,c in self.k.cards.items() if id not in ids and topics & set(c['topics'])]
            response['suggestions']=[{'card_id':id,'title':self.k.cards[id]['title']} for id in (related or SUGGESTED)[:3] if id not in ids]
        return response
