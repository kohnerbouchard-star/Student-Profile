export interface AttendanceDailyReadResult<T> {
  readonly data: T | null;
  readonly error: unknown;
}

export interface AttendanceRecordRow {
  readonly id: string;
  readonly player_id: string;
  readonly attendance_date: string;
  readonly status: string;
  readonly clocked_in_at: string;
}

export interface AttendancePlayerRow {
  readonly id: string;
  readonly display_name: string;
  readonly roster_label: string | null;
  readonly status: string;
}

export interface StaffAttendanceDailyReadRepository {
  readWindow(
    gameSessionId: string,
  ): Promise<
    AttendanceDailyReadResult<{ readonly attendance_window?: unknown }>
  >;
  readPlayers(
    gameSessionId: string,
  ): Promise<AttendanceDailyReadResult<readonly AttendancePlayerRow[]>>;
  readRecords(
    gameSessionId: string,
    attendanceDate: string,
  ): Promise<AttendanceDailyReadResult<readonly AttendanceRecordRow[]>>;
}
