import { number, object, text } from "./common.ts";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

function safeDateTime(value) {
  const normalized = text(value);
  if (!normalized) return "";
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function relatedPageFor(targetType) {
  const type = text(targetType).toLowerCase();
  if (type.includes("attendance")) return "Attendance";
  if (type.includes("contract")) return "Assignments";
  if (type.includes("store") || type.includes("inventory")) return "Store";
  if (type.includes("stock") || type.includes("market") || type.includes("trade")) return "Market";
  if (type.includes("player")) return "Players";
  if (type.includes("setting") || type.includes("difficulty")) return "Settings";
  return null;
}

function sanitizeSearch(value) {
  return text(value).replace(/[%_(),]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function csvCell(value) {
  const source = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${source.replace(/"/g, '""')}"`;
}

export async function loadLogsPage(service, gameId, staffId, url, options = {}) {
  const page = Math.max(1, Math.trunc(number(options.page ?? url.searchParams.get("page"), 1)));
  const requestedPageSize = Math.trunc(
    number(options.pageSize ?? url.searchParams.get("pageSize") ?? url.searchParams.get("limit"), DEFAULT_PAGE_SIZE),
  );
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, requestedPageSize));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const action = text(url.searchParams.get("action"));
  const actorType = text(url.searchParams.get("actorType"));
  const targetType = text(url.searchParams.get("targetType"));
  const search = sanitizeSearch(url.searchParams.get("search") || url.searchParams.get("q"));
  const startAt = safeDateTime(url.searchParams.get("startAt") || url.searchParams.get("from"));
  const endAt = safeDateTime(url.searchParams.get("endAt") || url.searchParams.get("to"));
  const flaggedOnly = ["1", "true", "yes"].includes(
    text(url.searchParams.get("flagged")).toLowerCase(),
  );

  let query = service
    .from("audit_log")
    .select("*", { count: "exact" })
    .eq("game_session_id", gameId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (action) query = query.eq("action", action);
  if (actorType) query = query.eq("actor_type", actorType);
  if (targetType) query = query.eq("target_type", targetType);
  if (search) query = query.ilike("action", `%${search}%`);
  if (startAt) query = query.gte("created_at", startAt);
  if (endAt) query = query.lte("created_at", endAt);

  const result = await query;
  if (result.error) throw result.error;
  let rows = result.data || [];

  const flagsByAuditId = new Map();
  if (rows.length) {
    const flags = await service
      .from("audit_log_flags")
      .select("id,audit_log_id,flagged_by_staff_user_id,reason,status,created_at,resolved_at")
      .eq("game_session_id", gameId)
      .in("audit_log_id", rows.map((row) => row.id))
      .order("created_at", { ascending: false });
    if (flags.error) throw flags.error;
    for (const flag of flags.data || []) {
      if (!flagsByAuditId.has(flag.audit_log_id)) {
        flagsByAuditId.set(flag.audit_log_id, flag);
      }
    }
  }

  rows = rows.map((row) => {
    const flag = flagsByAuditId.get(row.id) || null;
    const relatedPage = relatedPageFor(row.target_type);
    return {
      id: row.id,
      eventId: row.id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      type: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      metadata: object(row.metadata),
      relatedRecord: row.target_id
        ? { type: row.target_type, id: row.target_id, page: relatedPage }
        : null,
      relatedPage,
      flagged: flag?.status === "open",
      flag: flag
        ? {
            id: flag.id,
            status: flag.status,
            reason: flag.reason,
            flaggedByStaffUserId: flag.flagged_by_staff_user_id,
            createdAt: flag.created_at,
            resolvedAt: flag.resolved_at,
          }
        : null,
      canFlag: true,
      createdAt: row.created_at,
      timestamp: row.created_at,
    };
  });

  if (flaggedOnly) rows = rows.filter((row) => row.flagged);

  const total = number(result.count, rows.length);
  return {
    auditLogs: rows,
    logs: rows,
    total,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasNextPage: to + 1 < total,
      hasPreviousPage: page > 1,
    },
    filters: {
      action: action || null,
      actorType: actorType || null,
      targetType: targetType || null,
      search: search || null,
      startAt: startAt || null,
      endAt: endAt || null,
      flaggedOnly,
    },
    reviewStaffId: staffId,
  };
}

export function logsToCsv(rows) {
  const headers = [
    "Timestamp",
    "Action",
    "Actor Type",
    "Actor ID",
    "Target Type",
    "Target ID",
    "Flagged",
    "Flag Reason",
    "Metadata",
  ];
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows || []) {
    lines.push([
      row.createdAt,
      row.action,
      row.actorType,
      row.actorId,
      row.targetType,
      row.targetId,
      row.flagged ? "yes" : "no",
      row.flag?.reason || "",
      row.metadata || {},
    ].map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export async function updateAuditLogFlag(
  service,
  gameId,
  auditLogId,
  staffId,
  request,
) {
  const audit = await service
    .from("audit_log")
    .select("id")
    .eq("game_session_id", gameId)
    .eq("id", auditLogId)
    .maybeSingle();
  if (audit.error) throw audit.error;
  if (!audit.data) return { found: false, flag: null };

  let body = {};
  try {
    body = object(await request.json());
  } catch {
    body = {};
  }

  if (request.method === "DELETE") {
    const resolved = await service
      .from("audit_log_flags")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("game_session_id", gameId)
      .eq("audit_log_id", auditLogId)
      .eq("flagged_by_staff_user_id", staffId)
      .select("*")
      .maybeSingle();
    if (resolved.error) throw resolved.error;
    return { found: true, flag: resolved.data || null };
  }

  const requestedStatus = text(body.status).toLowerCase();
  const status = ["resolved", "dismissed"].includes(requestedStatus)
    ? requestedStatus
    : "open";
  const reason = text(body.reason || body.note || body.message) || null;
  const payload = {
    game_session_id: gameId,
    audit_log_id: auditLogId,
    flagged_by_staff_user_id: staffId,
    reason,
    status,
    resolved_at: status === "open" ? null : new Date().toISOString(),
  };

  const result = await service
    .from("audit_log_flags")
    .upsert(payload, {
      onConflict: "game_session_id,audit_log_id,flagged_by_staff_user_id",
    })
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;
  return { found: true, flag: result.data || null };
}
