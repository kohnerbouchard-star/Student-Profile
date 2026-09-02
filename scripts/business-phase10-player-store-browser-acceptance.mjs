#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, normalize } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import {
  scaledDatabaseDecimal,
} from "./business-player-store-fx-final-database-decimal.mjs";

const execFileAsync = promisify(execFile);

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const RELEASE_COMMIT = String(process.env.RELEASE_COMMIT || "").trim();
const BASE_URL = String(
  process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173",
).replace(/\/+$/u, "");
const LICENSE_CODE = String(
  process.env.ECONOVARIA_BROWSER_LICENSE_CODE ||
    "PLAYER-PHASE10A4-LICENSE-001",
).trim();
const ADMIN_EMAIL = String(
  process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL ||
    "phase10a4.player.store@example.test",
).trim();
const ADMIN_PASSWORD = String(
  process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD ||
    "Phase10A4-Player-Store-Admin-2026!",
);
const GAME_NAME = String(
  process.env.ECONOVARIA_BROWSER_GAME_NAME ||
    "Phase 10A4 Player Store Connected Acceptance",
).trim();
const OUTPUT_DIR = String(
  process.env.ECONOVARIA_PLAYER_STORE_OUTPUT_DIR ||
    process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR ||
    "/tmp/econovaria-phase10a4-player-store-evidence",
).trim();

const REQUEST_TIMEOUT_MS = 180_000;
const SELLER_CONVERGENCE_TIMEOUT_MS = 90_000;
const MAX_MANUAL_REFRESH_ATTEMPTS = 4;
const MANUAL_REFRESH_STATE_TIMEOUT_MS = 30_000;
const CREDIT_AMOUNT = 10_000;
const BUSINESS_PURCHASE_QUANTITY = 2;
const BUSINESS_LISTING_QUANTITY = 10;
const BUSINESS_FINISHED_QUANTITY = 12;
const BUSINESS_UNIT_PRICE = 7.5;
const BUSINESS_UNIT_COST = 2.5;
const EVIDENCE_FILE = "business-phase10-player-store-browser-acceptance.json";
const EXPECTED_COMMITTED_REFRESH_RESOURCES = Object.freeze([
  "dashboard",
  "store",
  "inventory",
  "banking",
  "bankingFx",
]);

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/iu;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u;
const SUPABASE_KEY_PATTERN = /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/iu;
const DATABASE_URL_PATTERN = /\bpostgres(?:ql)?:\/\/[^\s"']+/iu;
const GAME_CODE_PATTERN = /\bECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}\b/u;
const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const REFRESH_AUDIT_TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
const UUID_REDACTION_PATTERN = new RegExp(UUID_PATTERN.source, "giu");
const JWT_REDACTION_PATTERN = new RegExp(JWT_PATTERN.source, "gu");
const SUPABASE_KEY_REDACTION_PATTERN = new RegExp(SUPABASE_KEY_PATTERN.source, "giu");
const DATABASE_URL_REDACTION_PATTERN = new RegExp(DATABASE_URL_PATTERN.source, "giu");
const GAME_CODE_REDACTION_PATTERN = new RegExp(GAME_CODE_PATTERN.source, "gu");
const PUBLIC = Object.freeze({
  offer: /^sof_[0-9a-f]{32}$/u,
  quote: /^quote_[0-9a-f]{32}$/u,
  receipt: /^spr_[0-9a-f]{32}$/u,
  seededReceipt: /^receipt_[0-9a-f]{32}$/u,
  business: /^biz_[0-9a-f]{32}$/u,
  party: /^pty_[0-9a-f]{32}$/u,
  catalogItem: /^itm_[0-9a-f]{32}$/u,
  activity: /^bae_[0-9a-f]{32}$/u,
  withdrawal: /^swr_[0-9a-f]{32}$/u,
  inventoryTransaction: /^itx_[0-9a-f]{32}$/u,
  inventoryAccount: /^iac_[0-9a-f]{32}$/u,
  account: /^bac_[0-9a-f]{32}$/u,
  fundingQuote: /^pfq_[0-9a-f]{32}$/u,
  fundingReceipt: /^pfr_[0-9a-f]{32}$/u,
  bankTransaction: /^btx_[0-9a-f]{32}$/u,
  fixing: /^fxf_[0-9a-f]{32}$/u,
  storeItem: /^[a-z0-9_-]{1,64}$/u,
  canonicalItem: /^[a-z0-9][a-z0-9._-]{0,159}$/u,
  currency: /^[A-Z0-9_]{3,16}$/u,
});
const FUNDING_QUOTE_FIELDS = Object.freeze([
  "quoteKey", "fundingContextKind", "fundingContextKey", "targetCurrencyCode",
  "targetMinorUnit", "targetAmount", "fixingKey", "policyVersion", "requiresFx",
  "expiresAt", "lines",
]);
const FUNDING_QUOTE_LINE_FIELDS = Object.freeze([
  "lineNumber", "sourceAccountKey", "sourceCurrencyCode", "sourceMinorUnit",
  "targetCurrencyCode", "targetMinorUnit", "postedAmount", "heldAmount",
  "availableAmount", "targetContribution", "sourceDebit", "referenceRate",
  "customerRate", "effectiveRate", "spreadRate", "requiresFx", "roundingDisclosure",
]);
const FUNDING_RECEIPT_FIELDS = Object.freeze([
  "receiptKey", "quoteKey", "bankTransactionKey", "targetAccountKey",
  "fundingContextKind", "fundingContextKey", "targetCurrencyCode", "targetMinorUnit",
  "targetAmount", "targetReserveDrawAmount", "sourceDomain", "sourceAction",
  "createdAt", "lines",
]);
const FUNDING_RECEIPT_LINE_FIELDS = Object.freeze([
  "lineNumber", "sourceAccountKey", "sourceCurrencyCode", "sourceMinorUnit",
  "targetCurrencyCode", "targetMinorUnit", "targetContribution", "sourceDebit",
  "referenceRate", "customerRate", "effectiveRate", "spreadRate", "requiresFx",
]);

const PLAYERS = Object.freeze({
  game1: Object.freeze({
    buyer: Object.freeze({
      role: "Buyer",
      displayName: "Phase 10A4 Buyer",
      rosterLabel: "Game 1 Buyer",
      playerIdentifier: "PHASE10A4-G1-BUYER",
      accessCode: "P10A4-G1-BUYER-ACCESS-001",
    }),
    seller: Object.freeze({
      role: "Seller owner",
      displayName: "Phase 10A4 Seller Owner",
      rosterLabel: "Game 1 Seller",
      playerIdentifier: "PHASE10A4-G1-SELLER",
      accessCode: "P10A4-G1-SELLER-ACCESS-002",
    }),
  }),
  game2: Object.freeze({
    buyer: Object.freeze({
      role: "Isolation Buyer",
      displayName: "Phase 10A4 Isolation Buyer",
      rosterLabel: "Game 2 Buyer",
      playerIdentifier: "PHASE10A4-G2-BUYER",
      accessCode: "P10A4-G2-BUYER-ACCESS-003",
    }),
    seller: Object.freeze({
      role: "Isolation Seller",
      displayName: "Phase 10A4 Isolation Seller",
      rosterLabel: "Game 2 Seller",
      playerIdentifier: "PHASE10A4-G2-SELLER",
      accessCode: "P10A4-G2-SELLER-ACCESS-004",
    }),
  }),
});

const SECRET_LITERALS = [
  DATABASE_URL,
  LICENSE_CODE,
  ADMIN_PASSWORD,
  ...Object.values(PLAYERS).flatMap((game) =>
    Object.values(game).map((player) => player.accessCode)
  ),
].filter(Boolean);
const ARTIFACT_PRIVATE_LITERALS = Object.values(PLAYERS).flatMap((game) =>
  Object.values(game).map((player) => player.playerIdentifier)
).filter(Boolean);

const evidence = {
  schemaVersion: "econovaria.phase10a4.player-store.connected.v1",
  roadmapItem: "BUSINESS-V2-PHASE-10A4",
  generatedAt: new Date().toISOString(),
  releaseCommit: RELEASE_COMMIT ? RELEASE_COMMIT.slice(0, 12) : "",
  outcome: "running",
  runtime: {
    disposableLocalDatabase: false,
    disposableLocalGateway: false,
    directRunnerOnly: true,
    sourceMaterializationCount: 0,
    playerBrowserContexts: 0,
  },
  provisioning: {
    staffFixtureCreated: false,
    authenticatedAdminApi: false,
    gamesCreated: 0,
    playersCreated: 0,
    buyersFunded: 0,
    foreignBuyerAccountsFunded: 0,
    licenseMaxRedemptions: 0,
    licenseRedeemedCount: 0,
    licenseFinalStatus: "",
    businessOffersCreated: 0,
  },
  browser: {
    businessOfferExplicitlySelected: false,
    authoritativeQuoteRendered: false,
    immutableFundingQuoteRendered: false,
    settlementProcessingGuardRendered: false,
    settlementProcessingFocusContained: false,
    settlementProcessingDismissalBlocked: false,
    immutableReceiptRendered: false,
    immutableFundingReceiptRendered: false,
    immutableReceiptReloaded: false,
    postCommitRefreshFailureForced: false,
    postCommitInvalidReceiptResponses: 0,
    postCommitReceiptReadAttempts: 0,
    refreshPendingRendered: false,
    refreshRetryAttempts: 0,
    refreshRetryPendingAttempts: 0,
    refreshRetryOutcomes: [],
    initialPostCommitResourceRefresh: null,
    refreshRetryResourceAttempts: [],
    refreshRetryCompleted: false,
    refreshRetryDidNotResubmitSettlement: false,
    replayUsedSameOriginPageFetch: false,
    replayReturnedSameReceipt: false,
    retainedSeededStorePurchaseCompleted: false,
    retainedSeededAllForeignFundingSelected: false,
    businessAllForeignFundingSelected: false,
    twoBrowserCrossCurrencyPurchaseCompleted: false,
    buyerConvergedWithoutReload: false,
    sellerConvergedWithoutReload: false,
    sharedReceiptIdentityVisible: false,
    game2KeysAbsentFromGame1Store: false,
    game1KeysAbsentFromGame2Store: false,
    game2OfferVisibleInGame2Store: false,
    internalUuidObservedInPlayerResponse: false,
    sensitiveValueObservedInPlayerResponse: false,
    sensitiveValueObservedInPlayerDom: false,
    consoleErrors: [],
    pageErrors: [],
    requests: [],
  },
  settlement: {
    offerKey: "",
    quoteKey: "",
    receiptKey: "",
    businessKey: "",
    catalogItemKey: "",
    canonicalItemKey: "",
    storeItemKey: "",
    quantity: 0,
    unitPrice: 0,
    totalPrice: 0,
    currencyCode: "",
    offerVersionBefore: 0,
    offerVersionAfter: 0,
    remainingListedQuantity: 0,
    fundingQuoteKey: "",
    fundingReceiptKey: "",
    fundingTransactionKey: "",
  },
  database: {
    fundingSourcesDebitedExactly: false,
    targetCheckingUnchangedForAllForeign: false,
    businessCashCreditedExactly: false,
    listingHoldingDebitedExactly: false,
    listingVersionAdvancedExactly: false,
    offerVersionAdvancedExactly: false,
    buyerInventoryCreditedExactly: false,
    buyerCostAndProvenanceExact: false,
    quoteConsumedExactly: false,
    receiptExact: false,
    ledgerPostingCount: 0,
    sourceDebitPostingCount: 0,
    recipientCreditPostingCount: 0,
    fundingReceiptCount: 0,
    fundingTransactionCount: 0,
    inventoryTransactionCount: 0,
    inventoryLineCount: 0,
    purchasedEventCount: 0,
    businessActivityCount: 0,
    replayZeroDelta: false,
    game2ZeroMutation: false,
    game1ZeroMutationFromGame2Probe: false,
    withdrawalFirstRejectedBeforePayment: false,
    purchaseFirstExcessWithdrawalRejected: false,
    purchaseFirstRemainingWithdrawalAccepted: false,
  },
  failure: "",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function withTimeout(promise, timeoutMs, message) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function amount(value) {
  const number = Number(value);
  assert(Number.isFinite(number), "Expected a finite monetary value.");
  return Math.round((number + Number.EPSILON) * 10_000) / 10_000;
}

function sameAmount(left, right) {
  return Math.abs(amount(left) - amount(right)) < 0.00005;
}

function exactDecimal(value, precision, label, { positive = false } = {}) {
  assert(typeof value === "string", `${label} must be a canonical decimal string.`);
  const match = /^(?:0|[1-9][0-9]{0,14})(?:\.([0-9]{1,18}))?$/u.exec(value);
  assert(match && (match[1] || "").length <= precision, `${label} has invalid precision.`);
  const [whole, fraction = ""] = value.split(".");
  const scaled = BigInt(whole) * (10n ** BigInt(precision)) +
    BigInt((fraction + "0".repeat(precision)).slice(0, precision) || "0");
  assert(!positive || scaled > 0n, `${label} must be positive.`);
  const canonicalFraction = fraction.replace(/0+$/u, "");
  assert(value === (canonicalFraction ? `${BigInt(whole)}.${canonicalFraction}` : String(BigInt(whole))), `${label} is not canonical.`);
  return scaled;
}

function assertExactKeys(value, expected, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} is invalid.`);
  assert(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()),
    `${label} changed its exact public field set.`,
  );
}

function uiAmount(value) {
  const match = String(value || "").replace(/,/gu, "").match(/-?[0-9]+(?:\.[0-9]+)?/u);
  assert(match, "Rendered currency value could not be parsed.");
  return amount(match[0]);
}

function observePlayerResponseBody(value) {
  const body = String(value || "");
  const uuidUnsafe = UUID_PATTERN.test(body);
  const sensitiveUnsafe = JWT_PATTERN.test(body) ||
    SUPABASE_KEY_PATTERN.test(body) ||
    DATABASE_URL_PATTERN.test(body) ||
    GAME_CODE_PATTERN.test(body) ||
    SECRET_LITERALS.some((literal) => literal && body.includes(literal));
  if (uuidUnsafe) evidence.browser.internalUuidObservedInPlayerResponse = true;
  if (sensitiveUnsafe) evidence.browser.sensitiveValueObservedInPlayerResponse = true;
  return { uuidUnsafe, sensitiveUnsafe };
}

function assertSafePlayerResponseBody(value, label) {
  const observed = observePlayerResponseBody(value);
  assert(!observed.uuidUnsafe, `${label} exposed an internal UUID.`);
  assert(!observed.sensitiveUnsafe, `${label} exposed a sensitive value.`);
}

function redact(value) {
  let result = String(value ?? "");
  for (const literal of [...SECRET_LITERALS, ...ARTIFACT_PRIVATE_LITERALS]) {
    result = result.split(literal).join("[credential-redacted]");
  }
  return result
    .replace(UUID_REDACTION_PATTERN, "[uuid-redacted]")
    .replace(JWT_REDACTION_PATTERN, "[jwt-redacted]")
    .replace(SUPABASE_KEY_REDACTION_PATTERN, "[supabase-key-redacted]")
    .replace(DATABASE_URL_REDACTION_PATTERN, "[database-url-redacted]")
    .replace(GAME_CODE_REDACTION_PATTERN, "[game-code-redacted]");
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/gu, "''")}'`;
}

function assertPublic(value, pattern, label) {
  const normalized = String(value || "").trim();
  assert(pattern.test(normalized), `${label} did not contain a valid public key.`);
  return normalized;
}

function parseSupabaseStatusEnv(source) {
  const values = {};
  for (const line of String(source || "").split(/\r?\n/u)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    }
    values[match[1]] = value;
  }
  return values;
}

function assertLoopbackHttpUrl(value, label) {
  const parsed = new URL(value);
  assert(parsed.protocol === "http:", `${label} must use disposable local HTTP.`);
  assert(
    ["127.0.0.1", "localhost"].includes(parsed.hostname),
    `${label} must resolve to loopback.`,
  );
}

function assertBoundedOutputDirectory() {
  const normalizedOutput = normalize(OUTPUT_DIR);
  assert(
    isAbsolute(OUTPUT_DIR) &&
      normalizedOutput === OUTPUT_DIR.replace(/\/$/u, "") &&
      normalizedOutput.startsWith("/tmp/") &&
      normalizedOutput !== "/tmp",
    "ECONOVARIA_PLAYER_STORE_OUTPUT_DIR must be a bounded absolute /tmp directory.",
  );
}

function assertDisposableRuntime() {
  assert(DATABASE_URL, "DATABASE_URL is required.");
  const normalizedDatabaseUrl = DATABASE_URL.replace(/^postgresql:/u, "postgres:");
  const database = new URL(normalizedDatabaseUrl);
  assert(database.protocol === "postgres:", "DATABASE_URL must use PostgreSQL.");
  assert(
    ["127.0.0.1", "localhost"].includes(database.hostname) &&
      database.port === "54322" &&
      database.pathname === "/postgres",
    "DATABASE_URL must target the disposable localhost Supabase database on port 54322.",
  );
  assertLoopbackHttpUrl(BASE_URL, "ECONOVARIA_BROWSER_BASE_URL");
  assert(LICENSE_CODE, "ECONOVARIA_BROWSER_LICENSE_CODE is required.");
  assert(ADMIN_EMAIL && ADMIN_PASSWORD, "Browser Admin credentials are required.");
  assert(/^[0-9a-f]{40}$/iu.test(RELEASE_COMMIT), "RELEASE_COMMIT must be an exact Git commit SHA.");
  assertBoundedOutputDirectory();
  evidence.runtime.disposableLocalDatabase = true;
  evidence.runtime.disposableLocalGateway = true;
}

async function psql(sql, { json = false } = {}) {
  const { stdout } = await execFileAsync(
    "psql",
    [DATABASE_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { timeout: 60_000, maxBuffer: 4_194_304 },
  );
  if (!json) return String(stdout || "").trim();
  const lines = String(stdout || "").trim().split(/\r?\n/u).filter(Boolean);
  assert(lines.length > 0, "Database verification returned no JSON row.");
  return JSON.parse(lines.at(-1));
}

async function expectPsqlFailure(sql, expectedCode) {
  try {
    await psql(sql);
  } catch (error) {
    const diagnostic = [error?.stdout, error?.stderr, error?.message]
      .filter(Boolean)
      .join("\n");
    if (diagnostic.includes(expectedCode)) return;
    throw new Error(`Canonical command failed with an unexpected code instead of ${expectedCode}.`);
  }
  throw new Error(`Canonical command unexpectedly succeeded instead of ${expectedCode}.`);
}

async function localSupabaseRuntime() {
  const { stdout } = await execFileAsync(
    "npx",
    ["supabase", "status", "--workdir", "backend", "-o", "env"],
    { timeout: 30_000, maxBuffer: 2_097_152 },
  );
  const values = parseSupabaseStatusEnv(stdout);
  const apiUrl = String(values.API_URL || values.SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/u, "");
  const serviceRoleKey = String(
    values.SERVICE_ROLE_KEY || values.SECRET_KEY || "",
  ).trim();
  const publishableKey = String(
    values.PUBLISHABLE_KEY || values.ANON_KEY || "",
  ).trim();
  assertLoopbackHttpUrl(apiUrl, "Local Supabase API URL");
  assert(serviceRoleKey, "Local Supabase service credential is unavailable.");
  assert(publishableKey, "Local Supabase publishable credential is unavailable.");
  for (const credential of [serviceRoleKey, publishableKey]) {
    if (!SECRET_LITERALS.includes(credential)) SECRET_LITERALS.push(credential);
  }
  return { apiUrl, serviceRoleKey, publishableKey };
}

async function responsePayload(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await response.json().catch(() => null);
  }
  return await response.text().catch(() => "");
}

