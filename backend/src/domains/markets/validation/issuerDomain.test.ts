import type {
  FinancialMarketInstrumentDefinition,
  FinancialMarketIssuerDefinition,
} from "../contracts/financialMarketContracts.ts";
import {
  validateFinancialMarketIssuerDomain,
} from "./issuerDomain.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("issuer domain accepts all administrator and issuer categories", () => {
  const issuers = [
    issuer("issuer.northreach.corporation.1.v1", "corporation"),
    issuer("issuer.northreach.government.1.v1", "government"),
    issuer("issuer.northreach.agency.1.v1", "agency"),
    issuer("issuer.northreach.fund.1.v1", "fund_administrator"),
    issuer("issuer.northreach.trust.1.v1", "trust_administrator"),
    issuer("issuer.northreach.index.1.v1", "index_administrator"),
    issuer("issuer.northreach.exchange.1.v1", "exchange_operator"),
    issuer(
      "issuer.northreach.commodity.1.v1",
      "commodity_benchmark_administrator",
    ),
  ];
  const instruments = [
    instrument(
      "instrument.northreach.equity.1.v1",
      issuers[0].issuerPublicId,
      "common_equity",
    ),
    instrument(
      "instrument.northreach.sovereign.1.v1",
      issuers[1].issuerPublicId,
      "sovereign_bond",
    ),
    instrument(
      "instrument.northreach.agency.1.v1",
      issuers[2].issuerPublicId,
      "agency_bond",
    ),
    instrument(
      "instrument.northreach.fund.1.v1",
      issuers[3].issuerPublicId,
      "etf",
    ),
    instrument(
      "instrument.northreach.trust.1.v1",
      issuers[4].issuerPublicId,
      "listed_trust",
    ),
    instrument(
      "instrument.northreach.index.1.v1",
      issuers[5].issuerPublicId,
      "country_index",
    ),
    instrument(
      "instrument.northreach.commodity.1.v1",
      issuers[7].issuerPublicId,
      "commodity_benchmark",
    ),
  ];
  const report = validateFinancialMarketIssuerDomain({
    issuers,
    instruments,
    administratorAssignments: [
      assignment(
        "assignment.northreach.fund.1.v1",
        issuers[3].issuerPublicId,
        "fund.northreach.1.v1",
        "fund",
      ),
      assignment(
        "assignment.northreach.trust.1.v1",
        issuers[4].issuerPublicId,
        "trust.northreach.1.v1",
        "trust",
      ),
      assignment(
        "assignment.northreach.index.1.v1",
        issuers[5].issuerPublicId,
        "index.northreach.1.v1",
        "index",
      ),
      assignment(
        "assignment.northreach.exchange.1.v1",
        issuers[6].issuerPublicId,
        "exchange.northreach.1.v1",
        "exchange",
      ),
      assignment(
        "assignment.northreach.commodity.1.v1",
        issuers[7].issuerPublicId,
        "benchmark.northreach.1.v1",
        "commodity_benchmark",
      ),
    ],
  });

  assertEquals(report.valid, true);
  assertEquals(report.errors.length, 0);
  assertEquals(report.activationAuthorized, false);
  assertEquals(report.activationBlockedInstrumentPublicIds.length, 0);
  assertEquals(report.counts.issuersByType.corporation, 1);
  assertEquals(report.counts.issuersByType.exchange_operator, 1);
});

Deno.test("issuer domain rejects orphaning, invalid types, cycles, and duplicate administrators", () => {
  const corporation = issuer(
    "issuer.northreach.corporation.1.v1",
    "corporation",
  );
  const government = issuer(
    "issuer.northreach.government.1.v1",
    "government",
  );
  const report = validateFinancialMarketIssuerDomain({
    issuers: [corporation, government],
    instruments: [
      instrument(
        "instrument.northreach.bad.1.v1",
        corporation.issuerPublicId,
        "sovereign_bond",
      ),
      instrument(
        "instrument.northreach.orphan.1.v1",
        "issuer.northreach.missing.1.v1",
        "common_equity",
      ),
    ],
    relationships: [
      {
        relationshipPublicId: "relationship.northreach.1.v1",
        parentIssuerPublicId: corporation.issuerPublicId,
        childIssuerPublicId: government.issuerPublicId,
        kind: "controls",
        sourceVersion: "issuer.v1",
      },
      {
        relationshipPublicId: "relationship.northreach.2.v1",
        parentIssuerPublicId: government.issuerPublicId,
        childIssuerPublicId: corporation.issuerPublicId,
        kind: "controls",
        sourceVersion: "issuer.v1",
      },
    ],
    administratorAssignments: [
      assignment(
        "assignment.northreach.1.v1",
        corporation.issuerPublicId,
        "fund.northreach.1.v1",
        "fund",
      ),
      assignment(
        "assignment.northreach.2.v1",
        corporation.issuerPublicId,
        "fund.northreach.1.v1",
        "fund",
      ),
    ],
  });

  assertEquals(report.valid, false);
  assert(report.errors.some((entry) =>
    entry.code === "invalid_instrument_issuer_type"
  ));
  assert(report.errors.some((entry) => entry.code === "orphaned_instrument"));
  assert(report.errors.some((entry) =>
    entry.code === "circular_issuer_relationship"
  ));
  assert(report.errors.some((entry) =>
    entry.code === "invalid_administrator_type"
  ));
  assert(report.errors.some((entry) =>
    entry.code === "duplicate_administrator_assignment"
  ));
});

