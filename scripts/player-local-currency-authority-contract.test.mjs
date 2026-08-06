import assert from "node:assert/strict";
import fs from "node:fs";

const adminWiring = fs.readFileSync("admin/ledger-adjustment-wiring.js", "utf8");
const adminBackend = fs.readFileSync(
  "backend/supabase/functions/admin-api/playerOperations.ts",
  "utf8",
);
const bankingRepository = fs.readFileSync(
  "backend/src/domains/economy/infrastructure/supabasePlayerBankingPublicRepository.ts",
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
assert.match(adminWiring, /THALORIS:\s*"THD"/);
assert.match(adminWiring, /preferLocalCurrency/);
assert.match(adminWiring, /CHECKING_LEDGER_ACCOUNT_TYPE\s*=\s*"cash"/);
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

assert.match(bankingRepository, /aggregatePublicBalances/);
assert.match(bankingRepository, /current\.balance\s*=\s*roundMoney\(current\.balance \+ balance\)/);
assert.match(bankingRepository, /normalized === "cash" \|\| normalized === "checking"/);

assert.match(checkingMigration, /cash_row\.balance \+ checking_row\.balance/);
assert.match(checkingMigration, /delete from public\.account_balances as checking_row/);
assert.match(checkingMigration, /set account_type = 'cash'/);
assert.match(checkingMigration, /account_balances_checking_alias_forbidden/);
assert.match(checkingMigration, /when 'checking' then 'cash'/);
assert.match(checkingMigration, /when 'savings' then 'savings'/);
assert.match(checkingMigration, /Historical ledger entries are not rewritten/);

assert.match(storePage, /item\.currencyCode/);
assert.match(storePage, /checkingBalanceForCurrency\(data, localCurrencyCode\)/);
assert.match(storePage, /matchingRows\.reduce/);
assert.match(storePage, /GLOBAL SETTLEMENT WALLET/);
assert.match(storePage, /LOCAL AVAILABLE BALANCE/);

console.log("Player local-currency authority contract passed: Admin and Player converge Checking onto one authoritative wallet, Savings remains separate, and ECO remains global.");
