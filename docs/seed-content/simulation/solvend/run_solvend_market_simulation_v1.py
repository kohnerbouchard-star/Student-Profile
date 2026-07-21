#!/usr/bin/env python3
import json
import math
import random
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / "input-v1.json").read_text(encoding="utf-8"))

def load_instruments():
    records = []
    cyber_overrides = CONFIG.get("cyberExposureOverrides", {})
    for relative_path in CONFIG["instrumentSources"]:
        payload = json.loads((ROOT / relative_path).resolve().read_text(encoding="utf-8"))
        for record in payload["records"]:
            if record.get("tradable", True) is False:
                continue
            exposure = dict(record["eventExposure"])
            exposure["cyberDisruption"] = cyber_overrides.get(record["id"], exposure.get("cyberDisruption", 0))
            records.append({
                "id": record["id"],
                "symbol": record["symbol"],
                "type": record["instrumentType"],
                "volatility": record["annualizedVolatilityCandidate"],
                "liquidity": record["liquidityCoefficient"],
                "exposure": exposure,
            })
    return records

INSTRUMENTS = load_instruments()
INSTRUMENT_IDS = {instrument["id"] for instrument in INSTRUMENTS}

def validate_config():
    if CONFIG["seeds"] != 250 or CONFIG["cycles"] != 60:
        raise ValueError("Solvend v1 evidence requires exactly 250 seeds and 60 cycles.")
    if len(INSTRUMENTS) != 22:
        raise ValueError(f"Expected 22 tradable instruments; found {len(INSTRUMENTS)}.")
    for strategy_name, weights in CONFIG["strategies"].items():
        unknown = sorted(set(weights) - INSTRUMENT_IDS)
        if unknown:
            raise ValueError(f"{strategy_name} references unknown instruments: {unknown}")
        if not math.isclose(sum(weights.values()), 1.0, abs_tol=1e-12):
            raise ValueError(f"{strategy_name} weights do not sum to 1.")
    required_factors = set(CONFIG["factors"])
    for scenario_name, factors in CONFIG["scenarios"].items():
        if set(factors) != required_factors:
            raise ValueError(f"{scenario_name} does not define the complete factor set.")
    missing_cyber = sorted(INSTRUMENT_IDS - set(CONFIG.get("cyberExposureOverrides", {})))
    if missing_cyber:
        raise ValueError(f"Cyber calibration overrides are missing for: {missing_cyber}")

def simulated_return(instrument, scenario, rng):
    systematic = sum(instrument["exposure"].get(key, 0) * value for key, value in scenario.items()) / 90.0
    base = 0.008 if instrument["type"] in ("sovereign_public_bond", "corporate_bond") else 0.012
    if instrument["type"] == "preferred_convertible":
        base = 0.024
    if instrument["type"] == "listed_trust":
        base = 0.026
    liquidity_penalty = (1 - instrument["liquidity"]) * 0.015
    noise = rng.gauss(
        0,
        max(instrument["volatility"] * math.sqrt(CONFIG["cycles"] / 252), 0.035),
    )
    return max(-0.95, math.exp(base + systematic - liquidity_penalty + noise) - 1)

def percentile(sorted_values, fraction):
    return sorted_values[int(len(sorted_values) * fraction)]

validate_config()
instrument_rows = []
portfolio_rows = []

for scenario_name, scenario in CONFIG["scenarios"].items():
    for seed in range(CONFIG["seeds"]):
        rng = random.Random(seed * 1009 + sum(map(ord, scenario_name)))
        returns = {}
        for instrument in INSTRUMENTS:
            value = simulated_return(instrument, scenario, rng)
            returns[instrument["id"]] = value
            instrument_rows.append({
                "scenario": scenario_name,
                "seed": seed,
                "instrumentId": instrument["id"],
                "symbol": instrument["symbol"],
                "return": value,
            })
        for strategy_name, weights in CONFIG["strategies"].items():
            portfolio_rows.append({
                "scenario": scenario_name,
                "seed": seed,
                "strategy": strategy_name,
                "return": sum(weights[instrument_id] * returns[instrument_id] for instrument_id in weights),
            })

summary = {
    "simulationId": CONFIG["simulationId"],
    "seeds": CONFIG["seeds"],
    "cycles": CONFIG["cycles"],
    "instrumentCount": len(INSTRUMENTS),
    "scenarioCount": len(CONFIG["scenarios"]),
    "strategyCount": len(CONFIG["strategies"]),
    "scenarioStrategySummary": {},
    "integrity": {},
}

for scenario_name in CONFIG["scenarios"]:
    summary["scenarioStrategySummary"][scenario_name] = {}
    for strategy_name in CONFIG["strategies"]:
        values = [
            row["return"]
            for row in portfolio_rows
            if row["scenario"] == scenario_name and row["strategy"] == strategy_name
        ]
        ordered = sorted(values)
        summary["scenarioStrategySummary"][scenario_name][strategy_name] = {
            "median": statistics.median(values),
            "mean": statistics.fmean(values),
            "p05": percentile(ordered, 0.05),
            "p95": ordered[int(len(ordered) * 0.95) - 1],
            "lossProbability": sum(value < 0 for value in values) / len(values),
        }

all_values = [row["return"] for row in instrument_rows] + [row["return"] for row in portfolio_rows]
summary["integrity"] = {
    "nonFiniteCount": sum(not math.isfinite(value) for value in all_values),
    "guaranteedPositiveInstrumentCases": 0,
    "guaranteedPositivePortfolioCases": 0,
}

for scenario_name in CONFIG["scenarios"]:
    for instrument_id in INSTRUMENT_IDS:
        values = [
            row["return"]
            for row in instrument_rows
            if row["scenario"] == scenario_name and row["instrumentId"] == instrument_id
        ]
        if values and min(values) > 0:
            summary["integrity"]["guaranteedPositiveInstrumentCases"] += 1
    for strategy_name in CONFIG["strategies"]:
        values = [
            row["return"]
            for row in portfolio_rows
            if row["scenario"] == scenario_name and row["strategy"] == strategy_name
        ]
        if values and min(values) > 0:
            summary["integrity"]["guaranteedPositivePortfolioCases"] += 1

(ROOT / "summary-v1.json").write_text(
    json.dumps(summary, separators=(",", ":")) + "\n",
    encoding="utf-8",
)
print(json.dumps(summary, indent=2))
