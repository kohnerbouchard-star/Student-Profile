import {
  contractError,
  invalidCommand,
  readBoolean,
  readNonNegativeInteger,
  readNullableNonNegativeInteger,
  readNullablePattern,
  readNullablePositiveInteger,
  readNullableTimestamp,
  readPattern,
  readPositiveInteger,
  readText,
  readTimestamp,
  requireCommandPattern,
  requireCommandPositiveInteger,
  requireRecord,
} from "./storeWithdrawalContractPrimitives.ts";

export { StoreWithdrawalContractError } from "./storeWithdrawalContractPrimitives.ts";

export type StoreWithdrawalMode = "full" | "reduce";
export type StoreWithdrawalRequestStatus = "pending" | "completed";
export type StoreWithdrawalOfferStatus =
  | "draft"
  | "active"
  | "paused"
  | "withdrawal_pending";

export interface RequestBusinessStoreOfferWithdrawalCommand {
  readonly gameSessionId: string;
  readonly businessKey: string;
  readonly offerKey: string;
  readonly mode: StoreWithdrawalMode;
  readonly quantity: number | null;
  readonly expectedOfferVersion: number;
  readonly idempotencyKey: string;
}

export interface StoreWithdrawalRequestResult {
  readonly requestKey: string;
  readonly requestStatus: StoreWithdrawalRequestStatus;
  readonly offerKey: string;
  readonly offerStatus: StoreWithdrawalOfferStatus;
  readonly offerVersion: number;
  readonly mode: StoreWithdrawalMode;
  readonly requestedQuantity: number | null;
  readonly requestedAt: string;
  readonly effectiveAt: string;
  readonly nextAttemptAt: string | null;
  readonly returnedQuantity: number | null;
  readonly transactionKey: string | null;
  readonly replayed: boolean;
}

export interface ProcessDueStoreWithdrawalsCommand {
  readonly limit: number;
}

export interface StoreWithdrawalBlockedResult {
  readonly requestKey: string;
  readonly offerKey: string;
  readonly outcome: "blocked";
  readonly blockReason: "inventory_reserved";
  readonly reservedQuantity: number;
  readonly nextAttemptAt: string;
  readonly offerVersion: number;
}

export interface StoreWithdrawalCompletedResult {
  readonly requestKey: string;
  readonly offerKey: string;
  readonly outcome: "completed";
  readonly mode: StoreWithdrawalMode;
  readonly returnedQuantity: number;
  readonly remainingListedQuantity: number;
  readonly offerStatus: Exclude<StoreWithdrawalOfferStatus, "withdrawal_pending">;
  readonly offerVersion: number;
  readonly inventoryAccountKey: string;
  readonly transactionKey: string | null;
  readonly completedAt: string;
}

export type StoreWithdrawalProcessItem =
  | StoreWithdrawalBlockedResult
  | StoreWithdrawalCompletedResult;

export interface ProcessDueStoreWithdrawalsResult {
  readonly asOf: string;
  readonly selectedCount: number;
  readonly completedCount: number;
  readonly blockedCount: number;
  readonly results: readonly StoreWithdrawalProcessItem[];
}

export interface StoreWithdrawalRepository {
  requestBusinessWithdrawal(
    command: RequestBusinessStoreOfferWithdrawalCommand,
  ): Promise<StoreWithdrawalRequestResult>;
  processDueWithdrawals(
    command: ProcessDueStoreWithdrawalsCommand,
  ): Promise<ProcessDueStoreWithdrawalsResult>;
}

export function normalizeStoreWithdrawalRequestCommand(
  value: RequestBusinessStoreOfferWithdrawalCommand,
): RequestBusinessStoreOfferWithdrawalCommand {
  const mode = value.mode === "full" || value.mode === "reduce"
    ? value.mode
    : invalidCommand("mode must be full or reduce.");
  const quantity = value.quantity === null
    ? null
    : requireCommandPositiveInteger(value.quantity, "quantity");
  if (
    (mode === "full" && quantity !== null) ||
    (mode === "reduce" && quantity === null)
  ) {
    invalidCommand(
      "Full withdrawal must omit quantity and reduction must include quantity.",
    );
  }

  const idempotencyKey = typeof value.idempotencyKey === "string"
    ? value.idempotencyKey.trim()
    : "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) {
    invalidCommand("idempotencyKey must contain 8 to 160 characters.");
  }

  return {
    gameSessionId: requireCommandPattern(
      value.gameSessionId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      "gameSessionId",
    ),
    businessKey: requireCommandPattern(
      value.businessKey,
      /^biz_[0-9a-f]{32}$/u,
      "businessKey",
    ),
    offerKey: requireCommandPattern(
      value.offerKey,
      /^sof_[0-9a-f]{32}$/u,
      "offerKey",
    ),
    mode,
    quantity,
    expectedOfferVersion: requireCommandPositiveInteger(
      value.expectedOfferVersion,
      "expectedOfferVersion",
    ),
    idempotencyKey,
  };
}

