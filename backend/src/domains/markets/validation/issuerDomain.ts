import type {
  FinancialMarketCountryCode,
  FinancialMarketInstrumentDefinition,
  FinancialMarketIssuerDefinition,
  FinancialMarketIssuerType,
  FinancialMarketPublicId,
} from "../contracts/financialMarketContracts.ts";
import {
  assertFinancialMarketPublicId,
  isFinancialMarketPublicId,
} from "../contracts/financialMarketContracts.ts";

export interface FinancialMarketIssuerRelationship {
  readonly relationshipPublicId: FinancialMarketPublicId;
  readonly parentIssuerPublicId: FinancialMarketPublicId;
  readonly childIssuerPublicId: FinancialMarketPublicId;
  readonly kind: "controls" | "sponsors" | "administers";
  readonly sourceVersion: string;
}

export interface FinancialMarketAdministratorAssignment {
  readonly assignmentPublicId: FinancialMarketPublicId;
  readonly administratorIssuerPublicId: FinancialMarketPublicId;
  readonly administeredPublicId: FinancialMarketPublicId;
  readonly administeredKind:
    | "fund"
    | "trust"
    | "index"
    | "exchange"
    | "commodity_benchmark";
  readonly sourceVersion: string;
}

export interface FinancialMarketIssuerValidationInput {
  readonly issuers: readonly FinancialMarketIssuerDefinition[];
  readonly instruments: readonly FinancialMarketInstrumentDefinition[];
  readonly relationships?: readonly FinancialMarketIssuerRelationship[];
  readonly administratorAssignments?: readonly FinancialMarketAdministratorAssignment[];
}

export interface FinancialMarketIssuerValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly issuerPublicId?: string;
  readonly instrumentPublicId?: string;
  readonly relationshipPublicId?: string;
  readonly assignmentPublicId?: string;
}

export interface FinancialMarketIssuerValidationReport {
  readonly schemaVersion: "financial-market-issuer-validation.v1";
  readonly valid: boolean;
  readonly activationAuthorized: false;
  readonly errors: readonly FinancialMarketIssuerValidationIssue[];
  readonly warnings: readonly FinancialMarketIssuerValidationIssue[];
  readonly inactiveIssuerPublicIds: readonly string[];
  readonly activationBlockedInstrumentPublicIds: readonly string[];
  readonly counts: {
    readonly issuers: number;
    readonly instruments: number;
    readonly relationships: number;
    readonly administratorAssignments: number;
    readonly issuersByType: Readonly<Record<string, number>>;
  };
}

const COUNTRY_CURRENCY: Readonly<Record<FinancialMarketCountryCode, string>> = {
  NORTHREACH: "NRC",
  YRETHIA: "YRC",
  THALORIS: "THD",
  SOLVEND: "SLV",
  ELDORAN: "ELD",
  VALERION: "VAL",
  LUMENOR: "LUM",
  XALVORIA: "XAL",
  DRAVENLOK: "DRV",
  SYNDALIS: "SYN",
};

const ADMINISTRATOR_TYPES: Readonly<
  Record<FinancialMarketAdministratorAssignment["administeredKind"], readonly FinancialMarketIssuerType[]>
> = {
  fund: ["fund_administrator"],
  trust: ["trust_administrator"],
  index: ["index_administrator"],
  exchange: ["exchange_operator"],
  commodity_benchmark: ["commodity_benchmark_administrator"],
};

const INSTRUMENT_ISSUER_TYPES: Readonly<
  Record<FinancialMarketInstrumentDefinition["instrumentType"], readonly FinancialMarketIssuerType[]>
> = {
  common_equity: ["corporation", "government", "agency"],
  preferred_equity: ["corporation", "agency"],
  convertible_preferred: ["corporation", "agency"],
  corporate_bond: ["corporation"],
  sovereign_bond: ["government"],
  agency_bond: ["agency"],
  etf: ["fund_administrator"],
  listed_fund: ["fund_administrator"],
  listed_trust: ["trust_administrator"],
  broad_market_index: ["index_administrator"],
  country_index: ["index_administrator"],
  sector_index: ["index_administrator"],
  industry_index: ["index_administrator"],
  commodity_benchmark: ["commodity_benchmark_administrator"],
  economic_reference_benchmark: ["index_administrator", "government", "agency"],
};

