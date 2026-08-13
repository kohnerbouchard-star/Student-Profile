import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildAuthEmailConfig,
  buildAuthEmailPatchBatches,
  managedAuthEmailKeys,
} from "./build-supabase-auth-email-config.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(
  repoRoot,
  "backend/supabase/auth-email-template-manifest.json",
);
const templateRoot = path.join(repoRoot, "backend/supabase/auth-email-templates");

const [staging, production, manifest] = await Promise.all([
  buildAuthEmailConfig("staging"),
  buildAuthEmailConfig("production"),
  fs.readFile(manifestPath, "utf8").then(JSON.parse),
]);

test("Auth email catalog owns every active Supabase authentication and security template", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.manifestId, "econovaria.supabase-auth-email-brand.v1");
  assert.equal(manifest.templates.length, 13);
  assert.equal(new Set(manifest.templates.map((entry) => entry.id)).size, 13);
  assert.equal(managedAuthEmailKeys(manifest).length, 33);
  assert.equal(staging.evidence.templates.length, 13);
  assert.equal(production.evidence.templates.length, 13);
});

test("templates consistently apply the Econovaria dark security design without external images", async () => {
  for (const definition of manifest.templates) {
    const html = await fs.readFile(path.join(templateRoot, definition.file), "utf8");
    assert.match(html, /^<!doctype html>/u);
    assert.match(html, /ECONOVARIA/u);
    assert.match(html, /Econovaria Account Security/u);
    assert.match(html, /#020617/iu);
    assert.match(html, /#0f172a/iu);
    assert.match(html, /#f97316/iu);
    assert.match(html, /#93c5fd/iu);
    assert.doesNotMatch(html, /<img\b|<script\b|<iframe\b|<form\b/iu);
    assert.doesNotMatch(html, /javascript:|(?:[?&]utm_|[?&](?:click|tracking)_id=)/iu);
    assert.ok(Buffer.byteLength(html) < 24 * 1024);
  }
});

test("signup, recovery and magic-link messages require explicit review before token consumption", () => {
  const active = ["confirmation", "recovery", "magic_link"];
  for (const id of active) {
    const definition = manifest.templates.find((entry) => entry.id === id);
    const content = production.payload[definition.contentKey];
    assert.equal(definition.scannerSafe, true);
    assert.match(content, /\{\{ \.TokenHash \}\}/u);
    assert.doesNotMatch(content, /\{\{ \.ConfirmationURL \}\}/u);
    assert.match(content, /review page/iu);
  }
  assert.match(
    production.payload.mailer_templates_confirmation_content,
    /admin-email-verification\?token_hash=\{\{ \.TokenHash \}\}&amp;type=signup/u,
  );
  assert.match(
    production.payload.mailer_templates_magic_link_content,
    /admin-email-verification\?token_hash=\{\{ \.TokenHash \}\}&amp;type=magiclink/u,
  );
  assert.match(
    production.payload.mailer_templates_recovery_content,
    /auth\/recovery-start\.html\?token_hash=\{\{ \.TokenHash \}\}&amp;type=recovery/u,
  );
});

test("staging email is unmistakable and remains bound to the staging Supabase project", () => {
  for (const definition of manifest.templates) {
    const content = staging.payload[definition.contentKey];
    assert.match(content, /STAGING ENVIRONMENT — TEST ACCOUNT MESSAGE/u);
  }
  assert.match(
    staging.payload.mailer_templates_confirmation_content,
    /eecvbssdvarfcykcfrny\.supabase\.co\/functions\/v1\/admin-email-verification/u,
  );
  assert.match(
    staging.payload.mailer_templates_recovery_content,
    /eecvbssdvarfcykcfrny\.supabase\.co\/functions\/v1\/admin-password-recovery/u,
  );
  assert.doesNotMatch(
    staging.payload.mailer_templates_confirmation_content,
    /cgiukdjwicykrmtkhudh/u,
  );
});

test("production email contains no staging banner and is bound to production review surfaces", () => {
  for (const definition of manifest.templates) {
    const content = production.payload[definition.contentKey];
    assert.doesNotMatch(content, /STAGING ENVIRONMENT/u);
  }
  assert.match(
    production.payload.mailer_templates_confirmation_content,
    /cgiukdjwicykrmtkhudh\.supabase\.co\/functions\/v1\/admin-email-verification/u,
  );
  assert.doesNotMatch(
    production.payload.mailer_templates_confirmation_content,
    /eecvbssdvarfcykcfrny/u,
  );
});

test("security notifications are enabled and direct users only to the canonical application", () => {
  const notifications = manifest.templates.filter((entry) => entry.category === "notification");
  assert.equal(notifications.length, 7);
  for (const definition of notifications) {
    assert.equal(production.payload[definition.enabledKey], true);
    assert.match(
      production.payload[definition.contentKey],
      /https:\/\/econovaria\.vercel\.app\/\?mode=admin/u,
    );
  }
});

test("source identity is environment-neutral while rendered payload identity is environment-specific", () => {
  assert.match(staging.evidence.sourceDigest, /^[a-f0-9]{64}$/u);
  assert.equal(staging.evidence.sourceDigest, production.evidence.sourceDigest);
  assert.notEqual(staging.evidence.renderedDigest, production.evidence.renderedDigest);
  assert.equal(staging.evidence.trackingLinksAllowed, false);
  assert.equal(production.evidence.externalImagesAllowed, false);
});


test("deployment payload is split into deterministic bounded template patches", () => {
  for (const built of [staging, production]) {
    const batches = buildAuthEmailPatchBatches(built);
    assert.equal(batches.length, manifest.templates.length);
    assert.deepEqual(
      batches.map((batch) => batch.id),
      manifest.templates.map((definition) => definition.id),
    );
    const reconstructed = Object.assign({}, ...batches.map((batch) => batch.payload));
    assert.deepEqual(reconstructed, built.payload);
    for (const batch of batches) {
      assert.match(batch.fileName, /^\d{2}-[a-z0-9_]+[.]json$/u);
      assert.ok(batch.bytes > 0);
      assert.ok(batch.bytes <= 16 * 1024);
    }
  }
});
