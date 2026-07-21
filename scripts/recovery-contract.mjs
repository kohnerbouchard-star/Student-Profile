import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const templatePaths = [
  "docs/operations/backup-manifest.template.json",
  "docs/operations/restore-rehearsal.template.json",
  "docs/operations/connected-access-smoke.template.json",
];

const SHA40 = /^[a-f0-9]{40}$/;
const SHA64 = /^[a-f0-9]{64}$/;
const REF = /^[a-z0-9]{20}$/;
const sensitiveKey = /(password|token|secretvalue|connection|string|service.?role.?key|anon.?key|authorization|cookie|access.?code)/i;
const sensitiveValue = /(postgres(?:ql)?:\/\/|bearer\s+[a-z0-9._-]+|eyJ[a-zA-Z0-9_-]{20,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/i;

export function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

export function scanSensitive(value, trail = []) {
  const failures = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => failures.push(...scanSensitive(item, [...trail, index])));
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (sensitiveKey.test(key) && nested && !["containsSecretValues", "encryptionKeyReference"].includes(key)) {
        failures.push(`${[...trail, key].join(".")}: sensitive key is prohibited`);
      }
      failures.push(...scanSensitive(nested, [...trail, key]));
    }
  } else if (typeof value === "string" && sensitiveValue.test(value)) {
    failures.push(`${trail.join(".")}: sensitive-looking value is prohibited`);
  }
  return failures;
}

function requireValue(condition, message, failures) {
  if (!condition) failures.push(message);
}

export function validateTemplates(documents) {
  const failures = [];
  for (const [name, document] of Object.entries(documents)) {
    requireValue(document.schemaVersion === 1, `${name}: schemaVersion must be 1`, failures);
    requireValue(document.productionModified === false, `${name}: productionModified must be false`, failures);
    requireValue(document.containsSecretValues === false, `${name}: containsSecretValues must be false`, failures);
    failures.push(...scanSensitive(document).map((failure) => `${name}: ${failure}`));
  }

  const backup = documents.backup;
  const restore = documents.restore;
  const smoke = documents.smoke;
  requireValue(backup.status === "planned", "backup: template must remain planned", failures);
  requireValue(backup.environment === "isolated-staging", "backup: environment must be isolated-staging", failures);
  requireValue(backup.archive?.storageClass === "approved-immutable-off-platform", "backup: immutable storage class is required", failures);
  requireValue(restore.status === "planned", "restore: template must remain planned", failures);
  requireValue(restore.targetProjectRef !== restore.productionProjectRef, "restore: target must differ from production", failures);
  requireValue(restore.targetProjectRef !== restore.sourceProjectRef, "restore: target must differ from source", failures);
  requireValue(smoke.environment === "isolated-staging", "smoke: environment must be isolated-staging", failures);
  return failures;
}

export function validateEvidence({ backup, restore, smoke }) {
  const failures = [];
  for (const [name, document] of Object.entries({ backup, restore, smoke })) {
    requireValue(document.schemaVersion === 1, `${name}: schemaVersion must be 1`, failures);
    requireValue(document.productionModified === false, `${name}: productionModified must be false`, failures);
    requireValue(document.containsSecretValues === false, `${name}: containsSecretValues must be false`, failures);
    failures.push(...scanSensitive(document).map((failure) => `${name}: ${failure}`));
  }
  requireValue(backup.status === "complete", "backup: status must be complete", failures);
  requireValue(SHA40.test(backup.sourceCommit ?? ""), "backup: full source commit is required", failures);
  requireValue(REF.test(backup.sourceProjectRef ?? ""), "backup: source project ref is invalid", failures);
  requireValue(SHA64.test(backup.archive?.sha256 ?? ""), "backup: archive SHA-256 is required", failures);
  requireValue(Number.isSafeInteger(backup.archive?.sizeBytes) && backup.archive.sizeBytes > 0, "backup: positive archive size is required", failures);
  requireValue(restore.status === "complete", "restore: status must be complete", failures);
  requireValue(REF.test(restore.sourceProjectRef ?? "") && REF.test(restore.targetProjectRef ?? "") && REF.test(restore.productionProjectRef ?? ""), "restore: project refs are invalid", failures);
  requireValue(new Set([restore.sourceProjectRef, restore.targetProjectRef, restore.productionProjectRef]).size === 3, "restore: source, target, and production must be distinct", failures);
  requireValue(SHA40.test(restore.releaseCommit ?? ""), "restore: full release commit is required", failures);
  requireValue(restore.backupSha256 === backup.archive.sha256, "restore: backup digest mismatch", failures);
  requireValue(Object.values(restore.checks ?? {}).every((value) => value === "passed"), "restore: every check must pass", failures);
  requireValue(Number.isFinite(restore.rpoMinutes) && restore.rpoMinutes >= 0, "restore: measured RPO is required", failures);
  requireValue(Number.isFinite(restore.rtoMinutes) && restore.rtoMinutes >= 0, "restore: measured RTO is required", failures);
  requireValue(smoke.releaseCommit === restore.releaseCommit, "smoke: release commit mismatch", failures);
  requireValue(smoke.supabaseProjectRef === restore.targetProjectRef, "smoke: target project mismatch", failures);
  requireValue([smoke.admin?.result, smoke.playerDesktop?.result, smoke.playerMobile?.result].every((value) => value === "passed"), "smoke: all connected surfaces must pass", failures);
  return failures;
}

function loadTemplates() {
  const [backup, restore, smoke] = templatePaths.map(readJson);
  return { backup, restore, smoke };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, ...args] = process.argv.slice(2);
  let failures;
  if (command === "validate-templates") {
    failures = validateTemplates(loadTemplates());
  } else if (command === "validate-evidence" && args.length === 3) {
    failures = validateEvidence({ backup: readJson(args[0]), restore: readJson(args[1]), smoke: readJson(args[2]) });
  } else {
    console.error("Use validate-templates or validate-evidence <backup.json> <restore.json> <smoke.json>.");
    process.exitCode = 1;
  }
  if (failures) {
    if (failures.length) {
      console.error("Recovery contract validation failed:\n- " + failures.join("\n- "));
      process.exitCode = 1;
    } else {
      console.log("Recovery contract validation passed.");
    }
  }
}
