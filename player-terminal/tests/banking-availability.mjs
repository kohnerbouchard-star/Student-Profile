import assert from "node:assert/strict";
import test from "node:test";
import { mergeTerminalRead, normalizeTerminalBootstrap } from "../src/api/read-model.js";
import { renderShell } from "../src/components/layout.js";
import { createPlayerTerminalForms } from "../src/core/player-terminal-forms.js";
import { previewData } from "../src/data/preview-data.js";
import { bindBankingCurrency } from "../src/integrations/student-profile-currency-projection.js";
import { renderDashboardPage } from "../src/pages/dashboard-page.js";
import { renderBankingPage } from "../src/pages/banking-page.js";

const currencyCode = "ELD";
const key = "bac_11111111111111111111111111111111";

function terminal() {
  const data = structuredClone(previewData);
  Object.assign(data.session, { currencyCode, currencyResolved: true });
  return data;
}
function row(input = {}) {
  return { accountType: "checking", accountKey: key, currencyCode, ...input };
}
function read(rows, data = terminal()) {
  return mergeTerminalRead(data, "banking", { currentBalances: rows });
}
function card(data, account = "checking", code = currencyCode) {
  const html = renderBankingPage(data);
  return html.match(new RegExp(`data-player-banking-balance="${account}:${code}"[\\s\\S]*?</article>`, "u"))?.[0];
}

test("posted-only ledger and preview Checking do not imply zero held or available funds", () => {
  const merged = read([row({ balance: 12.75 })]);
  assert.equal(merged.banking.checking.balance, 12.75);
  assert.equal(merged.banking.checking.heldAmount, null);
  assert.equal(merged.banking.checking.available, null);
  assert.match(card(merged), /Posted<\/dt><dd>ELD 12\.75/);
  for (const [balances, fallback] of [[[], { currencyCode, balance: 12.75, pending: 0 }], [[row({ balance: 12.75 })], {}]]) {
    const preview = terminal();
    preview.banking = { ...preview.banking, balances, checking: fallback };
    assert.match(card(preview), /Held<\/dt><dd>Unavailable/);
    assert.match(card(preview), /Available<\/dt><dd>Unavailable/);
  }
});

test("explicit zero wins, and only a valid posted-plus-hold pair can supply missing availability", () => {
  const rows = [
    [{ postedAmount: 12.75, heldAmount: 3.25, availableAmount: 0 }, 0],
    [{ balance: "0.30", held: "0.20" }, 0.1],
    [{ balance: "999999999999999.01", held: "999999999999999.00" }, 0.01],
    [{ balance: "999999999999999.10", held: "999999999999999.00" }, 0.1],
    [{ balance: "1.00000001", held: "1.00000000" }, 0.00000001],
    [{ balance: "1.000000001", held: "1.00000000" }, null],
    [{ balance: 999999999999999.10, held: 999999999999999 }, null],
    [{ balance: 999999999999999.01, held: 999999999999999 }, null],
    [{ balance: 12.75, heldAmount: 0 }, 12.75],
    [{ available: "1.25" }, 1.25],
    [{ postedAmount: 12.75, held: -1 }, null],
    [{ postedAmount: 12.75, held: 13 }, null],
    [{ postedAmount: 12.75, held: " " }, null],
    [{ postedAmount: 12.75, held: true }, null],
    [{ postedAmount: true, held: 0 }, null],
    [{ postedAmount: 12.75, availableAmount: " ", heldAmount: 2 }, null],
    [{ postedAmount: 12.75, availableAmount: null, heldAmount: 2, available: 4 }, null],
  ];
  for (const [values, expected] of rows) {
    const merged = read([row(values)]);
    assert.equal(merged.banking.checking.available, expected, JSON.stringify(values));
    assert.equal(merged.banking.balances[0].availableAmount, expected, JSON.stringify(values));
    if (expected === null) assert.match(card(merged), /Available<\/dt><dd>Unavailable/);
  }
});

test("currency binding selects from the normalized ledger without restoring posted amounts as available", () => {
  const data = terminal();
  const rows = [row({ postedAmount: 10.75, heldAmount: 3.25 }), row({ currencyCode: "LUM", postedAmount: 200, availableAmount: 100 }),
    row({ accountType: "savings", accountKey: "savings-public", postedAmount: 0, heldAmount: 0, availableAmount: 0 })];
  const canonical = read(rows, data);
  const bound = bindBankingCurrency(canonical, { currentBalances: rows });
  assert.equal(bound.banking.checking.accountId, key);
  assert.equal(bound.banking.checking.currencyCode, currencyCode);
  assert.equal(bound.banking.checking.available, 7.5);
  assert.equal(bound.banking.savings.available, 0);
  const unresolved = terminal();
  unresolved.session.currencyResolved = false;
  unresolved.session.currencyCode = "";
  const unique = bindBankingCurrency(read([rows[0]], unresolved), { currentBalances: [rows[0]] });
  assert.equal(unique.banking.checking.available, 7.5);
  const ambiguous = bindBankingCurrency(read(rows, unresolved), { currentBalances: rows });
  assert.equal(ambiguous.banking.checking.configured, false);
  assert.equal(ambiguous.banking.checking.available, null);
});

