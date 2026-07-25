import type {
  FinancialMarketAssetClass,
  FinancialMarketCountryCode,
} from "../contracts/financialMarketContracts.ts";
import {
  addMarketDecimals,
  compareMarketDecimals,
  multiplyMarketDecimals,
  subtractMarketDecimals,
} from "./decimalMath.ts";

export interface MultiCurrencyAttributionHolding {
  readonly instrumentPublicId: string;
  readonly countryCode: FinancialMarketCountryCode;
  readonly assetClass: FinancialMarketAssetClass;
  readonly quotationCurrencyCode: string;
  readonly startingValueLocal: string;
  readonly endingValueLocal: string;
  readonly netCashFlowLocal: string;
  readonly startingFxRateToBase: string;
  readonly endingFxRateToBase: string;
}

export interface MultiCurrencyPositionAttribution {
  readonly instrumentPublicId: string;
  readonly quotationCurrencyCode: string;
  readonly startingValueBase: string;
  readonly endingValueBase: string;
  readonly cashFlowBase: string;
  readonly localMarketContributionBase: string;
  readonly currencyContributionBase: string;
  readonly totalContributionBase: string;
}

export interface MultiCurrencyPortfolioAttribution {
  readonly baseCurrencyCode: string;
  readonly startingValueBase: string;
  readonly endingValueBase: string;
  readonly netCashFlowBase: string;
  readonly localMarketContributionBase: string;
  readonly currencyContributionBase: string;
  readonly totalContributionBase: string;
  readonly currencyContributions: Readonly<Record<string, string>>;
  readonly countryContributions: Readonly<Record<string, string>>;
  readonly assetClassContributions: Readonly<Record<string, string>>;
  readonly positions: readonly MultiCurrencyPositionAttribution[];
  readonly activationAuthorized: false;
  readonly deterministic: true;
}

