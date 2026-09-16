#!/usr/bin/env python3
"""Run a small educational demonstration without a provider or a live numerical adapter."""
from pathlib import Path
import argparse,asyncio,json,sys,tempfile
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from emissionflow.models import AskRequest,ViewContext
from emissionflow.service import AssistantService
from emissionflow.settings import Settings
QUESTIONS=[
 ('What are emsisions?',None,None),
 ('Why are they important?',None,'emissions'),
 ('What is this gas?',{'metric':'CH4'},None),
 ('What sources do you have for agriculture?',None,None),
 ('What are Monte Carlo estimates?',None,None),
 ('Why do this?',None,'mc'),
 ('Give a Monte Carlo example',None,None),
 ('What was the underlying data used to drive this?',None,None),
 ('What was the pattern?',{'view':'analyze'},None),
 ('What is the uncertainty on this map?',{'view':'map','geography_id':'LAHORE'},None),
 ('Is ammonia included?',None,None),
 ('Are road air pollutants exhaust only?',None,None),
 ('What are the total emissions here?',None,None),
 ('What does the archive say about reinjection at a particular field?',None,None)]
async def evaluate():
    with tempfile.TemporaryDirectory() as td:
        service=AssistantService(Settings(root=ROOT,state_path=Path(td)/'state.db'))
        rows=[]
        for q,c,last in QUESTIONS:
            response=await service.ask(AskRequest(question=q,context=ViewContext(**(c or {})),last_card_id=last),'evaluation')
            assert response['model_calls']==0 and not response['live_result']
            rows.append({'question':q,'response':response})
        assert service.state.summary()['admitted_calls']==0
        return {'scope':'Local demonstration, not live-model or inventory validation','knowledge_digest':service.k.digest,'questions':len(rows),'model_calls':0,'answers':rows}
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path)
    args=parser.parse_args();result=asyncio.run(evaluate());text=json.dumps(result,ensure_ascii=False,indent=2)
    if args.output:args.output.write_text(text+'\n')
    else:print(text)
if __name__=='__main__':main()