export function normalizeProcessDueStoreWithdrawalsCommand(
  value: ProcessDueStoreWithdrawalsCommand,
): ProcessDueStoreWithdrawalsCommand {
  const limit = Number(value.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    invalidCommand("limit must be an integer from 1 through 100.");
  }
  return { limit };
}

export function parseStoreWithdrawalRequestResult(
  value: unknown,
): StoreWithdrawalRequestResult {
  const row = requireRecord(value, "withdrawal request result");
  const requestStatus = readRequestStatus(row.requestStatus);
  const offerStatus = readOfferStatus(row.offerStatus);
  const mode = readMode(row.mode);
  const requestedQuantity = readNullablePositiveInteger(
    row.requestedQuantity,
    "requestedQuantity",
  );
  if (
    (mode === "full" && requestedQuantity !== null) ||
    (mode === "reduce" && requestedQuantity === null)
  ) {
    throw contractError(
      "invalid_store_withdrawal_result",
      "Requested quantity does not match withdrawal mode.",
    );
  }

  const requestedAt = readTimestamp(row.requestedAt, "requestedAt");
  const effectiveAt = readTimestamp(row.effectiveAt, "effectiveAt");
  if (Date.parse(effectiveAt) - Date.parse(requestedAt) < 5 * 60 * 1_000) {
    throw contractError(
      "invalid_store_withdrawal_result",
      "effectiveAt must be at least five minutes after requestedAt.",
    );
  }

  const nextAttemptAt = readNullableTimestamp(
    row.nextAttemptAt,
    "nextAttemptAt",
  );
  const returnedQuantity = readNullableNonNegativeInteger(
    row.returnedQuantity,
    "returnedQuantity",
  );
  const transactionKey = readNullablePattern(
    row.transactionKey,
    /^itx_[0-9a-f]{32}$/u,
    "transactionKey",
  );

  if (requestStatus === "pending") {
    if (
      offerStatus !== "withdrawal_pending" ||
      returnedQuantity !== null ||
      transactionKey !== null ||
      nextAttemptAt === null
    ) {
      throw contractError(
        "invalid_store_withdrawal_result",
        "Pending withdrawal state is inconsistent.",
      );
    }
  } else {
    if (
      offerStatus === "withdrawal_pending" ||
      returnedQuantity === null ||
      nextAttemptAt !== null ||
      (returnedQuantity > 0) !== (transactionKey !== null)
    ) {
      throw contractError(
        "invalid_store_withdrawal_result",
        "Completed withdrawal state is inconsistent.",
      );
    }
  }

  return {
    requestKey: readPattern(
      row.requestKey,
      /^swr_[0-9a-f]{32}$/u,
      "requestKey",
    ),
    requestStatus,
    offerKey: readPattern(
      row.offerKey,
      /^sof_[0-9a-f]{32}$/u,
      "offerKey",
    ),
    offerStatus,
    offerVersion: readPositiveInteger(row.offerVersion, "offerVersion"),
    mode,
    requestedQuantity,
    requestedAt,
    effectiveAt,
    nextAttemptAt,
    returnedQuantity,
    transactionKey,
    replayed: readBoolean(row.replayed, "replayed"),
  };
}

