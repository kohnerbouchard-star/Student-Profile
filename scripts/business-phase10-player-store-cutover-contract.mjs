#!/usr/bin/env node

import fs from "node:fs";

const files = {
  publicContracts:
    "backend/src/domains/store/contracts/playerStoreOfferPublicContracts.ts",
  publicRepository:
    "backend/src/domains/store/infrastructure/supabasePlayerStoreOfferPublicRepository.ts",
  publicRepositoryReadStore:
    "backend/src/domains/store/infrastructure/playerStoreOfferPublicReadStore.ts",
  publicRepositoryErrors:
    "backend/src/domains/store/infrastructure/playerStoreOfferPublicRepositoryErrors.ts",
  retainedContracts:
    "backend/src/domains/store/contracts/playerStorePublicContracts.ts",
  retainedRepository:
    "backend/src/domains/store/infrastructure/supabasePlayerStorePublicRepository.ts",
  routes: "backend/src/domains/store/api/playerStorePublicRoutePaths.ts",
  handler: "backend/src/domains/store/api/playerStorePublicHttpHandler.ts",
  handlerRequestValidation:
    "backend/src/domains/store/api/playerStorePublicRequestValidation.ts",
  handlerResponseProjection:
    "backend/src/domains/store/api/playerStorePublicResponseProjection.ts",
  handlerTests: "backend/src/domains/store/api/playerStorePublicHttpHandler.test.ts",
  businessOfferHandlerTests:
    "backend/src/domains/store/api/playerStoreBusinessOfferPublicHttpHandler.test.ts",
  handlerTestSupport:
    "backend/src/domains/store/api/playerStorePublicHttpHandlerTestSupport.ts",
  playerRuntime: "backend/supabase/functions/player-api/runtime.ts",
  classroomRuntime: "backend/supabase/functions/classroom-api/index.ts",
  capabilities:
    "backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts",
  rateLimitDispatch: "backend/src/security/playerRateLimitDispatch.ts",
  rateLimitRegistry: "backend/src/security/playerRateLimitOperationRegistry.ts",
  businessContracts:
    "backend/src/domains/business/contracts/playerBusinessContracts.ts",
  businessRepository:
    "backend/src/domains/business/infrastructure/supabasePlayerBusinessRepository.ts",
  businessStoreSalesProjection:
    "backend/src/domains/business/infrastructure/supabasePlayerBusinessStoreSalesProjection.ts",
  businessRepositoryTests:
    "backend/src/domains/business/infrastructure/supabasePlayerBusinessRepository.test.ts",
  backendPackage: "backend/package.json",
  endpoints: "player-terminal/src/api/endpoints.js",
  backendRoutes: "player-terminal/src/api/backend-routes-core.js",
  readModel: "player-terminal/src/api/read-model.js",
  responseNormalizer: "player-terminal/src/api/response-normalizer.js",
  responseStoreValidator: "player-terminal/src/api/response-store-validator.js",
  resourcePlan: "player-terminal/src/api/resource-plan.js",
  storePage: "player-terminal/src/pages/store-page.js",
  purchaseFlow: "player-terminal/src/features/store/store-purchase-flow.js",
  purchaseContract:
    "player-terminal/src/features/store/store-purchase-contract.js",
  purchaseConvergence:
    "player-terminal/src/features/store/store-purchase-convergence.js",
  capabilitiesUi: "player-terminal/src/api/capabilities.js",
  modal: "player-terminal/src/components/modal.js",
  businessPage: "player-terminal/src/pages/business-page.js",
  scope: "docs/roadmaps/business-phase10-player-store-cutover-scope-v1.md",
  browserAcceptance:
    "scripts/business-phase10-player-store-browser-acceptance.mjs",
  focusedBrowserAcceptance:
    "player-terminal/tests/browser/player-store-business-offer-acceptance.spec.mjs",
  playerStoreFlowTests: "player-terminal/tests/store-purchase-flow.mjs",
  ciLogRedactor: "scripts/redact-econovaria-ci-log.mjs",
  ciLogRedactorTests: "scripts/redact-econovaria-ci-log.test.mjs",
  edgeRuntimeIsolation: "scripts/local-edge-runtime-isolation.mjs",
  edgeRuntimeIsolationTests: "scripts/local-edge-runtime-isolation.test.mjs",
  workflow: ".github/workflows/business-player-store-cutover-v2.yml",
};

const source = Object.fromEntries(
  Object.entries(files).map(([name, path]) => {
    if (!fs.existsSync(path)) {
      throw new Error(`Missing Phase 10A.4 ${name}: ${path}`);
    }
    return [name, fs.readFileSync(path, "utf8")];
  }),
);

source.publicRepository = [
  source.publicRepository,
  source.publicRepositoryReadStore,
  source.publicRepositoryErrors,
].join("\n");
source.handler = [
  source.handler,
  source.handlerRequestValidation,
  source.handlerResponseProjection,
].join("\n");
source.handlerTests = [
  source.handlerTests,
  source.businessOfferHandlerTests,
  source.handlerTestSupport,
].join("\n");
source.businessRepository = [
  source.businessRepository,
  source.businessStoreSalesProjection,
].join("\n");
source.responseNormalizer = [
  source.responseNormalizer,
  source.responseStoreValidator,
].join("\n");
source.purchaseFlow = [
  source.purchaseFlow,
  source.purchaseContract,
  source.purchaseConvergence,
].join("\n");
source.rateLimits = [
  source.rateLimitDispatch,
  source.rateLimitRegistry,
].join("\n");

