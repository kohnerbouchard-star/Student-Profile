const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const scriptPath = path.join(root, "dist", "admin-overview-terminal.js");
const source = fs.readFileSync(scriptPath, "utf8");

const stylesheetPath = path.join(root, "css", "admin-overview-terminal.css");
const stylesheetSource = fs.readFileSync(stylesheetPath, "utf8");
if (!stylesheetSource.includes("v496 — contract modal formatting cleanup")) {
  throw new Error("Contract CSS cleanup block is missing.");
}
if (stylesheetSource.includes("grid-template-columns:minmax(0,1fr)320px") || stylesheetSource.includes("height:clamp(126px,18vh,165px)") || stylesheetSource.includes("v494: richer contract authoring") || stylesheetSource.includes("v495 — simplified contract authoring")) {
  throw new Error("Old stacked Contract modal CSS overrides should not remain active.");
}

const createdNodes = [];
const listeners = [];

function makeElement(tagName = "div") {
  const attrs = new Map();
  const node = {
    tagName: tagName.toUpperCase(),
    id: "",
    rel: "",
    href: "",
    hidden: false,
    textContent: "",
    innerHTML: "",
    dataset: {},
    style: {},
    value: "",
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    setAttribute(name, value = "") {
      attrs.set(name, String(value));
      if (name === "id") this.id = String(value);
      if (name.startsWith("data-")) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, chr) => chr.toUpperCase());
        this.dataset[key] = String(value);
      }
    },
    getAttribute(name) { return attrs.get(name) || null; },
    appendChild(child) { createdNodes.push(child); return child; },
    remove() {},
    addEventListener(type, handler) { listeners.push({ type, handler, node: this }); },
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    matches() { return false; },
    focus() {},
    select() {},
  };
  return node;
}

const documentMock = {
  head: makeElement("head"),
  body: makeElement("body"),
  createElement: makeElement,
  getElementById() { return null; },
  querySelector(selector) {
    if (selector === "link[data-admin-terminal-stylesheet]") {
      return createdNodes.find((node) => node.tagName === "LINK" && node.dataset.adminTerminalStylesheet !== undefined) || null;
    }
    return null;
  },
  querySelectorAll() { return []; },
  addEventListener(type, handler) { listeners.push({ type, handler, node: this }); },
  removeEventListener() {},
};

const windowMock = {
  Econovaria: { features: {} },
  state: {},
  currentSession: {},
  document: documentMock,
  navigator: { clipboard: { writeText: async () => {} } },
  location: { href: "file:///index.html", origin: "file://", pathname: "/index.html" },
  requestAnimationFrame(callback) { if (typeof callback === "function") callback(); return 1; },
  cancelAnimationFrame() {},
  setInterval() { return 1; },
  clearInterval() {},
  setTimeout(callback) { if (typeof callback === "function") callback(); return 1; },
  clearTimeout() {},
};

const context = {
  window: windowMock,
  document: documentMock,
  console,
  navigator: windowMock.navigator,
  setInterval: windowMock.setInterval,
  clearInterval: windowMock.clearInterval,
  setTimeout: windowMock.setTimeout,
  clearTimeout: windowMock.clearTimeout,
};
context.global = context;
context.self = windowMock;

vm.createContext(context);
vm.runInContext(source, context, { filename: scriptPath });

const feature = windowMock.Econovaria.features.adminOverviewTerminal;
const requiredExports = [
  "renderShell",
  "renderAddPlayerModal",
  "renderAttendanceScannerModal",
  "renderAddContractModal",
  "renderAddStoreItemModal",
  "injectStyles"
];
for (const key of requiredExports) {
  if (!feature || typeof feature[key] !== "function") {
    throw new Error(`${key} was not exported.`);
  }
}

const shellHtml = feature.renderShell();
if (typeof shellHtml !== "string" || !shellHtml.includes("admin-terminal-shell")) {
  throw new Error("renderShell did not return the expected shell markup.");
}

const playerModal = feature.renderAddPlayerModal({ players: [] });
if (!playerModal.includes("admin-terminal-player-form") || !playerModal.includes("Create Player")) {
  throw new Error("renderAddPlayerModal did not return expected player modal markup.");
}

