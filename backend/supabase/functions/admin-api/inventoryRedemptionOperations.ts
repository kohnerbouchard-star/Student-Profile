import { handleCraftingOperation } from "./craftingOperations.ts";
import type { AdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";
import {
  handleInventoryRedemptionOperation as handleInventoryRedemptionCoreOperation,
  type InventoryRedemptionOperationResult,
} from "./inventoryRedemptionOperationsCore.ts";

export type { InventoryRedemptionOperationResult } from "./inventoryRedemptionOperationsCore.ts";

export interface AdminInventoryRedemptionOperationInput {
  readonly request: Request;
  readonly applicationContext: AdminRequestApplicationContext;
  readonly suffix: string;
}

export async function handleInventoryRedemptionOperation(
  service: Parameters<typeof handleInventoryRedemptionCoreOperation>[0],
  input: AdminInventoryRedemptionOperationInput,
): Promise<InventoryRedemptionOperationResult> {
  const scopedInput: Parameters<
    typeof handleInventoryRedemptionCoreOperation
  >[1] = {
    request: input.request,
    gameId: input.applicationContext.gameSessionId,
    staffUserId: input.applicationContext.actor.staffUserId,
    suffix: input.suffix,
  };
  const crafting = await handleCraftingOperation(
    service as Parameters<typeof handleCraftingOperation>[0],
    scopedInput,
  );
  if (crafting.handled) return crafting;
  return handleInventoryRedemptionCoreOperation(service, scopedInput);
}
