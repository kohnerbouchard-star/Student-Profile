window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.forecasts = window.Econovaria.features.forecasts || {};

function getForecastRuntime() {
  const root = window.Econovaria || {};
  const stateApi = root.state || {};
  const utils = root.utils || {};
  const ui = root.ui || {};
  const core = root.core || {};
  const runtime = {
    getState: stateApi.getState,
    can: stateApi.can,
    requirePermission: stateApi.requirePermission,
    sanitize: utils.sanitize,
    cleanErrorMessage: utils.cleanErrorMessage,
    help: ui.help,
    table: ui.table,
    isButtonLoading: ui.isButtonLoading,
    setButtonLoading: ui.setButtonLoading,
    setControlsDisabled: ui.setControlsDisabled,
    showStatus: ui.showStatus,
    submitAction: core.submitAction,
    renderCurrentView: core.renderCurrentView
  };

  const missing = Object.keys(runtime).filter((key) => typeof runtime[key] !== "function");

  if (missing.length) {
    throw new Error(`[Econovaria forecasts] Missing runtime helpers: ${missing.join(", ")}`);
  }

  return runtime;
}

function renderRating() {
  const runtime = getForecastRuntime();
  const appState = runtime.getState();
  const marketRows = appState.market || [];
  const ratings = (appState.ratings || []).slice(0, 12);

  document.getElementById("rating").innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <div class="card-title-row">
          <h2 class="card-title">Submit Forecast</h2>
          <span class="badge ${runtime.can("SUBMIT_RATING") ? "good" : "bad"}">${runtime.can("SUBMIT_RATING") ? "Ready" : "Unavailable"}</span>
        </div>
        ${runtime.help("Choose a stock, make a forecast, set a target price, and explain your thinking.")}

        <div class="form-grid" id="ratingForm">
          <label>
            <span class="field-label">Stock</span>
            <select id="ratingTicker">
              ${marketRows.map((m) => `<option value="${runtime.sanitize(m.ticker)}">${runtime.sanitize(m.ticker)} · ${runtime.sanitize(m.companyName || m.ticker)}</option>`).join("")}
            </select>
          </label>

          <label>
            <span class="field-label">Forecast</span>
            <select id="ratingValue"><option>BUY</option><option>HOLD</option><option>SELL</option></select>
          </label>

          <label class="span-2">
            <span class="field-label">Target Price</span>
            <input id="targetPrice" type="number" min="0" step="0.01" placeholder="Example: 125.00" />
          </label>

          <label class="span-2">
            <span class="field-label">Reason</span>
            <textarea id="ratingReason" rows="4" placeholder="Explain your reasoning. Minimum 10 characters."></textarea>
          </label>

          <button id="ratingSubmitButton" class="primary-btn span-2" type="button" ${runtime.can("SUBMIT_RATING") ? "" : "disabled"} onclick="submitRating(this)">Submit Forecast</button>
        </div>

        <div id="ratingStatus" class="status-box">Forecasts are saved to your account.</div>
      </div>

      <div class="card">
        <h2 class="card-title">Forecast History</h2>
        ${runtime.help("Your recent forecasts appear here after they are confirmed.")}
        ${runtime.table(ratings, ["timestamp", "ticker", "rating", "targetPrice", "reason", "rewardStatus", "rewardAmount"], "No forecasts yet.")}
      </div>
    </div>`;
}

async function submitRating(button) {
  const runtime = getForecastRuntime();
  const status = document.getElementById("ratingStatus");
  const form = document.getElementById("ratingForm");
  const submitButton = button || document.getElementById("ratingSubmitButton");

  if (runtime.isButtonLoading(submitButton)) return;

  try {
    runtime.requirePermission("SUBMIT_RATING");

    const ticker = document.getElementById("ratingTicker").value;
    const rating = document.getElementById("ratingValue").value;
    const targetPrice = Number(document.getElementById("targetPrice").value || 0);
    const reason = document.getElementById("ratingReason").value.trim();

    if (!ticker) throw new Error("Choose a stock first.");
    if (!targetPrice || targetPrice <= 0) throw new Error("Enter a target price above 0.");
    if (reason.length < 10) throw new Error("Add a short reason with at least 10 characters.");

    runtime.setButtonLoading(submitButton, true, "Saving...");
    runtime.setControlsDisabled(form, true, [submitButton]);
    runtime.showStatus(status, null, "Saving your forecast...");

    const result = await runtime.submitAction("SUBMIT_RATING", {
      ticker,
      rating,
      targetPrice,
      reason
    });

    runtime.showStatus(status, result.ok === true, result.message || "Forecast saved.");

    if (result.ok === true) {
      document.getElementById("targetPrice").value = "";
      document.getElementById("ratingReason").value = "";
    }

    runtime.renderCurrentView();

  } catch (err) {
    runtime.showStatus(status, false, runtime.cleanErrorMessage(err.message));
  } finally {
    runtime.setControlsDisabled(form, false, [submitButton]);
    runtime.setButtonLoading(submitButton, false);
  }
}

Object.assign(window.Econovaria.features.forecasts, { renderRating, submitRating });
