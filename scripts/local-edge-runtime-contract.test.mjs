import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CONFIG = new URL("../backend/supabase/config.toml", import.meta.url);
const PACKAGE = new URL("../package.json", import.meta.url);
const FUNCTION_ROOT = new URL(
  "../backend/supabase/functions/",
  import.meta.url,
);
const CAMPAIGN_RUNTIME_CLIENT = new URL(
  "../backend/supabase/functions/campaign-orchestrator/infrastructure/client.ts",
  import.meta.url,
);
const FX_ORCHESTRATOR_HANDLER = new URL(
  "../backend/src/domains/fx/api/fxOrchestratorHttpHandler.ts",
  import.meta.url,
);
const FX_ORCHESTRATOR_REPOSITORY = new URL(
  "../backend/src/domains/fx/infrastructure/supabaseFxFixingRepository.ts",
  import.meta.url,
);
const BANKING_FX_ORCHESTRATOR_HANDLER = new URL(
  "../backend/src/domains/banking-fx/api/bankingFxOrchestratorHttpHandler.ts",
  import.meta.url,
);
const BANKING_FX_ORCHESTRATOR_REPOSITORY = new URL(
  "../backend/src/domains/banking-fx/infrastructure/supabaseStandardFxOrderSettlementRepository.ts",
  import.meta.url,
);
const AUTH_MANIFEST = new URL(
  "../backend/supabase/admin-auth-edge-function-manifest.json",
  import.meta.url,
);
const AUTH_STAGING_WORKFLOW = new URL(
  "../.github/workflows/admin-auth-surface-staging-candidate.yml",
  import.meta.url,
);
const AUTH_PRODUCTION_WORKFLOW = new URL(
  "../.github/workflows/admin-auth-surface-production-promote.yml",
  import.meta.url,
);
const FUNCTION_POLICIES = Object.freeze({
  "player-api": false,
  "player-web-session-api": false,
  "bootstrap-api": false,
  "web-session-api": false,
  "admin-password-recovery": false,
  "admin-email-verification": false,
  "staff-api": true,
  "admin-api": true,
  "staff-mfa-api": true,
  "password-reset-api": true,
  "classroom-api": true,
  "campaign-orchestrator": false,
  "banking-fx-orchestrator": false,
  "business-operations-worker": false,
  "game-data-purger": false,
  "fx-orchestrator": false,
  "stock-market-runner": false,
  "stock-market-read": false,
  "stock-market-seed-copy": false,
  "stock-market-player-read": false,
  "stock-market-trading": false,
  "stock-market-orchestrator": false,
  "stock-tick-archiver": false,
});
const CUSTOM_AUTH_FUNCTIONS = new Set([
  "admin-password-recovery",
  "admin-email-verification",
  "campaign-orchestrator",
  "banking-fx-orchestrator",
  "game-data-purger",
  "fx-orchestrator",
  "stock-market-orchestrator",
  "stock-tick-archiver",
]);
const WRAPPED_RUNTIME_FUNCTIONS = new Set([
  "player-api",
  "player-web-session-api",
]);

function section(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`\\[${escaped}\\]([\\s\\S]*?)(?=\\n\\[|$)`),
  );
  return match?.[1] || "";
}

