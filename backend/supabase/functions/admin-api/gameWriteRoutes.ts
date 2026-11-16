import {
  corsHeaders,
  gameDto,
  json,
  number,
} from "./common.ts";
import { loadLogsPage, logsToCsv, updateAuditLogFlag } from "./logs.ts";
import {
  handleAttendancePlayerOperation,
  loadPlayerHistoryAudit,
} from "./attendancePlayerOperations.ts";
import { handleAdminContractReviewOperation } from "./contractReviewOperation.ts";
import { handleAdminContractRewardIssueOperation } from "./contractRewardIssueOperation.ts";
import { handleAdminPlayerAccessCodeResetOperation } from "./playerAccessCodeResetOperation.ts";
import type { AdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";


export async function handleGameWrite(
  request: Request,
  context: any,
  _url: URL,
  gameId: string,
  suffix: string,
  applicationContext: AdminRequestApplicationContext,
): Promise<Response | null> {
  if (["GET", "HEAD"].includes(request.method)) return null;
  const body = await request.clone().json().catch(() => ({}));
  const direct = await handleAttendancePlayerOperation(context.service, {
    gameSessionId: gameId,
    staffUserId: context.staff.id,
    path: `/games/${encodeURIComponent(gameId)}${suffix}`,
    method: request.method,
    body,
  });
  if (direct.handled) return json(request, direct.status, direct.body);

  const accessResetResponse = await handleAdminPlayerAccessCodeResetOperation(
    request,
    { applicationContext, gameSessionId: gameId, suffix },
  );
  if (accessResetResponse) return accessResetResponse;

  const contractReviewResponse = await handleAdminContractReviewOperation(
    request,
    context.service,
    { applicationContext, gameSessionId: gameId, suffix },
  );
  if (contractReviewResponse) return contractReviewResponse;

  const contractRewardResponse = await handleAdminContractRewardIssueOperation(
    request,
    context.service,
    { applicationContext, gameSessionId: gameId, suffix },
  );
  if (contractRewardResponse) return contractRewardResponse;

  if (suffix === "/attendance/exports" && request.method === "POST") {
    const params = new URLSearchParams();
    const filters = body.filters && typeof body.filters === "object"
      ? body.filters
      : body;
    for (
      const key of [
        "date",
        "period",
        "startDate",
        "endDate",
        "from",
        "to",
        "playerId",
        "status",
        "search",
      ]
    ) {
      const value = filters?.[key];
      if (value != null && String(value).trim()) {
        params.set(key, String(value).trim());
      }
    }
    const query = params.toString();
    const downloadPath = `/api/admin/games/${
      encodeURIComponent(gameId)
    }/attendance/export${query ? `?${query}` : ""}`;
    return json(request, 200, {
      data: {
        jobId: crypto.randomUUID(),
        status: "completed",
        exportType: "attendance",
        downloadPath,
        downloadUrl: downloadPath,
        fileName: `econovaria-attendance-${gameId}.csv`,
        createdAt: new Date().toISOString(),
      },
    });
  }

  if (
    ["/logs/exports", "/player-logs/exports"].includes(suffix) &&
    request.method === "POST"
  ) {
    return json(request, 200, {
      data: {
        jobId: crypto.randomUUID(),
        status: "completed",
        exportType: suffix.startsWith("/player-logs")
          ? "player_logs"
          : "admin_logs",
        downloadPath: `/api/admin/games/${
          encodeURIComponent(gameId)
        }/logs/export`,
        createdAt: new Date().toISOString(),
      },
    });
  }

  const logFlagMatch = suffix.match(/^\/(?:logs|player-logs)\/([^/]+)\/flag$/);
  if (logFlagMatch && ["POST", "PATCH", "DELETE"].includes(request.method)) {
    const auditLogId = decodeURIComponent(logFlagMatch[1]);
    const result = await updateAuditLogFlag(
      context.service,
      gameId,
      auditLogId,
      context.staff.id,
      request,
    );
    return result.found
      ? json(request, 200, {
        data: {
          auditLogId,
          flag: result.flag,
          flagged: result.flag?.status === "open",
        },
      })
      : json(request, 404, {
        code: "audit_log_not_found",
        message: "Audit-log event was not found for this game.",
      });
  }

  return null;
}
