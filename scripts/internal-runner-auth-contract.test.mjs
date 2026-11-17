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
const nonceAuthorityReconciliation = read(
  "backend/supabase/migrations/20260921044500_reconcile_internal_runner_nonce_service_role_authority_v1.sql",
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

test("nonce replay ledger is private, service-role-only, and stores no raw nonce", () => {
  assert.ok(migration.includes("create schema if not exists private"));
  assert.ok(migration.includes("create table if not exists private.internal_runner_nonce_claims"));
  assert.ok(migration.includes("on private.internal_runner_nonce_claims (expires_at)"));
  assert.ok(migration.includes("delete from private.internal_runner_nonce_claims"));
  assert.ok(migration.includes("insert into private.internal_runner_nonce_claims"));
  assert.ok(migration.includes("set search_path = pg_catalog, private, public"));
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


test("nonce authority reconciliation uses database grants instead of JWT auth.role", () => {
  assert.ok(nonceAuthorityReconciliation.includes(
    "create or replace function public.claim_internal_runner_nonce_v2",
  ));
  assert.ok(nonceAuthorityReconciliation.includes("security definer"));
  assert.ok(nonceAuthorityReconciliation.includes(
    "set search_path = pg_catalog, private, public",
  ));
  assert.equal(nonceAuthorityReconciliation.includes("auth.role()"), false);
  assert.ok(nonceAuthorityReconciliation.includes(
    "from public, anon, authenticated",
  ));
  assert.ok(nonceAuthorityReconciliation.includes(
    "grant execute on function public.claim_internal_runner_nonce_v2",
  ));
  assert.ok(nonceAuthorityReconciliation.includes("to service_role"));
  assert.ok(nonceAuthorityReconciliation.includes(
    "on conflict on constraint internal_runner_nonce_claims_pkey do nothing",
  ));
});

test("timezone reconciliation patches runner fixture and case owners without changing registration", async () => {
  const reconciler = read("scripts/apply-configurable-stock-market-timezone-v1.mjs");
  const fixturePath = "backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.test.fixtures.support.ts";
  const casePath = "backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.test.authorizationAndPublication.cases.ts";
  const registrationPath = "backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.test.ts";
  const start = reconciler.indexOf(`await patch(\n  "${fixturePath}"`);
  const end = reconciler.indexOf("\nconst dashboardMarketStateSource", start);
  assert.ok(start >= 0 && end > start, "Missing explicit runner test patch owners");
  const guardStart = reconciler.indexOf("function replaceRequired(");
  const guardEnd = reconciler.indexOf("\nfunction replaceRegexRequired(", guardStart);
  assert.ok(guardStart >= 0 && guardEnd > guardStart);
  const apply = new (Object.getPrototypeOf(async function () {}).constructor)(
    "patch", reconciler.slice(guardStart, guardEnd) + reconciler.slice(start, end),
  );
  const expected = new Map([fixturePath, casePath, registrationPath].map((path) => [path, read(path)]));
  const sources = new Map(expected);
  sources.set(fixturePath, sources.get(fixturePath)
    .replace("  readonly readMarketOpenState?: () => Promise<boolean>;\n", "")
    .replace("    readMarketOpenState: options.readMarketOpenState ?? (async () => true),\n", ""));
  sources.set(casePath, sources.get(casePath).replace(
    "      readMarketOpenState: async () => false,",
    '      now: () => new Date("2026-07-19T00:00:00.000Z"),',
  ));
  const touched = [];
  const patch = async (path, transform) => {
    assert.ok(sources.has(path), `Unexpected runner patch target: ${path}`);
    touched.push(path);
    sources.set(path, transform(sources.get(path)));
  };
  await apply(patch);
  assert.deepEqual(sources, expected, "Reconciliation must restore all original assertions and fixtures exactly");
  assert.deepEqual(touched, [fixturePath, casePath]);
  await apply(patch);
  assert.deepEqual(sources, expected, "Reconciliation must be idempotent");
  for (const [broken, label] of [
    [expected.get(fixturePath).replace("  readonly readMarketOpenState?: () => Promise<boolean>;\n", "")
      .replace("  readonly now?: () => Date;", "  readonly unexpectedNow?: () => Date;"), "runner test market-state option"],
    [expected.get(fixturePath).replace("    readMarketOpenState: options.readMarketOpenState ?? (async () => true),\n", "")
      .replace("new Date(WALL_CLOCK_TIME)", "new Date(0)"), "runner test default market-state reader"],
  ]) {
    sources.set(fixturePath, broken);
    await assert.rejects(apply(patch), { message: `Patch anchor not found for ${label}.` });
  }
});
