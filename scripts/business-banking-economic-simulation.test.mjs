import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEconomicCreditScore,
  calculateLoanAffordability,
  detectCircularTransfer,
  projectBoundedSavingsInterest,
  projectLoanState,
  simulateBusinessCycle,
} from "../backend/src/domains/business-banking/domain/businessBankingEconomicSimulation.ts";

test("profitable business cycle responds deterministically to pricing and demand", () => {
  const baseline = simulateBusinessCycle({
    inventoryUnits: 100,
    baseDemandUnits: 40,
    unitPrice: 12,
    referencePrice: 12,
    unitCost: 4,
    wageExpense: 80,
    taxRate: 0.08,
    inflationRate: 0,
    exchangeRateIndex: 1,
    difficultyMultiplier: 1,
    businessConfidenceIndex: 100,
    supplyConstraintIndex: 1,
  });
  const expensive = simulateBusinessCycle({
    inventoryUnits: 100,
    baseDemandUnits: 40,
    unitPrice: 24,
    referencePrice: 12,
    unitCost: 4,
    wageExpense: 80,
    taxRate: 0.08,
    inflationRate: 0,
    exchangeRateIndex: 1,
    difficultyMultiplier: 1,
    businessConfidenceIndex: 100,
    supplyConstraintIndex: 1,
  });

  assert.equal(baseline.unitsSold, 40);
  assert.equal(baseline.grossRevenue, 480);
  assert.equal(baseline.netIncome, 201.6);
  assert.equal(baseline.profitable, true);
  assert.equal(baseline.wageAffordable, true);
  assert.equal(baseline.failureRisk, "low");
  assert.ok(expensive.demandUnits < baseline.demandUnits);
});

test("inflation, exchange, supply and difficulty change demand without randomness", () => {
  const constrained = simulateBusinessCycle({
    inventoryUnits: 500,
    baseDemandUnits: 100,
    unitPrice: 10,
    referencePrice: 10,
    unitCost: 7,
    wageExpense: 200,
    taxRate: 0.15,
    inflationRate: 0.2,
    exchangeRateIndex: 0.8,
    difficultyMultiplier: 1.5,
    businessConfidenceIndex: 70,
    supplyConstraintIndex: 1.8,
  });
  const repeated = simulateBusinessCycle({
    inventoryUnits: 500,
    baseDemandUnits: 100,
    unitPrice: 10,
    referencePrice: 10,
    unitCost: 7,
    wageExpense: 200,
    taxRate: 0.15,
    inflationRate: 0.2,
    exchangeRateIndex: 0.8,
    difficultyMultiplier: 1.5,
    businessConfidenceIndex: 70,
    supplyConstraintIndex: 1.8,
  });
  assert.deepEqual(repeated, constrained);
  assert.equal(constrained.wageAffordable, false);
  assert.equal(constrained.failureRisk, "high");
});

test("loan affordability includes rate, fee, inflation and existing debt", () => {
  const affordable = calculateLoanAffordability({
    amount: 1_200,
    annualRate: 0.12,
    originationFeeRate: 0.02,
    termCycles: 12,
    recurringIncomePerCycle: 600,
    existingDebtPaymentPerCycle: 20,
    maximumPaymentToIncome: 0.35,
    inflationRate: 0.03,
    interestDifficultyModifier: 1,
  });
  const unaffordable = calculateLoanAffordability({
    amount: 4_000,
    annualRate: 0.25,
    originationFeeRate: 0.05,
    termCycles: 6,
    recurringIncomePerCycle: 300,
    existingDebtPaymentPerCycle: 100,
    maximumPaymentToIncome: 0.35,
    inflationRate: 0.2,
    interestDifficultyModifier: 1.5,
  });
  assert.equal(affordable.affordable, true);
  assert.equal(unaffordable.affordable, false);
  assert.ok(unaffordable.paymentToIncome > affordable.paymentToIncome);
});

test("creditworthiness uses economic behavior only", () => {
  const strong = calculateEconomicCreditScore({
    onTimePaymentRate: 1,
    savingsRatio: 0.4,
    incomeStability: 0.9,
    transferAnomalyCount: 0,
    delinquencyCount: 0,
    defaultCount: 0,
  });
  const weak = calculateEconomicCreditScore({
    onTimePaymentRate: 0.5,
    savingsRatio: 0,
    incomeStability: 0.2,
    transferAnomalyCount: 3,
    delinquencyCount: 2,
    defaultCount: 1,
  });
  assert.equal(strong, 755);
  assert.equal(weak, 384);
  assert.ok(strong > weak);
});

test("savings interest is bounded and deterministic", () => {
  assert.equal(projectBoundedSavingsInterest({
    balance: 100_000,
    annualRate: 0.25,
    days: 365,
    maximumInterest: 1_000,
  }), 1_000);
  assert.equal(projectBoundedSavingsInterest({
    balance: 1_000,
    annualRate: 0.05,
    days: 30,
    maximumInterest: 1_000,
  }), 4.11);
});

test("exact rapid circular transfers are detected", () => {
  const now = Date.UTC(2026, 6, 21, 12, 0, 0);
  assert.equal(detectCircularTransfer({
    sender: "player-b",
    recipient: "player-a",
    amount: 100,
    occurredAtMs: now,
  }, [{
    sender: "player-a",
    recipient: "player-b",
    amount: 100,
    occurredAtMs: now - 60_000,
  }]), true);
  assert.equal(detectCircularTransfer({
    sender: "player-b",
    recipient: "player-a",
    amount: 101,
    occurredAtMs: now,
  }, [{
    sender: "player-a",
    recipient: "player-b",
    amount: 100,
    occurredAtMs: now - 60_000,
  }]), false);
});

test("loan servicing transitions through delinquency, default, and recovery", () => {
  const due = Date.UTC(2026, 6, 1);
  assert.equal(projectLoanState({
    status: "active",
    dueAtMs: due,
    asOfMs: due + 8 * 86_400_000,
    delinquencyGraceDays: 7,
    defaultAfterDays: 30,
  }), "delinquent");
  assert.equal(projectLoanState({
    status: "delinquent",
    dueAtMs: due,
    asOfMs: due + 31 * 86_400_000,
    delinquencyGraceDays: 7,
    defaultAfterDays: 30,
  }), "defaulted");
  assert.equal(projectLoanState({
    status: "restructured",
    dueAtMs: due + 40 * 86_400_000,
    asOfMs: due + 31 * 86_400_000,
    delinquencyGraceDays: 7,
    defaultAfterDays: 30,
  }), "restructured");
});
