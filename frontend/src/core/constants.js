window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};

const API_URL = "https://silent-haze-ca17.kohner.workers.dev";
const SUPABASE_URL = "https://cgiukdjwicykrmtkhudh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_zkbXiJ1_zlmQIBMky6oi5w_4A24T1iV";
const CLASSROOM_API_URL = `${SUPABASE_URL}/functions/v1/classroom-api`;

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
  },
  ADMIN: {
    label: "Teacher admin",
    views: ["admin"],
    actions: []
  }
};

const VIEW_COPY = {
  profile: {
    title: "Overview",
    subtitle: "Review your balance, portfolio, items, and recent activity."
  },
  store: {
    title: "Store",
    subtitle: "Use your classroom balance to purchase available items."
  },
  portfolio: {
    title: "Portfolio",
    subtitle: "Track the stocks, bonds, and crypto you currently hold."
  },
  trade: {
    title: "Trading",
    subtitle: "Buy or sell market assets during the active trading window."
  },
  stockProfile: {
    title: "Market Data",
    subtitle: "Compare prices, trends, asset types, and market movement."
  },
  rating: {
    title: "Forecasts",
    subtitle: "Submit a target price and explain your market reasoning."
  },
  admin: {
    title: "Admin Console",
    subtitle: "Prototype teacher controls for monitoring the classroom economy."
  }
};

window.Econovaria.core.constants = {
  API_URL,
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  CLASSROOM_API_URL,
  PERMISSION_SETS,
  VIEW_COPY
};