function requireTokens(text, label, tokens) {
  for (const token of tokens) {
    if (!text.includes(token)) throw new Error(`${label} missing token: ${token}`);
  }
}

function forbidTokens(text, label, tokens) {
  for (const token of tokens) {
    if (text.includes(token)) throw new Error(`${label} contains forbidden token: ${token}`);
  }
}

function requireTokenCount(text, label, token, expected) {
  const actual = text.split(token).length - 1;
  if (actual !== expected) {
    throw new Error(
      `${label} expected ${expected} occurrences of ${token}, found ${actual}.`,
    );
  }
}

function workflowStepBlock(text, name) {
  const marker = `      - name: ${name}`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`Missing workflow step: ${name}`);
  const end = text.indexOf("\n      - name: ", start + marker.length);
  return text.slice(start, end < 0 ? text.length : end);
}

function interfaceBlock(text, name) {
  const start = text.indexOf(`interface ${name}`);
  if (start < 0) throw new Error(`Missing interface ${name}.`);
  const bodyStart = text.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  throw new Error(`Unbounded interface ${name}.`);
}

function functionBlock(text, name) {
  const marker = `function ${name}(`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`Missing function ${name}.`);
  const bodyStart = text.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  throw new Error(`Unbounded function ${name}.`);
}

requireTokens(source.routes, "Player Store route parser", [
  'kind: "items"',
  'kind: "quotes"',
  'kind: "purchases"',
  'kind: "offerQuotes"',
  'kind: "offerPurchases"',
  'kind: "offerReceipt"',
  'resource === "offer-quotes"',
  'resource === "offer-purchases"',
  'segments[3] !== "receipts"',
  "/^spr_[0-9a-f]{32}$/u",
  "playerStoreRouteRateLimitKey",
]);

requireTokens(source.handler, "authenticated Player Store handler", [
  "resolvePlayerRequestScope",
  "resolveActivePlayerSession",
  "SupabasePlayerStorePublicRepository",
  "SupabasePlayerStoreOfferPublicRepository",
  "createOfferRepository",
  "listOfferProducts",
  "createBusinessOfferQuote",
  "purchaseBusinessOffer",
  "readBusinessOfferReceipt",
  'route.kind === "offerQuotes"',
  'route.kind === "offerPurchases"',
  "receiptKey: route.receiptKey",
  '"offerKey"',
  '"expectedVersion"',
  '"idempotencyKey"',
  '"clientSubmittedAt"',
  '"cache-control", "private, no-store"',
  "FORBIDDEN_SCOPE_HEADERS",
]);
forbidTokens(source.handler, "Player Store trusted browser boundary", [
  'body.gameSessionId',
  'body.playerId',
  'body.buyerPlayerId',
  'body.businessKey',
  'body.sellerKey',
  'body.unitPrice',
  'body.currencyCode',
]);

const productDto = interfaceBlock(
  source.publicContracts,
  "PlayerStoreOfferPublicProductDto",
);
const offerDto = interfaceBlock(
  source.publicContracts,
  "PlayerStoreOfferPublicOfferDto",
);
const quoteDto = interfaceBlock(
  source.publicContracts,
  "PlayerStoreOfferPublicQuoteDto",
);
const receiptDto = interfaceBlock(
  source.publicContracts,
  "PlayerStoreOfferPublicReceiptDto",
);
requireTokens(productDto, "public product DTO", [
  "catalogItemKey",
  "canonicalItemKey",
  "storeItemKey",
  "name",
  "description",
  "category",
  "currencyCode",
  "bestOfferKey",
  "bestUnitPrice",
  "totalAvailableQuantity",
  "sellerCount",
  "offerCount",
  "offers",
]);
requireTokens(offerDto, "public offer DTO", [
  "offerKey",
  "sellerKind",
  "sellerPartyKey",
  "sellerName",
  "businessKey",
  "businessName",
  "unitPrice",
  "currencyCode",
  "availableQuantity",
  "version",
  "purchasability",
  "purchasable",
]);
requireTokens(quoteDto, "Buyer quote DTO", [
  "quoteKey",
  "offerKey",
  "offerVersion",
  "businessKey",
  "sellerPartyKey",
  "catalogItemKey",
  "canonicalItemKey",
  "storeItemKey",
  "quantity",
  "unitPrice",
  "totalPrice",
  "currencyCode",
  "expiresAt",
  "replayed",
]);
requireTokens(receiptDto, "Buyer receipt DTO", [
  "receiptKey",
  "quoteKey",
  "offerKey",
  "businessKey",
  "sellerPartyKey",
  "catalogItemKey",
  "canonicalItemKey",
  "storeItemKey",
  "quantity",
  "unitPrice",
  "totalPrice",
  "offerVersionBefore",
  "offerVersionAfter",
  "remainingListedQuantity",
  "completedAt",
]);
for (const [label, dto] of [["Buyer quote DTO", quoteDto], ["Buyer receipt DTO", receiptDto]]) {
  forbidTokens(dto, label, [
    "gameSessionId",
    "buyerPlayerId",
    "inventoryAccountKey",
    "inventoryTransactionKey",
    "sourceUnitCost",
    "costOfGoodsSold",
    "grossMargin",
    "businessCredit",
  ]);
}

