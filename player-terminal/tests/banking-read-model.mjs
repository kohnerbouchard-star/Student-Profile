import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { captureLoanTotalsSummary } from "../tools/loan-totals-diagnostic.mjs";

import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import {
  mergeBankingPages,
  resolveBankingReadFailure,
} from "../src/features/banking/banking-read-flow.js";
import { renderBankingPage } from "../src/pages/banking-page.js";
import { previewData } from "../src/data/preview-data.js";
import { renderLoansPage } from "../src/pages/loans-page.js";
import { renderRouteSkeleton } from "../src/components/route-skeletons.js";

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
  { accountType: "checking", balance: 1250, currencyCode: "ECO" },
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

test("Loans diagnostic preserves allowed labels, states and exact monetary formatting", () => {
  const lines = ["\tOUTSTANDING\u00a0", "\u00a0ELD\u00a0500.00\u00a0", "Available CREDIT", "DRV 1,234.56",
    "Next payment", "ELD 1.234,56", "On-time RATE", "Currency unavailable", "None scheduled", "Unavailable",
    "ELD Unavailable", "No currency obligations or offers", "Currency totals incomplete", "Currency totals unavailable"];
  const summary = lines.join("\n");
  const capture = captureLoanTotalsSummary(summary, new Set(["ELD", "DRV"]));
  assert.deepEqual(capture.lines, lines.map((text, lineIndex) => ({ lineIndex, text })));
  assert.equal(capture.originalUtf8Bytes, Buffer.byteLength(summary, "utf8"));
  assert.equal(capture.originalLineCount, lines.length);
  assert.equal(capture.maskedLineCount, 0);
  assert.equal(capture.omittedLineCount, 0);
  assert.equal(capture.truncated, false);
});

test("Loans diagnostic masks whole unknown lines, identifiers, credentials and free text", () => {
  const lines = ["Authorization: Bearer synthetic-token", "Student Example", "student@example.test",
    "123e4567-e89b-42d3-a456-426614174000", "BROWSER-SYNTHETIC-PLAYER", "2026-11-01",
    "ELD 500.00 private note", "Outstanding: Student Example", "ELD 2026-11-01", "\u001b[31mOutstanding",
    "eyJsynthetic.eyJsynthetic.synthetic", "Cookie: private=value", "USD 500.00", "Active obligations"];
  const capture = captureLoanTotalsSummary(lines.join("\n"), new Set(["ELD"]));
  assert.deepEqual(capture.lines, lines.map((_, lineIndex) => ({ lineIndex, text: "[masked]" })));
  assert.equal(capture.maskedLineCount, lines.length);
  for (const line of lines) assert.equal(JSON.stringify(capture).includes(line), false);
});

test("Loans diagnostic admits only validated currencies without correcting numeric punctuation", () => {
  const lines = ["ELD500.00", "ELD\t500.00", "ELD 5 000,00", "ELD -500.00", "ELD +500.00",
    "DRV 500.00", "ELD 500.00 token", "ELD 500.00?key=private"];
  const capture = captureLoanTotalsSummary(lines.join("\n"), new Set(["ELD"]));
  assert.deepEqual(capture.lines, lines.map((text, lineIndex) => ({ lineIndex, text: lineIndex < 5 ? text : "[masked]" })));
  assert.equal(capture.maskedLineCount, 3);
});

test("Loans diagnostic preserves original currency case after case-insensitive validation", () => {
  const lines = ["eld 500.00", "\tElD\u00a0500.00\u00a0", "drv 500.00", "eld 500.00 private note"];
  const capture = captureLoanTotalsSummary(lines.join("\n"), new Set(["ELD"]));
  assert.deepEqual(capture.lines, lines.map((text, lineIndex) => ({ lineIndex, text: lineIndex < 2 ? text : "[masked]" })));
  assert.equal(capture.maskedLineCount, 2);
});

test("Loans diagnostic preserves amount-first formatting without admitting unknown currencies or text", () => {
  const lines = ["500.00 ELD", "500,00\u00a0eld", "1,234.56ELD", "500.00 USD", "500.00 ELD private", "2026-11-01 ELD"];
  const capture = captureLoanTotalsSummary(lines.join("\n"), new Set(["ELD"]));
  assert.deepEqual(capture.lines, lines.map((text, lineIndex) => ({ lineIndex, text: lineIndex < 3 ? text : "[masked]" })));
  assert.equal(capture.maskedLineCount, 3);
});

