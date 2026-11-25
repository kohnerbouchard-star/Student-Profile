// Player ledger "balance" is a posted amount, not proof of usable funds.
const DECIMAL = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/u;
const MAX_AMOUNT = 1_000_000_000_000_000;
// The Player Banking public repository roundMoney rule uses eight places.
const SCALE = 100_000_000n;
const SCALED_DECIMAL = /^(-?)(\d{0,16})(?:\.(\d{1,8}))?$/u;

function bankingAmount(value) {
  if (typeof value !== "number" && !(typeof value === "string" && DECIMAL.test(value.trim()))) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && Math.abs(amount) <= MAX_AMOUNT ? amount : null;
}

function reportedValue(row, canonical, alias) {
  return Object.hasOwn(row, canonical) ? row[canonical] : row[alias];
}

function scaledUnits(value) {
  if (bankingAmount(value) === null) return null;
  // A decimal string retains its precise digits. Large JSON numbers may
  // already have lost a fractional balance even when they appear integral.
  let literal = String(value).trim();
  if (typeof value === "number") {
    if (Math.abs(value) > Number.MAX_SAFE_INTEGER / Number(SCALE)) return null;
    if (!Number.isSafeInteger(value)) {
      literal = value.toFixed(8);
      if (Number(literal) !== value) return null;
    }
  }
  const match = literal.match(SCALED_DECIMAL);
  if (!match) return null;
  const [, sign, integer, fraction = ""] = match;
  const units = BigInt(integer || "0") * SCALE + BigInt(fraction.padEnd(8, "0"));
  return sign === "-" ? -units : units;
}

function reconciledAvailability(posted, held) {
  const postedUnits = scaledUnits(posted);
  const heldUnits = scaledUnits(held);
  if (postedUnits === null || heldUnits === null || heldUnits < 0n || postedUnits < heldUnits) return null;
  const difference = postedUnits - heldUnits;
  const result = Number(`${difference / SCALE}.${String(difference % SCALE).padStart(8, "0")}`);
  return scaledUnits(result) === difference ? result : null;
}

export function bankAvailability(account, expectedCurrency) {
  if (!account || account.configured === false ||
    (expectedCurrency && account.currencyCode && account.currencyCode !== expectedCurrency)) return null;
  return bankingAmount(reportedValue(account, "availableAmount", "available"));
}

export function projectBankingBalanceAmounts(row, { deriveMissing = true } = {}) {
  const posted = reportedValue(row, "postedAmount", "balance");
  const rawHold = reportedValue(row, "heldAmount", "held");
  const postedAmount = bankingAmount(posted);
  const hold = bankingAmount(rawHold);
  const heldAmount = hold !== null && hold >= 0 ? hold : null;
  let availableAmount = bankAvailability(row);
  const explicitlyReported = Object.hasOwn(row, "availableAmount") || Object.hasOwn(row, "available");
  if (deriveMissing && !explicitlyReported && postedAmount !== null && heldAmount !== null) {
    availableAmount = reconciledAvailability(posted, rawHold);
  }
  return { postedAmount, heldAmount, availableAmount, balance: postedAmount, available: availableAmount };
}
