import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "backend/supabase/functions/admin-password-recovery/index.ts",
  "utf8",
);
const config = fs.readFileSync("backend/supabase/config.toml", "utf8");

test("recovery GET is confirmation-only and does not verify a token", () => {
  const renderStart = source.indexOf("function renderConfirmation");
  const consumeStart = source.indexOf("async function consumeRecoveryRequest");
  assert.ok(renderStart >= 0 && consumeStart > renderStart);
  const renderSource = source.slice(renderStart, consumeStart);

  assert.match(renderSource, /method="post"/u);
  assert.match(renderSource, /Continue to Password Reset/u);
  assert.match(renderSource, /name="token_hash"/u);
  assert.match(renderSource, /name="challenge"/u);
  assert.match(renderSource, /const action = recoveryFunctionUrl\(runtime\)/u);
  assert.doesNotMatch(renderSource, /\/auth\/v1\/verify/u);
  assert.doesNotMatch(renderSource, /ConfirmationURL/u);
});

test("recovery POST is public-origin, challenge-bound, bounded and one-time", () => {
  assert.match(
    source,
    /const publicOrigin = new URL\(runtime\.supabaseUrl\)\.origin/u,
  );
  assert.match(
    source,
    /request\.headers\.get\("origin"\)[\s\S]*publicOrigin/u,
  );
  assert.match(
    source,
    /return `\$\{runtime\.supabaseUrl\}\$\{FUNCTION_PATH\}`/u,
  );
  assert.match(source, /application\/x-www-form-urlencoded/u);
  assert.match(source, /MAX_FORM_BYTES = 2_048/u);
  assert.match(source, /HttpOnly; Secure; SameSite=Strict/u);
  assert.match(source, /constantTimeEqual\(challenge, cookieChallenge\)/u);
  assert.match(source, /fetch\(`\$\{runtime\.supabaseUrl\}\/auth\/v1\/verify`/u);
  assert.match(source, /token_hash: tokenHash, type: "recovery"/u);
  assert.match(source, /status: 303/u);
  assert.match(source, /redirect\.hash = new URLSearchParams/u);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/u);
  assert.doesNotMatch(source, /service_role/u);
});

test("recovery responses are non-cacheable and browser-isolated", () => {
  assert.match(source, /Cache-Control": "private, no-store, max-age=0/u);
  assert.match(source, /Referrer-Policy": "no-referrer/u);
  assert.match(source, /frame-ancestors 'none'/u);
  assert.match(source, /form-action 'self'/u);
  assert.match(source, /X-Frame-Options": "DENY/u);
  assert.match(source, /PRODUCTION_RESET_URL = "https:\/\/econovaria\.vercel\.app\/auth\/reset-password\.html"/u);
});

test("public function boundary is explicitly custom-authenticated", () => {
  assert.match(
    config,
    /\[functions\.admin-password-recovery\][\s\S]*?verify_jwt = false/u,
  );
  assert.match(
    config,
    /TokenHash is exchanged only after a same-origin POST/u,
  );
});