async function fetchJson(url, { method = "GET", headers = {}, body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    return {
      ok: response.ok,
      status: response.status,
      payload: await responsePayload(response),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function walkObjects(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) walkObjects(item, output);
    return output;
  }
  output.push(value);
  for (const child of Object.values(value)) walkObjects(child, output);
  return output;
}

function findGame(payload) {
  return walkObjects(payload).find((candidate) => {
    const id = String(candidate.id || candidate.gameId || candidate.gameSessionId || "");
    const code = String(candidate.joinCode || candidate.gameCode || candidate.gameJoinCode || "");
    return UUID_PATTERN.test(id) && (GAME_CODE_PATTERN.test(code) || candidate.name);
  }) || null;
}

function findPlayer(payload, expected) {
  return walkObjects(payload).find((candidate) => {
    const id = String(candidate.id || candidate.playerId || "");
    return UUID_PATTERN.test(id) && (
      candidate.displayName === expected.displayName ||
      candidate.playerIdentifier === expected.playerIdentifier
    );
  }) || null;
}

function adminHeaders(admin, gameId = "", idempotencyKey = "") {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: admin.publishableKey,
    Authorization: `Bearer ${admin.accessToken}`,
    "X-Request-Id": crypto.randomUUID(),
    "X-Econovaria-Device-Id": admin.deviceId,
  };
  if (gameId) headers["X-Econovaria-Game-Id"] = gameId;
  if (idempotencyKey) {
    headers["X-Idempotency-Key"] = idempotencyKey;
    headers["Idempotency-Key"] = idempotencyKey;
  }
  return headers;
}

async function seedLicense() {
  const result = await psql(`
    insert into public.purchase_codes(code_hash, status, max_redemptions, redeemed_count)
    values (
      encode(extensions.digest(${sqlLiteral(LICENSE_CODE)}, 'sha256'), 'hex'),
      'active', 2, 0
    )
    on conflict (code_hash) do nothing;

    select jsonb_build_object(
      'present', count(*) = 1,
      'status', max(status),
      'maxRedemptions', max(max_redemptions),
      'redeemedCount', max(redeemed_count)
    )::text
    from public.purchase_codes
    where code_hash = encode(extensions.digest(${sqlLiteral(LICENSE_CODE)}, 'sha256'), 'hex');
  `, { json: true });
  assert(result.present === true, "The disposable license fixture is missing.");
  assert(
    result.status === "active" &&
      Number(result.maxRedemptions) === 2 &&
      Number(result.redeemedCount) === 0,
    "The disposable license fixture must be fresh with exactly two redemptions.",
  );
}

