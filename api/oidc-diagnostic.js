"use strict";

module.exports = function oidcDiagnostic(request, response) {
  const token = String(request.headers?.["x-vercel-oidc-token"] || "").trim();
  let payload = null;
  if (token) {
    try {
      const segment = token.split(".")[1] || "";
      const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    } catch (_) {
      payload = null;
    }
  }

  response.statusCode = token && payload ? 200 : 503;
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify({
    ok: Boolean(token && payload),
    issuer: typeof payload?.iss === "string" ? payload.iss : null,
    audience: typeof payload?.aud === "string" ? payload.aud : null,
    subject: typeof payload?.sub === "string" ? payload.sub : null,
    ownerId: typeof payload?.owner_id === "string" ? payload.owner_id : null,
    projectId: typeof payload?.project_id === "string" ? payload.project_id : null,
    environment: typeof payload?.environment === "string" ? payload.environment : null
  }));
};
