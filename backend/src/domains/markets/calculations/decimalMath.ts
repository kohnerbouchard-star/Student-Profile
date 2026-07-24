export const MARKET_DECIMAL_SCALE_DIGITS = 6;
export const MARKET_DECIMAL_SCALE = 1_000_000n;

const DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

export type MarketDecimalInput = string | number | bigint;

export function parseMarketDecimal(value: MarketDecimalInput): bigint {
  if (typeof value === "bigint") return value * MARKET_DECIMAL_SCALE;
  const text = typeof value === "number"
    ? numberToPlainDecimal(value)
    : String(value).trim();
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) throw new Error(`Invalid market decimal: ${String(value)}`);

  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [wholePart, fractionPart = ""] = unsigned.split(".");
  const roundedFraction = roundFraction(fractionPart, MARKET_DECIMAL_SCALE_DIGITS);
  let scaled = BigInt(wholePart) * MARKET_DECIMAL_SCALE + roundedFraction.value;
  if (roundedFraction.carry) scaled += MARKET_DECIMAL_SCALE;
  return negative ? -scaled : scaled;
}

export function formatMarketDecimal(
  scaledValue: bigint,
  options: { readonly trimTrailingZeros?: boolean } = {},
): string {
  const negative = scaledValue < 0n;
  const absolute = negative ? -scaledValue : scaledValue;
  const whole = absolute / MARKET_DECIMAL_SCALE;
  const fraction = (absolute % MARKET_DECIMAL_SCALE)
    .toString()
    .padStart(MARKET_DECIMAL_SCALE_DIGITS, "0");
  const renderedFraction = options.trimTrailingZeros === false
    ? fraction
    : fraction.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${renderedFraction ? `.${renderedFraction}` : ""}`;
}

export function addMarketDecimals(...values: readonly MarketDecimalInput[]): string {
  const total = values.reduce<bigint>(
    (sum, value) => sum + parseMarketDecimal(value),
    0n,
  );
  return formatMarketDecimal(total);
}

export function subtractMarketDecimals(
  left: MarketDecimalInput,
  right: MarketDecimalInput,
): string {
  return formatMarketDecimal(parseMarketDecimal(left) - parseMarketDecimal(right));
}

export function multiplyMarketDecimals(
  left: MarketDecimalInput,
  right: MarketDecimalInput,
): string {
  const product = parseMarketDecimal(left) * parseMarketDecimal(right);
  return formatMarketDecimal(divideRounded(product, MARKET_DECIMAL_SCALE));
}

export function divideMarketDecimals(
  numerator: MarketDecimalInput,
  denominator: MarketDecimalInput,
): string {
  const denominatorScaled = parseMarketDecimal(denominator);
  if (denominatorScaled === 0n) throw new Error("Market decimal division by zero.");
  const scaledNumerator = parseMarketDecimal(numerator) * MARKET_DECIMAL_SCALE;
  return formatMarketDecimal(divideRounded(scaledNumerator, denominatorScaled));
}

export function compareMarketDecimals(
  left: MarketDecimalInput,
  right: MarketDecimalInput,
): -1 | 0 | 1 {
  const difference = parseMarketDecimal(left) - parseMarketDecimal(right);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function absoluteMarketDecimal(value: MarketDecimalInput): string {
  const scaled = parseMarketDecimal(value);
  return formatMarketDecimal(scaled < 0n ? -scaled : scaled);
}

export function clampMarketDecimal(
  value: MarketDecimalInput,
  minimum: MarketDecimalInput,
  maximum: MarketDecimalInput,
): string {
  const scaled = parseMarketDecimal(value);
  const minimumScaled = parseMarketDecimal(minimum);
  const maximumScaled = parseMarketDecimal(maximum);
  if (minimumScaled > maximumScaled) {
    throw new Error("Market decimal minimum exceeds maximum.");
  }
  return formatMarketDecimal(
    scaled < minimumScaled
      ? minimumScaled
      : scaled > maximumScaled
      ? maximumScaled
      : scaled,
  );
}

export function marketDecimalToNumber(value: MarketDecimalInput): number {
  const scaled = parseMarketDecimal(value);
  return Number(scaled) / Number(MARKET_DECIMAL_SCALE);
}

export function assertNonNegativeMarketDecimal(
  value: MarketDecimalInput,
  fieldName: string,
): void {
  if (parseMarketDecimal(value) < 0n) {
    throw new Error(`${fieldName} must be non-negative.`);
  }
}

export function assertPositiveMarketDecimal(
  value: MarketDecimalInput,
  fieldName: string,
): void {
  if (parseMarketDecimal(value) <= 0n) {
    throw new Error(`${fieldName} must be positive.`);
  }
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("Market decimal division by zero.");
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;
  const rounded = remainder * 2n >= absoluteDenominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function roundFraction(
  fraction: string,
  digits: number,
): { readonly value: bigint; readonly carry: boolean } {
  const kept = fraction.slice(0, digits).padEnd(digits, "0");
  const nextDigit = fraction.length > digits ? Number(fraction[digits]) : 0;
  let value = BigInt(kept || "0");
  if (nextDigit >= 5) value += 1n;
  if (value >= 10n ** BigInt(digits)) {
    return { value: 0n, carry: true };
  }
  return { value, carry: false };
}

function numberToPlainDecimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Market decimal number must be finite.");
  const text = value.toString();
  if (!/[eE]/.test(text)) return text;
  return value.toFixed(MARKET_DECIMAL_SCALE_DIGITS + 2).replace(/0+$/, "").replace(/\.$/, "");
}