export function parseProcessDueStoreWithdrawalsResult(
  value: unknown,
): ProcessDueStoreWithdrawalsResult {
  const row = requireRecord(value, "withdrawal processor result");
  if (!Array.isArray(row.results)) {
    throw contractError(
      "invalid_store_withdrawal_process_result",
      "results must be an array.",
    );
  }
  const results = row.results.map(parseProcessItem);
  const selectedCount = readNonNegativeInteger(
    row.selectedCount,
    "selectedCount",
  );
  const completedCount = readNonNegativeInteger(
    row.completedCount,
    "completedCount",
  );
  const blockedCount = readNonNegativeInteger(
    row.blockedCount,
    "blockedCount",
  );
  if (
    selectedCount !== results.length ||
    completedCount !== results.filter((item) => item.outcome === "completed").length ||
    blockedCount !== results.filter((item) => item.outcome === "blocked").length ||
    completedCount + blockedCount !== selectedCount
  ) {
    throw contractError(
      "invalid_store_withdrawal_process_result",
      "Processor counts must match public result details.",
    );
  }

  return {
    asOf: readTimestamp(row.asOf, "asOf"),
    selectedCount,
    completedCount,
    blockedCount,
    results,
  };
}

function parseProcessItem(value: unknown): StoreWithdrawalProcessItem {
  const row = requireRecord(value, "withdrawal process item");
  const outcome = readText(row.outcome, "outcome");
  const requestKey = readPattern(
    row.requestKey,
    /^swr_[0-9a-f]{32}$/u,
    "requestKey",
  );
  const offerKey = readPattern(
    row.offerKey,
    /^sof_[0-9a-f]{32}$/u,
    "offerKey",
  );
  const offerVersion = readPositiveInteger(row.offerVersion, "offerVersion");

  if (outcome === "blocked") {
    if (row.blockReason !== "inventory_reserved") {
      throw contractError(
        "invalid_store_withdrawal_process_result",
        "Blocked withdrawals must identify inventory_reserved.",
      );
    }
    return {
      requestKey,
      offerKey,
      outcome,
      blockReason: "inventory_reserved",
      reservedQuantity: readPositiveInteger(
        row.reservedQuantity,
        "reservedQuantity",
      ),
      nextAttemptAt: readTimestamp(row.nextAttemptAt, "nextAttemptAt"),
      offerVersion,
    };
  }

  if (outcome !== "completed") {
    throw contractError(
      "invalid_store_withdrawal_process_result",
      "outcome must be blocked or completed.",
    );
  }

  const returnedQuantity = readNonNegativeInteger(
    row.returnedQuantity,
    "returnedQuantity",
  );
  const transactionKey = readNullablePattern(
    row.transactionKey,
    /^itx_[0-9a-f]{32}$/u,
    "transactionKey",
  );
  if ((returnedQuantity > 0) !== (transactionKey !== null)) {
    throw contractError(
      "invalid_store_withdrawal_process_result",
      "Completed transaction identity must match returned quantity.",
    );
  }
  const offerStatus = readOfferStatus(row.offerStatus);
  if (offerStatus === "withdrawal_pending") {
    throw contractError(
      "invalid_store_withdrawal_process_result",
      "Completed offers cannot remain withdrawal pending.",
    );
  }

  return {
    requestKey,
    offerKey,
    outcome,
    mode: readMode(row.mode),
    returnedQuantity,
    remainingListedQuantity: readNonNegativeInteger(
      row.remainingListedQuantity,
      "remainingListedQuantity",
    ),
    offerStatus,
    offerVersion,
    inventoryAccountKey: readPattern(
      row.inventoryAccountKey,
      /^iac_[0-9a-f]{32}$/u,
      "inventoryAccountKey",
    ),
    transactionKey,
    completedAt: readTimestamp(row.completedAt, "completedAt"),
  };
}


function readMode(value: unknown): StoreWithdrawalMode {
  if (value === "full" || value === "reduce") return value;
  throw contractError(
    "invalid_store_withdrawal_contract",
    "mode must be full or reduce.",
  );
}

function readRequestStatus(value: unknown): StoreWithdrawalRequestStatus {
  if (value === "pending" || value === "completed") return value;
  throw contractError(
    "invalid_store_withdrawal_contract",
    "requestStatus must be pending or completed.",
  );
}

function readOfferStatus(value: unknown): StoreWithdrawalOfferStatus {
  if (
    value === "draft" ||
    value === "active" ||
    value === "paused" ||
    value === "withdrawal_pending"
  ) return value;
  throw contractError(
    "invalid_store_withdrawal_contract",
    "offerStatus is invalid.",
  );
}