export function validateFinancialMarketIssuerDomain(
  input: FinancialMarketIssuerValidationInput,
): FinancialMarketIssuerValidationReport {
  const errors: FinancialMarketIssuerValidationIssue[] = [];
  const warnings: FinancialMarketIssuerValidationIssue[] = [];
  const relationships = input.relationships ?? [];
  const assignments = input.administratorAssignments ?? [];
  const issuerById = new Map<string, FinancialMarketIssuerDefinition>();
  const normalizedLegalNames = new Map<string, string>();
  const normalizedDisplayNames = new Map<string, string>();
  const inactiveIssuerPublicIds = new Set<string>();
  const activationBlockedInstrumentPublicIds = new Set<string>();

  for (const issuer of [...input.issuers].sort((a, b) =>
    a.issuerPublicId.localeCompare(b.issuerPublicId)
  )) {
    validateIssuerShape(issuer, errors);
    if (issuerById.has(issuer.issuerPublicId)) {
      errors.push(issue("duplicate_issuer_public_id", "Issuer public ID is duplicated.", {
        issuerPublicId: issuer.issuerPublicId,
      }));
      continue;
    }
    issuerById.set(issuer.issuerPublicId, issuer);
    reportDuplicateName(
      normalizedLegalNames,
      normalizeName(issuer.legalName),
      issuer.issuerPublicId,
      "duplicate_issuer_legal_name",
      errors,
    );
    reportDuplicateName(
      normalizedDisplayNames,
      normalizeName(issuer.displayName),
      issuer.issuerPublicId,
      "duplicate_issuer_display_name",
      warnings,
    );
    if (issuer.status !== "approved_inactive") {
      inactiveIssuerPublicIds.add(issuer.issuerPublicId);
    }
  }

  for (const instrument of [...input.instruments].sort((a, b) =>
    a.instrumentPublicId.localeCompare(b.instrumentPublicId)
  )) {
    const issuer = issuerById.get(instrument.issuerPublicId);
    if (!issuer) {
      errors.push(issue("orphaned_instrument", "Instrument issuer does not exist.", {
        instrumentPublicId: instrument.instrumentPublicId,
        issuerPublicId: instrument.issuerPublicId,
      }));
      activationBlockedInstrumentPublicIds.add(instrument.instrumentPublicId);
      continue;
    }
    const allowedTypes = INSTRUMENT_ISSUER_TYPES[instrument.instrumentType] ?? [];
    if (!allowedTypes.includes(issuer.issuerType)) {
      errors.push(issue(
        "invalid_instrument_issuer_type",
        `Instrument type ${instrument.instrumentType} cannot be issued by ${issuer.issuerType}.`,
        {
          instrumentPublicId: instrument.instrumentPublicId,
          issuerPublicId: issuer.issuerPublicId,
        },
      ));
      activationBlockedInstrumentPublicIds.add(instrument.instrumentPublicId);
    }
    if (issuer.homeCountryCode !== instrument.countryCode) {
      warnings.push(issue(
        "cross_country_issuer_listing_requires_review",
        "Instrument country differs from issuer home country.",
        {
          instrumentPublicId: instrument.instrumentPublicId,
          issuerPublicId: issuer.issuerPublicId,
        },
      ));
    }
    if (issuer.status !== "approved_inactive" || instrument.status !== "approved_inactive") {
      activationBlockedInstrumentPublicIds.add(instrument.instrumentPublicId);
    }
    if (instrument.activationAuthorized !== false) {
      errors.push(issue(
        "instrument_activation_not_disabled",
        "Instrument activation must remain disabled in the controller-hold tranche.",
        {
          instrumentPublicId: instrument.instrumentPublicId,
          issuerPublicId: issuer.issuerPublicId,
        },
      ));
      activationBlockedInstrumentPublicIds.add(instrument.instrumentPublicId);
    }
  }

  validateRelationships(relationships, issuerById, errors);
  validateRelationshipCycles(relationships, errors);
  validateAdministratorAssignments(assignments, issuerById, errors);

  return {
    schemaVersion: "financial-market-issuer-validation.v1",
    valid: errors.length === 0,
    activationAuthorized: false,
    errors: sortIssues(errors),
    warnings: sortIssues(warnings),
    inactiveIssuerPublicIds: [...inactiveIssuerPublicIds].sort(),
    activationBlockedInstrumentPublicIds: [...activationBlockedInstrumentPublicIds].sort(),
    counts: {
      issuers: input.issuers.length,
      instruments: input.instruments.length,
      relationships: relationships.length,
      administratorAssignments: assignments.length,
      issuersByType: countIssuerTypes(input.issuers),
    },
  };
}

