window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.forecasts = window.Econovaria.features.forecasts || {};

function renderRating() {
  const marketRows = state.market || [];
  const ratings = (state.ratings || []).slice(0, 12);

  document.getElementById("rating").innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <div class="card-title-row">
          <h2 class="card-title">Submit a Prediction</h2>
          <span class="badge ${can("SUBMIT_RATING") ? "good" : "bad"}">${can("SUBMIT_RATING") ? "Ready" : "Unavailable"}</span>
        </div>
        ${help("Choose a stock, make a prediction, set a target price, and explain your thinking.")}

        <div class="form-grid" id="ratingForm">
          <label>
            <span class="field-label">Stock</span>
            <select id="ratingTicker">
              ${marketRows.map((m) => `<option value="${sanitize(m.ticker)}">${sanitize(m.ticker)} · ${sanitize(m.companyName || m.ticker)}</option>`).join("")}
            </select>
          </label>

          <label>
            <span class="field-label">Prediction</span>
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

          <button id="ratingSubmitButton" class="primary-btn span-2" type="button" ${can("SUBMIT_RATING") ? "" : "disabled"} onclick="submitRating(this)">Submit Prediction</button>
        </div>

        <div id="ratingStatus" class="status-box">Predictions are saved to your account.</div>
      </div>

      <div class="card">
        <h2 class="card-title">Prediction History</h2>
        ${help("Your recent predictions appear here after they are confirmed.")}
        ${table(ratings, ["timestamp", "ticker", "rating", "targetPrice", "reason", "rewardStatus", "rewardAmount"], "No predictions yet.")}
      </div>
    </div>`;
}

async function submitRating(button) {
  const status = document.getElementById("ratingStatus");
  const form = document.getElementById("ratingForm");
  const submitButton = button || document.getElementById("ratingSubmitButton");

  if (isButtonLoading(submitButton)) return;

  try {
    requirePermission("SUBMIT_RATING");

    const ticker = document.getElementById("ratingTicker").value;
    const rating = document.getElementById("ratingValue").value;
    const targetPrice = Number(document.getElementById("targetPrice").value || 0);
    const reason = document.getElementById("ratingReason").value.trim();

    if (!ticker) throw new Error("Choose a stock first.");
    if (!targetPrice || targetPrice <= 0) throw new Error("Enter a target price above 0.");
    if (reason.length < 10) throw new Error("Add a short reason with at least 10 characters.");

    setButtonLoading(submitButton, true, "Saving...");
    setControlsDisabled(form, true, [submitButton]);
    showStatus(status, null, "Saving your prediction...");

    const result = await submitAction("SUBMIT_RATING", {
      ticker,
      rating,
      targetPrice,
      reason
    });

    showStatus(status, result.ok === true, result.message || "Prediction saved.");

    if (result.ok === true) {
      document.getElementById("targetPrice").value = "";
      document.getElementById("ratingReason").value = "";
    }

    renderCurrentView();

  } catch (err) {
    showStatus(status, false, cleanErrorMessage(err.message));
  } finally {
    setControlsDisabled(form, false, [submitButton]);
    setButtonLoading(submitButton, false);
  }
}

Object.assign(window.Econovaria.features.forecasts, { renderRating, submitRating });
