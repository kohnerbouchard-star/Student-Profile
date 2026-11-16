export function scaledDatabaseDecimal(
  value,
  precision,
  label = "Database decimal",
) {
  const fail = () => {
    throw new Error(`${label} has invalid precision.`);
  };
  if (!Number.isSafeInteger(precision) || precision < 0 || precision > 18) {
    fail();
  }
  const text = String(value ?? "").trim();
  const match = /^(?:0|[1-9][0-9]{0,30})(?:\.([0-9]{1,18}))?$/u.exec(text);
  if (!match) fail();
  const [whole, fraction = ""] = text.split(".");
  if (/[1-9]/u.test(fraction.slice(precision))) fail();
  const significantFraction = fraction.slice(0, precision);
  return BigInt(whole) * (10n ** BigInt(precision)) +
    BigInt(
      (significantFraction + "0".repeat(precision)).slice(0, precision) || "0",
    );
}
