#!/usr/bin/env python3
"""Rebuild local source search after an explicitly reviewed source update.
Does not write answer cards, decide conflicts, infer numbers, or approve a new release.
Requires PyMuPDF separately; runtime inference never needs it.
"""
from pathlib import Path
import argparse,hashlib,json,re,sys
ROOT=Path(__file__).resolve().parents[1]
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--accept-source-update',action='store_true',help='Acknowledge that source bytes/page indices may change and all citations require re-review.')
    args=p.parse_args()
    if not args.accept_source_update:p.error('Review the source update first, then pass --accept-source-update')
    try:import fitz
    except ImportError:raise SystemExit('Install PyMuPDF in the build environment: python -m pip install pymupdf')
    sources=json.loads((ROOT/'knowledge/sources.json').read_text());pages=[]
    for s in sources:
        if not s.get('file'):continue
        path=(ROOT/s['file']).resolve()
        if not path.is_relative_to(ROOT.resolve()):raise SystemExit('Unsafe source path')
        b=path.read_bytes();s['sha256']=hashlib.sha256(b).hexdigest()
        if path.suffix=='.pdf':
            with fitz.open(path) as doc:
                s['pages']=len(doc)
                for n,page in enumerate(doc,1):
                    text=page.get_text().replace('\u00ad','').replace('\ufffe','')
                    text=re.sub(r'(\w)-\n(\w)',r'\1\2',text)
                    pages.append({'id':f'{s["id"]}:p{n}','source_id':s['id'],'page':n,'text':text})
        else:
            s['pages']=1;pages.append({'id':f'{s["id"]}:p1','source_id':s['id'],'page':1,'text':b.decode('utf-8')})
    (ROOT/'knowledge/pages.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in pages))
    (ROOT/'knowledge/sources.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n')
    print('Rebuilt the retrieval index. Re-check citations, conflicts, cards and tests; production approval must be renewed.')
if __name__=='__main__':main()
