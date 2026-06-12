// Minimal copy cleanup for the Academic Market Dashboard UI.
// This avoids visual/logo overrides and only fixes labels that app.js re-renders dynamically.

(function initAcademicMarketCopy() {
  const VIEW_COPY = {
    profile: {
      title: 'Overview',
      subtitle: 'Review your balance, portfolio, items, and recent activity.'
    },
    store: {
      title: 'Store',
      subtitle: 'Use your classroom balance to purchase available items.'
    },
    portfolio: {
      title: 'Portfolio',
      subtitle: 'Track the stocks, bonds, and crypto you currently hold.'
    },
    trade: {
      title: 'Trading',
      subtitle: 'Buy or sell market assets during the active trading window.'
    },
    stockProfile: {
      title: 'Market Data',
      subtitle: 'Compare prices, trends, asset types, and market movement.'
    },
    rating: {
      title: 'Forecasts',
      subtitle: 'Submit a target price and explain your market reasoning.'
    }
  };

  const NAV_LABELS = {
    profile: 'Overview',
    store: 'Store',
    portfolio: 'Portfolio',
    trade: 'Trading',
    stockProfile: 'Market Data',
    rating: 'Forecasts'
  };

  const MOBILE_LABELS = {
    profile: 'Home',
    store: 'Store',
    portfolio: 'Portfolio',
    trade: 'Trade',
    stockProfile: 'Market',
    rating: 'Forecast'
  };

  const REPLACEMENTS = [
    ['My Dashboard', 'Overview'],
    ['Shop', 'Store'],
    ['Investments', 'Portfolio'],
    ['Trade Desk', 'Trading'],
    ['Market Explorer', 'Market Data'],
    ['Predictions', 'Forecasts'],
    ['Dashboard opened. Your latest account data is loaded.', 'Account opened. Your latest data is ready.'],
    ['Dashboard refreshed.', 'Data refreshed.'],
    ['Sign in again to refresh your dashboard.', 'Sign in again to refresh your account.'],
    ['Refreshing your latest dashboard data...', 'Refreshing your latest account data...'],
    ['Synced account', 'Account active'],
    ['Your dashboard updates after confirmed actions.', 'Balances and activity update after each confirmed action.'],
    ['A quick look at your balance, recent activity, inventory, and investments.', 'Review your balance, portfolio, items, and recent activity.'],
    ['Buy classroom items with your current balance. Purchases update your account after they are confirmed.', 'Use your classroom balance to purchase available items.'],
    ['Track your current holdings and how your positions are doing in the market.', 'Track the stocks, bonds, and crypto you currently hold.'],
    ['Buy or sell shares during the trading window. Check your balance and holdings first.', 'Buy or sell market assets during the active trading window.'],
    ['Look through available companies and compare prices before making a move.', 'Compare prices, trends, asset types, and market movement.'],
    ['Submit a market prediction with a target price and a short reason.', 'Submit a target price and explain your market reasoning.'],
    ['Inventory', 'Items'],
    ['Shop Spent', 'Store Spend'],
    ['Stocks you currently own.', 'Market assets you currently hold.'],
    ['My Account', 'Account Summary'],
    ['This section shows your student account details.', 'This section summarizes your classroom economy account.'],
    ['My Items', 'Items'],
    ['Items you bought from the shop appear here.', 'Items purchased from the store appear here.'],
    ['No items yet. Visit the Shop to buy your first item.', 'No items yet. Visit the Store to buy your first item.'],
    ['Buy an Item', 'Purchase Item'],
    ['Buy Item', 'Purchase Item'],
    ['Choose an item and quantity. Your balance and item stock are checked before the purchase is saved.', 'Choose an item and quantity. Your balance and item stock are checked automatically before purchase.'],
    ['Shop Items', 'Store Items'],
    ['The shop is empty right now. Check again later.', 'The store is empty right now. Check again later.'],
    ['Your recent shop purchases appear here after they are confirmed.', 'Recent store purchases appear here after they are confirmed.'],
    ['No investments yet. Use the Trade Desk to buy your first shares.', 'No portfolio positions yet. Use Trading to buy your first market asset.'],
    ['Place a Trade', 'Place Order'],
    ['Submit Trade', 'Place Order'],
    ['No stock trades yet.', 'No market orders yet.']
  ];

  function replaceString(value) {
    if (typeof value !== 'string') return value;
    return REPLACEMENTS.reduce((text, pair) => text.split(pair[0]).join(pair[1]), value);
  }

  function syncNavigation() {
    document.querySelectorAll('.nav-item[data-view]').forEach((button) => {
      const label = NAV_LABELS[button.dataset.view];
      if (label) button.textContent = label;
    });

    document.querySelectorAll('.mobile-tab[data-view]').forEach((button) => {
      const label = MOBILE_LABELS[button.dataset.view];
      const labelEl = button.querySelector('.mobile-tab-label');
      if (labelEl && label) labelEl.textContent = label;
      if (label) button.setAttribute('aria-label', label);
    });
  }

  function syncPageHeading() {
    const activeView = document.querySelector('.view.active')?.id || 'profile';
    const copy = VIEW_COPY[activeView] || VIEW_COPY.profile;
    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');
    const eyebrow = document.querySelector('.page-heading .eyebrow');

    if (title) title.textContent = copy.title;
    if (subtitle) subtitle.textContent = copy.subtitle;
    if (eyebrow) eyebrow.textContent = 'Market simulation';
  }

  function syncStoreCopy() {
    const storeStatus = document.getElementById('storeStatus');
    const currentText = String(storeStatus?.textContent || '').trim();

    if (storeStatus && /^Purchases are submitted for .+\.$/.test(currentText)) {
      storeStatus.textContent = 'Purchases are checked and saved after confirmation.';
    }
  }

  function replaceVisibleText(root = document.body) {
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const next = replaceString(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    });
  }

  function syncCopy() {
    syncNavigation();
    syncPageHeading();
    replaceVisibleText();
    syncStoreCopy();

    const mode = document.getElementById('connectionMode');
    const copy = document.getElementById('connectionCopy');
    if (mode) mode.textContent = 'Account active';
    if (copy) copy.textContent = 'Balances and activity update after each confirmed action.';
  }

  function patchFunction(name) {
    if (window[`__academicMarketPatched_${name}`] || typeof window[name] !== 'function') return;
    window[`__academicMarketPatched_${name}`] = true;

    const original = window[name];
    window[name] = function patchedAcademicMarketFunction() {
      const result = original.apply(this, arguments);
      setTimeout(syncCopy, 0);
      return result;
    };
  }

  function patchStatus() {
    if (window.__academicMarketStatusPatched || typeof window.showGlobalStatus !== 'function') return;
    window.__academicMarketStatusPatched = true;

    const original = window.showGlobalStatus;
    window.showGlobalStatus = function patchedShowGlobalStatus(type, message) {
      return original.call(this, type, replaceString(message));
    };
  }

  function initObserver() {
    if (window.__academicMarketCopyObserver) return;
    window.__academicMarketCopyObserver = true;

    const observer = new MutationObserver(() => {
      clearTimeout(window.__academicMarketCopyTimer);
      window.__academicMarketCopyTimer = setTimeout(syncCopy, 25);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    patchFunction('switchView');
    patchFunction('renderCurrentView');
    patchFunction('updateIdentity');
    patchStatus();
    initObserver();
    syncCopy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