Deno.test("inactive issuers block activation without exposing internal identifiers", () => {
  const inactive = {
    ...issuer("issuer.northreach.corporation.1.v1", "corporation"),
    status: "draft" as const,
  };
  const owned = instrument(
    "instrument.northreach.equity.1.v1",
    inactive.issuerPublicId,
    "common_equity",
  );
  const report = validateFinancialMarketIssuerDomain({
    issuers: [inactive],
    instruments: [owned],
  });

  assertEquals(report.valid, true);
  assertEquals(report.inactiveIssuerPublicIds, [inactive.issuerPublicId]);
  assertEquals(report.activationBlockedInstrumentPublicIds, [
    owned.instrumentPublicId,
  ]);
  assertEquals(JSON.stringify(report).includes("00000000-0000"), false);
});

function issuer(
  issuerPublicId: string,
  issuerType: FinancialMarketIssuerDefinition["issuerType"],
): FinancialMarketIssuerDefinition {
  const label = issuerPublicId.split(".").slice(-3, -2)[0];
  return {
    issuerPublicId,
    legalName: `${label} Legal Entity`,
    displayName: `${label} Entity`,
    issuerType,
    homeCountryCode: "NORTHREACH",
    reportingCurrencyCode: "NRC",
    sectorPublicId: issuerType === "corporation"
      ? "sector.industrial.v1"
      : null,
    industryPublicId: issuerType === "corporation"
      ? "industry.industrial.general.v1"
      : null,
    riskProfilePublicId: "risk.northreach.standard.v1",
    eventExposureProfilePublicId: "event-exposure.northreach.standard.v1",
    status: "approved_inactive",
    sourceVersion: "issuer.v1",
    sourceChecksumSha256: "a".repeat(64),
    audit: {
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "test-suite",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedBy: "test-suite",
    },
  };
}

function instrument(
  instrumentPublicId: string,
  issuerPublicId: string,
  instrumentType: FinancialMarketInstrumentDefinition["instrumentType"],
): FinancialMarketInstrumentDefinition {
  const assetClass = instrumentType.includes("bond")
    ? "fixed_income"
    : instrumentType === "etf"
    ? "fund"
    : instrumentType === "listed_trust"
    ? "trust"
    : instrumentType.includes("index")
    ? "index"
    : instrumentType === "commodity_benchmark"
    ? "commodity_reference"
    : "equity";
  return {
    instrumentPublicId,
    issuerPublicId,
    name: instrumentPublicId,
    assetClass,
    instrumentType,
    countryCode: "NORTHREACH",
    denominationCurrencyCode: "NRC",
    sectorPublicId: null,
    industryPublicId: null,
    riskClass: "moderate",
    typeContractPublicId: "contract.instrument.standard.v1",
    status: "approved_inactive",
    activationAuthorized: false,
    effectiveAt: null,
    retiredAt: null,
    sourceVersion: "instrument.v1",
    sourceChecksumSha256: "b".repeat(64),
  };
}

function assignment(
  assignmentPublicId: string,
  administratorIssuerPublicId: string,
  administeredPublicId: string,
  administeredKind:
    | "fund"
    | "trust"
    | "index"
    | "exchange"
    | "commodity_benchmark",
) {
  return {
    assignmentPublicId,
    administratorIssuerPublicId,
    administeredPublicId,
    administeredKind,
    sourceVersion: "assignment.v1",
  } as const;
}

function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Assertion failed");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}
