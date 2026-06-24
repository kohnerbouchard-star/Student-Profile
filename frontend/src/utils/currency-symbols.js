window.Econovaria = window.Econovaria || {};
window.Econovaria.utils = window.Econovaria.utils || {};

const CURRENCY_SYMBOL_ASSET_BASE_PATH = "frontend/src/assets/currency-symbols";

const CURRENCY_SYMBOLS_BY_CODE = {
  NRC: { countryCode: "NORTHREACH", currencyName: "Northreach Credit", symbolKey: "saturn", fallbackSymbol: "SAT", asset: "saturn.svg" },
  YRC: { countryCode: "YRETHIA", currencyName: "Yrethian Crown", symbolKey: "neptune", fallbackSymbol: "NEP", asset: "neptune.svg" },
  THD: { countryCode: "THALORIS", currencyName: "Thaloris Dinar", symbolKey: "arsenic", fallbackSymbol: "ARS", asset: "arsenic.svg" },
  SLV: { countryCode: "SOLVEND", currencyName: "Solvend Volt", symbolKey: "jupiter", fallbackSymbol: "JUP", asset: "jupiter.svg" },
  ELD: { countryCode: "ELDORAN", currencyName: "Eldoran Ducat", symbolKey: "alumen", fallbackSymbol: "ALU", asset: "alumen.svg" },
  VAL: { countryCode: "VALERION", currencyName: "Valerion Lira", symbolKey: "gold", fallbackSymbol: "GLD", asset: "gold.svg" },
  LUM: { countryCode: "LUMENOR", currencyName: "Lumenor Mark", symbolKey: "lapis_lazuli", fallbackSymbol: "LAP", asset: "lapis_lazuli.svg" },
  SYN: { countryCode: "SYNDALIS", currencyName: "Syndalis Note", symbolKey: "alcali", fallbackSymbol: "ALC", asset: "alcali.svg" },
  XAL: { countryCode: "XALVORIA", currencyName: "Xalvorian Lira", symbolKey: "lead", fallbackSymbol: "LED", asset: "lead.svg" },
  DRV: { countryCode: "DRAVENLOK", currencyName: "Dravenlok Vek", symbolKey: "ferrum", fallbackSymbol: "FER", asset: "ferrum.svg" }
};

function normalizeCurrencyCode(currencyCode) {
  return String(currencyCode || "ECO").trim().toUpperCase();
}

function readCurrencySymbolMeta(currencyCode) {
  const code = normalizeCurrencyCode(currencyCode);
  return CURRENCY_SYMBOLS_BY_CODE[code] || {
    countryCode: "",
    currencyName: code,
    symbolKey: "",
    fallbackSymbol: code,
    asset: ""
  };
}

function readCurrencySymbolAssetPath(currencyCode) {
  const meta = readCurrencySymbolMeta(currencyCode);
  return meta.asset ? `${CURRENCY_SYMBOL_ASSET_BASE_PATH}/${meta.asset}` : "";
}

function renderCurrencySymbol(currencyCode, options = {}) {
  const code = normalizeCurrencyCode(currencyCode);
  const meta = readCurrencySymbolMeta(code);
  const assetPath = readCurrencySymbolAssetPath(code);
  const label = options.label || `${meta.currencyName || code} symbol`;
  const className = options.className || "currency-symbol";
  const text = meta.fallbackSymbol || code;

  if (!assetPath) {
    return `<span class="${sanitize(className)}" aria-label="${sanitize(label)}">${sanitize(text)}</span>`;
  }

  return `<span class="${sanitize(className)}" title="${sanitize(meta.currencyName || code)}" aria-label="${sanitize(label)}"><img src="${sanitize(assetPath)}" alt="" aria-hidden="true" loading="lazy" /><span class="currency-symbol-fallback">${sanitize(text)}</span></span>`;
}

function formatCurrencyAmount(value, currencyCode) {
  if (!isFiniteDisplayNumber(value)) return "—";

  const number = Number(String(value).replace(/[$,]/g, "").trim());
  const code = normalizeCurrencyCode(currencyCode);
  const amount = number.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${amount} ${code}`;
}

function renderCurrencyAmount(value, currencyCode, options = {}) {
  const code = normalizeCurrencyCode(currencyCode);
  const text = formatCurrencyAmount(value, code);

  if (text === "—") return text;

  return `<span class="currency-amount">${renderCurrencySymbol(code, options)}<span class="currency-amount-value">${sanitize(text)}</span></span>`;
}

Object.assign(window.Econovaria.utils, {
  CURRENCY_SYMBOLS_BY_CODE,
  normalizeCurrencyCode,
  readCurrencySymbolMeta,
  readCurrencySymbolAssetPath,
  renderCurrencySymbol,
  formatCurrencyAmount,
  renderCurrencyAmount
});
