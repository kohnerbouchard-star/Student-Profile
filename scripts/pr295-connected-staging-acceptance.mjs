import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import {
  PUBLIC_MESSAGE_PATTERN,
  PUBLIC_THREAD_PATTERN,
  assertSafePlayerResponse,
  captureRateLimitBaseline,
  cleanupFixture,
  createAuthUser,
  createFixtureIdentity,
  env,
  http,
  psql,
  randomUUID,
  run,
  safeError,
  setupDatabaseFixture,
  sha256,
  signInAdmin,
  sqlLiteral,
} from "./pr295-connected-staging-lib.mjs";

const fixture = createFixtureIdentity();
let loginSessionToken = null;
let cleanupComplete = false;

const evidence = {
  schemaVersion: 1,
  evidenceType: "pr295-connected-staging-acceptance",
  capturedAt: new Date().toISOString(),
  source: {
    releaseCommit: env.releaseCommit,
    artifactSetSha256: env.artifactSetSha256,
  },
  environment: {
    projectRef: env.projectRef,
    productionSelected: false,
    dataPolicy: "synthetic-only",
  },
  checks: {},
  metrics: {},
  cleanup: {
    completed: false,
    residualGameRows: null,
    residualStaffRows: null,
    residualPlayerSessions: null,
    rateLimitDelta: null,
  },
  decision: "NO_GO",
};

