#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  ".github/workflows/production-staff-mfa-normalization-v1.yml",
  "utf8",
);
const entrypoint = readFileSync(
  "backend/supabase/functions/staff-mfa-api/entrypoint.ts",
  "utf8",
);
const localConfig = readFileSync("backend/supabase/config.toml", "utf8");
const deployConfig = readFileSync("backend/supabase/config.next.toml", "utf8");

assert.match(entrypoint, /^import "\.\/runtime-adapter\.ts";\s+import "\.\/index\.ts";\s*$/u);

for (const config of [localConfig, deployConfig]) {
  assert.match(config, /\[functions\.staff-mfa-api\][\s\S]*?verify_jwt\s*=\s*true/u);
  assert.match(
    config,
    /entrypoint\s*=\s*"\.\/functions\/staff-mfa-api\/entrypoint\.ts"/u,
  );
}

for (const marker of [
  "environment: production",
  "refs/heads/main",
  "EXPECTED_PRODUCTION_PROJECT_REF: cgiukdjwicykrmtkhudh",
  "DENIED_STAGING_PROJECT_REF: eecvbssdvarfcykcfrny",
  "supabase functions deploy staff-mfa-api",
  "--project-ref \"$EXPECTED_PRODUCTION_PROJECT_REF\"",
  "row.verify_jwt !== true",
  "entrypoint.ts",
  "test \"$status\" = \"401\"",
]) {
  assert.ok(workflow.includes(marker), `missing Staff MFA production marker: ${marker}`);
}

for (const forbidden of [
  "--no-verify-jwt",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DENIED_STAGING_PROJECT_REF: cgiukdjwicykrmtkhudh",
]) {
  assert.ok(!workflow.includes(forbidden), `forbidden Staff MFA production behavior: ${forbidden}`);
}

console.log("production Staff MFA normalization contract: ok");
