#!/usr/bin/env python3
import csv, json, math, random, statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / "input-v1.json").read_text(encoding="utf-8"))
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)

def instrument_return(inst, scenario, rng, cycles):
    exposure = inst["exposure"]
    systematic = sum(exposure.get(k, 0) * v for k, v in scenario.items()) / 82.0
    base = 0.008 if inst["type"] in ("sovereign_public_bond", "corporate_bond") else 0.012
    if inst["type"] == "preferred_convertible":
        base = 0.024
    if inst["type"] == "listed_trust":
        base = 0.026
    vol = inst["volatility"]
    liquidity_penalty = (1.0 - inst["liquidity"]) * 0.015
    noise = rng.gauss(0.0, max(vol * math.sqrt(cycles / 252.0), 0.035))
    return max(-0.95, math.exp(base + systematic - liquidity_penalty + noise) - 1.0)

rows = []
portfolio_rows = []
for scenario_name, scenario in CONFIG["scenarios"].items():
    for seed in range(CONFIG["seeds"]):
        rng = random.Random(seed * 1009 + sum(ord(c) for c in scenario_name))
        returns = {}
        for inst in CONFIG["instruments"]:
            ret = instrument_return(inst, scenario, rng, CONFIG["cycles"])
            returns[inst["id"]] = ret
            rows.append({"scenario": scenario_name, "seed": seed, "instrumentId": inst["id"], "symbol": inst["symbol"], "return": ret})
        for strategy_name, weights in CONFIG["strategies"].items():
            value = sum(weights[i] * returns[i] for i in weights)
            portfolio_rows.append({"scenario": scenario_name, "seed": seed, "strategy": strategy_name, "return": value})

with (OUT / "instrument-results.csv").open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["scenario", "seed", "instrumentId", "symbol", "return"])
    writer.writeheader()
    writer.writerows(rows)

with (OUT / "portfolio-results.csv").open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["scenario", "seed", "strategy", "return"])
    writer.writeheader()
    writer.writerows(portfolio_rows)

summary = {"simulationId": CONFIG["simulationId"], "seeds": CONFIG["seeds"], "cycles": CONFIG["cycles"], "scenarioStrategySummary": {}, "integrity": {}}
for scenario in CONFIG["scenarios"]:
    summary["scenarioStrategySummary"][scenario] = {}
    for strategy in CONFIG["strategies"]:
        vals = [r["return"] for r in portfolio_rows if r["scenario"] == scenario and r["strategy"] == strategy]
        ordered = sorted(vals)
        summary["scenarioStrategySummary"][scenario][strategy] = {
            "median": statistics.median(vals),
            "mean": statistics.fmean(vals),
            "p05": ordered[int(len(vals) * 0.05)],
            "p95": ordered[int(len(vals) * 0.95) - 1],
            "lossProbability": sum(v < 0 for v in vals) / len(vals),
        }

all_vals = [r["return"] for r in rows] + [r["return"] for r in portfolio_rows]
summary["integrity"] = {
    "nonFiniteCount": sum(not math.isfinite(v) for v in all_vals),
    "guaranteedPositiveInstrumentCases": 0,
    "guaranteedPositivePortfolioCases": 0,
}
for scenario in CONFIG["scenarios"]:
    for instrument_id in {r["instrumentId"] for r in rows}:
        vals = [r["return"] for r in rows if r["scenario"] == scenario and r["instrumentId"] == instrument_id]
        if vals and min(vals) > 0:
            summary["integrity"]["guaranteedPositiveInstrumentCases"] += 1
    for strategy in CONFIG["strategies"]:
        vals = [r["return"] for r in portfolio_rows if r["scenario"] == scenario and r["strategy"] == strategy]
        if vals and min(vals) > 0:
            summary["integrity"]["guaranteedPositivePortfolioCases"] += 1

(OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(json.dumps(summary, indent=2))
