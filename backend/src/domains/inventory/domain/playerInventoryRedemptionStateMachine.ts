import type { PlayerInventoryRedemptionStatus } from "../contracts/playerInventoryRedemptionContracts.ts";

export const PLAYER_INVENTORY_REDEMPTION_TRANSITIONS: Readonly<
  Record<
    PlayerInventoryRedemptionStatus,
    readonly PlayerInventoryRedemptionStatus[]
  >
> = {
  pending: ["approved", "rejected"],
  approved: ["rejected", "fulfilled"],
  rejected: [],
  fulfilled: [],
};

export type PlayerInventoryReservationDisposition =
  | "reserve"
  | "retain"
  | "release"
  | "consume_once";

/**
 * Redemption reservations are created with pending requests, retained on
 * approval, released on rejection, and consumed exactly once on fulfillment.
 */
export function reservationDispositionForTransition(
  from: PlayerInventoryRedemptionStatus | null,
  to: PlayerInventoryRedemptionStatus,
): PlayerInventoryReservationDisposition | null {
  if (from === null && to === "pending") return "reserve";
  if (from === "pending" && to === "approved") return "retain";
  if ((from === "pending" || from === "approved") && to === "rejected") {
    return "release";
  }
  if (from === "approved" && to === "fulfilled") return "consume_once";
  return null;
}

export function canTransitionPlayerInventoryRedemption(
  from: PlayerInventoryRedemptionStatus,
  to: PlayerInventoryRedemptionStatus,
): boolean {
  return PLAYER_INVENTORY_REDEMPTION_TRANSITIONS[from].includes(to);
}