async function createStaffFixture(runtime) {
  const adminAuthHeaders = {
    apikey: runtime.serviceRoleKey,
    Authorization: `Bearer ${runtime.serviceRoleKey}`,
    "Content-Type": "application/json",
  };
  const created = await fetchJson(`${runtime.apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminAuthHeaders,
    body: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Phase 10A4 Browser Teacher" },
    },
  });
  const authUserId = String(created.payload?.id || created.payload?.user?.id || "").trim();
  assert(created.ok && UUID_PATTERN.test(authUserId), `Local Auth user creation returned ${created.status}.`);

  await psql(`
    insert into public.staff_users(
      supabase_auth_user_id, email, display_name, status, role, mfa_required
    ) values (
      ${sqlLiteral(authUserId)}::uuid,
      lower(${sqlLiteral(ADMIN_EMAIL)}),
      'Phase 10A4 Browser Teacher',
      'active', 'game_admin', false
    );
  `);

  const security = await psql(`
    select jsonb_build_object(
      'permissionVersion', permission_version,
      'securityVersion', security_version,
      'mfaRequired', mfa_required,
      'status', status,
      'role', role
    )::text
    from public.staff_users
    where supabase_auth_user_id = ${sqlLiteral(authUserId)}::uuid;
  `, { json: true });
  assert(
    Number.isSafeInteger(Number(security.permissionVersion)) &&
      Number(security.permissionVersion) > 0 &&
      Number.isSafeInteger(Number(security.securityVersion)) &&
      Number(security.securityVersion) > 0 &&
      security.mfaRequired === false &&
      security.status === "active" &&
      security.role === "game_admin",
    "The disposable Staff authorization fixture is invalid.",
  );

  const metadata = await fetchJson(
    `${runtime.apiUrl}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`,
    {
      method: "PUT",
      headers: adminAuthHeaders,
      body: {
        app_metadata: {
          econovaria_role: "game_admin",
          permission_version: Number(security.permissionVersion),
          security_version: Number(security.securityVersion),
        },
        user_metadata: { display_name: "Phase 10A4 Browser Teacher" },
      },
    },
  );
  assert(metadata.ok, `Local Auth metadata update returned ${metadata.status}.`);

  const signIn = await fetchJson(`${runtime.apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      apikey: runtime.publishableKey,
    },
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const accessToken = String(signIn.payload?.access_token || "").trim();
  assert(signIn.ok && accessToken, `Local Staff password sign-in returned ${signIn.status}.`);
  if (!SECRET_LITERALS.includes(accessToken)) SECRET_LITERALS.push(accessToken);

  const admin = {
    publishableKey: runtime.publishableKey,
    accessToken,
    deviceId: crypto.randomUUID(),
  };
  const bootstrap = await fetchJson(
    `${BASE_URL}/functions/v1/classroom-api/staff/bootstrap`,
    { headers: adminHeaders(admin) },
  );
  assert(
    bootstrap.status === 200 && bootstrap.payload?.ok === true,
    `Authenticated Staff bootstrap returned ${bootstrap.status}.`,
  );
  evidence.provisioning.staffFixtureCreated = true;
  evidence.provisioning.authenticatedAdminApi = true;
  return admin;
}

async function createGame(admin, ordinal) {
  const idempotencyKey = `phase10a4-game-${ordinal}-${crypto.randomUUID()}`;
  const response = await fetchJson(`${BASE_URL}/functions/v1/admin-api/games`, {
    method: "POST",
    headers: adminHeaders(admin, "", idempotencyKey),
    body: {
      purchaseCode: LICENSE_CODE,
      gameName: `${GAME_NAME} ${ordinal}`,
      difficultyPreset: "moderate",
      stockMarketWindow: { timezone: "Asia/Seoul" },
    },
  });
  assert([200, 201].includes(response.status), `Game ${ordinal} creation returned ${response.status}.`);
  const record = findGame(response.payload);
  const gameId = String(record?.id || record?.gameId || record?.gameSessionId || "").trim();
  let gameCode = String(record?.joinCode || record?.gameCode || record?.gameJoinCode || "").trim();
  assert(UUID_PATTERN.test(gameId), `Game ${ordinal} creation did not return an internal scope.`);
  if (!GAME_CODE_PATTERN.test(gameCode)) {
    gameCode = await psql(`
      select coalesce(game_join_code, '')
      from public.game_sessions
      where id = ${sqlLiteral(gameId)}::uuid;
    `);
  }
  assert(GAME_CODE_PATTERN.test(gameCode), `Game ${ordinal} did not receive a memorable join code.`);
  evidence.provisioning.gamesCreated += 1;
  return { ordinal, id: gameId, code: gameCode };
}

async function createPlayer(admin, game, fixture, ordinal) {
  const idempotencyKey = `phase10a4-player-${game.ordinal}-${ordinal}-${crypto.randomUUID()}`;
  const response = await fetchJson(
    `${BASE_URL}/functions/v1/admin-api/games/${encodeURIComponent(game.id)}/players`,
    {
      method: "POST",
      headers: adminHeaders(admin, game.id, idempotencyKey),
      body: {
        displayName: fixture.displayName,
        rosterLabel: fixture.rosterLabel,
        playerIdentifier: fixture.playerIdentifier,
        accessCode: fixture.accessCode,
      },
    },
  );
  assert([200, 201].includes(response.status), `${fixture.role} creation returned ${response.status}.`);
  const record = findPlayer(response.payload, fixture);
  const id = String(record?.id || record?.playerId || "").trim();
  assert(UUID_PATTERN.test(id), `${fixture.role} creation did not return an internal identity.`);
  evidence.provisioning.playersCreated += 1;
  return { ...fixture, id };
}

async function playerEconomicContext(game, player) {
  const context = await psql(`
    select jsonb_build_object(
      'countryCode', country.country_code,
      'currencyCode', country.currency_code
    )::text
    from public.player_country_assignments as assignment
    join public.country_profiles as country
      on country.id = assignment.country_profile_id
    where assignment.game_session_id = ${sqlLiteral(game.id)}::uuid
      and assignment.player_id = ${sqlLiteral(player.id)}::uuid
      and assignment.status = 'active'
    order by assignment.assigned_at desc
    limit 1;
  `, { json: true });
  assert(PUBLIC.currency.test(String(context.currencyCode || "")), "Player currency assignment is invalid.");
  assert(/^[A-Z][A-Z0-9_]{2,31}$/u.test(String(context.countryCode || "")), "Player country assignment is invalid.");
  return context;
}

async function fundBuyer(admin, game, buyer, currencyCode) {
  const idempotencyKey = `phase10a4-funding-${game.ordinal}-${crypto.randomUUID()}`;
  const response = await fetchJson(
    `${BASE_URL}/functions/v1/admin-api/games/${encodeURIComponent(game.id)}/players/${encodeURIComponent(buyer.id)}/ledger-adjustments`,
    {
      method: "POST",
      headers: adminHeaders(admin, game.id, idempotencyKey),
      body: {
        amount: CREDIT_AMOUNT,
        reason: "Disposable Phase 10A4 connected Store acceptance fixture",
        accountType: "checking",
        currencyCode,
        idempotencyKey,
      },
    },
  );
  assert(response.status === 200, `Buyer funding returned ${response.status}.`);
  const records = walkObjects(response.payload);
  const applied = response.payload?.ok === true || records.some((candidate) =>
    candidate.adjusted === true ||
    (String(candidate.accountType || "").toLowerCase() === "checking" &&
      String(candidate.currencyCode || "").toUpperCase() === currencyCode)
  );
  assert(applied, "Buyer funding did not return an authoritative checking adjustment.");
  evidence.provisioning.buyersFunded += 1;
}

async function fundForeignBuyerChecking(game, buyer, targetCurrencyCode) {
  const currencyCode = targetCurrencyCode === "NRC" ? "YRC" : "NRC";
  assert(currencyCode !== targetCurrencyCode, "Foreign funding fixture selected the Store target currency.");
  await psql(`
    select *
    from public.record_player_ledger_entry(
      ${sqlLiteral(game.id)}::uuid,
      ${sqlLiteral(buyer.id)}::uuid,
      'checking',
      ${CREDIT_AMOUNT},
      ${sqlLiteral(currencyCode)},
      'credit',
      'setup',
      'initial_balance_seed',
      ${sqlLiteral(buyer.id)}::uuid,
      'system',
      null,
      jsonb_build_object(
        'bankTransactionIdempotencyKey',
        ${sqlLiteral(`phase10a4-foreign-funding-${game.ordinal}`)}
      )
    );
  `);
  const account = await psql(`
    select jsonb_build_object(
      'accountKey', account_row.public_key,
      'currencyCode', account_row.currency_code,
      'balance', balance_row.balance::text
    )::text
    from public.bank_accounts as account_row
    join public.economic_parties as party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    join public.account_balances as balance_row
      on balance_row.bank_account_id = account_row.id
     and balance_row.game_session_id = account_row.game_session_id
    where account_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and account_row.account_kind = 'checking'
      and account_row.status = 'active'
      and account_row.currency_code = ${sqlLiteral(currencyCode)}
      and party_row.party_kind = 'player'
      and party_row.player_id = ${sqlLiteral(buyer.id)}::uuid
      and party_row.status = 'active';
  `, { json: true });
  assertPublic(account.accountKey, PUBLIC.account, "Foreign Buyer Checking account");
  assert(account.currencyCode === currencyCode, "Foreign Buyer Checking currency is invalid.");
  assert(amount(account.balance) === CREDIT_AMOUNT, "Foreign Buyer Checking funding is invalid.");
  evidence.provisioning.foreignBuyerAccountsFunded += 1;
  return account;
}

async function createBusinessOfferFixture(game, buyer, seller, economicContext) {
  const businessName = `Phase 10A4 Seller Business ${game.ordinal}`;
  const creation = await psql(`
    select jsonb_build_object(
      'businessKey', business_key,
      'status', status,
      'replayed', replayed
    )::text
    from public.create_or_acquire_player_business_v1(
      ${sqlLiteral(game.id)}::uuid,
      ${sqlLiteral(seller.id)}::uuid,
      ${sqlLiteral(businessName)},
      'sole_proprietorship',
      'manufacturing',
      ${sqlLiteral(economicContext.countryCode)},
      ${sqlLiteral(economicContext.currencyCode)},
      0,
      null,
      ${sqlLiteral(`phase10a4-business-${game.ordinal}`)}
    );
  `, { json: true });
  const businessKey = assertPublic(creation.businessKey, PUBLIC.business, "Business fixture");
  assert(creation.status === "active", "Business fixture is not active.");

  const internal = await psql(`
    select jsonb_build_object(
      'businessId', business.id,
      'storeItemId', store_item.id,
      'gameItemId', game_item.id,
      'storeItemKey', store_item.item_key,
      'catalogItemKey', game_item.public_key,
      'canonicalItemKey', game_item.canonical_key,
      'itemName', store_item.name,
      'currencyCode', store_item.currency_code
    )::text
    from public.business_entities as business
    cross join lateral (
      select item.*
      from public.store_items as item
      where item.game_session_id = business.game_session_id
        and item.status = 'active'
        and item.visibility = 'visible'
        and item.stock_quantity >= 3
        and item.game_item_id is not null
        and item.currency_code = business.currency_code
        and exists (
          select 1
          from public.store_seller_offers as seeded
          where seeded.game_session_id = item.game_session_id
            and seeded.store_item_id = item.id
            and seeded.seller_kind = 'seeded'
            and seeded.status = 'active'
        )
      order by item.sort_order, item.item_key
      limit 1
    ) as store_item
    join public.game_items as game_item
      on game_item.game_session_id = store_item.game_session_id
     and game_item.id = store_item.game_item_id
    where business.game_session_id = ${sqlLiteral(game.id)}::uuid
      and business.public_key = ${sqlLiteral(businessKey)};
  `, { json: true });
  assert(UUID_PATTERN.test(String(internal.businessId || "")), "Business fixture internal identity is missing.");
  assert(UUID_PATTERN.test(String(internal.storeItemId || "")), "A seeded Store item in the Buyer currency is required.");
  assert(UUID_PATTERN.test(String(internal.gameItemId || "")), "Canonical Store item identity is missing.");
  assert(String(internal.currencyCode) === economicContext.currencyCode, "Store item currency does not match the Buyer.");

  await psql(`
    begin;
    select public.ensure_business_bank_account_v2(
      ${sqlLiteral(game.id)}::uuid,
      ${sqlLiteral(internal.businessId)}::uuid
    );
    insert into public.business_products(
      game_session_id, business_id, name, category, status,
      unit_price, reference_price, unit_input_cost, unit_labor_cost,
      capacity_units, base_demand_units, quality_score,
      product_kind, output_game_item_id
    ) values (
      ${sqlLiteral(game.id)}::uuid,
      ${sqlLiteral(internal.businessId)}::uuid,
      ${sqlLiteral(`Connected ${internal.itemName}`)},
      'finished_goods', 'active',
      ${BUSINESS_UNIT_PRICE}, ${BUSINESS_UNIT_PRICE}, ${BUSINESS_UNIT_COST}, 0,
      100, 20, 75,
      'physical_good', ${sqlLiteral(internal.gameItemId)}::uuid
    );
    insert into public.business_inventory(
      game_session_id, business_id, item_key, inventory_kind,
      quantity, unit_cost, game_item_id
    ) values (
      ${sqlLiteral(game.id)}::uuid,
      ${sqlLiteral(internal.businessId)}::uuid,
      ${sqlLiteral(internal.canonicalItemKey)},
      'finished_good', ${BUSINESS_FINISHED_QUANTITY}, ${BUSINESS_UNIT_COST},
      ${sqlLiteral(internal.gameItemId)}::uuid
    );
    commit;
  `);

  const draft = await psql(`
    select public.create_business_store_offer_draft_v2(
      ${sqlLiteral(game.id)}::uuid,
      ${sqlLiteral(businessKey)},
      ${sqlLiteral(internal.storeItemKey)},
      ${BUSINESS_UNIT_PRICE},
      ${sqlLiteral(`phase10a4-offer-${game.ordinal}`)}
    )::text;
  `, { json: true });
  const offerKey = assertPublic(draft.offerKey, PUBLIC.offer, "Business seller offer");
  assert(Number(draft.version) === 1 && draft.status === "draft", "Business seller offer draft version is invalid.");

  const stocked = await psql(`
    select public.stock_business_store_offer_v2(
      ${sqlLiteral(game.id)}::uuid,
      ${sqlLiteral(businessKey)},
      ${sqlLiteral(offerKey)},
      ${BUSINESS_LISTING_QUANTITY}, 1,
      ${sqlLiteral(`phase10a4-stock-${game.ordinal}`)}
    )::text;
  `, { json: true });
  assert(
    Number(stocked.offerVersion) === 2 &&
      Number(stocked.listedQuantity) === BUSINESS_LISTING_QUANTITY &&
      sameAmount(stocked.averageUnitCost, BUSINESS_UNIT_COST),
    "Business Store listing stock projection is invalid.",
  );

  const activated = await psql(`
    select public.mutate_store_seller_offer_v2(
      ${sqlLiteral(game.id)}::uuid,
      ${sqlLiteral(offerKey)}, 2, null, 'active', null
    )::text;
  `, { json: true });
  assert(
    Number(activated.version) === 3 && activated.status === "active",
    "Business Store offer activation is invalid.",
  );

  evidence.provisioning.businessOffersCreated += 1;
  return {
    game,
    buyer,
    seller,
    buyerEconomicContext: economicContext,
    businessKey,
    businessName,
    offerKey,
    storeItemKey: assertPublic(internal.storeItemKey, PUBLIC.storeItem, "Store item"),
    catalogItemKey: assertPublic(internal.catalogItemKey, PUBLIC.catalogItem, "Catalog item"),
    canonicalItemKey: assertPublic(internal.canonicalItemKey, PUBLIC.canonicalItem, "Canonical item"),
    itemName: String(internal.itemName),
    currencyCode: String(internal.currencyCode),
    initialOfferVersion: Number(activated.version),
    initialListedQuantity: Number(stocked.listedQuantity),
    sourceUnitCost: amount(stocked.averageUnitCost),
  };
}

async function licenseVector(game1, game2) {
  return await psql(`
    select jsonb_build_object(
      'status', code.status,
      'maxRedemptions', code.max_redemptions,
      'redeemedCount', code.redeemed_count,
      'entitlementCount', count(entitlement.id)
    )::text
    from public.purchase_codes as code
    join public.entitlements as entitlement on entitlement.purchase_code_id = code.id
    where entitlement.game_session_id in (
      ${sqlLiteral(game1.id)}::uuid,
      ${sqlLiteral(game2.id)}::uuid
    )
    group by code.id, code.status, code.max_redemptions, code.redeemed_count
    order by code.updated_at desc
    limit 1;
  `, { json: true });
}

async function stateSnapshot(fixture) {
  return await psql(`
    with scope as (
      select
        offer.id as offer_id,
        offer.public_key as offer_key,
        offer.game_session_id,
        offer.inventory_account_id as listing_account_id,
        offer.game_item_id,
        offer.version as offer_version,
        offer.status as offer_status,
        offer.currency_code,
        business.public_key as business_key,
        business.id as business_id,
        ${sqlLiteral(fixture.buyer.id)}::uuid as buyer_id
      from public.store_seller_offers as offer
      join public.economic_parties as party
        on party.game_session_id = offer.game_session_id
       and party.id = offer.seller_party_id
      join public.business_entities as business
        on business.game_session_id = party.game_session_id
       and business.id = party.business_id
      where offer.game_session_id = ${sqlLiteral(fixture.game.id)}::uuid
        and offer.public_key = ${sqlLiteral(fixture.offerKey)}
    ), buyer_account as (
      select account.id, account.public_key
      from scope
      join public.economic_parties as party
        on party.game_session_id = scope.game_session_id
       and party.player_id = scope.buyer_id
       and party.party_kind = 'player'
      join public.inventory_accounts as account
        on account.game_session_id = party.game_session_id
       and account.party_id = party.id
       and account.account_kind = 'personal'
       and account.location_key is null
      limit 1
    )
    select jsonb_build_object(
      'offerKey', scope.offer_key,
      'businessKey', scope.business_key,
      'currencyCode', scope.currency_code,
      'buyerChecking', coalesce((
        select balance from public.account_balances
        where game_session_id = scope.game_session_id
          and player_id = scope.buyer_id
          and business_id is null
          and account_type = 'checking'
          and currency_code = scope.currency_code
      ), 0),
      'businessCash', coalesce((
        select balance from public.account_balances
        where game_session_id = scope.game_session_id
          and business_id = scope.business_id
          and currency_code = scope.currency_code
      ), 0),
      'offerStatus', scope.offer_status,
      'offerVersion', scope.offer_version,
      'listingQuantity', coalesce((
        select quantity_owned from public.inventory_holdings
        where game_session_id = scope.game_session_id
          and inventory_account_id = scope.listing_account_id
          and game_item_id = scope.game_item_id
      ), 0),
      'listingReserved', coalesce((
        select quantity_reserved from public.inventory_holdings
        where game_session_id = scope.game_session_id
          and inventory_account_id = scope.listing_account_id
          and game_item_id = scope.game_item_id
      ), 0),
      'listingVersion', coalesce((
        select version from public.inventory_holdings
        where game_session_id = scope.game_session_id
          and inventory_account_id = scope.listing_account_id
          and game_item_id = scope.game_item_id
      ), 0),
      'listingAverageUnitCost', coalesce((
        select average_unit_cost from public.inventory_holdings
        where game_session_id = scope.game_session_id
          and inventory_account_id = scope.listing_account_id
          and game_item_id = scope.game_item_id
      ), 0),
      'listingCostCurrencyCode', coalesce((
        select cost_currency_code from public.inventory_holdings
        where game_session_id = scope.game_session_id
          and inventory_account_id = scope.listing_account_id
          and game_item_id = scope.game_item_id
      ), ''),
      'buyerInventoryAccountKey', coalesce((select public_key from buyer_account), ''),
      'buyerQuantity', coalesce((
        select holding.quantity_owned
        from buyer_account
        join public.inventory_holdings as holding
          on holding.game_session_id = scope.game_session_id
         and holding.inventory_account_id = buyer_account.id
         and holding.game_item_id = scope.game_item_id
      ), 0),
      'buyerAverageUnitCost', coalesce((
        select holding.average_unit_cost
        from buyer_account
        join public.inventory_holdings as holding
          on holding.game_session_id = scope.game_session_id
         and holding.inventory_account_id = buyer_account.id
         and holding.game_item_id = scope.game_item_id
      ), 0),
      'buyerCostCurrencyCode', coalesce((
        select holding.cost_currency_code
        from buyer_account
        join public.inventory_holdings as holding
          on holding.game_session_id = scope.game_session_id
         and holding.inventory_account_id = buyer_account.id
         and holding.game_item_id = scope.game_item_id
      ), ''),
      'quoteCount', (select count(*) from public.store_offer_purchase_quotes
        where game_session_id = scope.game_session_id
          and buyer_player_id = scope.buyer_id and offer_id = scope.offer_id),
      'receiptCount', (select count(*) from public.store_offer_purchase_receipts
        where game_session_id = scope.game_session_id
          and buyer_player_id = scope.buyer_id and offer_id = scope.offer_id),
      'fundingReceiptCount', (select count(*) from public.purchase_funding_receipts
        where game_session_id = scope.game_session_id
          and source_domain = 'store'
          and source_action = 'business_offer_purchase_funding'
          and source_id in (select id from public.store_offer_purchase_receipts
            where game_session_id = scope.game_session_id and offer_id = scope.offer_id)),
      'fundingTransactionCount', (select count(*) from public.bank_transactions
        where game_session_id = scope.game_session_id
          and source_domain = 'store'
          and source_action = 'business_offer_purchase_funding'
          and source_id in (select id from public.store_offer_purchase_receipts
            where game_session_id = scope.game_session_id and offer_id = scope.offer_id)),
      'fundingLedgerCount', (select count(*) from public.ledger_entries
        where game_session_id = scope.game_session_id
          and source_domain = 'store'
          and source_action = 'business_offer_purchase_funding'
          and source_id in (select id from public.store_offer_purchase_receipts
            where game_session_id = scope.game_session_id and offer_id = scope.offer_id)),
      'inventoryTransactionCount', (select count(*) from public.inventory_transactions
        where game_session_id = scope.game_session_id
          and source_domain = 'store' and source_action = 'business_offer_purchase'
          and source_id in (select id from public.store_offer_purchase_receipts
            where game_session_id = scope.game_session_id and offer_id = scope.offer_id)),
      'purchasedEventCount', (select count(*) from public.inventory_events
        where game_session_id = scope.game_session_id
          and player_id = scope.buyer_id
          and event_type = 'PURCHASED'
          and inventory_transaction_id in (select inventory_transaction_id
            from public.store_offer_purchase_receipts
            where game_session_id = scope.game_session_id and offer_id = scope.offer_id)),
      'businessActivityCount', (select count(*) from public.business_activity_events
        where game_session_id = scope.game_session_id
          and business_id = scope.business_id
          and event_type = 'business.store.sale.completed'
          and source_id in (select id from public.store_offer_purchase_receipts
            where game_session_id = scope.game_session_id and offer_id = scope.offer_id))
    )::text
    from scope;
  `, { json: true });
}

async function fundingSourceBalances(fixture, fundingQuote) {
  const accountKeys = fundingQuote.lines.map((line) => line.sourceAccountKey);
  const balances = await psql(`
    select coalesce(
      jsonb_object_agg(account_row.public_key, balance_row.balance::text),
      '{}'::jsonb
    )::text
    from public.bank_accounts as account_row
    join public.economic_parties as party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    join public.account_balances as balance_row
      on balance_row.bank_account_id = account_row.id
     and balance_row.game_session_id = account_row.game_session_id
    where account_row.game_session_id = ${sqlLiteral(fixture.game.id)}::uuid
      and account_row.public_key in (
        select jsonb_array_elements_text(${sqlLiteral(JSON.stringify(accountKeys))}::jsonb)
      )
      and account_row.account_kind = 'checking'
      and account_row.status = 'active'
      and party_row.party_kind = 'player'
      and party_row.player_id = ${sqlLiteral(fixture.buyer.id)}::uuid
      and party_row.status = 'active';
  `, { json: true });
  assert(
    Object.keys(balances).length === accountKeys.length &&
      accountKeys.every((accountKey) => Object.hasOwn(balances, accountKey)),
    "Funding source balance vector is incomplete.",
  );
  return balances;
}

async function receiptVector(fixture, receiptKey) {
  return await psql(`
    select jsonb_build_object(
      'receiptKey', receipt.public_key,
      'quoteKey', receipt.quote_key,
      'offerKey', receipt.offer_key,
      'businessKey', receipt.business_key,
      'sellerPartyKey', receipt.seller_party_key,
      'catalogItemKey', receipt.catalog_item_key,
      'canonicalItemKey', receipt.canonical_item_key,
      'storeItemKey', receipt.store_item_key,
      'buyerInventoryAccountKey', receipt.buyer_inventory_account_key,
      'inventoryTransactionKey', receipt.inventory_transaction_key,
      'quantity', receipt.quantity,
      'unitPrice', receipt.unit_price,
      'totalPrice', receipt.total_price,
      'currencyCode', receipt.currency_code,
      'buyerDebit', receipt.buyer_debit,
      'businessCredit', receipt.business_credit,
      'grossRevenue', receipt.gross_revenue,
      'sourceUnitCost', receipt.source_unit_cost,
      'costCurrencyCode', receipt.cost_currency_code,
      'costOfGoodsSold', receipt.cost_of_goods_sold,
      'grossMargin', receipt.gross_margin,
      'offerVersionBefore', receipt.offer_version_before,
      'offerVersionAfter', receipt.offer_version_after,
      'remainingListedQuantity', receipt.remaining_listed_quantity,
      'quoteStatus', quote.status,
      'quoteVersion', quote.version,
      'quoteOfferVersion', quote.offer_version,
      'quoteQuantity', quote.quantity,
      'quoteUnitPrice', quote.final_unit_price,
      'quoteTotalPrice', quote.final_total_price,
      'fundingReceiptCount', (select count(*) from public.purchase_funding_receipts as funding
        where funding.game_session_id = receipt.game_session_id
          and funding.id = receipt.funding_receipt_id
          and funding.bank_transaction_id = receipt.bank_transaction_id
          and funding.quote_id = quote.funding_quote_id
          and funding.source_domain = 'store'
          and funding.source_action = 'business_offer_purchase_funding'
          and funding.source_id = receipt.id),
      'fundingTransactionCount', (select count(*) from public.bank_transactions as transaction_row
        where transaction_row.game_session_id = receipt.game_session_id
          and transaction_row.id = receipt.bank_transaction_id
          and transaction_row.source_domain = 'store'
          and transaction_row.source_action = 'business_offer_purchase_funding'
          and transaction_row.source_id = receipt.id),
      'fundingQuoteLineCount', (select count(*) from public.purchase_funding_quote_lines
        where game_session_id = receipt.game_session_id
          and quote_id = quote.funding_quote_id),
      'ledgerPostingCount', (select count(*) from public.ledger_entries
        where game_session_id = receipt.game_session_id
          and bank_transaction_id = receipt.bank_transaction_id
          and source_id = receipt.id
          and source_domain = 'store'
          and source_action = 'business_offer_purchase_funding'),
      'sourceDebitPostingCount', (select count(*) from public.ledger_entries
        where game_session_id = receipt.game_session_id
          and bank_transaction_id = receipt.bank_transaction_id
          and source_id = receipt.id
          and entry_type = 'debit'
          and line_metadata ->> 'lineRole' = 'purchase_funding_source_debit'
          and source_domain = 'store'
          and source_action = 'business_offer_purchase_funding'),
      'recipientCreditPostingCount', (select count(*) from public.ledger_entries
        where game_session_id = receipt.game_session_id
          and bank_transaction_id = receipt.bank_transaction_id
          and source_id = receipt.id
          and entry_type = 'credit'
          and amount = receipt.total_price
          and line_metadata ->> 'lineRole' = 'purchase_funding_recipient_credit'
          and source_domain = 'store'
          and source_action = 'business_offer_purchase_funding'),
      'recipientCreditAmount', coalesce((select sum(amount) from public.ledger_entries
        where game_session_id = receipt.game_session_id
          and bank_transaction_id = receipt.bank_transaction_id
          and source_id = receipt.id
          and line_metadata ->> 'lineRole' = 'purchase_funding_recipient_credit'
          and source_domain = 'store'
          and source_action = 'business_offer_purchase_funding'), 0),
      'inventoryTransactionCount', (select count(*) from public.inventory_transactions
        where game_session_id = receipt.game_session_id and id = receipt.inventory_transaction_id
          and public_key = receipt.inventory_transaction_key
          and transaction_type = 'purchase' and status = 'committed'
          and source_domain = 'store' and source_action = 'business_offer_purchase'
          and source_id = receipt.id),
      'inventoryLineCount', (select count(*) from public.inventory_transaction_lines
        where game_session_id = receipt.game_session_id
          and transaction_id = receipt.inventory_transaction_id),
      'listingLineCount', (select count(*) from public.inventory_transaction_lines
        where game_session_id = receipt.game_session_id
          and transaction_id = receipt.inventory_transaction_id
          and inventory_account_id = receipt.listing_inventory_account_id
          and game_item_id = receipt.game_item_id
          and quantity_delta = -receipt.quantity
          and unit_cost = receipt.source_unit_cost
          and currency_code = receipt.cost_currency_code),
      'buyerLineCount', (select count(*) from public.inventory_transaction_lines
        where game_session_id = receipt.game_session_id
          and transaction_id = receipt.inventory_transaction_id
          and inventory_account_id = receipt.buyer_inventory_account_id
          and game_item_id = receipt.game_item_id
          and quantity_delta = receipt.quantity
          and unit_cost = receipt.unit_price
          and currency_code = receipt.currency_code),
      'purchasedEventCount', (select count(*) from public.inventory_events
        where game_session_id = receipt.game_session_id
          and player_id = receipt.buyer_player_id
          and inventory_transaction_id = receipt.inventory_transaction_id
          and event_type = 'PURCHASED'
          and source_domain = 'store'
          and source_action = 'business_offer_purchase'
          and source_id = receipt.id),
      'businessActivityCount', (select count(*) from public.business_activity_events
        where game_session_id = receipt.game_session_id
          and business_id = receipt.business_id
          and source_id = receipt.id
          and event_type = 'business.store.sale.completed'
          and reason_code = 'business_store_offer_purchase'),
      'businessActivityKey', coalesce((select public_key from public.business_activity_events
        where game_session_id = receipt.game_session_id
          and business_id = receipt.business_id
          and source_id = receipt.id
          and event_type = 'business.store.sale.completed'
        limit 1), '')
    )::text
    from public.store_offer_purchase_receipts as receipt
    join public.store_offer_purchase_quotes as quote
      on quote.game_session_id = receipt.game_session_id
     and quote.id = receipt.quote_id
    where receipt.game_session_id = ${sqlLiteral(fixture.game.id)}::uuid
      and receipt.buyer_player_id = ${sqlLiteral(fixture.buyer.id)}::uuid
      and receipt.public_key = ${sqlLiteral(receiptKey)};
  `, { json: true });
}

function paymentAndInventoryVector(snapshot) {
  return {
    buyerChecking: amount(snapshot.buyerChecking),
    businessCash: amount(snapshot.businessCash),
    listingQuantity: Number(snapshot.listingQuantity),
    listingReserved: Number(snapshot.listingReserved),
    listingVersion: Number(snapshot.listingVersion),
    listingAverageUnitCost: amount(snapshot.listingAverageUnitCost),
    listingCostCurrencyCode: snapshot.listingCostCurrencyCode,
    buyerInventoryAccountKey: snapshot.buyerInventoryAccountKey,
    buyerQuantity: Number(snapshot.buyerQuantity),
    buyerAverageUnitCost: amount(snapshot.buyerAverageUnitCost),
    buyerCostCurrencyCode: snapshot.buyerCostCurrencyCode,
    receiptCount: Number(snapshot.receiptCount),
    fundingReceiptCount: Number(snapshot.fundingReceiptCount),
    fundingTransactionCount: Number(snapshot.fundingTransactionCount),
    fundingLedgerCount: Number(snapshot.fundingLedgerCount),
    inventoryTransactionCount: Number(snapshot.inventoryTransactionCount),
    purchasedEventCount: Number(snapshot.purchasedEventCount),
    businessActivityCount: Number(snapshot.businessActivityCount),
  };
}

async function proveWithdrawalFirstRejectsBeforePayment(fixture, sourceAccountKey) {
  const before = await stateSnapshot(fixture);
  const quote = await psql(`
    select public.create_business_store_offer_funding_quote_v1(
      ${sqlLiteral(fixture.game.id)}::uuid,
      ${sqlLiteral(fixture.buyer.id)}::uuid,
      ${sqlLiteral(fixture.offerKey)},
      ${BUSINESS_PURCHASE_QUANTITY},
      ${Number(before.offerVersion)},
      ${sqlLiteral(JSON.stringify([
        { sourceAccountKey, targetAmount: null },
      ]))}::jsonb,
      ${sqlLiteral(`phase10a4-withdrawal-first-quote-${fixture.game.ordinal}`)}
    )::text;
  `, { json: true });
  const quoteKey = assertPublic(quote.quoteKey, PUBLIC.quote, "Withdrawal-first quote");
  assert(Number(quote.offerVersion) === Number(before.offerVersion), "Withdrawal-first quote version is invalid.");
  assert(
    quote.fundingQuote?.requires_fx === true &&
      quote.fundingQuote?.lines?.every((line) => line.requires_fx === true),
    "Withdrawal-first quote did not retain all-foreign funding evidence.",
  );

  const withdrawal = await psql(`
    select public.request_business_store_offer_withdrawal_v2(
      ${sqlLiteral(fixture.game.id)}::uuid,
      ${sqlLiteral(fixture.businessKey)},
      ${sqlLiteral(fixture.offerKey)},
      'full', null,
      ${Number(before.offerVersion)},
      ${sqlLiteral(`phase10a4-withdrawal-first-${fixture.game.ordinal}`)}
    )::text;
  `, { json: true });
  assertPublic(withdrawal.requestKey, PUBLIC.withdrawal, "Withdrawal-first request");
  assert(
    withdrawal.requestStatus === "pending" &&
      withdrawal.offerStatus === "withdrawal_pending" &&
      Number(withdrawal.offerVersion) === Number(before.offerVersion) + 1,
    "Withdrawal-first request did not close the offer to new settlement.",
  );
  const afterWithdrawal = await stateSnapshot(fixture);
  assert(
    JSON.stringify(paymentAndInventoryVector(before)) ===
      JSON.stringify(paymentAndInventoryVector(afterWithdrawal)),
    "Withdrawal request moved money or Inventory before its effective time.",
  );
  assert(Number(afterWithdrawal.quoteCount) === Number(before.quoteCount) + 1, "Withdrawal-first quote was not retained.");
  assert(afterWithdrawal.offerStatus === "withdrawal_pending", "Withdrawal-first offer did not enter withdrawal_pending.");

  await expectPsqlFailure(`
    select public.settle_business_store_offer_funding_v2(
      ${sqlLiteral(fixture.game.id)}::uuid,
      ${sqlLiteral(fixture.buyer.id)}::uuid,
      ${sqlLiteral(quoteKey)},
      ${sqlLiteral(`phase10a4-withdrawal-first-purchase-${fixture.game.ordinal}`)}
    )::text;
  `, "STORE_OFFER_FUNDED_SETTLEMENT_OFFER_STATUS_INVALID");
  const afterRejectedPurchase = await stateSnapshot(fixture);
  evidence.database.withdrawalFirstRejectedBeforePayment =
    JSON.stringify(afterWithdrawal) === JSON.stringify(afterRejectedPurchase) &&
    Number(afterRejectedPurchase.receiptCount) === 0 &&
    Number(afterRejectedPurchase.fundingReceiptCount) === 0 &&
    Number(afterRejectedPurchase.fundingTransactionCount) === 0 &&
    Number(afterRejectedPurchase.fundingLedgerCount) === 0 &&
    Number(afterRejectedPurchase.inventoryTransactionCount) === 0 &&
    Number(afterRejectedPurchase.purchasedEventCount) === 0 &&
    Number(afterRejectedPurchase.businessActivityCount) === 0;
  assert(
    evidence.database.withdrawalFirstRejectedBeforePayment,
    "Withdrawal-first ordering did not reject atomically before payment.",
  );
  return afterRejectedPurchase;
}

async function provePurchaseFirstLeavesOnlyRemainderWithdrawable(fixture) {
  const before = await stateSnapshot(fixture);
  const remaining = Number(before.listingQuantity);
  assert(remaining === BUSINESS_LISTING_QUANTITY - BUSINESS_PURCHASE_QUANTITY, "Purchase-first listing remainder is invalid.");

  await expectPsqlFailure(`
    select public.request_business_store_offer_withdrawal_v2(
      ${sqlLiteral(fixture.game.id)}::uuid,
      ${sqlLiteral(fixture.businessKey)},
      ${sqlLiteral(fixture.offerKey)},
      'reduce', ${remaining + 1},
      ${Number(before.offerVersion)},
      ${sqlLiteral(`phase10a4-purchase-first-excess-${fixture.game.ordinal}`)}
    )::text;
  `, "STORE_WITHDRAWAL_REDUCTION_EXCEEDS_AVAILABLE");
  const afterExcess = await stateSnapshot(fixture);
  evidence.database.purchaseFirstExcessWithdrawalRejected =
    JSON.stringify(before) === JSON.stringify(afterExcess);
  assert(
    evidence.database.purchaseFirstExcessWithdrawalRejected,
    "Purchase-first excessive withdrawal changed authoritative state.",
  );

  const accepted = await psql(`
    select public.request_business_store_offer_withdrawal_v2(
      ${sqlLiteral(fixture.game.id)}::uuid,
      ${sqlLiteral(fixture.businessKey)},
      ${sqlLiteral(fixture.offerKey)},
      'reduce', ${remaining},
      ${Number(before.offerVersion)},
      ${sqlLiteral(`phase10a4-purchase-first-remainder-${fixture.game.ordinal}`)}
    )::text;
  `, { json: true });
  assertPublic(accepted.requestKey, PUBLIC.withdrawal, "Purchase-first withdrawal request");
  const afterAccepted = await stateSnapshot(fixture);
  evidence.database.purchaseFirstRemainingWithdrawalAccepted =
    accepted.requestStatus === "pending" &&
    accepted.offerStatus === "withdrawal_pending" &&
    Number(accepted.requestedQuantity) === remaining &&
    Number(accepted.offerVersion) === Number(before.offerVersion) + 1 &&
    Number(afterAccepted.listingQuantity) === remaining &&
    JSON.stringify(paymentAndInventoryVector(before)) ===
      JSON.stringify(paymentAndInventoryVector(afterAccepted));
  assert(
    evidence.database.purchaseFirstRemainingWithdrawalAccepted,
    "Purchase-first ordering did not accept exactly the remaining stock without early movement.",
  );
}

function sanitizeRequestPath(url) {
  return new URL(url).pathname
    .replace(/\/receipts\/spr_[0-9a-f]{32}$/u, "/receipts/:receiptKey");
}

function isPlayerStoreOrBusinessUrl(url) {
  const path = new URL(url).pathname;
  return path.includes("/players/me/store/") ||
    path.endsWith("/players/me/business") ||
    path.includes("/players/me/business/");
}

function isPlayerApiUrl(url) {
  return new URL(url).pathname.includes("/players/me");
}

function instrumentPlayerPage(page, label) {
  const audit = {
    label,
    navigations: 0,
    storePayloads: [],
    businessPurchaseRequestCount: 0,
  };
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) audit.navigations += 1;
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      evidence.browser.consoleErrors.push(`${audit.label}: ${redact(message.text())}`);
    }
  });
  page.on("pageerror", (error) => {
    evidence.browser.pageErrors.push(`${audit.label}: ${redact(error?.message || error)}`);
  });
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/players/me/store/offer-purchases")
    ) {
      audit.businessPurchaseRequestCount += 1;
    }
  });
  page.on("response", async (response) => {
    if (!isPlayerApiUrl(response.url())) return;
    if (isPlayerStoreOrBusinessUrl(response.url())) {
      evidence.browser.requests.push({
        context: audit.label,
        method: response.request().method(),
        path: sanitizeRequestPath(response.url()),
        status: response.status(),
      });
    }
    const contentType = response.headers()["content-type"] || "";
    if (!contentType.includes("application/json")) return;
    const body = await response.text().catch(() => "");
    observePlayerResponseBody(body);
    if (sanitizeRequestPath(response.url()).endsWith("/players/me/store/items")) {
      try {
        const payload = JSON.parse(body || "null");
        if (payload) audit.storePayloads.push(payload);
      } catch {
        evidence.browser.pageErrors.push(`${audit.label}: Store response JSON parsing failed.`);
      }
    }
  });
  return audit;
}

