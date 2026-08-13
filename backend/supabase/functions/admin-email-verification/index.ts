const MAX_FORM_BYTES = 2_048;
const MAX_AUTH_RESPONSE_BYTES = 64 * 1_024;
const CHALLENGE_TTL_SECONDS = 10 * 60;
const CHALLENGE_COOKIE = "__Host-econovaria_email_verification_challenge";
const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{16,256}$/u;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const JWT_PATTERN = /^[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,12288}\.[A-Za-z0-9_-]{8,4096}$/u;
const FUNCTION_PATH = "/functions/v1/admin-email-verification";
const DEFAULT_RETURN_URL = "https://econovaria.com/?mode=admin&reason=email-verified";
const VERIFICATION_TYPES = new Set(["signup", "magiclink"]);

Deno.serve(handleAdminEmailVerificationRequest);

interface RuntimeConfig {
  readonly supabaseUrl: string;
  readonly publishableKey: string;
  readonly returnUrl: string;
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
  const tokenHash = String(url.searchParams.get("token_hash") || "").trim();
  const type = String(url.searchParams.get("type") || "").trim().toLowerCase();
  if (!TOKEN_HASH_PATTERN.test(tokenHash) || !VERIFICATION_TYPES.has(type)) {
    return invalidRequest();
  }

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
        <input type="hidden" name="token_hash" value="${escapeHtml(tokenHash)}">
        <input type="hidden" name="type" value="${escapeHtml(type)}">
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
  if ([...form.keys()].some((key) => !["token_hash", "type", "challenge"].includes(key))) {
    return verificationFailure(400, runtime.returnUrl);
  }
  const tokenHash = String(form.get("token_hash") || "").trim();
  const type = String(form.get("type") || "").trim().toLowerCase();
  const challenge = String(form.get("challenge") || "").trim();
  const cookieChallenge = readCookie(request.headers.get("cookie"), CHALLENGE_COOKIE);
  if (
    !TOKEN_HASH_PATTERN.test(tokenHash) ||
    !VERIFICATION_TYPES.has(type) ||
    !CHALLENGE_PATTERN.test(challenge) ||
    !constantTimeEqual(challenge, cookieChallenge)
  ) {
    return verificationFailure(400, runtime.returnUrl);
  }

  const verification = await fetch(`${runtime.supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: runtime.publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token_hash: tokenHash, type }),
    cache: "no-store",
    redirect: "error",
  }).catch(() => null);
  if (!verification) return unavailable(runtime.returnUrl);

  const bytes = new Uint8Array(await verification.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUTH_RESPONSE_BYTES) {
    return verificationFailure(400, runtime.returnUrl);
  }
  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    payload = null;
  }
  const accessToken = String(payload?.access_token || "").trim();
  if (!verification.ok || !JWT_PATTERN.test(accessToken)) {
    return verificationFailure(400, runtime.returnUrl);
  }

  // Supabase may mint a temporary AAL1 session while confirming the mailbox.
  // The token never reaches the browser. Cleanup is verified before redirecting;
  // a 401 is safe because it proves the temporary token is already invalid.
  const logoutResponse = await fetch(
    `${runtime.supabaseUrl}/auth/v1/logout?scope=local`,
    {
      method: "POST",
      headers: {
        apikey: runtime.publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      redirect: "error",
    },
  ).catch(() => null);
  const logoutStatus = logoutResponse?.status ?? 0;
  const logoutSucceeded = Boolean(
    logoutResponse && (logoutResponse.ok || logoutStatus === 401),
  );
  await logoutResponse?.body?.cancel().catch(() => undefined);
  if (!logoutSucceeded) {
    console.error(
      "staff_email_verification_session_revocation_failed",
      { status: logoutStatus },
    );
    return cleanupFailure(runtime.returnUrl);
  }

  return new Response(null, {
    status: 303,
    headers: securityHeaders({
      Location: runtime.returnUrl,
      ...clearChallengeHeaders(),
    }),
  });
}

function readRuntimeConfig(): RuntimeConfig | null {
  const supabaseUrl = environmentValue("SUPABASE_URL").replace(/\/+$/u, "");
  const publishableKey = firstConfigured([
    environmentValue("SUPABASE_PUBLISHABLE_KEY"),
    environmentValue("PUBLISHABLE_KEY"),
    ...dictionaryValues(environmentValue("SUPABASE_PUBLISHABLE_KEYS")),
    environmentValue("SUPABASE_ANON_KEY"),
  ]);
  const returnUrl = environmentValue("ECONOVARIA_EMAIL_VERIFICATION_RETURN_URL") ||
    DEFAULT_RETURN_URL;
  try {
    const parsedSupabase = new URL(supabaseUrl);
    const parsedReturn = new URL(returnUrl);
    if (
      !isAllowedRuntimeUrl(parsedSupabase) ||
      !publishableKey ||
      !isAllowedReturnUrl(parsedReturn)
    ) return null;
    return {
      supabaseUrl: parsedSupabase.origin,
      publishableKey,
      returnUrl: parsedReturn.href,
    };
  } catch {
    return null;
  }
}

function isAllowedRuntimeUrl(url: URL): boolean {
  if (url.username || url.password || url.pathname !== "/") return false;
  if (url.protocol === "https:" && url.hostname.endsWith(".supabase.co")) return true;
  return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
}

function isAllowedReturnUrl(url: URL): boolean {
  if (url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
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

function cleanupFailure(returnUrl = DEFAULT_RETURN_URL): Response {
  return htmlResponse(503, errorPage(
    "Email confirmed; secure cleanup pending",
    "Your email was confirmed, but temporary session cleanup could not be verified. No session token was exposed to this browser. Close this tab and return to administrator sign-in shortly.",
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