async function runHttpAcceptance() {
  const health = await http("/functions/v1/classroom-api/health");
  evidence.checks.classroomHealth = health.status === 200;

  const adminToken = await signInAdmin(fixture);
  const adminBootstrap = await http("/functions/v1/admin-api/session/bootstrap", {
    bearer: adminToken,
  });
  if (adminBootstrap.body?.data?.admin?.role !== "game_admin") {
    throw new Error("Admin bootstrap did not resolve game_admin scope");
  }
  if (!Array.isArray(adminBootstrap.body?.data?.games) || adminBootstrap.body.data.games.length !== 1) {
    throw new Error("Admin bootstrap did not resolve the synthetic owned game");
  }
  evidence.checks.connectedAdminJwt = true;

  const adminDenied = await http("/functions/v1/admin-api/session/bootstrap", {
    bearer: env.anonKey,
    expectedStatuses: [401, 403],
  });
  evidence.checks.adminUnauthenticatedDenied = [401, 403].includes(adminDenied.status);

  const adminWrongGame = await http(`/functions/v1/admin-api/games/${randomUUID()}`, {
    bearer: adminToken,
    expectedStatuses: [404],
  });
  evidence.checks.adminWrongGameDenied = adminWrongGame.status === 404;

  const login = await http("/functions/v1/classroom-api/players/login", {
    method: "POST",
    body: {
      gameJoinCode: fixture.joinCode,
      playerIdentifier: fixture.playerIdentifiers[0],
      accessCode: fixture.accessCode,
    },
  });
  loginSessionToken = login.body?.session?.token;
  if (!loginSessionToken) throw new Error("Player login did not issue an application session");
  assertSafePlayerResponse(login.body, fixture, "player login");
  evidence.checks.connectedPlayerLogin = true;

  const readRoutes = [
    "/functions/v1/classroom-api/players/me",
    "/functions/v1/classroom-api/players/me/capabilities",
    "/functions/v1/classroom-api/players/me/inventory",
    "/functions/v1/classroom-api/players/me/ledger?limit=10",
    "/functions/v1/classroom-api/players/me/messages/policy",
    "/functions/v1/classroom-api/players/me/marketplace/listings",
    "/functions/v1/classroom-api/players/me/contracts",
    "/functions/v1/classroom-api/players/me/notifications?status=unread&limit=10",
    "/functions/v1/classroom-api/players/me/world/countries",
    "/functions/v1/classroom-api/players/me/stocks/assets?limit=1&offset=0",
  ];
  for (const path of readRoutes) {
    const result = await http(path, { playerToken: loginSessionToken });
    assertSafePlayerResponse(result.body, fixture, path);
  }
  evidence.checks.connectedPlayerReadSurface = true;

  const noSession = await http("/functions/v1/classroom-api/players/me", {
    expectedStatuses: [401],
  });
  evidence.checks.missingPlayerSessionDenied = noSession.status === 401;

  const clientIdentity = await http("/functions/v1/classroom-api/players/me", {
    playerToken: loginSessionToken,
    headers: { "x-player-id": fixture.playerIdentifiers[1] },
    expectedStatuses: [400],
  });
  evidence.checks.clientSuppliedOwnershipDenied = clientIdentity.status === 400;

  const wrongScope = await http("/functions/v1/classroom-api/players/me", {
    playerToken: loginSessionToken,
    headers: { "x-econovaria-game-id": randomUUID() },
    expectedStatuses: [401],
  });
  evidence.checks.wrongGameDenied = wrongScope.status === 401;

  const expired = await http("/functions/v1/classroom-api/players/me", {
    playerToken: fixture.expiredSessionToken,
    expectedStatuses: [401],
  });
  evidence.checks.expiredSessionDenied = expired.status === 401;

  const platformDenied = await http("/functions/v1/classroom-api/players/me", {
    bearer: null,
    playerToken: loginSessionToken,
    expectedStatuses: [401],
  });
  evidence.checks.platformJwtRequired = platformDenied.status === 401;

  const createBody = {
    recipientPlayerId: fixture.playerIdentifiers[1],
    title: "Connected acceptance",
    body: "Replay-safe staging message.",
    idempotencyKey: `${fixture.runTag}:message:create`,
  };
  const first = await http("/functions/v1/classroom-api/players/me/messages/threads", {
    method: "POST",
    playerToken: loginSessionToken,
    body: createBody,
    expectedStatuses: [200, 201],
  });
  const replay = await http("/functions/v1/classroom-api/players/me/messages/threads", {
    method: "POST",
    playerToken: loginSessionToken,
    body: createBody,
    expectedStatuses: [200, 201],
  });
  assertSafePlayerResponse(first.body, fixture, "message create");
  assertSafePlayerResponse(replay.body, fixture, "message replay");
  const firstText = JSON.stringify(first.body);
  const replayText = JSON.stringify(replay.body);
  const firstThread = firstText.match(PUBLIC_THREAD_PATTERN)?.[0];
  const replayThread = replayText.match(PUBLIC_THREAD_PATTERN)?.[0];
  const firstMessage = firstText.match(PUBLIC_MESSAGE_PATTERN)?.[0];
  const replayMessage = replayText.match(PUBLIC_MESSAGE_PATTERN)?.[0];
  if (!firstThread || firstThread !== replayThread || !firstMessage || firstMessage !== replayMessage) {
    throw new Error("Messaging idempotent replay did not preserve public identities");
  }
  evidence.checks.messagingReplay = true;

  psql(`update public.game_sessions set lifecycle_state='paused',paused_at=now() where id=${sqlLiteral(fixture.gameId)};`);
  const paused = await http("/functions/v1/classroom-api/players/me/messages/threads", {
    method: "POST",
    playerToken: loginSessionToken,
    body: { ...createBody, idempotencyKey: `${fixture.runTag}:message:paused` },
    expectedStatuses: [409],
  });
  evidence.checks.pausedMutationDenied = paused.status === 409;

  psql(`update public.game_sessions set lifecycle_state='ended',ended_at=now(),paused_at=null where id=${sqlLiteral(fixture.gameId)};`);
  const ended = await http("/functions/v1/classroom-api/players/me/messages/threads", {
    method: "POST",
    playerToken: loginSessionToken,
    body: { ...createBody, idempotencyKey: `${fixture.runTag}:message:ended` },
    expectedStatuses: [409],
  });
  evidence.checks.endedMutationDenied = ended.status === 409;
  psql(`update public.game_sessions set lifecycle_state='active',ended_at=null,paused_at=null,resumed_at=now() where id=${sqlLiteral(fixture.gameId)};`);
}

