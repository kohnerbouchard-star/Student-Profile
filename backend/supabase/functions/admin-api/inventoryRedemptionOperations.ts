import { handleCraftingOperation } from "./craftingOperations.ts";
import {
  handleInventoryRedemptionOperation as handleInventoryRedemptionCoreOperation,
  type InventoryRedemptionOperationResult,
} from "./inventoryRedemptionOperationsCore.ts";

export type { InventoryRedemptionOperationResult } from "./inventoryRedemptionOperationsCore.ts";

export async function handleInventoryRedemptionOperation(
  service: Parameters<typeof handleInventoryRedemptionCoreOperation>[0],
  input: Parameters<typeof handleInventoryRedemptionCoreOperation>[1],
): Promise<InventoryRedemptionOperationResult> {
  const crafting = await handleCraftingOperation(
    service as Parameters<typeof handleCraftingOperation>[0],
    input,
  );
  if (crafting.handled) return crafting;
  return handleInventoryRedemptionCoreOperation(service, input);
}
