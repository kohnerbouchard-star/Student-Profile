import assert from "node:assert/strict";
import fs from "node:fs";

const adminWiring = fs.readFileSync("admin/ledger-adjustment-wiring.js", "utf8");
const adminWriteLifecycle = fs.readFileSync(
  "admin/classroom-write-fallback.js",
  "utf8",
);
const adminCreateAdapter = fs.readFileSync(
  "admin/create-action-adapter.js",
  "utf8",
);
const adminPlayerIdentity = fs.readFileSync(
  "admin/player-identity-wiring.js",
  "utf8",
);
const adminContractMutation = fs.readFileSync(
  "backend/src/domains/contracts/application/adminContractMutation.ts",
  "utf8",
);
const adminBackend = fs.readFileSync(
  "backend/supabase/functions/admin-api/playerOperations.ts",
  "utf8",
);
const adminIdempotentLedger = fs.readFileSync(
  "backend/supabase/functions/admin-api/idempotentLedgerOperations.ts",
  "utf8",
);
const adminAttendanceOperations = fs.readFileSync(
  "backend/supabase/functions/admin-api/attendanceOperations.ts",
  "utf8",
);
const adminReadExtensions = fs.readFileSync(
  "backend/supabase/functions/admin-api/readExtensions.ts",
  "utf8",
);
const adminGameRoutes = fs.readFileSync(
  "backend/supabase/functions/admin-api/gameRoutes.ts",
  "utf8",
);
const playerDashboardRepository = fs.readFileSync(
  "backend/src/domains/game-dashboard/infrastructure/supabasePlayerGameDashboardRepository.ts",
  "utf8",
);
const playerDashboardContracts = fs.readFileSync(
  "backend/src/domains/game-dashboard/contracts/playerGameDashboardContracts.ts",
  "utf8",
);
const staffLedgerHandler = fs.readFileSync(
  "backend/src/domains/economy/api/staffLedgerAdjustmentHttpHandler.ts",
  "utf8",
);
const bankingRepository = fs.readFileSync(
  "backend/src/domains/economy/infrastructure/supabasePlayerBankingPublicRepository.ts",
  "utf8",
);
const playerApiIntegration = fs.readFileSync(
  "player-terminal/src/integrations/student-profile-api-call.js",
  "utf8",
);
const checkingMigration = fs.readFileSync(
  "backend/supabase/migrations/20260806070000_canonicalize_player_checking_wallet_v1.sql",
  "utf8",
);
const storePage = fs.readFileSync(
  "player-terminal/src/pages/store-page.js",
  "utf8",
);
const currencyAdr = fs.readFileSync(
  "docs/seed-content/decisions/adr-001-currency-and-settlement-architecture.md",
  "utf8",
);

assert.match(currencyAdr, /`ECO` is the global settlement and comparison unit/);
assert.match(currencyAdr, /national currencies remain the official local currencies/);
assert.match(currencyAdr, /There is no silent 1:1 fallback/);

assert.match(adminWiring, /currencyMode:\s*currency\.currencyMode/);
assert.match(adminWiring, /player_country/);
assert.match(adminWiring, /global_eco/);
assert.match(adminWiring, /player\.countryCurrencyCode/);
assert.match(adminWiring, /record\(player\.country\)\.currencyCode/);
assert.match(adminWiring, /preferLocalCurrency/);
assert.match(adminWiring, /CHECKING_LEDGER_ACCOUNT_TYPE\s*=\s*"checking"/);
assert.match(adminWiring, /accountType:\s*CHECKING_LEDGER_ACCOUNT_TYPE/);
assert.match(adminWiring, /matchingRows\.reduce/);
assert.doesNotMatch(adminWiring, /COUNTRY_CURRENCY_BY_CODE/);
assert.doesNotMatch(
  adminWiring,
  /function playerLocalCurrencyCode[\s\S]*?return "ECO";/,
  "Local-currency resolution must not silently fall back to ECO.",
);