requireTokens(source.publicRepository, "public Store offer repository", [
  "SupabaseStoreSellerOfferRepository",
  "SupabaseStoreOfferQuoteRepository",
  "SupabaseStoreOfferSettlementRepository",
  "listOfferProducts",
  "createBusinessOfferQuote",
  "purchaseBusinessOffer",
  "readBusinessOfferReceipt",
  'from("economic_parties")',
  'from("player_country_assignments")',
  'from("country_profiles")',
  'from("business_ownership_positions")',
  'from("store_seller_offers")',
  'from("inventory_holdings")',
  'from("store_offer_purchase_receipts")',
  "owner_player_id",
  "currency_code",
  "quantity_reserved",
  "requireActive: false",
  '.eq("game_session_id", scope.gameSessionId)',
  '.eq("buyer_player_id", scope.playerId)',
  '.eq("public_key", receiptKey)',
  "store_offer_receipt_not_found",
]);
forbidTokens(source.publicRepository, "public Store repository writes", [
  '.insert(',
  '.update(',
  '.delete(',
  "business_sales",
  "business_inventory",
]);

for (const [label, runtime] of [
  ["Player API runtime", source.playerRuntime],
  ["Classroom compatibility runtime", source.classroomRuntime],
]) {
  requireTokens(runtime, label, [
    "readPlayerStorePublicRoutePath",
    "playerStoreRouteRateLimitKey",
    "handlePlayerStorePublicRequest",
  ]);
}

requireTokens(source.capabilities, "Player capabilities", [
  '"/players/me/store/offer-quotes"',
  '"/players/me/store/offer-purchases"',
  '"/players/me/store/receipts/:receiptKey"',
  'actionCapabilities: ["storePurchase"]',
]);
requireTokens(source.rateLimits, "reviewed Store rate limits", [
  "storeQuote: byMethod",
  "storePurchase: byMethod",
  'operation("player.store.quote", "write")',
  'operation("player.store.purchase", "sensitive")',
  'operation("player.store.purchases.read", "read")',
]);

requireTokens(source.businessContracts, "seller Business contract", [
  "BusinessStoreSaleDto",
  "BusinessStoreSaleActivityDto",
  "BusinessStoreSalesSnapshotDto",
  "storeSales: BusinessStoreSalesSnapshotDto",
]);
requireTokens(source.businessRepository, "seller committed projection", [
  'from("store_offer_purchase_receipts")',
  'from("business_activity_events")',
  '"business.store.sale.completed"',
  "businessStoreSalesSnapshot",
  "recentGrossRevenue",
  "recentCostOfGoodsSold",
  "recentGrossMargin",
]);
forbidTokens(source.businessRepository, "seller projection writes", [
  '.insert(',
  '.update(',
  '.delete(',
]);
requireTokens(source.businessRepositoryTests, "seller projection tests", [
  "projects committed Store sales without internal identity",
  "assertNoUuid",
  "recentGrossRevenue",
  "activityKey",
]);

requireTokens(source.endpoints, "Player endpoint registry", [
  "storeOfferQuote",
  "storeOfferPurchase",
  "storeOfferReceipt",
  'path: "/store/offer-quotes"',
  'path: "/store/offer-purchases"',
]);
requireTokens(source.backendRoutes, "same-origin Player BFF routes", [
  "storeOfferQuote",
  'path: "/players/me/store/offer-quotes"',
  "storeOfferPurchase",
  'path: "/players/me/store/offer-purchases"',
  "storeOfferReceipt",
  'players/me/store/receipts/${encodeURIComponent',
  "expectedVersion",
  "idempotencyKey",
]);
const offerRouteStart = source.backendRoutes.indexOf("storeOfferQuote:");
const offerRouteEnd = source.backendRoutes.indexOf("inventory:", offerRouteStart);
if (offerRouteStart < 0 || offerRouteEnd < 0) {
  throw new Error("Player Business-offer BFF route block is not bounded.");
}
forbidTokens(
  source.backendRoutes.slice(offerRouteStart, offerRouteEnd),
  "Business-offer browser commands",
  [
    "gameSessionId",
    "playerId",
    "buyerPlayerId",
    "sellerKind",
    "sellerName",
    "businessKey",
    "unitPrice",
    "currencyCode",
  ],
);

