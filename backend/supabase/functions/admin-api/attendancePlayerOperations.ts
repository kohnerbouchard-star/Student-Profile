import { handleAttendanceOperation } from "./attendanceOperations.ts";
import { handleIdempotentLedgerOperation } from "./idempotentLedgerOperations.ts";
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
  const ledger = await handleIdempotentLedgerOperation(service, input);
  if (ledger.handled) return ledger;
  const attendance = await handleAttendanceOperation(service, input);
  if (attendance.handled) return attendance;
  return handlePlayerOperation(service, input);
}
