const INVALID = Symbol("invalid");

type Parsed<T> = T | typeof INVALID;
type SafeParseResult<T> =
  | { readonly success: true; readonly data: T }
  | {
    readonly success: false;
    readonly error: { readonly issues: readonly string[] };
  };

type SafeSchema<T> = {
  readonly safeParse: (value: unknown) => SafeParseResult<T>;
};

export type PlayerBusinessManufacturingPriority = "standard" | "expedite";
export type PlayerBusinessManufacturingStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "failed";

export interface PlayerBusinessManufacturingJob {
  readonly jobKey: string;
  readonly businessKey: string;
  readonly productKey: string;
  readonly productName: string;
  readonly status: PlayerBusinessManufacturingStatus;
  readonly resourceState: string;
  readonly priority: PlayerBusinessManufacturingPriority;
  readonly quantity: number;
  readonly completedOutputQuantity: number;
  readonly queuedAt: string | null;
  readonly startedAt: string | null;
  readonly completesAt: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly failedAt: string | null;
  readonly failureCode: string | null;
  readonly canCancel: boolean;
}

export interface PlayerBusinessManufacturingStartRequest {
  readonly productKey: string;
  readonly quantity: number;
  readonly priority: PlayerBusinessManufacturingPriority;
  readonly idempotencyKey: string;
}

export interface PlayerBusinessManufacturingCancelRequest {
  readonly idempotencyKey: string;
}

export interface PlayerBusinessManufacturingMutationResult
  extends PlayerBusinessManufacturingJob {
  readonly replayed: boolean;
}

const JOB_KEYS = Object.freeze([
  "jobKey",
  "businessKey",
  "productKey",
  "productName",
  "status",
  "resourceState",
  "priority",
  "quantity",
  "completedOutputQuantity",
  "queuedAt",
  "startedAt",
  "completesAt",
  "completedAt",
  "cancelledAt",
  "failedAt",
  "failureCode",
  "canCancel",
]);

export const playerBusinessManufacturingPrioritySchema = makeSchema(
  parsePriority,
);

export const playerBusinessManufacturingStatusSchema = makeSchema(
  parseStatus,
);

export const playerBusinessManufacturingJobSchema = makeSchema(
  (value) => parseJob(value, JOB_KEYS),
);

export const playerBusinessManufacturingJobsSchema = makeSchema(
  (value): Parsed<PlayerBusinessManufacturingJob[]> => {
    if (!Array.isArray(value)) return INVALID;
    const jobs: PlayerBusinessManufacturingJob[] = [];
    for (const item of value) {
      const parsed = parseJob(item, JOB_KEYS);
      if (parsed === INVALID) return INVALID;
      jobs.push(parsed);
    }
    return jobs;
  },
);

export const playerBusinessManufacturingStartRequestSchema = makeSchema(
  (value): Parsed<PlayerBusinessManufacturingStartRequest> => {
    const record = readRecord(value);
    if (!record || !hasOnlyKeys(record, [
      "productKey",
      "quantity",
      "priority",
      "idempotencyKey",
    ])) return INVALID;

    const productKey = parsePublicKey(record.productKey);
    if (productKey === INVALID) return INVALID;
    const quantity = parseInteger(record.quantity, 1, 10_000);
    if (quantity === INVALID) return INVALID;
    const priority = record.priority === undefined
      ? "standard"
      : parsePriority(record.priority);
    if (priority === INVALID) return INVALID;
    const idempotencyKey = parseTrimmedString(
      record.idempotencyKey,
      8,
      160,
    );
    if (idempotencyKey === INVALID) return INVALID;

    return { productKey, quantity, priority, idempotencyKey };
  },
);

export const playerBusinessManufacturingCancelRequestSchema = makeSchema(
  (value): Parsed<PlayerBusinessManufacturingCancelRequest> => {
    const record = readRecord(value);
    if (!record || !hasOnlyKeys(record, ["idempotencyKey"])) return INVALID;
    const idempotencyKey = parseTrimmedString(
      record.idempotencyKey,
      8,
      160,
    );
    if (idempotencyKey === INVALID) return INVALID;
    return { idempotencyKey };
  },
);

export const playerBusinessManufacturingMutationResultSchema = makeSchema(
  (value): Parsed<PlayerBusinessManufacturingMutationResult> => {
    const record = readRecord(value);
    if (!record) return INVALID;
    const parsed = parseJob(value, [...JOB_KEYS, "replayed"]);
    if (parsed === INVALID || typeof record.replayed !== "boolean") {
      return INVALID;
    }
    return { ...parsed, replayed: record.replayed };
  },
);