requireTokens(source.readModel, "Player Store aggregate read model", [
  "products",
  "offers",
  "sellerCount",
  "totalAvailableQuantity",
  "purchasability",
  "offer.purchasable === true",
]);
requireTokens(source.responseNormalizer, "Player Store response privacy", [
  "validateStoreResponse",
  "validStoreOfferPurchasability",
  "offer.purchasable === true",
  "seeded_offer",
  "storeSales",
  "spr_",
  "sof_",
  "UUID",
]);
requireTokens(source.storePage, "one-card multi-offer Store UI", [
  "sellerCount",
  "offers",
  "sellerName",
  "purchasability",
  "data-player-store-offer",
]);
requireTokens(source.purchaseFlow, "exact selected-offer flow", [
  "storeOfferQuote",
  "storeOfferPurchase",
  "expectedVersion",
  "offerKey",
  "alreadyCompleted",
  'refreshState: warnings.length ? "pending" : "complete"',
  "convergeCommittedStorePurchase",
  "retryCommittedRefresh",
  "data-player-store-refresh-retry",
  "transaction?.processing === true && !force",
  "processing: true",
]);
requireTokens(source.capabilitiesUi, "retained capability aliases", [
  'storeOfferQuote: "storePurchase"',
  'storeOfferPurchase: "storePurchase"',
  'storeOfferReceipt: "storePurchase"',
]);
requireTokens(source.modal, "Business offer receipt modal", [
  "sellerName",
  "offerKey",
  "remainingListedQuantity",
  "SELLER STOCK AT QUOTE",
  "OFFER VERSION",
  "alreadyCompleted",
  "original immutable receipt",
  "refresh",
  "Retry refresh",
  "SETTLEMENT IN PROGRESS",
  'aria-busy="${processing ? "true" : "false"}',
  'tabindex="-1"',
]);
requireTokens(source.resourcePlan, "purchase convergence", [
  'storePurchase: Object.freeze(["dashboard", "store", "inventory", "banking"])',
  "storeOfferPurchase",
  "storeOfferQuote",
]);
requireTokens(source.businessPage, "seller Sales/Finance/Activity UI", [
  "STORE SALES · FINANCE · ACTIVITY",
  "data-business-store-sales",
  "data-business-store-sale-receipt",
  "recentGrossRevenue",
  "recentCostOfGoodsSold",
  "recentGrossMargin",
]);

requireTokens(source.handlerTests, "Player Store boundary tests", [
  "offer-quotes",
  "offer-purchases",
  "receipts/",
  "assertNoUuid",
]);
requireTokens(source.backendPackage, "Player Store permanent test registration", [
  "src/domains/store/api/playerStorePublicHttpHandler.test.ts",
  "src/domains/store/api/playerStoreBusinessOfferPublicHttpHandler.test.ts",
]);
requireTokens(source.scope, "Phase 10A.4 scope", [
  "BUSINESS-V2-10A4",
  "seeded and Business",
  "Two authenticated Player browser contexts",
  "Two simultaneous games",
  "does **not authorize**",
]);
requireTokens(source.workflow, "permanent exact-head workflow", [
  "Business Player Store Cutover V2",
  "permissions:\n  contents: read",
  "github.event.pull_request.head.sha || github.sha",
  'test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"',
  "business-phase10-player-store-cutover-contract.mjs",
  "business-phase10-atomic-settlement-database.mjs",
  "business-phase10-atomic-settlement-concurrency.mjs",
  "business-phase10-player-store-browser-acceptance.mjs",
  "npm --prefix player-terminal run verify",
  "npm --prefix player-terminal run browser",
  "Run focused Business-offer accessibility and responsive acceptance",
  "tests/browser/player-store-business-offer-acceptance.spec.mjs",
  "node --test scripts/redact-econovaria-ci-log.test.mjs",
  "node --test scripts/local-edge-runtime-isolation.test.mjs",
  "node scripts/redact-econovaria-ci-log.mjs",
  'backend/tsconfig*.json',
  "docs/seed-content/authorizations/**",
  "docs/seed-content/items/**",
  "docs/seed-content/simulation/**",
  "scripts/lib/physical-economy-pack-*.mjs",
  "scripts/simulate-physical-economy-activation-v3.mjs",
  "scripts/world-staging-provision-lib.mjs",
  "scripts/redact-econovaria-ci-log*.mjs",
  "audit:interaction-wiring",
  "security:verify",
  "git diff --check",
  "database_evidence_privacy",
  "database_replay_evidence_privacy",
  "evidence_privacy",
  "/tmp/phase10a4-database-sanitized/",
  "/tmp/phase10a4-database-replay-sanitized/",
  "/tmp/phase10a4-connected-sanitized/",
]);

