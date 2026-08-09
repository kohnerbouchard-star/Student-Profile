import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const orchestrator = await readFile(
  new URL("../backend/supabase/functions/stock-market-orchestrator/index.ts", import.meta.url),
  "utf8",
);
const workflow = await readFile(
  new URL("../.github/workflows/stock-market-runtime-scheduler.yml", import.meta.url),
  "utf8",
);

test("orchestrator is service-role only and preserves signed runner boundary", () => {
  assert.match(orchestrator, /payload\?\.role === "service_role"/u);
  assert.match(orchestrator, /STOCK_MARKET_RUNNER_SECRET/u);
  assert.match(orchestrator, /SUPABASE_PUBLISHABLE_KEY/u);
  assert.match(orchestrator, /x-econovaria-runner-signature/u);
  assert.match(orchestrator, /x-econovaria-runner-nonce/u);
  assert.match(orchestrator, /econovaria-internal-runner-v1/u);
  assert.doesNotMatch(orchestrator, /x-stock-market-runner-secret/u);
});

test("orchestrator advances only active ready games with initialized stocks", () => {
  assert.match(orchestrator, /\.eq\("status", "active"\)/u);
  assert.match(orchestrator, /\.eq\("lifecycle_state", "active"\)/u);
  assert.match(orchestrator, /\.eq\("provisioning_status", "ready"\)/u);
  assert.match(orchestrator, /game_session_stock_assets/u);
  assert.match(orchestrator, /\.eq\("is_active", true\)/u);
  assert.match(orchestrator, /stock_market_closed/u);
});

test("workflow deploys through staging before main and ticks production every 15 minutes", () => {
  assert.match(workflow, /fix\/stock-market-runtime-scheduler-v1/u);
  assert.match(workflow, /STAGING_PROJECT_REF: eecvbssdvarfcykcfrny/u);
  assert.match(workflow, /PRODUCTION_PROJECT_REF: cgiukdjwicykrmtkhudh/u);
  assert.match(workflow, /cron: "\*\/15 \* \* \* \*"/u);
  assert.match(workflow, /environment: staging/u);
  assert.match(workflow, /environment: production/u);
  assert.match(workflow, /supabase functions deploy "\$FUNCTION_SLUG"/u);
  assert.doesNotMatch(workflow, /--no-verify-jwt/u);
  assert.doesNotMatch(workflow, /STOCK_MARKET_RUNNER_SECRET:\s*\$\{\{\s*secrets\./u);
});