test("Loans diagnostic retains Unicode whitespace and whole CRLF lines as data", () => {
  const lines = ["oUtStAnDiNg\r", "\u00a0ELD\u202f500,00\u00a0\r", "ELD 500.00"];
  const capture = captureLoanTotalsSummary(lines.join("\n"), new Set(["ELD"]));
  assert.deepEqual(capture.lines, lines.map((text, lineIndex) => ({ lineIndex, text })));
  assert.equal(JSON.parse(JSON.stringify(capture)).lines[1].text, lines[1]);
});

test("Loans diagnostic caps inspected lines and serialized bytes with accurate omission counts", () => {
  const summary = Array.from({ length: 10000 }, () => "private free text").join("\n");
  const capture = captureLoanTotalsSummary(summary, new Set(["ELD"]));
  assert.equal(capture.originalLineCount, 10000);
  assert.equal(capture.originalUtf8Bytes, Buffer.byteLength(summary, "utf8"));
  assert.equal(capture.inspectedLineCount, 64);
  assert.equal(capture.maskedLineCount, 64);
  assert.equal(capture.omittedLineCount, 10000 - capture.lines.length);
  assert.equal(capture.truncated, true);
  assert.ok(capture.lines.every(({ lineIndex, text }) => lineIndex < 64 && text === "[masked]"));
  assert.ok(Buffer.byteLength(JSON.stringify(capture), "utf8") <= 2048);
});

test("Loans diagnostic omits over-budget whole Unicode lines rather than splitting them", () => {
  const summary = `${"\u00a0".repeat(1000)}ELD 500.00\nELD 500.00`;
  const capture = captureLoanTotalsSummary(summary, new Set(["ELD"]));
  assert.deepEqual(capture.lines, [{ lineIndex: 1, text: "ELD 500.00" }]);
  assert.equal(capture.omittedLineCount, 1);
  assert.equal(capture.truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(capture), "utf8") <= 2048);
  const oversized = captureLoanTotalsSummary(`${"secret".repeat(1000)}\nOutstanding`, new Set());
  assert.deepEqual(oversized.lines, [{ lineIndex: 1, text: "Outstanding" }]);
  assert.equal(oversized.omittedLineCount, 1);
  assert.equal(oversized.truncated, true);
});

test("Loans diagnostic handles empty and control-only lines without disclosing them", () => {
  for (const summary of ["", "\u0000", "\u001b[31m", "Outstanding\u0000", "ELD 500.00\u0000"]) {
    const capture = captureLoanTotalsSummary(summary, new Set(["ELD"]));
    assert.deepEqual(capture.lines, [{ lineIndex: 0, text: "[masked]" }]);
    assert.equal(capture.originalLineCount, 1);
    assert.equal(capture.maskedLineCount, 1);
    assert.equal(capture.truncated, false);
  }
});

test("Loans diagnostic preserves the original comparison, throw, single summary read and final guard", () => {
  const runner = fs.readFileSync(new URL("../tools/connected-banking-loans-mutation-runner.mjs", import.meta.url), "utf8");
  for (const original of [
    '  const summary = await page.locator(".player-terminal-loan-metrics").innerText();',
    '    if (!summary.includes(expected)) {',
    '      throw new Error("Connected Loans did not render authoritative exact totals.");',
    '        evidence.loanTotalsDiagnostic = Buffer.byteLength(JSON.stringify(diagnostic), "utf8") <= 8192 ? diagnostic : { truncated: true };',
  ]) assert.equal(runner.split(original).length - 1, 1);
  assert.ok(runner.includes('expected: code(group.currencyCode) && money(group.outstanding) ? expected : null'));
  assert.ok(runner.includes('renderedSummary: captureLoanTotalsSummary(summary, currencies)'));
  assert.ok(runner.includes('code(row.currencyCode) && money(row.outstanding) ? [row.currencyCode] : []'));
});

