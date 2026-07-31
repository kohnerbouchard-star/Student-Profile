import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(repoRoot, relativePath), "utf8");

const [
  onboardingMigration,
  hardeningMigration,
  cleanupClaimMigration,
  cleanupScheduleMigration,
  signup,
  signupCancel,
  login,
  confirmation,
  template,
  config,
  html,
  browserLogin,
  browserApi,
  securityGuard,
  provisioning,
  licensingErrors,
] = await Promise.all([
  read("backend/supabase/migrations/20260731130000_add_verified_staff_onboarding_v1.sql"),
  read("backend/supabase/migrations/20260731131000_harden_onboarding_cleanup_and_license_replay_v1.sql"),
  read("backend/supabase/migrations/20260731132000_wire_expired_signup_cleanup_into_claim_v1.sql"),
  read("backend/supabase/migrations/20260731133000_schedule_expired_staff_signup_cleanup_v1.sql"),
  read("backend/src/domains/auth/api/staffSignupHttpHandler.ts"),
  read("backend/src/domains/auth/api/staffSignupCancelHttpHandler.ts"),
  read("backend/src/domains/auth/api/staffLoginHttpHandler.ts"),
  read("backend/supabase/functions/admin-email-verification/index.ts"),
  read("backend/supabase/templates/confirmation.html"),
  read("backend/supabase/config.toml"),
  read("index.html"),
  read("frontend/src/core/login.js"),
  read("frontend/src/core/api.js"),
  read("backend/supabase/functions/admin-api/adminSecurityGuard.ts"),
  read("backend/supabase/functions/admin-api/gameProvisioningOperations.ts"),
  read("backend/src/domains/licensing/application/licensingActivationErrors.ts"),
]);

