from __future__ import annotations
from collections import Counter
import difflib, hashlib, json, math, re, unicodedata
from pathlib import Path

CORRECTIONS={'emsisions':'emissions','emmisions':'emissions','emmissions':'emissions','emssions':'emissions','emisions':'emissions','uncertainity':'uncertainty','uncertanity':'uncertainty','uncertainy':'uncertainty','montecarlo':'monte carlo','methan':'methane','fertilizer':'fertiliser','sulphur':'sulfur','pm25':'pm2.5'}
STOP=set('a an and are as at be been by can do does for from how i in is it its me my of on or our that the their these they this those to was we were what when where which who why with you your please tell explain would should much have has about used use'.split())
def normalise(text: str) -> str:
    s=unicodedata.normalize('NFKC',text).casefold().replace('–','-').replace('—','-').replace('monte-carlo','monte carlo')
    for a,b in CORRECTIONS.items():s=re.sub(r'\b'+re.escape(a)+r'\b',b,s)
    return re.sub(r'\s+',' ',s).strip()
def tokens(text: str) -> list[str]:
    return [x for x in re.findall(r'[a-z0-9]+(?:\.[0-9]+)?', normalise(text)) if x not in STOP]
def canonical(data) -> str:
    return json.dumps(data,sort_keys=True,separators=(',',':'),ensure_ascii=False)

class Knowledge:
    def __init__(self,root:Path):
        self.root=root
        self.cards={x['id']:x for x in json.loads((root/'cards.json').read_text())}
        self.sources={x['id']:x for x in json.loads((root/'sources.json').read_text())}
        self.conflicts=json.loads((root/'conflicts.json').read_text())
        h=hashlib.sha256()
        # citation_map.json joins the list: it decides what every card cites, so a change to it
        # is a change to the library's evidence and must move the review digest
        for f in ['cards.json','sources.json','conflicts.json','citation_map.json']:
            h.update(f.encode());h.update((root/f).read_bytes())
        self.digest=h.hexdigest()
        self.aliases={normalise(q).strip('?.!'):id for id,c in self.cards.items() for q in c['questions']}
        self.card_terms={id:Counter(tokens(' '.join([c['title'],*c['questions'],*c['topics'],c['summary']]))) for id,c in self.cards.items()}
        self.validate()

    def validate(self):
        for id,c in self.cards.items():
            for ref in c['citations']:self.validate_ref(ref)
            if not c['summary']:raise ValueError(f'Empty card: {id}')
        for s in self.sources.values():
            if s.get('file'):
                path=(self.root/s['file']).resolve()
                if not path.is_relative_to(self.root.resolve()):raise ValueError('Unsafe source path')
                if hashlib.sha256(path.read_bytes()).hexdigest()!=s['sha256']:raise ValueError(f'Source hash mismatch: {s["id"]}')
            if s['kind']=='general_science' and not s.get('url'):
                raise ValueError(f'A science source must be reachable: {s["id"]}')

    def validate_ref(self,ref):
        s=self.sources.get(ref['source_id'])
        if not s:raise ValueError('Unknown citation')
        # A page number is only meaningful on a paginated document. The input documents in the
        # release's source register and the release's own tables are not paginated, and a page
        # on one of them is REFUSED rather than ignored - silently dropping it is how a citation
        # starts looking more precise than it is.
        if ref.get('pages') and s.get('pages') is None:
            raise ValueError(f'Citation page on a source that has no pages: {s["id"]}')
        if any(p<1 or p>s['pages'] for p in ref.get('pages',[]) if s.get('pages')):
            raise ValueError('Citation page outside source')

    def cite(self,ref):
        self.validate_ref(ref);s=self.sources[ref['source_id']]
        if s['kind']=='release_vocabulary':
            # the table itself, from the release the Explorer already serves and verifies
            base=f'/api/v1/emissions/products/{s["table"]}' if s.get('table','').endswith('.csv') else \
                 f'/api/v1/emissions/products/semantic/{s["table"]}.csv'
        elif s.get('file'):
            base=f'/api/source/{s["id"]}/file'
            if ref.get('pages') and s['file'].endswith('.pdf'):base+=f'#page={ref["pages"][0]}'
        else:
            base=s.get('url')            # an input document may be obtainable only from its publisher
        out=dict(source_id=s['id'],title=s['title'],pages=ref.get('pages',[]),url=base,kind=s['kind'],
                 release_id=s.get('release_id'),sha256=s.get('sha256'))
        if s['kind']=='inventory_source':
            out.update(how_to_obtain=s.get('how_to_obtain') or '',archival_state=s.get('archival_state') or '',
                       licence_status=s.get('licence_status') or '')
        return out

    def rank_cards(self,query:str,limit:int=6):
        q=set(tokens(query));results=[]
        for id,terms in self.card_terms.items():
            overlap=q & set(terms)
            if not overlap:continue
            score=sum(1+math.log(1+terms[t]) for t in overlap)/max(1,len(q))
            # Aliases give a useful ordering; score is not epistemic confidence.
            score+=max((difflib.SequenceMatcher(None,normalise(query),normalise(a)).ratio() for a in self.cards[id]['questions']),default=0)
            results.append((score,id))
        return sorted(results,reverse=True)[:limit]

    # search_pages is GONE (2026-09-14). It ranked pages of the project's own PDFs with BM25 and
    # returned excerpts. The PDFs are gone - they were 9.7 MB of copies that went stale at every
    # release fixpoint - and with them the page index. A card miss now offers related EXPLANATIONS
    # and nothing else, which is the honest fallback: an excerpt of our own methods note was never
    # evidence for a question the library could not answer.
