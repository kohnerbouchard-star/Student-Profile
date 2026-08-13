import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(
  repoRoot,
  "backend/supabase/auth-email-template-manifest.json",
);
const ENVIRONMENTS = new Set(["staging", "production"]);
const MODES = new Set(["check", "apply"]);
const RESEND_DOMAINS_URL = "https://api.resend.com/domains";
const SUPABASE_MANAGEMENT_ORIGIN = "https://api.supabase.com";
const DEFAULT_SENDER_NAME = "Econovaria Security";
const MAX_RESPONSE_BYTES = 512 * 1024;

export function parseSenderIdentity(rawValue) {
  const raw = String(rawValue || "").trim();
  const bracketed = /^(.*?)\s*<([^<>]+)>$/u.exec(raw);
  const senderName = bracketed?.[1]?.trim() || DEFAULT_SENDER_NAME;
  const senderEmail = (bracketed?.[2] || raw).trim().toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(senderEmail)) {
    throw new Error("ECONOVARIA_AUTH_EMAIL_FROM must contain a valid email address.");
  }
  const senderDomain = senderEmail.slice(senderEmail.lastIndexOf("@") + 1);
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(senderDomain)) {
    throw new Error("ECONOVARIA_AUTH_EMAIL_FROM contains an invalid sender domain.");
  }
  if (senderName !== DEFAULT_SENDER_NAME) {
    throw new Error(
      `ECONOVARIA_AUTH_EMAIL_FROM must use the sender name ${DEFAULT_SENDER_NAME}.`,
    );
  }
  return { senderName, senderEmail, senderDomain };
}

export function buildSupabaseSmtpPayload(sender, resendApiKey) {
  const password = String(resendApiKey || "").trim();
  if (!/^re_[A-Za-z0-9_-]{8,}$/u.test(password)) {
    throw new Error("RESEND_API_KEY is missing or malformed.");
  }
  return {
    smtp_admin_email: sender.senderEmail,
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: password,
    smtp_sender_name: sender.senderName,
  };
}

export function sanitizeSmtpConfig(config) {
  const value = config && typeof config === "object" ? config : {};
  return {
    configured: Boolean(value.smtp_host && value.smtp_user && value.smtp_admin_email),
    host: String(value.smtp_host || ""),
    port: String(value.smtp_port || ""),
    user: String(value.smtp_user || ""),
    adminEmail: String(value.smtp_admin_email || ""),
    senderName: String(value.smtp_sender_name || ""),
  };
}

