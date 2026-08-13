import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildAuthEmailConfig, managedAuthEmailKeys } from "./build-supabase-auth-email-config.mjs";

function parseArguments(argv) {
  const options = { environment: "", actual: "", evidenceOutput: "", snapshotOutput: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--environment") options.environment = String(argv[++index] || "");
    else if (arg === "--actual") options.actual = String(argv[++index] || "");
    else if (arg === "--evidence-output") options.evidenceOutput = String(argv[++index] || "");
    else if (arg === "--snapshot-output") options.snapshotOutput = String(argv[++index] || "");
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.environment || !options.actual) {
    throw new Error("Use --environment <staging|production> and --actual <Supabase Auth config JSON>.");
  }
  return options;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

async function writeJson(file, value) {
  if (!file) return;
  await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function selectedSnapshot(actual, manifest) {
  const selected = {};
  for (const key of managedAuthEmailKeys(manifest)) {
    if (!(key in actual)) continue;
    const value = actual[key];
    selected[key] = key.startsWith("mailer_templates_")
      ? { bytes: Buffer.byteLength(String(value || "")), digest: sha256(value || "") }
      : value;
  }
  return selected;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const built = await buildAuthEmailConfig(options.environment);
  const actual = JSON.parse(await fs.readFile(options.actual, "utf8"));
  const mismatches = [];

  for (const key of managedAuthEmailKeys(built.manifest)) {
    if (!(key in actual)) {
      mismatches.push({ key, reason: "missing" });
      continue;
    }
    if (actual[key] !== built.payload[key]) {
      mismatches.push({
        key,
        reason: "different",
        expectedDigest: key.startsWith("mailer_templates_") ? sha256(built.payload[key]) : null,
        actualDigest: key.startsWith("mailer_templates_") ? sha256(actual[key]) : null,
      });
    }
  }

  const evidence = {
    ...built.evidence,
    verified: mismatches.length === 0,
    customSmtpConfigured: Boolean(actual.smtp_host && actual.smtp_user && actual.smtp_admin_email),
    mismatches,
  };
  await writeJson(options.snapshotOutput, selectedSnapshot(actual, built.manifest));
  await writeJson(options.evidenceOutput, evidence);
  if (mismatches.length) {
    throw new Error(`Hosted Supabase Auth email configuration differs in ${mismatches.length} managed field(s).`);
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    environment: options.environment,
    projectRef: built.evidence.projectRef,
    sourceDigest: built.evidence.sourceDigest,
    renderedDigest: built.evidence.renderedDigest,
    templates: built.evidence.templates.length,
    customSmtpConfigured: evidence.customSmtpConfigured,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
