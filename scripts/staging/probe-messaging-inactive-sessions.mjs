#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const EVIDENCE_PATH = process.env.MESSAGING_INACTIVE_SESSION_EVIDENCE_PATH ||
  "/tmp/messaging-inactive-session-evidence.json";
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const KNOWN_PRODUCTION_PROJECT_REFS = new Set([
  "cgiukdjwicykrmtkhudh",
  ...String(process.env.MESSAGING_PRODUCTION_PROJECT_REFS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
]);
const ACCEPTED_INACTIVE_CODES = new Set([
  "invalid_player_session",
  "player_session_expired",
  "invalid_player_session_scope",
]);

if (process.argv.includes("--plan")) {
  console.log(JSON.stringify({
    mode: "plan",
    connectedExecution: false,
    requiredEnvironment: [
      "SUPABASE_PROJECT_REF",
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "MESSAGING_STAGING_EXPIRED_PLAYER_SESSION_TOKEN",
      "MESSAGING_STAGING_PAUSED_PLAYER_SESSION_TOKEN",
      "MESSAGING_STAGING_ENDED_PLAYER_SESSION_TOKEN",
    ],
    guards: [
      "manual dispatch from exact candidate head only",
      "protected staging environment",
      "exact source SHA and artifact digest binding",
      "known production project refs rejected",
      "no game lifecycle mutation performed by the probe",
      "synthetic inactive sessions only",
      "all returned application payloads remain UUID-private",
    ],
    states: [
      "expired Player session denied",
      "paused-game Player session denied",
      "ended-game Player session denied",
    ],
  }, null, 2));
  process.exit(0);
}

const config = readConfig();
const evidence = {
  schemaVersion: 1,
  executedAt: new Date().toISOString(),
  headSha: String(process.env.GITHUB_SHA || "local").slice(0, 64),
  project: {
    ref: config.projectRef,
    production: false,
  },
  credentialsRecorded: false,
  rawInternalIdentifiersRecorded: false,
  productionTouched: false,
  lifecycleMutationPerformed: false,
  checks: {},
};

for (const [name, token] of [
  ["expiredSessionDenied", config.expiredToken],
  ["pausedGameSessionDenied", config.pausedToken],
  ["endedGameSessionDenied", config.endedToken],
]) {
  const payload = await inactiveRequest(token);
  const code = String(payload?.error?.code || "");
  assert(ACCEPTED_INACTIVE_CODES.has(code), `${name} returned an unexpected error contract.`);
  evidence.checks[name] = true;
}

await writeEvidence(evidence);
console.log(JSON.stringify({
  connectedMessagingInactiveSessions: "passed",
  projectRef: config.projectRef,
  checks: Object.keys(evidence.checks).length,
  productionTouched: false,
}, null, 2));

function readConfig() {
  const projectRef = required("SUPABASE_PROJECT_REF");
  const supabaseUrl = new URL(required("SUPABASE_URL"));
  assert(/^[a-z0-9]{20}$/.test(projectRef), "Supabase project ref is invalid.");
  assert(!KNOWN_PRODUCTION_PROJECT_REFS.has(projectRef), "Known production project ref is prohibited.");
  assert(
    supabaseUrl.protocol === "https:" && supabaseUrl.hostname === `${projectRef}.supabase.co`,
    "Supabase URL does not match the isolated project ref.",
  );
  return Object.freeze({
    projectRef,
    supabaseUrl: supabaseUrl.origin,
    anonKey: required("SUPABASE_ANON_KEY"),
    expiredToken: required("MESSAGING_STAGING_EXPIRED_PLAYER_SESSION_TOKEN"),
    pausedToken: required("MESSAGING_STAGING_PAUSED_PLAYER_SESSION_TOKEN"),
    endedToken: required("MESSAGING_STAGING_ENDED_PLAYER_SESSION_TOKEN"),
  });
}

async function inactiveRequest(token) {
  const response = await fetch(`${config.supabaseUrl}/functions/v1/classroom-api/players/me/messages`, {
    method: "GET",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      apikey: config.anonKey,
      authorization: `Bearer ${config.anonKey}`,
      "x-player-session-token": token,
    },
    cache: "no-store",
    redirect: "error",
  });
  const payload = await response.json().catch(() => ({}));
  assertNoSensitiveData(payload);
  assert(response.status === 401, `Inactive Messaging session returned HTTP ${response.status}.`);
  return payload;
}

async function writeEvidence(value) {
  const text = JSON.stringify(value, null, 2);
  assertNoSensitiveData(value);
  await writeFile(EVIDENCE_PATH, `${text}\n`, { mode: 0o600 });
}

function assertNoSensitiveData(value) {
  const text = JSON.stringify(value);
  assert(!UUID_PATTERN.test(text), "Inactive-session payload or evidence leaked an internal UUID.");
  assert(
    !/(eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|service_role|x-player-session-token|authorization)/i.test(text),
    "Inactive-session payload or evidence contains credential-shaped data.",
  );
}

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required staging setting: ${name}.`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
