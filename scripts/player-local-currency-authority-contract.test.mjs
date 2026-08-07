import assert from "node:assert/strict";
import fs from "node:fs";

const adminWiring = fs.readFileSync("admin/ledger-adjustment-wiring.js", "utf8");
const adminBackend = fs.readFileSync(
  "backend/supabase/functions/admin-api/playerOperations.ts",
  "utf8",
);
const adminIdempotentLedger = fs.readFileSync(
  "backend/supabase/functions/admin-api/idempotentLedgerOperations.ts",
  "utf8",
);
const bankingRepository = fs.readFileSync(
  "backend/src/domains/economy/infrastructure/supabasePlayerBankingPublicRepository.ts",
  "utf8",
);
const checkingMigration = fs.readFileSync(
  "backend/supabase/migrations/20260807012748_canonicalize_player_checking_wallet_v1.sql",
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
assert.match(adminWiring, /THALORIS:\s*"THD"/);
assert.match(adminWiring, /preferLocalCurrency/);
assert.match(adminWiring, /CHECKING_LEDGER_ACCOUNT_TYPE\s*=\s*"checking"/);
assert.match(adminWiring, /accountType:\s*CHECKING_LEDGER_ACCOUNT_TYPE/);
assert.match(adminWiring, /matchingRows\.reduce/);
assert.doesNotMatch(adminWiring, /accountType:\s*"checking"/);
assert.doesNotMatch(
  adminWiring,
  /function playerLocalCurrencyCode[\s\S]*?return "ECO";/,
  "Local-currency resolution must not silently fall back to ECO.",
);

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

assert.match(bankingRepository, /aggregatePublicBalances/);
assert.match(bankingRepository, /current\.balance\s*=\s*roundMoney\(current\.balance \+ balance\)/);
assert.match(bankingRepository, /normalized === "checking"/);

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
assert.match(storePage, /checkingBalanceForCurrency\(data, localCurrencyCode\)/);
assert.match(storePage, /matchingRows\.reduce/);
assert.match(storePage, /GLOBAL SETTLEMENT WALLET/);
assert.match(storePage, /LOCAL AVAILABLE BALANCE/);

console.log("Player local-currency authority contract passed: Admin and Player converge Checking onto one authoritative wallet, Savings remains separate, and ECO remains global.");
