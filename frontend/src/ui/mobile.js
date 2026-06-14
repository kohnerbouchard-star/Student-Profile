// Mobile/tablet responsive behavior for the student dashboard.
(function initMobileUxFix() {
  const styleId = 'mobileUxFixStyles';

  function injectMobileStyles() {
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @media (max-width: 720px) {
        input, select, textarea, button { font-size: 16px; }
        .mobile-tabbar { display: flex; }
      }
    `;
    document.head.appendChild(style);
  }

  function buildMobileTabbar() {
    if (document.getElementById('mobileTabbar')) return;

    const nav = document.querySelector('.sidebar-nav');
    if (!nav) return;

    const bar = document.createElement('div');
    bar.id = 'mobileTabbar';
    bar.className = 'mobile-tabbar';
    bar.setAttribute('aria-label', 'Mobile navigation');

    nav.querySelectorAll('.nav-item').forEach((item) => {
      const clone = item.cloneNode(true);
      clone.addEventListener('click', () => item.click());
      bar.appendChild(clone);
    });

    document.body.appendChild(bar);
  }

  function syncMobileTabbar() {
    const bar = document.getElementById('mobileTabbar');
    if (!bar) return;

    const activeView = document.querySelector('.nav-item.active')?.dataset.view;
    bar.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.view === activeView);
    });
  }

  function patchSwitchViewSync() {
    if (window.__mobileSwitchViewPatched || typeof window.switchView !== 'function') return;
    window.__mobileSwitchViewPatched = true;

    const originalSwitchView = window.switchView;
    window.switchView = function patchedSwitchView() {
      const result = originalSwitchView.apply(this, arguments);
      setTimeout(syncMobileTabbar, 0);
      return result;
    };
  }

  function patchShowAppAndLoginSync() {
    if (window.__mobileShowAppPatched) return;
    window.__mobileShowAppPatched = true;

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
    document.querySelectorAll('table').forEach((table) => {
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent.trim());

      table.querySelectorAll('tbody tr').forEach((row) => {
        Array.from(row.children).forEach((cell, index) => {
          if (headers[index]) cell.dataset.label = headers[index];
        });
      });
    });
  }

  function patchTableRenderer() {
    if (window.__mobileTablePatched) return;
    window.__mobileTablePatched = true;

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
      loginInput.setAttribute('autocomplete', 'username');

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
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