const profileModal = feature.renderDashboardPlayerProfileModal({ name: "Test Player", rank: 1 });
if (!profileModal.includes("assets/icons/player-info.svg") || !profileModal.includes("assets/icons/player-configure.svg")) {
  throw new Error("renderDashboardPlayerProfileModal did not include SCI-ID rail icons.");
}

if (!shellHtml.includes("admin-terminal-nav-icon--overview") || !shellHtml.includes("admin-terminal-nav-icon--logs") || !shellHtml.includes("<svg")) {
  throw new Error("renderShell did not include the inline left-nav SVG icons.");
}

feature.currentSection = "Store";
const storeHtml = feature.renderShell();
if (!storeHtml.includes("admin-terminal-store-page") || !storeHtml.includes("data-store-item")) {
  throw new Error("renderShell did not render the Store page correctly.");
}
if (!storeHtml.includes("data-store-source=\"system\"") || !storeHtml.includes("data-store-source=\"custom\"") || !storeHtml.includes("System") || !storeHtml.includes("Custom")) {
  throw new Error("Store page did not include system/custom source separation.");
}
const storeModal = feature.renderAddStoreItemModal({});
if (!storeModal.includes("Create Custom Item") || !storeModal.includes("System-seeded Store items") || storeModal.includes("Backend UUID") || storeModal.includes("Assigned on create")) {
  throw new Error("Add Store modal should create custom items without exposing backend IDs.");
}
const storeEditModal = feature.renderAddStoreItemModal({ __storeEditItem: { name: "Workshop Access Pass", category: "Consumable", itemType: "Access pass", price: "12.00", currency: "Steam Bucks", stockMode: "Limited", stockQuantity: "18", status: "Active" } });
if (!storeEditModal.includes("Edit Custom Item") || !storeEditModal.includes("Workshop Access Pass") || !storeEditModal.includes("Save Changes")) {
  throw new Error("Edit Store modal did not render prefilled custom item controls.");
}
if (!storeHtml.includes('data-admin-terminal-action="edit-store-item"') || !storeHtml.includes('data-store-edit-name="Teacher Bonus Coupon"') || storeHtml.includes('data-store-edit-uuid=')) {
  throw new Error("Store custom edit buttons should render without backend ID payloads.");
}
if (storeHtml.includes("SKU") || storeModal.includes("SKU") || storeEditModal.includes("SKU") || storeHtml.includes("UUID") || storeModal.includes("UUID") || storeEditModal.includes("UUID")) {
  throw new Error("Store UI should not expose SKU or UUID labels.");
}

feature.currentSection = "Market";
const marketHtml = feature.renderShell();
if (!marketHtml.includes("admin-terminal-market-page") || !marketHtml.includes("admin-terminal-marketplace-layout") || !marketHtml.includes("admin-terminal-marketplace-workspace") || !marketHtml.includes("data-marketplace-search")) {
  throw new Error("Marketplace page did not render the searchable trading terminal.");
}
if (!marketHtml.includes("admin-terminal-marketplace-toolbar") || !marketHtml.includes("admin-terminal-marketplace-toolbar-filters") || marketHtml.includes("admin-terminal-market-command")) {
  throw new Error("Marketplace should use the minimalist v502 search/filter toolbar instead of the old metric command strip.");
}
if (marketHtml.includes("admin-terminal-marketplace-toolbar-count") || marketHtml.includes("<span>Market</span>")) {
  throw new Error("Marketplace toolbar should not render the Market count card.");
}
if (!marketHtml.includes('data-admin-terminal-action="select-market-security"') || !marketHtml.includes('data-admin-terminal-action="marketplace-place-order"') || !marketHtml.includes('data-admin-terminal-action="marketplace-load-option"')) {
  throw new Error("Marketplace page is missing security selection, order submission, or option-chain actions.");
}
if (!marketHtml.includes("Stock") || !marketHtml.includes("Bond") || !marketHtml.includes("Index") || !marketHtml.includes("ETF") || !marketHtml.includes("Commodity") || !marketHtml.includes("Option")) {
  throw new Error("Marketplace should include stocks, bonds, indexes, ETFs, commodities, and options.");
}
if (!marketHtml.includes("Stop Loss") || !marketHtml.includes("Short Sell") || !marketHtml.includes("Cover Short")) {
  throw new Error("Marketplace order ticket should include stop-loss and short-order controls.");
}

