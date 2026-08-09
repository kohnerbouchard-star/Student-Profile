import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const orchestrator = await readFile(
  new URL("../backend/supabase/functions/stock-market-orchestrator/index.ts", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL("../backend/supabase/migrations/20260810073000_add_stock_market_runtime_scheduler_v1.sql", import.meta.url),
  "utf8",
);
const workflow = await readFile(
  new URL("../.github/workflows/stock-market-runtime-scheduler.yml", import.meta.url),
  "utf8",
);

test("orchestrator uses vault-token authentication and canonical stock runtime", () => {
  assert.match(orchestrator, /x-econovaria-scheduler-token/u);
  assert.match(orchestrator, /verify_runtime_scheduler_token_v1/u);
  assert.match(orchestrator, /sha256Hex/u);
  assert.match(orchestrator, /SupabaseStockMarketRunnerRepository/u);
  assert.match(orchestrator, /calculateNextStockMarketTick/u);
  assert.match(orchestrator, /readStockMarketOpenState/u);
  assert.doesNotMatch(orchestrator, /STOCK_MARKET_RUNNER_SECRET/u);
  assert.doesNotMatch(orchestrator, /SUPABASE_PUBLISHABLE_KEY/u);
  assert.doesNotMatch(orchestrator, /x-econovaria-runner-signature/u);
});

test("orchestrator advances only active ready games and obeys market calendar", () => {
  assert.match(orchestrator, /\.eq\("status", "active"\)/u);
  assert.match(orchestrator, /\.eq\("lifecycle_state", "active"\)/u);
  assert.match(orchestrator, /\.eq\("provisioning_status", "ready"\)/u);
  assert.match(orchestrator, /if \(!marketOpen\)/u);
  assert.match(orchestrator, /outcome: "closed"/u);
});

test("database owns the autonomous 15-minute scheduler without embedded service credentials", () => {
  assert.match(migration, /create extension if not exists pg_cron/u);
  assert.match(migration, /create extension if not exists pg_net/u);
  assert.match(migration, /vault\.create_secret/u);
  assert.match(migration, /private\.runtime_scheduler_tokens/u);
  assert.match(migration, /verify_runtime_scheduler_token_v1/u);
  assert.match(migration, /configure_stock_market_runtime_scheduler_v1/u);
  assert.match(migration, /'\*\/15 \* \* \* \*'/u);
  assert.match(migration, /net\.http_post/u);
  assert.match(migration, /vault\.decrypted_secrets/u);
  assert.match(migration, /x-econovaria-scheduler-token/u);
  assert.doesNotMatch(migration, /service_role_key|sb_secret_|Bearer eyJ/iu);
  assert.match(migration, /revoke all on function public\.verify_runtime_scheduler_token_v1[\s\S]*from public, anon, authenticated/u);
  assert.match(migration, /grant execute on function public\.configure_stock_market_runtime_scheduler_v1\(text\)[\s\S]*to service_role/u);
});

test("GitHub is deployment-only and preserves custom-auth boundary", () => {
  assert.match(workflow, /environment: staging/u);
  assert.match(workflow, /environment: production/u);
  assert.match(workflow, /STAGING_PROJECT_REF: eecvbssdvarfcykcfrny/u);
  assert.match(workflow, /PRODUCTION_PROJECT_REF: cgiukdjwicykrmtkhudh/u);
  assert.match(workflow, /supabase functions deploy "\$FUNCTION_SLUG"/u);
  assert.match(workflow, /--no-verify-jwt/u);
  assert.match(workflow, /configure_stock_market_runtime_scheduler_v1/u);
  assert.doesNotMatch(workflow, /^\s*schedule:/mu);
  assert.doesNotMatch(workflow, /production-tick:/u);
  assert.doesNotMatch(workflow, /STOCK_MARKET_RUNNER_SECRET/u);
});
