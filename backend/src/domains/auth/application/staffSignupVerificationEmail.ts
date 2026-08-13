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
const DEFAULT_AUTH_EMAIL_FROM =
  "Econovaria Security <no-reply@econovaria.com>";
const STAGING_PROJECT_REF = "eecvbssdvarfcykcfrny";
const STAGING_NOTICE = "STAGING ENVIRONMENT — TEST ACCOUNT MESSAGE";
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
  const from = environmentValue("ECONOVARIA_AUTH_EMAIL_FROM") ||
    DEFAULT_AUTH_EMAIL_FROM;
  const verificationBaseUrl = verificationUrl(environmentValue);
  if (!apiKey || !from || !verificationBaseUrl) return false;

  // Authentication-link click tracking must be disabled on the provider sending
  // domain. Tracking systems can rewrite single-use verification URLs. Delivery,
  // bounce and complaint telemetry may remain enabled.
  const verificationUrlValue = new URL(verificationBaseUrl);
  verificationUrlValue.searchParams.set("token_hash", input.tokenHash);
  verificationUrlValue.searchParams.set("type", input.verificationType);
  const idempotencyKey =
    `staff-signup-verification/${input.signupRequestId}/${deliveryVersion}`;
  const expiryLabel = expiresAt.toISOString();
  const environmentNotice = verificationEnvironmentNotice(environmentValue);
  const subjectPrefix = environmentNotice ? "[STAGING] " : "";
  const subject =
    `${subjectPrefix}Confirm your Econovaria administrator email`;
  const html = verificationEmailHtml({
    displayName,
    verificationUrl: verificationUrlValue.href,
    expiresAt: expiryLabel,
    environmentNotice,
  });
  const text = [
    ...(environmentNotice ? [environmentNotice, ""] : []),
    `Hello ${displayName},`,
    "",
    "Confirm the email address for your Econovaria administrator account:",
    verificationUrlValue.href,
    "",
    "The link opens a review page and does not confirm the account until you press the confirmation button.",
    `The pending account remains available until ${expiryLabel}. Verification links are time-limited; request a new email if this link has expired.`,
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

function verificationEnvironmentNotice(
  environmentValue: (name: string) => string,
): string {
  const explicit = environmentValue("ECONOVARIA_DEPLOYMENT_ENVIRONMENT")
    .trim()
    .toLowerCase();
  if (explicit === "staging") return STAGING_NOTICE;
  if (explicit === "production") return "";

  const supabaseUrl = environmentValue("SUPABASE_URL");
  try {
    const parsed = new URL(supabaseUrl);
    return parsed.hostname === `${STAGING_PROJECT_REF}.supabase.co`
      ? STAGING_NOTICE
      : "";
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
  readonly expiresAt: string;
  readonly environmentNotice: string;
}): string {
  const noticeRow = input.environmentNotice
    ? `<tr><td class="email-pad" style="padding:0 36px 10px;"><div style="background:#3f1d0b;border:1px solid #9a3412;border-radius:9px;color:#fdba74;font-size:11px;font-weight:900;letter-spacing:.1em;line-height:17px;padding:10px 13px;text-align:center;text-transform:uppercase;">${escapeHtml(input.environmentNotice)}</div></td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>Confirm your email address</title>
  <style>
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; }
      .email-pad { padding-left: 22px !important; padding-right: 22px !important; }
      .email-title { font-size: 28px !important; line-height: 34px !important; }
      .email-button { display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#020617;color:#f8fafc;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px;">Confirm the email address for your Econovaria administrator account.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#020617" style="width:100%;background:#020617;">
    <tr>
      <td align="center" style="padding:32px 14px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="email-shell" style="width:600px;max-width:600px;">
          <tr>
            <td style="height:5px;background:#f97316;border-radius:16px 16px 0 0;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td bgcolor="#0f172a" style="background:#0f172a;border:1px solid #334155;border-top:0;border-radius:0 0 16px 16px;box-shadow:0 24px 80px rgba(0,0,0,.35);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td class="email-pad" style="padding:30px 36px 18px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;background:#f97316;border-radius:9px;color:#111827;font-size:18px;font-weight:900;line-height:34px;">E</td>
                        <td style="padding-left:12px;color:#f8fafc;font-size:18px;font-weight:900;letter-spacing:.16em;line-height:24px;">ECONOVARIA</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${noticeRow}
                <tr>
                  <td class="email-pad" style="padding:16px 36px 8px;">
                    <div style="margin:0 0 11px;color:#93c5fd;font-size:12px;font-weight:800;letter-spacing:.13em;line-height:18px;text-transform:uppercase;">Administrator account verification</div>
                    <h1 class="email-title" style="margin:0;color:#f8fafc;font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:40px;">Confirm your email address</h1>
                  </td>
                </tr>
                <tr>
                  <td class="email-pad" style="padding:12px 36px 4px;color:#cbd5e1;font-size:16px;line-height:26px;">
                    <p style="margin:0 0 16px;">Hello ${escapeHtml(input.displayName)}. A request was made to create an Econovaria administrator account using this email address.</p>
                    <p style="margin:0 0 16px;">Review the request before confirming mailbox ownership.</p>
                  </td>
                </tr>
                <tr>
                  <td class="email-pad" style="padding:18px 36px 8px;">
                    <a href="${escapeHtml(input.verificationUrl)}" class="email-button" style="display:inline-block;background:#f97316;border:1px solid #f97316;border-radius:10px;color:#111827;font-size:15px;font-weight:900;letter-spacing:.01em;line-height:20px;padding:14px 20px;text-decoration:none;">Review and confirm email</a>
                    <div style="margin-top:13px;color:#94a3b8;font-size:12px;line-height:19px;">The review page will not confirm the address until you press its confirmation button.</div>
                  </td>
                </tr>
                <tr>
                  <td class="email-pad" style="padding:18px 36px 6px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#111c31;border:1px solid #334155;border-radius:11px;">
                      <tr>
                        <td style="padding:16px 18px;color:#cbd5e1;font-size:13px;line-height:21px;">
                          <div style="margin-bottom:5px;color:#93c5fd;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">Security note</div>
                          This two-step review protects the single-use confirmation token from automated email scanners. The pending account remains available until ${escapeHtml(input.expiresAt)}. The link is time-limited and can be used only once.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="email-pad" style="padding:18px 36px 4px;color:#94a3b8;font-size:12px;line-height:19px;word-break:break-all;">
                    If the button is unavailable, copy this address into your browser:<br>
                    <a href="${escapeHtml(input.verificationUrl)}" style="color:#93c5fd;text-decoration:underline;">${escapeHtml(input.verificationUrl)}</a>
                  </td>
                </tr>
                <tr>
                  <td class="email-pad" style="padding:25px 36px 32px;">
                    <div style="border-top:1px solid #334155;padding-top:18px;color:#94a3b8;font-size:12px;line-height:19px;">
                      <strong style="color:#cbd5e1;font-weight:700;">SECURE AUTHENTICATION MESSAGE</strong><br>
                      Econovaria Account Security &middot; Automated transactional message<br>
                      Do not forward authentication links or verification codes.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:18px 18px 0;color:#64748b;font-size:11px;line-height:17px;">
              &copy; Econovaria. This message concerns account access or account security.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
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
