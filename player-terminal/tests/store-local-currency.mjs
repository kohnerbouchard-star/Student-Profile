import assert from "node:assert/strict";

import { renderStorePage } from "../src/pages/store-page.js";

const html = renderStorePage({
  session: { currencyCode: "THD" },
  resourceStatus: { banking: { state: "ready" } },
  banking: {
    checking: {
      accountId: "CHECKING",
      balance: 9999,
      available: 9999,
      pending: 0,
      currencyCode: "ECO",
    },
    balances: [
      { accountType: "checking", balance: 700, currencyCode: "ECO" },
      { accountType: "checking", balance: 301, currencyCode: "ECO" },
      { accountType: "checking", balance: 10, currencyCode: "THD" },
      { accountType: "checking", balance: 15, currencyCode: "THD" },
    ],
  },
  store: {
    categories: ["All", "Equipment"],
    items: [{
      id: "item-public-1",
      itemKey: "item-public-1",
      name: "Cross-border scanner",
      description: "A test Store item.",
      category: "Equipment",
      price: 10,
      stock: 5,
      currencyCode: "LUM",
    }],
  },
  inventory: { items: [] },
}, { storeCategory: "All" });

assert.match(html, /LOCAL AVAILABLE BALANCE/);
assert.match(html, /THD 25/);
assert.match(html, /GLOBAL SETTLEMENT WALLET ECO 1,001/);
assert.match(html, /LUM 10/);
assert.match(
  html,
  /same-currency purchase settles/i,
  "Before retail checkout FX is introduced, Store must disclose the same-currency settlement boundary.",
);
assert.doesNotMatch(
  html,
  /AVAILABLE BALANCE[\s\S]{0,300}ECO 1,001<\/strong>/,
  "The Store must not present the global ECO wallet as locally spendable cash.",
);
assert.doesNotMatch(
  html,
  /ECO 9,999/,
  "Structured balance rows must take precedence over the legacy single checking summary.",
);
assert.doesNotMatch(
  html,
  /converts?[^.]{0,160}(?:THD|local wallet)/i,
  "Store must not promise checkout currency conversion before the canonical retail-funding phase is implemented.",
);

console.log("Store local-currency rendering passed: local and global balances remain separate, authored offer currency stays explicit, and no pre-C0 checkout FX is implied.");
