/**
 * Game Sessions' type-only view of a reviewed Staff application context.
 * Boundaries construct the context once; use cases and repositories preserve
 * that exact object until a narrow persistence adapter projects its scalars.
 */
export type {
  StaffRequestApplicationActor as GameSessionsStaffActor,
  StaffRequestApplicationContext as GameSessionsStaffApplicationContext,
} from "../../../shared/staffRequestApplicationContext.ts";