export function attributeMultiCurrencyPortfolio(
  holdings: readonly MultiCurrencyAttributionHolding[],
  baseCurrencyCode: string,
): MultiCurrencyPortfolioAttribution {
  assertCurrency(baseCurrencyCode, "base_currency_invalid");
  if (holdings.length === 0) throw new Error("attribution_holdings_required");

  const ordered = [...holdings].sort((left, right) =>
    left.instrumentPublicId.localeCompare(right.instrumentPublicId)
  );
  const seen = new Set<string>();
  const positions: MultiCurrencyPositionAttribution[] = [];
  const currencyContributions: Record<string, string> = {};
  const countryContributions: Record<string, string> = {};
  const assetClassContributions: Record<string, string> = {};

  let startingValueBase = "0";
  let endingValueBase = "0";
  let netCashFlowBase = "0";
  let localMarketContributionBase = "0";
  let currencyContributionBase = "0";
  let totalContributionBase = "0";

  for (const holding of ordered) {
    validateHolding(holding);
    if (seen.has(holding.instrumentPublicId)) {
      throw new Error("duplicate_attribution_instrument");
    }
    seen.add(holding.instrumentPublicId);

    const positionStartingValueBase = multiplyMarketDecimals(
      holding.startingValueLocal,
      holding.startingFxRateToBase,
    );
    const positionEndingValueBase = multiplyMarketDecimals(
      holding.endingValueLocal,
      holding.endingFxRateToBase,
    );
    const positionCashFlowBase = multiplyMarketDecimals(
      holding.netCashFlowLocal,
      holding.endingFxRateToBase,
    );
    const localChangeLocal = subtractMarketDecimals(
      addMarketDecimals(holding.endingValueLocal, holding.netCashFlowLocal),
      holding.startingValueLocal,
    );
    const localContribution = multiplyMarketDecimals(
      localChangeLocal,
      holding.startingFxRateToBase,
    );
    const fxRateChange = subtractMarketDecimals(
      holding.endingFxRateToBase,
      holding.startingFxRateToBase,
    );
    const currencyContribution = multiplyMarketDecimals(
      addMarketDecimals(holding.endingValueLocal, holding.netCashFlowLocal),
      fxRateChange,
    );
    const totalContribution = addMarketDecimals(
      localContribution,
      currencyContribution,
    );
    const directlyReconciledContribution = subtractMarketDecimals(
      addMarketDecimals(positionEndingValueBase, positionCashFlowBase),
      positionStartingValueBase,
    );
    if (compareMarketDecimals(totalContribution, directlyReconciledContribution) !== 0) {
      throw new Error("multi_currency_attribution_reconciliation_failure");
    }

    startingValueBase = addMarketDecimals(
      startingValueBase,
      positionStartingValueBase,
    );
    endingValueBase = addMarketDecimals(endingValueBase, positionEndingValueBase);
    netCashFlowBase = addMarketDecimals(netCashFlowBase, positionCashFlowBase);
    localMarketContributionBase = addMarketDecimals(
      localMarketContributionBase,
      localContribution,
    );
    currencyContributionBase = addMarketDecimals(
      currencyContributionBase,
      currencyContribution,
    );
    totalContributionBase = addMarketDecimals(
      totalContributionBase,
      totalContribution,
    );

    accumulate(
      currencyContributions,
      holding.quotationCurrencyCode,
      totalContribution,
    );
    accumulate(countryContributions, holding.countryCode, totalContribution);
    accumulate(assetClassContributions, holding.assetClass, totalContribution);

    positions.push({
      instrumentPublicId: holding.instrumentPublicId,
      quotationCurrencyCode: holding.quotationCurrencyCode,
      startingValueBase: positionStartingValueBase,
      endingValueBase: positionEndingValueBase,
      cashFlowBase: positionCashFlowBase,
      localMarketContributionBase: localContribution,
      currencyContributionBase: currencyContribution,
      totalContributionBase: totalContribution,
    });
  }

  const directPortfolioContribution = subtractMarketDecimals(
    addMarketDecimals(endingValueBase, netCashFlowBase),
    startingValueBase,
  );
  if (compareMarketDecimals(totalContributionBase, directPortfolioContribution) !== 0) {
    throw new Error("multi_currency_portfolio_reconciliation_failure");
  }

  return {
    baseCurrencyCode,
    startingValueBase,
    endingValueBase,
    netCashFlowBase,
    localMarketContributionBase,
    currencyContributionBase,
    totalContributionBase,
    currencyContributions: sortRecord(currencyContributions),
    countryContributions: sortRecord(countryContributions),
    assetClassContributions: sortRecord(assetClassContributions),
    positions,
    activationAuthorized: false,
    deterministic: true,
  };
}

function validateHolding(holding: MultiCurrencyAttributionHolding): void {
  if (!holding.instrumentPublicId.trim() || holding.instrumentPublicId.length > 180) {
    throw new Error("attribution_instrument_public_id_invalid");
  }
  assertCurrency(holding.quotationCurrencyCode, "quotation_currency_invalid");
  for (const [value, errorCode] of [
    [holding.startingValueLocal, "starting_value_invalid"],
    [holding.endingValueLocal, "ending_value_invalid"],
  ] as const) {
    if (compareMarketDecimals(value, "0") < 0) throw new Error(errorCode);
  }
  for (const [value, errorCode] of [
    [holding.startingFxRateToBase, "starting_fx_rate_invalid"],
    [holding.endingFxRateToBase, "ending_fx_rate_invalid"],
  ] as const) {
    if (compareMarketDecimals(value, "0") <= 0) throw new Error(errorCode);
  }
}

function assertCurrency(value: string, errorCode: string): void {
  if (!/^[A-Z]{3,16}$/.test(value)) throw new Error(errorCode);
}

function accumulate(
  target: Record<string, string>,
  key: string,
  amount: string,
): void {
  target[key] = addMarketDecimals(target[key] ?? "0", amount);
}

function sortRecord(
  record: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}