function runProgressionTransaction() {
  const playerId = fixture.playerRows[0].id;
  const sourceKey = `${fixture.runTag}.business`;
  const eventKey = `${fixture.runTag}.event`;
  psql(`
    begin;
    select public.ensure_player_progression_profile_v1(${sqlLiteral(fixture.gameId)},${sqlLiteral(playerId)});
    do $acceptance$
    declare
      first_event record;
      replay_event record;
      model jsonb;
    begin
      select * into first_event from public.record_progression_integration_event_v1(
        ${sqlLiteral(fixture.gameId)},${sqlLiteral(playerId)},'business','business.operation.completed',
        ${sqlLiteral(sourceKey)},${sqlLiteral(eventKey)},now()
      );
      select * into replay_event from public.record_progression_integration_event_v1(
        ${sqlLiteral(fixture.gameId)},${sqlLiteral(playerId)},'business','business.operation.completed',
        ${sqlLiteral(sourceKey)},${sqlLiteral(eventKey)},now()
      );
      if first_event.event_outcome <> 'applied'
         or replay_event.event_outcome <> 'replayed'
         or first_event.event_id <> replay_event.event_id then
        raise exception 'PR295_PROGRESSION_REPLAY_FAILED';
      end if;
      model := public.read_player_progression_v1(${sqlLiteral(fixture.gameId)},${sqlLiteral(playerId)});
      if model::text ~* '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' then
        raise exception 'PR295_PROGRESSION_UUID_LEAK';
      end if;
    end;
    $acceptance$;
    rollback;
  `);
  evidence.checks.progressionTransactionalReplay = true;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)].toFixed(2));
}

async function runLoad(label, count) {
  const latencies = [];
  const statuses = [];
  const started = performance.now();
  await Promise.all(fixture.directSessionTokens.slice(0, count).map(async (token) => {
    try {
      const result = await http("/functions/v1/classroom-api/players/me/capabilities", {
        playerToken: token,
      });
      statuses.push(result.status);
      latencies.push(result.latencyMs);
    } catch {
      statuses.push(0);
      latencies.push(20_000);
    }
  }));
  const report = {
    players: count,
    requests: count,
    errors: statuses.filter((status) => status !== 200).length,
    durationMs: Number((performance.now() - started).toFixed(2)),
    p50Ms: percentile(latencies, 0.50),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
  };
  if (report.errors) throw new Error(`${label} load produced ${report.errors} failed requests`);
  if (report.p95Ms > 8_000) throw new Error(`${label} load p95 exceeded 8000ms`);
  evidence.metrics[label] = report;
}

async function runRateLimitProbe() {
  const attempts = 100;
  const results = await Promise.all(Array.from({ length: attempts }, () =>
    http("/functions/v1/classroom-api/players/me/capabilities", {
      playerToken: fixture.directSessionTokens[0],
      expectedStatuses: [200, 429],
    })
  ));
  const denied = results.filter((result) => result.status === 429);
  if (!denied.length) throw new Error("Rate-limit probe did not produce a bounded 429 denial");
  if (!denied.some((result) => /^\d+$/.test(String(result.retryAfter ?? "")))) {
    throw new Error("Rate-limit denial did not include Retry-After");
  }
  evidence.metrics.rateLimitProbe = {
    attempts,
    allowed: results.filter((result) => result.status === 200).length,
    denied: denied.length,
  };
  evidence.checks.rateLimitEnforced = true;
}

function captureQueryPlans() {
  const sessionPlan = JSON.parse(psql(`
    explain (analyze, buffers, format json)
    select * from public.player_sessions
    where session_token_hash=${sqlLiteral(sha256(fixture.directSessionTokens[0]))}
    limit 1;
  `));
  const playerPlan = JSON.parse(psql(`
    explain (analyze, buffers, format json)
    select * from public.players
    where game_session_id=${sqlLiteral(fixture.gameId)}
      and player_identifier_normalized=${sqlLiteral(fixture.playerIdentifiers[0])}
    limit 1;
  `));
  const summarize = (result) => {
    const plan = result?.[0]?.Plan ?? {};
    return {
      nodeType: plan["Node Type"] ?? "unknown",
      indexName: plan["Index Name"] ?? null,
      actualTotalTimeMs: Number(plan["Actual Total Time"] ?? 0),
      sharedReadBlocks: Number(plan["Shared Read Blocks"] ?? 0),
    };
  };
  evidence.metrics.queryPlans = {
    sessionLookup: summarize(sessionPlan),
    playerLookup: summarize(playerPlan),
  };
  evidence.checks.queryPlansCaptured = true;
}