test("pending signup is private, one-per-email and contains no game entitlement state", () => {
  assert.match(onboardingMigration, /create table if not exists private\.staff_signup_requests/u);
  assert.match(onboardingMigration, /staff_signup_requests_active_email_uidx/u);
  assert.match(onboardingMigration, /where status in \([\s\S]*'initializing'[\s\S]*'pending_email_verification'/u);
  assert.match(onboardingMigration, /revoke all on table private\.staff_signup_requests[\s\S]*from public, anon, authenticated, service_role/u);
  assert.match(onboardingMigration, /grant select, insert, update, delete[\s\S]*to service_role/u);
  assert.doesNotMatch(onboardingMigration, /staff_signup_requests[\s\S]{0,2500}\bpurchase_code_(?:id|hash)\b/u);
  assert.doesNotMatch(onboardingMigration, /staff_signup_requests[\s\S]{0,2500}\bgame_(?:name|settings|session_id)\b/u);
});

test("public account creation creates only an unconfirmed Auth identity", () => {
  assert.match(signup, /claim_staff_signup_identity_v1/u);
  assert.match(signup, /email_confirm:\s*false/u);
  assert.doesNotMatch(signup, /app_metadata\s*:/u);
  assert.doesNotMatch(signup, /redeem_purchase_code_for_game/u);
  assert.doesNotMatch(signup, /createSupabaseStaffRepository/u);
  assert.match(signup, /check_email_or_sign_in/u);
  assert.match(html, /Create Account/u);
  assert.match(html, /id="createVerificationStep"/u);
  assert.doesNotMatch(html, /id="licenseCode"/u);
  assert.doesNotMatch(html, /id="sessionName"/u);
  assert.doesNotMatch(html, /id="gameTimeZone"/u);
});

test("email verification is prefetch-safe and grants no game authority", () => {
  assert.match(confirmation, /if \(method === "GET"\) return renderConfirmation/u);
  assert.match(confirmation, /if \(method === "POST"\) return consumeConfirmation/u);
  const renderSection = confirmation.slice(
    confirmation.indexOf("function renderConfirmation"),
    confirmation.indexOf("async function consumeConfirmation"),
  );
  assert.doesNotMatch(renderSection, /\/auth\/v1\/verify/u);
  assert.match(confirmation, /SameSite=Strict/u);
  assert.match(confirmation, /HttpOnly/u);
  assert.match(confirmation, /String\(request\.headers\.get\("origin"\)/u);
  assert.match(confirmation, /\/auth\/v1\/verify/u);
  assert.match(confirmation, /\/auth\/v1\/logout\?scope=local/u);
  assert.match(confirmation, /reason=email-verified/u);
  assert.doesNotMatch(confirmation, /redeem_purchase_code_for_game|complete_staff_onboarding_v1/u);
  assert.match(template, /\{\{ \.RedirectTo \}\}\?token_hash=\{\{ \.TokenHash \}\}&type=email/u);
  assert.match(config, /\[functions\.admin-email-verification\][\s\S]*verify_jwt = false/u);
});

test("verified password sign-in activates restricted onboarding before TOTP", () => {
  assert.match(login, /activate_verified_staff_identity_v1/u);
  assert.match(login, /staff_email_verification_required/u);
  assert.match(login, /status === "onboarding"/u);
  assert.match(onboardingMigration, /email_verification_source[\s\S]*signup_confirmation/u);
  assert.match(onboardingMigration, /'onboarding'/u);
  assert.match(browserApi, /ensureAdminAal2/u);
});

test("onboarding access is limited to AAL2 game creation", () => {
  assert.match(securityGuard, /staff\?\.status === "onboarding"/u);
  assert.match(securityGuard, /request\.method\.toUpperCase\(\) === "POST"/u);
  assert.match(securityGuard, /String\(path\)\.split\("\?", 1\)\[0\] === "\/games"/u);
  assert.match(securityGuard, /assuranceLevel !== "aal2"/u);
  assert.match(securityGuard, /staff_permission_denied/u);
});

test("cancellation and expiry delete only unconfirmed identities atomically", () => {
  assert.match(hardeningMigration, /create or replace function public\.cancel_staff_signup_v1/u);
  assert.match(hardeningMigration, /select auth_user\.email_confirmed_at[\s\S]*for update/u);
  assert.match(hardeningMigration, /if v_email_confirmed_at is not null then[\s\S]*status = 'email_verified'/u);
  assert.match(hardeningMigration, /delete from auth\.users[\s\S]*email_confirmed_at is null/u);
  assert.match(hardeningMigration, /cleanup_expired_staff_signup_identity_v1/u);
  assert.match(cleanupClaimMigration, /perform public\.cleanup_expired_staff_signup_identity_v1\(p_email_key\)/u);
  assert.doesNotMatch(signupCancel, /auth\.admin\.deleteUser|auth\.admin\.updateUserById/u);
  assert.match(signupCancel, /cancel_staff_signup_v1/u);
});

test("expired unconfirmed identities are swept without user traffic", () => {
  assert.match(cleanupScheduleMigration, /create extension if not exists pg_cron/u);
  assert.match(cleanupScheduleMigration, /econovaria-expired-staff-signup-cleanup-v1/u);
  assert.match(cleanupScheduleMigration, /'\*\/15 \* \* \* \*'/u);
  assert.match(cleanupScheduleMigration, /claim_expired_staff_signup_cleanup_v1\(100\)/u);
  assert.match(cleanupScheduleMigration, /cron\.unschedule/u);
});

test("first and additional games use authenticated replay-safe license redemption", () => {
  assert.match(html, /id="createNewAdminGame"/u);
  assert.match(html, /id="adminCreateGameForm"/u);
  assert.match(html, /id="adminNewLicenseCode"/u);
  assert.match(browserLogin, /GAME_PAGE_SIZE = 3/u);
  assert.match(browserLogin, /newGameIdempotencyKey/u);
  assert.match(browserApi, /callAdminBffJsonRoute\("\/games"/u);
  assert.match(browserApi, /x-idempotency-key/u);
  assert.match(provisioning, /handleLicensingActivationRequest/u);
  assert.match(provisioning, /complete_staff_onboarding_v1/u);
  assert.match(provisioning, /admin_api_authenticated_game_selector_v1/u);

  assert.match(hardeningMigration, /redemption_request_key/u);
  assert.match(hardeningMigration, /redemption_request_fingerprint/u);
  assert.match(hardeningMigration, /entitlements_staff_redemption_request_uidx/u);
  assert.match(hardeningMigration, /pg_advisory_xact_lock/u);
  assert.match(hardeningMigration, /raise exception 'IDEMPOTENCY_KEY_CONFLICT'/u);
  const replayLookup = hardeningMigration.indexOf("redemption_request_key = v_request_id");
  const codeStatusCheck = hardeningMigration.indexOf("v_purchase_code.status = 'expired'");
  assert.ok(replayLookup >= 0 && codeStatusCheck > replayLookup,
    "Exact entitlement replay must be resolved before purchase-code exhaustion checks.");
  assert.match(licensingErrors, /case "IDEMPOTENCY_KEY_CONFLICT"/u);
  assert.match(licensingErrors, /code: "idempotency_key_conflict"/u);
});

test("browser game-creation response excludes licensing internals", () => {
  assert.doesNotMatch(provisioning, /activation:\s*activationResult\.body\.activation/u);
  assert.match(provisioning, /Internal entitlement and purchase-code identifiers terminate/u);
  assert.doesNotMatch(provisioning, /entitlementId|purchaseCodeId/u);
});