async function assertSafePlayerDom(page) {
  const markup = await page.locator("html").evaluate((element) => element.outerHTML);
  const unsafe = UUID_PATTERN.test(markup) ||
    JWT_PATTERN.test(markup) ||
    SUPABASE_KEY_PATTERN.test(markup) ||
    DATABASE_URL_PATTERN.test(markup) ||
    GAME_CODE_PATTERN.test(markup) ||
    SECRET_LITERALS.some((literal) => literal && markup.includes(literal));
  if (unsafe) evidence.browser.sensitiveValueObservedInPlayerDom = true;
  assert(!unsafe, "A sensitive or internal value appeared in rendered Player DOM.");
}

async function validatePlayerLoginResponse(response, label) {
  const body = await response.text();
  assertSafePlayerResponseBody(body, `${label} login response`);
  const payload = JSON.parse(body);
  const csrfToken = String(payload?.csrfToken || "");
  assert(
    payload?.ok === true && payload?.session?.authenticated === true && CSRF_PATTERN.test(csrfToken),
    `${label} login response did not establish a safe browser session.`,
  );
  if (!SECRET_LITERALS.includes(csrfToken)) SECRET_LITERALS.push(csrfToken);
}

async function completePlayerLogin(page, audit, game, player) {
  audit.label = player.role;
  await page.locator("#gameCode").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#gameCode").fill(game.code);
  await page.locator("#playerId").fill(player.playerIdentifier);
  await page.locator("#playerAccessCode").fill(player.accessCode);
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/player-web-session-api/login") &&
      response.request().method() === "POST",
    { timeout: 120_000 },
  );
  await page.locator("#playerForm button[type='submit']").click();
  const loginResponse = await loginResponsePromise;
  assert(loginResponse.status() === 200, `${player.role} login returned ${loginResponse.status()}.`);
  await validatePlayerLoginResponse(loginResponse, player.role);
  await page.waitForURL(/\/player-terminal\/(?:index\.html)?(?:#.*)?$/u, { timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(400);
  await assertSafePlayerDom(page);
  const documentMarker = `${Date.now()}-${Math.random()}`;
  await page.evaluate((marker) => {
    globalThis.__econovariaPhase10A4DocumentMarker = marker;
  }, documentMarker);
  return { documentMarker };
}

async function installCommittedRefreshAudit(session) {
  const installed = await session.page.evaluate(() => {
    const terminal = globalThis.Econovaria?.playerTerminal;
    if (!terminal || typeof terminal.refreshResources !== "function") return false;
    const originalRefreshResources = terminal.refreshResources;
    const entries = [];
    const safeToken = (value, fallback) => {
      const token = String(value || "").trim();
      return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(token) ? token : fallback;
    };
    const safeTokens = (values) => [...new Set(Array.isArray(values) ? values : [])]
      .map((value) => safeToken(value, "unknown"));
    const safeStatus = (value) => {
      const status = Number(value || 0);
      return Number.isInteger(status) && status >= 0 && status <= 599 ? status : 0;
    };
    const elapsed = (startedAt) => Math.min(
      300_000,
      Math.max(0, Math.round(performance.now() - startedAt)),
    );

    terminal.refreshResources = async function auditedCommittedRefresh(resources) {
      const startedAt = performance.now();
      try {
        const result = await Reflect.apply(originalRefreshResources, this, [resources]);
        const data = result?.data && typeof result.data === "object" && !Array.isArray(result.data)
          ? result.data
          : {};
        const errors = result?.errors && typeof result.errors === "object" && !Array.isArray(result.errors)
          ? result.errors
          : {};
        entries.push({
          resources: safeTokens(resources),
          dataKeys: safeTokens(Object.keys(data)),
          errors: Object.entries(errors).map(([resource, error]) => ({
            resource: safeToken(resource, "unknown"),
            code: safeToken(error?.code, "REQUEST_FAILED"),
            status: safeStatus(error?.status),
          })),
          elapsedMs: elapsed(startedAt),
          threw: false,
        });
        return result;
      } catch (error) {
        entries.push({
          resources: safeTokens(resources),
          dataKeys: [],
          errors: [{
            resource: "refresh",
            code: safeToken(error?.code, "REFRESH_THROWN"),
            status: safeStatus(error?.status),
          }],
          elapsedMs: elapsed(startedAt),
          threw: true,
        });
        throw error;
      }
    };
    globalThis.__econovariaPhase10A4CommittedRefreshAudit = { entries };
    return true;
  });
  assert(installed, "The connected Player terminal could not install safe committed-refresh auditing.");
}

function assertCommittedRefreshAudit(entry, label) {
  assert(entry && typeof entry === "object" && !Array.isArray(entry), `${label} audit entry is missing.`);
  assert(
    JSON.stringify(entry.resources) === JSON.stringify(EXPECTED_COMMITTED_REFRESH_RESOURCES),
    `${label} did not refresh the exact bounded committed resources.`,
  );
  assert(
    Array.isArray(entry.dataKeys) && entry.dataKeys.every((key) => REFRESH_AUDIT_TOKEN_PATTERN.test(key)),
    `${label} recorded an unsafe refresh data key.`,
  );
  assert(
    Array.isArray(entry.errors) && entry.errors.every((error) =>
      error &&
      REFRESH_AUDIT_TOKEN_PATTERN.test(String(error.resource || "")) &&
      REFRESH_AUDIT_TOKEN_PATTERN.test(String(error.code || "")) &&
      Number.isInteger(error.status) &&
      error.status >= 0 &&
      error.status <= 599
    ),
    `${label} recorded an unsafe refresh error.`,
  );
  assert(
    Number.isInteger(entry.elapsedMs) && entry.elapsedMs >= 0 && entry.elapsedMs <= 300_000,
    `${label} recorded invalid refresh timing.`,
  );
  assert(typeof entry.threw === "boolean", `${label} did not record whether refresh threw.`);
  return entry;
}

async function readCommittedRefreshAudits(session) {
  const entries = await session.page.evaluate(() =>
    globalThis.__econovariaPhase10A4CommittedRefreshAudit?.entries || []
  );
  assert(Array.isArray(entries), "Committed-refresh audit storage is invalid.");
  return entries.map((entry, index) =>
    assertCommittedRefreshAudit(entry, `Committed refresh ${index + 1}`)
  );
}

async function loginPlayer(browser, game, player) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  evidence.runtime.playerBrowserContexts += 1;
  const page = await context.newPage();
  const audit = instrumentPlayerPage(page, player.role);
  await page.goto(`${BASE_URL}/?mode=player&gameCode=${encodeURIComponent(game.code)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  const authenticated = await completePlayerLogin(page, audit, game, player);
  return { context, page, audit, player, ...authenticated };
}

async function reauthenticatePlayer(session, game, player) {
  await openRoute(session, "profile", '[data-page="profile"]');
  const logoutResponsePromise = session.page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/logout") &&
      response.request().method() === "POST",
  { timeout: 60_000 });
  await session.page.locator('[data-player-action="logout"]').click();
  const logoutResponse = await logoutResponsePromise;
  assert(logoutResponse.status() === 200, `${session.player.role} logout returned ${logoutResponse.status()}.`);
  await session.page.locator("#gameCode").waitFor({ state: "visible", timeout: 60_000 });
  const authenticated = await completePlayerLogin(session.page, session.audit, game, player);
  session.player = player;
  session.documentMarker = authenticated.documentMarker;
  session.storePayload = null;
  return session;
}

async function assertSameDocument(session, label) {
  const marker = await session.page.evaluate(() =>
    globalThis.__econovariaPhase10A4DocumentMarker || ""
  );
  assert(marker === session.documentMarker, `${label} convergence required a document reload.`);
}

async function openRoute(session, route, pageSelector) {
  const nav = session.page.locator(`[data-route="${route}"]:visible`).first();
  if (await nav.count()) {
    await nav.click();
  } else {
    await session.page.evaluate((target) => {
      const next = `#${target}`;
      if (location.hash === next) {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      } else {
        location.hash = next;
      }
    }, route);
  }
  await session.page.waitForFunction((target) => location.hash === `#${target}`, route, { timeout: 30_000 });
  await session.page.locator(pageSelector).waitFor({ state: "visible", timeout: 60_000 });
  await assertSafePlayerDom(session.page);
}

async function openStoreRoute(session) {
  const storeResponsePromise = session.page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/store/items") &&
      response.request().method() === "GET",
    { timeout: 120_000 },
  );
  await openRoute(session, "store", '[data-page="store"]');
  const storeResponse = await storeResponsePromise;
  assert(storeResponse.status() === 200, `${session.player.role} Store route returned ${storeResponse.status()}.`);
  const storePayload = await parsedPlaywrightResponse(storeResponse);
  session.storePayload = storePayload;
  return storePayload;
}

function responseBusinessQuote(payload) {
  return walkObjects(payload).find((candidate) => PUBLIC.quote.test(String(candidate.quoteKey || "")) &&
    PUBLIC.offer.test(String(candidate.offerKey || "")) &&
    Object.hasOwn(candidate, "availableQuantityAtQuote")) || null;
}

function responseBusinessReceipt(payload) {
  return walkObjects(payload).find((candidate) => PUBLIC.receipt.test(String(candidate.receiptKey || "")) &&
    PUBLIC.quote.test(String(candidate.quoteKey || "")) &&
    PUBLIC.offer.test(String(candidate.offerKey || ""))) || null;
}

function responseSeededQuote(payload) {
  return walkObjects(payload).find((candidate) => PUBLIC.quote.test(String(candidate.quoteKey || "")) &&
    PUBLIC.offer.test(String(candidate.offerKey || "")) &&
    ["seeded", "npc"].includes(candidate.sellerKind) &&
    Object.hasOwn(candidate, "finalTotalPrice")) || null;
}

function responseSeededReceipt(payload) {
  return walkObjects(payload).find((candidate) => PUBLIC.seededReceipt.test(String(candidate.receiptKey || ""))) || null;
}

async function parsedPlaywrightResponse(response) {
  const body = await response.text();
  assertSafePlayerResponseBody(body, "Player Store response");
  return JSON.parse(body);
}

function assertNoCrossGameStoreExposure(payload, otherFixture) {
  const serialized = JSON.stringify(payload);
  assert(!serialized.includes(otherFixture.offerKey), "Game 2 offer leaked into Game 1 Store response.");
  assert(!serialized.includes(otherFixture.businessKey), "Game 2 Business leaked into Game 1 Store response.");
}

async function assertReciprocalGameStoreExposure(session, ownFixture, otherFixture, otherReceiptKey) {
  const storePayload = await openStoreRoute(session);
  const serialized = JSON.stringify(storePayload);
  assert(
    serialized.includes(ownFixture.offerKey) && serialized.includes(ownFixture.businessKey),
    "Game 2 Store response omitted its own exact Business offer.",
  );
  assert(
    !serialized.includes(otherFixture.offerKey) &&
      !serialized.includes(otherFixture.businessKey) &&
      !serialized.includes(otherReceiptKey),
    "Game 2 Store response exposed Game 1 public scope.",
  );
  const store = session.page.locator('[data-page="store"]');
  const markup = await store.evaluate((element) => element.outerHTML);
  assert(
    !markup.includes(otherFixture.offerKey) &&
      !markup.includes(otherFixture.businessKey) &&
      !markup.includes(otherReceiptKey),
    "Game 2 Store DOM exposed Game 1 public scope.",
  );
  const ownRow = store.locator(`[data-player-store-offer-row="${ownFixture.offerKey}"]`);
  await ownRow.waitFor({ state: "visible", timeout: 60_000 });
  const ownText = await ownRow.innerText();
  assert(
    ownText.includes(ownFixture.businessName) &&
      ownText.includes(`${ownFixture.initialListedQuantity} available`),
    "Game 2 Store DOM changed its own Business seller or stock.",
  );
  const ownAction = ownRow.locator(
    `[data-player-store-offer="${ownFixture.offerKey}"][data-player-store-purchase-mode="business_offer"]`,
  );
  assert(await ownAction.isEnabled(), "Game 2 exact Business offer is not selectable in its own Store.");
  evidence.browser.game1KeysAbsentFromGame2Store = true;
  evidence.browser.game2OfferVisibleInGame2Store = true;
}

