import type { RequestApplicationContext } from "./requestApplicationContext.ts";

export interface StaffRequestApplicationActor {
  readonly kind: "staff";
  readonly staffUserId: string;
}

export type StaffRequestAssuranceLevel = "aal1" | "aal2" | "unknown";

/**
 * Neutral type-only view of a reviewed, game-scoped Staff request context.
 * Authentication boundaries construct it once after Staff and owned-game
 * authority are established; domain consumers preserve that exact object.
 */
export type StaffRequestApplicationContext<
  TPermission extends string = string,
> =
  & RequestApplicationContext<
    StaffRequestApplicationActor,
    "game_admin",
    TPermission
  >
  & {
    readonly assuranceLevel: StaffRequestAssuranceLevel;
  };
