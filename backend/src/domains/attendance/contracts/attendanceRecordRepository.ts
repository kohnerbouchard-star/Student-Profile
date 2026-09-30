import type { AdminMutationIdentity } from "../../../platform/supabase/adminMutation.ts";

export interface AttendancePlayerRecord {
  readonly id: string;
  readonly display_name: string;
  readonly roster_label: string | null;
  readonly player_identifier: string | null;
  readonly status: string;
}

export interface AttendanceMutationCommand {
  readonly gameSessionId: string;
  readonly staffUserId: string;
  readonly operation: "manual" | "scan";
  readonly playerId: string;
  readonly attendanceDate: string;
  readonly status: string;
  readonly clockedInAt: string | null;
  readonly note: string | null;
  readonly rewardAmount: number | null;
  readonly currencyCode: string | null;
  readonly responseContext: Record<string, unknown>;
  readonly requestPayload: Record<string, unknown>;
  readonly identity: AdminMutationIdentity;
}

export interface AttendanceMutationReceipt {
  readonly status: number;
  readonly replayed: boolean;
  readonly attendance: Record<string, unknown>;
  readonly context: Record<string, unknown>;
}

export interface AttendanceRecordRepository {
  readScanReplay(input: {
    readonly gameSessionId: string;
    readonly staffUserId: string;
    readonly requestPayload: Record<string, unknown>;
    readonly identity: AdminMutationIdentity;
  }): Promise<AttendanceMutationReceipt | null>;

  readPlayerForScan(input: {
    readonly gameSessionId: string;
    readonly scannedValue: string;
    readonly normalizedIdentifier: string;
    readonly currentLookupDigest: string;
    readonly hashLegacyValue: (value: string) => Promise<string>;
  }): Promise<AttendancePlayerRecord | null>;

  readAttendanceWindow(gameSessionId: string): Promise<unknown>;

  record(input: AttendanceMutationCommand): Promise<AttendanceMutationReceipt>;
}
