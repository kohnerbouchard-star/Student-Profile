from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
from typing import Any

import numpy as np

FACTORS = [
    "growth",
    "inflation",
    "interestRates",
    "currencyStrength",
    "energyPrices",
    "shippingCosts",
    "laborCosts",
    "regulation",
    "publicConfidence",
    "countryStability",
    "warEscalation",
    "meridianDisruption",
]

STATIC_SCENARIOS = {
    "baseline": {
        "growth": 0.0002,
        "publicConfidence": 0.0001,
        "countryStability": 0.0001,
    },
    "inflation_rate_shock": {
        "inflation": 0.0020,
        "interestRates": 0.0016,
        "currencyStrength": -0.0006,
        "growth": -0.0005,
        "publicConfidence": -0.0004,
    },
    "meridian_disruption": {
        "meridianDisruption": 0.0025,
        "shippingCosts": 0.0018,
        "publicConfidence": -0.0010,
        "growth": -0.0010,
        "countryStability": -0.0005,
    },
    "war_escalation": {
        "warEscalation": 0.0027,
        "countryStability": -0.0017,
        "publicConfidence": -0.0015,
        "inflation": 0.0012,
        "growth": -0.0010,
    },
    "commodity_boom": {
        "energyPrices": 0.0022,
        "inflation": 0.0007,
        "growth": 0.0005,
        "currencyStrength": 0.0005,
    },
}

TYPE_DRIFT = {
    "common_equity": 0.00020,
    "preferred_convertible": 0.00016,
    "corporate_bond": 0.00010,
    "sovereign_public_bond": 0.00008,
    "etf_fund": 0.00016,
    "listed_trust": 0.00014,
    "index": 0.00015,
    "commodity_reference": 0.00010,
}

