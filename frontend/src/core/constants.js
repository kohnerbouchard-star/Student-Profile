window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};

const API_URL = "https://silent-haze-ca17.kohner.workers.dev";

const PERMISSION_SETS = {
  STUDENT: {
    label: "Ready",
    views: ["profile", "store", "portfolio", "trade", "stockProfile", "rating"],
    actions: ["STORE_PURCHASE", "STOCK_TRADE", "SUBMIT_RATING"]
  },
  READ_ONLY: {
    label: "View only",
    views: ["profile", "store", "portfolio", "trade", "stockProfile", "rating"],
    actions: []
  }
};

const VIEW_COPY = {
  profile: {
    title: "My Dashboard",
    subtitle: "A quick look at your balance, recent activity, inventory, and investments."
  },
  store: {
    title: "Shop",
    subtitle: "Buy classroom items with your current balance. Purchases update your account after they are confirmed."
  },
  portfolio: {
    title: "Investments",
    subtitle: "Track your current holdings and how your positions are doing in the market."
  },
  trade: {
    title: "Trade Desk",
    subtitle: "Buy or sell shares during the trading window. Check your balance and holdings first."
  },
  stockProfile: {
    title: "Market Explorer",
    subtitle: "Look through available companies and compare prices before making a move."
  },
  rating: {
    title: "Predictions",
    subtitle: "Submit a market prediction with a target price and a short reason."
  }
};

window.Econovaria.core.constants = { API_URL, PERMISSION_SETS, VIEW_COPY };
