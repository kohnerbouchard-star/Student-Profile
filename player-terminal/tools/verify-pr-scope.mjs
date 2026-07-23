import { readFileSync } from "node:fs";

const changedFilePath = process.argv[2];
if (!changedFilePath) {
  console.error("Usage: node tools/verify-pr-scope.mjs <changed-files.txt>");
  process.exit(2);
}

const changedFiles = readFileSync(changedFilePath, "utf8")
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean);

const hasPlayerChanges = changedFiles.some((path) => path.startsWith("player-terminal/"));

const exactAllowed = new Set([
  ".github/workflows/player-terminal-verify.yml",
  ".github/workflows/marketplace-preconvergence.yml",
  ".github/workflows/messaging-isolated-staging.yml",
  ".github/workflows/messaging-final-connected-acceptance.yml",
  ".github/workflows/progression-runtime-v1.yml",
  ".github/workflows/progression-isolated-staging.yml",
  ".github/workflows/environment-neutral-browser.yml",
  ".github/workflows/admin-shell-smoke.yml",
  ".github/workflows/admin-game-lifecycle-controls-v1.yml",
  ".github/workflows/world-runtime.yml",
  ".github/workflows/business-banking-runtime.yml",
  ".github/workflows/crafting-item-runtime.yml",
  "admin/admin-bootstrap.js",
  "admin/messaging-moderation.css",
  "admin/index.html",
  "admin/inventory-redemption-queue-loader.js",
  "admin/modal-accessibility.js",
  "admin/modal-lifecycle-bridge.js",
  "admin/player-create-ux.js",
  "admin/scanner-auto-refresh.js",
  "admin/interaction-quality-control-reset.js",
  "admin/world-runtime-console.js",
  "admin/world-runtime-console-loader.js",
  "admin/css/crafting-oversight.css",
  "admin/css/world-runtime-console.css",
  "docs/operations/environments/runtime-config.env.template.js",
  "frontend/src/core/runtime-config.js",
  "scripts/admin-attendance-action-smoke.mjs",
  "scripts/admin-classroom-identity-fallback-smoke.mjs",
  "scripts/admin-player-access-code-smoke.mjs",
  "scripts/admin-session-manager-smoke.mjs",
  "scripts/admin-shell-identity-smoke.mjs",
  "scripts/admin-v606-full-drift-audit.mjs",
  "scripts/admin-world-runtime-console-contract.mjs",
  "scripts/admin-crafting-oversight-contract.mjs",
  "scripts/admin-mounted-modal-focus-reconciled-smoke.mjs",
  "scripts/build-physical-economy-runtime-pack.mjs",
  "scripts/simulate-physical-economy-balance.mjs",
  "scripts/admin-messaging-moderation-contract.mjs",
  "scripts/staging/probe-messaging-lifecycle.mjs",
  "scripts/staging/probe-messaging-inactive-sessions.mjs",
  "scripts/staging/messaging-connected-acceptance.sql",
  "scripts/staging/verify-messaging-zero-residue.sql",
  "scripts/environment-neutral-browser-integration.test.mjs",
  "scripts/runtime-config-contract.test.mjs",
  "backend/package.json",
  "backend/src/domains/economy/contracts/playerBankingPublicContracts.ts",
  "backend/src/domains/players/api/playerCapabilityManifestHttpHandler.ts",
  "backend/src/domains/players/api/playerCapabilityManifestHttpHandler.test.ts",
  "backend/src/domains/stocks/contracts/stockMarketTradingContracts.ts",
  "backend/src/domains/store/contracts/playerStorePublicContracts.ts",
  "backend/src/domains/store/infrastructure/supabasePlayerStorePublicRepository.ts",
  "backend/supabase/functions/admin-api/index.ts",
  "backend/supabase/functions/classroom-api/index.ts",
  "backend/supabase/functions/classroom-api/messagingDispatch.ts",
  "backend/supabase/migrations/20260719150000_add_player_store_public_keys_v1.sql",
  "backend/src/security/playerRateLimitDispatch.ts",
  "backend/src/security/playerRateLimitDispatch.test.ts",
  "backend/src/security/classroomApiRateLimitDispatch.test.ts",
  "docs/operations/evidence/pr-249-player-marketplace-lifecycle.md",
  "docs/roadmaps/active/player-marketplace-lifecycle-v1.md",
  "docs/workstreams/marketplace-crafting-reservation-convergence-v1.md",
  "docs/workstreams/messaging-communication-v1.md",
  "docs/operations/evidence/pr-244-player-story-delivery.md",
  "docs/audits/player-market-reconciliation-v1.md",
  "docs/roadmaps/active/player-market-reconciliation-v1.md",
  "docs/roadmaps/econovaria-beta-completion-roadmap-v1.md",
]);

