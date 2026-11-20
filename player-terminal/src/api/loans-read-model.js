const amount = (value) => value === null || (typeof value === "string" && /^(?:0|[1-9][0-9]{0,15})\.[0-9]{2}$/u.test(value));
const date = (value) => value === null || (typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value)));
const code = (value) => value === null || (typeof value === "string" && /^[A-Z][A-Z0-9]{2,15}$/u.test(value));
const key = (value, prefix) => typeof value === "string" && new RegExp(`^${prefix}_[0-9a-f]{32}$`, "u").test(value);
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
const pick = (row, keys) => Object.fromEntries(keys.map((name) => [name, row[name]]));
const validFields = (row, names, check) => names.every((name) => check(row[name]));
const unavailable = () => ({ version: 1, state: "unavailable" });
function product(value) {
  if (value === null) return null;
  if (!value || !key(value.id, "lop") || !code(value.currencyCode) ||
      !(value.name === null || (typeof value.name === "string" && value.name.length <= 160 && !uuid.test(value.name)))) throw Error();
  return pick(value, ["id", "name", "currencyCode"]);
}
function window(value, project) {
  if (!value || !Array.isArray(value.items) || value.items.length > 100 || typeof value.complete !== "boolean" ||
      ![true, false, null].includes(value.hasMore) || (value.complete && value.hasMore !== false)) throw Error();
  const items = value.items.map(project);
  if (new Set(items.map((row) => row.id)).size !== items.length) throw Error();
  return { items, hasMore: value.hasMore, complete: value.complete };
}
export function normalizeLoanLifecycle(value) {
  if (!value || value.version !== 1 || value.state !== "available") return unavailable();
  try {
    const applications = window(value.applications, (row) => {
      const dates = ["createdAt", "updatedAt", "reviewedAt"];
      if (!row || !key(row.id, "lna") || !["pending_review", "approved", "declined", "cancelled"].includes(row.status) ||
          row.currencyCode !== null || !validFields(row, ["amount", "projectedPayment"], amount) || !validFields(row, dates, date)) throw Error();
      return { ...pick(row, ["id", "status", "amount", "projectedPayment", "currencyCode", ...dates]), currentProduct: product(row.currentProduct) };
    });
    const facilities = window(value.facilities, (row) => {
      const amounts = ["originalPrincipal", "principalBalance", "accruedInterest", "recordedOutstanding"];
      const dates = ["lastAccruedAt", "createdAt", "updatedAt", "defaultedAt", "closedAt"];
      if (!row || !key(row.id, "lon") || !["active", "delinquent", "restructured", "defaulted", "paid"].includes(row.status) ||
          !code(row.currencyCode) || !validFields(row, amounts, amount) || !validFields(row, dates, date)) throw Error();
      return { ...pick(row, ["id", "status", "currencyCode", ...amounts, ...dates]), currentProduct: product(row.currentProduct) };
    });
    const payments = window(value.payments, (row) => {
      const amounts = ["amount", "principalAmount", "interestAmount"];
      const dates = ["createdAt", "appliedDueAt"];
      if (!row || !key(row.id, "pay") || !key(row.loanId, "lon") || !["posted", "reversed"].includes(row.status) ||
          !code(row.currencyCode) || !validFields(row, amounts, amount) || !validFields(row, dates, date)) throw Error();
      return pick(row, ["id", "loanId", "status", "currencyCode", ...amounts, ...dates]);
    });
    const debt = value.recordedDebt;
    if (!debt || typeof debt.complete !== "boolean" || !Number.isSafeInteger(debt.unknownCurrencyRows) || debt.unknownCurrencyRows < 0 ||
        !Array.isArray(debt.groups) || debt.groups.length > 100 || (debt.complete && debt.unknownCurrencyRows !== 0)) throw Error();
    const groups = debt.groups.map((row) => {
      const amounts = ["principalBalance", "accruedInterest", "outstanding"];
      if (!row || !row.currencyCode || !code(row.currencyCode) || !validFields(row, amounts, amount) ||
          (debt.complete && amounts.some((name) => row[name] === null))) throw Error();
      return pick(row, ["currencyCode", ...amounts]);
    });
    if (new Set(groups.map((row) => row.currencyCode)).size !== groups.length) throw Error();
    return { version: 1, state: "available", applications, facilities, payments,
      recordedDebt: { complete: debt.complete, unknownCurrencyRows: debt.unknownCurrencyRows, groups } };
  } catch { return unavailable(); }
}
export function normalizeLoanForecast(value) {
  if (!value || value.version !== 1 || value.basis !== "recorded_balance" || value.excludesUnrecordedInterest !== true ||
      !Array.isArray(value.facilities) || value.facilities.length > 1000) return null;
  try {
    const cents = (value) => BigInt(value.replace(".", ""));
    const facilities = value.facilities.map((row) => {
      if (!row || !key(row.id, "lon") || !code(row.currencyCode) || !["available", "unavailable"].includes(row.state)) throw Error();
      if (row.state === "unavailable") return { id: row.id, state: row.state, currencyCode: row.currencyCode,
        reason: typeof row.reason === "string" && row.reason.length <= 160 && !uuid.test(row.reason) ? row.reason : "Forecast inputs unavailable",
        recordedOutstanding: null, remainingAfterWindow: null, installments: [] };
      if (!row.currencyCode || !row.recordedOutstanding || !row.remainingAfterWindow ||
          !validFields(row, ["recordedOutstanding", "remainingAfterWindow"], amount) ||
          !Array.isArray(row.installments) || row.installments.length > 24) throw Error();
      let previous = -Infinity;
      const installments = row.installments.map((item) => {
        if (!item || !item.amount || !amount(item.amount) || cents(item.amount) <= 0n || !item.due || !date(item.due) ||
            !["Late", "Projected"].includes(item.status) || Date.parse(item.due) <= previous) throw Error();
        previous = Date.parse(item.due);
        return pick(item, ["due", "amount", "status"]);
      });
      if (installments.reduce((sum, item) => sum + cents(item.amount), cents(row.remainingAfterWindow)) !== cents(row.recordedOutstanding)) throw Error();
      return { ...pick(row, ["id", "state", "currencyCode", "recordedOutstanding", "remainingAfterWindow"]), reason: null, installments };
    });
    if (new Set(facilities.map((row) => row.id)).size !== facilities.length) throw Error();
    return { version: 1, basis: "recorded_balance", excludesUnrecordedInterest: true, facilities };
  } catch { return null; }
}