function assertFundingAllocations(allocations, label) {
  assert(Array.isArray(allocations) && allocations.length >= 1 && allocations.length <= 3, `${label} must contain one to three allocations.`);
  const seen = new Set();
  allocations.forEach((allocation, index) => {
    assertExactKeys(allocation, ["sourceAccountKey", "targetAmount"], `${label}[${index}]`);
    const accountKey = assertPublic(allocation.sourceAccountKey, PUBLIC.account, `${label}[${index}] account`);
    assert(!seen.has(accountKey), `${label} repeated a Checking account.`);
    seen.add(accountKey);
    if (index === allocations.length - 1) {
      assert(allocation.targetAmount === null, `${label} final target amount must be null.`);
    } else {
      exactDecimal(allocation.targetAmount, 18, `${label}[${index}] target amount`, { positive: true });
    }
  });
  return allocations;
}

function assertFundingQuoteEvidence(funding, expected) {
  assertExactKeys(funding, FUNDING_QUOTE_FIELDS, "Funding quote");
  assertPublic(funding.quoteKey, PUBLIC.fundingQuote, "Funding quote");
  assertPublic(funding.fixingKey, PUBLIC.fixing, "Funding fixing");
  assert(funding.fundingContextKind === expected.contextKind, "Funding quote context kind is invalid.");
  assert(funding.fundingContextKey === expected.commercialQuoteKey, "Funding quote context key is invalid.");
  assert(funding.targetCurrencyCode === expected.targetCurrencyCode, "Funding quote target currency is invalid.");
  assert(Number.isSafeInteger(funding.targetMinorUnit) && funding.targetMinorUnit >= 0 && funding.targetMinorUnit <= 18, "Funding quote target precision is invalid.");
  assert(typeof funding.policyVersion === "string" && funding.policyVersion.trim(), "Funding quote policy is unavailable.");
  assert(typeof funding.requiresFx === "boolean", "Funding quote FX state is invalid.");
  const expiresAt = Date.parse(funding.expiresAt);
  assert(Number.isFinite(expiresAt) && new Date(expiresAt).toISOString() === funding.expiresAt && expiresAt >= Date.parse(expected.commercialExpiresAt), "Funding quote expiry is invalid.");
  const target = exactDecimal(funding.targetAmount, funding.targetMinorUnit, "Funding quote target amount", { positive: true });
  assert(target === exactDecimal(String(expected.targetAmount), funding.targetMinorUnit, "Commercial target amount", { positive: true }), "Funding quote target amount changed the commercial bill.");
  assert(Array.isArray(funding.lines) && funding.lines.length === expected.allocations.length, "Funding quote line count changed the allocation intent.");
  const allocationsByAccount = new Map(
    expected.allocations.map((allocation) => [allocation.sourceAccountKey, allocation]),
  );
  const lineAccountKeys = funding.lines.map((line) => line.sourceAccountKey);
  const canonicalLineAccountKeys = [...lineAccountKeys].sort();
  assert(
    lineAccountKeys.every((accountKey, index) => accountKey === canonicalLineAccountKeys[index]),
    "Funding quote lines are not in canonical source-account order.",
  );
  let contributionTotal = 0n;
  funding.lines.forEach((line, index) => {
    assertExactKeys(line, FUNDING_QUOTE_LINE_FIELDS, `Funding quote line ${index + 1}`);
    assert(line.lineNumber === index + 1, "Funding quote line order is invalid.");
    const allocation = allocationsByAccount.get(line.sourceAccountKey);
    assert(allocation && PUBLIC.account.test(line.sourceAccountKey), "Funding quote returned an unexpected source account.");
    assert(PUBLIC.currency.test(line.sourceCurrencyCode) && PUBLIC.currency.test(line.targetCurrencyCode), "Funding quote line currency is invalid.");
    assert(Number.isSafeInteger(line.sourceMinorUnit) && line.sourceMinorUnit >= 0 && line.sourceMinorUnit <= 18, "Funding quote source precision is invalid.");
    assert(line.targetCurrencyCode === funding.targetCurrencyCode && line.targetMinorUnit === funding.targetMinorUnit, "Funding quote line target binding is invalid.");
    const posted = exactDecimal(line.postedAmount, line.sourceMinorUnit, "Funding posted amount");
    const held = exactDecimal(line.heldAmount, line.sourceMinorUnit, "Funding held amount");
    const available = exactDecimal(line.availableAmount, line.sourceMinorUnit, "Funding available amount");
    assert(posted - held === available, "Funding quote available balance does not reconcile.");
    const contribution = exactDecimal(line.targetContribution, funding.targetMinorUnit, "Funding target contribution", { positive: true });
    contributionTotal += contribution;
    exactDecimal(line.sourceDebit, line.sourceMinorUnit, "Funding source debit", { positive: true });
    const reference = exactDecimal(line.referenceRate, 18, "Funding reference rate", { positive: true });
    const customer = exactDecimal(line.customerRate, 18, "Funding customer rate", { positive: true });
    exactDecimal(line.effectiveRate, 18, "Funding effective rate", { positive: true });
    const spread = exactDecimal(line.spreadRate, 18, "Funding spread rate");
    assert(typeof line.requiresFx === "boolean" && typeof line.roundingDisclosure === "string" && line.roundingDisclosure.trim(), "Funding quote line disclosure is invalid.");
    if (line.requiresFx) {
      assert(line.sourceCurrencyCode !== line.targetCurrencyCode && spread === exactDecimal("0.01", 18, "Retail spread") && customer < reference, "Funding quote FX evidence is invalid.");
    } else {
      const one = exactDecimal("1", 18, "Unity rate");
      assert(line.sourceCurrencyCode === line.targetCurrencyCode && spread === 0n && reference === one && customer === one, "Funding quote same-currency evidence is invalid.");
    }
    const fixed = allocation.targetAmount;
    if (fixed !== null) assert(contribution === exactDecimal(fixed, funding.targetMinorUnit, "Fixed target contribution", { positive: true }), "Funding quote changed a fixed allocation.");
  });
  assert(contributionTotal === target && funding.requiresFx === funding.lines.some((line) => line.requiresFx), "Funding quote aggregate does not reconcile.");
  return funding;
}

function assertFundingReceiptEvidence(funding, quote, sourceAction) {
  assertExactKeys(funding, FUNDING_RECEIPT_FIELDS, "Funding receipt");
  assertPublic(funding.receiptKey, PUBLIC.fundingReceipt, "Funding receipt");
  assertPublic(funding.bankTransactionKey, PUBLIC.bankTransaction, "Funding transaction");
  assertPublic(funding.targetAccountKey, PUBLIC.account, "Funding target account");
  assert(funding.quoteKey === quote.quoteKey && funding.fundingContextKind === quote.fundingContextKind && funding.fundingContextKey === quote.fundingContextKey, "Funding receipt changed quote identity.");
  assert(funding.targetCurrencyCode === quote.targetCurrencyCode && funding.targetMinorUnit === quote.targetMinorUnit, "Funding receipt changed target currency.");
  assert(funding.sourceDomain === "store" && funding.sourceAction === sourceAction, "Funding receipt source evidence is invalid.");
  assert(exactDecimal(funding.targetAmount, funding.targetMinorUnit, "Funding receipt target", { positive: true }) === exactDecimal(quote.targetAmount, quote.targetMinorUnit, "Quoted funding target", { positive: true }), "Funding receipt changed target amount.");
  exactDecimal(funding.targetReserveDrawAmount, funding.targetMinorUnit, "Funding reserve draw");
  const createdAt = Date.parse(funding.createdAt);
  assert(Number.isFinite(createdAt) && new Date(createdAt).toISOString() === funding.createdAt, "Funding receipt timestamp is invalid.");
  assert(Array.isArray(funding.lines) && funding.lines.length === quote.lines.length, "Funding receipt line count changed.");
  funding.lines.forEach((line, index) => {
    assertExactKeys(line, FUNDING_RECEIPT_LINE_FIELDS, `Funding receipt line ${index + 1}`);
    for (const field of FUNDING_RECEIPT_LINE_FIELDS) {
      assert(line[field] === quote.lines[index][field], `Funding receipt changed immutable line field ${field}.`);
    }
  });
  return funding;
}

function assertQuote(quote, fixture, allocations) {
  assert(quote, "Business quote response is missing.");
  assertPublic(quote.quoteKey, PUBLIC.quote, "Business quote");
  assert(quote.quoteStatus === "created", "Business quote status is not created.");
  assert(quote.offerKey === fixture.offerKey, "Business quote changed the selected offer.");
  assert(quote.businessKey === fixture.businessKey, "Business quote changed the seller Business.");
  assert(quote.businessName === fixture.businessName && quote.sellerName === fixture.businessName, "Business quote changed the public seller name.");
  assert(quote.catalogItemKey === fixture.catalogItemKey, "Business quote changed the catalog item.");
  assert(quote.canonicalItemKey === fixture.canonicalItemKey, "Business quote changed the canonical item.");
  assert(quote.storeItemKey === fixture.storeItemKey, "Business quote changed the Store provenance.");
  assert(Number(quote.quantity) === BUSINESS_PURCHASE_QUANTITY, "Business quote quantity is invalid.");
  assert(Number(quote.availableQuantityAtQuote) === fixture.initialListedQuantity, "Business quote availability is invalid.");
  assert(Number(quote.offerVersion) === fixture.initialOfferVersion, "Business quote offer version is invalid.");
  assert(sameAmount(quote.unitPrice, BUSINESS_UNIT_PRICE), "Business quote unit price is invalid.");
  assert(sameAmount(quote.totalPrice, BUSINESS_UNIT_PRICE * BUSINESS_PURCHASE_QUANTITY), "Business quote total is invalid.");
  assert(quote.currencyCode === fixture.currencyCode, "Business quote currency is invalid.");
  return assertFundingQuoteEvidence(quote.fundingQuote, {
    commercialQuoteKey: quote.quoteKey,
    contextKind: "store.business-offer",
    targetCurrencyCode: quote.currencyCode,
    targetAmount: String(quote.totalPrice),
    commercialExpiresAt: quote.expiresAt,
    allocations,
  });
}

function assertBrowserScopeHeaders(headers, label) {
  const names = new Set(Object.keys(headers).map((name) => name.toLowerCase()));
  for (const forbidden of [
    "x-econovaria-game-id",
    "x-econovaria-game-session-id",
    "x-player-id",
  ]) {
    assert(!names.has(forbidden), `${label} exposed forbidden browser scope header ${forbidden}.`);
  }
}

function assertExactQuoteRequest(postData, headers, fixture) {
  const body = JSON.parse(postData || "null");
  assert(body && typeof body === "object" && !Array.isArray(body), "Business quote request body is invalid.");
  const expectedKeys = [
    "allocations",
    "expectedVersion",
    "idempotencyKey",
    "offerKey",
    "quantity",
  ];
  assert(
    JSON.stringify(Object.keys(body).sort()) === JSON.stringify(expectedKeys),
    "Business quote request carried fields outside the public command contract.",
  );
  assert(body.offerKey === fixture.offerKey, "Business quote request changed the offer.");
  assert(Number(body.quantity) === BUSINESS_PURCHASE_QUANTITY, "Business quote request changed quantity.");
  assert(Number(body.expectedVersion) === fixture.initialOfferVersion, "Business quote request changed expectedVersion.");
  assertFundingAllocations(body.allocations, "Business quote allocations");
  assert(typeof body.idempotencyKey === "string" && body.idempotencyKey.length >= 8, "Business quote idempotency key is invalid.");
  assert(headers["x-idempotency-key"] === body.idempotencyKey, "Business quote body/header idempotency keys differ.");
  assertBrowserScopeHeaders(headers, "Business quote request");
  UUID_PATTERN.lastIndex = 0;
  assert(!UUID_PATTERN.test(postData), "Business quote request body exposed an internal UUID.");
  return body;
}

function assertExactSeededQuoteRequest(postData, headers, offer) {
  const body = JSON.parse(postData || "null");
  assertExactKeys(
    body,
    ["allocations", "expectedVersion", "idempotencyKey", "offerKey", "quantity"],
    "System-offer quote request",
  );
  assert(
    body.offerKey === offer.offerKey &&
      Number(body.expectedVersion) === Number(offer.version) &&
      Number(body.quantity) === 1,
    "System-offer quote request changed the selected offer, version, or quantity.",
  );
  assertFundingAllocations(body.allocations, "Seeded quote allocations");
  assert(typeof body.idempotencyKey === "string" && body.idempotencyKey.length >= 8, "Seeded quote idempotency key is invalid.");
  assert(headers["x-idempotency-key"] === body.idempotencyKey, "Seeded quote body/header idempotency keys differ.");
  assertBrowserScopeHeaders(headers, "Seeded quote request");
  UUID_PATTERN.lastIndex = 0;
  assert(!UUID_PATTERN.test(postData), "Seeded quote request body exposed an internal UUID.");
  return body;
}

async function definitionRows(scope) {
  return await scope.locator("dl").evaluateAll((lists) => {
    const rows = {};
    for (const list of lists) {
      for (const term of list.querySelectorAll("dt")) {
        const value = term.nextElementSibling;
        if (value?.tagName === "DD") rows[term.textContent.trim()] = value.textContent.trim();
      }
    }
    return rows;
  });
}

function assertReceipt(receipt, fixture, quote) {
  assert(receipt, "Business receipt response is missing.");
  assertPublic(receipt.receiptKey, PUBLIC.receipt, "Business receipt");
  assert(receipt.quoteKey === quote.quoteKey, "Business receipt changed the quote identity.");
  assert(receipt.offerKey === fixture.offerKey, "Business receipt changed the offer identity.");
  assert(receipt.businessKey === fixture.businessKey, "Business receipt changed the Business identity.");
  assert(receipt.businessName === fixture.businessName && receipt.sellerName === fixture.businessName, "Business receipt changed the public seller name.");
  assert(receipt.catalogItemKey === fixture.catalogItemKey, "Business receipt changed the catalog identity.");
  assert(receipt.canonicalItemKey === fixture.canonicalItemKey, "Business receipt changed the canonical identity.");
  assert(receipt.storeItemKey === fixture.storeItemKey, "Business receipt changed Store provenance.");
  assert(Number(receipt.quantity) === BUSINESS_PURCHASE_QUANTITY, "Business receipt quantity is invalid.");
  assert(sameAmount(receipt.unitPrice, BUSINESS_UNIT_PRICE), "Business receipt unit price is invalid.");
  assert(sameAmount(receipt.totalPrice, BUSINESS_UNIT_PRICE * BUSINESS_PURCHASE_QUANTITY), "Business receipt total is invalid.");
  assert(receipt.currencyCode === fixture.currencyCode, "Business receipt currency is invalid.");
  assert(Number(receipt.offerVersionBefore) === fixture.initialOfferVersion, "Business receipt before-version is invalid.");
  assert(Number(receipt.offerVersionAfter) === fixture.initialOfferVersion + 1, "Business receipt after-version is invalid.");
  assert(Number(receipt.remainingListedQuantity) === BUSINESS_LISTING_QUANTITY - BUSINESS_PURCHASE_QUANTITY, "Business receipt remaining stock is invalid.");
  return assertFundingReceiptEvidence(
    receipt.fundingReceipt,
    quote.fundingQuote,
    "business_offer_purchase_funding",
  );
}

function assertImmutableReceiptReread(committedReceipt, immutableReceipt) {
  const committedFields = Object.keys(committedReceipt).sort();
  const immutableFields = Object.keys(immutableReceipt).sort();
  assert(
    JSON.stringify(immutableFields) === JSON.stringify(committedFields),
    "Safe refresh retry changed the exact immutable receipt field set.",
  );
  for (const field of committedFields) {
    if (field === "alreadyCompleted") continue;
    assert(
      JSON.stringify(immutableReceipt[field]) === JSON.stringify(committedReceipt[field]),
      `Safe refresh retry changed immutable receipt field ${field}.`,
    );
  }
  assert(
    committedReceipt.alreadyCompleted === false && immutableReceipt.alreadyCompleted === true,
    "Safe refresh retry did not preserve the allowed alreadyCompleted transition.",
  );
}

function assertExactPurchaseRequest(postData, headers, quote) {
  const body = JSON.parse(postData || "null");
  assert(body && typeof body === "object" && !Array.isArray(body), "Business purchase request body is invalid.");
  const expectedKeys = [
    "idempotencyKey",
    "quoteKey",
  ];
  assert(
    JSON.stringify(Object.keys(body).sort()) === JSON.stringify(expectedKeys),
    "Business purchase request carried fields outside the public command contract.",
  );
  assert(body.quoteKey === quote.quoteKey, "Business purchase request changed the quote.");
  assert(typeof body.idempotencyKey === "string" && body.idempotencyKey.length >= 8, "Business purchase idempotency key is invalid.");
  assert(headers["x-idempotency-key"] === body.idempotencyKey, "Body/header idempotency keys differ.");
  assertBrowserScopeHeaders(headers, "Business purchase request");
  const forbidden = [
    "gameSessionId", "gameId", "playerId", "buyerPlayerId", "businessId",
    "sellerPartyId", "storeItemId", "gameItemId", "inventoryAccountId",
    "unitPrice", "totalPrice", "currencyCode", "buyerDebit", "businessCredit",
  ];
  for (const key of forbidden) assert(!Object.hasOwn(body, key), `Business purchase request exposed forbidden field ${key}.`);
  UUID_PATTERN.lastIndex = 0;
  assert(!UUID_PATTERN.test(postData), "Business purchase request body exposed an internal UUID.");
  return body;
}

async function replayThroughPage(session, request, body) {
  const allHeaders = await request.allHeaders();
  const forwardedHeaders = {};
  for (const [name, value] of Object.entries(allHeaders)) {
    const lower = name.toLowerCase();
    if (
      ["accept", "content-type", "apikey", "x-econovaria-csrf-token",
        "x-idempotency-key", "idempotency-key", "x-econovaria-device-id",
      ].includes(lower)
    ) {
      forwardedHeaders[lower] = value;
    }
  }
  forwardedHeaders["x-request-id"] = crypto.randomUUID();
  const result = await session.page.evaluate(async ({ url, headers, payload }) => {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers,
      body: JSON.stringify(payload),
    });
    return {
      status: response.status,
      body: await response.text(),
      contentType: response.headers.get("content-type") || "",
    };
  }, { url: request.url(), headers: forwardedHeaders, payload: body });
  assert(result.status === 200, `Same-origin purchase replay returned ${result.status}.`);
  assertSafePlayerResponseBody(result.body, "Same-origin replay response");
  assert(result.contentType.includes("application/json"), "Same-origin replay did not return JSON.");
  return JSON.parse(result.body);
}