if (!marketHtml.includes("is-marketplace-v505") || !marketHtml.includes("is-marketplace-v506") || !marketHtml.includes("is-marketplace-v507") || !marketHtml.includes("is-marketplace-v508") || !marketHtml.includes("is-marketplace-v509") || !marketHtml.includes("is-marketplace-v510") || !marketHtml.includes("is-marketplace-v513") || !marketHtml.includes("is-marketplace-v514") || !marketHtml.includes("is-marketplace-v519")) {
  throw new Error("Marketplace page should include the v505-v514 chart styling, range-data, cursor-tooltip, live-feed, compare, financial layout, hover-guide, and admin-marker classes.");
}

if (!marketHtml.includes("admin-terminal-marketplace-chart") || !marketHtml.includes("is-finance-reference") || !marketHtml.includes("admin-terminal-marketplace-close-line") || !marketHtml.includes("admin-terminal-marketplace-candle") || !marketHtml.includes("admin-terminal-marketplace-price-tag") || !marketHtml.includes("admin-terminal-marketplace-crosshair")) {
  throw new Error("Marketplace should render a full-width finance-style chart with close line, candles, crosshair, price axis, and volume pane instead of the old sparkline-only view.");
}
if (!marketHtml.includes("admin-terminal-marketplace-chart-mode") || !marketHtml.includes("Compare") || !marketHtml.includes("Indicators") || !marketHtml.includes("MAX")) {
  throw new Error("Marketplace chart should include finance-style chart controls and expanded timeframe options.");
}
if (!marketHtml.includes('data-marketplace-chart-style="candle"') || !marketHtml.includes('data-admin-terminal-action="marketplace-set-chart-style"') || !marketHtml.includes('data-admin-terminal-action="marketplace-toggle-chart-menu"') || !marketHtml.includes('data-marketplace-chart-menu="style"')) {
  throw new Error("Marketplace chart style dropdown should render with actionable Line/Area/Candle/Bar controls.");
}
if (!marketHtml.includes('data-admin-terminal-action="marketplace-set-chart-compare"') || !marketHtml.includes('data-admin-terminal-action="marketplace-set-chart-indicator"') || !marketHtml.includes('data-marketplace-compare-line="SABLE"') || !marketHtml.includes('is-compare-picker') || !marketHtml.includes('data-marketplace-indicator-line="ma20"')) {
  throw new Error("Marketplace Compare should render stock/security comparison choices and Indicators should render actionable overlay controls.");
}
if (!marketHtml.includes("data-marketplace-chart-root") || !marketHtml.includes('data-admin-terminal-action="marketplace-set-timeframe"') || !marketHtml.includes("data-marketplace-candle-hit") || !marketHtml.includes("data-marketplace-chart-tooltip hidden")) {
  throw new Error("Marketplace should include realtime-ready chart hooks, timeframe controls, and hidden cursor tooltip hit zones.");
}
if (marketHtml.includes("data-marketplace-chart-marker") || marketHtml.includes("admin-terminal-marketplace-marker") || marketHtml.includes('data-marketplace-admin-events="true"')) {
  throw new Error("Marketplace chart should not render Economy/Trade marker symbols on the graph.");
}
if (!marketHtml.includes("data-marketplace-hover-guide") || !marketHtml.includes("data-chart-x=") || !source.includes("formatMarketplaceChartTooltipContent") || !source.includes("style === \"candle\" || style === \"bar\"") || !source.includes("Price ${price}")) {
  throw new Error("Marketplace hover tooltip should be chart-type aware and include a moving vertical hover guide.");
}

if (!source.includes('const markers = ""')) {
  throw new Error("Marketplace chart marker rendering should remain disabled after Economy/Trade marker removal.");
}



if (!marketHtml.includes("admin-terminal-marketplace-icon-cell") || !marketHtml.includes("admin-terminal-marketplace-ui-icon")) {
  throw new Error("Marketplace icon formatting wrappers are missing.");
}
if (!marketHtml.includes("admin-terminal-marketplace-feed-pill") || !marketHtml.includes("admin-terminal-marketplace-feed-time") || !marketHtml.includes("data-marketplace-last-tick>Standby</time>")) {
  throw new Error("Marketplace chart live-feed strip should render as the compact v509 status pill with a separated tick time.");
}
if (!marketHtml.includes('data-marketplace-chart-frame="1D"') || !marketHtml.includes('data-marketplace-chart-frame="MAX"') || !marketHtml.includes('data-marketplace-axis-mode="time"') || !marketHtml.includes('data-marketplace-axis-mode="dayHours"') || !marketHtml.includes('data-marketplace-axis-mode="years"') || !marketHtml.includes("1D intraday") || !marketHtml.includes("5D hourly") || !marketHtml.includes("MAX annual")) {
  throw new Error("Marketplace timeframe buttons should be backed by range-specific chart frames and axis label modes, including 5D hourly labels.");
}

