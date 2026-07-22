export type PlayerCraftingRoute =
  | { readonly kind: "read" }
  | { readonly kind: "startJob" }
  | { readonly kind: "cancelJob"; readonly jobKey: string }
  | { readonly kind: "claimJob"; readonly jobKey: string }
  | { readonly kind: "useItem"; readonly itemKey: string }
  | { readonly kind: "equip"; readonly equipmentKey: string }
  | { readonly kind: "salvage"; readonly equipmentKey: string }
  | { readonly kind: "malformed" };

export interface StartCraftingJobCommand {
  readonly recipeKey: string;
  readonly quantity: number;
  readonly substitutions: Readonly<Record<string, string>>;
  readonly idempotencyKey: string;
}

export interface IdempotentCraftingCommand {
  readonly idempotencyKey: string;
}

export interface UseItemEffectCommand extends IdempotentCraftingCommand {
  readonly targetKey: string | null;
}

export interface EquipItemCommand extends IdempotentCraftingCommand {
  readonly slot: string;
}

export class PlayerCraftingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PlayerCraftingError";
  }
}

export interface PlayerCraftingRepository {
  read(input: {
    readonly gameId: string;
    readonly playerUuid: string;
  }): Promise<unknown>;
  startJob(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly command: StartCraftingJobCommand;
  }): Promise<unknown>;
  cancelJob(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly jobKey: string;
    readonly idempotencyKey: string;
  }): Promise<unknown>;
  claimJob(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly jobKey: string;
    readonly idempotencyKey: string;
  }): Promise<unknown>;
  useItem(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly itemKey: string;
    readonly targetKey: string | null;
    readonly idempotencyKey: string;
  }): Promise<unknown>;
  equip(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly equipmentKey: string;
    readonly slot: string;
    readonly idempotencyKey: string;
  }): Promise<unknown>;
  salvage(input: {
    readonly gameId: string;
    readonly playerUuid: string;
    readonly equipmentKey: string;
    readonly idempotencyKey: string;
  }): Promise<unknown>;
}
