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
const manifestPath = path.join(repoRoot, "backend/supabase/auth-email-template-manifest.json");
const templateRoot = path.join(repoRoot, "backend/supabase/auth-email-templates");
const [staging, production, manifest] = await Promise.all([
  buildAuthEmailConfig("staging"),
  buildAuthEmailConfig("production"),
  fs.readFile(manifestPath, "utf8").then(JSON.parse),
]);

test("Auth email catalog owns every active template", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.manifestId, "econovaria.supabase-auth-email-brand.v1");
  assert.equal(manifest.templates.length, 13);
  assert.equal(new Set(manifest.templates.map((entry) => entry.id)).size, 13);
  assert.equal(managedAuthEmailKeys(manifest).length, 33);
  assert.equal(staging.evidence.templates.length, 13);
  assert.equal(production.evidence.templates.length, 13);
});

test("templates retain the canonical dark security design", async () => {
  for (const definition of manifest.templates) {
    const html = await fs.readFile(path.join(templateRoot, definition.file), "utf8");
    assert.match(html, /^<!doctype html>/u);
    assert.match(html, /ECONOVARIA/u);
    assert.match(html, /Econovaria Account Security/u);
    for (const token of ["#020617", "#0f172a", "#f97316", "#93c5fd"]) assert.match(html, new RegExp(token, "iu"));
    assert.doesNotMatch(html, /<img\b|<script\b|<iframe\b|<form\b/iu);
    assert.doesNotMatch(html, /javascript:|(?:[?&]utm_|[?&](?:click|tracking)_id=)/iu);
    assert.ok(Buffer.byteLength(html) < 24 * 1024);
  }
});

test("scanner-safe auth messages route to web-hosted review pages", () => {
  for (const id of ["confirmation", "recovery", "magic_link"]) {
    const definition = manifest.templates.find((entry) => entry.id === id);
    const content = production.payload[definition.contentKey];
    assert.equal(definition.scannerSafe, true);
    assert.match(content, /\{\{ \.TokenHash \}\}/u);
    assert.doesNotMatch(content, /\{\{ \.ConfirmationURL \}\}/u);
    assert.doesNotMatch(content, /\.supabase\.co\/functions\/v1\/admin-(?:email-verification|password-recovery)/u);
  }
  assert.match(
    production.payload.mailer_templates_confirmation_content,
    /https:\/\/www\.econovaria\.com\/auth\/security-review\.html\?token_hash=\{\{ \.TokenHash \}\}&amp;type=signup/u,
  );
  assert.match(
    production.payload.mailer_templates_magic_link_content,
    /https:\/\/www\.econovaria\.com\/auth\/security-review\.html\?token_hash=\{\{ \.TokenHash \}\}&amp;type=magiclink/u,
  );
  assert.match(
    production.payload.mailer_templates_recovery_content,
    /https:\/\/www\.econovaria\.com\/auth\/recovery-start\.html\?token_hash=\{\{ \.TokenHash \}\}&amp;type=recovery/u,
  );
});

test("staging remains unmistakable without using Supabase as an HTML host", () => {
  for (const definition of manifest.templates) {
    assert.match(staging.payload[definition.contentKey], /STAGING ENVIRONMENT — TEST ACCOUNT MESSAGE/u);
  }
  for (const key of [
    "mailer_templates_confirmation_content",
    "mailer_templates_recovery_content",
    "mailer_templates_magic_link_content",
  ]) {
    assert.match(staging.payload[key], /https:\/\/www\.econovaria\.com\/auth\//u);
    assert.doesNotMatch(staging.payload[key], /\.supabase\.co\/functions\/v1/u);
  }
});

test("production contains no staging banner", () => {
  for (const definition of manifest.templates) {
    assert.doesNotMatch(production.payload[definition.contentKey], /STAGING ENVIRONMENT/u);
  }
});

test("security notifications use the canonical application domain", () => {
  const notifications = manifest.templates.filter((entry) => entry.category === "notification");
  assert.equal(notifications.length, 7);
  for (const definition of notifications) {
    assert.equal(production.payload[definition.enabledKey], true);
    assert.match(production.payload[definition.contentKey], /https:\/\/www\.econovaria\.com\/\?mode=admin/u);
  }
});

test("source identity remains deterministic across environments", () => {
  assert.match(staging.evidence.sourceDigest, /^[a-f0-9]{64}$/u);
  assert.equal(staging.evidence.sourceDigest, production.evidence.sourceDigest);
  assert.notEqual(staging.evidence.renderedDigest, production.evidence.renderedDigest);
  assert.equal(staging.evidence.trackingLinksAllowed, false);
  assert.equal(production.evidence.externalImagesAllowed, false);
});

test("deployment payload remains split into bounded deterministic patches", () => {
  for (const built of [staging, production]) {
    const batches = buildAuthEmailPatchBatches(built);
    assert.equal(batches.length, manifest.templates.length);
    assert.deepEqual(batches.map((batch) => batch.id), manifest.templates.map((definition) => definition.id));
    assert.deepEqual(Object.assign({}, ...batches.map((batch) => batch.payload)), built.payload);
    for (const batch of batches) {
      assert.match(batch.fileName, /^\d{2}-[a-z0-9_]+[.]json$/u);
      assert.ok(batch.bytes > 0 && batch.bytes <= 16 * 1024);
    }
  }
});
