"use strict";

const MAX_PATH_BYTES = 2_048;
const ALLOWED_PREFIXES = new Set([
  "/api/admin-session",
  "/api/admin",
  "/api/player-session",
  "/api/player"
]);

function canonicalCatchAllPath(rawUrl, prefix) {
  if (!ALLOWED_PREFIXES.has(prefix)) return "";

  let pathname;
  try {
    pathname = new URL(String(rawUrl || "/"), "https://proxy.invalid").pathname;
  } catch {
    return "";
  }

  if (pathname === prefix || !pathname.startsWith(`${prefix}/`)) return "";

  let decoded;
  try {
    decoded = decodeURIComponent(pathname.slice(prefix.length + 1));
  } catch {
    return "";
  }

  const parts = decoded.split("/");
  if (
    !decoded ||
    decoded.includes("\\") ||
    parts.includes("..") ||
    Buffer.byteLength(decoded, "utf8") > MAX_PATH_BYTES
  ) return "";

  return parts.filter(Boolean);
}

module.exports = { canonicalCatchAllPath };
