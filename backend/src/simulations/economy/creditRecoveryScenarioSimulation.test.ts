import {
  runCreditRecoveryScenario,
  type CreditRecoveryCountryProfile,
  type CreditRecoveryPlayerProfile,
  type CreditRecoveryScenarioConfig,
} from "./creditRecoveryScenarioSimulation.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("credit recovery simulation is deterministic and models late joining", () => {
  const first = runCreditRecoveryScenario(baseConfig());
  const second = runCreditRecoveryScenario(baseConfig());

  assertEquals(first, second);
  assertEquals(first.playerResults.length, 30);
  assertEquals(first.totalTicks, 24);
  assert(first.playerResults.some((player) => player.joinTick > 0));
  assert(first.playerResults.filter((player) => player.joinTick > 0).every((player) =>
    player.catchUpGrantReceivedMinor === 2_500
  ));
  assertEquals(first.seedCatalogsModified, false);
  assertEquals(first.activationAuthorized, false);
  assertEquals(first.deterministic, true);
  assertEquals(first.evidenceDigest.length, 8);
});

Deno.test("distressed borrowers become delinquent or default and can recover in reconstruction", () => {
  const report = runCreditRecoveryScenario(baseConfig());

  assert(report.defaultedPlayerCount > 0);
  assert(report.recoveredPlayerCount > 0);
  assert(report.defaultRecoveryRate > 0);
  assert(report.playerResults.some((player) =>
    player.defaultedEver && player.recoveredAfterDefault
  ));
});

Deno.test("catch-up policy narrows the late-join wealth gap", () => {
  const supported = runCreditRecoveryScenario(baseConfig());
  const unsupported = runCreditRecoveryScenario({
    ...baseConfig(),
    scenarioPublicId: "simulation.credit.no-catch-up.v1",
    lateJoinCatchUpGrantMinor: 0,
    lateJoinIncomeMultiplier: 1,
  });

  assert(supported.lateJoinWealthGapRatio <= unsupported.lateJoinWealthGapRatio);
});

Deno.test("credit guardrails report excessive defaults and weak recovery", () => {
  const report = runCreditRecoveryScenario({
    ...baseConfig(),
    maximumDefaultRate: 0.05,
    minimumDefaultRecoveryRate: 0.95,
    maximumLateJoinWealthGapRatio: 1.05,
  });
  const codes = new Set(report.findings.map((finding) => finding.code));

  assert(codes.has("credit_default_rate_exceeded"));
  assert(
    codes.has("default_recovery_rate_below_minimum") ||
      codes.has("late_join_wealth_gap_exceeded"),
  );
});

Deno.test("credit scenario rejects unknown countries and invalid default windows", () => {
  assertThrows(
    () =>
      runCreditRecoveryScenario({
        ...baseConfig(),
        players: players().map((player, index) =>
          index === 0 ? { ...player, countryCode: "UNKNOWN" } : player
        ),
      }),
    "credit_player_unknown_country",
  );
  assertThrows(
    () =>
      runCreditRecoveryScenario({
        ...baseConfig(),
        defaultAfterMissedPayments: 2,
        delinquencyAfterMissedPayments: 2,
      }),
    "credit_default_window_invalid",
  );
});

function baseConfig(): CreditRecoveryScenarioConfig {
  return {
    scenarioPublicId: "simulation.credit-recovery.reference.v1",
    countries: countries(),
    players: players(),
    phaseWindows: [
      {
        phase: "peace",
        ticks: 6,
        incomeModifier: 1,
        costModifier: 1,
        interestModifier: 1,
      },
      {
        phase: "shortage",
        ticks: 6,
        incomeModifier: 0.88,
        costModifier: 1.25,
        interestModifier: 1.2,
      },
      {
        phase: "war",
        ticks: 6,
        incomeModifier: 0.7,
        costModifier: 1.55,
        interestModifier: 1.55,
      },
      {
        phase: "reconstruction",
        ticks: 6,
        incomeModifier: 1.18,
        costModifier: 1.08,
        interestModifier: 0.75,
      },
    ],
    startingCashMinor: 1_200,
    baseIncomeMinor: 900,
    subsistenceCostMinor: 650,
    lateJoinCatchUpGrantMinor: 2_500,
    lateJoinIncomeMultiplier: 1.35,
    scheduledPaymentRate: 0.22,
    minimumScheduledPaymentMinor: 200,
    delinquencyAfterMissedPayments: 2,
    defaultAfterMissedPayments: 4,
    restructuringPrincipalReductionRate: 0.2,
    reconstructionRecoveryIncomeMinor: 4_000,
    maximumDefaultRate: 0.65,
    minimumDefaultRecoveryRate: 0.25,
    maximumLateJoinWealthGapRatio: 2.5,
  };
}

function countries(): CreditRecoveryCountryProfile[] {
  const countryCodes = [
    "NORTHREACH",
    "YRETHIA",
    "VELORIA",
    "KAIROTH",
    "SOLMERE",
    "DRAEVON",
    "AURELIS",
    "MIRENDA",
    "TALVORA",
    "ZENITHIA",
  ];
  return countryCodes.map((countryCode, index) => ({
    countryCode,
    incomeModifier: 0.9 + index * 0.02,
    costModifier: 1.08 - index * 0.012,
    creditModifier: 0.82 + (index % 5) * 0.06,
  }));
}

function players(): CreditRecoveryPlayerProfile[] {
  const countryCodes = countries().map((country) => country.countryCode);
  return Array.from({ length: 30 }, (_, index) => ({
    playerPublicId: `simulation.credit.player.${String(index + 1).padStart(3, "0")}`,
    countryCode: countryCodes[index % countryCodes.length],
    joinTick: index >= 20 ? 8 : 0,
    incomeCapacity: index % 5 === 0 ? 0.3 : 0.72 + (index % 4) * 0.07,
    savingsDiscipline: 0.35 + (index % 5) * 0.12,
    initialDebtMinor: index % 5 === 0 ? 4_500 : 1_500 + (index % 3) * 500,
  }));
}

function assert(condition: boolean): void {
  if (!condition) throw new Error("Assertion failed.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

function assertThrows(run: () => unknown, expectedMessage: string): void {
  try {
    run();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) return;
    throw error;
  }
  throw new Error(`Expected error containing ${expectedMessage}.`);
}
