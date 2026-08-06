import assert from "node:assert/strict";
import fs from "node:fs";

const adminWiring = fs.readFileSync("admin/ledger-adjustment-wiring.js", "utf8");
const adminBackend = fs.readFileSync(
  "backend/supabase/functions/admin-api/playerOperations.ts",
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

assert.match(currencyAdr, /ECO is the global settlement and comparison unit/);
assert.match(currencyAdr, /national currencies remain the official local currencies/);
assert.match(currencyAdr, /There is no silent 1:1 fallback/);

assert.match(adminWiring, /currencyMode:\s*currency\.currencyMode/);
assert.match(adminWiring, /player_country/);
assert.match(adminWiring, /global_eco/);
assert.match(adminWiring, /THALORIS:\s*"THD"/);
assert.match(adminWiring, /preferLocalCurrency/);
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

assert.match(storePage, /item\.currencyCode/);
assert.match(storePage, /checkingBalanceForCurrency\(data, localCurrencyCode\)/);
assert.match(storePage, /GLOBAL SETTLEMENT WALLET/);
assert.match(storePage, /LOCAL AVAILABLE BALANCE/);

console.log("Player local-currency authority contract passed: ECO remains global, local funding is server-derived, and Store affordability uses the local wallet.");
