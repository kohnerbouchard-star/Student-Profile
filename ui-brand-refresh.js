// UI brand and language refresh layer.
// Frontend-only: updates wording, brand mark, navigation labels, and visible copy after render.

(function initUiBrandRefresh() {
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

  const TEXT_REPLACEMENTS = new Map([
    ['Student portal', 'Market simulation'],
    ['My student dashboard', 'Market simulation'],
    ['My Dashboard', 'Overview'],
    ['Shop', 'Store'],
    ['Investments', 'Portfolio'],
    ['Trade Desk', 'Trading'],
    ['Market Explorer', 'Market Data'],
    ['Predictions', 'Forecasts'],
    ['Scan or enter your student code to open your dashboard. Your code stays hidden after sign in.', 'Enter or scan your student code to open your market simulation account.'],
    ['Open Dashboard', 'Open Account'],
    ['Your dashboard shows only your account, purchases, trades, and ratings.', 'Your account shows your balance, store activity, portfolio, trades, and forecasts.'],
    ['Synced account', 'Account active'],
    ['Successful actions update your dashboard automatically.', 'Balances and activity update after each confirmed action.'],
    ['Student dashboard', 'Market simulation'],
    ['Track your balance, shop items, investments, and market predictions.', 'Review your balance, portfolio, items, and recent activity.'],
    ['Dashboard opened. Your latest account data is loaded.', 'Account opened. Your latest data is ready.'],
    ['Dashboard refreshed.', 'Data refreshed.'],
    ['Sign in again to refresh your dashboard.', 'Sign in again to refresh your account.'],
    ['Refreshing your latest dashboard data...', 'Refreshing your latest account data...'],
    ['A quick look at your balance, recent activity, inventory, and investments.', 'Review your balance, portfolio, items, and recent activity.'],
    ['Buy classroom items with your current balance. Purchases update your account after they are confirmed.', 'Use your classroom balance to purchase available items.'],
    ['Track your current holdings and how your positions are doing in the market.', 'Track the stocks, bonds, and crypto you currently hold.'],
    ['Buy or sell shares during the trading window. Check your balance and holdings first.', 'Buy or sell market assets during the active trading window.'],
    ['Look through available companies and compare prices before making a move.', 'Compare prices, trends, asset types, and market movement.'],
    ['Submit a market prediction with a target price and a short reason.', 'Submit a target price and explain your market reasoning.'],
    ['Inventory', 'Items'],
    ['Items you have bought', 'Available item balance'],
    ['Shop Spent', 'Store Spend'],
    ['Total recent purchases', 'Recent purchases'],
    ['Stocks you currently own.', 'Market assets you currently hold.'],
    ['My Account', 'Account Summary'],
    ['This section shows your student account details.', 'This section summarizes your classroom economy account.'],
    ['My Items', 'Items'],
    ['Items you bought from the shop appear here.', 'Items purchased from the store appear here.'],
    ['No items yet. Visit the Shop to buy your first item.', 'No items yet. Visit the Store to buy your first item.'],
    ['Buy an Item', 'Purchase Item'],
    ['Choose an item and quantity. Your balance and item stock are checked before the purchase is saved.', 'Choose an item and quantity. Your balance and available stock are checked before purchase.'],
    ['Buy Item', 'Purchase Item'],
    ['Shop Items', 'Store Items'],
    ['The item list shows price, category, and current stock when available.', 'The store list shows price, category, and available stock.'],
    ['The shop is empty right now. Check again later.', 'The store is empty right now. Check again later.'],
    ['Purchase History', 'Store History'],
    ['Your recent shop purchases appear here after they are confirmed.', 'Recent store purchases appear here after they are confirmed.'],
    ['No investments yet. Use the Trade Desk to buy your first shares.', 'No portfolio positions yet. Use Trading to buy your first market asset.'],
    ['Place a Trade', 'Place Order'],
    ['BUY spends your balance. SELL gives money back if you own enough shares.', 'Buy uses your balance. Sell returns money if you hold enough shares.'],
    ['Stock', 'Asset'],
    ['Shares', 'Units'],
    ['Submit Trade', 'Place Order'],
    ['Trades are checked against your balance and current holdings.', 'Orders are checked against your balance and current holdings.'],
    ['Recent Trades', 'Recent Orders'],
    ['Your newest stock activity appears here after each confirmed trade.', 'Your newest market activity appears here after each confirmed order.'],
    ['No stock trades yet.', 'No market orders yet.'],
    ['Market Board', 'Market Data'],
    ['Use this table to compare current prices before trading.', 'Use this table to compare prices, trends, and asset types before trading.']
  ]);

  function injectStyles() {
    if (document.getElementById('uiBrandRefreshStyles')) return;

    const style = document.createElement('style');
    style.id = 'uiBrandRefreshStyles';
    style.textContent = `
      :root {
        --brand-navy: #0B1220;
        --brand-slate: #1E293B;
        --brand-orange: #EA580C;
        --brand-cream: #FFF7ED;
      }

      .brand {
        align-items: center;
      }

      .brand-mark {
        position: relative;
        overflow: hidden;
        background: linear-gradient(135deg, var(--brand-navy), var(--brand-slate));
        color: transparent;
        box-shadow: 0 12px 26px rgba(15, 23, 42, .18);
      }

      .brand-mark::before {
        content: '';
        position: absolute;
        inset: 8px;
        border: 3px solid var(--brand-cream);
        border-radius: 999px;
        z-index: 2;
      }

      .brand-mark::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 50%;
        width: 28px;
        height: 28px;
        transform: translate(-50%, -50%) rotate(45deg);
        background: linear-gradient(135deg, #FDBA74, var(--brand-orange));
        clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
        z-index: 3;
      }

      .brand-mark .ledger-grid {
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(rgba(148, 163, 184, .26) 1px, transparent 1px),
          linear-gradient(90deg, rgba(148, 163, 184, .26) 1px, transparent 1px);
        background-size: 15px 15px;
        opacity: .45;
        z-index: 1;
      }

      .brand-title {
        letter-spacing: -.02em;
      }

      .brand-subtitle {
        text-transform: uppercase;
        letter-spacing: .14em;
        font-weight: 900;
        color: var(--brand-orange);
      }

      .login-brand {
        align-items: center;
      }

      .login-brand .brand-mark {
        width: 58px;
        height: 58px;
        border-radius: 18px;
      }

      .sidebar .brand-mark {
        width: 52px;
        height: 52px;
        border-radius: 16px;
      }

      .nav-item {
        font-weight: 850;
      }

      .nav-item.active {
        background: linear-gradient(135deg, #0B1220, #1E293B);
        color: #fff;
      }

      .nav-item.active::after {
        background: var(--brand-orange);
      }

      .page-heading .eyebrow,
      .eyebrow {
        color: var(--brand-orange);
      }

      .primary-btn {
        background: linear-gradient(135deg, #0B1220, #1E293B);
      }

      .primary-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 16px 30px rgba(15, 23, 42, .22);
      }

      .badge.good {
        background: #ECFDF5;
        color: #047857;
      }

      @media (max-width: 780px) {
        .brand-mark::before {
          inset: 7px;
        }

        .mobile-tab.active {
          background: linear-gradient(135deg, #0B1220, #1E293B) !important;
          color: #fff;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function buildCompassMarks() {
    document.querySelectorAll('.brand-mark').forEach((mark) => {
      if (mark.dataset.compassReady === 'true') return;
      mark.dataset.compassReady = 'true';
      mark.innerHTML = '<span class="ledger-grid" aria-hidden="true"></span>';
      mark.setAttribute('aria-label', 'Classroom Economy Market Simulation');
      mark.setAttribute('title', 'Classroom Economy Market Simulation');
    });
  }

  function setBrandText() {
    document.querySelectorAll('.brand-title').forEach((el) => {
      el.textContent = 'Classroom Economy';
    });

    document.querySelectorAll('.brand-subtitle').forEach((el) => {
      el.textContent = 'Market simulation';
    });

    const title = document.querySelector('title');
    if (title) title.textContent = 'Classroom Economy Market Simulation';
  }

  function setNavigationLabels() {
    document.querySelectorAll('.nav-item[data-view]').forEach((button) => {
      const label = NAV_LABELS[button.dataset.view];
      if (label) button.textContent = label;
    });

    document.querySelectorAll('.mobile-tab[data-view]').forEach((button) => {
      const label = MOBILE_LABELS[button.dataset.view];
      const labelEl = button.querySelector('.mobile-tab-label');
      if (label && labelEl) labelEl.textContent = label;
    });
  }

  function updatePageCopy() {
    const activeView = document.querySelector('.view.active')?.id || 'profile';
    const copy = VIEW_COPY[activeView] || VIEW_COPY.profile;
    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');
    const eyebrow = document.querySelector('.page-heading .eyebrow');

    if (title) title.textContent = copy.title;
    if (subtitle) subtitle.textContent = copy.subtitle;
    if (eyebrow) eyebrow.textContent = 'Market simulation';
  }

  function replaceTextNodeValue(node) {
    const value = node.nodeValue;
    const trimmed = value.trim();
    if (!trimmed) return;

    if (TEXT_REPLACEMENTS.has(trimmed)) {
      node.nodeValue = value.replace(trimmed, TEXT_REPLACEMENTS.get(trimmed));
      return;
    }

    let nextValue = value;
    TEXT_REPLACEMENTS.forEach((replacement, target) => {
      if (nextValue.includes(target)) {
        nextValue = nextValue.split(target).join(replacement);
      }
    });

    if (nextValue !== value) node.nodeValue = nextValue;
  }

  function replaceVisibleText(root = document.body) {
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(replaceTextNodeValue);
  }

  function updateLoginCopy() {
    const loginCopy = document.querySelector('.login-copy');
    const loginButton = document.querySelector('#loginForm button[type="submit"]');
    const helper = document.querySelector('.helper-card');
    const fieldLabel = document.querySelector('#loginForm .field-label');
    const input = document.getElementById('loginCardId');

    if (loginCopy) loginCopy.textContent = 'Enter or scan your student code to open your market simulation account.';
    if (loginButton && !loginButton.dataset.loading) loginButton.textContent = 'Open Account';
    if (helper) helper.textContent = 'Your account shows your balance, store activity, portfolio, trades, and forecasts.';
    if (fieldLabel) fieldLabel.textContent = 'Student Code';
    if (input) input.placeholder = 'Enter or scan student code';
  }

  function updateSidebarCard() {
    const connectionMode = document.getElementById('connectionMode');
    const connectionCopy = document.getElementById('connectionCopy');

    if (connectionMode) connectionMode.textContent = 'Account active';
    if (connectionCopy) connectionCopy.textContent = 'Balances and activity update after each confirmed action.';
  }

  function patchGlobalStatus() {
    if (window.__uiBrandStatusPatched || typeof window.showGlobalStatus !== 'function') return;
    window.__uiBrandStatusPatched = true;

    const originalShowGlobalStatus = window.showGlobalStatus;
    window.showGlobalStatus = function patchedShowGlobalStatus(type, message) {
      let nextMessage = message;
      if (typeof nextMessage === 'string') {
        TEXT_REPLACEMENTS.forEach((replacement, target) => {
          nextMessage = nextMessage.split(target).join(replacement);
        });
      }
      return originalShowGlobalStatus.call(this, type, nextMessage);
    };
  }

  function patchSwitchView() {
    if (window.__uiBrandSwitchPatched || typeof window.switchView !== 'function') return;
    window.__uiBrandSwitchPatched = true;

    const originalSwitchView = window.switchView;
    window.switchView = function patchedSwitchView(view) {
      const result = originalSwitchView.apply(this, arguments);
      setTimeout(refreshUiBrand, 0);
      return result;
    };
  }

  function patchRenderCurrentView() {
    if (window.__uiBrandRenderPatched || typeof window.renderCurrentView !== 'function') return;
    window.__uiBrandRenderPatched = true;

    const originalRenderCurrentView = window.renderCurrentView;
    window.renderCurrentView = function patchedRenderCurrentView() {
      const result = originalRenderCurrentView.apply(this, arguments);
      setTimeout(refreshUiBrand, 0);
      return result;
    };
  }

  function refreshUiBrand() {
    buildCompassMarks();
    setBrandText();
    setNavigationLabels();
    updatePageCopy();
    updateLoginCopy();
    updateSidebarCard();
    replaceVisibleText();
  }

  function initObserver() {
    if (window.__uiBrandObserverReady) return;
    window.__uiBrandObserverReady = true;

    const observer = new MutationObserver(() => {
      clearTimeout(window.__uiBrandRefreshTimer);
      window.__uiBrandRefreshTimer = setTimeout(refreshUiBrand, 20);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    injectStyles();
    patchGlobalStatus();
    patchSwitchView();
    patchRenderCurrentView();
    initObserver();
    refreshUiBrand();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
