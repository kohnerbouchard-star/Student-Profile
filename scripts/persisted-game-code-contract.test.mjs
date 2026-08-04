import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const MIGRATION = new URL(
  "../backend/supabase/migrations/20260725123000_persist_memorable_game_join_codes_v1.sql",
  import.meta.url,
);
const WIRING = new URL("../admin/game-code-wiring.js", import.meta.url);
const SESSION_CONTROLS = new URL("../admin/game-session-controls.js", import.meta.url);
const CREATION_CONTROLS = new URL("../admin/game-creation-controls.js", import.meta.url);
const RESET_HANDLER = new URL(
  "../backend/src/domains/game-sessions/api/gameJoinCodeResetHttpHandler.ts",
  import.meta.url,
);
const STAFF_BOOTSTRAP = new URL(
  "../backend/src/domains/auth/api/staffBootstrapHttpHandler.ts",
  import.meta.url,
);
const ADMIN_COMMON = new URL(
  "../backend/supabase/functions/admin-api/common.ts",
  import.meta.url,
);
const ADMIN_ROUTES = new URL(
  "../backend/supabase/functions/admin-api/gameRoutes.ts",
  import.meta.url,
);
const ADMIN_JOIN_CODE_OPERATION = new URL(
  "../backend/supabase/functions/admin-api/gameJoinCodeOperations.ts",
  import.meta.url,
);
const JOIN_CODE_READ_SERVICE = new URL(
  "../backend/src/domains/game-sessions/application/readGameJoinCode.ts",
  import.meta.url,
);
const JOIN_CODE_READ_REPOSITORY = new URL(
  "../backend/src/domains/game-sessions/infrastructure/supabaseGameJoinCodeReadRepository.ts",
  import.meta.url,
);
const HOTFIX_RETIREMENT = new URL(
  "../docs/operations/evidence/production-admin-join-code-read-hotfix-retirement-v1.json",
  import.meta.url,
);

test("Game Codes are persisted public identifiers with one issuance authority", async () => {
  const sql = await readFile(MIGRATION, "utf8");
  const lower = sql.toLowerCase();

  assert.match(lower, /add column if not exists game_join_code text null/);
  assert.match(sql, /\^ECO-\[A-Z\]\{3,12\}-\[A-Z\]\{3,12\}-\[0-9\]\{3\}\$/);
  assert.match(lower, /create unique index if not exists game_sessions_active_readable_join_code_unique/);
  assert.match(lower, /create or replace function public\.issue_game_join_code_v1/);
  assert.match(lower, /game_join_code = v_code/);
  assert.match(lower, /game_join_code_hash = v_hash/);
  assert.match(lower, /grant execute on function public\.issue_game_join_code_v1\(uuid, uuid\)[\s\S]+to service_role/);
  assert.match(lower, /revoke all on function public\.issue_game_join_code_v1\(uuid, uuid\)[\s\S]+from public, anon, authenticated/);
  assert.doesNotMatch(lower, /grant[^;]+to\s+(?:public|anon|authenticated)/);
  assert.match(lower, /create or replace function public\.create_provisioned_game_v2/);
  assert.match(lower, /from public\.issue_game_join_code_v1\(v_game_id, p_staff_user_id\)/);
  assert.match(lower, /'joincode', v_join_code/);
});

