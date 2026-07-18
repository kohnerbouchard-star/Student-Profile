#!/usr/bin/env python3
import csv, json, math, random, statistics
from pathlib import Path
ROOT=Path(__file__).resolve().parent
C=json.loads((ROOT/'input-v1.json').read_text(encoding='utf-8'))
OUT=ROOT/'output'; OUT.mkdir(exist_ok=True)

def load_instruments():
    records=[]
    for rel in C['instrumentSources']:
        payload=json.loads((ROOT/rel).resolve().read_text(encoding='utf-8'))
        for rec in payload['records']:
            if rec.get('tradable', True) is False:
                continue
            instrument_type=rec['instrumentType']
            records.append({
                'id':rec['id'], 'symbol':rec['symbol'], 'type':instrument_type,
                'startingPrice':rec.get('startingPrice', rec.get('startingNav', 100.0)),
                'volatility':rec['annualizedVolatilityCandidate'],
                'liquidity':rec['liquidityCoefficient'],
                'exposure':rec['eventExposure'],
            })
    return records

INSTRUMENTS=load_instruments()

def ret(inst,sc,rng):
    systematic=sum(inst['exposure'].get(k,0)*v for k,v in sc.items())/82.0
    base=0.008 if inst['type'] in ('sovereign_public_bond','corporate_bond') else 0.012
    if inst['type']=='preferred_convertible': base=0.024
    if inst['type']=='listed_trust': base=0.026
    penalty=(1-inst['liquidity'])*0.015
    noise=rng.gauss(0,max(inst['volatility']*math.sqrt(C['cycles']/252),0.035))
    return max(-0.95,math.exp(base+systematic-penalty+noise)-1)

rows=[]; prows=[]
for sn,sc in C['scenarios'].items():
  for seed in range(C['seeds']):
    rng=random.Random(seed*1009+sum(map(ord,sn))); rs={}
    for inst in INSTRUMENTS:
      x=ret(inst,sc,rng); rs[inst['id']]=x
      rows.append({'scenario':sn,'seed':seed,'instrumentId':inst['id'],'symbol':inst['symbol'],'return':x})
    for st,w in C['strategies'].items():
      prows.append({'scenario':sn,'seed':seed,'strategy':st,'return':sum(w[i]*rs[i] for i in w)})
with (OUT/'instrument-results.csv').open('w',newline='',encoding='utf-8') as f:
  w=csv.DictWriter(f,fieldnames=['scenario','seed','instrumentId','symbol','return']); w.writeheader(); w.writerows(rows)
with (OUT/'portfolio-results.csv').open('w',newline='',encoding='utf-8') as f:
  w=csv.DictWriter(f,fieldnames=['scenario','seed','strategy','return']); w.writeheader(); w.writerows(prows)
s={'simulationId':C['simulationId'],'seeds':C['seeds'],'cycles':C['cycles'],'instrumentCount':len(INSTRUMENTS),'scenarioStrategySummary':{},'integrity':{}}
for sn in C['scenarios']:
  s['scenarioStrategySummary'][sn]={}
  for st in C['strategies']:
    vals=[r['return'] for r in prows if r['scenario']==sn and r['strategy']==st]; o=sorted(vals)
    s['scenarioStrategySummary'][sn][st]={'median':statistics.median(vals),'mean':statistics.fmean(vals),'p05':o[int(len(o)*.05)],'p95':o[int(len(o)*.95)-1],'lossProbability':sum(v<0 for v in vals)/len(vals)}
allv=[r['return'] for r in rows]+[r['return'] for r in prows]
s['integrity']={'nonFiniteCount':sum(not math.isfinite(v) for v in allv),'guaranteedPositiveInstrumentCases':0,'guaranteedPositivePortfolioCases':0}
for sn in C['scenarios']:
  for iid in {r['instrumentId'] for r in rows}:
    vals=[r['return'] for r in rows if r['scenario']==sn and r['instrumentId']==iid]
    if vals and min(vals)>0:s['integrity']['guaranteedPositiveInstrumentCases']+=1
  for st in C['strategies']:
    vals=[r['return'] for r in prows if r['scenario']==sn and r['strategy']==st]
    if vals and min(vals)>0:s['integrity']['guaranteedPositivePortfolioCases']+=1
(OUT/'summary.json').write_text(json.dumps(s,indent=2),encoding='utf-8')
print(json.dumps(s,indent=2))
