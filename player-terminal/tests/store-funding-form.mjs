import assert from "node:assert/strict";
import test from "node:test";
import {
  readStoreFundingRows,
  syncStoreFundingForm,
  storeFundingRequestFromModal,
  handleStoreFundingModalKeyDown,
} from "../src/features/store/store-funding-form.js";

const keys = [1, 2, 3].map((n) => `bac_${String(n).repeat(32)}`);
const accounts = keys.map((accountKey) => ({ accountKey, currencyCode: "NRC", availableAmount: 100 }));
const context = { accounts, targetCurrencyCode: "NRC", targetPrecision: 3 };
function fixture(selected = [], amounts = []) {
  const rows = keys.map((_, i) => {
    const account = { value: selected[i] || "", options: ["", ...keys].map((value) => ({ value })) };
    const amount = { value: amounts[i] || "", disabled: false };
    const label = { textContent: "" };
    return { account, amount, label, querySelector(selector) {
      return { "[data-player-store-funding-account]": account, "[data-player-store-funding-amount]": amount, "[data-player-store-funding-allocation-label]": label }[selector];
    } };
  });
  const summary = { textContent: "" };
  const quantity = { value: "2" };
  return { rows, summary, quantity,
    querySelectorAll: () => rows,
    querySelector: (selector) => selector === "[data-player-store-quantity]" ? quantity : summary,
  };
}

test("reads canonical DOM selections and ignores disabled remainder values", () => {
  const root = fixture([`  ${keys[0].toUpperCase()} `], [" 1.001 "]);
  assert.deepEqual(readStoreFundingRows(root)[0], { sourceAccountKey: keys[0], targetAmount: "1.001" });
  root.rows[0].amount.disabled = true;
  assert.equal(readStoreFundingRows(root)[0].targetAmount, null);
  assert.ok(Object.isFrozen(readStoreFundingRows(root)[0]));
  assert.deepEqual(readStoreFundingRows(null), []);
});

test("three accounts retain exact fixed contribution and server-derived final remainder", () => {
  const root = fixture(keys, ["1.001", "2.002", "999"]);
  const result = syncStoreFundingForm(root, context);
  assert.equal(result.error, "");
  assert.equal(result.intent.fixedTotal, "3.003");
  assert.deepEqual(result.intent.allocations.map((row) => row.targetAmount), ["1.001", "2.002", null]);
  assert.equal(root.rows[2].amount.value, "");
  assert.equal(root.rows[2].amount.disabled, true);
  assert.equal(root.rows[0].amount.required, true);
  assert.equal(root.rows[0].amount.step, "0.001");
  assert.equal(root.rows[2].label.textContent, "Final NRC remainder is derived by the server");
  assert.equal(root.summary.textContent, "NRC 3.003 fixed · final remainder server-derived");
  assert.equal(root.rows[0].account.options[2].disabled, true);
  assert.equal(root.rows[0].account.options[1].disabled, false);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.allocationDraft));
});

test("a missing earlier account clears all later rows and disables their controls", () => {
  const root = fixture(["", keys[1], keys[2]], ["1", "2", "3"]);
  const result = syncStoreFundingForm(root, context);
  assert.ok(result.error);
  assert.equal(result.intent, null);
  assert.deepEqual(root.rows.map((row) => row.account.value), ["", "", ""]);
  assert.deepEqual(root.rows.map((row) => row.amount.value), ["", "", ""]);
  assert.equal(root.rows[1].account.disabled, true);
  assert.equal(root.rows[0].label.textContent, "Optional additional Checking account");
});

test("duplicate accounts, excess precision and unavailable precision cannot form an intent", () => {
  for (const [selected, amount, precision] of [[ [keys[0], keys[0]], "1", 3 ], [keys.slice(0, 2), "1.0001", 3], [keys.slice(0, 1), "", null]]) {
    const root = fixture(selected, [amount]);
    const result = syncStoreFundingForm(root, { ...context, targetPrecision: precision });
    assert.equal(result.intent, null);
    assert.ok(result.error);
    assert.equal(root.summary.textContent, "Complete each non-final fixed contribution before requesting the quote.");
  }
});

test("quantity validation retains stock bounds, offer precedence and whole-number rules", () => {
  const current = { fundingAccounts: accounts, currencyCode: "NRC", targetPrecision: 3, offer: { availableQuantity: 2 }, item: { stock: 9 } };
  for (const value of ["0", "3", "1.5", "NaN"]) {
    const root = fixture([keys[0]]); root.quantity.value = value;
    assert.equal(storeFundingRequestFromModal(root, current).error, "Enter a whole-number quantity between 1 and 2.");
  }
  const root = fixture([keys[0]]);
  assert.equal(storeFundingRequestFromModal(root, current).quantity, 2);
  assert.equal(storeFundingRequestFromModal(root, current).error, "");
  assert.equal(storeFundingRequestFromModal(root, { ...current, offer: undefined }).error, "");
});

function event(key, shiftKey = false) {
  return { key, shiftKey, prevented: 0, stopped: 0, preventDefault() { this.prevented++; }, stopImmediatePropagation() { this.stopped++; } };
}
test("Escape closes once and stops propagation; unrelated keys and absent root do nothing", () => {
  let closed = 0;
  const escape = event("Escape");
  handleStoreFundingModalKeyDown(escape, {}, () => closed++);
  assert.deepEqual([closed, escape.prevented, escape.stopped], [1, 1, 1]);
  handleStoreFundingModalKeyDown(event("Enter"), {}, () => closed++);
  handleStoreFundingModalKeyDown(event("Escape"), null, () => closed++);
  assert.equal(closed, 1);
});

test("Tab and Shift+Tab wrap visible focus targets without swallowing interior traversal", () => {
  const oldDocument = globalThis.document;
  const first = { getAttribute: () => null, focus() { globalThis.document.activeElement = this; } };
  const last = { ...first };
  const hidden = { ...first, hidden: true };
  const ariaHidden = { ...first, getAttribute: () => "true" };
  const root = { querySelectorAll: () => [hidden, first, last, ariaHidden] };
  try {
    globalThis.document = { activeElement: last };
    const forward = event("Tab"); handleStoreFundingModalKeyDown(forward, root, () => {});
    assert.equal(globalThis.document.activeElement, first); assert.equal(forward.prevented, 1);
    const backward = event("Tab", true); handleStoreFundingModalKeyDown(backward, root, () => {});
    assert.equal(globalThis.document.activeElement, last); assert.equal(backward.prevented, 1);
    globalThis.document.activeElement = first;
    const interior = event("Tab"); handleStoreFundingModalKeyDown(interior, root, () => {});
    assert.equal(interior.prevented, 0);
  } finally { if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument; }
});

test("empty focus list focuses the labeled modal without scrolling", () => {
  let options;
  const root = { querySelectorAll: () => [], querySelector(selector) {
    assert.equal(selector, '[aria-labelledby="storePurchaseModalTitle"]');
    return { focus(value) { options = value; } };
  } };
  const tab = event("Tab"); handleStoreFundingModalKeyDown(tab, root, () => {});
  assert.equal(tab.prevented, 1);
  assert.deepEqual(options, { preventScroll: true });
});