function runEncryptedBackupRestoreRehearsal() {
  const payloadText = psql(`
    select json_build_object(
      'schemaVersion',1,
      'scope','synthetic-fixture-bounded',
      'game',(select row_to_json(g) from (
        select name,status,lifecycle_state from public.game_sessions where id=${sqlLiteral(fixture.gameId)}
      ) g),
      'players',(select json_agg(json_build_object(
        'identifier',player_identifier,'status',status
      ) order by player_identifier) from public.players where game_session_id=${sqlLiteral(fixture.gameId)}),
      'rowCounts',json_build_object(
        'players',(select count(*) from public.players where game_session_id=${sqlLiteral(fixture.gameId)}),
        'sessions',(select count(*) from public.player_sessions where game_session_id=${sqlLiteral(fixture.gameId)}),
        'messages',(select count(*) from public.messages where game_session_id=${sqlLiteral(fixture.gameId)})
      )
    )::text;
  `);
  const plaintext = Buffer.from(payloadText, "utf8");
  const key = randomBytes(32);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encrypted = Buffer.concat([nonce, tag, ciphertext]);

  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const restored = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  if (!restored.equals(plaintext)) throw new Error("Encrypted backup decrypt verification failed");

  const localPayload = restored.toString("utf8");
  const expectedCounts = JSON.parse(localPayload).rowCounts;
  run("psql", [env.localRestoreUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    env: { PGPASSWORD: "postgres", PGSSLMODE: "disable" },
    input: `
      create table if not exists restore_payload (id integer primary key, payload jsonb not null);
      truncate restore_payload;
      insert into restore_payload values (1,$payload$${localPayload}$payload$::jsonb);
    `,
  });
  const restoredCounts = run(
    "psql",
    [
      env.localRestoreUrl,
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "select (payload->'rowCounts'->>'players')::int || ' ' || (payload->'rowCounts'->>'sessions')::int from restore_payload where id=1;",
    ],
    { env: { PGPASSWORD: "postgres", PGSSLMODE: "disable" } },
  );
  if (restoredCounts !== `${expectedCounts.players} ${expectedCounts.sessions}`) {
    throw new Error(`Isolated restore row-count verification failed (${restoredCounts})`);
  }
  evidence.metrics.backupRestore = {
    scope: "synthetic-fixture-bounded",
    encrypted: true,
    algorithm: "AES-256-GCM",
    encryptedSha256: sha256(encrypted),
    plaintextRetained: false,
    isolatedRestoreVerified: true,
    playerRows: expectedCounts.players,
    sessionRows: expectedCounts.sessions,
  };
  key.fill(0);
  plaintext.fill(0);
  restored.fill(0);
  evidence.checks.encryptedBackupRestore = true;
}

async function main() {
  try {
    await createAuthUser(fixture);
    setupDatabaseFixture(fixture);
    captureRateLimitBaseline(fixture);
    await runHttpAcceptance();
    runProgressionTransaction();
    await runLoad("expected30", 30);
    await runLoad("maximum40", 40);
    await runRateLimitProbe();
    captureQueryPlans();
    runEncryptedBackupRestoreRehearsal();
    evidence.checks.securityPrivacy = [
      evidence.checks.adminUnauthenticatedDenied,
      evidence.checks.adminWrongGameDenied,
      evidence.checks.missingPlayerSessionDenied,
      evidence.checks.clientSuppliedOwnershipDenied,
      evidence.checks.wrongGameDenied,
      evidence.checks.expiredSessionDenied,
      evidence.checks.platformJwtRequired,
      evidence.checks.rateLimitEnforced,
    ].every(Boolean);
    evidence.decision = "GO";
  } catch (error) {
    evidence.error = { name: error instanceof Error ? error.name : "Error", message: safeError(error, fixture) };
    evidence.decision = "NO_GO";
  } finally {
    try {
      await cleanupFixture(fixture, evidence.cleanup);
      cleanupComplete = evidence.cleanup.completed;
    } catch (cleanupError) {
      evidence.cleanup.error = safeError(cleanupError, fixture);
      evidence.decision = "NO_GO";
    }
    evidence.completedAt = new Date().toISOString();
    await writeFile(env.evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }

  if (evidence.decision !== "GO" || !cleanupComplete) {
    throw new Error(evidence.error?.message || evidence.cleanup.error || "Connected staging acceptance failed");
  }
}

await main();