requireTokens(source.edgeRuntimeIsolation, "bounded local Edge runtime recovery", [
  "DEFAULT_STABLE_WAVES = 3",
  "DEFAULT_RECOVERY_ATTEMPTS = 2",
  "MAX_RECOVERY_ATTEMPTS = 2",
  "MAX_READINESS_WAVES_PER_RECOVERY = 6",
  "DOCKER_COMMAND_TIMEOUT_MS = 30_000",
  "PROBE_TIMEOUT_GRACE_MS = 5_000",
  "probeTimeoutMs = gatewayRequestTimeoutMs + PROBE_TIMEOUT_GRACE_MS",
  'path: "/"',
  'path: "/functions/v1/player-api"',
  'path: "/functions/v1/player-web-session-api"',
  'path: "/functions/v1/bootstrap-api/health"',
  'method: "GET"',
  'includeOrigin: false',
  "EDGE_CONTAINER_PATTERN",
  "KONG_CONTAINER_PATTERN",
  'execFile("docker", ["ps", "-a", "--format", "{{.Names}}"]',
  "for (const containerName of [containers.edge, containers.kong])",
  'execFile("docker", ["restart", containerName]',
  '["inspect", "--format", "{{.State.Running}}", containerName]',
  "recoveryAttempts > MAX_RECOVERY_ATTEMPTS",
  "remainingMs < probeTimeoutMs",
  "restricted to the local acceptance gateway",
  "bounded recovery attempts",
]);
requireTokenCount(
  source.edgeRuntimeIsolation,
  "bounded local Docker subprocesses",
  "timeout: DOCKER_COMMAND_TIMEOUT_MS",
  3,
);
forbidTokens(source.edgeRuntimeIsolation, "bounded local Edge runtime recovery", [
  "Promise.all",
  '["stop"',
  '["rm"',
  '["prune"',
]);
requireTokens(source.edgeRuntimeIsolationTests, "local Edge recovery regressions", [
  "restarts the exact Edge and Kong containers and proves three stable gateway waves",
  "performs only one bounded recovery when the first warmup loses Edge runtime",
  "restarts again when running containers retain stale Kong DNS",
  "fails closed when either exact runtime container identity is ambiguous",
  "never permits more than two recovery attempts",
  "fails closed after two bounded unhealthy recoveries without broad Docker actions",
]);

const connectedGatewayStart = workflowStepBlock(
  source.workflow,
  "Start same-origin Player gateway",
);
requireTokens(connectedGatewayStart, "connected local gateway recovery", [
  "GATEWAY_PID=$!",
  'kill -0 "$GATEWAY_PID"',
  "STATIC_READY=false",
  "--max-time 5",
  "restartLocalEdgeRuntime",
  "local-edge-runtime-isolation.mjs",
]);
forbidTokens(connectedGatewayStart, "connected local gateway recovery", [
  "PUBLISHABLE_KEY",
  "/functions/v1/player-api",
  "/functions/v1/bootstrap-api",
  "seq 1 90",
]);

const connectedRuntimeDiagnostics = workflowStepBlock(
  source.workflow,
  "Capture sanitized connected-runtime diagnostics",
);
requireTokens(connectedRuntimeDiagnostics, "privacy-safe exited runtime diagnostics", [
  "docker ps -a --format '{{.Names}} status={{.Status}}'",
  "^supabase_(edge_runtime|kong)_[A-Za-z0-9_.-]+$",
  "{{.State.Status}}",
  "{{.State.Running}}",
  "{{.State.ExitCode}}",
  "{{.State.OOMKilled}}",
  "{{.RestartCount}}",
  "docker logs --since 20m --tail 900",
  "node scripts/redact-econovaria-ci-log.mjs",
]);
forbidTokens(connectedRuntimeDiagnostics, "privacy-safe exited runtime diagnostics", [
  "docker inspect \"$CONTAINER\"",
  "docker ps --format '{{.Names}}'",
]);
requireTokenCount(
  source.workflow,
  "exact-head checkout steps",
  "Check out exact workflow head",
  6,
);
requireTokenCount(
  source.workflow,
  "pinned checkout actions",
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  6,
);
requireTokenCount(
  source.workflow,
  "exact checked-out refs",
  "ref: ${{ github.event.pull_request.head.sha || github.sha }}",
  6,
);
requireTokenCount(
  source.workflow,
  "credential-free checkouts",
  "persist-credentials: false",
  6,
);
requireTokenCount(
  source.workflow,
  "exact checked-out SHA assertions",
  'test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"',
  6,
);
requireTokenCount(
  source.workflow,
  "Supabase credential artifact privacy scans",
  "SUPABASE[ _-]?[A-Z0-9_]*",
  3,
);
requireTokenCount(
  source.workflow,
  "portable artifact privacy scans",
  "grep -aErqi",
  3,
);
requireTokenCount(
  source.workflow,
  "private hash-field artifact privacy scans",
  '"?[A-Z][A-Z0-9_]*_HASH"?',
  3,
);
forbidTokens(source.workflow, "artifact privacy scans", [
  "rg --text --quiet",
]);

const databaseUpload = workflowStepBlock(
  source.workflow,
  "Upload sanitized database diagnostics",
);
requireTokens(databaseUpload, "database diagnostic upload", [
  "steps.database_evidence_privacy.outcome == 'success'",
  "path: /tmp/phase10a4-database-sanitized/",
]);
forbidTokens(databaseUpload, "database diagnostic upload", [
  "phase10a4-database-startup.log",
  "phase10a4-database-status.log",
  "phase10a4-database-docker.log",
]);

const databaseReplayUpload = workflowStepBlock(
  source.workflow,
  "Upload sanitized database replay diagnostics",
);
requireTokens(databaseReplayUpload, "database replay diagnostic upload", [
  "steps.database_replay_evidence_privacy.outcome == 'success'",
  "path: /tmp/phase10a4-database-replay-sanitized/",
]);
forbidTokens(databaseReplayUpload, "database replay diagnostic upload", [
  "phase10a4-database-replay-startup.log",
  "phase10a4-database-replay-status.log",
  "phase10a4-database-replay-docker.log",
]);