function validateIssuerShape(
  issuer: FinancialMarketIssuerDefinition,
  errors: FinancialMarketIssuerValidationIssue[],
): void {
  try {
    assertFinancialMarketPublicId(issuer.issuerPublicId, "issuerPublicId");
    assertFinancialMarketPublicId(issuer.riskProfilePublicId, "riskProfilePublicId");
    assertFinancialMarketPublicId(
      issuer.eventExposureProfilePublicId,
      "eventExposureProfilePublicId",
    );
  } catch (error) {
    errors.push(issue("invalid_issuer_public_id", String(error), {
      issuerPublicId: issuer.issuerPublicId,
    }));
  }
  if (!issuer.legalName.trim() || issuer.legalName.length > 180) {
    errors.push(issue("invalid_issuer_legal_name", "Issuer legal name is invalid.", {
      issuerPublicId: issuer.issuerPublicId,
    }));
  }
  if (!issuer.displayName.trim() || issuer.displayName.length > 160) {
    errors.push(issue("invalid_issuer_display_name", "Issuer display name is invalid.", {
      issuerPublicId: issuer.issuerPublicId,
    }));
  }
  const expectedCurrency = COUNTRY_CURRENCY[issuer.homeCountryCode];
  if (!/^[A-Z]{3,16}$/.test(issuer.reportingCurrencyCode)) {
    errors.push(issue("missing_or_invalid_reporting_currency", "Reporting currency is invalid.", {
      issuerPublicId: issuer.issuerPublicId,
    }));
  } else if (issuer.reportingCurrencyCode !== expectedCurrency) {
    errors.push(issue(
      "invalid_country_currency_combination",
      `Issuer ${issuer.homeCountryCode} must report in ${expectedCurrency}.`,
      { issuerPublicId: issuer.issuerPublicId },
    ));
  }
  if (issuer.sectorPublicId !== null && !isFinancialMarketPublicId(issuer.sectorPublicId)) {
    errors.push(issue("invalid_issuer_sector", "Issuer sector public ID is invalid.", {
      issuerPublicId: issuer.issuerPublicId,
    }));
  }
  if (issuer.industryPublicId !== null && !isFinancialMarketPublicId(issuer.industryPublicId)) {
    errors.push(issue("invalid_issuer_industry", "Issuer industry public ID is invalid.", {
      issuerPublicId: issuer.issuerPublicId,
    }));
  }
  if (!issuer.sourceVersion.trim() || !/^[0-9a-f]{64}$/.test(issuer.sourceChecksumSha256)) {
    errors.push(issue("invalid_issuer_source_identity", "Issuer source identity is invalid.", {
      issuerPublicId: issuer.issuerPublicId,
    }));
  }
  for (const field of ["createdAt", "updatedAt"] as const) {
    if (!isIsoDateTime(issuer.audit[field])) {
      errors.push(issue("invalid_issuer_audit_timestamp", `Issuer ${field} is invalid.`, {
        issuerPublicId: issuer.issuerPublicId,
      }));
    }
  }
  if (!issuer.audit.createdBy.trim() || !issuer.audit.updatedBy.trim()) {
    errors.push(issue("invalid_issuer_audit_actor", "Issuer audit actor is missing.", {
      issuerPublicId: issuer.issuerPublicId,
    }));
  }
}

function validateRelationships(
  relationships: readonly FinancialMarketIssuerRelationship[],
  issuerById: ReadonlyMap<string, FinancialMarketIssuerDefinition>,
  errors: FinancialMarketIssuerValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const relationship of [...relationships].sort((a, b) =>
    a.relationshipPublicId.localeCompare(b.relationshipPublicId)
  )) {
    if (!isFinancialMarketPublicId(relationship.relationshipPublicId)) {
      errors.push(issue("invalid_issuer_relationship_id", "Relationship public ID is invalid.", {
        relationshipPublicId: relationship.relationshipPublicId,
      }));
    }
    if (seen.has(relationship.relationshipPublicId)) {
      errors.push(issue("duplicate_issuer_relationship", "Relationship public ID is duplicated.", {
        relationshipPublicId: relationship.relationshipPublicId,
      }));
    }
    seen.add(relationship.relationshipPublicId);
    if (!issuerById.has(relationship.parentIssuerPublicId) ||
      !issuerById.has(relationship.childIssuerPublicId)) {
      errors.push(issue("orphaned_issuer_relationship", "Relationship references a missing issuer.", {
        relationshipPublicId: relationship.relationshipPublicId,
      }));
    }
    if (relationship.parentIssuerPublicId === relationship.childIssuerPublicId) {
      errors.push(issue("self_referential_issuer_relationship", "Issuer cannot relate to itself.", {
        relationshipPublicId: relationship.relationshipPublicId,
        issuerPublicId: relationship.parentIssuerPublicId,
      }));
    }
  }
}

