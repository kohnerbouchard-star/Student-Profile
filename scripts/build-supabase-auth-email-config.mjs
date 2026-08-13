import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(
  repoRoot,
  "backend/supabase/auth-email-template-manifest.json",
);
const templateRoot = path.join(
  repoRoot,
  "backend/supabase/auth-email-templates",
);
const MAX_TEMPLATE_BYTES = 24 * 1024;
const ENVIRONMENTS = new Set(["staging", "production"]);

export async function buildAuthEmailConfig(environment) {
  if (!ENVIRONMENTS.has(environment)) {
    throw new Error(`Unsupported Auth email environment: ${environment}`);
  }

  const manifestSource = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestSource);
  const environmentConfig = manifest.environments?.[environment];
  if (!environmentConfig || environmentConfig.projectRef?.length !== 20) {
    throw new Error(`Auth email manifest is missing ${environment} configuration.`);
  }

  const payload = {};
  const templates = [];
  const sourceParts = [stableJson(manifest)];

  for (const definition of manifest.templates ?? []) {
    validateDefinition(definition);
    const absolutePath = path.join(templateRoot, definition.file);
    const raw = await fs.readFile(absolutePath, "utf8");
    sourceParts.push(`${definition.file}\n${raw}`);
    validateRawTemplate(raw, definition, manifest.brand);

    const rendered = renderTemplate(raw, environmentConfig, environment);
    validateRenderedTemplate(rendered, definition, manifest.brand);

    payload[definition.subjectKey] = definition.subject;
    payload[definition.contentKey] = rendered;
    if (definition.enabledKey) payload[definition.enabledKey] = true;

    templates.push({
      id: definition.id,
      category: definition.category,
      subject: definition.subject,
      subjectKey: definition.subjectKey,
      contentKey: definition.contentKey,
      enabledKey: definition.enabledKey ?? null,
      scannerSafe: definition.scannerSafe === true,
      bytes: Buffer.byteLength(rendered),
      digest: sha256(rendered),
    });
  }

  const sourceDigest = sha256(sourceParts.join("\n---\n"));
  const renderedDigest = sha256(stableJson(payload));
  return {
    manifest,
    payload,
    evidence: {
      schemaVersion: 1,
      manifestId: manifest.manifestId,
      environment,
      projectRef: environmentConfig.projectRef,
      sourceDigest,
      renderedDigest,
      trackingLinksAllowed: manifest.brand?.trackingLinksAllowed === true,
      externalImagesAllowed: manifest.brand?.externalImagesAllowed === true,
      templates,
    },
  };
}

export function managedAuthEmailKeys(manifest) {
  const keys = [];
  for (const template of manifest.templates ?? []) {
    keys.push(template.subjectKey, template.contentKey);
    if (template.enabledKey) keys.push(template.enabledKey);
  }
  return [...new Set(keys)].sort();
}

function validateDefinition(definition) {
  for (const key of ["id", "category", "subject", "file", "subjectKey", "contentKey"]) {
    if (!definition?.[key] || typeof definition[key] !== "string") {
      throw new Error(`Auth email template definition is missing ${key}.`);
    }
  }
  if (!/^[a-z0-9_]+$/u.test(definition.id)) {
    throw new Error(`Invalid Auth email template id: ${definition.id}`);
  }
  if (!/^[a-z0-9_]+\.html$/u.test(definition.file)) {
    throw new Error(`Invalid Auth email template file: ${definition.file}`);
  }
  if (!definition.subjectKey.startsWith("mailer_subjects_")) {
    throw new Error(`Invalid Auth email subject key: ${definition.subjectKey}`);
  }
  if (!definition.contentKey.startsWith("mailer_templates_")) {
    throw new Error(`Invalid Auth email content key: ${definition.contentKey}`);
  }
  if (definition.enabledKey && !definition.enabledKey.startsWith("mailer_notifications_")) {
    throw new Error(`Invalid Auth email notification key: ${definition.enabledKey}`);
  }
}

function validateRawTemplate(raw, definition, brand) {
  if (!raw.startsWith("<!doctype html>")) {
    throw new Error(`${definition.file} must be a complete HTML document.`);
  }
  if (!raw.includes("%%ENVIRONMENT_NOTICE%%")) {
    throw new Error(`${definition.file} is missing the environment notice slot.`);
  }
  for (const variable of definition.requiredVariables ?? []) {
    if (!raw.includes(variable)) {
      throw new Error(`${definition.file} is missing required variable ${variable}.`);
    }
  }
  if (definition.scannerSafe && ["confirmation", "recovery", "magic_link"].includes(definition.id)) {
    if (raw.includes("{{ .ConfirmationURL }}")) {
      throw new Error(`${definition.file} must not expose the scanner-consumable ConfirmationURL.`);
    }
    if (!raw.includes("{{ .TokenHash }}")) {
      throw new Error(`${definition.file} must use TokenHash for a review-first flow.`);
    }
  }
  validateEmailHtml(raw, definition.file, brand, true);
}

function validateRenderedTemplate(rendered, definition, brand) {
  if (/%%[A-Z0-9_]+%%/u.test(rendered)) {
    throw new Error(`${definition.file} contains an unresolved deployment marker.`);
  }
  validateEmailHtml(rendered, definition.file, brand, false);
}

