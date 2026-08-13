import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [directMailer, canonicalConfirmation] = await Promise.all([
  readFile(
    path.join(
      repoRoot,
      "backend/src/domains/auth/application/staffSignupVerificationEmail.ts",
    ),
    "utf8",
  ),
  readFile(
    path.join(
      repoRoot,
      "backend/supabase/auth-email-templates/confirmation.html",
    ),
    "utf8",
  ),
]);

const brandTokens = ["#020617", "#0f172a", "#334155", "#f97316", "#93c5fd"];

test("direct Resend signup delivery uses the canonical Econovaria security design", () => {
  for (const token of brandTokens) {
    assert.match(directMailer, new RegExp(token.replace("#", "#"), "iu"));
    assert.match(canonicalConfirmation, new RegExp(token.replace("#", "#"), "iu"));
  }

  for (const text of [
    "ECONOVARIA",
    "Administrator account verification",
    "Review and confirm email",
    "Econovaria Account Security",
    "SECURE AUTHENTICATION MESSAGE",
  ]) {
    assert.match(directMailer, new RegExp(text, "u"));
    assert.match(canonicalConfirmation, new RegExp(text, "u"));
  }

  assert.match(directMailer, /width=\"600\"/u);
  assert.match(directMailer, /class=\"email-shell\"/u);
  assert.match(directMailer, /class=\"email-button\"/u);
  assert.match(directMailer, /display:none;max-height:0;overflow:hidden/u);
  assert.doesNotMatch(directMailer, /<img\b|<script\b|<iframe\b|<form\b/iu);
  assert.doesNotMatch(directMailer, /javascript:|(?:[?&]utm_|[?&](?:click|tracking)_id=)/iu);
});

test("direct signup delivery retains scanner-safe token and provider controls", () => {
  assert.match(directMailer, /searchParams\.set\("token_hash", input\.tokenHash\)/u);
  assert.match(directMailer, /searchParams\.set\("type", input\.verificationType\)/u);
  assert.match(directMailer, /does not confirm the account until you press the confirmation button/u);
  assert.match(directMailer, /protects the single-use confirmation token from automated email scanners/u);
  assert.match(directMailer, /Authentication-link click tracking must be disabled/u);
  assert.match(directMailer, /Idempotency-Key/u);
  assert.doesNotMatch(directMailer, /\{\{ \.ConfirmationURL \}\}/u);
});

test("direct signup delivery has deterministic sender and staging identity", () => {
  assert.match(
    directMailer,
    /Econovaria Security <no-reply@econovaria\.com>/u,
  );
  assert.match(directMailer, /STAGING ENVIRONMENT — TEST ACCOUNT MESSAGE/u);
  assert.match(directMailer, /eecvbssdvarfcykcfrny/u);
  assert.match(directMailer, /subjectPrefix = environmentNotice \? "\[STAGING\] " : ""/u);
  assert.match(directMailer, /ECONOVARIA_DEPLOYMENT_ENVIRONMENT/u);
});
