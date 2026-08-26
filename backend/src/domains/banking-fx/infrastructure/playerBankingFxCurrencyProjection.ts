import {
  type PlayerBankingFxCurrencyDto,
  PlayerBankingFxError,
} from "../contracts/playerBankingFxContracts.ts";

type Row = Record<string, unknown>;

export function projectPlayerBankingFxCurrencies(
  value: unknown,
): PlayerBankingFxCurrencyDto[] {
  if (!Array.isArray(value)) throw invalidResult();
  const seen = new Set<string>();
  const currencies = value.map((candidate) => {
    if (
      !candidate || typeof candidate !== "object" || Array.isArray(candidate)
    ) {
      throw invalidResult();
    }
    const row = candidate as Row;
    const currencyCode = text(
      first(row, "currency_code", "currencyCode", "code"),
    ).toUpperCase();
    const minorUnit = Number(
      first(row, "minor_unit", "minorUnit", "decimal_places", "decimalPlaces"),
    );
    if (
      !/^[A-Z]{3}$/u.test(currencyCode) ||
      !Number.isSafeInteger(minorUnit) ||
      minorUnit < 0 ||
      minorUnit > 18 ||
      seen.has(currencyCode)
    ) {
      throw invalidResult();
    }
    seen.add(currencyCode);
    return { currencyCode, minorUnit };
  });
  if (currencies.length === 0) throw invalidResult();
  return currencies.sort((left, right) =>
    left.currencyCode.localeCompare(right.currencyCode)
  );
}

function first(row: Row, ...keys: readonly string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function invalidResult(): PlayerBankingFxError {
  return new PlayerBankingFxError(
    "player_banking_fx_result_invalid",
    "FX currencies returned an invalid result.",
    503,
    true,
  );
}
