import assert from "node:assert/strict";

import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import { renderBankingPage } from "../src/pages/banking-page.js";
import { previewData } from "../src/data/preview-data.js";

const data = structuredClone(previewData);
data.session.currencyCode = "ECO";
data.banking = {
  checking: { accountId: "CASH", balance: 1250, available: 1250, pending: 0, currencyCode: "ECO" },
  savings: {
    configured: false,
    accountId: "NOT CONFIGURED",
    balance: null,
    available: null,
    interestRate: null,
    interestEarned: null,
    currencyCode: ""
  },
  balances: [{ accountType: "cash", balance: 1250, currencyCode: "ECO" }],
  generatedAt: "2026-07-19T04:00:00.000Z",
  staleAt: "2026-07-19T04:02:00.000Z",
  stale: true,
  pagination: { cursor: null, nextCursor: "offset_2", hasMore: true, limit: 2 },
  creditConfigured: false,
  transfersConfigured: false,
  creditScore: null,
  transferLimit: null,
  transactions: [
    {
      id: "ledger_1",
      description: "Contract reward",
      date: "Jul 18, 12:00 PM",
      category: "contracts",
      amount: 25,
      status: "Posted",
      accountType: "cash",
      currencyCode: "ECO"
    },
    {
      id: "ledger_2",
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
assert.ok(html.includes("ECO 1,250"), "The authoritative cash balance must render in its own currency.");
assert.ok(html.includes("STALE DATA"), "Expired freshness metadata must be visible.");
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

const nextPageRoute = resolvePlayerBackendRequest({
  endpointKey: "banking",
  method: "GET",
  path: "/banking/summary",
  payload: { limit: 25, cursor: "offset_50" },
  params: {},
  session: { playerSessionToken: "token-1" }
});
assert.equal(nextPageRoute.path, "/players/me/ledger?cursor=offset_50&limit=25");
assert.equal(nextPageRoute.path.includes("gameSessionId"), false);
assert.equal(nextPageRoute.path.includes("playerId"), false);

const configuredData = structuredClone(data);
configuredData.banking.stale = false;
configuredData.banking.savings = {
  configured: true,
  accountId: "SAVINGS",
  balance: 200,
  available: 200,
  interestRate: 1.5,
  interestEarned: 3,
  currencyCode: "LUM"
};
configuredData.banking.creditConfigured = true;
configuredData.banking.transfersConfigured = true;
configuredData.banking.creditScore = 720;
configuredData.banking.transferLimit = 500;
const configuredHtml = renderBankingPage(configuredData);
assert.ok(configuredHtml.includes("CREDIT 720"));
assert.ok(configuredHtml.includes("LUM 200"), "Savings must render with the authoritative account currency.");
assert.ok(configuredHtml.includes("1.50% annual yield"));
assert.ok(configuredHtml.includes('max="500"'));
assert.ok(!configuredHtml.includes("STALE DATA"));
assert.ok(!configuredHtml.match(/data-player-form="bank-transfer"[\s\S]*?<button[^>]*type="submit" disabled>/));

const emptyData = structuredClone(data);
emptyData.banking.transactions = [];
emptyData.banking.pagination = { cursor: null, nextCursor: null, hasMore: false, limit: 50 };
emptyData.banking.stale = false;
const emptyHtml = renderBankingPage(emptyData);
assert.ok(emptyHtml.includes("No transactions yet"));
assert.ok(emptyHtml.includes("0 transactions"));

const serialized = JSON.stringify({ data, ledgerRoute, nextPageRoute });
assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized), false);

console.log("Banking read model passed: public pagination, freshness, empty state, cross-currency display, and UUID privacy are valid.");
