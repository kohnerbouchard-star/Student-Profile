import assert from "node:assert/strict";
import fs from "node:fs";

import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import {
  mergeBankingPages,
  resolveBankingReadFailure,
} from "../src/features/banking/banking-read-flow.js";
import { renderBankingPage } from "../src/pages/banking-page.js";
import { previewData } from "../src/data/preview-data.js";

function formMarkup(source, endpoint) {
  const match = source.match(new RegExp(`<form[^>]*data-endpoint="${endpoint}"[^>]*>[\\s\\S]*?<\\/form>`, "u"));
  assert.ok(match, `Missing ${endpoint} form.`);
  return match[0];
}

function assertSubmitDisabled(source, endpoint, message) {
  assert.match(formMarkup(source, endpoint), /<button[^>]*type="submit"[^>]*disabled/u, message);
}

function assertSubmitEnabled(source, endpoint, message) {
  assert.doesNotMatch(formMarkup(source, endpoint), /<button[^>]*type="submit"[^>]*disabled/u, message);
}

const data = structuredClone(previewData);
data.session.currencyCode = "ECO";
data.capabilities = {
  routes: {},
  actions: {
    bankTransfer: false,
    savingsTransfer: false,
  },
};
data.banking = {
  checking: { accountId: "CHECKING", balance: 1250, available: 1250, pending: 0, currencyCode: "ECO" },
  savings: {
    configured: false,
    accountId: "NOT CONFIGURED",
    balance: null,
    available: null,
    interestRate: null,
    interestEarned: null,
    currencyCode: ""
  },
  balances: [
    { accountType: "checking", balance: 1250, currencyCode: "ECO" },
    { accountType: "checking", balance: 40, currencyCode: "LUM" }
  ],
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
      accountType: "checking",
      currencyCode: "ECO"
    },
    {
      id: "ledger_2",
      description: "Foreign currency adjustment",
      date: "Jul 18, 12:05 PM",
      category: "economy",
      amount: -4,
      status: "Posted",
      accountType: "checking",
      currencyCode: "LUM"
    }
  ]
};

const html = renderBankingPage(data);
assert.ok(html.includes("ECO 1,250"), "The authoritative ECO checking balance must render.");
assert.ok(html.includes("LUM 40"), "Every returned checking currency must render.");
assert.ok(html.includes('data-player-banking-balance="checking:ECO"'));
assert.ok(html.includes('data-player-banking-balance="checking:LUM"'));
assert.ok(html.includes("CHECKING ACCOUNT"));
assert.ok(!html.includes("CASH ACCOUNT"));
assert.ok(!html.includes("Cash ·"));
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
assertSubmitDisabled(html, "bankTransfer", "Player transfers must remain visible but disabled without the authenticated bankTransfer grant.");
assertSubmitDisabled(html, "savingsTransfer", "Internal transfers must remain visible but disabled when savings is not configured.");
assert.ok(html.includes("+ECO 25"));
assert.ok(html.includes("LUM -4"), "Each ledger entry must use its authoritative currency code.");
assert.ok(html.includes("POSTED LEDGER ACTIVITY"));
assert.ok(html.includes("data-player-banking-load-more"), "A real continuation control must render when the Backend returns a next cursor.");

const legacyData = structuredClone(data);
legacyData.banking.checking.accountId = "CASH";
legacyData.banking.balances = [
  { accountType: "cash", balance: 1250, currencyCode: "ECO" },
];
const legacyHtml = renderBankingPage(legacyData);
assert.ok(
  legacyHtml.includes('data-player-banking-balance="checking:ECO"'),
  "Legacy cash rows must be translated to the canonical checking account at the browser boundary.",
);
assert.ok(!legacyHtml.includes('data-player-banking-balance="cash:ECO"'));
assert.ok(!legacyHtml.includes("CASH ACCOUNT"));
assert.ok(legacyHtml.includes("Checking · CHECKING"));
assert.ok(!legacyHtml.includes("Checking · CASH"));

const fallbackData = structuredClone(data);
fallbackData.banking.balances = [];
fallbackData.banking.checking.accountId = "account_public_123";
const fallbackHtml = renderBankingPage(fallbackData);
assert.ok(
  fallbackHtml.includes('data-player-banking-balance="checking:ECO"'),
  "The checking fallback must retain the semantic checking account type when the public account key is non-semantic.",
);
assert.ok(
  !fallbackHtml.includes('data-player-banking-balance="account_public_123:ECO"'),
  "A public account key must not be substituted for the account type used by browser controls and acceptance selectors.",
);
assert.ok(fallbackHtml.includes("Checking · account_public_123"));

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
assert.equal(nextPageRoute.path, "/players/me/ledger?limit=25&cursor=offset_50");
assert.equal(nextPageRoute.path.includes("gameSessionId"), false);
assert.equal(nextPageRoute.path.includes("playerId"), false);