const allowedPatterns = [
  /^player-terminal\//,
  /^\.github\/workflows\/(database-replay|player-runtime-cutover-verify|repository-quality)\.yml$/,
  /^admin\/(admin-auth|auth-session-manager|classroom-write-fallback|player-access-code-bridge)\.js$/,
  /^admin\/crafting-oversight-[A-Za-z0-9.-]+\.js$/,
  /^admin\/messaging-(moderation|policy)-(client|loader|surface)\.js$/,
  /^auth\/reset-password\.(html|js)$/,
  /^docs\/workstreams\/crafting-[A-Za-z0-9.-]+\.md$/,
  /^scripts\/crafting-[A-Za-z0-9.-]+\.mjs$/,
  /^scripts\/lib\/physical-economy-pack-[A-Za-z0-9.-]+\.mjs$/,
  /^scripts\/business-banking-[A-Za-z0-9.-]*\.mjs$/,
  /^scripts\/trigger-stock-market-tick(\.test)?\.mjs$/,
  /^docs\/audits\/remaining-cloudflare-api-url-v1\.md$/,
  /^docs\/roadmaps\/econovaria-player-runtime-cutover-amendment-2026-07-19\.md$/,
  /^frontend\/src\/core\/(api|constants|login)\.js$/,
  /^index\.html$/,
  /^package\.json$/,
  /^scripts\/(apply-shared-game-timezone-ui-v1|fix-shared-game-timezone-smoke-v1|player-contracts-workspace-smoke|player-login-identity-smoke|player-terminal-runtime-cutover-smoke|shared-game-timezone-ui-smoke)\.mjs$/,
  /^admin\/(css\/marketplace-lifecycle\.css|inventory-redemption-queue-loader\.js|marketplace-lifecycle-(client|loader|surface)\.js)$/,
  /^backend\/src\/domains\/marketplace\/(api|contracts|infrastructure|tests)\/[A-Za-z0-9.-]*\.ts$/,
  /^backend\/src\/domains\/messaging\//,
  /^backend\/src\/domains\/(arrival|campaign|world)\//,
  /^backend\/src\/domains\/business-banking\/(api|contracts|domain|infrastructure)\/[A-Za-z0-9.-]*\.ts$/,
  /^backend\/src\/domains\/crafting\//,
  /^backend\/src\/domains\/inventory\/(api|contracts|domain|infrastructure|tests)\/[A-Za-z0-9.-]*\.ts$/,
  /^backend\/src\/domains\/notifications\/(api|contracts|infrastructure|services)\/[A-Za-z0-9.-]*\.ts$/,
  /^backend\/src\/domains\/game-dashboard\/(api\/playerGameDashboardHttpHandler(\.test)?\.ts|contracts\/playerGameDashboardContracts\.ts)$/,
  /^backend\/src\/domains\/economy\/api\/playerBankingPublic[A-Za-z0-9.-]*\.ts$/,
  /^backend\/src\/domains\/economy\/infrastructure\/supabasePlayerBankingPublicRepository(\.test)?\.ts$/,
  /^backend\/src\/domains\/contracts\/api\/playerContractPublic(List|Submit)[A-Za-z0-9.-]*\.ts$/,
  /^backend\/src\/domains\/contracts\/contracts\/playerContractPublicListContracts(\.test)?\.ts$/,
  /^backend\/src\/domains\/players\/contracts\/playerCapabilityManifestContracts(\.test)?\.ts$/,
  /^backend\/src\/domains\/stocks\/api\/playerStockMarket[A-Za-z0-9.-]*\.ts$/,
  /^backend\/src\/domains\/store\/api\/playerStorePublic[A-Za-z0-9.-]*\.ts$/,
  /^backend\/src\/domains\/store\/tests\/playerStore[A-Za-z0-9.-]*\.ts$/,
  /^backend\/src\/security\/playerCraftingRateLimitDispatch(\.test)?\.ts$/,
  /^backend\/src\/security\/(playerMessagingRateLimitDispatch(\.test)?|staffMessagingRateLimitDispatch)\.ts$/,
  /^backend\/supabase\/functions\/admin-api\/(index|marketplaceOperations(\.test)?)\.ts$/,
  /^backend\/supabase\/functions\/admin-api\/(businessBankingOperations|craftingOperations)(\.test)?\.ts$/,
  /^backend\/supabase\/functions\/admin-api\/inventory(CraftingDispatch\.test|RedemptionOperations(Core)?)\.ts$/,
  /^backend\/supabase\/functions\/admin-api\/(worldRuntimeOperations|campaignProgramRuntime|campaignWorkersRuntime)(\.test)?\.ts$/,
  /^backend\/supabase\/functions\/admin-api\/messaging[A-Za-z0-9.-]*\.ts$/,
  /^backend\/supabase\/migrations\/2026072110[0-8]000_/,
  /^backend\/supabase\/migrations\/2026072112[0-9]{4}_[A-Za-z0-9_]+\.sql$/,
  /^backend\/supabase\/migrations\/2026072113[0-9]{4}_[A-Za-z0-9_]+\.sql$/,
  /^backend\/supabase\/migrations\/2026072114(0000_add_marketplace_reference_scopes_v1|1000_add_player_marketplace_lifecycle_v2|2000_harden_marketplace_resolution_replay_v1|2500_add_marketplace_inventory_event_types_v1|2600_fix_marketplace_listing_item_lookup_v1|2700_fix_marketplace_listing_currency_lookup_v1|2800_restore_marketplace_listing_reservation_wrapper_v1|2900_fix_marketplace_listing_legacy_lookups_v1|3000_harden_marketplace_legacy_projection_conflicts_v1|3100_harden_marketplace_table_return_conflicts_v1)\.sql$/,
  /^backend\/supabase\/migrations\/2026072115(0000|1000|2000|3000)_[A-Za-z0-9_]+\.sql$/,
  /^admin\/progression-review-(client|loader|surface)\.js$/,
  /^admin\/progression-review\.css$/,
  /^backend\/src\/domains\/progression\//,
  /^backend\/src\/security\/progressionRateLimitDispatch(\.test)?\.ts$/,
  /^backend\/supabase\/functions\/admin-api\/progression[A-Za-z0-9.-]*\.ts$/,
  /^backend\/supabase\/migrations\/2026072116(0000|1000|2000|3000)_[A-Za-z0-9_]+\.sql$/,
  /^docs\/workstreams\/progression-preconvergence-v1\.md$/,
  /^scripts\/(admin-progression-contract|progression-(abuse-threshold-simulation|balance-simulation|event-delivery-simulation))\.mjs$/,
];

function isAllowed(path) {
  if (!hasPlayerChanges) return /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path);
  return exactAllowed.has(path) || allowedPatterns.some((pattern) => pattern.test(path));
}

const unexpected = changedFiles.filter((path) => !isAllowed(path));
if (unexpected.length > 0) {
  console.error("Player Terminal verification detected protected repository paths:");
  for (const path of unexpected) console.error(path);
  process.exit(1);
}

console.log(`Player Terminal scope verified for ${changedFiles.length} changed files.`);