function loansReloadFixture(source = fs.readFileSync(new URL("../tools/connected-banking-loans-mutation-runner.mjs", import.meta.url), "utf8")) {
  const reloadSource = source.slice(source.indexOf("async function openRoute("), source.indexOf("async function openDisclosureForm("));
  const comparison = source.slice(source.indexOf("  const projection = (loanPayload.data || loanPayload).currencyProjection;"), source.indexOf("  const repayForm = "));
  const location = { hash: "#loans" }, frame = {}, foreignFrame = {};
  const state = { phase: "loading", payloadRead: false, summaryReads: 0, waitTimeout: null, summary: "SYN 500.00", responseArmedAfterNavigation: false };
  let navigate, settle, expire, navigated = false;
  const loaded = structuredClone(previewData);
  loaded.loans.currencyProjection = { version: 1, complete: true, groups: [{ currencyCode: "SYN", availableCredit: "2000.00", outstanding: "500.00", nextPayment: null }] };
  const markup = () => state.phase === "loading" ? renderRouteSkeleton("loans") : state.phase === "error"
    ? '<section class="player-terminal-page player-terminal-route-error">Unavailable</section>' : renderLoansPage(loaded, {});
  const visible = (selector) => {
    const tag = markup().match(/<section class="[^"]*\bplayer-terminal-loans-page\b[^"]*"[^>]*>/u)?.[0];
    return Boolean(tag) && (!selector.includes(':not([data-skeleton-route="loans"])') || !tag.includes('data-skeleton-route="loans"'));
  };
  const payload = { document: "current", data: { currencyProjection: loaded.loans.currencyProjection } };
  const page = {
    mainFrame: () => frame,
    waitForEvent: (name, options) => {
      assert.equal(name, "framenavigated"); assert.equal(options.predicate(foreignFrame), false); assert.equal(options.predicate(frame), true);
      return new Promise((resolve) => { navigate = resolve; });
    },
    waitForResponse: (predicate) => {
      assert.equal(navigated, true, "The old document must not arm the response observer."); state.responseArmedAfterNavigation = true;
      assert.equal(predicate({ request: () => ({ method: () => "POST" }), url: () => "http://fixture/banking/loans" }), false);
      assert.equal(predicate({ request: () => ({ method: () => "GET" }), url: () => "http://fixture/other" }), false);
      assert.equal(predicate({ request: () => ({ method: () => "GET" }), url: () => "http://fixture/banking/loans" }), true);
      return Promise.resolve({ json: async () => { state.payloadRead = true; return payload; } });
    },
    reload: async (options) => {
      assert.deepEqual(options, { waitUntil: "domcontentloaded", timeout: 120_000 });
      assert.equal(state.responseArmedAfterNavigation, false); // Old-document response precedes the main-frame navigation.
      navigated = true; navigate(frame);
    },
    waitForFunction: async (predicate, route, options) => { assert.equal(route, "loans"); assert.equal(predicate(route), true); assert.deepEqual(options, { timeout: 30_000 }); },
    locator: (selector) => {
      if (selector === '[data-route="loans"]:visible') return { first: () => ({ waitFor: async (options) => assert.deepEqual(options, { state: "visible", timeout: 30_000 }), click: async () => { location.hash = "#loans"; } }) };
      if (selector === ".player-terminal-app-root") return { waitFor: async (options) => assert.deepEqual(options, { state: "visible", timeout: 120_000 }) };
      if (selector === ".player-terminal-loan-metrics") return { innerText: async () => { state.summaryReads += 1; return state.phase === "loaded" ? state.summary : ""; } };
      assert.match(selector, /^\.player-terminal-loans-page/u);
      return { waitFor: (options) => {
        assert.deepEqual(options, { state: "visible", timeout: 60_000 }); state.waitTimeout = options.timeout;
        if (visible(selector)) return Promise.resolve();
        return new Promise((resolve, reject) => { settle = () => { if (visible(selector)) resolve(); }; expire = () => reject(new Error("Loaded Loans page wait timed out")); });
      } };
    },
    evaluate: async () => ({ loansRoute: true, pageVisible: state.phase === "loaded", metricsVisible: state.phase === "loaded", skeleton: state.phase === "loading", routeError: state.phase === "error", busy: state.phase === "loading" }),
  };
  const reload = new Function("location", `${reloadSource}; return reloadLoansSnapshot;`)(location);
  const compare = new Function("page", "loanPayload", "captureLoanTotalsSummary", "evidence", "payloadObservedAt", `return (async () => { ${comparison} })();`);
  return { state, markup, start: () => reload(page), commit: (phase) => { state.phase = phase; settle?.(); }, expire: () => expire?.(), compare: (value, evidence = {}) => compare(page, value, captureLoanTotalsSummary, evidence, 0) };
}