const nextPage = {
  ...data.banking,
  balances: [
    { accountType: "checking", balance: 1275, currencyCode: "ECO" },
    { accountType: "checking", balance: 40, currencyCode: "LUM" }
  ],
  transactions: [
    data.banking.transactions[1],
    {
      id: "ledger_3",
      description: "Store purchase",
      date: "Jul 18, 12:10 PM",
      category: "store",
      amount: -10,
      status: "Posted",
      accountType: "checking",
      currencyCode: "ECO"
    }
  ],
  pagination: { cursor: "offset_2", nextCursor: null, hasMore: false, limit: 2 },
  stale: false
};
const merged = mergeBankingPages(data.banking, nextPage);
assert.deepEqual(merged.transactions.map((entry) => entry.id), ["ledger_1", "ledger_2", "ledger_3"]);
assert.equal(merged.balances[0].balance, 1275, "Later pages must refresh authoritative balances.");
assert.equal(merged.pagination.hasMore, false);
assert.equal(merged.pagination.nextCursor, null);

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
configuredData.banking.balances.push({ accountType: "savings", balance: 200, currencyCode: "LUM" });
configuredData.banking.creditConfigured = true;
configuredData.banking.creditScore = 720;
configuredData.banking.transferLimit = 500;
configuredData.capabilities.actions.bankTransfer = true;
configuredData.capabilities.actions.savingsTransfer = true;
const configuredHtml = renderBankingPage(configuredData);
assert.ok(configuredHtml.includes("CREDIT 720"));
assert.ok(configuredHtml.includes("LUM 200"), "Savings must render with the authoritative account currency.");
assert.ok(configuredHtml.includes('max="500"'));
assert.ok(!configuredHtml.includes("STALE DATA"));
assertSubmitEnabled(configuredHtml, "bankTransfer", "The authenticated bankTransfer grant must enable the Player transfer submit control.");
assertSubmitEnabled(configuredHtml, "savingsTransfer", "The authenticated savingsTransfer grant plus a real savings account must enable internal transfers.");

const blockedBankTransferData = structuredClone(configuredData);
blockedBankTransferData.capabilities.actions.bankTransfer = false;
const blockedBankTransferHtml = renderBankingPage(blockedBankTransferData);
assertSubmitDisabled(blockedBankTransferHtml, "bankTransfer", "Player transfer must fail closed when the authenticated bankTransfer grant is absent.");
assertSubmitEnabled(blockedBankTransferHtml, "savingsTransfer", "Savings transfer remains independently controlled by its own grant and account provisioning.");

const blockedSavingsTransferData = structuredClone(configuredData);
blockedSavingsTransferData.capabilities.actions.savingsTransfer = false;
const blockedSavingsTransferHtml = renderBankingPage(blockedSavingsTransferData);
assertSubmitEnabled(blockedSavingsTransferHtml, "bankTransfer", "Player transfer remains independently controlled by its own grant.");
assertSubmitDisabled(blockedSavingsTransferHtml, "savingsTransfer", "Savings transfer must fail closed when its authenticated grant is absent.");

const emptyData = structuredClone(data);
emptyData.banking.transactions = [];
emptyData.banking.pagination = { cursor: null, nextCursor: null, hasMore: false, limit: 50 };
emptyData.banking.stale = false;
const emptyHtml = renderBankingPage(emptyData);
assert.ok(emptyHtml.includes("No transactions yet"));
assert.ok(emptyHtml.includes("0 transactions"));
assert.ok(emptyHtml.includes("All available activity loaded"));
assert.ok(!emptyHtml.includes("data-player-banking-load-more"));

assert.equal(resolveBankingReadFailure({ status: 429 }), "Banking activity is being requested too quickly. Try again shortly.");
assert.match(resolveBankingReadFailure({ code: "OFFLINE" }), /Loaded transactions remain visible/);

const controllerSource = fs.readFileSync(
  new URL("../src/features/banking/banking-read-flow.js", import.meta.url),
  "utf8"
);
assert.doesNotMatch(controllerSource, /\bfetch\s*\(/);
assert.match(controllerSource, /api\.request\("banking"/);
assert.match(controllerSource, /payload:\s*\{[\s\S]*cursor/);
assert.match(controllerSource, /state\.data\.banking = banking/);

const serialized = JSON.stringify({ data, ledgerRoute, nextPageRoute, merged });
assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized), false);
assert.equal(serialized.includes('"accountType":"cash"'), false);

console.log("Banking read model passed: checking terminology, capability-gated transfers, legacy alias translation, pagination, freshness, empty state, and UUID privacy are valid.");
