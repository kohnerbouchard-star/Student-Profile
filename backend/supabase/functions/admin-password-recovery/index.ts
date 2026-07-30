const MAX_FORM_BYTES = 2_048;
const MAX_AUTH_RESPONSE_BYTES = 64 * 1_024;
const CHALLENGE_TTL_SECONDS = 10 * 60;
const CHALLENGE_COOKIE = "__Host-econovaria_recovery_challenge";
const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{16,256}$/u;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const JWT_PATTERN = /^[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,12288}\.[A-Za-z0-9_-]{8,4096}$/u;
const PRODUCTION_RESET_URL = "https://econovaria.vercel.app/auth/reset-password.html";
const FUNCTION_PATH = "/functions/v1/admin-password-recovery";

Deno.serve(handleAdminPasswordRecoveryRequest);

interface RecoveryRuntimeConfig {
  readonly supabaseUrl: string;
  readonly publishableKey: string;
}

export async function handleAdminPasswordRecoveryRequest(
  request: Request,
): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method === "GET") return renderConfirmation(request);
  if (method === "POST") return consumeRecoveryRequest(request);
  return htmlResponse(405, errorPage(
    "Unsupported request",
    "Use the password recovery link from the administrator sign-in page.",
  ), { Allow: "GET, POST" });
}

function renderConfirmation(request: Request): Response {
  const runtime = readRuntimeConfig();
  if (!runtime) return recoveryUnavailable();

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return invalidRecoveryRequest();
  }
  const tokenHash = String(url.searchParams.get("token_hash") || "").trim();
  const type = String(url.searchParams.get("type") || "").trim().toLowerCase();
  if (type !== "recovery" || !TOKEN_HASH_PATTERN.test(tokenHash)) {
    return invalidRecoveryRequest();
  }

  const challenge = randomBase64Url(32);
  const action = recoveryFunctionUrl(runtime);
  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>Continue Econovaria Password Recovery</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <main class="shell">
    <section class="card" aria-labelledby="recovery-title">
      <span class="kicker">Verified staff recovery</span>
      <h1 id="recovery-title">Continue password recovery</h1>
      <p>Continue only if you requested an Econovaria administrator password reset.</p>
      <form method="post" action="${escapeHtml(action)}" autocomplete="off">
        <input type="hidden" name="token_hash" value="${escapeHtml(tokenHash)}">
        <input type="hidden" name="type" value="recovery">
        <input type="hidden" name="challenge" value="${challenge}">
        <button type="submit">Continue to Password Reset</button>
      </form>
      <a class="back" href="https://econovaria.vercel.app/?mode=admin" rel="noreferrer">Return to administrator sign-in</a>
    </section>
  </main>
</body>
</html>`;

  return htmlResponse(200, body, {
    "Set-Cookie": `${CHALLENGE_COOKIE}=${challenge}; Path=/; Max-Age=${CHALLENGE_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
  });
}

async function consumeRecoveryRequest(request: Request): Promise<Response> {
  const runtime = readRuntimeConfig();
  if (!runtime) return recoveryUnavailable();

  const publicOrigin = new URL(runtime.supabaseUrl).origin;
  if (String(request.headers.get("origin") || "") !== publicOrigin) {
    return htmlResponse(403, errorPage(
      "Recovery request rejected",
      "Open the newest recovery email and use the confirmation button on that page.",
    ), clearChallengeHeaders());
  }

  const contentType = String(request.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    return recoveryFailure(400);
  }
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FORM_BYTES) {
    return recoveryFailure(413);
  }

  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return recoveryFailure();
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_FORM_BYTES) {
    return recoveryFailure(413);
  }

  const form = new URLSearchParams(rawBody);
  const suppliedKeys = [...form.keys()];
  if (suppliedKeys.some((key) => !["token_hash", "type", "challenge"].includes(key))) {
    return recoveryFailure();
  }
  const tokenHash = String(form.get("token_hash") || "").trim();
  const type = String(form.get("type") || "").trim().toLowerCase();
  const challenge = String(form.get("challenge") || "").trim();
  const cookieChallenge = readCookie(request.headers.get("cookie"), CHALLENGE_COOKIE);
  if (
    type !== "recovery" ||
    !TOKEN_HASH_PATTERN.test(tokenHash) ||
    !CHALLENGE_PATTERN.test(challenge) ||
    !constantTimeEqual(challenge, cookieChallenge)
  ) {
    return recoveryFailure();
  }

  const verification = await fetch(`${runtime.supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: runtime.publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token_hash: tokenHash, type: "recovery" }),
    cache: "no-store",
    redirect: "error",
  }).catch(() => null);
  if (!verification) return recoveryUnavailable();

  const responseBytes = new Uint8Array(await verification.arrayBuffer());
  if (responseBytes.byteLength === 0 || responseBytes.byteLength > MAX_AUTH_RESPONSE_BYTES) {
    return recoveryFailure();
  }
  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(responseBytes));
  } catch {
    payload = null;
  }
  const accessToken = String(payload?.access_token || "").trim();
  if (!verification.ok || !JWT_PATTERN.test(accessToken)) {
    return recoveryFailure();
  }

  const redirect = new URL(PRODUCTION_RESET_URL);
  redirect.hash = new URLSearchParams({
    access_token: accessToken,
    type: "recovery",
  }).toString();
  return new Response(null, {
    status: 303,
    headers: securityHeaders({
      Location: redirect.href,
      ...clearChallengeHeaders(),
    }),
  });
}

function recoveryFunctionUrl(runtime: RecoveryRuntimeConfig): string {
  return `${runtime.supabaseUrl}${FUNCTION_PATH}`;
}

function invalidRecoveryRequest(): Response {
  return htmlResponse(400, errorPage(
    "Invalid recovery request",
    "This password recovery link is invalid or incomplete. Request a new email from the administrator sign-in page.",
  ));
}

function recoveryFailure(status = 400): Response {
  return htmlResponse(status, errorPage(
    "Recovery link unavailable",
    "This password recovery link is invalid, expired, or already used. Request a new email from the administrator sign-in page.",
  ), clearChallengeHeaders());
}

function recoveryUnavailable(): Response {
  return htmlResponse(503, errorPage(
    "Recovery temporarily unavailable",
    "Password recovery is temporarily unavailable. Try again shortly.",
  ), clearChallengeHeaders());
}

function readRuntimeConfig(): RecoveryRuntimeConfig | null {
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "")
    .trim()
    .replace(/\/+$/u, "");
  const publishableKey = String(
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
      Deno.env.get("PUBLISHABLE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY") ||
      "",
  ).trim();
  try {
    const parsed = new URL(supabaseUrl);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname.endsWith(".supabase.co") ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      !publishableKey
    ) return null;
    return { supabaseUrl: parsed.origin, publishableKey };
  } catch {
    return null;
  }
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
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
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

function errorPage(title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>${escapeHtml(title)}</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <main class="shell">
    <section class="card" aria-labelledby="error-title">
      <span class="kicker">Econovaria account security</span>
      <h1 id="error-title">${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <a class="back" href="https://econovaria.vercel.app/?mode=admin" rel="noreferrer">Return to administrator sign-in</a>
    </section>
  </main>
</body>
</html>`;
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