if (/\bD\d+\b|Day\s+\d+/i.test(marketHtml)) {
  throw new Error("Marketplace chart should use calendar-style labels instead of D#/Day# placeholders for day-based and longer timeframes.");
}
if (!marketHtml.includes("Jun ") && !marketHtml.includes("Jul ")) {
  throw new Error("Marketplace chart should render abbreviated month/day labels for day-based ranges.");
}
if (!/\b(?:Jun|Jul)\s+\d+\s+·\s+\d{2}:\d{2}/.test(marketHtml)) {
  throw new Error("Marketplace 5D chart labels should include abbreviated month/day plus hour.");
}
if (!marketHtml.includes("Jan 2026") && !marketHtml.includes("Jul 2026")) {
  throw new Error("Marketplace chart should render abbreviated month/year labels for month/year-based ranges.");
}
if (!marketHtml.includes("Company financials") || !marketHtml.includes("admin-terminal-marketplace-financial-table") || !marketHtml.includes('data-financial-tab="income"') || !marketHtml.includes('data-financial-panel="cashflow"') || !marketHtml.includes("Balance")) {
  throw new Error("Marketplace should include a cleaner tabbed financial statements drawer for selected securities.");
}
feature.currentSection = "Overview";

const scannerModal = feature.renderAttendanceScannerModal({});
if (!scannerModal.includes("data-admin-terminal-scanner-console") || !scannerModal.includes("Manual")) {
  throw new Error("renderAttendanceScannerModal did not return expected scanner controls.");
}

feature.injectStyles();
const stylesheet = createdNodes.find((node) => node.tagName === "LINK" && node.href === "./css/admin-overview-terminal.css");
if (!stylesheet) {
  throw new Error("injectStyles did not attach the external admin stylesheet.");
}

const clickListener = listeners.find((item) => item.type === "click" && item.node === documentMock);
const keyListener = listeners.find((item) => item.type === "keydown" && item.node === documentMock);
const inputListener = listeners.find((item) => item.type === "input" && item.node === documentMock);
const changeListener = listeners.find((item) => item.type === "change" && item.node === documentMock);
const candleHoverListener = listeners.find((item) => item.type === "mouseover" && item.node === documentMock);
const candleOutListener = listeners.find((item) => item.type === "mouseout" && item.node === documentMock);
if (!clickListener || !keyListener || !inputListener || !changeListener || !candleHoverListener || !candleOutListener) {
  throw new Error("Expected document-level click, keydown, input, change, and Marketplace chart hover listeners were not registered.");
}

console.log("Smoke test passed: exports, modal markup, stylesheet injection, and event binding are intact.");

if (storeHtml.includes("Risk Read") || storeModal.includes("Risk Read") || storeEditModal.includes("Risk Read")) {
  throw new Error("Store UI should not expose Risk Read detail label.");
}

if (storeHtml.includes("Macro Driver") || storeHtml.includes("High inflation") || storeHtml.includes("Strong AS") || storeHtml.includes("Currency pressure") || storeHtml.includes("Trade restricted") || storeHtml.includes("Backend priced by country macro")) {
  throw new Error("Store UI should show price/restock outputs without exposing macro calculation drivers.");
}
if (storeHtml.includes("Per-player limit") || storeModal.includes("Per-player limit") || storeEditModal.includes("Per-player limit") || storeHtml.includes("<small>Limit</small>") || storeModal.includes("<span>Limit</span>") || storeEditModal.includes("<span>Limit</span>")) {
  throw new Error("Store UI should not expose item purchase limit controls or labels.");
}

if (storeHtml.includes(" held") || storeHtml.includes("Held") || storeHtml.includes("Reserved")) {
  throw new Error("Store UI should not expose held/reserved stock because rewards are system-issued, not store-stock issued.");
}