test("Admin reads the authoritative persisted code instead of a browser cache", async () => {
  const [
    wiring,
    sessionControls,
    creationControls,
    resetHandler,
    bootstrap,
    adminCommon,
    adminRoutes,
    adminJoinCodeOperation,
    joinCodeReadService,
    joinCodeReadRepository,
  ] = await Promise.all([
    readFile(WIRING, "utf8"),
    readFile(SESSION_CONTROLS, "utf8"),
    readFile(CREATION_CONTROLS, "utf8"),
    readFile(RESET_HANDLER, "utf8"),
    readFile(STAFF_BOOTSTRAP, "utf8"),
    readFile(ADMIN_COMMON, "utf8"),
    readFile(ADMIN_ROUTES, "utf8"),
    readFile(ADMIN_JOIN_CODE_OPERATION, "utf8"),
    readFile(JOIN_CODE_READ_SERVICE, "utf8"),
    readFile(JOIN_CODE_READ_REPOSITORY, "utf8"),
  ]);

  for (const source of [wiring, sessionControls, creationControls]) {
    assert.doesNotMatch(
      source,
      /GAME_CODE_CACHE_PREFIX|econovaria\.admin\.game-code\.v1:|readCachedCode|writeCachedCode|cachedCode\(/,
    );
    assert.doesNotMatch(
      source,
      /sessionStorage\.(?:setItem|getItem)\([^\n]*(?:gameCode|joinCode|game-code)/i,
    );
  }
  assert.match(wiring, /method:\s*"GET"/);
  assert.match(wiring, /readPersistedGameCode/);
  assert.match(wiring, /remains available after reloads/);
  assert.match(wiring, /Rotate Code/);
  assert.match(resetHandler, /new Set\(\["GET", "POST"\]\)/);
  assert.match(resetHandler, /createSupabaseGameJoinCodeReadRepository/);
  assert.match(resetHandler, /readGameJoinCode/);
  assert.match(resetHandler, /\.rpc\("issue_game_join_code_v1"/);
  assert.match(bootstrap, /game_join_code,game_join_code_status/);
  assert.match(bootstrap, /joinCode:\s*session\.game_join_code/);
  assert.match(bootstrap, /gameCode:\s*session\.game_join_code/);
  assert.match(adminCommon, /game_join_code,game_join_code_status/);
  assert.match(adminCommon, /joinCode:\s*gameCode/);
  assert.match(adminCommon, /gameCode,/);
  assert.match(adminRoutes, /suffix === "\/join-code\/reset"/);
  assert.match(adminRoutes, /handleGameJoinCodeReadOperation/);
  assert.match(adminJoinCodeOperation, /createSupabaseGameJoinCodeReadRepository/);
  assert.match(adminJoinCodeOperation, /readGameJoinCode/);
  assert.match(joinCodeReadRepository, /\.eq\("id", input\.gameSessionId\)/);
  assert.match(
    joinCodeReadRepository,
    /\.eq\("owner_staff_user_id", input\.staffUserId\)/,
  );
  assert.match(joinCodeReadService, /join_code_read_failed/);
  assert.doesNotMatch(joinCodeReadService, /join_code_scope_violation/);
  assert.doesNotMatch(
    adminRoutes.match(
      /if \(suffix === "\/join-code\/reset"\) \{[\s\S]*?\n  \}/,
    )?.[0] || "",
    /proxyClassroom|classroomGamePath/,
  );
});

test("retired join-code deploy workflows retain immutable authorization and outcome evidence", async () => {
  const retirement = JSON.parse(await readFile(HOTFIX_RETIREMENT, "utf8"));
  assert.equal(
    retirement.schemaVersion,
    "econovaria.production-admin-join-code-read-hotfix-retirement.v1",
  );
  assert.equal(retirement.status, "proposed");
  assert.equal(retirement.workflows.length, 2);

  for (const workflow of retirement.workflows) {
    assert.match(workflow.blobSha1, /^[0-9a-f]{40}$/);
    assert.match(workflow.sha256, /^[0-9a-f]{64}$/);
    const authorization = await readFile(
      new URL(`../${workflow.authorization.path}`, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(authorization).digest("hex"),
      workflow.authorization.sha256,
    );
    await assert.rejects(
      access(new URL(`../${workflow.path}`, import.meta.url)),
      { code: "ENOENT" },
    );
  }

  const [first, second] = retirement.workflows;
  assert.equal(first.outcome.status, "not_captured");
  assert.equal(first.outcome.deploymentClaim, "none");
  assert.equal(second.outcome.status, "captured");
  assert.equal(second.outcome.deploymentOccurredFromRecordedRun, false);

  const result = JSON.parse(
    await readFile(new URL(`../${second.outcome.path}`, import.meta.url), "utf8"),
  );
  assert.equal(result.conclusion, "failure");
  assert.equal(result.deploymentOccurredFromThisRun, false);
  assert.equal(result.workflow.runHeadSha, retirement.auditedSourceSha);
  assert.equal(result.workflow.blobSha1, second.blobSha1);
  assert.equal(result.workflow.sha256, second.sha256);
});
