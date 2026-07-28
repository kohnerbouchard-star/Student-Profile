#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const CANONICAL_STAGING_PROJECT_REF = "eecvbssdvarfcykcfrny";
const PORT = Number(process.env.PORT || process.env.ECONOVARIA_PREVIEW_PORT || 4174);
const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const UPSTREAM_HOST_SUFFIX = ".supabase.co";
const MAX_REQUEST_TARGET_BYTES = 8_192;
const MAX_API_REQUEST_BYTES = 1_048_576;
const MAX_API_RESPONSE_BYTES = 1_048_576;
const MAX_STATIC_RESPONSE_BYTES = 32 * 1_048_576;
const API_TIMEOUT_MS = 180_000;
const INTERNAL_ALLOWED_ORIGIN = "http://127.0.0.1:4173";
const API_PREFIXES = ["/functions/v1/", "/auth/v1/"];
const WEB_SESSION_PREFIXES = [
  "/functions/v1/web-session-api",
  "/functions/v1/player-web-session-api",
  "/functions/v1/admin-logout-api",
];
const FORWARDED_IP_HEADERS = new Set([
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
  "client-ip",
  "forwarded",
  "true-client-ip",
  "x-client-ip",
]);
const REQUEST_HEADER_ALLOWLIST = new Map([
  ["accept", "Accept"],
  ["authorization", "Authorization"],
  ["content-type", "Content-Type"],
  ["apikey", "apikey"],
  ["x-econovaria-csrf-token", "X-Econovaria-Csrf-Token"],
  ["x-econovaria-device-id", "X-Econovaria-Device-Id"],
  ["x-econovaria-game-id", "X-Econovaria-Game-Id"],
  ["x-idempotency-key", "X-Idempotency-Key"],
  ["idempotency-key", "Idempotency-Key"],
  ["x-player-session-token", "X-Player-Session-Token"],
  ["x-request-id", "X-Request-Id"],
]);
const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SESSION_ENVELOPE = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{24,3900}$/;

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const projectRef = String(
  process.env.ECONOVARIA_PROJECT_REF || CANONICAL_STAGING_PROJECT_REF,
).trim();
const publishableKey = required("ECONOVARIA_SUPABASE_PUBLISHABLE_KEY");
const productionProjectRef = required("PRODUCTION_PROJECT_REF");
const upstreamHost = `${projectRef}${UPSTREAM_HOST_SUFFIX}`;

if (projectRef !== CANONICAL_STAGING_PROJECT_REF) {
  throw new Error("The preview is not bound to the repository-owned staging project.");
}
if (projectRef === productionProjectRef) {
  throw new Error("Production project selection is prohibited.");
}
if (!publishableKey.startsWith("sb_publishable_")) {
  throw new Error("A browser-safe Supabase publishable key is required.");
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
  throw new Error("The preview port must be a valid TCP port.");
}

function runtimeConfigSource() {
  return [
    "window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze({",
    '  environment: "staging",',
    `  projectRef: ${JSON.stringify(projectRef)},`,
    `  supabaseUrl: ${JSON.stringify(`https://${upstreamHost}`)},`,
    "  apiProxyUrl: window.location.origin,",
    `  supabasePublishableKey: ${JSON.stringify(publishableKey)}`,
    "});",
    "",
  ].join("\n");
}

function cleanPath(rawUrl) {
  try {
    return new URL(String(rawUrl || "/"), "http://preview.invalid").pathname;
  } catch {
    return "/";
  }
}

