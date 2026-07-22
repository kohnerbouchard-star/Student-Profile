export const MARKETPLACE_RESERVATION_REASON = "marketplace_listing" as const;

export type InventoryReservationStatus = "active" | "consumed" | "released";
export type InventoryReservationSourceClass =
  | typeof MARKETPLACE_RESERVATION_REASON
  | "crafting_input"
  | "equipment_action"
  | "unknown";
export type MarketplaceReservationAction = "consume" | "release";
export type MarketplaceReservationErrorCode =
  | "MARKETPLACE_RESERVATION_INVALID"
  | "MARKETPLACE_RESERVATION_SOURCE_INVALID"
  | "MARKETPLACE_RESERVATION_SCOPE_MISMATCH"
  | "MARKETPLACE_RESERVATION_PROJECTION_INVALID"
  | "MARKETPLACE_RESERVATION_PROJECTION_DRIFT"
  | "MARKETPLACE_RESERVATION_STALE_VERSION"
  | "MARKETPLACE_RESERVATION_IDEMPOTENCY_CONFLICT"
  | "MARKETPLACE_RESERVATION_TRANSITION_INVALID"
  | "MARKETPLACE_RESERVATION_QUANTITY_UNAVAILABLE";

export class MarketplaceInventoryReservationError extends Error {
  constructor(
    readonly code: MarketplaceReservationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MarketplaceInventoryReservationError";
  }
}

export interface InventoryReservationScope {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly inventoryHoldingId: string;
}

export interface GenericInventoryReservationSnapshot extends InventoryReservationScope {
  readonly storeItemId: string;
  readonly itemKey: string;
  readonly reasonType: string;
  readonly sourceId: string;
  readonly quantity: number;
  readonly status: InventoryReservationStatus;
}

export interface MarketplaceReservationReceipt {
  readonly operationKey: string;
  readonly fingerprint: string;
  readonly action: MarketplaceReservationAction;
  readonly quantity: number;
  readonly resultingStatus: InventoryReservationStatus;
  readonly resultingQuantity: number;
  readonly resultingVersion: number;
}

export interface MarketplaceListingReservationState extends GenericInventoryReservationSnapshot {
  readonly reasonType: typeof MARKETPLACE_RESERVATION_REASON;
  readonly version: number;
  readonly receipts: readonly MarketplaceReservationReceipt[];
}

export interface MarketplaceReservationMutation {
  readonly action: MarketplaceReservationAction;
  readonly quantity: number;
  readonly expectedVersion: number;
  readonly operationKey: string;
  readonly releaseReason?: "listing_cancelled" | "listing_expired" | "listing_rejected" | "purchase_released";
}

export interface MarketplaceReservationMutationResult {
  readonly outcome: "applied" | "replayed";
  readonly state: MarketplaceListingReservationState;
  readonly receipt: MarketplaceReservationReceipt;
}

export interface InventoryReservationProjectionInput extends InventoryReservationScope {
  readonly quantityOwned: number;
  readonly quantityReservedProjection: number;
  readonly reservations: readonly GenericInventoryReservationSnapshot[];
}

export interface InventoryReservationProjectionReconciliation {
  readonly authoritativeReserved: number;
  readonly marketplaceReserved: number;
  readonly craftingReserved: number;
  readonly equipmentReserved: number;
  readonly unknownReserved: number;
  readonly projectionReserved: number;
  readonly drift: number;
  readonly availableQuantity: number;
  readonly activeReservationCount: number;
}

export interface MarketplaceInventoryReservationAdapter {
  reserve(input: {
    readonly scope: InventoryReservationScope;
    readonly storeItemId: string;
    readonly itemKey: string;
    readonly listingId: string;
    readonly quantity: number;
    readonly operationKey: string;
  }): Promise<MarketplaceListingReservationState>;
  consume(
    state: MarketplaceListingReservationState,
    input: Omit<MarketplaceReservationMutation, "action" | "releaseReason">,
  ): Promise<MarketplaceReservationMutationResult>;
  release(
    state: MarketplaceListingReservationState,
    input: Omit<MarketplaceReservationMutation, "action"> & {
      readonly releaseReason: NonNullable<MarketplaceReservationMutation["releaseReason"]>;
    },
  ): Promise<MarketplaceReservationMutationResult>;
  reconcile(input: InventoryReservationProjectionInput): Promise<InventoryReservationProjectionReconciliation>;
}

