window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.market = window.Econovaria.features.market || {};

function findMarket(ticker) {
  return (state.market || []).find((m) => String(m.ticker) === String(ticker));
}

// The canonical Market Data renderer is applied by market-data-refresh.js.
// This file owns only the shared market lookup helper so renderers do not compete.
Object.assign(window.Econovaria.features.market, { findMarket });