function verifyDatabaseVectors(
  before,
  after,
  vector,
  fixture,
  quote,
  receipt,
  fundingQuote,
  sourceBalancesBefore,
  sourceBalancesAfter,
) {
  const total = amount(receipt.totalPrice);
  evidence.database.fundingSourcesDebitedExactly = fundingQuote.lines.every((line) => {
    const precision = Number(line.sourceMinorUnit);
    return scaledDatabaseDecimal(
      sourceBalancesBefore[line.sourceAccountKey],
      precision,
      "Funding source balance before",
    ) - scaledDatabaseDecimal(
      sourceBalancesAfter[line.sourceAccountKey],
      precision,
      "Funding source balance after",
    ) === exactDecimal(
      line.sourceDebit,
      precision,
      "Funding source debit",
      { positive: true },
    );
  });
  evidence.database.targetCheckingUnchangedForAllForeign =
    fundingQuote.requiresFx === true &&
    fundingQuote.lines.every((line) =>
      line.requiresFx === true &&
      line.sourceCurrencyCode !== fundingQuote.targetCurrencyCode
    ) &&
    sameAmount(before.buyerChecking, after.buyerChecking);
  evidence.database.businessCashCreditedExactly = sameAmount(
    amount(after.businessCash) - amount(before.businessCash),
    total,
  );
  evidence.database.listingHoldingDebitedExactly =
    Number(before.listingQuantity) - Number(after.listingQuantity) === BUSINESS_PURCHASE_QUANTITY &&
    Number(after.listingReserved) === 0;
  evidence.database.listingVersionAdvancedExactly =
    Number(after.listingVersion) === Number(before.listingVersion) + 1;
  evidence.database.offerVersionAdvancedExactly =
    Number(after.offerVersion) === Number(before.offerVersion) + 1;

  const beforeQuantity = Number(before.buyerQuantity);
  const afterQuantity = Number(after.buyerQuantity);
  const expectedAverage = amount((
    beforeQuantity * amount(before.buyerAverageUnitCost) +
    BUSINESS_PURCHASE_QUANTITY * amount(receipt.unitPrice)
  ) / (beforeQuantity + BUSINESS_PURCHASE_QUANTITY));
  evidence.database.buyerInventoryCreditedExactly =
    afterQuantity === beforeQuantity + BUSINESS_PURCHASE_QUANTITY;
  evidence.database.buyerCostAndProvenanceExact =
    PUBLIC.inventoryAccount.test(String(after.buyerInventoryAccountKey || "")) &&
    sameAmount(after.buyerAverageUnitCost, expectedAverage) &&
    after.buyerCostCurrencyCode === fixture.currencyCode &&
    vector.buyerInventoryAccountKey === after.buyerInventoryAccountKey &&
    vector.catalogItemKey === fixture.catalogItemKey &&
    vector.canonicalItemKey === fixture.canonicalItemKey &&
    vector.storeItemKey === fixture.storeItemKey;
  evidence.database.quoteConsumedExactly =
    vector.quoteKey === quote.quoteKey &&
    vector.quoteStatus === "used" &&
    Number(vector.quoteVersion) === 2 &&
    Number(vector.quoteOfferVersion) === fixture.initialOfferVersion &&
    Number(vector.quoteQuantity) === BUSINESS_PURCHASE_QUANTITY &&
    sameAmount(vector.quoteUnitPrice, quote.unitPrice) &&
    sameAmount(vector.quoteTotalPrice, quote.totalPrice);
  evidence.database.receiptExact =
    vector.receiptKey === receipt.receiptKey &&
    vector.offerKey === fixture.offerKey &&
    vector.businessKey === fixture.businessKey &&
    vector.quantity === BUSINESS_PURCHASE_QUANTITY &&
    sameAmount(vector.buyerDebit, total) &&
    sameAmount(vector.businessCredit, total) &&
    sameAmount(vector.grossRevenue, total) &&
    sameAmount(vector.sourceUnitCost, fixture.sourceUnitCost) &&
    sameAmount(vector.costOfGoodsSold, fixture.sourceUnitCost * BUSINESS_PURCHASE_QUANTITY) &&
    sameAmount(vector.grossMargin, total - fixture.sourceUnitCost * BUSINESS_PURCHASE_QUANTITY) &&
    Number(vector.offerVersionBefore) === fixture.initialOfferVersion &&
    Number(vector.offerVersionAfter) === fixture.initialOfferVersion + 1 &&
    Number(vector.remainingListedQuantity) === BUSINESS_LISTING_QUANTITY - BUSINESS_PURCHASE_QUANTITY &&
    Number(after.quoteCount) - Number(before.quoteCount) === 1 &&
    Number(after.receiptCount) - Number(before.receiptCount) === 1;
  evidence.database.ledgerPostingCount = Number(vector.ledgerPostingCount);
  evidence.database.sourceDebitPostingCount = Number(vector.sourceDebitPostingCount);
  evidence.database.recipientCreditPostingCount = Number(vector.recipientCreditPostingCount);
  evidence.database.fundingReceiptCount = Number(vector.fundingReceiptCount);
  evidence.database.fundingTransactionCount = Number(vector.fundingTransactionCount);
  evidence.database.inventoryTransactionCount = Number(vector.inventoryTransactionCount);
  evidence.database.inventoryLineCount = Number(vector.inventoryLineCount);
  evidence.database.purchasedEventCount = Number(vector.purchasedEventCount);
  evidence.database.businessActivityCount = Number(vector.businessActivityCount);
  assert(evidence.database.fundingSourcesDebitedExactly, "Selected Buyer funding sources did not debit by their immutable source amounts.");
  assert(evidence.database.targetCheckingUnchangedForAllForeign, "All-foreign funding mutated the Buyer's target-currency Checking account.");
  assert(evidence.database.businessCashCreditedExactly, "Business cash did not credit by the exact receipt total.");
  assert(evidence.database.listingHoldingDebitedExactly, "Listing holding did not debit by the exact quantity.");
  assert(evidence.database.listingVersionAdvancedExactly, "Listing holding version did not advance exactly once.");
  assert(evidence.database.offerVersionAdvancedExactly, "Business offer version did not advance exactly once.");
  assert(evidence.database.buyerInventoryCreditedExactly, "Buyer Inventory did not credit by the exact quantity.");
  assert(evidence.database.buyerCostAndProvenanceExact, "Buyer Inventory cost or provenance is invalid.");
  assert(evidence.database.quoteConsumedExactly, "Business quote consumption vector is invalid.");
  assert(evidence.database.receiptExact, "Immutable Business receipt vector is invalid.");
  assert(Number(vector.fundingReceiptCount) === 1, "Settlement did not bind exactly one canonical funding receipt.");
  assert(Number(vector.fundingTransactionCount) === 1, "Settlement did not bind exactly one canonical bank transaction.");
  assert(
    Number(vector.fundingQuoteLineCount) === fundingQuote.lines.length,
    "Settlement funding quote lines do not reconcile to the immutable public quote.",
  );
  assert(
    Number(vector.sourceDebitPostingCount) === fundingQuote.lines.length,
    "Settlement did not create exactly one canonical source debit per funding line.",
  );
  assert(
    Number(vector.recipientCreditPostingCount) === 1 &&
      sameAmount(vector.recipientCreditAmount, total),
    "Settlement did not create one exact canonical Business recipient credit.",
  );
  assert(
    Number(vector.ledgerPostingCount) >= fundingQuote.lines.length + 1,
    "Settlement canonical funding journal omitted required source or recipient postings.",
  );
  assert(Number(vector.inventoryTransactionCount) === 1, "Settlement did not create exactly one Inventory transaction.");
  assert(Number(vector.inventoryLineCount) === 2, "Settlement did not create exactly two Inventory lines.");
  assert(Number(vector.listingLineCount) === 1 && Number(vector.buyerLineCount) === 1, "Settlement Inventory line roles are invalid.");
  assert(Number(vector.purchasedEventCount) === 1, "Settlement did not create exactly one PURCHASED event.");
  assert(Number(vector.businessActivityCount) === 1, "Settlement did not create exactly one Business activity event.");
  assert(
    Number(after.fundingReceiptCount) - Number(before.fundingReceiptCount) === 1 &&
      Number(after.fundingTransactionCount) - Number(before.fundingTransactionCount) === 1 &&
      Number(after.fundingLedgerCount) - Number(before.fundingLedgerCount) === Number(vector.ledgerPostingCount) &&
      Number(after.inventoryTransactionCount) - Number(before.inventoryTransactionCount) === 1 &&
      Number(after.purchasedEventCount) - Number(before.purchasedEventCount) === 1 &&
      Number(after.businessActivityCount) - Number(before.businessActivityCount) === 1,
    "Settlement aggregate state contains an unexpected duplicate economic mutation.",
  );
}

async function assertBuyerUiConvergence(session, fixture, after) {
  const modal = session.page.locator('[aria-labelledby="storePurchaseModalTitle"]');
  await modal.locator('[data-player-local-action="close-modal"]').first().click();
  await session.page.locator('[aria-labelledby="storePurchaseModalTitle"]').waitFor({ state: "detached", timeout: 30_000 });

  const businessRow = session.page.locator(`[data-player-store-offer-row="${fixture.offerKey}"]`);
  await businessRow.waitFor({ state: "visible", timeout: 30_000 });
  const rowText = await businessRow.innerText();
  assert(rowText.includes(`${after.listingQuantity} available`), "Buyer Store did not converge to committed Business stock.");
  const card = businessRow.locator("xpath=ancestor::article[1]");
  const cardText = await card.innerText();
  assert(cardText.includes(`OWNED ${after.buyerQuantity}`), "Buyer Store did not converge to committed ownership.");

  await openRoute(session, "banking", '[data-page="banking"]');
  const checking = session.page.locator(`[data-player-banking-balance="checking:${fixture.currencyCode}"]`);
  await checking.waitFor({ state: "visible", timeout: 30_000 });
  const bankingText = (await checking.innerText()).replace(/,/gu, "");
  assert(bankingText.includes(String(amount(after.buyerChecking))), "Buyer Banking did not converge to committed Checking.");

  await openRoute(session, "inventory", '[data-page="inventory"]');
  const inventoryCard = session.page.locator(".player-terminal-inventory-card", { hasText: fixture.itemName }).first();
  await inventoryCard.waitFor({ state: "visible", timeout: 30_000 });
  const inventoryText = await inventoryCard.innerText();
  assert(inventoryText.includes(`${after.buyerQuantity}×`), "Buyer Inventory did not converge to committed ownership.");
  await assertSameDocument(session, "Buyer");
  evidence.browser.buyerConvergedWithoutReload = true;
}

async function completeSeededCompatibilityPurchase(session, fixture, foreignAccount) {
  await openRoute(session, "store", '[data-page="store"]');
  const businessRow = session.page.locator(`[data-player-store-offer-row="${fixture.offerKey}"]`);
  const card = businessRow.locator("xpath=ancestor::article[1]");
  const seededButton = card.locator('[data-player-store-purchase-mode="system_offer"]:not([disabled])').first();
  await seededButton.waitFor({ state: "visible", timeout: 30_000 });
  const selectedOfferKey = await seededButton.getAttribute("data-player-store-offer");
  const selectedOffer = walkObjects(session.storePayload).find((candidate) =>
    candidate.offerKey === selectedOfferKey &&
    ["seeded", "npc"].includes(candidate.sellerKind) &&
    Number(candidate.version) > 0
  );
  assert(selectedOffer, "Connected Store payload omitted the selected seeded/NPC public offer.");
  await seededButton.click();
  const modal = session.page.locator('[aria-labelledby="storePurchaseModalTitle"]');
  await modal.waitFor({ state: "visible", timeout: 30_000 });
  const fundingAccount = modal.locator("[data-player-store-funding-account]").first();
  await fundingAccount.selectOption(foreignAccount.accountKey);
  assert(
    await fundingAccount.inputValue() === foreignAccount.accountKey,
    "Retained seeded purchase did not select the explicit foreign Checking account.",
  );
  await modal.locator("[data-player-store-quantity]").fill("1");
  const quoteResponsePromise = session.page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname;
    return path.endsWith("/players/me/store/quotes") && response.request().method() === "POST";
  }, { timeout: 60_000 });
  await modal.locator("[data-player-store-review]").click();
  const quoteResponse = await quoteResponsePromise;
  assert(quoteResponse.status() === 200, `Retained seeded quote returned ${quoteResponse.status()}.`);
  const quotePayload = await parsedPlaywrightResponse(quoteResponse);
  const quote = responseSeededQuote(quotePayload);
  assert(quote, "Retained seeded Store quote did not return its public quote.");
  const quoteHeaders = await quoteResponse.request().allHeaders();
  const quoteBody = assertExactSeededQuoteRequest(
    quoteResponse.request().postData(),
    quoteHeaders,
    selectedOffer,
  );
  assert(
    quote.offerKey === selectedOffer.offerKey &&
      Number(quote.offerVersion) === Number(selectedOffer.version),
    "System-offer quote response changed the selected public offer identity.",
  );
  const fundingQuote = assertFundingQuoteEvidence(quote.fundingQuote, {
    commercialQuoteKey: quote.quoteKey,
    contextKind: "store.system-offer",
    targetCurrencyCode: quote.currencyCode,
    targetAmount: String(quote.finalTotalPrice),
    commercialExpiresAt: quote.expiresAt,
    allocations: quoteBody.allocations,
  });
  assert(
    quoteBody.allocations.length === 1 &&
      quoteBody.allocations[0].sourceAccountKey === foreignAccount.accountKey &&
      quoteBody.allocations[0].targetAmount === null &&
      fundingQuote.requiresFx === true &&
      fundingQuote.lines.every((line) =>
        line.requiresFx === true &&
        line.sourceCurrencyCode === foreignAccount.currencyCode &&
        line.sourceCurrencyCode !== fundingQuote.targetCurrencyCode
      ),
    "Retained seeded quote did not preserve explicit all-foreign funding intent.",
  );
  evidence.browser.retainedSeededAllForeignFundingSelected = true;
  await modal.getByText("AUTHORITATIVE QUOTE", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const quoteText = await modal.innerText();
  assert(quoteText.includes(fundingQuote.quoteKey) && quoteText.includes(fundingQuote.fixingKey), "Retained seeded quote omitted immutable funding evidence.");

  const purchaseResponsePromise = session.page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname;
    return path.endsWith("/players/me/store/purchases") && response.request().method() === "POST";
  }, { timeout: 60_000 });
  await modal.locator("[data-player-store-confirm]").click();
  const purchaseResponse = await purchaseResponsePromise;
  assert(purchaseResponse.status() === 200, `Retained seeded purchase returned ${purchaseResponse.status()}.`);
  const payload = await parsedPlaywrightResponse(purchaseResponse);
  const receipt = responseSeededReceipt(payload);
  assert(receipt, "Retained seeded Store purchase did not return its receipt.");
  const purchaseHeaders = await purchaseResponse.request().allHeaders();
  assertExactPurchaseRequest(purchaseResponse.request().postData(), purchaseHeaders, quote);
  const fundingReceipt = assertFundingReceiptEvidence(
    receipt.fundingReceipt,
    fundingQuote,
    "system_offer_purchase_funding",
  );
  assert(
    receipt.offerKey === selectedOffer.offerKey &&
      receipt.sellerKind === selectedOffer.sellerKind &&
      PUBLIC.inventoryTransaction.test(String(receipt.inventoryTransactionKey || "")),
    "System-offer receipt omitted canonical offer or Inventory evidence.",
  );
  await modal.getByText("PURCHASE RECEIPT", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await session.page.waitForFunction(() => {
    const dialog = document.querySelector('[aria-labelledby="storePurchaseModalTitle"]');
    return dialog && dialog.getAttribute("aria-busy") === "false" &&
      /(?:COMPLETED|ALREADY COMPLETED)/u.test(dialog.textContent || "");
  }, undefined, { timeout: 90_000 });
  const receiptText = await modal.innerText();
  assert(receiptText.includes(fundingReceipt.receiptKey) && receiptText.includes(fundingReceipt.bankTransactionKey), "Retained seeded receipt omitted immutable funding evidence.");
  evidence.browser.retainedSeededStorePurchaseCompleted = true;
  await modal.locator('[data-player-local-action="close-modal"]').first().click();
  await modal.waitFor({ state: "detached", timeout: 30_000 });
}

