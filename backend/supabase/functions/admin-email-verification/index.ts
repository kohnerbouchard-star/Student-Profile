const MAX_FORM_BYTES = 2_048;
const MAX_SERVICE_RESPONSE_BYTES = 64 * 1_024;
const CHALLENGE_TTL_SECONDS = 10 * 60;
const CHALLENGE_COOKIE = "__Host-econovaria_email_verification_challenge";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/u;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FUNCTION_PATH = "/functions/v1/admin-email-verification";
const DEFAULT_RETURN_URL = "https://econovaria.vercel.app/?mode=admin&reason=email-verified";

Deno.serve(handleAdminEmailVerificationRequest);

interface RuntimeConfig {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly returnUrl: string;
}

interface VerificationResolutionRow {
  readonly signup_request_id?: unknown;
  readonly auth_user_id?: unknown;
  readonly decision?: unknown;
}

export async function handleAdminEmailVerificationRequest(
  request: Request,
): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method === "GET") return renderConfirmation(request);
  if (method === "POST") return consumeConfirmation(request);
  return htmlResponse(405, errorPage(
    "Unsupported request",
    "Use the newest verification email sent by Econovaria.",
  ), { Allow: "GET, POST" });
}

function renderConfirmation(request: Request): Response {
  const runtime = readRuntimeConfig();
  if (!runtime) return unavailable();

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return invalidRequest();
  }
  const token = String(url.searchParams.get("token") || "").trim();
  if (!TOKEN_PATTERN.test(token)) return invalidRequest();

  const challenge = randomBase64Url(32);
  const action = `${runtime.supabaseUrl}${FUNCTION_PATH}`;
  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>Confirm Econovaria Email</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <main class="shell">
    <section class="card" aria-labelledby="verification-title">
      <span class="kicker">Administrator account verification</span>
      <h1 id="verification-title">Confirm your email address</h1>
      <p>Continue only if you created this Econovaria administrator account.</p>
      <form method="post" action="${escapeHtml(action)}" autocomplete="off">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <input type="hidden" name="challenge" value="${challenge}">
        <button type="submit">Confirm Email Address</button>
      </form>
      <a class="back" href="${escapeHtml(runtime.returnUrl)}" rel="noreferrer">Return to administrator sign-in</a>
    </section>
  </main>
</body>
</html>`;

  return htmlResponse(200, body, {
    "Set-Cookie": `${CHALLENGE_COOKIE}=${challenge}; Path=/; Max-Age=${CHALLENGE_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
  });
}

async function consumeConfirmation(request: Request): Promise<Response> {
  const runtime = readRuntimeConfig();
  if (!runtime) return unavailable();

  if (String(request.headers.get("origin") || "") !== runtime.supabaseUrl) {
    return verificationFailure(403, runtime.returnUrl);
  }
  const contentType = String(request.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    return verificationFailure(415, runtime.returnUrl);
  }
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FORM_BYTES) {
    return verificationFailure(413, runtime.returnUrl);
  }

  const rawBody = await request.text().catch(() => "");
  if (!rawBody || new TextEncoder().encode(rawBody).byteLength > MAX_FORM_BYTES) {
    return verificationFailure(rawBody ? 413 : 400, runtime.returnUrl);
  }
  const form = new URLSearchParams(rawBody);
  if ([...form.keys()].some((key) => !["token", "challenge"].includes(key))) {
    return verificationFailure(400, runtime.returnUrl);
  }
  const token = String(form.get("token") || "").trim();
  const challenge = String(form.get("challenge") || "").trim();
  const cookieChallenge = readCookie(request.headers.get("cookie"), CHALLENGE_COOKIE);
  if (
    !TOKEN_PATTERN.test(token) ||
    !CHALLENGE_PATTERN.test(challenge) ||
    !constantTimeEqual(challenge, cookieChallenge)
  ) {
    return verificationFailure(400, runtime.returnUrl);
  }

  const tokenHash = await sha256Hex(
    `econovaria.staff-signup.verification.v1\n${token}`,
  );
  if (!TOKEN_HASH_PATTERN.test(tokenHash)) {
    return verificationFailure(400, runtime.returnUrl);
  }

  const resolution = await serviceRpc<VerificationResolutionRow[]>(
    runtime,
    "resolve_staff_signup_verification_token_v1",
    { p_token_hash: tokenHash },
  );
  const row = firstResolutionRow(resolution);
  const signupRequestId = String(row?.signup_request_id || "").trim();
  const authUserId = String(row?.auth_user_id || "").trim();
  const decision = String(row?.decision || "").trim();
  if (
    !UUID_PATTERN.test(signupRequestId) ||
    !UUID_PATTERN.test(authUserId) ||
    !["confirm", "already_verified"].includes(decision)
  ) {
    return verificationFailure(400, runtime.returnUrl);
  }

  if (decision === "confirm") {
    const confirmed = await confirmAuthEmail(runtime, authUserId);
    if (!confirmed) return unavailable(runtime.returnUrl);

    const completed = await serviceRpc<boolean>(
      runtime,
      "complete_staff_signup_email_verification_v1",
      {
        p_signup_request_id: signupRequestId,
        p_auth_user_id: authUserId,
        p_token_hash: tokenHash,
      },
    );
    if (completed !== true) return unavailable(runtime.returnUrl);
  }

  return new Response(null, {
    status: 303,
    headers: securityHeaders({
      Location: runtime.returnUrl,
      ...clearChallengeHeaders(),
    }),
  });
}

