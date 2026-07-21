import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { analyze } from "./analyze-traffic-export.mjs";

const root = process.cwd();

test("inventory audit passes", () => {
  const result = spawnSync(process.execPath, ["scripts/legacy-runtime/audit-live-runtime-inventory.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("browser transport ratchet passes current source", () => {
  const result = spawnSync(process.execPath, ["scripts/legacy-runtime/legacy-browser-transport-ratchet.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("traffic analyzer rejects windows over 24 hours", () => {
  assert.throws(() => analyze({ records: [], start: "2026-07-20T00:00:00Z", end: "2026-07-21T00:00:01Z" }), /24 hours/);
});

test("traffic analyzer blocks unknown legacy calls and redacts identity", () => {
  const result = analyze({ records: [{ timestamp: "2026-07-20T01:00:00Z", event_message: "GET https://example.invalid/functions/v1/server/admin", method: "GET", status_code: 401, user_agent: "private-agent", ip_hash: "raw-ip-should-not-return" }], start: "2026-07-20T00:00:00Z", end: "2026-07-21T00:00:00Z" });
  assert.equal(result.retirementBlocked, true);
  assert.equal(result.legacyRequests[0].classification, "unknown");
  assert.equal(JSON.stringify(result).includes("private-agent"), false);
  assert.equal(JSON.stringify(result).includes("raw-ip-should-not-return"), false);
});

test("auth probe defaults to plan-only and accepts no real credential", () => {
  const result = spawnSync(process.execPath, ["scripts/legacy-runtime/probe-auth-boundary.mjs", "--base-url", "https://example.invalid", "--runtime", "admin-api"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.mode, "plan-only");
  assert.equal(parsed.realCredentialsAccepted, false);
});

test("snapshot builder removes sensitive values and records input hashes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-snapshot-"));
  const supabase = path.join(dir, "provider-a.json");
  const cloudflare = path.join(dir, "provider-b.json");
  const out = path.join(dir, "out.json");
  fs.writeFileSync(supabase, JSON.stringify({ functions: [{ name: "server", token: "SENSITIVE_TEST_VALUE" }] }));
  fs.writeFileSync(cloudflare, JSON.stringify({ routes: [], authorization: "SENSITIVE_TEST_VALUE", secret_names: ["ORIGIN_SECRET"] }));
  const result = spawnSync(process.execPath, ["scripts/legacy-runtime/build-runtime-snapshot.mjs", "--supabase", supabase, "--cloudflare", cloudflare, "--out", out], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const snapshot = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(JSON.stringify(snapshot).includes("SENSITIVE_TEST_VALUE"), false);
  assert.equal(snapshot.inputs.supabaseSha256.length, 64);
  assert.deepEqual(snapshot.cloudflare.secret_names, ["ORIGIN_SECRET"]);
});
