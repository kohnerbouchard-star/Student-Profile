export interface ReservationState {
  readonly owned: number;
  readonly reserved: number;
  readonly consumed: number;
  readonly granted: number;
  readonly status: "active" | "released" | "consumed";
}

export interface CraftingInvariantState {
  readonly inputs: Readonly<Record<string, ReservationState>>;
  readonly claimKey: string | null;
  readonly cancellationKey: string | null;
  readonly outputQuantity: number;
  readonly jobStatus: "in_progress" | "claimed" | "cancelled";
}

export type CraftingInvariantCommand =
  | { readonly kind: "claim"; readonly idempotencyKey: string }
  | { readonly kind: "cancel"; readonly idempotencyKey: string };

export function applyCraftingInvariantCommand(
  state: CraftingInvariantState,
  command: CraftingInvariantCommand,
): CraftingInvariantState {
  if (command.kind === "claim") {
    if (state.claimKey === command.idempotencyKey) return state;
    if (state.claimKey || state.cancellationKey || state.jobStatus !== "in_progress") {
      throw new Error("claim_conflict");
    }
    const inputs: Record<string, ReservationState> = {};
    for (const [key, input] of Object.entries(state.inputs)) {
      if (input.status !== "active" || input.reserved <= 0 || input.owned < input.reserved) {
        throw new Error("reservation_invariant");
      }
      inputs[key] = {
        ...input,
        owned: input.owned - input.reserved,
        consumed: input.consumed + input.reserved,
        reserved: 0,
        status: "consumed",
      };
    }
    return {
      ...state,
      inputs,
      claimKey: command.idempotencyKey,
      outputQuantity: state.outputQuantity + 1,
      jobStatus: "claimed",
    };
  }

  if (state.cancellationKey === command.idempotencyKey) return state;
  if (state.claimKey || state.cancellationKey || state.jobStatus !== "in_progress") {
    throw new Error("cancel_conflict");
  }
  const inputs: Record<string, ReservationState> = {};
  for (const [key, input] of Object.entries(state.inputs)) {
    if (input.status !== "active" || input.reserved < 0 || input.owned < input.reserved) {
      throw new Error("reservation_invariant");
    }
    inputs[key] = {
      ...input,
      reserved: 0,
      status: "released",
    };
  }
  return {
    ...state,
    inputs,
    cancellationKey: command.idempotencyKey,
    jobStatus: "cancelled",
  };
}

export function assertCraftingInventoryInvariant(state: CraftingInvariantState): void {
  for (const input of Object.values(state.inputs)) {
    if (
      !Number.isSafeInteger(input.owned) || !Number.isSafeInteger(input.reserved) ||
      input.owned < 0 || input.reserved < 0 || input.reserved > input.owned ||
      input.consumed < 0 || input.granted < 0
    ) throw new Error("inventory_invariant");
  }
  if (state.outputQuantity < 0 || state.outputQuantity > 1) throw new Error("exactly_once_output");
}
