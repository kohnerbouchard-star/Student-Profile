import {
  BUSINESS_STOCKROOM_LOCATION_KEYS,
  type BusinessStockroomItemDto,
  type BusinessStockroomLocationDto,
  type BusinessStockroomLocationKey,
  PlayerBusinessError,
} from "../../contracts/playerBusinessContracts.ts";

type Row = Record<string, unknown>;

const BUSINESS_KEY = /^biz_[0-9a-f]{32}$/u;
const ACCOUNT_KEY = /^iac_[0-9a-f]{32}$/u;
const ITEM_KEY = /^itm_[0-9a-f]{32}$/u;
const CANONICAL_KEY = /^[a-z0-9][a-z0-9._-]{0,159}$/u;
const CURRENCY_CODE = /^[A-Z0-9_]{3,16}$/u;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
const MAX_STOCKROOM_ITEMS = 500;
const NUMBER_TOLERANCE = 0.0001;
const SNAPSHOT_KEYS = ["business_key", "items", "locations"] as const;

const LOCATION_LABELS: Readonly<Record<BusinessStockroomLocationKey, string>> =
  Object.freeze({
    warehouse: "Warehouse / Materials",
    work_in_progress: "Work in Progress",
    finished_goods: "Finished Goods",
    in_transit: "In Transit",
  });

export interface ParsedStockroomEnvelope {
  readonly businessKey: string;
  readonly locations: unknown;
  readonly items: unknown;
}

export interface ParsedStockroomLocation extends BusinessStockroomLocationDto {
  readonly businessKey: string;
}

export interface ParsedStockroomItem extends BusinessStockroomItemDto {
  readonly businessKey: string;
}

export function parseStockroomEnvelope(value: unknown): ParsedStockroomEnvelope {
  if (!isRow(value) || containsInternalUuid(value)) {
    throw invalidStockroomResult("Stockroom snapshot envelope is invalid.");
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== SNAPSHOT_KEYS.length ||
    keys.some((key, index) => key !== SNAPSHOT_KEYS[index])
  ) {
    throw invalidStockroomResult("Stockroom snapshot fields are invalid.");
  }
  return {
    businessKey: publicKey(value.business_key, "business_key", BUSINESS_KEY),
    locations: value.locations,
    items: value.items,
  };
}

export function parseStockroomLocations(
  value: unknown,
): readonly ParsedStockroomLocation[] {
  const rows = requiredArrayRows(value, "locations", 4);
  if (rows.length !== BUSINESS_STOCKROOM_LOCATION_KEYS.length) {
    throw invalidStockroomResult(
      `Expected ${BUSINESS_STOCKROOM_LOCATION_KEYS.length} Stockroom locations.`,
    );
  }

  return rows.map((row) => {
    const locationKey = readLocationKey(row.location_key);
    const quantityOwned = nonNegativeNumber(row.quantity_owned, "quantity_owned");
    const quantityReserved = nonNegativeNumber(
      row.quantity_reserved,
      "quantity_reserved",
    );
    const quantityAvailable = nonNegativeNumber(
      row.quantity_available,
      "quantity_available",
    );
    assertQuantityInvariant(
      quantityOwned,
      quantityReserved,
      quantityAvailable,
      `location:${locationKey}`,
    );

    const label = boundedText(row.location_label, "location_label", 1, 80);
    if (label !== LOCATION_LABELS[locationKey]) {
      throw invalidStockroomResult(`Unexpected label for ${locationKey}.`);
    }

    return {
      businessKey: publicKey(row.business_key, "business_key", BUSINESS_KEY),
      accountKey: publicKey(row.account_key, "account_key", ACCOUNT_KEY),
      locationKey,
      label,
      itemCount: nonNegativeInteger(row.item_count, "item_count"),
      quantityOwned,
      quantityReserved,
      quantityAvailable,
    };
  });
}

