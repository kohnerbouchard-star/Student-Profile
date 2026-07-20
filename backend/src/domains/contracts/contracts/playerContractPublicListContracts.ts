import type {
  GameSessionContractRecord,
  PlayerContractProgressRecord,
} from "./contractRepositoryContracts.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANSWER_KEY_PATTERN = /^(?:correctAnswer|correctAnswers|correctChoice|correctChoices|answerKey|answerKeys|expectedAnswer|expectedAnswers|acceptedAnswer|acceptedAnswers)$/i;
const PRIVATE_IDENTIFIER_EXACT = new Set([
  "id",
  "ids",
  "uuid",
  "uuids",
  "gameSessionId",
  "gameSessionIds",
  "playerId",
  "playerIds",
  "playerUuid",
  "playerUuids",
  "playerSessionId",
  "playerSessionIds",
  "progressId",
  "progressIds",
  "contractId",
  "contractIds",
  "contractTemplateId",
  "sourceId",
  "createdByStaffId",
  "staffId",
  "itemId",
  "itemIds",
]);

export interface PublicPlayerContractListItemDto {
  readonly contractKey: string;
  readonly sourceType: string;
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly category: string;
  readonly status: string;
  readonly visibility: string;
  readonly targetingPayload: Record<string, unknown>;
  readonly requirementsPayload: Record<string, unknown>;
  readonly rewardPayload: Record<string, unknown>;
  readonly completionMode: string;
  readonly publishedAt: string | null;
  readonly deadlineAt: string | null;
  readonly expiresAt: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublicPlayerContractProgressDto {
  readonly contractKey: string;
  readonly status: string;
  readonly evidencePayload: Record<string, unknown>;
  readonly resultPayload: Record<string, unknown>;
  readonly submittedAt: string | null;
  readonly completedAt: string | null;
  readonly rewardIssuedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PublicPlayerContractListResponseBody {
  readonly ok: true;
  readonly contracts: readonly PublicPlayerContractListItemDto[];
  readonly progress: readonly PublicPlayerContractProgressDto[];
}

export function toPublicPlayerContractListItemDto(
  contract: GameSessionContractRecord,
): PublicPlayerContractListItemDto {
  return {
    contractKey: contract.contractKey,
    sourceType: contract.sourceType,
    title: contract.title,
    description: contract.description,
    instructions: contract.instructions,
    category: contract.category,
    status: contract.status,
    visibility: contract.visibility,
    targetingPayload: publicTargetingPayload(contract.targetingPayload),
    requirementsPayload: publicObject(contract.requirementsPayload),
    rewardPayload: publicObject(contract.rewardPayload),
    completionMode: contract.completionMode,
    publishedAt: contract.publishedAt,
    deadlineAt: contract.deadlineAt,
    expiresAt: contract.expiresAt,
    metadata: publicMetadata(contract.metadata),
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
  };
}

export function toPublicPlayerContractProgressDto(
  progress: PlayerContractProgressRecord,
  contractKey: string,
): PublicPlayerContractProgressDto {
  return {
    contractKey,
    status: progress.status,
    evidencePayload: publicObject(progress.evidencePayload),
    resultPayload: publicObject(progress.resultPayload),
    submittedAt: progress.submittedAt,
    completedAt: progress.completedAt,
    rewardIssuedAt: progress.rewardIssuedAt,
    createdAt: progress.createdAt,
    updatedAt: progress.updatedAt,
  };
}

function publicTargetingPayload(
  targeting: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const countryCodes = publicStringArray(targeting.countryCodes);
  const rosterLabels = publicStringArray(targeting.rosterLabels);
  const locations = publicStringArray(targeting.locations);
  if (countryCodes.length) output.countryCodes = countryCodes;
  if (rosterLabels.length) output.rosterLabels = rosterLabels;
  if (locations.length) output.locations = locations;
  return output;
}

function publicMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const issuer = publicString(metadata.issuer);
  const summary = publicString(metadata.summary);
  return {
    ...(issuer ? { issuer } : {}),
    ...(summary ? { summary } : {}),
  };
}

function publicObject(value: Record<string, unknown>): Record<string, unknown> {
  const sanitized = publicValue(value);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized as Record<string, unknown>
    : {};
}

function publicValue(value: unknown): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return UUID_PATTERN.test(value.trim()) ? undefined : value;
  if (Array.isArray(value)) {
    return value
      .map(publicValue)
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") return undefined;

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (isPrivateIdentifierKey(key) || ANSWER_KEY_PATTERN.test(key)) continue;
    const sanitized = publicValue(nested);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function isPrivateIdentifierKey(key: string): boolean {
  if (PRIVATE_IDENTIFIER_EXACT.has(key)) return true;
  if (/^(?:id|ids|uuid|uuids)$/i.test(key)) return true;
  if (/(?:_|-)(?:id|ids|uuid|uuids)$/i.test(key)) return true;
  return /(?:Id|Ids|UUID|UUIDs|Uuid|Uuids)$/.test(key);
}

function publicString(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text && !UUID_PATTERN.test(text) ? text : "";
}

function publicStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.map(publicString).filter(Boolean).slice(0, 100)
    : [];
}