test("dashboard bootstrap and shared Available chip do not borrow aggregate or posted cash", () => {
  const input = { gameSession: {}, public: {}, me: { cash: { primaryCurrencyCode: currencyCode, totalBalance: 1000, balances: [row({ balance: 12.75 })] } } };
  const boot = normalizeTerminalBootstrap({}, input);
  assert.equal(boot.banking.checking.balance, 12.75);
  assert.equal(boot.banking.checking.available, null);
  assert.equal(normalizeTerminalBootstrap({}, { ...input, me: { cash: { primaryCurrencyCode: currencyCode, totalBalance: 1000 } } }).banking.checking.balance, null);
  function chip(data) {
    const shell = renderShell({ route: "banking", data, pageHtml: "", ui: {}, config: { usePreviewData: false } });
    return shell.match(/player-terminal-balance-chip"><small>Available<\/small><strong>([^<]*)/)?.[1];
  }
  const ledger = read([row({ postedAmount: 90, heldAmount: 6, availableAmount: 84 })]);
  const refreshed = mergeTerminalRead(ledger, "dashboard", input);
  assert.deepEqual(refreshed.banking.checking, ledger.banking.checking);
  assert.equal(chip(refreshed), "ELD 84");
  const oldChecking = ledger.banking.checking;
  const moved = mergeTerminalRead(ledger, "dashboard", { ...input, me: { cash: {
    primaryCurrencyCode: "LUM", totalBalance: 1000, balances: [row({ currencyCode: "LUM", balance: 12.75 })],
  } } });
  assert.equal(chip(moved), "Unavailable");
  assert.notEqual(moved.banking.checking.accountId, key);
  assert.equal(ledger.banking.checking, oldChecking);
  assert.equal(oldChecking.available, 84);
  assert.equal(chip(boot), "Unavailable");
  assert.equal(chip(read([row({ availableAmount: 0 })])), "ELD 0");
  const differentCurrency = terminal();
  differentCurrency.banking.checking = { available: 10, currencyCode: "LUM" };
  assert.equal(chip(differentCurrency), "Unavailable");
  const dashboard = renderDashboardPage(differentCurrency, {}, { usePreviewData: true });
  assert.match(dashboard, /Available checking<\/small><strong>Unavailable<\/strong><em>Balance not confirmed/);
  const dashboardZero = renderDashboardPage(read([row({ availableAmount: 0 })]), {}, { usePreviewData: true });
  assert.match(dashboardZero, /Available checking<\/small><strong>ELD 0<\/strong>/);
});

test("advisory preflight leaves unknown availability to the server but honors actual zero", async () => {
  const formData = globalThis.FormData;
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ dataset: {}, setAttribute() {} }) };
  globalThis.FormData = class { entries() { return [["amount", "2"]]; } };
  try {
    for (const [endpoint, from, available, expectDispatch] of [
      ["bankTransfer", "checking", null, true],
      ["bankTransfer", "checking", 0, false],
      ["savingsTransfer", "savings", null, true],
      ["savingsTransfer", "savings", 0, false],
      ["marketOrder", "checking", null, true],
      ["marketOrder", "checking", 0, false],
      ["marketplacePurchase", "checking", null, true],
      ["marketplacePurchase", "checking", 0, false],
    ]) {
      let submitted = false;
      const messages = [];
      const amount = { value: "2", setCustomValidity: (msg) => { if (msg) messages.push(msg); } };
      const elements = [amount];
      elements.namedItem = (name) => ({
        amount, quantity: amount, fromAccount: { value: from }, toAccount: { value: "recipient" },
        assetId: { value: "asset" }, side: { value: "buy" }, orderType: { value: "market" }
      }[name]);
      const form = { dataset: { endpoint, listingId: "listing" }, elements,
        classList: { add() {}, remove() {} }, querySelector: () => null, prepend() {},
        checkValidity: () => messages.length === 0 };
      const data = terminal();
      data.banking = { checking: { balance: 1, available }, savings: { balance: 1, available } };
      data.market.assets = [{ id: "asset", price: 10 }];
      data.marketplace.listings = [{ id: "listing", quantity: 3, unitPrice: 10 }];
      const forms = createPlayerTerminalForms({ store: { getState: () => ({ data }) }, mount: {},
        showToast() {}, executeEndpoint: async () => { submitted = true; } });
      await forms.handleSubmit({ target: { closest: () => form }, preventDefault() {} });
      assert.equal(submitted, expectDispatch, `${endpoint}: ${available}`);
    }
  } finally {
    globalThis.FormData = formData;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});


test("transfer controls depend on configured local accounts and endpoint grants, not posted amount", () => {
  const data = terminal();
  data.capabilities = { actions: { bankTransfer: true, savingsTransfer: true } };
  const rendered = read([
    row({ availableAmount: 5 }),
    row({ accountType: "savings", accountKey: "savings-public" }),
  ], data);
  const isDisabled = (source, endpoint) => {
    const html = renderBankingPage(source);
    const form = html.match(new RegExp(`data-endpoint="${endpoint}"[\\s\\S]*?</form>`, "u"))?.[0];
    assert.ok(form);
    return /<button[^>]*type="submit"[^>]*disabled/u.test(form);
  };
  assert.equal(isDisabled(rendered, "bankTransfer"), false);
  assert.equal(isDisabled(rendered, "savingsTransfer"), false);
  assert.match(card(rendered), /Posted<\/dt><dd>Unavailable/);
  const foreign = read([row({ currencyCode: "LUM", availableAmount: 5 })], data);
  assert.equal(isDisabled(foreign, "bankTransfer"), true);
  assert.equal(isDisabled({ ...rendered, capabilities: { actions: {} } }, "savingsTransfer"), true);
});
