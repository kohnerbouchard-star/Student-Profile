window.createAdminRequestNormalization = function createAdminRequestNormalization(ownerScope) {
  "use strict";

  const { LOCAL_API_PREFIX, ADMIN_BFF_BASE, jsonResponse } = ownerScope;


  function buildAdminApiUrl(localUrl) {
    const suffix = localUrl.pathname.slice(LOCAL_API_PREFIX.length) || "/";
    return `${ADMIN_BFF_BASE}${suffix}${localUrl.search}`;
  }

  async function readJsonBody(request) {
    if (["GET", "HEAD"].includes(request.method)) return {};
    try {
      const value = await request.clone().json();
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    } catch (_) {
      return {};
    }
  }

  function requestBody(body) {
    return JSON.stringify(body || {});
  }

  function csvCell(value) {
    const source = typeof value === "string"
      ? value
      : JSON.stringify(value ?? "");
    return `"${source.replace(/"/g, '""')}"`;
  }

  function createCompletedDownloadJob(text, filename, contentType = "text/csv;charset=utf-8") {
    const blob = new Blob([text], { type: contentType });
    const downloadUrl = URL.createObjectURL(blob);
    return jsonResponse(200, {
      data: {
        id: crypto.randomUUID(),
        jobId: crypto.randomUUID(),
        status: "completed",
        filename,
        downloadUrl,
        completedAt: new Date().toISOString()
      }
    });
  }

  function attendanceRowsToCsv(rows) {
    const headers = [
      "Attendance Date",
      "Player",
      "Roster Label",
      "Status",
      "Clocked In At",
      "Source",
      "Reward Amount",
      "Currency"
    ];
    const lines = [headers.map(csvCell).join(",")];
    for (const row of rows || []) {
      lines.push([
        row.attendanceDate,
        row.displayName,
        row.rosterLabel,
        row.status,
        row.clockedInAt,
        row.source,
        row.rewardAmount,
        row.rewardCurrencyCode
      ].map(csvCell).join(","));
    }
    return `\uFEFF${lines.join("\r\n")}`;
  }

  async function normalizeAdminRequest(request, localUrl) {
    const originalPath = localUrl.pathname;
    const normalizedUrl = new URL(localUrl.href);
    let method = request.method || "GET";
    let body = ["GET", "HEAD"].includes(method)
      ? undefined
      : await request.clone().arrayBuffer();
    let adaptResponse = null;
    let immediateResponse = null;

    const gamePrefix = `${LOCAL_API_PREFIX}/games/([^/]+)`;
    let match = originalPath.match(
      new RegExp(`^${gamePrefix}/contracts/([^/]+)/(archive|duplicate)$`)
    );
    if (match && method === "POST") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/contracts`;
      body = requestBody({
        adminOperation: match[3] === "archive"
          ? "archive-contract"
          : "duplicate-contract",
        contractId: decodeURIComponent(match[2])
      });
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/contracts/([^/]+)/submissions$`)
    );
    if (match && method === "GET") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/contracts/${match[2]}/progress`;
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/contracts/([^/]+)/submissions/([^/]+)/review$`)
    );
    if (match && method === "PATCH") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/contracts/${match[2]}/progress/${match[3]}/review`;
      method = "POST";
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/store/items/([^/]+)/status$`)
    );
    if (match && method === "PATCH") {
      const source = await readJsonBody(request);
      const status = source.status || source.itemStatus ||
        (source.active === true ? "active" : source.active === false ? "disabled" : undefined) ||
        (source.paused === true ? "disabled" : source.paused === false ? "active" : undefined);
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/store/items/${match[2]}`;
      body = requestBody({
        ...source,
        ...(status ? { status } : {})
      });
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/store/items/([^/]+)/(restock|rebalance-price)$`)
    );
    if (match && method === "POST") {
      const source = await readJsonBody(request);
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/store/items/${match[2]}`;
      method = "PATCH";
      body = requestBody({
        ...source,
        adminOperation: match[3] === "restock"
          ? "restock-store-item"
          : "rebalance-store-price",
        itemId: decodeURIComponent(match[2])
      });
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/settings/difficulty$`)
    );
    if (match && ["PUT", "PATCH", "POST"].includes(method)) {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/settings`;
      method = "PATCH";
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/settings/([^/]+)/reset$`)
    );
    if (match && method === "POST") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/settings`;
      method = "PATCH";
      body = requestBody({
        adminOperation: "reset-settings-group",
        group: decodeURIComponent(match[2])
      });
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/settings/([^/]+)$`)
    );
    if (match && method === "PATCH" && match[2] !== "audit") {
      const source = await readJsonBody(request);
      const group = decodeURIComponent(match[2]).toLowerCase();
      const values = source.values && typeof source.values === "object"
        ? source.values
        : source;
      const grouped = {
        attendance: { attendanceWindow: values },
        business: { businessMarketWindow: values },
        "business-market": { businessMarketWindow: values },
        stocks: { stockMarketWindow: values },
        "stock-market": { stockMarketWindow: values },
        news: { newsSchedule: values },
        difficulty: values
      };
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/settings`;
      body = requestBody(grouped[group] || values);
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/logs/exports$`)
    );
    if (match && method === "POST") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/logs/export`;
      method = "GET";
      body = undefined;
      adaptResponse = async (response) => {
        if (!response.ok) return response;
        const csv = await response.text();
        return createCompletedDownloadJob(
          csv,
          `econovaria-audit-log-${decodeURIComponent(match[1])}.csv`
        );
      };
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/logs/([^/]+)/related-record$`)
    );
    if (match && method === "GET") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/logs`;
      normalizedUrl.searchParams.set("eventId", decodeURIComponent(match[2]));
      adaptResponse = async (response) => {
        if (!response.ok) return response;
        const payload = await response.json();
        const log = payload?.data?.logs?.[0] || null;
        return jsonResponse(log ? 200 : 404, log
          ? { data: { eventId: log.id, relatedRecord: log.relatedRecord, log } }
          : { code: "audit_log_not_found", message: "Audit-log event was not found." });
      };
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/attendance/exports$`)
    );
    if (match && method === "POST") {
      const source = await readJsonBody(request);
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/attendance/history`;
      normalizedUrl.search = "";
      normalizedUrl.searchParams.set("page", "1");
      normalizedUrl.searchParams.set("pageSize", "200");
      for (const key of ["startDate", "endDate", "playerId", "status"]) {
        if (source[key]) normalizedUrl.searchParams.set(key, String(source[key]));
      }
      if (source.date) {
        normalizedUrl.searchParams.set("startDate", String(source.date));
        normalizedUrl.searchParams.set("endDate", String(source.date));
      }
      method = "GET";
      body = undefined;
      adaptResponse = async (response) => {
        if (!response.ok) return response;
        const payload = await response.json();
        const rows = payload?.data?.attendanceHistory || payload?.data?.rows || [];
        return createCompletedDownloadJob(
          attendanceRowsToCsv(rows),
          `econovaria-attendance-${decodeURIComponent(match[1])}.csv`
        );
      };
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/players/([^/]+)/access-code$`)
    );
    if (match && method === "GET") {
      immediateResponse = jsonResponse(409, {
        code: "player_access_code_not_recoverable",
        message: "Existing player access codes are stored only as hashes. Reset the code to reveal a replacement once.",
        data: {
          playerId: decodeURIComponent(match[2]),
          accessCode: null,
          canReset: true,
          resetRequired: true
        }
      });
    }

    match = originalPath.match(
      new RegExp(`^${gamePrefix}/players/([^/]+)$`)
    );
    if (match && method === "GET") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/players`;
      adaptResponse = async (response) => {
        if (!response.ok) return response;
        const payload = await response.json();
        const playerId = decodeURIComponent(match[2]);
        const player = (payload?.data?.players || []).find((item) => String(item.id) === playerId) || null;
        return jsonResponse(player ? 200 : 404, player
          ? { data: { player, profile: player } }
          : { code: "player_not_found", message: "Player was not found." });
      };
    } else if (match && method === "DELETE") {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/games/${match[1]}/players`;
      method = "POST";
      body = requestBody({
        adminOperation: "archive-player",
        playerId: decodeURIComponent(match[2])
      });
    }

    if (/^\/api\/admin\/help\/(attendance|market|players|start-game|store|troubleshooting)$/.test(originalPath)) {
      normalizedUrl.pathname = `${LOCAL_API_PREFIX}/help/admin-console`;
    }

    return {
      localUrl: normalizedUrl,
      method,
      body,
      adaptResponse,
      immediateResponse
    };
  }

  return {
    buildAdminApiUrl, readJsonBody, requestBody, csvCell, createCompletedDownloadJob,
    attendanceRowsToCsv, normalizeAdminRequest,
  };
};