function makeSchema<T>(parser: (value: unknown) => Parsed<T>): SafeSchema<T> {
  return Object.freeze({
    safeParse(value: unknown): SafeParseResult<T> {
      const data = parser(value);
      if (data === INVALID) {
        return {
          success: false,
          error: { issues: ["Value does not match the manufacturing contract."] },
        };
      }
      return { success: true, data };
    },
  });
}

function parseJob(
  value: unknown,
  allowedKeys: readonly string[],
): Parsed<PlayerBusinessManufacturingJob> {
  const record = readRecord(value);
  if (!record || !hasOnlyKeys(record, allowedKeys)) return INVALID;

  const jobKey = parsePublicKey(record.jobKey, /^mfg_[a-z0-9_-]+$/);
  if (jobKey === INVALID) return INVALID;
  const businessKey = parsePublicKey(record.businessKey);
  if (businessKey === INVALID) return INVALID;
  const productKey = parsePublicKey(record.productKey);
  if (productKey === INVALID) return INVALID;
  const productName = parseTrimmedString(record.productName, 1, 160);
  if (productName === INVALID) return INVALID;
  const status = parseStatus(record.status);
  if (status === INVALID) return INVALID;
  const resourceState = parseTrimmedString(record.resourceState, 1, 80);
  if (resourceState === INVALID) return INVALID;
  const priority = parsePriority(record.priority);
  if (priority === INVALID) return INVALID;
  const quantity = parseInteger(record.quantity, 0, Number.MAX_SAFE_INTEGER);
  if (quantity === INVALID) return INVALID;
  const completedOutputQuantity = parseInteger(
    record.completedOutputQuantity,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (completedOutputQuantity === INVALID) return INVALID;
  const queuedAt = parseNullableTimestamp(record.queuedAt);
  if (queuedAt === INVALID) return INVALID;
  const startedAt = parseNullableTimestamp(record.startedAt);
  if (startedAt === INVALID) return INVALID;
  const completesAt = parseNullableTimestamp(record.completesAt);
  if (completesAt === INVALID) return INVALID;
  const completedAt = parseNullableTimestamp(record.completedAt);
  if (completedAt === INVALID) return INVALID;
  const cancelledAt = parseNullableTimestamp(record.cancelledAt);
  if (cancelledAt === INVALID) return INVALID;
  const failedAt = parseNullableTimestamp(record.failedAt);
  if (failedAt === INVALID) return INVALID;
  const failureCode = parseNullableTrimmedString(record.failureCode, 160);
  if (failureCode === INVALID) return INVALID;
  if (typeof record.canCancel !== "boolean") return INVALID;

  return {
    jobKey,
    businessKey,
    productKey,
    productName,
    status,
    resourceState,
    priority,
    quantity,
    completedOutputQuantity,
    queuedAt,
    startedAt,
    completesAt,
    completedAt,
    cancelledAt,
    failedAt,
    failureCode,
    canCancel: record.canCancel,
  };
}

function parsePriority(
  value: unknown,
): Parsed<PlayerBusinessManufacturingPriority> {
  return value === "standard" || value === "expedite" ? value : INVALID;
}

function parseStatus(
  value: unknown,
): Parsed<PlayerBusinessManufacturingStatus> {
  return value === "queued" ||
      value === "in_progress" ||
      value === "completed" ||
      value === "cancelled" ||
      value === "failed"
    ? value
    : INVALID;
}

function parsePublicKey(
  value: unknown,
  pattern = /^[a-z0-9][a-z0-9_-]*$/,
): Parsed<string> {
  const text = parseTrimmedString(value, 5, 160);
  return text !== INVALID && pattern.test(text) ? text : INVALID;
}

function parseTrimmedString(
  value: unknown,
  minimum: number,
  maximum: number,
): Parsed<string> {
  if (typeof value !== "string") return INVALID;
  const text = value.trim();
  return text.length >= minimum && text.length <= maximum ? text : INVALID;
}

function parseNullableTrimmedString(
  value: unknown,
  maximum: number,
): Parsed<string | null> {
  if (value === null) return null;
  if (typeof value !== "string") return INVALID;
  const text = value.trim();
  return text.length <= maximum ? text : INVALID;
}

function parseNullableTimestamp(value: unknown): Parsed<string | null> {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value) ||
    Number.isNaN(Date.parse(value))
  ) return INVALID;
  return value;
}

function parseInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): Parsed<number> {
  return typeof value === "number" &&
      Number.isInteger(value) &&
      value >= minimum &&
      value <= maximum
    ? value
    : INVALID;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}