assert.match(adminWriteLifecycle, /const explicitCurrencyCode = text\(/);
assert.match(adminWriteLifecycle, /delete normalized\.currencyCode/);
assert.match(adminWriteLifecycle, /delete normalized\.currency/);
assert.doesNotMatch(
  adminWriteLifecycle,
  /normalized\.currencyCode\s*=\s*\([\s\S]{0,180}\|\|\s*"ECO"/,
  "The shared Admin write wrapper must not invent ECO for a missing ledger currency.",
);

assert.match(adminCreateAdapter, /const explicitAllPlayers = locations\.includes\("all"\)/);
assert.match(adminCreateAdapter, /if \(!explicitAllPlayers && normalizedLocations\.length === 0\)/);
assert.match(adminCreateAdapter, /Choose All players or at least one contract target/);
assert.doesNotMatch(
  adminCreateAdapter,
  /normalizedLocations\.length === 0\s*\?\s*\{ allPlayers: true \}/,
  "Missing Admin Contract targeting must never broaden to All players.",
);
assert.match(adminContractMutation, /function validateAdminContractTargeting\(/);
assert.match(adminContractMutation, /contract_targeting_ambiguous/);
assert.match(adminContractMutation, /Public contracts require an explicit All players target/);
assert.match(adminContractMutation, /Targeted contracts require at least one explicit country, player, roster, or story target/);

assert.match(adminPlayerIdentity, /const playerCacheByGame = new Map\(\)/);
assert.doesNotMatch(adminPlayerIdentity, /const playerCache = new Map\(\)/);
const modalPlayerIdSource = adminPlayerIdentity.match(
  /function modalPlayerId\(modal\) \{[\s\S]*?\n  \}/,
)?.[0] ?? "";
assert.ok(modalPlayerIdSource, "Expected modalPlayerId identity authority.");
assert.ok(
  modalPlayerIdSource.indexOf("modal?.querySelector") >= 0 &&
    modalPlayerIdSource.indexOf("modal?.querySelector") <
      modalPlayerIdSource.indexOf("return text(selectedPlayerId)"),
  "The Player Settings modal identity must outrank stale global selection state.",
);
assert.match(adminPlayerIdentity, /modalId !== playerId/);
assert.match(adminPlayerIdentity, /if \(gameId !== currentGameId\(\)\) return;/);

assert.match(adminBackend, /resolvePlayerLedgerCurrencyAuthority/);
assert.match(adminBackend, /from\("player_country_assignments"\)/);
assert.match(adminBackend, /from\("country_profiles"\)/);
assert.match(adminBackend, /ledger_currency_mismatch/);
assert.match(adminBackend, /player_country_currency_unavailable/);
assert.match(adminBackend, /p_currency_code:\s*currency\.currencyCode/);
assert.doesNotMatch(
  adminBackend,
  /p_currency_code:\s*text\([\s\S]{0,100}"ECO"\)/,
  "The Admin backend must not default an unspecified ledger adjustment to ECO.",
);

for (const source of [adminIdempotentLedger, adminAttendanceOperations]) {
  assert.match(
    source,
    /resolvePlayerLedgerCurrencyAuthority\(service, \{[\s\S]*?gameSessionId: input\.gameSessionId,[\s\S]*?playerId,[\s\S]*?body,/,
    "Attendance and Player ledger mutations must reuse the database-backed currency authority.",
  );
  assert.match(source, /currencyCode:\s*currency\.currencyCode|p_currency_code:\s*currency\.currencyCode/);
  assert.doesNotMatch(
    source,
    /text\(body\.currencyCode \|\| body\.currency, "ECO"\)/,
    "Attendance reward mutations must not silently default to ECO.",
  );
}
assert.match(
  adminIdempotentLedger,
  /import \{ resolvePlayerLedgerCurrencyAuthority \} from "\.\/playerOperations\.ts"/,
  "The idempotent Admin ledger route must reuse the database-backed currency authority.",
);
assert.match(
  adminIdempotentLedger,
  /normalized === "checking" \|\| normalized === "cash" \? "checking" : normalized/,
  "Admin idempotent ledger routes must persist Checking directly.",
);
assert.doesNotMatch(
  adminIdempotentLedger,
  /normalized === "checking" \|\| normalized === "cash" \? "cash" : normalized/,
  "Admin idempotent ledger routes must not remap Checking back to legacy cash.",
);

assert.match(adminReadExtensions, /amountsByCurrency/);
assert.match(adminReadExtensions, /multi_currency_unconverted/);
assert.match(adminReadExtensions, /rewardAmount:\s*singleAmount/);
assert.match(adminReadExtensions, /rewardCurrencyCode:\s*singleCurrency/);
assert.doesNotMatch(
  adminReadExtensions,
  /rewardCurrencyCode:\s*reward\?\.currency_code \|\| player\?\.currencyCode \|\| "ECO"/,
  "Attendance history must not label a mixed or missing reward total with an inferred currency.",
);
assert.match(
  adminReadExtensions,
  /service\.from\("country_profiles"\)\s*\.select\("id,currency_code,status"\)\s*\.eq\("status", "active"\)/,
  "Admin valuation must read the global country_profiles authority without a game-session predicate.",
);
const countryProfileQuery = adminReadExtensions.match(
  /service\.from\("country_profiles"\)[\s\S]*?(?=service\.from\("store_items"\))/,
)?.[0] ?? "";
assert.ok(countryProfileQuery, "Expected the Admin country-profile valuation query.");
assert.doesNotMatch(
  countryProfileQuery,
  /\.eq\("game_session_id", gameId\)/,
  "country_profiles is global and must never be filtered by a nonexistent game_session_id column.",
);
assert.match(
  adminReadExtensions,
  /const stockMarketValue = valuationCurrencyCode === "ECO"[\s\S]*?\? rawStockMarketValue[\s\S]*?: 0;/,
  "Admin local-currency net worth must not add ECO stock value without conversion.",
);
assert.match(adminReadExtensions, /excludedStockMarketValue/);
assert.match(adminReadExtensions, /partial_unconverted/);
assert.match(
  adminGameRoutes,
  /function currencyScopedLeaderboard\(players: any\[\]\)/,
  "Admin dashboard rankings must be built by comparable valuation currency.",
);
assert.match(adminGameRoutes, /const rankByCurrency = new Map<string, number>\(\)/);
assert.match(adminGameRoutes, /leaderboardRankScope: "currency"/);
assert.match(adminGameRoutes, /leaderboardComparison: "same_currency_only"/);
assert.doesNotMatch(
  adminGameRoutes,
  /\[\.\.\.players\]\.sort\(\(a, b\) => number\(b\.netWorth\) - number\(a\.netWorth\)\)/,
  "Admin dashboard must not globally rank unlike currencies by raw numeric net worth.",
);

assert.match(
  playerDashboardRepository,
  /const stockCash = toCashDto\(meCheckingBalances, "ECO"\)/,
  "Stock portfolio cash must remain in ECO rather than borrowing the player's local wallet total.",
);
assert.match(
  playerDashboardRepository,
  /const portfolio = summarizePortfolio\(stockCash, meHoldings\)/,
);
assert.match(
  playerDashboardRepository,
  /const excludedStockMarketValue = valuationCurrencyCode === "ECO"[\s\S]*?: portfolio\.holdingsMarketValue/,
  "Player net worth must mark unconverted ECO holdings as excluded from local-currency valuation.",
);
assert.match(playerDashboardRepository, /rankScope: "currency" as const/);
assert.match(
  playerDashboardRepository,
  /const rankByCurrency = new Map<string, number>\(\)/,
  "Leaderboard ranks must be scoped within a comparable currency instead of comparing unlike currencies.",
);
assert.match(playerDashboardContracts, /rankScope\?: "currency"/);
assert.match(playerDashboardContracts, /excludedStockMarketValue: number/);

assert.match(
  staffLedgerHandler,
  /normalized === "checking" \|\| normalized === "cash"\) return "checking"/,
  "The staff ledger endpoint must persist Checking instead of legacy cash.",
);
assert.match(staffLedgerHandler, /ledger_currency_required/);
assert.doesNotMatch(
  staffLedgerHandler,
  /parseOptionalText\(value\.currencyCode\) \?\? "ECO"/,
  "The generic staff ledger mutation must not invent ECO when currency is omitted.",
);

assert.match(bankingRepository, /list_player_bank_accounts_v1/);
assert.match(bankingRepository, /parsePlayerBankAccounts/);
assert.match(bankingRepository, /postedAmount/);
assert.match(bankingRepository, /heldAmount/);
assert.match(bankingRepository, /availableAmount/);
assert.match(bankingRepository, /normalized === "checking"/);
assert.doesNotMatch(
  bankingRepository,
  /aggregatePublicBalances/,
  "Canonical Banking reads must not merge unlike account rows in the browser-facing repository.",
);

assert.match(playerApiIntegration, /function explicitSessionCurrency\(/);
assert.match(playerApiIntegration, /function dashboardCurrency\(/);
assert.match(playerApiIntegration, /function accountBalanceForCurrency\(/);
assert.match(playerApiIntegration, /return rows\.length === 1 \? rows\[0\] : null/);
assert.match(playerApiIntegration, /function bindBankingCurrency\(/);
assert.match(playerApiIntegration, /currencyResolved: Boolean\(resolved\)/);
assert.match(playerApiIntegration, /snapshot = bindSessionCurrency\(snapshot, dashboardCurrency\(raw\)\)/);
assert.match(playerApiIntegration, /snapshot = bindBankingCurrency\(snapshot, raw\)/);

assert.match(checkingMigration, /checking_row\.balance \+ cash_row\.balance/);
assert.match(checkingMigration, /delete from public\.account_balances as cash_row/);
assert.match(checkingMigration, /set account_type = 'checking'/);
assert.match(checkingMigration, /update public\.banking_transfer_requests/);
assert.doesNotMatch(
  checkingMigration,
  /update public\.player_transfers/,
  "The Checking migration must target the canonical banking_transfer_requests table.",
);
assert.match(checkingMigration, /account_balances_cash_alias_forbidden/);
assert.match(checkingMigration, /when 'cash' then 'checking'/);
assert.match(checkingMigration, /when 'savings' then 'savings'/);
assert.match(checkingMigration, /Historical monetary values are preserved/);
assert.match(checkingMigration, /with function_source as materialized/);
assert.match(checkingMigration, /p\.prokind in \('f', 'p'\)/);
assert.match(
  checkingMigration,
  /p\.proname <> 'record_player_ledger_entry'/,
  "The bulk function rewrite must preserve record_player_ledger_entry's cash compatibility mapper.",
);
assert.doesNotMatch(
  checkingMigration,
  /where n\.nspname = 'public'\s+and pg_get_functiondef\(p\.oid\)/,
  "The migration must filter callable routines before invoking pg_get_functiondef.",
);

assert.match(storePage, /item\.currencyCode/);
assert.match(storePage, /storeCheckingAccounts\(data\)/);
assert.match(storePage, /storeFundingAvailability\(data, currencyCode\)\.ready/);
assert.match(storePage, /one to three canonical Checking accounts/);
assert.match(storePage, /Retail FX is disclosed before confirmation/);
assert.match(storePage, /offerCurrencies\.size > 1/);
assert.match(storePage, /compare offers/);
assert.doesNotMatch(storePage, /checkingBalanceForCurrency/);
assert.doesNotMatch(storePage, /matchingRows\.reduce/);
assert.doesNotMatch(
  storePage,
  /GLOBAL SETTLEMENT WALLET|LOCAL AVAILABLE BALANCE|LOCAL WALLET|same-currency purchase|THD 25/i,
  "Store checkout must not reintroduce the retired single-currency wallet boundary.",
);

console.log("Player local-currency authority contract passed: economic currency, Contract targeting, and canonical account identity all fail closed instead of inferring domain state from defaults, list order, or stale UI selection.");
