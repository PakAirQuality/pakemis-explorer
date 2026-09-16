#!/usr/bin/env python3
"""Validate source hashes and print the content approval digest. Never enables paid use."""
from pathlib import Path
import argparse,json,sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from emissionflow.knowledge import Knowledge
from emissionflow.settings import Settings
from emissionflow.state import State

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--budget',action='store_true',help='Read the local admission ledger, not the external provider bill.')
    args=parser.parse_args();k=Knowledge(ROOT)
    result={'release_id':'1.0.0rc54','knowledge_digest':k.digest,'prepared_explanations':len(k.cards),
       'project_documents':sum(s['kind']=='project_document' for s in k.sources.values()),
       'pdf_pages':sum(s['pages'] for s in k.sources.values() if (s.get('file') or '').endswith('.pdf')),
       'index_units':len(k.pages),'conflict_records':len(k.conflicts),'source_hash_validation':'passed'}
    if args.budget:
        settings=Settings.from_env()
        if settings.state_path.exists():result['local_admission_ledger']=State(settings.state_path,settings.state_secret).summary()
        else:result['local_admission_ledger']='Not created. No local requests have been accounted here.'
    print(json.dumps(result,indent=2))
if __name__=='__main__':main()