function assertEvidenceComplete() {
  assert(evidence.runtime.playerBrowserContexts === 2, "Connected acceptance must use exactly two Player browser contexts.");
  assert(evidence.provisioning.gamesCreated === 2, "Connected acceptance must provision exactly two games.");
  assert(evidence.provisioning.playersCreated === 4, "Connected acceptance must provision Buyer and Seller in each game.");
  assert(evidence.provisioning.buyersFunded === 2, "Connected acceptance must fund both Buyers.");
  assert(evidence.provisioning.foreignBuyerAccountsFunded === 2, "Connected acceptance must fund one foreign Checking account for each Buyer.");
  assert(evidence.provisioning.businessOffersCreated === 2, "Connected acceptance must create one Business offer per game.");
  assert(evidence.browser.businessOfferExplicitlySelected, "Rendered Store did not explicitly select the Business offer.");
  assert(evidence.browser.authoritativeQuoteRendered, "Rendered Store did not show the authoritative Business quote.");
  assert(evidence.browser.immutableFundingQuoteRendered, "Rendered Store did not show immutable funding quote evidence.");
  assert(evidence.browser.settlementProcessingGuardRendered, "Settlement processing guard was not rendered.");
  assert(evidence.browser.settlementProcessingFocusContained, "Settlement processing focus escaped the dialog.");
  assert(evidence.browser.settlementProcessingDismissalBlocked, "Settlement processing dialog could be dismissed or duplicated.");
  assert(evidence.browser.immutableReceiptRendered, "Rendered Store did not show the immutable Business receipt.");
  assert(evidence.browser.immutableFundingReceiptRendered, "Rendered Store did not show immutable funding receipt evidence.");
  assert(evidence.browser.immutableReceiptReloaded, "Rendered Store did not reload the immutable receipt through the authenticated page.");
  assert(evidence.browser.postCommitRefreshFailureForced, "Connected acceptance did not force the post-commit read failure.");
  assert(
    evidence.browser.postCommitInvalidReceiptResponses === 1 &&
      evidence.browser.refreshRetryAttempts >= 1 &&
      evidence.browser.refreshRetryAttempts <= MAX_MANUAL_REFRESH_ATTEMPTS &&
      evidence.browser.refreshRetryPendingAttempts === evidence.browser.refreshRetryAttempts - 1 &&
      evidence.browser.postCommitReceiptReadAttempts === evidence.browser.refreshRetryAttempts + 1 &&
      evidence.browser.refreshRetryOutcomes.length === evidence.browser.refreshRetryAttempts &&
      evidence.browser.refreshRetryResourceAttempts.length === evidence.browser.refreshRetryAttempts &&
      evidence.browser.refreshRetryOutcomes.at(-1) === "complete",
    "Connected acceptance did not prove bounded read-only retries after one contract-invalid receipt read.",
  );
  assertCommittedRefreshAudit(
    evidence.browser.initialPostCommitResourceRefresh,
    "Initial post-commit resource refresh",
  );
  for (const [index, refreshAudit] of evidence.browser.refreshRetryResourceAttempts.entries()) {
    assertCommittedRefreshAudit(refreshAudit, `Manual committed refresh ${index + 1}`);
    const refreshFailed = refreshAudit.threw || refreshAudit.errors.length > 0;
    assert(
      (evidence.browser.refreshRetryOutcomes[index] === "pending" && refreshFailed) ||
        (evidence.browser.refreshRetryOutcomes[index] === "complete" && !refreshFailed),
      `Manual committed refresh ${index + 1} UI state does not match its safe resource audit.`,
    );
  }
  assert(evidence.browser.refreshPendingRendered, "Committed receipt did not preserve a visible refresh-pending state.");
  assert(evidence.browser.refreshRetryCompleted, "Safe committed-state refresh retry did not converge.");
  assert(evidence.browser.refreshRetryDidNotResubmitSettlement, "Refresh retry resubmitted settlement.");
  assert(evidence.browser.replayUsedSameOriginPageFetch, "Business settlement replay did not use same-origin page fetch.");
  assert(evidence.browser.replayReturnedSameReceipt, "Business settlement replay changed immutable receipt identity.");
  assert(evidence.browser.retainedSeededStorePurchaseCompleted, "Retained seeded Store purchase did not complete.");
  assert(evidence.browser.retainedSeededAllForeignFundingSelected, "Retained seeded Store purchase did not use all-foreign funding.");
  assert(evidence.browser.businessAllForeignFundingSelected, "Business Store purchase did not use all-foreign funding.");
  assert(evidence.browser.twoBrowserCrossCurrencyPurchaseCompleted, "Buyer and Seller browsers did not converge on one cross-currency purchase.");
  assert(evidence.browser.buyerConvergedWithoutReload, "Buyer did not converge without reload.");
  assert(evidence.browser.sellerConvergedWithoutReload, "Seller did not converge without reload.");
  assert(evidence.browser.sharedReceiptIdentityVisible, "Buyer and Seller did not render the same receipt identity.");
  assert(evidence.browser.game2KeysAbsentFromGame1Store, "Game 1 Store exposed Game 2 public keys.");
  assert(evidence.browser.game1KeysAbsentFromGame2Store, "Game 2 Store exposed Game 1 public keys.");
  assert(evidence.browser.game2OfferVisibleInGame2Store, "Game 2 Store did not expose its own exact Business offer.");
  assert(!evidence.browser.internalUuidObservedInPlayerResponse, "A Player response exposed an internal UUID.");
  assert(!evidence.browser.sensitiveValueObservedInPlayerResponse, "A Player response exposed a sensitive value.");
  assert(!evidence.browser.sensitiveValueObservedInPlayerDom, "Player DOM exposed a sensitive value.");
  assert(evidence.browser.consoleErrors.length === 0, "Player browser emitted console errors.");
  assert(evidence.browser.pageErrors.length === 0, "Player browser emitted page errors.");
  assert(evidence.database.fundingSourcesDebitedExactly, "Canonical funding source debits were not proven.");
  assert(evidence.database.targetCheckingUnchangedForAllForeign, "All-foreign target Checking isolation was not proven.");
  assert(evidence.database.replayZeroDelta, "Idempotent replay changed authoritative database state.");
  assert(evidence.database.game2ZeroMutation, "Game 1 acceptance mutated Game 2 state.");
  assert(evidence.database.game1ZeroMutationFromGame2Probe, "Game 2 acceptance mutated Game 1 state.");
  assert(evidence.database.withdrawalFirstRejectedBeforePayment, "Withdrawal-first ordering was not proven.");
  assert(evidence.database.purchaseFirstExcessWithdrawalRejected, "Purchase-first excess withdrawal rejection was not proven.");
  assert(evidence.database.purchaseFirstRemainingWithdrawalAccepted, "Purchase-first remaining withdrawal was not proven.");
}

function assertSanitizedArtifact(serialized) {
  for (const literal of [...SECRET_LITERALS, ...ARTIFACT_PRIVATE_LITERALS]) {
    assert(!literal || !serialized.includes(literal), "Evidence retained a credential literal.");
  }
  UUID_PATTERN.lastIndex = 0;
  JWT_PATTERN.lastIndex = 0;
  SUPABASE_KEY_PATTERN.lastIndex = 0;
  DATABASE_URL_PATTERN.lastIndex = 0;
  GAME_CODE_PATTERN.lastIndex = 0;
  assert(!UUID_PATTERN.test(serialized), "Evidence retained an internal UUID.");
  assert(!JWT_PATTERN.test(serialized), "Evidence retained a JWT.");
  assert(!SUPABASE_KEY_PATTERN.test(serialized), "Evidence retained a Supabase key.");
  assert(!DATABASE_URL_PATTERN.test(serialized), "Evidence retained a database URL.");
  assert(!GAME_CODE_PATTERN.test(serialized), "Evidence retained a game join code.");
}

async function writeEvidence() {
  assertBoundedOutputDirectory();
  await mkdir(OUTPUT_DIR, { recursive: true });
  evidence.browser.consoleErrors = evidence.browser.consoleErrors.map(redact);
  evidence.browser.pageErrors = evidence.browser.pageErrors.map(redact);
  evidence.failure = redact(evidence.failure);
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  assertSanitizedArtifact(serialized);
  await writeFile(`${OUTPUT_DIR}/${EVIDENCE_FILE}`, serialized, "utf8");
}

