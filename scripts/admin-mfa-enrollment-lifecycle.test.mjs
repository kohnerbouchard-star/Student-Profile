import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const INDEX = new URL(
  "../backend/supabase/functions/staff-mfa-api/index.ts",
  import.meta.url,
);
const LIFECYCLE = new URL(
  "../backend/supabase/functions/staff-mfa-api/mfaEnrollmentLifecycle.ts",
  import.meta.url,
);

test("canonical MFA entrypoint owns enrollment lifecycle directly", async () => {
  const source = await readFile(INDEX, "utf8");
  assert.match(source, /createCanonicalTotpEnrollment/u);
  assert.match(source, /readVerifiedTotpFactors/u);
  assert.match(source, /contractVersion: "econovaria\.staff-mfa-enrollment\.v1"/u);
  assert.doesNotMatch(source, /runtime-adapter|Deno as unknown as \{ serve/iu);
});

test("provider state is cleaned before replacement and after invalid output", async () => {
  const source = await readFile(LIFECYCLE, "utf8");
  const list = source.indexOf("listFactors()");
  const staleCleanup = source.indexOf("client.auth.mfa.unenroll", list);
  const enroll = source.indexOf("client.auth.mfa.enroll", staleCleanup);
  const rollback = source.indexOf("client.auth.mfa.unenroll", enroll);
  assert.ok(list >= 0);
  assert.ok(staleCleanup > list);
  assert.ok(enroll > staleCleanup);
  assert.ok(rollback > enroll);
  assert.match(source, /factor\.status === "verified"/u);
  assert.doesNotMatch(source, /auth\.mfa_factors|delete\s+from/iu);
});