async function confirmAuthEmail(
  runtime: RuntimeConfig,
  authUserId: string,
): Promise<boolean> {
  const response = await fetch(
    `${runtime.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`,
    {
      method: "PUT",
      headers: serviceHeaders(runtime, true),
      body: JSON.stringify({ email_confirm: true }),
      cache: "no-store",
      redirect: "error",
    },
  ).catch(() => null);
  if (!response) return false;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok || bytes.byteLength === 0 || bytes.byteLength > MAX_SERVICE_RESPONSE_BYTES) {
    return false;
  }
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return String(value?.id || value?.user?.id || "") === authUserId &&
      Boolean(value?.email_confirmed_at || value?.user?.email_confirmed_at);
  } catch {
    return false;
  }
}

async function serviceRpc<T>(
  runtime: RuntimeConfig,
  functionName: string,
  body: Record<string, unknown>,
): Promise<T | null> {
  const response = await fetch(
    `${runtime.supabaseUrl}/rest/v1/rpc/${encodeURIComponent(functionName)}`,
    {
      method: "POST",
      headers: {
        ...serviceHeaders(runtime, true),
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
    },
  ).catch(() => null);
  if (!response) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok || bytes.byteLength === 0 || bytes.byteLength > MAX_SERVICE_RESPONSE_BYTES) {
    return null;
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as T;
  } catch {
    return null;
  }
}

