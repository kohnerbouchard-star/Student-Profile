// Mobile UX fixes for the student portal.
// Adds bottom tab navigation, phone-friendly tables, better touch sizing,
// and lighter mobile rendering without changing the desktop layout.

(function initMobileUxFixes() {
  const MOBILE_BREAKPOINT = 780;

  const MOBILE_TABS = [
    { view: 'profile', label: 'Dash', icon: '⌂' },
    { view: 'store', label: 'Shop', icon: '🛒' },
    { view: 'portfolio', label: 'Invest', icon: '▣' },
    { view: 'trade', label: 'Trade', icon: '↕' },
    { view: 'stockProfile', label: 'Market', icon: '◌' },
    { view: 'rating', label: 'Predict', icon: '★' }
  ];

  function injectMobileStyles() {
    if (document.getElementById('mobileUxFixStyles')) return;

    const style = document.createElement('style');
    style.id = 'mobileUxFixStyles';
    style.textContent = `
      .mobile-tabbar {
        display: none;
      }

      @media (max-width: ${MOBILE_BREAKPOINT}px) {
        html {
          -webkit-text-size-adjust: 100%;
        }

        body {
          background: var(--bg);
        }

        .app-shell {
          display: block;
          min-height: 100vh;
        }

        .sidebar {
          display: none;
        }

        .main {
          padding: 14px;
          padding-bottom: calc(94px + env(safe-area-inset-bottom, 0px));
        }

        .topbar {
          display: block;
          margin-bottom: 14px;
        }

        .page-heading .eyebrow {
          display: none;
        }

        h1,
        #pageTitle {
          font-size: 28px;
          line-height: 1.05;
          margin-top: 0;
        }

        .page-subtitle {
          font-size: 14px;
          margin-top: 6px;
        }

        .identity-card {
          min-width: 0;
          width: 100%;
          margin-top: 12px;
          padding: 12px;
          border-radius: 18px;
          box-shadow: 0 8px 22px rgba(50, 39, 19, .08);
          backdrop-filter: none;
        }

        .identity-actions {
          grid-template-columns: 1fr 1fr;
        }

        .card,
        .metric,
        .login-card {
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 8px 22px rgba(50, 39, 19, .08);
          backdrop-filter: none;
        }

        .grid,
        .grid.cols-2,
        .grid.cols-3,
        .grid.cols-4 {
          grid-template-columns: 1fr;
          gap: 12px;
        }

        .metric .value {
          font-size: 26px;
        }

        input,
        select,
        textarea,
        button {
          min-height: 48px;
          font-size: 16px;
        }

        .primary-btn,
        .ghost-btn {
          min-height: 48px;
        }

        .form-grid {
          grid-template-columns: 1fr;
        }

        .form-grid .span-2 {
          grid-column: auto;
        }

        .login-screen {
          padding: 16px;
          min-height: 100dvh;
        }

        .login-card {
          width: 100%;
          padding: 22px;
        }

        .login-card h1 {
          font-size: 30px;
        }

        .table-wrap {
          border: 0;
          background: transparent;
          overflow: visible;
        }

        table.mobile-card-table {
          width: 100%;
          min-width: 0;
          border-collapse: separate;
          border-spacing: 0;
        }

        table.mobile-card-table thead {
          display: none;
        }

        table.mobile-card-table,
        table.mobile-card-table tbody,
        table.mobile-card-table tr,
        table.mobile-card-table td {
          display: block;
          width: 100%;
        }

        table.mobile-card-table tr {
          margin-bottom: 12px;
          border: 1px solid var(--line);
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 8px 20px rgba(50, 39, 19, .06);
          padding: 8px;
        }

        table.mobile-card-table td {
          display: grid;
          grid-template-columns: minmax(96px, 38%) 1fr;
          gap: 10px;
          align-items: start;
          border-bottom: 1px solid var(--line);
          padding: 9px 8px;
          font-size: 14px;
          word-break: break-word;
        }

        table.mobile-card-table td:last-child {
          border-bottom: 0;
        }

        table.mobile-card-table td::before {
          content: attr(data-label);
          color: var(--muted);
          font-size: 11px;
          line-height: 1.25;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: .05em;
        }

        .market-ticker {
          padding-bottom: 8px;
        }

        .ticker-pill {
          padding: 8px 11px;
          font-size: 12px;
        }

        .mobile-tabbar {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999;
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 4px;
          padding: 7px 7px calc(7px + env(safe-area-inset-bottom, 0px));
          background: rgba(255, 255, 255, .96);
          border-top: 1px solid var(--line);
          box-shadow: 0 -12px 28px rgba(50, 39, 19, .12);
          backdrop-filter: blur(14px);
        }

        .mobile-tabbar.hidden {
          display: none !important;
        }

        .mobile-tab {
          min-width: 0;
          min-height: 52px;
          border: 0;
          border-radius: 14px;
          background: transparent;
          color: var(--muted);
          font-weight: 850;
          cursor: pointer;
          display: grid;
          place-items: center;
          gap: 2px;
          padding: 5px 2px;
        }

        .mobile-tab .mobile-tab-icon {
          font-size: 18px;
          line-height: 1;
        }

        .mobile-tab .mobile-tab-label {
          font-size: 10px;
          line-height: 1;
          white-space: nowrap;
        }

        .mobile-tab.active {
          color: #fff;
          background: linear-gradient(135deg, #f97316, #ea580c);
          box-shadow: 0 8px 18px rgba(249,115,22,.24);
        }

        .tooltip-popover {
          max-width: calc(100vw - 32px);
        }
      }

      @media (max-width: 420px) {
        .mobile-tabbar {
          gap: 2px;
          padding-left: 4px;
          padding-right: 4px;
        }

        .mobile-tab .mobile-tab-label {
          font-size: 9px;
        }

        table.mobile-card-table td {
          grid-template-columns: 86px 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function buildMobileTabbar() {
    if (document.getElementById('mobileTabbar')) return;

    const tabbar = document.createElement('nav');
    tabbar.id = 'mobileTabbar';
    tabbar.className = 'mobile-tabbar hidden';
    tabbar.setAttribute('aria-label', 'Mobile navigation');

    tabbar.innerHTML = MOBILE_TABS.map((tab) => `
      <button class="mobile-tab" type="button" data-view="${tab.view}" aria-label="${tab.label}">
        <span class="mobile-tab-icon" aria-hidden="true">${tab.icon}</span>
        <span class="mobile-tab-label">${tab.label}</span>
      </button>
    `).join('');

    tabbar.addEventListener('click', (event) => {
      const button = event.target.closest('[data-view]');
      if (!button) return;

      const view = button.dataset.view;

      if (typeof switchView === 'function') {
        switchView(view);
      }
    });

    document.body.appendChild(tabbar);
  }

  function syncMobileTabbar() {
    const tabbar = document.getElementById('mobileTabbar');
    const appShell = document.getElementById('appShell');

    if (!tabbar || !appShell) return;

    const appIsOpen = !appShell.classList.contains('hidden');
    tabbar.classList.toggle('hidden', !appIsOpen);

    const activeView = document.querySelector('.view.active');
    const activeId = activeView ? activeView.id : 'profile';

    tabbar.querySelectorAll('.mobile-tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === activeId);
    });
  }

  function patchSwitchViewSync() {
    if (window.__mobileUxSwitchPatched) return;
    window.__mobileUxSwitchPatched = true;

    if (typeof window.switchView === 'function') {
      const originalSwitchView = window.switchView;

      window.switchView = function patchedSwitchView(view) {
        const result = originalSwitchView.apply(this, arguments);
        setTimeout(syncMobileTabbar, 0);
        return result;
      };
    }

    document.addEventListener('click', (event) => {
      if (event.target.closest('.nav-item')) {
        setTimeout(syncMobileTabbar, 0);
      }
    });
  }

  function patchShowAppAndLoginSync() {
    if (window.__mobileUxScreenPatched) return;
    window.__mobileUxScreenPatched = true;

    if (typeof window.showApp === 'function') {
      const originalShowApp = window.showApp;

      window.showApp = function patchedShowApp() {
        const result = originalShowApp.apply(this, arguments);
        setTimeout(syncMobileTabbar, 0);
        return result;
      };
    }

    if (typeof window.showLogin === 'function') {
      const originalShowLogin = window.showLogin;

      window.showLogin = function patchedShowLogin() {
        const result = originalShowLogin.apply(this, arguments);
        setTimeout(syncMobileTabbar, 0);
        return result;
      };
    }
  }

  function labelExistingTables() {
    document.querySelectorAll('.table-wrap table').forEach((tableEl) => {
      tableEl.classList.add('mobile-card-table');

      const headers = Array.from(tableEl.querySelectorAll('thead th')).map((th) =>
        th.textContent.trim()
      );

      tableEl.querySelectorAll('tbody tr').forEach((row) => {
        Array.from(row.children).forEach((cell, index) => {
          if (!cell.dataset.label) {
            cell.dataset.label = headers[index] || '';
          }
        });
      });
    });
  }

  function patchTableRenderer() {
    if (window.__mobileUxTablePatched) return;
    window.__mobileUxTablePatched = true;

    if (typeof window.table === 'function') {
      const originalTable = window.table;

      window.table = function patchedTable(rows, keys, emptyMessage) {
        const html = originalTable.apply(this, arguments);

        setTimeout(labelExistingTables, 0);

        return html;
      };
    }
  }

  function observeTableChanges() {
    if (window.__mobileUxObserverReady) return;
    window.__mobileUxObserverReady = true;

    const observer = new MutationObserver(() => {
      labelExistingTables();
      syncMobileTabbar();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function improveMobileInputFocus() {
    const loginInput = document.getElementById('loginCardId');

    if (loginInput) {
      loginInput.setAttribute('inputmode', 'text');
      loginInput.setAttribute('enterkeyhint', 'go');
      loginInput.setAttribute('autocomplete', 'one-time-code');

      loginInput.addEventListener('touchend', () => {
        setTimeout(() => loginInput.focus(), 0);
      }, { passive: true });
    }
  }

  function init() {
    injectMobileStyles();
    buildMobileTabbar();
    patchSwitchViewSync();
    patchShowAppAndLoginSync();
    patchTableRenderer();
    observeTableChanges();
    improveMobileInputFocus();
    labelExistingTables();
    syncMobileTabbar();

    window.addEventListener('resize', syncMobileTabbar);
    window.addEventListener('orientationchange', () => {
      setTimeout(syncMobileTabbar, 250);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
