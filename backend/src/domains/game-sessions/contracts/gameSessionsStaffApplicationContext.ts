import type { RequestApplicationContext } from "../../../shared/requestApplicationContext.ts";

export interface GameSessionsStaffActor {
  readonly kind: "staff";
  readonly staffUserId: string;
}

/**
 * Game Sessions' type-only view of a reviewed Staff application context.
 * Boundaries construct the context once; use cases and repositories preserve
 * that exact object until a narrow persistence adapter projects its scalars.
 */
export type GameSessionsStaffApplicationContext<
  TPermission extends string = string,
> =
  & RequestApplicationContext<
    GameSessionsStaffActor,
    "game_admin",
    TPermission
  >
  & {
    readonly assuranceLevel: "aal1" | "aal2" | "unknown";
  };
