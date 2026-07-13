import { handleAttendanceOperation } from "./attendanceOperations.ts";
import {
  handlePlayerOperation,
  loadPlayerHistoryAudit,
} from "./playerOperations.ts";

export { loadPlayerHistoryAudit };

export async function handleAttendancePlayerOperation(
  service: any,
  input: {
    gameSessionId: string;
    staffUserId: string;
    path: string;
    method: string;
    body: Record<string, any>;
  },
): Promise<any> {
  const attendance = await handleAttendanceOperation(service, input);
  if (attendance.handled) return attendance;
  return handlePlayerOperation(service, input);
}