function serviceHeaders(
  runtime: RuntimeConfig,
  json: boolean,
): Record<string, string> {
  return {
    apikey: runtime.serviceRoleKey,
    Authorization: `Bearer ${runtime.serviceRoleKey}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function firstResolutionRow(
  value: VerificationResolutionRow[] | null,
): VerificationResolutionRow | null {
  return Array.isArray(value) && value[0] && typeof value[0] === "object"
    ? value[0]
    : null;
}

function readRuntimeConfig(): RuntimeConfig | null {
  const supabaseUrl = environmentValue("SUPABASE_URL")
    .replace(/\/+$/u, "");
  const serviceRoleKey = firstConfigured([
    environmentValue("SUPABASE_SECRET_KEY"),
    environmentValue("SECRET_KEY"),
    ...dictionaryValues(environmentValue("SUPABASE_SECRET_KEYS")),
    environmentValue("SUPABASE_SERVICE_ROLE_KEY"),
  ]);
  const returnUrl = environmentValue("ECONOVARIA_EMAIL_VERIFICATION_RETURN_URL") ||
    DEFAULT_RETURN_URL;
  try {
    const parsedSupabase = new URL(supabaseUrl);
    const parsedReturn = new URL(returnUrl);
    if (
      parsedSupabase.protocol !== "https:" ||
      !parsedSupabase.hostname.endsWith(".supabase.co") ||
      parsedSupabase.pathname !== "/" ||
      !serviceRoleKey ||
      parsedReturn.protocol !== "https:" ||
      parsedReturn.username ||
      parsedReturn.password
    ) return null;
    return {
      supabaseUrl: parsedSupabase.origin,
      serviceRoleKey,
      returnUrl: parsedReturn.href,
    };
  } catch {
    return null;
  }
}

function environmentValue(name: string): string {
  try {
    return String(Deno.env.get(name) || "").trim();
  } catch {
    return "";
  }
}

function dictionaryValues(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.values(parsed)
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function firstConfigured(values: readonly string[]): string {
  return values.find(Boolean) || "";
}

function invalidRequest(): Response {
  return htmlResponse(400, errorPage(
    "Invalid verification request",
    "This verification link is invalid or incomplete. Request a new email from the account-creation page.",
  ));
}

function verificationFailure(status = 400, returnUrl = DEFAULT_RETURN_URL): Response {
  return htmlResponse(status, errorPage(
    "Verification link unavailable",
    "This verification link is invalid, expired, or already used. Request a new email from the account-creation page.",
    returnUrl,
  ), clearChallengeHeaders());
}

function unavailable(returnUrl = DEFAULT_RETURN_URL): Response {
  return htmlResponse(503, errorPage(
    "Verification temporarily unavailable",
    "Email verification is temporarily unavailable. Try again shortly.",
    returnUrl,
  ), clearChallengeHeaders());
}

function readCookie(header: string | null, name: string): string {
  for (const segment of String(header || "").split(";")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    if (segment.slice(0, separator).trim() === name) {
      return segment.slice(separator + 1).trim();
    }
  }
  return "";
}

function clearChallengeHeaders(): Record<string, string> {
  return {
    "Set-Cookie": `${CHALLENGE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.byteLength, rightBytes.byteLength);
  let difference = leftBytes.byteLength ^ rightBytes.byteLength;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomBase64Url(size: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function errorPage(
  title: string,
  message: string,
  returnUrl = DEFAULT_RETURN_URL,
): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>${PAGE_STYLES}</style></head>
<body><main class="shell"><section class="card" aria-labelledby="error-title"><span class="kicker">Econovaria account security</span><h1 id="error-title">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="back" href="${escapeHtml(returnUrl)}" rel="noreferrer">Return to administrator sign-in</a></section></main></body></html>`;
}

function htmlResponse(
  status: number,
  body: string,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(body, {
    status,
    headers: securityHeaders({
      "Content-Type": "text/html; charset=utf-8",
      ...Object.fromEntries(new Headers(extraHeaders)),
    }),
  });
}

function securityHeaders(extraHeaders: HeadersInit = {}): Headers {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  return headers;
}

const PAGE_STYLES = `
:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top, #172554 0, #020617 48%, #000 100%); color: #f8fafc; }
.shell { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.card { width: min(100%, 520px); padding: 36px; border: 1px solid rgba(148,163,184,.28); border-radius: 20px; background: rgba(2,6,23,.92); box-shadow: 0 24px 80px rgba(0,0,0,.45); }
.kicker { display: inline-block; margin-bottom: 12px; color: #93c5fd; font-size: .78rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
h1 { margin: 0 0 14px; font-size: clamp(1.8rem, 5vw, 2.5rem); line-height: 1.08; }
p { margin: 0 0 24px; color: #cbd5e1; line-height: 1.6; }
form { margin: 0 0 20px; }
button { width: 100%; border: 0; border-radius: 12px; padding: 14px 18px; background: #f97316; color: #111827; font: inherit; font-weight: 800; cursor: pointer; }
button:hover { filter: brightness(1.08); }
button:focus-visible, a:focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }
.back { color: #bfdbfe; text-decoration: none; }
.back:hover { text-decoration: underline; }
`;
