declare const Deno: {
  readonly env: {
    get(name: string): string | undefined;
  };
};

import type {
  StaffSignupVerificationType,
} from "./staffSignupSupabaseLink.ts";

export interface StaffSignupVerificationEmailInput {
  readonly email: string;
  readonly displayName: string;
  readonly tokenHash: string;
  readonly verificationType: StaffSignupVerificationType;
  readonly signupRequestId: string;
  readonly deliveryVersion: number;
  readonly expiresAt: string;
}

export interface StaffSignupVerificationEmailDependencies {
  readonly fetchImpl?: typeof fetch;
  readonly environmentValue?: (name: string) => string;
}

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{16,256}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const DELIVERY_TIMEOUT_MS = 10_000;

export async function sendStaffSignupVerificationEmail(
  input: StaffSignupVerificationEmailInput,
  dependencies: StaffSignupVerificationEmailDependencies = {},
): Promise<boolean> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim().slice(0, 120) || "Administrator";
  const deliveryVersion = Number(input.deliveryVersion);
  const expiresAt = new Date(input.expiresAt);
  if (
    !EMAIL_PATTERN.test(email) ||
    !TOKEN_HASH_PATTERN.test(input.tokenHash) ||
    !["signup", "magiclink"].includes(input.verificationType) ||
    !UUID_PATTERN.test(input.signupRequestId) ||
    !Number.isSafeInteger(deliveryVersion) ||
    deliveryVersion < 1 ||
    deliveryVersion > 100 ||
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now()
  ) {
    return false;
  }

  const environmentValue = dependencies.environmentValue ?? readEnvironmentValue;
  const apiKey = environmentValue("RESEND_API_KEY");
  const from = environmentValue("ECONOVARIA_AUTH_EMAIL_FROM");
  const verificationBaseUrl = verificationUrl(environmentValue);
  if (!apiKey || !from || !verificationBaseUrl) return false;

  const verificationUrlValue = new URL(verificationBaseUrl);
  verificationUrlValue.searchParams.set("token_hash", input.tokenHash);
  verificationUrlValue.searchParams.set("type", input.verificationType);
  const idempotencyKey =
    `staff-signup-verification/${input.signupRequestId}/${deliveryVersion}`;
  const pendingExpiryLabel = expiresAt.toISOString();
  const subject = "Confirm your Econovaria administrator email";
  const html = verificationEmailHtml({
    displayName,
    verificationUrl: verificationUrlValue.href,
    pendingSignupExpiresAt: pendingExpiryLabel,
  });
  const text = [
    `Hello ${displayName},`,
    "",
    "Confirm the email address for your Econovaria administrator account:",
    verificationUrlValue.href,
    "",
    "This verification link is time-limited. If it expires, use Resend Email from the account-creation page.",
    `Your pending account request remains available until ${pendingExpiryLabel}.`,
    "If you did not create this account, ignore this message.",
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const response = await (dependencies.fetchImpl ?? fetch)(RESEND_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "User-Agent": "Econovaria-Auth/1.0",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject,
        html,
        text,
        tags: [
          { name: "purpose", value: "staff_signup_verification" },
          { name: "delivery_version", value: String(deliveryVersion) },
        ],
      }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    await response.body?.cancel().catch(() => undefined);
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function verificationUrl(
  environmentValue: (name: string) => string,
): string {
  const configured = environmentValue("ECONOVARIA_EMAIL_VERIFICATION_URL");
  const supabaseUrl = environmentValue("SUPABASE_URL").replace(/\/+$/u, "");
  const candidate = configured ||
    (supabaseUrl
      ? `${supabaseUrl}/functions/v1/admin-email-verification`
      : "");
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:") return "";
    if (parsed.username || parsed.password || parsed.hash) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function readEnvironmentValue(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

function verificationEmailHtml(input: {
  readonly displayName: string;
  readonly verificationUrl: string;
  readonly pendingSignupExpiresAt: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm your Econovaria email</title></head>
<body style="margin:0;background:#020617;color:#e2e8f0;font-family:Arial,sans-serif;padding:24px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#0f172a;border:1px solid #334155;border-radius:16px;padding:32px">
      <tr><td>
        <p style="margin:0 0 12px;color:#93c5fd;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Administrator account verification</p>
        <h1 style="margin:0 0 16px;color:#f8fafc;font-size:28px">Confirm your email address</h1>
        <p style="margin:0 0 20px;line-height:1.6">Hello ${escapeHtml(input.displayName)}. Confirm this mailbox to continue creating your Econovaria administrator account.</p>
        <p style="margin:0 0 24px"><a href="${escapeHtml(input.verificationUrl)}" style="display:inline-block;background:#f97316;color:#111827;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:10px">Review and confirm email</a></p>
        <p style="margin:0 0 10px;color:#94a3b8;font-size:13px;line-height:1.5">The link opens a review page and does not confirm the account until you press the confirmation button.</p>
        <p style="margin:0 0 10px;color:#94a3b8;font-size:13px;line-height:1.5">This verification link is time-limited. If it expires, use Resend Email from the account-creation page.</p>
        <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.5">Your pending account request remains available until ${escapeHtml(input.pendingSignupExpiresAt)}. If you did not create this account, ignore this email.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}
