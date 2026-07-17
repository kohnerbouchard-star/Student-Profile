import assert from "node:assert/strict";

import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import { renderBankingPage } from "../src/pages/banking-page.js";
import { previewData } from "../src/data/preview-data.js";

const data = structuredClone(previewData);
data.session.currencyCode = "ECO";
data.banking = {
  checking: { accountId: "CASH", balance: 1250, available: 1250, pending: 0 },
  savings: {
    configured: false,
    accountId: "NOT CONFIGURED",
    balance: null,
    available: null,
    interestRate: null,
    interestEarned: null
  },
  creditConfigured: false,
  transfersConfigured: false,
  creditScore: null,
  transferLimit: null,
  transactions: [
    {
      id: "ledger-eco",
      description: "Contract reward",
      date: "Jul 18, 12:00 PM",
      category: "contracts",
      amount: 25,
      status: "Posted",
      accountType: "cash",
      currencyCode: "ECO"
    },
    {
      id: "ledger-lum",
      description: "Foreign currency adjustment",
      date: "Jul 18, 12:05 PM",
      category: "economy",
      amount: -4,
      status: "Posted",
      accountType: "cash",
      currencyCode: "LUM"
    }
  ]
};

const html = renderBankingPage(data);
assert.ok(html.includes("ECO 1,250"), "The authoritative cash balance must render.");
assert.ok(html.includes("NOT CONFIGURED"));
assert.ok(html.includes("CREDIT NOT CONFIGURED"));
assert.ok(html.includes("BACKEND INTEGRATION PENDING"));
assert.ok(html.includes("The current backend has not provisioned a savings account"));
assert.ok(html.includes("Credit and transfer limits are not yet available"));
assert.ok(!html.includes("ECO 0</h3>"), "An absent savings or credit system must not be rendered as a real zero-value account.");
assert.ok(!html.includes('max="null"') && !html.includes('max="NaN"'));
assert.ok(html.includes('name="recipientPlayerIdentifier"'));
assert.ok(!html.includes('name="recipientPlayerUuid"'));
assert.ok(!html.includes('pattern="[A-Za-z]{2}-[0-9]{4}-[0-9]{3}"'));
assert.ok(html.includes("resolved to the recipient UUID by the backend"));
assert.match(html, /data-player-form="bank-transfer"[\s\S]*?<button[^>]*type="submit" disabled>/, "Player transfers must remain visible but disabled until the UUID-authoritative route exists.");
assert.match(html, /data-player-form="savings-transfer"[\s\S]*?<button[^>]*type="submit" disabled>/, "Internal transfers must remain visible but disabled when savings is not configured.");
assert.ok(html.includes("+ECO 25"));
assert.ok(html.includes("LUM -4"), "Each ledger entry must use its authoritative currency code.");
assert.ok(html.includes("POSTED LEDGER ACTIVITY"));

const ledgerRoute = resolvePlayerBackendRequest({
  endpointKey: "banking",
  method: "GET",
  path: "/banking/summary",
  payload: {},
  params: {},
  session: { playerSessionToken: "token-1", gameSessionId: "game-1", playerSessionId: "session-1" }
});
assert.equal(ledgerRoute.method, "GET");
assert.equal(ledgerRoute.path, "/players/me/ledger?limit=50");
assert.equal(ledgerRoute.payload, undefined);

const configuredData = structuredClone(data);
configuredData.banking.savings = {
  configured: true,
  accountId: "SAVINGS",
  balance: 200,
  available: 200,
  interestRate: 1.5,
  interestEarned: 3
};
configuredData.banking.creditConfigured = true;
configuredData.banking.transfersConfigured = true;
configuredData.banking.creditScore = 720;
configuredData.banking.transferLimit = 500;
const configuredHtml = renderBankingPage(configuredData);
assert.ok(configuredHtml.includes("CREDIT 720"));
assert.ok(configuredHtml.includes("ECO 200"));
assert.ok(configuredHtml.includes("1.50% annual yield"));
assert.ok(configuredHtml.includes('max="500"'));
assert.ok(!configuredHtml.match(/data-player-form="bank-transfer"[\s\S]*?<button[^>]*type="submit" disabled>/));

console.log("Banking read model passed: authoritative balances, per-entry currency, capability truthfulness, mutable Player ID lookup, and UUID ownership are valid.");