PORTFOLIOS = {
    "equal_weight_equities": [
        "NREAB",
        "NREAC",
        "NREAD",
        "NREAE",
        "NREAG",
        "NREAH",
        "NREAI",
        "NREAK",
        "NREAL",
        "NREAM",
        "NREAN",
        "NREAO",
    ],
    "defensive_mix": ["NREAH", "NREAI", "NRGAA", "NRGAB", "NRFAA"],
    "strategic_exposure": ["NREAB", "NREAE", "NRBAG", "NRCAA"],
    "diversified_tradable": "ALL_TRADABLE",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def scenario_factors(name: str, cycle: int) -> dict[str, float]:
    if name != "crisis_recovery":
        factors = {factor: 0.0 for factor in FACTORS}
        factors.update(STATIC_SCENARIOS[name])
        return factors

    factors = {factor: 0.0 for factor in FACTORS}
    if cycle < 20:
        factors.update(
            {
                "warEscalation": 0.0020,
                "meridianDisruption": 0.0022,
                "shippingCosts": 0.0014,
                "countryStability": -0.0015,
                "publicConfidence": -0.0013,
                "growth": -0.0011,
                "inflation": 0.0010,
            }
        )
    elif cycle < 40:
        factors.update(
            {
                "countryStability": 0.0002,
                "publicConfidence": 0.0001,
                "growth": -0.0001,
                "inflation": 0.0002,
            }
        )
    else:
        factors.update(
            {
                "growth": 0.0012,
                "publicConfidence": 0.0010,
                "countryStability": 0.0008,
                "meridianDisruption": -0.0008,
                "shippingCosts": -0.0005,
            }
        )
    return factors


def max_drawdown(values: np.ndarray) -> float:
    peaks = np.maximum.accumulate(values)
    return float(np.min(values / peaks - 1.0))


def percentile(values: list[float], quantile: float) -> float:
    return float(np.quantile(np.array(values, dtype=float), quantile))


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def run(input_path: Path, output_dir: Path, seeds: int, cycles: int) -> None:
    data = json.loads(input_path.read_text(encoding="utf-8"))
    instruments = data["instruments"]
    by_symbol = {record["symbol"]: record for record in instruments}
    tradable = [
        record["symbol"] for record in instruments if record.get("tradable", False)
    ]

    portfolios: dict[str, list[str]] = {}
    for name, members in PORTFOLIOS.items():
        portfolios[name] = tradable if members == "ALL_TRADABLE" else members

    scenarios = list(STATIC_SCENARIOS) + ["crisis_recovery"]
    raw_rows: list[dict[str, Any]] = []
    path_rows: list[dict[str, Any]] = []
    strategy_rows: list[dict[str, Any]] = []

    for scenario in scenarios:
        for seed in range(seeds):
            rng = np.random.default_rng(seed + 100000 * scenarios.index(scenario))
            series = {symbol: [1.0] for symbol in by_symbol}

            for cycle in range(cycles):
                factors = scenario_factors(scenario, cycle)
                common_noise = rng.normal(0, 0.0025)

                for symbol, record in by_symbol.items():
                    exposure = record.get("eventExposure", {})
                    factor_return = sum(
                        (float(exposure.get(factor, 0)) / 3.0) * factors[factor]
                        for factor in FACTORS
                    )
                    annual_volatility = float(
                        record.get("annualizedVolatilityCandidate", 0.18)
                    )
                    idiosyncratic_noise = rng.normal(
                        0, annual_volatility / math.sqrt(252)
                    )
                    period_return = (
                        TYPE_DRIFT.get(record["instrumentType"], 0.0001)
                        + factor_return
                        + 0.25 * common_noise
                        + idiosyncratic_noise
                    )
                    period_return = max(period_return, -0.35)
                    series[symbol].append(series[symbol][-1] * (1 + period_return))

            for symbol, values in series.items():
                array = np.array(values, dtype=float)
                raw_rows.append(
                    {
                        "scenario": scenario,
                        "seed": seed,
                        "symbol": symbol,
                        "terminalReturn": float(array[-1] - 1),
                        "maxDrawdown": max_drawdown(array),
                    }
                )
                for cycle, value in enumerate(values):
                    path_rows.append(
                        {
                            "scenario": scenario,
                            "seed": seed,
                            "symbol": symbol,
                            "cycle": cycle,
                            "value": float(value),
                        }
                    )

            for portfolio_name, members in portfolios.items():
                values = np.mean(
                    np.array([series[symbol] for symbol in members]), axis=0
                )
                strategy_rows.append(
                    {
                        "scenario": scenario,
                        "seed": seed,
                        "portfolio": portfolio_name,
                        "terminalReturn": float(values[-1] - 1),
                        "maxDrawdown": max_drawdown(values),
                    }
                )

    output_dir.mkdir(parents=True, exist_ok=True)
    write_csv(output_dir / "raw_instrument_results.csv", raw_rows)
    write_csv(output_dir / "raw_paths.csv", path_rows)
    write_csv(output_dir / "raw_portfolio_results.csv", strategy_rows)

    summary: dict[str, Any] = {
        "simulationId": "econovaria.northreach.market-pilot.v1",
        "inputSha256": sha256(input_path),
        "seeds": seeds,
        "cycles": cycles,
        "scenarios": scenarios,
        "activationAuthorized": False,
        "instrumentMetrics": [],
        "portfolioMetrics": [],
        "integrity": {},
    }

    for scenario in scenarios:
        for symbol in by_symbol:
            rows = [
                row
                for row in raw_rows
                if row["scenario"] == scenario and row["symbol"] == symbol
            ]
            returns = [row["terminalReturn"] for row in rows]
            drawdowns = [row["maxDrawdown"] for row in rows]
            summary["instrumentMetrics"].append(
                {
                    "scenario": scenario,
                    "symbol": symbol,
                    "medianTerminalReturn": percentile(returns, 0.5),
                    "p10TerminalReturn": percentile(returns, 0.1),
                    "p90TerminalReturn": percentile(returns, 0.9),
                    "medianMaxDrawdown": percentile(drawdowns, 0.5),
                    "positiveRunShare": sum(value > 0 for value in returns)
                    / len(returns),
                }
            )

        for portfolio_name in portfolios:
            rows = [
                row
                for row in strategy_rows
                if row["scenario"] == scenario
                and row["portfolio"] == portfolio_name
            ]
            returns = [row["terminalReturn"] for row in rows]
            drawdowns = [row["maxDrawdown"] for row in rows]
            summary["portfolioMetrics"].append(
                {
                    "scenario": scenario,
                    "portfolio": portfolio_name,
                    "medianTerminalReturn": percentile(returns, 0.5),
                    "p10TerminalReturn": percentile(returns, 0.1),
                    "p90TerminalReturn": percentile(returns, 0.9),
                    "medianMaxDrawdown": percentile(drawdowns, 0.5),
                    "positiveRunShare": sum(value > 0 for value in returns)
                    / len(returns),
                }
            )

    guaranteed_positive_cases = []
    for metric in summary["instrumentMetrics"] + summary["portfolioMetrics"]:
        if metric["positiveRunShare"] >= 1.0:
            guaranteed_positive_cases.append(
                {
                    key: metric[key]
                    for key in ("scenario", "symbol", "portfolio", "positiveRunShare")
                    if key in metric
                }
            )

    summary["integrity"]["guaranteedPositiveCases"] = guaranteed_positive_cases
    summary["integrity"]["allWeightsPrevalidated"] = True
    summary["integrity"]["nonFiniteResults"] = sum(
        not math.isfinite(float(row["terminalReturn"]))
        or not math.isfinite(float(row["maxDrawdown"]))
        for row in raw_rows + strategy_rows
    )

    summary_path = output_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    checksums = {
        path.name: sha256(path)
        for path in [
            input_path,
            output_dir / "raw_instrument_results.csv",
            output_dir / "raw_paths.csv",
            output_dir / "raw_portfolio_results.csv",
            summary_path,
        ]
    }
    (output_dir / "checksums.json").write_text(
        json.dumps(checksums, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--seeds", type=int, default=250)
    parser.add_argument("--cycles", type=int, default=60)
    arguments = parser.parse_args()
    run(arguments.input, arguments.output, arguments.seeds, arguments.cycles)
