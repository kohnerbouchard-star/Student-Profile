// Pure row interpretation; read orchestration and error handling stay in the repository.
import type { JsonValue } from "../../../supabase/tableTypes.ts";
import type {
  PlayerStoryRelationship,
  PlayerStoryRelationshipRole,
  PlayerStoryRelationshipStage,
} from "../contracts/playerStoryContext.ts";
import type {
  AccountBalanceRow,
  StockAssetRow,
  StockHoldingRow,
  StoryRelationshipRow,
} from "./playerStoryContextRows.ts";

export function buildRelationshipRecord(
  rows: readonly StoryRelationshipRow[],
): Readonly<Record<string, PlayerStoryRelationship>> {
  const relationships: Record<string, PlayerStoryRelationship> = {};

  for (const row of rows) {
    const characterKey = normalizeKey(row.character_key);

    if (!characterKey) {
      continue;
    }

    relationships[characterKey] = {
      characterKey,
      characterName: normalizeKey(row.character_name) ?? characterKey,
      countryCode: normalizeKey(row.country_code),
      relationshipRole: normalizeRelationshipRole(row.relationship_role),
      stage: normalizeRelationshipStage(row.stage),
      contactCount: toNonNegativeInteger(row.contact_count),
      replyCount: toNonNegativeInteger(row.reply_count),
      trustScore: clampRelationshipTrust(row.trust_score),
      memory: isRecord(row.memory) ? row.memory : {},
    };
  }

  return relationships;
}

export function balanceInValuationCurrency(
  rows: readonly AccountBalanceRow[],
  preferredCurrencyCode: string | null,
): number {
  const availableCurrencies = uniqueSorted(
    rows.map((row) => normalizeCurrencyCode(row.currency_code)).filter(
      isString,
    ),
  );
  const valuationCurrencyCode = normalizeCurrencyCode(preferredCurrencyCode) ??
    (availableCurrencies.length === 1 ? availableCurrencies[0] : null);

  if (!valuationCurrencyCode) {
    return 0;
  }

  return sum(
    rows.filter((row) =>
      normalizeCurrencyCode(row.currency_code) === valuationCurrencyCode
    ),
    (row) => toNumber(row.balance),
  );
}

export function calculateExposurePct(
  holdings: readonly StockHoldingRow[],
  assetById: ReadonlyMap<string, StockAssetRow>,
  keyForAsset: (asset: StockAssetRow) => string | null,
): Readonly<Record<string, number>> {
  const valueByKey = new Map<string, number>();
  let totalValue = 0;

  for (const holding of holdings) {
    const asset = assetById.get(holding.stock_asset_id);

    if (!asset) {
      continue;
    }

    const key = keyForAsset(asset);
    const value = toNumber(holding.quantity) * toNumber(asset.current_price);

    if (!key || value <= 0) {
      continue;
    }

    totalValue += value;
    valueByKey.set(key, (valueByKey.get(key) ?? 0) + value);
  }

  if (totalValue <= 0) {
    return {};
  }

  const entries = [...valueByKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, round((value / totalValue) * 100)] as const);

  return Object.fromEntries(entries);
}

export function isActiveProgressStatus(status: string): boolean {
  return status === "in_progress" || status === "submitted";
}

export function isCompletedProgressStatus(status: string): boolean {
  return status === "completed" || status === "approved";
}

export function groupBy<T>(
  rows: readonly T[],
  keyForRow: (row: T) => string,
): ReadonlyMap<string, readonly T[]> {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const key = keyForRow(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return groups;
}

export function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

export function normalizeCurrencyCode(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z0-9]{3,16}$/.test(normalized) ? normalized : null;
}

export function normalizeKey(value: string | null | undefined): string | null {
  const key = value?.trim();

  return key ? key : null;
}

function normalizeRelationshipRole(value: string): PlayerStoryRelationshipRole {
  if (
    value === "sponsor" ||
    value === "local_friend" ||
    value === "rival_peer" ||
    value === "gatekeeper" ||
    value === "former_home"
  ) {
    return value;
  }

  return "other";
}

function normalizeRelationshipStage(
  value: string,
): PlayerStoryRelationshipStage {
  if (
    value === "contacted" ||
    value === "engaged" ||
    value === "trusted" ||
    value === "strained" ||
    value === "broken"
  ) {
    return value;
  }

  return "contacted";
}

function toNonNegativeInteger(value: number | string): number {
  return Math.max(0, Math.trunc(toNumber(value)));
}

function clampRelationshipTrust(value: number | string): number {
  return Math.max(-100, Math.min(100, Math.trunc(toNumber(value))));
}

export function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sum<T>(rows: readonly T[], valueForRow: (row: T) => number): number {
  return round(rows.reduce((total, row) => total + valueForRow(row), 0));
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
