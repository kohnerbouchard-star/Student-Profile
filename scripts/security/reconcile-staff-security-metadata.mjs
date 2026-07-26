#!/usr/bin/env node

import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const ALLOW_PRODUCTION = process.argv.includes("--allow-production");
const supabaseUrl = requiredUrl(process.env.SUPABASE_URL);
const secretKey = requiredSecret(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const expectedProjectRef = requiredProjectRef(
  process.env.ECONOVARIA_PROJECT_REF,
  "ECONOVARIA_PROJECT_REF",
);
const actualProjectRef = projectRefFromUrl(supabaseUrl);
const productionRefs = new Set(
  String(process.env.ECONOVARIA_PRODUCTION_PROJECT_REFS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

if (actualProjectRef !== expectedProjectRef) {
  fail("Configured Supabase URL does not match ECONOVARIA_PROJECT_REF.");
}
if (productionRefs.has(actualProjectRef) && !ALLOW_PRODUCTION) {
  fail("Production project reconciliation is denied without --allow-production.");
}
if (ALLOW_PRODUCTION && process.env.ECONOVARIA_PRODUCTION_CHANGE_CONFIRMATION !== actualProjectRef) {
  fail(
    "Production reconciliation requires ECONOVARIA_PRODUCTION_CHANGE_CONFIRMATION to exactly equal the project reference.",
  );
}

const client = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: rows, error: staffError } = await client
  .from("staff_users")
  .select(
    "supabase_auth_user_id,status,role,permission_version,security_version,mfa_required",
  )
  .order("created_at", { ascending: true });
if (staffError) fail("Staff security state could not be loaded.");

const counters = {
  inspected: 0,
  alreadyCurrent: 0,
  requiresUpdate: 0,
  updated: 0,
  skippedMissingAuthUser: 0,
  failures: 0,
};

for (const row of rows || []) {
  counters.inspected += 1;
  const authUserId = String(row.supabase_auth_user_id || "");
  if (!authUserId) {
    counters.skippedMissingAuthUser += 1;
    continue;
  }

  const expected = expectedMetadata(row);
  const { data, error } = await client.auth.admin.getUserById(authUserId);
  if (error || !data?.user) {
    counters.skippedMissingAuthUser += 1;
    continue;
  }

  const current = data.user.app_metadata || {};
  if (metadataMatches(current, expected)) {
    counters.alreadyCurrent += 1;
    continue;
  }

  counters.requiresUpdate += 1;
  if (!APPLY) continue;

  const { error: updateError } = await client.auth.admin.updateUserById(
    authUserId,
    { app_metadata: { ...current, ...expected } },
  );
  if (updateError) counters.failures += 1;
  else counters.updated += 1;
}

const result = {
  ok: counters.failures === 0,
  mode: APPLY ? "apply" : "dry-run",
  projectRef: actualProjectRef,
  productionProject: productionRefs.has(actualProjectRef),
  counters,
  nextAction: APPLY
    ? "Require affected staff users to sign in again so new JWT claims are issued."
    : "Review the aggregate counts, then rerun with --apply in isolated staging.",
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function expectedMetadata(row) {
  const status = String(row.status || "disabled");
  const role = String(row.role || "game_admin");
  const permissionVersion = positiveInteger(row.permission_version);
  const securityVersion = positiveInteger(row.security_version);
  return {
    econovaria_role: role,
    permission_version: permissionVersion,
    security_version: securityVersion,
    econovaria_account_status: status,
    econovaria_mfa_required: row.mfa_required !== false,
  };
}

function metadataMatches(current, expected) {
  return Object.entries(expected).every(([key, value]) => current[key] === value);
}

function positiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    fail("A staff security version is invalid.");
  }
  return parsed;
}

function requiredUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("invalid URL");
    }
    return url.origin;
  } catch {
    fail("SUPABASE_URL must be the exact HTTPS project origin.");
  }
}

function projectRefFromUrl(value) {
  const hostname = new URL(value).hostname;
  const match = hostname.match(/^([a-z0-9]{20})\.supabase\.co$/u);
  if (!match) fail("SUPABASE_URL must use a 20-character Supabase project reference.");
  return match[1];
}

function requiredProjectRef(value, name) {
  const normalized = String(value || "").trim();
  if (!/^[a-z0-9]{20}$/u.test(normalized)) {
    fail(`${name} must be a 20-character Supabase project reference.`);
  }
  return normalized;
}

function requiredSecret(value) {
  const normalized = String(value || "").trim();
  if (!normalized.startsWith("sb_secret_") && !normalized.startsWith("eyJ")) {
    fail("A Supabase secret key is required. Browser publishable keys are prohibited.");
  }
  return normalized;
}

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: String(message) }));
  process.exit(1);
}