export function classifyInventoryReservationSource(reasonType: string): InventoryReservationSourceClass {
  switch (reasonType) {
    case MARKETPLACE_RESERVATION_REASON:
    case "crafting_input":
    case "equipment_action":
      return reasonType;
    default:
      return "unknown";
  }
}

export function reconcileInventoryReservationProjection(
  input: InventoryReservationProjectionInput,
): InventoryReservationProjectionReconciliation {
  assertScope(input);
  assertWholeNumber(input.quantityOwned, "quantityOwned", true);
  assertWholeNumber(input.quantityReservedProjection, "quantityReservedProjection", true);

  let marketplaceReserved = 0;
  let craftingReserved = 0;
  let equipmentReserved = 0;
  let unknownReserved = 0;
  let activeReservationCount = 0;

  for (const reservation of input.reservations) {
    assertReservation(reservation);
    assertSameScope(input, reservation);
    if (reservation.status !== "active") continue;

    activeReservationCount += 1;
    switch (classifyInventoryReservationSource(reservation.reasonType)) {
      case MARKETPLACE_RESERVATION_REASON:
        marketplaceReserved += reservation.quantity;
        break;
      case "crafting_input":
        craftingReserved += reservation.quantity;
        break;
      case "equipment_action":
        equipmentReserved += reservation.quantity;
        break;
      case "unknown":
        unknownReserved += reservation.quantity;
        break;
    }
  }

  const authoritativeReserved = marketplaceReserved + craftingReserved + equipmentReserved + unknownReserved;
  if (authoritativeReserved > input.quantityOwned) {
    throw new MarketplaceInventoryReservationError(
      "MARKETPLACE_RESERVATION_PROJECTION_INVALID",
      "Authoritative inventory reservations exceed owned quantity.",
    );
  }

  return {
    authoritativeReserved,
    marketplaceReserved,
    craftingReserved,
    equipmentReserved,
    unknownReserved,
    projectionReserved: input.quantityReservedProjection,
    drift: input.quantityReservedProjection - authoritativeReserved,
    availableQuantity: input.quantityOwned - authoritativeReserved,
    activeReservationCount,
  };
}

export function assertInventoryReservationProjectionReconciled(
  reconciliation: InventoryReservationProjectionReconciliation,
): void {
  if (reconciliation.drift !== 0) {
    throw new MarketplaceInventoryReservationError(
      "MARKETPLACE_RESERVATION_PROJECTION_DRIFT",
      "Inventory reservation projection does not match authoritative reservation rows.",
    );
  }
}

export function assertMarketplaceRefundInventoryAvailable(
  reconciliation: InventoryReservationProjectionReconciliation,
  refundQuantity: number,
): void {
  assertWholeNumber(refundQuantity, "refundQuantity");
  if (reconciliation.availableQuantity < refundQuantity) {
    throw new MarketplaceInventoryReservationError(
      "MARKETPLACE_RESERVATION_QUANTITY_UNAVAILABLE",
      "Refund inventory is reserved by an authoritative source.",
    );
  }
}

