import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import type {
  AttendanceDailyReadResult,
  AttendancePlayerRow,
  AttendanceRecordRow,
  StaffAttendanceDailyReadRepository,
} from "../contracts/staffAttendanceDailyReadRepository.ts";

export class SupabaseStaffAttendanceDailyReadRepository
  implements StaffAttendanceDailyReadRepository {
  constructor(private readonly serviceClient: EdgeSupabaseClient) {}

  async readWindow(
    gameSessionId: string,
  ): Promise<
    AttendanceDailyReadResult<{ readonly attendance_window?: unknown }>
  > {
    return await this.serviceClient.from("game_settings")
      .select("attendance_window")
      .eq("game_session_id", gameSessionId)
      .maybeSingle() as AttendanceDailyReadResult<
        { readonly attendance_window?: unknown }
      >;
  }

  async readPlayers(
    gameSessionId: string,
  ): Promise<AttendanceDailyReadResult<readonly AttendancePlayerRow[]>> {
    return await this.serviceClient.from("players")
      .select("id,display_name,roster_label,status")
      .eq("game_session_id", gameSessionId)
      .eq("status", "active")
      .order("display_name", { ascending: true }) as AttendanceDailyReadResult<
        readonly AttendancePlayerRow[]
      >;
  }

  async readRecords(
    gameSessionId: string,
    attendanceDate: string,
  ): Promise<AttendanceDailyReadResult<readonly AttendanceRecordRow[]>> {
    return await this.serviceClient.from("player_attendance_records")
      .select("id,player_id,attendance_date,status,clocked_in_at")
      .eq("game_session_id", gameSessionId)
      .eq("attendance_date", attendanceDate)
      .order("clocked_in_at", { ascending: true }) as AttendanceDailyReadResult<
        readonly AttendanceRecordRow[]
      >;
  }
}