export async function configureSupabaseAuthSmtp(input, dependencies = {}) {
  const environment = String(input?.environment || "").trim();
  const mode = String(input?.mode || "check").trim();
  if (!ENVIRONMENTS.has(environment)) {
    throw new Error(`Unsupported Auth email environment: ${environment}`);
  }
  if (!MODES.has(mode)) {
    throw new Error(`Unsupported Auth email SMTP mode: ${mode}`);
  }

  const environmentValue = dependencies.environmentValue ?? ((name) =>
    String(process.env[name] || "").trim());
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const accessToken = environmentValue("SUPABASE_ACCESS_TOKEN");
  const resendApiKey = environmentValue("RESEND_API_KEY");
  const sender = parseSenderIdentity(
    environmentValue("ECONOVARIA_AUTH_EMAIL_FROM"),
  );
  if (!accessToken) throw new Error("SUPABASE_ACCESS_TOKEN is required.");
  const smtpPayload = buildSupabaseSmtpPayload(sender, resendApiKey);

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const environmentConfig = manifest.environments?.[environment];
  const projectRef = String(environmentConfig?.projectRef || "");
  if (!/^[a-z]{20}$/u.test(projectRef)) {
    throw new Error(`Auth email manifest is missing ${environment} project identity.`);
  }

  const resendHeaders = {
    Authorization: `Bearer ${resendApiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "Econovaria-Auth-SMTP/1.0",
  };
  const domainList = await fetchJson(
    fetchImpl,
    RESEND_DOMAINS_URL,
    { headers: resendHeaders, redirect: "error" },
    "Resend domain inventory",
  );
  const domain = Array.isArray(domainList?.data)
    ? domainList.data.find((row) =>
      String(row?.name || "").toLowerCase() === sender.senderDomain)
    : null;
  if (!domain?.id) {
    throw new Error(
      `Resend does not contain the exact sender domain ${sender.senderDomain}.`,
    );
  }
  const domainStatus = String(domain.status || "unknown");
  if (domainStatus !== "verified") {
    throw new Error(
      `Resend sender domain ${sender.senderDomain} is ${domainStatus}; verification must complete before SMTP rollout.`,
    );
  }
  const sendingCapability = String(domain.capabilities?.sending || "unknown");
  if (sendingCapability !== "enabled") {
    throw new Error(
      `Resend sender domain ${sender.senderDomain} does not have sending enabled.`,
    );
  }

  const authConfigUrl =
    `${SUPABASE_MANAGEMENT_ORIGIN}/v1/projects/${projectRef}/config/auth`;
  const managementHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "Econovaria-Auth-SMTP/1.0",
  };
  const beforeRaw = await fetchJson(
    fetchImpl,
    authConfigUrl,
    { headers: managementHeaders, redirect: "error" },
    "Supabase Auth configuration read",
  );
  const before = sanitizeSmtpConfig(beforeRaw);

  let trackingUpdateApplied = false;
  let smtpUpdateApplied = false;
  if (mode === "apply") {
    await fetchJson(
      fetchImpl,
      `${RESEND_DOMAINS_URL}/${encodeURIComponent(String(domain.id))}`,
      {
        method: "PATCH",
        headers: resendHeaders,
        body: JSON.stringify({
          click_tracking: false,
          open_tracking: false,
        }),
        redirect: "error",
      },
      "Resend tracking-policy update",
    );
    trackingUpdateApplied = true;

    await fetchJson(
      fetchImpl,
      authConfigUrl,
      {
        method: "PATCH",
        headers: managementHeaders,
        body: JSON.stringify(smtpPayload),
        redirect: "error",
      },
      "Supabase Auth SMTP update",
    );
    smtpUpdateApplied = true;
  }

  const afterRaw = mode === "apply"
    ? await fetchJson(
      fetchImpl,
      authConfigUrl,
      { headers: managementHeaders, redirect: "error" },
      "Supabase Auth configuration verification",
    )
    : beforeRaw;
  const after = sanitizeSmtpConfig(afterRaw);
  if (mode === "apply") verifyAppliedSmtp(after, sender);

  return {
    before,
    evidence: {
      schemaVersion: 1,
      environment,
      projectRef,
      mode,
      sender: {
        name: sender.senderName,
        email: sender.senderEmail,
        domain: sender.senderDomain,
      },
      resend: {
        domainStatus,
        sendingCapability,
        trackingUpdateApplied,
      },
      smtp: {
        ...after,
        updateApplied: smtpUpdateApplied,
      },
    },
  };
}

function verifyAppliedSmtp(actual, sender) {
  const expected = {
    configured: true,
    host: "smtp.resend.com",
    port: "465",
    user: "resend",
    adminEmail: sender.senderEmail,
    senderName: sender.senderName,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(`Hosted Supabase Auth SMTP verification failed for ${key}.`);
    }
  }
}

async function fetchJson(fetchImpl, url, init, label) {
  const response = await fetchImpl(url, init).catch(() => null);
  if (!response) throw new Error(`${label} failed before receiving a response.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error(`${label} returned an oversized response.`);
  }
  let payload = null;
  if (bytes.byteLength) {
    try {
      payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const message = String(payload?.message || payload?.error || "").slice(0, 240);
    throw new Error(
      `${label} returned HTTP ${response.status}${message ? `: ${message}` : "."}`,
    );
  }
  if (!payload || typeof payload !== "object") {
    throw new Error(`${label} returned an invalid JSON response.`);
  }
  return payload;
}

function parseArguments(argv) {
  const options = {
    environment: "",
    mode: "check",
    beforeOutput: "",
    evidenceOutput: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--environment") {
      options.environment = String(argv[++index] || "");
    } else if (arg === "--mode") {
      options.mode = String(argv[++index] || "");
    } else if (arg === "--before-output") {
      options.beforeOutput = String(argv[++index] || "");
    } else if (arg === "--evidence-output") {
      options.evidenceOutput = String(argv[++index] || "");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.environment || !options.evidenceOutput) {
    throw new Error(
      "Use --environment <staging|production> --mode <check|apply> --evidence-output <path>.",
    );
  }
  return options;
}

async function writeJson(file, value) {
  if (!file) return;
  await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await configureSupabaseAuthSmtp(options);
  await writeJson(options.beforeOutput, result.before);
  await writeJson(options.evidenceOutput, result.evidence);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    environment: result.evidence.environment,
    projectRef: result.evidence.projectRef,
    mode: result.evidence.mode,
    senderDomain: result.evidence.sender.domain,
    resendDomainStatus: result.evidence.resend.domainStatus,
    smtpConfigured: result.evidence.smtp.configured,
  }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