export function applyMarketplaceReservationMutation(
  state: MarketplaceListingReservationState,
  command: MarketplaceReservationMutation,
): MarketplaceReservationMutationResult {
  assertMarketplaceState(state);
  assertWholeNumber(command.quantity, "quantity");
  assertWholeNumber(command.expectedVersion, "expectedVersion");
  assertToken(command.operationKey, "operationKey");

  if (command.action === "release" && !command.releaseReason) {
    throw new MarketplaceInventoryReservationError(
      "MARKETPLACE_RESERVATION_INVALID",
      "Release reason is required.",
    );
  }

  const fingerprint = mutationFingerprint(command);
  const prior = state.receipts.find((receipt) => receipt.operationKey === command.operationKey);
  if (prior) {
    if (prior.fingerprint !== fingerprint) {
      throw new MarketplaceInventoryReservationError(
        "MARKETPLACE_RESERVATION_IDEMPOTENCY_CONFLICT",
        "Reservation operation key was reused with different input.",
      );
    }
    return { outcome: "replayed", state, receipt: prior };
  }

  if (command.expectedVersion !== state.version) {
    throw new MarketplaceInventoryReservationError(
      "MARKETPLACE_RESERVATION_STALE_VERSION",
      "Reservation version is stale.",
    );
  }
  if (state.status !== "active") {
    throw new MarketplaceInventoryReservationError(
      "MARKETPLACE_RESERVATION_TRANSITION_INVALID",
      "Only active Marketplace reservations may transition.",
    );
  }
  if (command.quantity > state.quantity) {
    throw new MarketplaceInventoryReservationError(
      "MARKETPLACE_RESERVATION_QUANTITY_UNAVAILABLE",
      "Reservation mutation exceeds the remaining authoritative quantity.",
    );
  }
  if (command.action === "release" && command.quantity !== state.quantity) {
    throw new MarketplaceInventoryReservationError(
      "MARKETPLACE_RESERVATION_TRANSITION_INVALID",
      "Cancellation, expiration, rejection, and purchase release must release the full remaining quantity.",
    );
  }

  const resultingVersion = state.version + 1;
  const resultingStatus: InventoryReservationStatus = command.action === "release"
    ? "released"
    : command.quantity === state.quantity
    ? "consumed"
    : "active";
  const resultingQuantity = resultingStatus === "active"
    ? state.quantity - command.quantity
    : state.quantity;
  const receipt: MarketplaceReservationReceipt = {
    operationKey: command.operationKey,
    fingerprint,
    action: command.action,
    quantity: command.quantity,
    resultingStatus,
    resultingQuantity,
    resultingVersion,
  };
  const next: MarketplaceListingReservationState = {
    ...state,
    quantity: resultingQuantity,
    status: resultingStatus,
    version: resultingVersion,
    receipts: [...state.receipts, receipt],
  };
  return { outcome: "applied", state: next, receipt };
}

function assertMarketplaceState(state: MarketplaceListingReservationState): void {
  assertReservation(state);
  if (state.reasonType !== MARKETPLACE_RESERVATION_REASON) {
    throw new MarketplaceInventoryReservationError(
      "MARKETPLACE_RESERVATION_SOURCE_INVALID",
      "Marketplace may mutate only Marketplace-owned reservation sources.",
    );
  }
  assertWholeNumber(state.version, "version");
  for (const receipt of state.receipts) {
    assertToken(receipt.operationKey, "receipt.operationKey");
    assertToken(receipt.fingerprint, "receipt.fingerprint");
  }
}

function assertReservation(reservation: GenericInventoryReservationSnapshot): void {
  assertScope(reservation);
  assertToken(reservation.storeItemId, "storeItemId");
  assertToken(reservation.itemKey, "itemKey");
  assertToken(reservation.reasonType, "reasonType");
  assertToken(reservation.sourceId, "sourceId");
  assertWholeNumber(reservation.quantity, "quantity");
  if (!["active", "consumed", "released"].includes(reservation.status)) {
    throw new MarketplaceInventoryReservationError(
      "MARKETPLACE_RESERVATION_INVALID",
      "Reservation status is invalid.",
    );
  }
}

function assertScope(scope: InventoryReservationScope): void {
  assertToken(scope.gameSessionId, "gameSessionId");
  assertToken(scope.playerId, "playerId");
  assertToken(scope.inventoryHoldingId, "inventoryHoldingId");
}

function assertSameScope(
  expected: InventoryReservationScope,
  actual: InventoryReservationScope,
): void {
  if (
    expected.gameSessionId !== actual.gameSessionId ||
    expected.playerId !== actual.playerId ||
    expected.inventoryHoldingId !== actual.inventoryHoldingId
  ) {
    throw new MarketplaceInventoryReservationError(
      "MARKETPLACE_RESERVATION_SCOPE_MISMATCH",
      "Reservation row does not belong to the requested game, player, and holding scope.",
    );
  }
}

function assertWholeNumber(value: number, field: string, allowZero = false): void {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new MarketplaceInventoryReservationError(
      "MARKETPLACE_RESERVATION_INVALID",
      `${field} must be a safe integer greater than or equal to ${minimum}.`,
    );
  }
}

function assertToken(value: string, field: string): void {
  if (typeof value !== "string" || value.length === 0 || value.length > 200 || value !== value.trim()) {
    throw new MarketplaceInventoryReservationError(
      "MARKETPLACE_RESERVATION_INVALID",
      `${field} is invalid.`,
    );
  }
}

function mutationFingerprint(command: MarketplaceReservationMutation): string {
  return [command.action, command.quantity, command.releaseReason ?? ""].join(":");
}
