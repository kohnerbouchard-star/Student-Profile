import type { RequestApplicationContext } from "../../../shared/requestApplicationContext.ts";

export interface PlayerInventoryApplicationActor {
  readonly kind: "player";
  readonly playerUuid: string;
  readonly playerSessionId: string;
}

/**
 * Inventory's type-only view of the canonical Player application context.
 * The context is constructed by the Player boundary and passed by reference;
 * Inventory never creates a second runtime authority object.
 */
export type PlayerInventoryApplicationContext = RequestApplicationContext<
  PlayerInventoryApplicationActor,
  "player",
  "own_player"
>;