function validateEmailHtml(html, file, brand, allowMarkers) {
  const bytes = Buffer.byteLength(html);
  if (bytes === 0 || bytes > MAX_TEMPLATE_BYTES) {
    throw new Error(`${file} must contain 1-${MAX_TEMPLATE_BYTES} bytes; received ${bytes}.`);
  }
  const banned = [
    /<script\b/iu,
    /<iframe\b/iu,
    /<form\b/iu,
    /<img\b/iu,
    /javascript:/iu,
    /data:text\/html/iu,
    /\son[a-z]+\s*=/iu,
    /(?:[?&]utm_|[?&](?:click|tracking)_id=)/iu,
  ];
  for (const pattern of banned) {
    if (pattern.test(html)) throw new Error(`${file} contains prohibited email content: ${pattern}.`);
  }
  for (const token of [brand?.background, brand?.surface, brand?.primary, brand?.accent]) {
    if (!token || !html.toLowerCase().includes(String(token).toLowerCase())) {
      throw new Error(`${file} is missing Econovaria brand token ${token}.`);
    }
  }
  if (!html.includes("ECONOVARIA") || !html.includes("Econovaria Account Security")) {
    throw new Error(`${file} is missing the canonical Econovaria wordmark or security footer.`);
  }
  if (
    !allowMarkers &&
    !/https:\/\//u.test(html) &&
    !html.includes("{{ .ConfirmationURL }}") &&
    !html.includes("{{ .Token }}")
  ) {
    throw new Error(`${file} must contain an HTTPS destination or a supported Supabase Auth action variable after rendering.`);
  }
}

function renderTemplate(raw, environmentConfig, environment) {
  const notice = environmentConfig.notice
    ? `<tr><td class="email-pad" style="padding:0 36px 10px;"><div style="background:#3f1d0b;border:1px solid #9a3412;border-radius:9px;color:#fdba74;font-size:11px;font-weight:900;letter-spacing:.1em;line-height:17px;padding:10px 13px;text-align:center;text-transform:uppercase;">${escapeHtml(environmentConfig.notice)}</div></td></tr>`
    : "";
  const replacements = new Map([
    ["%%ENVIRONMENT_NOTICE%%", notice],
    ["%%VERIFICATION_REVIEW_URL%%", environmentConfig.verificationReviewUrl],
    ["%%RECOVERY_REVIEW_URL%%", environmentConfig.recoveryReviewUrl],
    ["%%APP_SIGN_IN_URL%%", environmentConfig.appSignInUrl],
  ]);
  let output = raw;
  for (const [marker, value] of replacements) output = output.replaceAll(marker, value);
  if (environment === "staging" && !output.includes(environmentConfig.notice)) {
    throw new Error("Staging Auth email rendering lost its environment warning.");
  }
  return output;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildAuthEmailPatchBatches(built) {
  return (built.manifest.templates ?? []).map((definition, index) => {
    const payload = {
      [definition.subjectKey]: built.payload[definition.subjectKey],
      [definition.contentKey]: built.payload[definition.contentKey],
    };
    if (definition.enabledKey) payload[definition.enabledKey] = true;
    return {
      index: index + 1,
      id: definition.id,
      fileName: `${String(index + 1).padStart(2, "0")}-${definition.id}.json`,
      payload,
      bytes: Buffer.byteLength(JSON.stringify(payload)),
    };
  });
}

async function writePatchBatches(directory, built) {
  const absoluteDirectory = path.resolve(directory);
  await fs.rm(absoluteDirectory, { recursive: true, force: true });
  await fs.mkdir(absoluteDirectory, { recursive: true });
  for (const batch of buildAuthEmailPatchBatches(built)) {
    if (batch.bytes > 16 * 1024) {
      throw new Error(`Auth email patch batch ${batch.id} exceeds the 16 KiB deployment boundary.`);
    }
    await writeJson(path.join(absoluteDirectory, batch.fileName), batch.payload);
  }
}

function parseArguments(argv) {
  const options = {
    environment: "",
    output: "",
    evidenceOutput: "",
    batchDirectory: "",
    check: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--environment") options.environment = String(argv[++index] || "");
    else if (arg === "--output") options.output = String(argv[++index] || "");
    else if (arg === "--evidence-output") options.evidenceOutput = String(argv[++index] || "");
    else if (arg === "--batch-directory") options.batchDirectory = String(argv[++index] || "");
    else if (arg === "--check") options.check = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.check) {
    const results = [];
    for (const environment of [...ENVIRONMENTS]) {
      const built = await buildAuthEmailConfig(environment);
      results.push({
        environment,
        projectRef: built.evidence.projectRef,
        sourceDigest: built.evidence.sourceDigest,
        renderedDigest: built.evidence.renderedDigest,
        templates: built.evidence.templates.length,
      });
    }
    process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}\n`);
    return;
  }
  if (!options.environment || (!options.output && !options.batchDirectory)) {
    throw new Error(
      "Use --environment <staging|production> with --output <path> and/or --batch-directory <path>.",
    );
  }
  const built = await buildAuthEmailConfig(options.environment);
  if (options.output) await writeJson(options.output, built.payload);
  if (options.batchDirectory) await writePatchBatches(options.batchDirectory, built);
  if (options.evidenceOutput) await writeJson(options.evidenceOutput, built.evidence);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
