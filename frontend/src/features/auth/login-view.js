(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const auth = app.modules.auth = app.modules.auth || {};

  function sanitize(value) {
    if (app.modules.sanitize && typeof app.modules.sanitize.sanitizeHtml === "function") {
      return app.modules.sanitize.sanitizeHtml(value);
    }

    if (typeof global.sanitize === "function") {
      return global.sanitize(value);
    }

    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function renderBriefing() {
    return `
      <aside class="login-briefing" aria-label="Market simulation briefing">
        <div class="brand login-brand login-brand--terminal">
          <div class="brand-mark">CE</div>
          <div>
            <div class="brand-title">Classroom Economy</div>
            <div class="brand-subtitle">Market simulation</div>
          </div>
        </div>

        <h1>Enter the economy.</h1>
        <p class="briefing-copy">Manage your balance, portfolio, store purchases, trades, and forecasts inside the classroom market.</p>

        <div class="briefing-grid" aria-label="Simulation modules">
          <div><span>01</span><strong>Account</strong><small>Balance and activity</small></div>
          <div><span>02</span><strong>Portfolio</strong><small>Assets and positions</small></div>
          <div><span>03</span><strong>Market</strong><small>Prices and signals</small></div>
          <div><span>04</span><strong>Forecasts</strong><small>Target price reasoning</small></div>
        </div>
      </aside>
    `;
  }

  // display-only
  function renderLoginError(message) {
    const classified = typeof auth.classifyLoginError === "function"
      ? auth.classifyLoginError(message)
      : { className: "bad", message: message || "" };

    return `<div id="loginError" class="status-box ${sanitize(classified.className || "bad")}">${sanitize(classified.message || "")}</div>`;
  }

  // display-only
  function renderLoginSuccess(message) {
    return `<div class="status-box ok">${sanitize(message || "Account opened. Your latest data is ready.")}</div>`;
  }

  // display-only
  function renderLoginPanel(options) {
    const config = options || {};
    const quote = typeof auth.getNextLoginQuote === "function"
      ? auth.getNextLoginQuote(config.quoteIndex || 0)
      : { text: "Every decision has a cost. Every cost teaches a lesson.", countLabel: "01 / 20" };
    const quoteHtml = typeof auth.renderLoginQuote === "function" ? auth.renderLoginQuote(quote) : "";

    return `
      <div class="login-shell">
        ${renderBriefing()}
        <div class="login-card login-access-card">
          <div class="access-header">
            <div class="access-eyebrow">Secure access</div>
            <h2>Open your account</h2>
            <p class="login-copy">Enter or scan your student code to open your market simulation account.</p>
          </div>

          <form id="loginForm" class="login-form">
            <label>
              <span class="field-label">Student Code</span>
              <input id="loginCardId" type="password" autocomplete="one-time-code" inputmode="text" enterkeyhint="go" placeholder="Enter or scan student code" />
            </label>
            <button class="primary-btn" type="submit">Open Account</button>
          </form>

          <div id="loginError" class="status-box bad hidden"></div>
          ${quoteHtml}
        </div>
      </div>
    `;
  }

  auth.viewStatus = "extracted";
  auth.renderLoginPanel = renderLoginPanel;
  auth.renderLoginError = renderLoginError;
  auth.renderLoginSuccess = renderLoginSuccess;

  app.modules.loginView = {
    status: "extracted",
    renderLoginPanel,
    renderLoginError,
    renderLoginSuccess
  };
})(window);