const connectedUpload = workflowStepBlock(
  source.workflow,
  "Upload only sanitized connected evidence and logs",
);
requireTokens(connectedUpload, "connected evidence upload", [
  "steps.evidence_privacy.outcome == 'success'",
  "/tmp/econovaria-phase10a4-player-store-evidence/",
  "/tmp/phase10a4-connected-sanitized/",
]);
forbidTokens(connectedUpload, "connected evidence upload", [
  "connected-gateway-raw.log",
  "connected-supabase-startup.log",
  "connected-database-reset.log",
]);

requireTokens(source.ciLogRedactor, "CI evidence stream redactor", [
  "CREDENTIAL_FIELD_PATTERN",
  "SUPABASE[ _-]?[A-Z0-9_]*",
  "DATABASE[ _-]?URL",
  "JWT[ _-]?SECRET",
  "SERVICE[ _-]?ROLE",
  "S3[ _-]?(?:ACCESS|SECRET)",
  "ECONOVARIA_[A-Z0-9_]*",
  "postgres(?:ql)?",
  "authorization",
  "PRIVATE KEY",
  "PRIVATE_HASH_FIELD_PATTERN",
  "assertEconovariaCiLogSanitized",
]);
requireTokens(source.ciLogRedactorTests, "CI evidence redactor tests", [
  "JWT secret",
  "ANON_KEY",
  "SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_JWT_SECRET",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_ACCESS_TOKEN",
  "S3 Access Key",
  "ECONOVARIA_RATE_LIMIT_HMAC_SECRET",
  "ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY",
  "ECONOVARIA_PLAYER_CREDENTIAL_PEPPER",
  "session_token_hash",
  "access_code_hash",
  "game_join_code_hash",
  "normalized_student_code_hash",
  "purchase_codes_code_hash",
  "nonce_hash",
  "token_hash",
  "code_hash",
  "%2841b43379-2942-5bb4-8c65-a12e70709dd2",
  "assertEconovariaCiLogSanitized",
]);
requireTokens(source.browserAcceptance, "connected two-browser acceptance", [
  "chromium",
  "DATABASE_URL",
  "/players/me/store/offer-quotes",
  "/players/me/store/offer-purchases",
  "/players\\/me\\/store\\/receipts\\/spr_",
  "replayReturnedSameReceipt",
  "replayZeroDelta",
  "game2KeysAbsentFromGame1Store",
  "game1KeysAbsentFromGame2Store",
  "game2OfferVisibleInGame2Store",
  "game2ZeroMutation",
  "game1ZeroMutationFromGame2Probe",
  "settlementProcessingDismissalBlocked",
  "settlementProcessingFocusContained",
  "refreshRetryDidNotResubmitSettlement",
  "postCommitInvalidReceiptResponses",
  "postCommitReceiptReadAttempts",
  "injectedInvalidReceiptResponses === 1",
  "receiptReadAttempts === 1",
  "MAX_MANUAL_REFRESH_ATTEMPTS = 4",
  "refreshAttempt <= MAX_MANUAL_REFRESH_ATTEMPTS",
  "receiptReadAttempts === receiptReadsBeforeAttempt + 1",
  "receiptReadAttempts === evidence.browser.refreshRetryAttempts + 1",
  "refreshRetryPendingAttempts === evidence.browser.refreshRetryAttempts - 1",
  "refreshRetryResourceAttempts.length === evidence.browser.refreshRetryAttempts",
  'evidence.browser.refreshRetryOutcomes.at(-1) === "complete"',
  "installCommittedRefreshAudit(buyerSession)",
  "initialPostCommitResourceRefresh",
  "Committed receipt UI state did not match the recorded resource-refresh outcome.",
  "receiptRead.status() === 200",
  `await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {},
          }),
        });`,
  "Contract-invalid post-commit receipt read",
  "evidence.browser.consoleErrors.length === 0",
  "evidence.browser.pageErrors.length === 0",
  "withdrawalFirstRejectedBeforePayment",
  "purchaseFirstRemainingWithdrawalAccepted",
  "sourceMaterializationCount: 0",
  "assertSanitizedArtifact",
  "async function openStoreRoute(session)",
  "Store route returned",
  "on country.id = assignment.country_profile_id",
]);
const sellerSemanticStart = source.browserAcceptance.indexOf(
  "const sellerReceipt = sellerSession.page.locator(`[data-business-store-sale-receipt=\"${receipt.receiptKey}\"]`);",
);
const sellerSemanticEnd = source.browserAcceptance.indexOf(
  "await completeSeededCompatibilityPurchase",
  sellerSemanticStart,
);
if (sellerSemanticStart < 0 || sellerSemanticEnd <= sellerSemanticStart) {
  throw new Error("Missing bounded semantic seller convergence block.");
}
const sellerSemanticConvergence = source.browserAcceptance.slice(
  sellerSemanticStart,
  sellerSemanticEnd,
);
requireTokens(sellerSemanticConvergence, "semantic seller convergence", [
  'await sellerReceipt.waitFor({ state: "visible", timeout: SELLER_CONVERGENCE_TIMEOUT_MS });',
  'await sellerReceipt.locator(`[data-business-store-sale-activity="${activityKey}"]`).waitFor({ state: "visible", timeout: 30_000 });',
  "const sellerSemanticText = await sellerReceipt.textContent();",
  '["receipt", receipt.receiptKey]',
  '["offer", receipt.offerKey]',
  '["Store item", fixture1.storeItemKey]',
  '["quantity", `${receipt.quantity} units`]',
  'sellerSemanticText.includes("business_store_offer_purchase")',
  "receiptModalText.includes(receipt.receiptKey) && sellerSemanticText.includes(receipt.receiptKey)",
]);
forbidTokens(sellerSemanticConvergence, "semantic seller convergence", [
  "sellerReceipt.innerText()",
  ".toLowerCase()",
  ".toUpperCase()",
  "sellerReceipt.innerHTML",
  "sellerReceipt.outerHTML",
]);
const sellerReceiptVisibleIndex = sellerSemanticConvergence.indexOf(
  'await sellerReceipt.waitFor({ state: "visible"',
);
const sellerActivityVisibleIndex = sellerSemanticConvergence.indexOf(
  "await sellerReceipt.locator(`[data-business-store-sale-activity=",
);
const sellerSemanticReadIndex = sellerSemanticConvergence.indexOf(
  "const sellerSemanticText = await sellerReceipt.textContent();",
);
if (
  sellerReceiptVisibleIndex < 0 ||
  sellerActivityVisibleIndex <= sellerReceiptVisibleIndex ||
  sellerSemanticReadIndex <= sellerActivityVisibleIndex
) {
  throw new Error(
    "Seller semantic convergence must wait for receipt and activity visibility before reading text.",
  );
}
const connectedRefreshRetryStart = source.browserAcceptance.indexOf("let refreshCompleted = false;");
const connectedRefreshRetryEnd = source.browserAcceptance.indexOf(
  'await modal.getByText("PURCHASE RECEIPT"',
  connectedRefreshRetryStart,
);
if (connectedRefreshRetryStart < 0 || connectedRefreshRetryEnd <= connectedRefreshRetryStart) {
  throw new Error("Missing bounded connected committed-refresh retry block.");
}
const connectedRefreshRetry = source.browserAcceptance.slice(
  connectedRefreshRetryStart,
  connectedRefreshRetryEnd,
);
requireTokens(connectedRefreshRetry, "bounded connected committed-refresh retry", [
  "assertReceipt(immutableReceipt, fixture1, quote)",
  "assertImmutableReceiptReread(receipt, immutableReceipt)",
  "buyerSession.audit.businessPurchaseRequestCount === 1",
  'refreshState === "complete"',
  "refreshAttempt < MAX_MANUAL_REFRESH_ATTEMPTS",
  "refreshRetryPendingAttempts += 1",
  "refreshAuditsAfterAttempt.length === refreshAuditsBeforeAttempt + 1",
  "refreshAudit.threw || refreshAudit.errors.length > 0",
  "finally {",
  "unroute(receiptRoutePattern, receiptContractFailureHandler)",
]);
forbidTokens(connectedRefreshRetry, "bounded connected committed-refresh retry", [
  "/players/me/store/offer-purchases",
  'api.execute("storeOfferPurchase"',
]);
requireTokens(source.playerStoreFlowTests, "bounded committed-refresh flow tests", [
  "convergeCommittedStorePurchase",
  'errors: { dashboard: { code: "REQUEST_TIMEOUT" } }',
  "completedConvergence",
  "Each safe refresh attempt must reread the immutable receipt exactly once.",
  "Safe refresh attempts must never resubmit settlement.",
  "convergenceSettlementSubmissions, 0",
  "convergenceReceiptReads, 2",
  "convergenceCurrent.invalidatedResources",
]);
const committedRefreshAudit = functionBlock(source.browserAcceptance, "installCommittedRefreshAudit");
requireTokens(committedRefreshAudit, "safe committed-refresh audit", [
  "Reflect.apply(originalRefreshResources, this, [resources])",
  "resources: safeTokens(resources)",
  "dataKeys: safeTokens(Object.keys(data))",
  "Object.entries(errors).map(([resource, error])",
  "elapsedMs: elapsed(startedAt)",
  "threw: false",
  "threw: true",
  "return result",
  "throw error",
]);
forbidTokens(committedRefreshAudit, "safe committed-refresh audit", [
  "error?.message",
  "error.message",
  "JSON.stringify(result)",
]);
const immutableReceiptReread = functionBlock(source.browserAcceptance, "assertImmutableReceiptReread");
requireTokens(immutableReceiptReread, "exact immutable receipt reread", [
  "Object.keys(committedReceipt).sort()",
  "Object.keys(immutableReceipt).sort()",
  'field === "alreadyCompleted"',
  "JSON.stringify(immutableReceipt[field]) === JSON.stringify(committedReceipt[field])",
  "committedReceipt.alreadyCompleted === false && immutableReceipt.alreadyCompleted === true",
]);
const focusedRetryStart = source.focusedBrowserAcceptance.indexOf(
  'test("committed refresh retries stay read-only across invalid receipt and resource timeout"',
);
const focusedRetryEnd = source.focusedBrowserAcceptance.indexOf("\ntest(\"", focusedRetryStart + 1);
if (focusedRetryStart < 0 || focusedRetryEnd <= focusedRetryStart) {
  throw new Error("Missing focused committed-refresh retry browser regression.");
}
const focusedRetry = source.focusedBrowserAcceptance.slice(focusedRetryStart, focusedRetryEnd);
requireTokens(focusedRetry, "focused committed-refresh retry browser regression", [
  'return { ok: true, data: {} }',
  'dashboard: { code: "REQUEST_TIMEOUT", status: 504 }',
  'toContainText("COMPLETED · REFRESH PENDING")',
  'refreshRetry.click()',
  "settlementCalls: 1",
  "receiptReads: 3",
  "resourceRefreshes: 3",
  'toHaveCount(0)',
  'toHaveAttribute("aria-busy", "false")',
]);
const focusedRetryRequestAudit = functionBlock(focusedRetry, "instrumentedPreviewRequest");
const focusedRetryDelegateIndex = focusedRetryRequestAudit.indexOf(
  "const result = await request.call(this, context);",
);
for (const attemptedRequestCounter of [
  'if (context.endpointKey === "storeOfferPurchase") audit.settlementCalls += 1;',
  'if (context.endpointKey === "storeOfferReceipt") audit.receiptReads += 1;',
]) {
  const counterIndex = focusedRetryRequestAudit.indexOf(attemptedRequestCounter);
  if (counterIndex < 0 || focusedRetryDelegateIndex < 0 || counterIndex > focusedRetryDelegateIndex) {
    throw new Error("Focused committed-refresh regression must count every attempted receipt read and settlement before delegation.");
  }
}
const connectedLogin = functionBlock(source.browserAcceptance, "completePlayerLogin");
forbidTokens(connectedLogin, "connected route-lazy Player login", [
  "/players/me/store/items",
  "storeResponsePromise",
]);
const connectedStoreRoute = functionBlock(source.browserAcceptance, "openStoreRoute");
requireTokens(connectedStoreRoute, "connected explicit Store route", [
  "waitForResponse",
  "/players/me/store/items",
  'await openRoute(session, "store"',
  "session.storePayload = storePayload",
]);
requireTokenCount(
  source.browserAcceptance,
  "connected explicit Store route ownership",
  "openStoreRoute(",
  3,
);
forbidTokens(source.browserAcceptance, "connected route-lazy Store and country assignment", [
  "Store bootstrap returned",
  "country.game_session_id = assignment.game_session_id",
]);
requireTokens(
  source.focusedBrowserAcceptance,
  "focused Business-offer browser acceptance",
  [
    "usePreviewData: true",
    "simulatePreviewWrites: true",
    "explicit Business offer completes once with keyboard-only modal operation",
    "rendered Store states remain distinct, safe, and screen-reader legible",
    "Business offer and modal reflow at desktop, tablet, and Pixel-class bounds",
    "200 percent zoom-equivalent reflow and reduced motion preserve the Business action",
    "page.keyboard.press",
    'page.keyboard.press("Shift+Tab")',
    "expectFocused(businessPurchase)",
    'aria-modal", "true"',
    'kind: "loading"',
    'kind: "empty"',
    'kind: "unavailable"',
    'kind: "sold-out"',
    'kind: "committed"',
    'kind: "replayed"',
    'kind: "refresh-pending"',
    'name: "desktop"',
    'name: "tablet"',
    'name: "Pixel 7 class"',
    'fontSize = "200%"',
    'reducedMotion: "reduce"',
  ],
);
forbidTokens(source.workflow, "permanent workflow", [
  "apply_patch",
  "source-snapshot",
  "temporary writer",
  "finalizer",
  "controller commit",
  "contents: write",
  "pull-requests: write",
  "actions: write",
  "checks: write",
  "id-token: write",
  "git push",
  "git commit",
  "git tag",
  "gh pr",
  "gh api",
  "actions/github-script",
  "api.github.com",
  "repository_dispatch",
]);

