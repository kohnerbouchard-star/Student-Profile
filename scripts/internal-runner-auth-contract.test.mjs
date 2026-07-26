import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const auth = read("backend/src/security/internalRunnerAuth.ts");
const entrypoint = read("backend/supabase/functions/stock-market-runner/index.ts");
const trigger = read("scripts/trigger-stock-market-tick.mjs");
const migration = read(
  "backend/supabase/migrations/20260726097000_add_internal_runner_nonce_replay_v2.sql",
);

test("stock runner network boundary requires timestamped project-bound HMAC", () => {
  for (const contract of [
    "econovaria-internal-runner-v1",
    "x-econovaria-runner-timestamp",
    "x-econovaria-runner-nonce",
    "x-econovaria-runner-signature",
    "origin:${url.origin}",
    "path:${url.pathname}${url.search}",
    "body-sha256:${input.bodyHash.toLowerCase()}",
    "crypto.subtle.verify",
    "stale_internal_runner_signature",
    "internal_runner_replay_denied",
  ]) {
    assert.ok(auth.includes(contract), `Missing signed-runner contract: ${contract}`);
  }
  assert.ok(
    auth.includes("request.headers.has(options.internalSecretHeader)"),
    "Legacy raw-secret requests are not rejected before signature validation.",
  );
});

test("stock runner claims a persistent nonce before invoking the mutation handler", () => {
  assert.ok(entrypoint.includes("authorizeInternalRunnerRequest"));
  assert.ok(entrypoint.includes('runnerName: "stock-market-runner"'));
  assert.ok(entrypoint.includes('"claim_internal_runner_nonce_v2"'));
  assert.ok(entrypoint.indexOf("authorizeInternalRunnerRequest") <
    entrypoint.indexOf("handleStockMarketRunnerRequest(authorization.request"));
  assert.ok(entrypoint.includes("if (error) throw new Error"));
  assert.ok(entrypoint.includes("return data === true"));
});

test("scheduler sends signatures without transmitting the runner secret", () => {
  assert.ok(trigger.includes("createHmac"));
  assert.ok(trigger.includes("randomUUID"));
  assert.ok(trigger.includes("x-econovaria-runner-timestamp"));
  assert.ok(trigger.includes("x-econovaria-runner-nonce"));
  assert.ok(trigger.includes("x-econovaria-runner-signature"));
  assert.ok(trigger.includes('digest("base64url")'));
  assert.equal(
    trigger.includes('"x-stock-market-runner-secret": runnerSecret'),
    false,
  );
});

test("nonce replay ledger is service-role-only and stores no raw nonce", () => {
  assert.ok(migration.includes("create table if not exists public.internal_runner_nonce_claims"));
  assert.ok(migration.includes("nonce_hash text not null"));
  assert.equal(/\bnonce\s+text\b/i.test(migration), false);
  assert.ok(migration.includes("enable row level security"));
  assert.ok(migration.includes("force row level security"));
  assert.ok(migration.includes("from public, anon, authenticated, service_role"));
  assert.ok(migration.includes("auth.role() <> 'service_role'"));
  assert.ok(migration.includes("on conflict on constraint internal_runner_nonce_claims_pkey do nothing"));
  assert.ok(migration.includes("grant execute on function public.claim_internal_runner_nonce_v2"));
  assert.ok(migration.includes("to service_role"));
});