test("local Supabase starts every declared split Edge security boundary", async () => {
  const [
    config,
    packageSource,
    campaignClientSource,
    fxHandlerSource,
    fxRepositorySource,
    bankingFxHandlerSource,
    bankingFxRepositorySource,
  ] = await Promise.all([
    readFile(CONFIG, "utf8"),
    readFile(PACKAGE, "utf8"),
    readFile(CAMPAIGN_RUNTIME_CLIENT, "utf8"),
    readFile(FX_ORCHESTRATOR_HANDLER, "utf8"),
    readFile(FX_ORCHESTRATOR_REPOSITORY, "utf8"),
    readFile(BANKING_FX_ORCHESTRATOR_HANDLER, "utf8"),
    readFile(BANKING_FX_ORCHESTRATOR_REPOSITORY, "utf8"),
  ]);

  assert.match(
    section(config, "edge_runtime"),
    /(?:^|\n)enabled\s*=\s*true(?:\s|$)/,
  );

  const functionSources = {};
  for (const [name, verifyJwt] of Object.entries(FUNCTION_POLICIES)) {
    const policy = section(config, `functions.${name}`);
    assert.match(policy, new RegExp(`verify_jwt\\s*=\\s*${verifyJwt}`));
    const entrypoint = await readFile(
      new URL(`${name}/index.ts`, FUNCTION_ROOT),
      "utf8",
    );
    const runtime = WRAPPED_RUNTIME_FUNCTIONS.has(name)
      ? await readFile(new URL(`${name}/runtime.ts`, FUNCTION_ROOT), "utf8")
      : "";
    functionSources[name] = `${entrypoint}\n${runtime}`;
  }
  functionSources["fx-orchestrator"] +=
    `\n${fxHandlerSource}\n${fxRepositorySource}`;
  functionSources["banking-fx-orchestrator"] +=
    `\n${bankingFxHandlerSource}\n${bankingFxRepositorySource}`;

  const declaredNames = [...config.matchAll(/\[functions\.([^\]]+)\]/g)]
    .map((match) => match[1]);
  assert.deepEqual(declaredNames.sort(), Object.keys(FUNCTION_POLICIES).sort());

  const falseSections = declaredNames
    .filter((name) =>
      /verify_jwt\s*=\s*false/.test(section(config, `functions.${name}`))
    )
    .sort();
  const expectedFalse = Object.entries(FUNCTION_POLICIES)
    .filter(([, value]) => value === false)
    .map(([name]) => name)
    .sort();
  assert.deepEqual(falseSections, expectedFalse);

  for (const [name, source] of Object.entries(functionSources)) {
    assert.doesNotMatch(source, /Authorization[^\n]+sb_publishable_/i);
    if (FUNCTION_POLICIES[name] === false && !CUSTOM_AUTH_FUNCTIONS.has(name)) {
      assert.match(
        source,
        /requirePublishableRequest\((?:request|incomingRequest)\)/,
      );
    }
  }

  assert.match(functionSources["staff-api"], /resolveStaffForRequest/);
  assert.match(functionSources["staff-api"], /handleStaffBootstrapRequest/);
  assert.match(
    functionSources["staff-mfa-api"],
    /resolveStaffSessionForRequest/,
  );
  assert.match(functionSources["staff-mfa-api"], /requiredAssuranceLevel/);
  assert.match(functionSources["staff-mfa-api"], /mfa\.challengeAndVerify/);
  assert.match(functionSources["password-reset-api"], /resolveStaffForRequest/);
  assert.match(functionSources["password-reset-api"], /validateStaffPassword/);
  assert.match(functionSources["web-session-api"], /WEB_ADMIN_SESSION_COOKIE/);
  assert.match(
    functionSources["web-session-api"],
    /\/functions\/v1\/staff-mfa-api/,
  );
  assert.match(
    functionSources["web-session-api"],
    /authorizeAdminBffRequest\(incomingRequest/,
  );
  assert.match(
    functionSources["web-session-api"],
    /const request = authorization\.request/,
  );
  assert.match(
    functionSources["admin-password-recovery"],
    /request\.method\.toUpperCase\(\)/,
  );
  assert.match(functionSources["admin-password-recovery"], /method === "GET"/);
  assert.match(functionSources["admin-password-recovery"], /method === "POST"/);
  assert.match(
    functionSources["admin-password-recovery"],
    /constantTimeEqual\(challenge, cookieChallenge\)/,
  );
  assert.match(
    functionSources["admin-password-recovery"],
    /\/auth\/v1\/verify/,
  );
  assert.doesNotMatch(
    functionSources["admin-password-recovery"],
    /SUPABASE_SERVICE_ROLE_KEY/,
  );
  assert.match(
    functionSources["admin-email-verification"],
    /TOKEN_HASH_PATTERN/,
  );
  assert.match(
    functionSources["admin-email-verification"],
    /constantTimeEqual\(challenge, cookieChallenge\)/,
  );
  assert.match(
    functionSources["admin-email-verification"],
    /\/auth\/v1\/verify/,
  );
  assert.doesNotMatch(
    functionSources["admin-email-verification"],
    /SUPABASE_SERVICE_ROLE_KEY/,
  );
  assert.doesNotMatch(config, /\[functions\.admin-logout-api\]/);
  assert.match(
    functionSources["player-web-session-api"],
    /WEB_PLAYER_SESSION_COOKIE/,
  );
  assert.match(
    functionSources["player-web-session-api"],
    /constantTimePlayerTextEqual/,
  );
  assert.match(
    functionSources["player-web-session-api"],
    /\/functions\/v1\/player-api/,
  );
  assert.match(
    functionSources["player-api"],
    /dispatchRateLimitedReviewedPlayerRequest/,
  );
  assert.match(functionSources["bootstrap-api"], /handleStaffSignupRequest/);
  assert.match(
    functionSources["campaign-orchestrator"],
    /x-econovaria-scheduler-token/,
  );
  assert.match(
    functionSources["campaign-orchestrator"],
    /verifySchedulerToken/,
  );
  assert.match(campaignClientSource, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(campaignClientSource, /verify_runtime_scheduler_token_v1/);
  assert.match(
    functionSources["stock-market-orchestrator"],
    /verify_runtime_scheduler_token_v1/,
  );
  assert.match(
    functionSources["stock-market-orchestrator"],
    /handleStockMarketRunnerRequest/,
  );
  assert.match(
    functionSources["stock-tick-archiver"],
    /verify_runtime_scheduler_token_v1/,
  );
  assert.match(
    functionSources["stock-tick-archiver"],
    /SUPABASE_SERVICE_ROLE_KEY/,
  );
  assert.match(
    functionSources["game-data-purger"],
    /verify_runtime_scheduler_token_v1/,
  );
  assert.match(
    functionSources["game-data-purger"],
    /SUPABASE_SERVICE_ROLE_KEY/,
  );
  assert.match(
    functionSources["fx-orchestrator"],
    /x-econovaria-scheduler-token/,
  );
  assert.match(
    functionSources["fx-orchestrator"],
    /verify_runtime_scheduler_token_v1/,
  );
  assert.match(functionSources["fx-orchestrator"], /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(
    functionSources["banking-fx-orchestrator"],
    /x-econovaria-scheduler-token/,
  );
  assert.match(
    functionSources["banking-fx-orchestrator"],
    /verify_runtime_scheduler_token_v1/,
  );
  assert.match(
    functionSources["banking-fx-orchestrator"],
    /SUPABASE_SERVICE_ROLE_KEY/,
  );
  assert.match(
    functionSources["business-operations-worker"],
    /businessOperationsWorkerBrowserRequestFailure\(request\)/,
  );
  assert.match(
    functionSources["business-operations-worker"],
    /authorizeInternalRunnerRequest/,
  );
  assert.match(
    functionSources["business-operations-worker"],
    /runnerName:\s*"business-operations-worker"/,
  );
  assert.match(
    functionSources["business-operations-worker"],
    /claim_internal_runner_nonce_v2/,
  );
  assert.match(
    functionSources["business-operations-worker"],
    /handleBusinessOperationsWorkerRequest/,
  );
  assert.doesNotMatch(
    functionSources["business-operations-worker"],
    /method\s*===\s*["']OPTIONS["']/,
  );
  for (
    const name of expectedFalse.filter((value) =>
      value.startsWith("stock-market-") && value !== "stock-market-orchestrator"
    )
  ) {
    assert.match(functionSources[name], /handleStockMarket/);
  }

  const packageJson = JSON.parse(packageSource);
  const localCommand = packageJson.scripts?.["dev:local"] || "";
  assert.match(localCommand, /supabase start --workdir backend/);
  assert.match(localCommand, /local-auth-readiness\.mjs/);
  assert.match(localCommand, /econovaria-local-gateway\.py --local-supabase/);
});

test("Admin auth deployment surfaces remain manifest-bound and staging-promoted", async () => {
  const [manifestSource, stagingWorkflow, productionWorkflow] = await Promise
    .all([
      readFile(AUTH_MANIFEST, "utf8"),
      readFile(AUTH_STAGING_WORKFLOW, "utf8"),
      readFile(AUTH_PRODUCTION_WORKFLOW, "utf8"),
    ]);
  const manifest = JSON.parse(manifestSource);

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.manifestId, "econovaria.admin-auth-surfaces.v1");
  assert.deepEqual(
    manifest.functions.map(({ slug, verifyJwt }) => [slug, verifyJwt]),
    [
      ["admin-email-verification", false],
      ["admin-password-recovery", false],
      ["password-reset-api", true],
    ],
  );
  assert.ok(
    manifest.retiredFunctions.some(({ slug, replacement }) =>
      slug === "admin-logout-api" && replacement === "web-session-api/logout"
    ),
  );
  assert.equal(
    manifest.verificationEmailDelivery.runtimeFunction,
    "bootstrap-api",
  );
  assert.equal(
    manifest.verificationEmailDelivery.trackingLinkRewritesAllowed,
    false,
  );

  for (
    const [workflow, environment, projectRef] of [
      [stagingWorkflow, "staging", "eecvbssdvarfcykcfrny"],
      [productionWorkflow, "production", "cgiukdjwicykrmtkhudh"],
    ]
  ) {
    assert.match(workflow, new RegExp(`environment:\\s*${environment}`));
    assert.match(workflow, new RegExp(projectRef));
    assert.match(workflow, /supabase functions deploy/);
    assert.match(workflow, /--workdir backend/);
    assert.match(workflow, /--no-verify-jwt/);
    assert.match(
      workflow,
      /scripts\/verified-staff-onboarding-contract\.test\.mjs/,
    );
    assert.match(
      workflow,
      /scripts\/password-recovery-frontend-contract\.test\.mjs/,
    );
  }

  assert.match(stagingWorkflow, /git rev-parse origin\/main/);
  assert.match(stagingWorkflow, /admin-auth-staging-candidate\.json/);
  assert.match(productionWorkflow, /candidate_run_id/);
  assert.match(productionWorkflow, /staging_inventory_digest/);
  assert.match(productionWorkflow, /actions\/download-artifact@v5/);
  assert.match(
    productionWorkflow,
    /Production auth source differs from staging/,
  );
});