function isApiPath(pathname) {
  return API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isWebSessionPath(pathname) {
  return WEB_SESSION_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function sendJson(response, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(payload.length),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  response.end(payload);
}

function normalizedCookieHeader(value, pathname) {
  if (!isWebSessionPath(pathname)) return "";
  const allowed = pathname.startsWith("/functions/v1/player-web-session-api")
    ? new Set(["econovaria_player_session", "__Host-econovaria_player_session"])
    : new Set(["econovaria_admin_session", "__Host-econovaria_admin_session"]);
  for (const segment of String(value || "").split(";")) {
    const [rawName, ...rest] = segment.trim().split("=");
    const rawValue = rest.join("=").trim();
    if (!allowed.has(rawName) || !SESSION_ENVELOPE.test(rawValue)) continue;
    const localName = rawName.includes("player")
      ? "econovaria_player_session"
      : "econovaria_admin_session";
    return `${localName}=${rawValue}`;
  }
  return "";
}

function normalizedSetCookie(value) {
  const first = String(value || "").split(";", 1)[0];
  const separator = first.indexOf("=");
  if (separator <= 0) return "";
  const rawName = first.slice(0, separator).trim();
  const rawValue = first.slice(separator + 1).trim();
  const player = new Set([
    "econovaria_player_session",
    "__Host-econovaria_player_session",
  ]).has(rawName);
  const admin = new Set([
    "econovaria_admin_session",
    "__Host-econovaria_admin_session",
  ]).has(rawName);
  if (!player && !admin) return "";
  const localName = player ? "econovaria_player_session" : "econovaria_admin_session";
  if (!rawValue) {
    return `${localName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
  }
  if (!SESSION_ENVELOPE.test(rawValue)) return "";
  const maxAgeMatch = String(value).match(/(?:^|;)\s*Max-Age=(\d{1,5})(?:;|$)/i);
  const maxAge = Math.min(Number(maxAgeMatch?.[1] || 14_400), 28_800);
  return `${localName}=${rawValue}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function filteredRequestHeaders(incoming, pathname) {
  const headers = {};
  const prohibitedBearer = `Bearer ${publishableKey}`;
  for (const [name, rawValue] of Object.entries(incoming.headers)) {
    const lower = name.toLowerCase();
    if (FORWARDED_IP_HEADERS.has(lower)) continue;
    if (lower === "cookie") {
      const cookie = normalizedCookieHeader(rawValue, pathname);
      if (cookie) headers.Cookie = cookie;
      continue;
    }
    const canonical = REQUEST_HEADER_ALLOWLIST.get(lower);
    if (!canonical) continue;
    const value = Array.isArray(rawValue) ? rawValue[0] : String(rawValue || "");
    if (!value || /[\r\n\0]/.test(value) || Buffer.byteLength(value) > 8_192) continue;
    if (lower === "authorization" && value.trim() === prohibitedBearer) continue;
    headers[canonical] = value;
  }
  headers.Host = upstreamHost;
  headers["x-real-ip"] = "127.0.0.1";
  if (isWebSessionPath(pathname)) headers.Origin = INTERNAL_ALLOWED_ORIGIN;
  return headers;
}

function normalizedApiResponseHeaders(upstreamHeaders) {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  const contentType = String(upstreamHeaders["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  headers["Content-Type"] = new Map([
    ["application/json", "application/json; charset=utf-8"],
    ["application/problem+json", "application/problem+json; charset=utf-8"],
    ["application/octet-stream", "application/octet-stream"],
    ["text/csv", "text/csv; charset=utf-8"],
    ["text/plain", "text/plain; charset=utf-8"],
  ]).get(contentType) || "application/octet-stream";
  const retryAfter = String(upstreamHeaders["retry-after"] || "").trim();
  if (/^\d{1,5}$/.test(retryAfter) && Number(retryAfter) <= 86_400) {
    headers["Retry-After"] = retryAfter;
  }
  const requestId = String(upstreamHeaders["x-request-id"] || "").trim();
  if (SAFE_REQUEST_ID.test(requestId)) headers["X-Request-Id"] = requestId;
  const setCookies = Array.isArray(upstreamHeaders["set-cookie"])
    ? upstreamHeaders["set-cookie"]
    : upstreamHeaders["set-cookie"]
    ? [upstreamHeaders["set-cookie"]]
    : [];
  const safeCookies = setCookies.map(normalizedSetCookie).filter(Boolean);
  if (safeCookies.length) headers["Set-Cookie"] = safeCookies;
  return headers;
}

async function readIncomingBody(incoming) {
  const declared = Number(incoming.headers["content-length"] || 0);
  if (Number.isFinite(declared) && declared > MAX_API_REQUEST_BYTES) {
    throw Object.assign(new Error("request_body_too_large"), { status: 413 });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of incoming) {
    size += chunk.length;
    if (size > MAX_API_REQUEST_BYTES) {
      throw Object.assign(new Error("request_body_too_large"), { status: 413 });
    }
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}

async function proxyApi(incoming, outgoing, pathname) {
  if (incoming.method !== "OPTIONS" && String(incoming.headers.apikey || "") !== publishableKey) {
    sendJson(outgoing, 401, {
      code: "invalid_publishable_key",
      message: "The request did not include the configured publishable API key.",
    });
    return;
  }

  let body;
  try {
    body = await readIncomingBody(incoming);
  } catch (error) {
    sendJson(outgoing, error.status || 400, {
      code: error.message,
      message: "The request body exceeds the hosted preview limit.",
    });
    return;
  }

  const upstream = httpsRequest(
    {
      hostname: upstreamHost,
      port: 443,
      path: String(incoming.url || "/"),
      method: incoming.method,
      headers: filteredRequestHeaders(incoming, pathname),
      timeout: API_TIMEOUT_MS,
    },
    (upstreamResponse) => {
      const chunks = [];
      let size = 0;
      upstreamResponse.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_API_RESPONSE_BYTES) {
          upstream.destroy(new Error("upstream_response_too_large"));
          return;
        }
        chunks.push(chunk);
      });
      upstreamResponse.on("end", () => {
        const payload = Buffer.concat(chunks);
        const headers = normalizedApiResponseHeaders(upstreamResponse.headers);
        headers["Content-Length"] = String(payload.length);
        outgoing.writeHead(upstreamResponse.statusCode || 502, headers);
        if (incoming.method !== "HEAD") outgoing.end(payload);
        else outgoing.end();
      });
    },
  );

  upstream.on("timeout", () => upstream.destroy(new Error("upstream_timeout")));
  upstream.on("error", (error) => {
    if (outgoing.headersSent) {
      outgoing.destroy();
      return;
    }
    sendJson(outgoing, 502, {
      code: "preview_gateway_failed",
      message: error.message === "upstream_response_too_large"
        ? "The upstream API response exceeded the hosted preview limit."
        : "The hosted preview could not reach the staging API.",
    });
  });
  if (body) upstream.end(body);
  else upstream.end();
}

function safeStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.split("/").includes("..")) return null;
  const relative = decoded === "/"
    ? "index.html"
    : decoded.endsWith("/")
    ? `${decoded.slice(1)}index.html`
    : decoded.slice(1);
  const candidate = resolve(REPO_ROOT, relative);
  return candidate === REPO_ROOT || candidate.startsWith(`${REPO_ROOT}${sep}`)
    ? candidate
    : null;
}