function validateRelationshipCycles(
  relationships: readonly FinancialMarketIssuerRelationship[],
  errors: FinancialMarketIssuerValidationIssue[],
): void {
  const graph = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    const edges = graph.get(relationship.parentIssuerPublicId) ?? new Set<string>();
    edges.add(relationship.childIssuerPublicId);
    graph.set(relationship.parentIssuerPublicId, edges);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string, trail: readonly string[]): void => {
    if (visiting.has(node)) {
      errors.push(issue("circular_issuer_relationship", `Issuer relationship cycle: ${[...trail, node].join(" -> ")}.`, {
        issuerPublicId: node,
      }));
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const child of [...(graph.get(node) ?? [])].sort()) {
      visit(child, [...trail, node]);
    }
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of [...graph.keys()].sort()) visit(node, []);
}

function validateAdministratorAssignments(
  assignments: readonly FinancialMarketAdministratorAssignment[],
  issuerById: ReadonlyMap<string, FinancialMarketIssuerDefinition>,
  errors: FinancialMarketIssuerValidationIssue[],
): void {
  const administered = new Set<string>();
  for (const assignment of [...assignments].sort((a, b) =>
    a.assignmentPublicId.localeCompare(b.assignmentPublicId)
  )) {
    if (!isFinancialMarketPublicId(assignment.assignmentPublicId) ||
      !isFinancialMarketPublicId(assignment.administeredPublicId)) {
      errors.push(issue("invalid_administrator_assignment_id", "Administrator assignment public ID is invalid.", {
        assignmentPublicId: assignment.assignmentPublicId,
      }));
    }
    const issuer = issuerById.get(assignment.administratorIssuerPublicId);
    if (!issuer) {
      errors.push(issue("orphaned_administrator", "Administrator issuer does not exist.", {
        assignmentPublicId: assignment.assignmentPublicId,
        issuerPublicId: assignment.administratorIssuerPublicId,
      }));
      continue;
    }
    const allowed = ADMINISTRATOR_TYPES[assignment.administeredKind];
    if (!allowed.includes(issuer.issuerType)) {
      errors.push(issue(
        "invalid_administrator_type",
        `${issuer.issuerType} cannot administer ${assignment.administeredKind}.`,
        {
          assignmentPublicId: assignment.assignmentPublicId,
          issuerPublicId: issuer.issuerPublicId,
        },
      ));
    }
    const targetKey = `${assignment.administeredKind}:${assignment.administeredPublicId}`;
    if (administered.has(targetKey)) {
      errors.push(issue("duplicate_administrator_assignment", "Administered target has multiple assignments.", {
        assignmentPublicId: assignment.assignmentPublicId,
      }));
    }
    administered.add(targetKey);
  }
}

function reportDuplicateName(
  names: Map<string, string>,
  normalizedName: string,
  issuerPublicId: string,
  code: string,
  issues: FinancialMarketIssuerValidationIssue[],
): void {
  const prior = names.get(normalizedName);
  if (prior && prior !== issuerPublicId) {
    issues.push(issue(code, "Normalized issuer name is shared by multiple issuer IDs.", {
      issuerPublicId,
    }));
  } else {
    names.set(normalizedName, issuerPublicId);
  }
}

function countIssuerTypes(
  issuers: readonly FinancialMarketIssuerDefinition[],
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const issuer of issuers) counts[issuer.issuerType] = (counts[issuer.issuerType] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function normalizeName(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

function isIsoDateTime(value: string): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && value.includes("T");
}

function issue(
  code: string,
  message: string,
  context: Omit<FinancialMarketIssuerValidationIssue, "code" | "message"> = {},
): FinancialMarketIssuerValidationIssue {
  return { code, message, ...context };
}

function sortIssues(
  issues: readonly FinancialMarketIssuerValidationIssue[],
): readonly FinancialMarketIssuerValidationIssue[] {
  return [...issues].sort((a, b) =>
    a.code.localeCompare(b.code) ||
    String(a.issuerPublicId ?? "").localeCompare(String(b.issuerPublicId ?? "")) ||
    String(a.instrumentPublicId ?? "").localeCompare(String(b.instrumentPublicId ?? "")) ||
    String(a.relationshipPublicId ?? "").localeCompare(String(b.relationshipPublicId ?? "")) ||
    String(a.assignmentPublicId ?? "").localeCompare(String(b.assignmentPublicId ?? ""))
  );
}
