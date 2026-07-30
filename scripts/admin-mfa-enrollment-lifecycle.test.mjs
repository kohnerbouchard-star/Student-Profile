import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ADAPTER = new URL(
  "../backend/supabase/functions/staff-mfa-api/runtime-adapter.ts",
  import.meta.url,
);
const ENTRYPOINT = new URL(
  "../backend/supabase/functions/staff-mfa-api/entrypoint.ts",
  import.meta.url,
);
const LOCAL_CONFIG = new URL("../backend/supabase/config.toml", import.meta.url);
const DEPLOY_CONFIG = new URL("../backend/supabase/config.next.toml", import.meta.url);

test("MFA enrollment authorizes before stale-factor cleanup", async () => {
  const source = await readFile(ADAPTER, "utf8");
  const authorization = source.indexOf("authorizeEnrollment(handler, request, info)");
  const cleanup = source.indexOf("cleanupAbandonedEnrollment(request)", authorization);
  assert.ok(authorization >= 0, "authorization probe must be present");
  assert.ok(cleanup > authorization, "cleanup must run only after staff authorization");
});

test("MFA enrollment preserves verified factors and uses the supported Auth API", async () => {
  const source = await readFile(ADAPTER, "utf8");
  assert.match(source, /factor\.status === "verified"/u);
  assert.match(source, /mfa_factor_name_conflict/u);
  assert.match(source, /factor\.status !== "unverified"/u);
  assert.match(source, /client\.auth\.mfa\.unenroll\(\{ factorId \}\)/u);
  assert.doesNotMatch(source, /auth\.mfa_factors|delete\s+from/iu);
});

test("failed QR normalization removes only the abandoned unverified setup", async () => {
  const source = await readFile(ADAPTER, "utf8");
  const invalidPayload = source.indexOf("invalid_mfa_qr_payload");
  const cleanupBeforeFailure = source.lastIndexOf(
    "cleanupAbandonedEnrollment(request)",
    invalidPayload,
  );
  assert.ok(cleanupBeforeFailure >= 0, "failed rendering must clean the abandoned factor");
  assert.ok(cleanupBeforeFailure < invalidPayload);
});

test("local and hosted Staff MFA deployment use the normalization adapter", async () => {
  const [entrypoint, localConfig, deployConfig] = await Promise.all([
    readFile(ENTRYPOINT, "utf8"),
    readFile(LOCAL_CONFIG, "utf8"),
    readFile(DEPLOY_CONFIG, "utf8"),
  ]);
  assert.match(entrypoint, /^import "\.\/runtime-adapter\.ts";\s+import "\.\/index\.ts";\s*$/u);
  for (const config of [localConfig, deployConfig]) {
    assert.match(config, /\[functions\.staff-mfa-api\][\s\S]*?verify_jwt\s*=\s*true/u);
    assert.match(
      config,
      /entrypoint\s*=\s*"\.\/functions\/staff-mfa-api\/entrypoint\.ts"/u,
    );
  }
});
