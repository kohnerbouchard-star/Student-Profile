import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const orchestrator = await readFile(
  new URL("../backend/supabase/functions/stock-market-orchestrator/index.ts", import.meta.url),
  "utf8",
);
const runnerHandler = await readFile(
  new URL("../backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.ts", import.meta.url),
  "utf8",
);
const runtimeCursorRepositories = await readFile(
  new URL("../backend/src/domains/stocks/infrastructure/runtimeCursorStockMarketRepositories.ts", import.meta.url),
  "utf8",
);
const baseMigration = await readFile(
  new URL("../backend/supabase/migrations/20260810073000_add_stock_market_runtime_scheduler_v1.sql", import.meta.url),
  "utf8",
);
const minuteMigration = await readFile(
  new URL("../backend/supabase/migrations/20260810083500_configure_stock_market_runtime_scheduler_every_minute_v1.sql", import.meta.url),
  "utf8",
);
const workflow = await readFile(
  new URL("../.github/workflows/stock-market-runtime-scheduler.yml", import.meta.url),
  "utf8",
);

test("orchestrator uses vault-token authentication and the canonical stock HTTP handler", () => {
  assert.match(orchestrator, /x-econovaria-scheduler-token/u);
  assert.match(orchestrator, /verify_runtime_scheduler_token_v1/u);
  assert.match(orchestrator, /sha256Hex/u);
  assert.match(orchestrator, /handleStockMarketRunnerRequest/u);
  assert.match(orchestrator, /readRunnerSecret:\s*\(\)\s*=>\s*internalSecret/u);
  assert.match(orchestrator, /crypto\.randomUUID\(\)/u);
  assert.doesNotMatch(orchestrator, /calculateNextStockMarketTick/u);
  assert.doesNotMatch(orchestrator, /SupabaseStockMarketRunnerRepository/u);
  assert.doesNotMatch(orchestrator, /STOCK_MARKET_RUNNER_SECRET/u);
  assert.doesNotMatch(orchestrator, /SUPABASE_PUBLISHABLE_KEY/u);
});

test("scheduled ticks use Runtime V2 eligibility and preserve authoritative cursor semantics", () => {
  assert.match(orchestrator, /list_due_stock_market_games_v2/u);
  assert.match(orchestrator, /current_tick_index/u);
  assert.match(orchestrator, /simulation_seed/u);
  assert.match(orchestrator, /tickIndex:\s*currentTick \+ 1/u);
  assert.match(orchestrator, /new RuntimeCursorStockMarketRunnerRepository/u);
  assert.doesNotMatch(orchestrator, /\.from\("game_sessions"\)/u);
  assert.match(runtimeCursorRepositories, /get_current_stock_market_tick_index/u);
  assert.match(runtimeCursorRepositories, /get_next_stock_market_tick_index/u);
});

test("scheduled ticks preserve market-calendar, realtime, storyline, and wall-clock semantics", () => {
  assert.match(orchestrator, /stock_market_closed/u);
  assert.match(runnerHandler, /readStockMarketOpenState/u);
  assert.match(runnerHandler, /createDefaultPublicRealtimePublisher/u);
  assert.match(runnerHandler, /createDefaultStorylineRunnerAfterTick/u);
  assert.match(runnerHandler, /runStorylineEventsAfterStockTickBestEffort/u);
  assert.match(runnerHandler, /runDueStorylineEvents/u);
  assert.match(runnerHandler, /const tickOccurredAt =/u);
  assert.match(runnerHandler, /occurredAt: tickOccurredAt\.toISOString\(\)/u);
  assert.match(runnerHandler, /generatedAt: args\.occurredAt/u);
  assert.doesNotMatch(
    runnerHandler,
    /runStorylineEventsAfterStockTickBestEffort\(\{[\s\S]{0,300}generatedAt:\s*args\.result\.generatedAt/u,
  );
});

test("database owns the scheduler and the forward migration makes cadence one minute", () => {
  assert.match(baseMigration, /create extension if not exists pg_cron/u);
  assert.match(baseMigration, /create extension if not exists pg_net/u);
  assert.match(baseMigration, /vault\.create_secret/u);
  assert.match(baseMigration, /private\.runtime_scheduler_tokens/u);
  assert.match(baseMigration, /verify_runtime_scheduler_token_v1/u);
  assert.match(baseMigration, /configure_stock_market_runtime_scheduler_v1/u);
  assert.match(baseMigration, /net\.http_post/u);
  assert.match(baseMigration, /vault\.decrypted_secrets/u);
  assert.match(baseMigration, /x-econovaria-scheduler-token/u);
  assert.doesNotMatch(baseMigration, /service_role_key|sb_secret_|Bearer eyJ/iu);
  assert.match(baseMigration, /revoke all on function public\.verify_runtime_scheduler_token_v1[\s\S]*from public, anon, authenticated/u);
  assert.match(baseMigration, /grant execute on function public\.configure_stock_market_runtime_scheduler_v1\(text\)[\s\S]*to service_role/u);

  assert.match(minuteMigration, /configure_stock_market_runtime_scheduler_v1/u);
  assert.match(minuteMigration, /cron\.schedule\(v_scheduler_name, '\* \* \* \* \*'/u);
  assert.match(minuteMigration, /one-minute stock runtime cron/u);
  assert.doesNotMatch(minuteMigration, /service_role_key|sb_secret_|Bearer eyJ/iu);
});

test("GitHub remains deployment-only and preserves the custom-auth boundary", () => {
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
