import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import { resolveAttendanceRewardPolicyFromRepository } from "../application/resolveAttendanceRewardPolicy.ts";
import { SupabaseAttendanceRewardReadRepository } from "../infrastructure/supabaseAttendanceRewardReadRepository.ts";

export {
  calculateAttendanceRewardAmount,
  selectAttendanceIncomeModifier,
} from "../application/resolveAttendanceRewardPolicy.ts";
export type { AttendanceRewardPolicyResolution } from "../application/resolveAttendanceRewardPolicy.ts";

/** Compatibility composition boundary; callers retain their authorized client and scope. */
export function resolveAttendanceRewardPolicy(
  serviceClient: EdgeSupabaseClient,
  input: Parameters<typeof resolveAttendanceRewardPolicyFromRepository>[1],
) {
  return resolveAttendanceRewardPolicyFromRepository(
    new SupabaseAttendanceRewardReadRepository(serviceClient),
    input,
  );
}
