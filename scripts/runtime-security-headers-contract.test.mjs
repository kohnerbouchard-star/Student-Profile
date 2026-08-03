import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PRODUCTION_ORIGIN = "https://cgiukdjwicykrmtkhudh.supabase.co";
const STAGING_ORIGIN = "https://eecvbssdvarfcykcfrny.supabase.co";

test("Vercel security headers preserve routing and exact Supabase origins", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const rewrites = new Map(config.rewrites.map((entry) => [entry.source, entry.destination]));

  assert.equal(rewrites.get("/api/admin/:path*"), "/api/admin-proxy?path=:path*");
  assert.equal(rewrites.get("/api/player-session/:path*"), "/api/player-session-proxy?path=:path*");
  assert.equal(rewrites.get("/api/player/:path*"), "/api/player-proxy?path=:path*");

  const globalHeaders = config.headers.find((entry) => entry.source === "/(.*)");
  assert.ok(globalHeaders);
  const headers = new Map(globalHeaders.headers.map((entry) => [entry.key, entry.value]));
  const enforced = headers.get("Content-Security-Policy");
  const reportOnly = headers.get("Content-Security-Policy-Report-Only");

  for (const policy of [enforced, reportOnly]) {
    assert.match(policy, /script-src 'self'/u);
    assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/u);
    assert.doesNotMatch(policy, /https:\/\/\*\.supabase\.co/u);
    assert.doesNotMatch(policy, /wss:\/\/\*\.supabase\.co/u);
    assert.match(policy, new RegExp(PRODUCTION_ORIGIN.replaceAll(".", "\\."), "u"));
    assert.match(policy, new RegExp(STAGING_ORIGIN.replaceAll(".", "\\."), "u"));
  }

  assert.match(reportOnly, /require-trusted-types-for 'script'/u);
  assert.equal(
    headers.get("Strict-Transport-Security"),
    "max-age=63072000; includeSubDomains; preload",
  );
});
