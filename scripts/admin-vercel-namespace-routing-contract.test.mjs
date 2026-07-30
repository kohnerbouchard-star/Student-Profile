import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), "utf8");

test("all nested production Admin routes rewrite to one signed BFF proxy", async () => {
  const config = JSON.parse(await read("vercel.json"));
  const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
  const adminRewrite = rewrites.find(
    (entry) => entry?.source === "/api/admin/:path*",
  );

  assert.deepEqual(adminRewrite, {
    source: "/api/admin/:path*",
    destination: "/api/admin-proxy?path=:path*",
  });
});

test("Admin namespace proxy preserves the signed security boundary", async () => {
  const source = await read("api/admin-proxy.js");

  assert.match(source, /require\("\.\/_admin-bff-proxy\.js"\)/);
  assert.match(source, /proxyAdminBff\(normalizedRequest, response, \{ proxyAdmin: true \}\)/);
  assert.match(source, /typeof path !== "string"/);
  assert.match(source, /invalid_proxy_path/);
  assert.match(source, /Cache-Control", "private, no-store, max-age=0"/);
  assert.doesNotMatch(source, /supabase\.co|functions\/v1|Authorization|Bearer|service_role/i);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});