test("The prior Loans selector reproduces empty skeleton sampling in the same fixture", async () => {
  const current = fs.readFileSync(new URL("../tools/connected-banking-loans-mutation-runner.mjs", import.meta.url), "utf8");
  const prior = current.replace(`'.player-terminal-loans-page:not([data-skeleton-route="loans"])'`, '".player-terminal-loans-page"');
  assert.notEqual(prior, current);
  const fixture = loansReloadFixture(prior), evidence = {};
  const payload = await fixture.start(); assert.equal(fixture.state.phase, "loading");
  await assert.rejects(fixture.compare(payload, evidence), { message: "Connected Loans did not render authoritative exact totals." });
  assert.equal(evidence.loanTotalsDiagnostic.renderedSummary.originalUtf8Bytes, 0);
  assert.equal(evidence.loanTotalsDiagnostic.readiness.skeleton, true);
});

test("Loans snapshot consumes the new payload while waiting for delayed loaded rendering", async () => {
  const fixture = loansReloadFixture();
  assert.match(fixture.markup(), /class="[^"]*player-terminal-loans-page[^"]*player-terminal-route-skeleton/u);
  assert.match(fixture.markup(), /class="player-terminal-loan-metrics"/u);
  let completed = false;
  const snapshot = fixture.start().then((value) => { completed = true; return value; });
  await new Promise(setImmediate);
  assert.equal(fixture.state.payloadRead, true); assert.equal(fixture.state.responseArmedAfterNavigation, true);
  assert.equal(completed, false, "Visible skeletons cannot satisfy loaded-page readiness.");
  assert.equal(fixture.state.summaryReads, 0); assert.equal(fixture.state.waitTimeout, 60_000);
  fixture.commit("loaded");
  const payload = await snapshot; assert.equal(payload.document, "current");
  await fixture.compare(payload); assert.equal(fixture.state.summaryReads, 1);
});

test("Loans snapshots fail at the existing deadline for permanent loading and route errors", async () => {
  for (const phase of ["loading", "error"]) {
    const fixture = loansReloadFixture(); let completed = false;
    const snapshot = fixture.start().then((value) => { completed = true; return value; });
    await new Promise(setImmediate); fixture.commit(phase);
    assert.equal(completed, false); assert.equal(fixture.state.summaryReads, 0); assert.equal(fixture.state.waitTimeout, 60_000);
    const rejection = assert.rejects(snapshot, /Loaded Loans page wait timed out/u); fixture.expire(); await rejection;
  }
});

test("Loaded Loans pages still reject incorrect totals with the original exact assertion", async () => {
  for (const summary of ["SYN 499.99", "SYN 500.0", "SYN\u00a0500.00", ""]) {
    const fixture = loansReloadFixture(), evidence = {};
    const snapshot = fixture.start(); await new Promise(setImmediate); fixture.state.summary = summary; fixture.commit("loaded");
    await assert.rejects(fixture.compare(await snapshot, evidence), { message: "Connected Loans did not render authoritative exact totals." });
    assert.equal(fixture.state.summaryReads, 1);
    assert.equal(evidence.loanTotalsDiagnostic.failedComparison.expected, "SYN 500.00");
  }
});

test("Banking BFF materialization preserves its local dependency and owns success/failure cleanup", async () => {
  const adapterName = "connected-banking-loans-bff-adapter.mjs";
  const runnerName = "connected-banking-loans-mutation-runner.mjs";
  const helperName = "loan-totals-diagnostic.mjs";
  const adapter = fs.readFileSync(new URL(`../tools/${adapterName}`, import.meta.url), "utf8");
  const runner = fs.readFileSync(new URL(`../tools/${runnerName}`, import.meta.url), "utf8");
  const helper = fs.readFileSync(new URL(`../tools/${helperName}`, import.meta.url));
  const consumer = "  await import(pathToFileURL(materializedPath).href);";
  const copyOperation = String.raw`  await copyFile(
    new URL("./loan-totals-diagnostic.mjs", import.meta.url),
    join(materializedDirectory, "loan-totals-diagnostic.mjs"),
  );
`;
  assert.equal(adapter.split(consumer).length - 1, 1);
  assert.equal([...adapter.matchAll(/\bimport\s*\(/gu)].length, 1);
  const probe = String.raw`  const generated = await readFile(materializedPath, "utf8");
  const relativeImports = [...generated.matchAll(/\b(?:from\s*|import\s*)["'](\.[^"']+)["']/gu)].map((match) => match[1]);
  const browserImports = [...generated.matchAll(/\bimport\s*\(\s*["'](\.[^"']+)["']/gu)].map((match) => match[1]);
  if (JSON.stringify(relativeImports) !== '["./loan-totals-diagnostic.mjs"]' || JSON.stringify(browserImports) !== '["./src/pages/loans-page.js","./src/api/response-normalizer.js","./src/data/preview-data.js"]' || [...generated.matchAll(/\bimport\s*\(/gu)].length !== browserImports.length) throw new Error("Review the runner's changed relative import set.");
  const record = { directory: materializedDirectory, source: generated, relativeImports, browserImports };
  const probePath = join(dirname(entryPath), "probe.json");
  await writeFile(probePath, JSON.stringify(record), "utf8");
  const helperUrl = new URL(relativeImports[0], pathToFileURL(materializedPath));
  if (helperUrl.protocol !== "file:" || fileURLToPath(helperUrl) !== join(materializedDirectory, "loan-totals-diagnostic.mjs")) throw new Error("Probe must stay inside its owned directory.");
  const canonical = await readFile(new URL("./loan-totals-diagnostic.mjs", import.meta.url));
  const copied = await readFile(helperUrl).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  if (copied && !copied.equals(canonical)) throw new Error("Diagnostic helper bytes changed.");
  const diagnostic = await import(helperUrl.href);
  record.helperBytesMatch = Boolean(copied);
  record.result = diagnostic.captureLoanTotalsSummary("500.00 eld", new Set(["ELD"]));
  await writeFile(probePath, JSON.stringify(record), "utf8");`;
  const protectedLoansBlock = runner.slice(runner.indexOf("  const projection = (loanPayload.data || loanPayload).currencyProjection;"), runner.indexOf("  const repayForm = page.locator("));
  assert.ok(protectedLoansBlock.includes("if (!summary.includes(expected)) {"));
  const generatedHashes = [];
  for (const mode of ["success", "old-without-copy", "failure-after-load"]) {
    const directory = await fs.promises.mkdtemp(join(tmpdir(), "econovaria-banking-materialization-"));
    try {
      let fixtureAdapter = adapter;
      if (mode === "old-without-copy") {
        assert.equal(adapter.split(copyOperation).length - 1, 1);
        fixtureAdapter = fixtureAdapter.replace(copyOperation, "");
      }
      // Intercept only browser/SQL entry evaluation in this disposable copy.
      fixtureAdapter = fixtureAdapter.replace(consumer, probe + (mode === "failure-after-load" ? '\n  throw new Error("intentional probe failure");' : ""));
      await Promise.all([
        fs.promises.writeFile(join(directory, adapterName), fixtureAdapter),
        fs.promises.writeFile(join(directory, runnerName), runner),
        fs.promises.writeFile(join(directory, helperName), helper),
        fs.promises.writeFile(join(directory, "keep.txt"), "owned fixture sentinel"),
      ]);
      let failure;
      try { await import(pathToFileURL(join(directory, adapterName)).href); } catch (error) { failure = error; }
      if (!fs.existsSync(join(directory, "probe.json")) && failure) throw failure;
      const record = JSON.parse(await fs.promises.readFile(join(directory, "probe.json"), "utf8"));
      assert.equal(dirname(record.directory), directory);
      assert.equal(fs.existsSync(record.directory), false);
      assert.equal(await fs.promises.readFile(join(directory, "keep.txt"), "utf8"), "owned fixture sentinel");
      assert.deepEqual((await fs.promises.readdir(directory)).sort(), [adapterName, runnerName, helperName, "keep.txt", "probe.json"].sort());
      assert.deepEqual(record.relativeImports, ["./loan-totals-diagnostic.mjs"]);
      assert.deepEqual(record.browserImports, ["./src/pages/loans-page.js", "./src/api/response-normalizer.js", "./src/data/preview-data.js"]);
      assert.ok(record.source.includes(protectedLoansBlock));
      assert.ok(record.source.includes("/functions/v1/player-web-session-api/login"));
      assert.ok(record.source.includes('credentials: "include"'));
      generatedHashes.push(createHash("sha256").update(record.source).digest("hex"));
      if (mode === "old-without-copy") {
        assert.equal(failure?.code, "ERR_MODULE_NOT_FOUND");
        assert.equal(record.result, undefined);
      } else {
        if (mode === "success" && failure) throw failure;
        assert.equal(record.helperBytesMatch, true);
        assert.deepEqual(record.result.lines, [{ lineIndex: 0, text: "500.00 eld" }]);
        if (mode === "failure-after-load") assert.equal(failure?.message, "intentional probe failure");
      }
    } finally {
      await fs.promises.rm(directory, { recursive: true });
      assert.equal(fs.existsSync(directory), false);
    }
  }
  assert.equal(generatedHashes[1], generatedHashes[0]);
  assert.equal(generatedHashes[2], generatedHashes[0]);
});