const normalizedWorkflow = source.workflow.replace(/\\\n\s*/gu, " ");
forbidTokens(normalizedWorkflow, "raw Supabase workflow logging", [
  'npx supabase start --workdir backend --exclude "$EXCLUDED" 2>&1 | tee',
  "npx supabase status --workdir backend 2>&1 | tee",
  "npx supabase db reset --workdir backend --local 2>&1 | tee",
  "npx supabase db lint --workdir backend --local --level warning 2>&1 | tee",
]);
forbidTokens(source.browserAcceptance, "permanent browser acceptance", [
  "mkdtemp",
  "materialized",
  "source.replace",
  "connected-player-bff-acceptance-loader",
  "runtime-config.env.js",
  "player-terminal/frontend",
  "copyFile",
  "appendFile",
  "rename(",
  "phase10a4_injected_receipt_read_failure",
]);

for (const file of fs.readdirSync("backend/supabase/migrations")) {
  if (/phase10a4|player_store_cutover/iu.test(file)) {
    throw new Error(`Phase 10A.4 must not add a persistence migration: ${file}`);
  }
}

forbidTokens(source.retainedContracts, "retained seeded public contract", [
  "BusinessStoreOfferQuoteDto",
  "BusinessStoreOfferReceiptDto",
]);
forbidTokens(source.retainedRepository, "retained seeded authority", [
  "settle_business_store_offer_v2",
  "create_business_store_offer_quote_v2",
]);

console.log("Business Phase 10A.4 Player Store cutover contract passed.");