async function serveStatic(incoming, outgoing, pathname) {
  if (!["GET", "HEAD"].includes(String(incoming.method || "GET").toUpperCase())) {
    sendJson(outgoing, 405, {
      code: "method_not_allowed",
      message: "Static preview resources support GET and HEAD only.",
    });
    return;
  }
  const filePath = safeStaticPath(pathname);
  if (!filePath) {
    sendJson(outgoing, 400, { code: "invalid_path", message: "The preview path is invalid." });
    return;
  }
  let metadata;
  try {
    metadata = await stat(filePath);
  } catch {
    sendJson(outgoing, 404, { code: "not_found", message: "The preview resource was not found." });
    return;
  }
  if (!metadata.isFile() || metadata.size > MAX_STATIC_RESPONSE_BYTES) {
    sendJson(outgoing, metadata.isFile() ? 413 : 404, {
      code: metadata.isFile() ? "static_resource_too_large" : "not_found",
      message: metadata.isFile()
        ? "The static preview resource exceeds the hosted preview limit."
        : "The preview resource was not found.",
    });
    return;
  }
  const headers = {
    "Content-Type": CONTENT_TYPES.get(extname(filePath).toLowerCase()) || "application/octet-stream",
    "Content-Length": String(metadata.size),
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  outgoing.writeHead(200, headers);
  if (incoming.method === "HEAD") {
    outgoing.end();
    return;
  }
  const stream = createReadStream(filePath);
  stream.on("error", () => outgoing.destroy());
  stream.pipe(outgoing);
}

const server = createServer(async (incoming, outgoing) => {
  if (Buffer.byteLength(String(incoming.url || "/")) > MAX_REQUEST_TARGET_BYTES) {
    sendJson(outgoing, 414, { code: "request_target_too_long", message: "The request target is too long." });
    return;
  }
  const pathname = cleanPath(incoming.url);
  if (pathname === "/_econovaria/preview-health") {
    sendJson(outgoing, 200, {
      ok: true,
      environment: "staging",
      projectRef,
      gateway: "same-origin-v2",
    });
    return;
  }
  if (pathname === "/runtime-config.env.js") {
    const payload = Buffer.from(runtimeConfigSource(), "utf8");
    outgoing.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Content-Length": String(payload.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    outgoing.end(payload);
    return;
  }
  if (isApiPath(pathname)) {
    await proxyApi(incoming, outgoing, pathname);
    return;
  }
  await serveStatic(incoming, outgoing, pathname);
});

server.requestTimeout = API_TIMEOUT_MS + 10_000;
server.headersTimeout = 30_000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Econovaria hosted staging preview is listening on port ${PORT}.`);
  console.log("Static assets and Supabase APIs are served through one bounded same-origin gateway.");
  console.log("Keep the forwarded port private.");
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