async function main() {
  assertDisposableRuntime();
  const runtime = await localSupabaseRuntime();
  await seedLicense();
  const admin = await createStaffFixture(runtime);
  const [game1, game2] = [
    await createGame(admin, 1),
    await createGame(admin, 2),
  ];
  const license = await licenseVector(game1, game2);
  assert(
    license.status === "exhausted" &&
      Number(license.maxRedemptions) === 2 &&
      Number(license.redeemedCount) === 2 &&
      Number(license.entitlementCount) === 2,
    "The two-redemption license vector is invalid.",
  );
  evidence.provisioning.licenseMaxRedemptions = Number(license.maxRedemptions);
  evidence.provisioning.licenseRedeemedCount = Number(license.redeemedCount);
  evidence.provisioning.licenseFinalStatus = license.status;

  const game1Buyer = await createPlayer(admin, game1, PLAYERS.game1.buyer, 1);
  const game1Seller = await createPlayer(admin, game1, PLAYERS.game1.seller, 2);
  const game2Buyer = await createPlayer(admin, game2, PLAYERS.game2.buyer, 1);
  const game2Seller = await createPlayer(admin, game2, PLAYERS.game2.seller, 2);

  const [game1Economic, game2Economic] = await Promise.all([
    playerEconomicContext(game1, game1Buyer),
    playerEconomicContext(game2, game2Buyer),
  ]);
  await fundBuyer(admin, game1, game1Buyer, game1Economic.currencyCode);
  await fundBuyer(admin, game2, game2Buyer, game2Economic.currencyCode);
  const game1ForeignAccount = await fundForeignBuyerChecking(
    game1,
    game1Buyer,
    game1Economic.currencyCode,
  );
  const game2ForeignAccount = await fundForeignBuyerChecking(
    game2,
    game2Buyer,
    game2Economic.currencyCode,
  );
  const fixture1 = await createBusinessOfferFixture(game1, game1Buyer, game1Seller, game1Economic);
  const fixture2 = await createBusinessOfferFixture(game2, game2Buyer, game2Seller, game2Economic);

  const game1Before = await stateSnapshot(fixture1);
  const game2Before = await stateSnapshot(fixture2);
  assert(Number(game1Before.quoteCount) === 0 && Number(game1Before.receiptCount) === 0, "Game 1 fixture was not fresh.");
  assert(
    game2Before.offerStatus === "active" &&
      Number(game2Before.quoteCount) === 0 &&
      Number(game2Before.receiptCount) === 0,
    "Game 2 fixture was not fresh.",
  );

  const browser = await chromium.launch({ headless: true });
  let buyerSession;
  let sellerSession;
  try {
    [buyerSession, sellerSession] = await Promise.all([
      loginPlayer(browser, game1, game1Buyer),
      loginPlayer(browser, game1, game1Seller),
    ]);
    assert(evidence.runtime.playerBrowserContexts === 2, "Only two Game 1 Player contexts are permitted.");

    await openRoute(sellerSession, "business", '[data-page="business"]');
    const sellerSales = sellerSession.page.locator('[data-business-workspace-section="sales"]');
    await sellerSales.waitFor({ state: "visible", timeout: 60_000 });
    const sellerNavigationBaseline = sellerSession.audit.navigations;

    const storePayload = await openStoreRoute(buyerSession);
    await buyerSession.page.waitForTimeout(500);
    assert(storePayload, "Buyer Store route payload was not captured.");
    assertNoCrossGameStoreExposure(storePayload, fixture2);
    const storeDom = await buyerSession.page.locator('[data-page="store"]').evaluate((element) => element.outerHTML);
    assert(!storeDom.includes(fixture2.offerKey) && !storeDom.includes(fixture2.businessKey), "Game 2 public keys appeared in Game 1 Store DOM.");
    evidence.browser.game2KeysAbsentFromGame1Store = true;

    const businessRow = buyerSession.page.locator(`[data-player-store-offer-row="${fixture1.offerKey}"]`);
    await businessRow.waitFor({ state: "visible", timeout: 60_000 });
    const businessButton = businessRow.locator(`[data-player-store-offer="${fixture1.offerKey}"][data-player-store-purchase-mode="business_offer"]`);
    await businessButton.waitFor({ state: "visible", timeout: 30_000 });
    assert(await businessButton.isEnabled(), "The explicit Business offer action is disabled.");
    const productCard = businessRow.locator("xpath=ancestor::article[1]");
    assert(await productCard.locator('[data-player-store-purchase-mode="system_offer"]').count() > 0, "The retained seeded/NPC Store offer is not on the same canonical product card.");
    evidence.browser.businessOfferExplicitlySelected = true;

    await businessButton.click();
    const modal = buyerSession.page.locator('[aria-labelledby="storePurchaseModalTitle"]');
    await modal.waitFor({ state: "visible", timeout: 30_000 });
    const businessFundingAccount = modal.locator("[data-player-store-funding-account]").first();
    await businessFundingAccount.selectOption(game1ForeignAccount.accountKey);
    assert(
      await businessFundingAccount.inputValue() === game1ForeignAccount.accountKey,
      "Business purchase did not select the explicit foreign Checking account.",
    );
    await modal.locator("[data-player-store-quantity]").fill(String(BUSINESS_PURCHASE_QUANTITY));
    const quoteResponsePromise = buyerSession.page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/players/me/store/offer-quotes") &&
      response.request().method() === "POST",
    { timeout: 60_000 });
    await modal.locator("[data-player-store-review]").click();
    const quoteResponse = await quoteResponsePromise;
    assert(quoteResponse.status() === 200, `Business quote returned ${quoteResponse.status()}.`);
    const quotePayload = await parsedPlaywrightResponse(quoteResponse);
    const quote = responseBusinessQuote(quotePayload);
    const quoteRequestHeaders = await quoteResponse.request().allHeaders();
    const quoteRequestBody = assertExactQuoteRequest(
      quoteResponse.request().postData(),
      quoteRequestHeaders,
      fixture1,
    );
    const fundingQuote = assertQuote(quote, fixture1, quoteRequestBody.allocations);
    assert(
      quoteRequestBody.allocations.length === 1 &&
        quoteRequestBody.allocations[0].sourceAccountKey === game1ForeignAccount.accountKey &&
        quoteRequestBody.allocations[0].targetAmount === null &&
        fundingQuote.requiresFx === true &&
        fundingQuote.lines.every((line) =>
          line.requiresFx === true &&
          line.sourceCurrencyCode === game1ForeignAccount.currencyCode &&
          line.sourceCurrencyCode !== fundingQuote.targetCurrencyCode
        ),
      "Business quote did not preserve explicit all-foreign funding intent.",
    );
    evidence.browser.businessAllForeignFundingSelected = true;
    const sourceBalancesBefore = await fundingSourceBalances(fixture1, fundingQuote);
    await modal.getByText("AUTHORITATIVE QUOTE", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await modal.getByText("CONFIRMATION REQUIRED", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    const quoteModalText = await modal.innerText();
    assert(quoteModalText.includes(quote.quoteKey) && quoteModalText.includes(fixture1.businessName), "Rendered quote did not retain exact seller and quote identity.");
    const quoteReviewRows = await definitionRows(modal);
    assert(quoteReviewRows.ITEM === fixture1.itemName, "Rendered quote review changed the canonical Store item.");
    assert(
      quoteReviewRows.SELLER === `${fixture1.businessName} · Business seller`,
      "Rendered quote review changed the bounded Business seller identity.",
    );
    assert(quoteReviewRows.QUANTITY === String(quote.quantity), "Rendered quote review changed quantity.");
    assert(
      quoteReviewRows["SELLER STOCK AT QUOTE"] === String(quote.availableQuantityAtQuote),
      "Rendered quote review changed the authoritative seller stock at quote.",
    );
    assert(
      quoteReviewRows["OFFER VERSION"] === String(quote.offerVersion),
      "Rendered quote review changed the authoritative offer version.",
    );
    assert(sameAmount(uiAmount(quoteReviewRows["UNIT PRICE"]), quote.unitPrice), "Rendered quote review changed unit price.");
    assert(sameAmount(uiAmount(quoteReviewRows["FINAL TOTAL"]), quote.totalPrice), "Rendered quote review changed total price.");
    assert(quoteReviewRows["QUOTE KEY"] === quote.quoteKey, "Rendered quote review changed quote identity.");
    assert(quoteModalText.includes(fundingQuote.quoteKey), "Rendered quote omitted immutable funding identity.");
    assert(quoteModalText.includes(fundingQuote.fixingKey), "Rendered quote omitted immutable fixing identity.");
    assert(quoteModalText.includes(fundingQuote.policyVersion), "Rendered quote omitted funding policy evidence.");
    for (const line of fundingQuote.lines) {
      assert(
        quoteModalText.includes(line.sourceAccountKey) &&
          quoteModalText.includes(line.sourceDebit) &&
          quoteModalText.includes(line.targetContribution) &&
          quoteModalText.includes(line.referenceRate) &&
          quoteModalText.includes(line.customerRate) &&
          quoteModalText.includes(line.effectiveRate) &&
          quoteModalText.includes(line.spreadRate) &&
          quoteModalText.includes(line.roundingDisclosure),
        "Rendered quote omitted immutable per-allocation funding evidence.",
      );
    }
    evidence.browser.authoritativeQuoteRendered = true;
    evidence.browser.immutableFundingQuoteRendered = true;

    await installCommittedRefreshAudit(buyerSession);

    const purchaseResponsePromise = buyerSession.page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/players/me/store/offer-purchases") &&
      response.request().method() === "POST",
    { timeout: 60_000 });
    const settlementRoutePattern = "**/players/me/store/offer-purchases";
    let interceptedSettlementResponses = 0;
    let releaseSettlementResponse;
    const settlementResponseRelease = new Promise((resolve) => {
      releaseSettlementResponse = resolve;
    });
    let settlementUpstreamReadyResolve;
    let settlementUpstreamReadyReject;
    const settlementUpstreamReady = new Promise((resolve, reject) => {
      settlementUpstreamReadyResolve = resolve;
      settlementUpstreamReadyReject = reject;
    });
    const settlementResponseHandler = async (route) => {
      if (route.request().method() !== "POST" || interceptedSettlementResponses > 0) {
        await route.continue();
        return;
      }
      interceptedSettlementResponses += 1;
      try {
        const upstream = await route.fetch();
        settlementUpstreamReadyResolve(upstream.status());
        await settlementResponseRelease;
        await route.fulfill({ response: upstream });
      } catch (error) {
        settlementUpstreamReadyReject(error);
        await route.abort().catch(() => undefined);
      }
    };
    await buyerSession.page.route(settlementRoutePattern, settlementResponseHandler);
    const receiptRoutePattern = "**/players/me/store/receipts/*";
    let receiptReadAttempts = 0;
    let injectedInvalidReceiptResponses = 0;
    const receiptContractFailureHandler = async (route) => {
      if (route.request().method() === "GET") {
        receiptReadAttempts += 1;
      }
      if (route.request().method() === "GET" && injectedInvalidReceiptResponses === 0) {
        injectedInvalidReceiptResponses += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {},
          }),
        });
        return;
      }
      await route.continue();
    };
    await buyerSession.page.route(receiptRoutePattern, receiptContractFailureHandler);
    const receiptReadPromise = buyerSession.page.waitForResponse((response) =>
      /\/players\/me\/store\/receipts\/spr_[0-9a-f]{32}$/u.test(new URL(response.url()).pathname) &&
      response.request().method() === "GET",
    { timeout: 60_000 });
    await modal.locator("[data-player-store-confirm]").click();
    try {
      const settlementUpstreamStatus = await withTimeout(
        settlementUpstreamReady,
        60_000,
        "Delayed Business settlement route did not reach its upstream response.",
      );
      assert(settlementUpstreamStatus === 200, `Delayed Business settlement upstream returned ${settlementUpstreamStatus}.`);
      await modal.getByText("SETTLEMENT IN PROGRESS", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      assert(await modal.getAttribute("aria-busy") === "true", "Processing dialog is not marked busy.");
      const processingClose = modal.locator('[data-player-local-action="close-modal"][aria-label="Close"]');
      const processingEdit = modal.locator("[data-player-store-edit]");
      const processingConfirm = modal.locator("[data-player-store-confirm]");
      assert(
        await processingClose.isDisabled() &&
          await processingEdit.isDisabled() &&
          await processingConfirm.isDisabled(),
        "Settlement processing controls are not disabled.",
      );
      evidence.browser.settlementProcessingGuardRendered = true;
      evidence.browser.settlementProcessingFocusContained = await modal.evaluate((dialog) =>
        dialog === document.activeElement || dialog.contains(document.activeElement)
      );
      assert(evidence.browser.settlementProcessingFocusContained, "Focus escaped the settlement processing dialog.");

      await buyerSession.page.keyboard.press("Escape");
      await modal.locator("xpath=..").dispatchEvent("click");
      await processingClose.dispatchEvent("click");
      await processingConfirm.dispatchEvent("click");
      evidence.browser.settlementProcessingFocusContained =
        evidence.browser.settlementProcessingFocusContained &&
        await modal.evaluate((dialog) =>
          dialog === document.activeElement || dialog.contains(document.activeElement)
        );
      evidence.browser.settlementProcessingDismissalBlocked =
        await modal.isVisible() &&
        await modal.getAttribute("aria-busy") === "true" &&
        (await modal.locator("[data-player-store-confirm]").isDisabled()) &&
        (await modal.innerText()).includes(quote.quoteKey) &&
        interceptedSettlementResponses === 1 &&
        buyerSession.audit.businessPurchaseRequestCount === 1;
      assert(
        evidence.browser.settlementProcessingDismissalBlocked &&
          evidence.browser.settlementProcessingFocusContained,
        "In-flight settlement guard allowed dismissal or a duplicate POST.",
      );
    } finally {
      releaseSettlementResponse();
    }
    const purchaseResponse = await purchaseResponsePromise;
    await buyerSession.page.unroute(settlementRoutePattern, settlementResponseHandler);
    assert(purchaseResponse.status() === 200, `Business purchase returned ${purchaseResponse.status()}.`);
    const purchasePayload = await parsedPlaywrightResponse(purchaseResponse);
    const receipt = responseBusinessReceipt(purchasePayload);
    const fundingReceipt = assertReceipt(receipt, fixture1, quote);
    const requestHeaders = await purchaseResponse.request().allHeaders();
    const purchaseBody = assertExactPurchaseRequest(
      purchaseResponse.request().postData(),
      requestHeaders,
      quote,
    );
    const receiptRead = await receiptReadPromise;
    assert(
      receiptRead.status() === 200 &&
        injectedInvalidReceiptResponses === 1 &&
        receiptReadAttempts === 1,
      "Contract-invalid post-commit receipt read was not forced exactly once without an automatic retry.",
    );
    evidence.browser.postCommitRefreshFailureForced = true;
    evidence.browser.postCommitInvalidReceiptResponses = injectedInvalidReceiptResponses;
    evidence.browser.postCommitReceiptReadAttempts = receiptReadAttempts;

    await modal.getByText("COMPLETED · REFRESH PENDING", { exact: true }).waitFor({ state: "visible", timeout: 90_000 });
    const refreshRetry = modal.locator("[data-player-store-refresh-retry]");
    await refreshRetry.waitFor({ state: "visible", timeout: 30_000 });
    assert(await refreshRetry.isEnabled(), "Committed receipt refresh retry is not available.");
    evidence.browser.refreshPendingRendered = true;
    assert(buyerSession.audit.businessPurchaseRequestCount === 1, "Initial committed purchase issued more than one settlement request.");
    const initialRefreshAudits = await readCommittedRefreshAudits(buyerSession);
    assert(
      initialRefreshAudits.length === 1,
      "Initial post-commit convergence did not make exactly one bounded resource refresh.",
    );
    evidence.browser.initialPostCommitResourceRefresh = initialRefreshAudits[0];

    let refreshCompleted = false;
    try {
      for (
        let refreshAttempt = 1;
        refreshAttempt <= MAX_MANUAL_REFRESH_ATTEMPTS && !refreshCompleted;
        refreshAttempt += 1
      ) {
        await refreshRetry.waitFor({ state: "visible", timeout: 30_000 });
        assert(await refreshRetry.isEnabled(), "Committed receipt refresh retry is not available.");
        const receiptReadsBeforeAttempt = receiptReadAttempts;
        const refreshAuditsBeforeAttempt = (await readCommittedRefreshAudits(buyerSession)).length;
        const retryReceiptReadPromise = buyerSession.page.waitForResponse((response) =>
          /\/players\/me\/store\/receipts\/spr_[0-9a-f]{32}$/u.test(new URL(response.url()).pathname) &&
          response.request().method() === "GET" && response.status() === 200,
        { timeout: 60_000 });
        await refreshRetry.click();
        evidence.browser.refreshRetryAttempts = refreshAttempt;
        const retryReceiptRead = await retryReceiptReadPromise;
        assert(
          receiptReadAttempts === receiptReadsBeforeAttempt + 1 &&
            injectedInvalidReceiptResponses === 1,
          "A manual committed-state refresh did not make exactly one additional immutable receipt read.",
        );
        evidence.browser.postCommitReceiptReadAttempts = receiptReadAttempts;
        const immutablePayload = await parsedPlaywrightResponse(retryReceiptRead);
        const immutableReceipt = responseBusinessReceipt(immutablePayload);
        assertReceipt(immutableReceipt, fixture1, quote);
        assertImmutableReceiptReread(receipt, immutableReceipt);
        evidence.browser.immutableReceiptReloaded = true;
        evidence.browser.refreshRetryDidNotResubmitSettlement =
          buyerSession.audit.businessPurchaseRequestCount === 1;
        assert(evidence.browser.refreshRetryDidNotResubmitSettlement, "Safe refresh retry resubmitted settlement.");

        const refreshStateHandle = await buyerSession.page.waitForFunction(() => {
          const dialog = document.querySelector('[aria-labelledby="storePurchaseModalTitle"]');
          if (!dialog || dialog.getAttribute("aria-busy") !== "false") return "";
          const retry = dialog.querySelector("[data-player-store-refresh-retry]");
          const content = dialog.textContent || "";
          if (retry && !retry.disabled && content.includes("COMPLETED · REFRESH PENDING")) {
            return "pending";
          }
          if (!retry && !content.includes("REFRESH PENDING")) return "complete";
          return "";
        }, undefined, { timeout: MANUAL_REFRESH_STATE_TIMEOUT_MS });
        const refreshState = await refreshStateHandle.jsonValue();
        await refreshStateHandle.dispose();
        const refreshAuditsAfterAttempt = await readCommittedRefreshAudits(buyerSession);
        assert(
          refreshAuditsAfterAttempt.length === refreshAuditsBeforeAttempt + 1,
          "A manual committed-state retry did not make exactly one bounded resource refresh.",
        );
        const refreshAudit = refreshAuditsAfterAttempt.at(-1);
        const refreshFailed = refreshAudit.threw || refreshAudit.errors.length > 0;
        assert(
          (refreshState === "pending" && refreshFailed) ||
            (refreshState === "complete" && !refreshFailed),
          "Committed receipt UI state did not match the recorded resource-refresh outcome.",
        );
        evidence.browser.refreshRetryOutcomes.push(refreshState);
        evidence.browser.refreshRetryResourceAttempts.push(refreshAudit);
        refreshCompleted = refreshState === "complete";
        if (!refreshCompleted) {
          evidence.browser.refreshRetryPendingAttempts += 1;
          assert(
            refreshAttempt < MAX_MANUAL_REFRESH_ATTEMPTS,
            `Committed refresh remained pending after ${MAX_MANUAL_REFRESH_ATTEMPTS} bounded safe retries.`,
          );
        }
      }
    } finally {
      await buyerSession.page.unroute(receiptRoutePattern, receiptContractFailureHandler).catch(() => undefined);
    }
    assert(refreshCompleted, "Committed refresh did not converge within the bounded safe-retry allowance.");
    assert(
      receiptReadAttempts === evidence.browser.refreshRetryAttempts + 1 &&
        evidence.browser.refreshRetryPendingAttempts === evidence.browser.refreshRetryAttempts - 1,
      "Committed refresh retry evidence does not reconcile to the exact receipt-read attempts.",
    );
    evidence.browser.refreshRetryCompleted = true;

    await modal.getByText("PURCHASE RECEIPT", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await modal.waitFor({ state: "visible", timeout: 30_000 });
    await buyerSession.page.waitForFunction(() => {
      const dialog = document.querySelector('[aria-labelledby="storePurchaseModalTitle"]');
      return dialog && dialog.getAttribute("aria-busy") === "false" &&
        /(?:COMPLETED|ALREADY COMPLETED)/u.test(dialog.textContent || "");
    }, undefined, { timeout: 90_000 });
    const receiptModalText = await modal.innerText();
    for (const expected of [
      receipt.receiptKey,
      receipt.quoteKey,
      receipt.offerKey,
      fixture1.businessName,
      String(receipt.quantity),
      String(receipt.remainingListedQuantity),
    ]) {
      assert(receiptModalText.includes(expected), "Rendered Business receipt omitted an exact public field.");
    }
    const receiptRows = await definitionRows(modal);
    assert(
      receiptRows.SELLER === `${fixture1.businessName} · Business seller`,
      "Rendered receipt changed the bounded Business seller identity.",
    );
    assert(receiptRows.QUANTITY === String(receipt.quantity), "Rendered receipt changed quantity.");
    assert(sameAmount(uiAmount(receiptRows["UNIT PRICE"]), receipt.unitPrice), "Rendered receipt changed unit price.");
    assert(sameAmount(uiAmount(receiptRows["TOTAL PAID"]), receipt.totalPrice), "Rendered receipt changed total paid.");
    assert(receiptRows["RECEIPT KEY"] === receipt.receiptKey, "Rendered receipt changed receipt identity.");
    assert(receiptRows["QUOTE KEY"] === receipt.quoteKey, "Rendered receipt changed quote identity.");
    assert(receiptRows["OFFER KEY"] === receipt.offerKey, "Rendered receipt changed offer identity.");
    assert(
      receiptRows["SELLER STOCK LEFT"] === String(receipt.remainingListedQuantity),
      "Rendered receipt changed committed seller stock.",
    );
    assert(
      receiptModalText.includes(fundingReceipt.receiptKey) &&
        receiptModalText.includes(fundingReceipt.bankTransactionKey) &&
        receiptModalText.includes(fundingReceipt.targetAccountKey) &&
        receiptModalText.includes(fundingReceipt.targetReserveDrawAmount),
      "Rendered receipt omitted immutable aggregate funding evidence.",
    );
    for (const line of fundingReceipt.lines) {
      assert(
        receiptModalText.includes(line.sourceAccountKey) &&
          receiptModalText.includes(line.sourceDebit) &&
          receiptModalText.includes(line.targetContribution) &&
          receiptModalText.includes(line.referenceRate) &&
          receiptModalText.includes(line.customerRate) &&
          receiptModalText.includes(line.effectiveRate) &&
          receiptModalText.includes(line.spreadRate),
        "Rendered receipt omitted immutable per-allocation funding evidence.",
      );
    }
    evidence.browser.immutableReceiptRendered = true;
    evidence.browser.immutableFundingReceiptRendered = true;

    const game1After = await stateSnapshot(fixture1);
    const sourceBalancesAfter = await fundingSourceBalances(fixture1, fundingQuote);
    const vector = await receiptVector(fixture1, receipt.receiptKey);
    verifyDatabaseVectors(
      game1Before,
      game1After,
      vector,
      fixture1,
      quote,
      receipt,
      fundingQuote,
      sourceBalancesBefore,
      sourceBalancesAfter,
    );

    evidence.settlement = {
      offerKey: receipt.offerKey,
      quoteKey: receipt.quoteKey,
      receiptKey: receipt.receiptKey,
      businessKey: receipt.businessKey,
      catalogItemKey: receipt.catalogItemKey,
      canonicalItemKey: receipt.canonicalItemKey,
      storeItemKey: receipt.storeItemKey,
      quantity: Number(receipt.quantity),
      unitPrice: amount(receipt.unitPrice),
      totalPrice: amount(receipt.totalPrice),
      currencyCode: receipt.currencyCode,
      offerVersionBefore: Number(receipt.offerVersionBefore),
      offerVersionAfter: Number(receipt.offerVersionAfter),
      remainingListedQuantity: Number(receipt.remainingListedQuantity),
      fundingQuoteKey: fundingReceipt.quoteKey,
      fundingReceiptKey: fundingReceipt.receiptKey,
      fundingTransactionKey: fundingReceipt.bankTransactionKey,
    };

    const beforeReplay = await stateSnapshot(fixture1);
    const replayPayload = await replayThroughPage(buyerSession, purchaseResponse.request(), purchaseBody);
    evidence.browser.replayUsedSameOriginPageFetch = true;
    const replayReceipt = responseBusinessReceipt(replayPayload);
    assertReceipt(replayReceipt, fixture1, quote);
    assert(replayReceipt.receiptKey === receipt.receiptKey && replayReceipt.alreadyCompleted === true, "Replay did not return the original completed receipt.");
    assert(buyerSession.audit.businessPurchaseRequestCount === 2, "Connected journey issued an unexpected Business settlement request count.");
    evidence.browser.replayReturnedSameReceipt = true;
    const afterReplay = await stateSnapshot(fixture1);
    evidence.database.replayZeroDelta = JSON.stringify(beforeReplay) === JSON.stringify(afterReplay);
    assert(evidence.database.replayZeroDelta, "Idempotent replay changed authoritative state.");

    await assertBuyerUiConvergence(buyerSession, fixture1, game1After);

    const sellerReceipt = sellerSales.locator(".player-terminal-business-product", { hasText: receipt.receiptKey }).first();
    await sellerReceipt.waitFor({ state: "visible", timeout: SELLER_CONVERGENCE_TIMEOUT_MS });
    const activityKey = assertPublic(vector.businessActivityKey, PUBLIC.activity, "Business activity");
    const sellerActivity = sellerSession.page
      .locator('[data-business-workspace-section="activity"]')
      .locator(`[data-business-activity="${activityKey}"]`);
    await sellerActivity.waitFor({ state: "visible", timeout: 30_000 });
    const sellerSemanticText = await sellerReceipt.textContent();
    const sellerActivityText = await sellerActivity.textContent();
    for (const [label, expected] of [
      ["receipt", receipt.receiptKey],
      ["offer", receipt.offerKey],
      ["Store item", fixture1.storeItemKey],
      ["quantity", `${receipt.quantity} units`],
    ]) {
      assert(
        sellerSemanticText?.includes(expected),
        `Seller Business evidence omitted the shared ${label} vector.`,
      );
    }
    const sellerCashMetric = sellerSession.page.locator(".player-terminal-metric-card", { hasText: "Operating cash" }).first();
    const sellerCash = await sellerCashMetric.locator("strong").innerText();
    assert(sameAmount(uiAmount(sellerCash), game1After.businessCash), "Seller operating cash did not converge to committed Business cash.");
    const sellerFinance = await sellerReceipt.locator("dl").evaluate((list) =>
      Object.fromEntries([...list.querySelectorAll("div")].map((row) => [
        row.querySelector("dt")?.textContent?.trim() || "",
        row.querySelector("dd")?.textContent?.trim() || "",
      ]))
    );
    assert(sameAmount(uiAmount(sellerFinance.REVENUE), vector.grossRevenue), "Seller revenue did not converge to the receipt.");
    assert(sameAmount(uiAmount(sellerFinance.COGS), vector.costOfGoodsSold), "Seller COGS did not converge to the receipt.");
    assert(sameAmount(uiAmount(sellerFinance.MARGIN), vector.grossMargin), "Seller gross margin did not converge to the receipt.");
    assert(sellerActivityText?.includes("business_store_offer_purchase"), "Seller activity reason did not converge to the receipt.");
    assert(sellerSession.audit.navigations === sellerNavigationBaseline, "Seller convergence required a document reload.");
    await assertSameDocument(sellerSession, "Seller");
    evidence.browser.sellerConvergedWithoutReload = true;
    evidence.browser.sharedReceiptIdentityVisible = receiptModalText.includes(receipt.receiptKey) && sellerSemanticText.includes(receipt.receiptKey);
    evidence.browser.twoBrowserCrossCurrencyPurchaseCompleted =
      evidence.browser.businessAllForeignFundingSelected &&
      evidence.database.fundingSourcesDebitedExactly &&
      evidence.database.businessCashCreditedExactly &&
      evidence.browser.sellerConvergedWithoutReload;

    await completeSeededCompatibilityPurchase(
      buyerSession,
      fixture1,
      game1ForeignAccount,
    );
    await provePurchaseFirstLeavesOnlyRemainderWithdrawable(fixture1);
    await assertSafePlayerDom(buyerSession.page);
    await assertSafePlayerDom(sellerSession.page);

    const game2AfterGame1 = await stateSnapshot(fixture2);
    evidence.database.game2ZeroMutation = JSON.stringify(game2Before) === JSON.stringify(game2AfterGame1);
    assert(evidence.database.game2ZeroMutation, "Game 1 Store acceptance mutated Game 2 state.");

    const game1BeforeGame2Probe = await stateSnapshot(fixture1);
    await reauthenticatePlayer(buyerSession, game2, game2Buyer);
    await assertReciprocalGameStoreExposure(
      buyerSession,
      fixture2,
      fixture1,
      receipt.receiptKey,
    );
    const game2AfterBrowserRead = await stateSnapshot(fixture2);
    evidence.database.game2ZeroMutation =
      evidence.database.game2ZeroMutation &&
      JSON.stringify(game2Before) === JSON.stringify(game2AfterBrowserRead);
    assert(evidence.database.game2ZeroMutation, "Authenticated Game 2 Store read mutated Game 2 state.");

    await proveWithdrawalFirstRejectsBeforePayment(
      fixture2,
      game2ForeignAccount.accountKey,
    );
    const game1AfterGame2Probe = await stateSnapshot(fixture1);
    evidence.database.game1ZeroMutationFromGame2Probe =
      JSON.stringify(game1BeforeGame2Probe) === JSON.stringify(game1AfterGame2Probe);
    assert(evidence.database.game1ZeroMutationFromGame2Probe, "Game 2 withdrawal ordering mutated Game 1 state.");

    await assertSafePlayerDom(buyerSession.page);
    await assertSafePlayerDom(sellerSession.page);
  } finally {
    await buyerSession?.context?.close().catch(() => undefined);
    await sellerSession?.context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  assertEvidenceComplete();
  evidence.outcome = "passed";
}

try {
  await main();
} catch (error) {
  evidence.outcome = "failed";
  evidence.failure = redact(error?.stack || error?.message || error);
  await writeEvidence();
  throw new Error(redact(error?.message || error));
}

await writeEvidence();
process.stdout.write(`${JSON.stringify({
  ok: true,
  phase: "10A4",
  contexts: evidence.runtime.playerBrowserContexts,
  games: evidence.provisioning.gamesCreated,
  settlement: evidence.settlement.receiptKey,
  replayZeroDelta: evidence.database.replayZeroDelta,
  game2ZeroMutation: evidence.database.game2ZeroMutation,
  evidence: EVIDENCE_FILE,
})}\n`);