export function parseStockroomItems(
  value: unknown,
): readonly ParsedStockroomItem[] {
  const rows = requiredArrayRows(value, "items", MAX_STOCKROOM_ITEMS);
  return rows.map((row) => {
    const locationKey = readLocationKey(row.location_key);
    const quantityOwned = nonNegativeNumber(row.quantity_owned, "quantity_owned");
    const quantityReserved = nonNegativeNumber(
      row.quantity_reserved,
      "quantity_reserved",
    );
    const quantityAvailable = nonNegativeNumber(
      row.quantity_available,
      "quantity_available",
    );
    assertQuantityInvariant(
      quantityOwned,
      quantityReserved,
      quantityAvailable,
      `item:${String(row.item_key ?? "unknown")}`,
    );

    return {
      businessKey: publicKey(row.business_key, "business_key", BUSINESS_KEY),
      accountKey: publicKey(row.account_key, "account_key", ACCOUNT_KEY),
      locationKey,
      itemKey: publicKey(row.item_key, "item_key", ITEM_KEY),
      canonicalKey: patternText(
        row.canonical_key,
        "canonical_key",
        CANONICAL_KEY,
      ),
      name: boundedText(row.item_name, "item_name", 1, 160),
      itemClass: boundedText(row.item_class, "item_class", 1, 80),
      subtype: boundedText(row.item_subtype, "item_subtype", 1, 80),
      quantityOwned,
      quantityReserved,
      quantityAvailable,
      averageUnitCost: nonNegativeNumber(
        row.average_unit_cost,
        "average_unit_cost",
      ),
      costCurrencyCode: nullablePatternText(
        row.cost_currency_code,
        "cost_currency_code",
        CURRENCY_CODE,
      ),
      version: positiveInteger(row.holding_version, "holding_version"),
    };
  });
}

export function invalidStockroomResult(message: string): PlayerBusinessError {
  return new PlayerBusinessError(
    "business_stockroom_result_invalid",
    message,
    500,
  );
}

export function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= NUMBER_TOLERANCE;
}

export function containsInternalUuid(value: unknown): boolean {
  return UUID.test(JSON.stringify(value));
}

function requiredArrayRows(
  value: unknown,
  resource: string,
  maximum: number,
): Row[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw invalidStockroomResult(`Stockroom ${resource} result is invalid.`);
  }
  const rows = value.filter(isRow);
  if (rows.length !== value.length) {
    throw invalidStockroomResult(`Stockroom ${resource} rows are invalid.`);
  }
  return rows;
}

function isRow(value: unknown): value is Row {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readLocationKey(value: unknown): BusinessStockroomLocationKey {
  const result = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    !BUSINESS_STOCKROOM_LOCATION_KEYS.includes(
      result as BusinessStockroomLocationKey,
    )
  ) {
    throw invalidStockroomResult("Stockroom location key is invalid.");
  }
  return result as BusinessStockroomLocationKey;
}

function publicKey(value: unknown, field: string, pattern: RegExp): string {
  return patternText(value, field, pattern).toLowerCase();
}

function patternText(value: unknown, field: string, pattern: RegExp): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!pattern.test(result)) {
    throw invalidStockroomResult(`Stockroom ${field} is invalid.`);
  }
  return result;
}

function nullablePatternText(
  value: unknown,
  field: string,
  pattern: RegExp,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  return patternText(value, field, pattern).toUpperCase();
}

function boundedText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < minimum || result.length > maximum || UUID.test(result)) {
    throw invalidStockroomResult(`Stockroom ${field} is invalid.`);
  }
  return result;
}

function nonNegativeNumber(value: unknown, field: string): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) {
    throw invalidStockroomResult(`Stockroom ${field} is invalid.`);
  }
  return result;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const result = nonNegativeNumber(value, field);
  if (!Number.isInteger(result)) {
    throw invalidStockroomResult(`Stockroom ${field} must be an integer.`);
  }
  return result;
}

function positiveInteger(value: unknown, field: string): number {
  const result = nonNegativeInteger(value, field);
  if (result < 1) {
    throw invalidStockroomResult(`Stockroom ${field} must be positive.`);
  }
  return result;
}

function assertQuantityInvariant(
  quantityOwned: number,
  quantityReserved: number,
  quantityAvailable: number,
  subject: string,
): void {
  if (
    quantityReserved > quantityOwned ||
    !approximatelyEqual(
      quantityAvailable,
      Math.max(quantityOwned - quantityReserved, 0),
    )
  ) {
    throw invalidStockroomResult(`Stockroom quantity invariant failed: ${subject}.`);
  }
}
