(function initEconovariaAttendanceRewardSettingsV4() {
  "use strict";

  const STYLE_ID = "econovaria-attendance-reward-settings-style";
  const CARD_SELECTOR = "[data-admin-attendance-reward-settings]";
  const AUTOMATIC_CURRENCY_MODE = "player_country";
  const AUTOMATIC_DIFFICULTY_ADJUSTMENT = true;
  const state = {
    gameId: "",
    attendanceWindow: {},
    draftAttendanceWindow: null,
    dirty: false,
    loaded: false,
    loading: false,
    loadError: false,
    loadSequence: 0,
    renderQueued: false,
  };
  const delegatedFetch = window.fetch.bind(window);

  function text(value) {
    return String(value ?? "").trim();
  }

  function object(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function number(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function selectedGameId() {
    const model = window.Econovaria?.features?.adminOverviewTerminal?.currentModel || {};
    return text(
      model.gameId || model.activeGameId || model.selectedGameSessionId ||
      model.activeGame?.id || model.selectedGame?.id ||
      window.sessionStorage.getItem("econovaria.admin.selected-game.v1"),
    );
  }

  function normalizedWindow(source) {
    const value = object(source);
    return {
      ...value,
      timezone: text(value.timezone) || "Asia/Seoul",
      presentRewardAmount: Math.max(0, number(value.presentRewardAmount, 1)),
      lateRewardAmount: Math.max(0, number(value.lateRewardAmount, 0)),
      currencyCode: (text(value.currencyCode) || "ECO").toUpperCase(),
      currencyMode: AUTOMATIC_CURRENCY_MODE,
      applyDifficultyIncomeModifier: AUTOMATIC_DIFFICULTY_ADJUSTMENT,
    };
  }

  function activeDraft() {
    return normalizedWindow(state.dirty && state.draftAttendanceWindow
      ? state.draftAttendanceWindow
      : state.attendanceWindow);
  }

  function clearRenderedState() {
    document.querySelector(CARD_SELECTOR)?.remove();
    document.querySelector("[data-attendance-reward-preview]")?.remove();
  }

  function prepareGameState(gameId) {
    if (!gameId || state.gameId === gameId) return;
    state.loadSequence += 1;
    state.gameId = gameId;
    state.attendanceWindow = {};
    state.draftAttendanceWindow = null;
    state.dirty = false;
    state.loaded = false;
    state.loading = false;
    state.loadError = false;
    clearRenderedState();
  }

  function ensureStylesheet() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    link.href = "./css/attendance-reward-settings.css";
    document.head.append(link);
  }

  function cardMarkup(config) {
    const currencyCode = escapeHtml(config.currencyCode);
    return `
      <article class="admin-terminal-settings-tuning-card is-attendance" data-admin-attendance-reward-settings>
        <header>
          <span>Attendance Rewards</span>
          <strong>Base credits · configurable payout</strong>
        </header>
        <div class="admin-terminal-settings-change-list admin-terminal-attendance-reward-grid">
          <article class="admin-terminal-settings-change-tile">
            <label class="admin-terminal-settings-field">
              <span>Present reward</span>
              <input type="number" min="0" max="1000" step="0.01" inputmode="decimal"
                data-attendance-reward-field="presentRewardAmount" value="${config.presentRewardAmount.toFixed(2)}" />
              <small>Base Credits before difficulty and country conversion.</small>
            </label>
          </article>
          <article class="admin-terminal-settings-change-tile">
            <label class="admin-terminal-settings-field">
              <span>Late reward</span>
              <input type="number" min="0" max="1000" step="0.01" inputmode="decimal"
                data-attendance-reward-field="lateRewardAmount" value="${config.lateRewardAmount.toFixed(2)}" />
              <small>Set to 0.00 when late arrivals should not earn a reward.</small>
            </label>
          </article>
          <article class="admin-terminal-settings-change-tile">
            <label class="admin-terminal-settings-field">
              <span>Difficulty adjustment</span>
              <select data-attendance-reward-field="applyDifficultyIncomeModifier">
                <option value="true" selected>Use income modifier</option>
                <option value="false">Do not adjust</option>
              </select>
              <small>The selected difficulty's bounded income modifier is shown below.</small>
            </label>
          </article>
          <article class="admin-terminal-settings-change-tile">
            <label class="admin-terminal-settings-field">
              <span>Payout currency</span>
              <select data-attendance-reward-field="currencyMode">
                <option value="player_country" selected>Player country currency</option>
                <option value="fixed">Fixed ${currencyCode}</option>
              </select>
              <small>Local mode uses the player's active country and current exchange index.</small>
            </label>
          </article>
        </div>
        <footer class="admin-terminal-attendance-reward-formula" data-attendance-reward-formula aria-live="polite">
          <strong>Applied at scan time</strong><span></span>
        </footer>
      </article>`;
  }

  function field(name) {
    return document.querySelector(`[data-attendance-reward-field="${name}"]`);
  }

  function readDomDraft() {
    const fallback = activeDraft();
    return normalizedWindow({
      ...fallback,
      presentRewardAmount: Math.max(0, number(field("presentRewardAmount")?.value, fallback.presentRewardAmount)),
      lateRewardAmount: Math.max(0, number(field("lateRewardAmount")?.value, fallback.lateRewardAmount)),
    });
  }

  function incomeModifier() {
    return number(document.querySelector('[data-game-setting-key="incomeMultiplier"]')?.value, 1);
  }

  function summary(config) {
    const difficulty = config.applyDifficultyIncomeModifier ? incomeModifier() : 1;
    const destination = config.currencyMode === "player_country"
      ? "player country currency × current country exchange index"
      : config.currencyCode;
    return `${config.presentRewardAmount.toFixed(2)} ${config.currencyCode} present · ` +
      `${config.lateRewardAmount.toFixed(2)} ${config.currencyCode} late · ` +
      `${difficulty.toFixed(2)}× difficulty → ${destination}`;
  }

  function compactSummary(config) {
    const difficulty = config.applyDifficultyIncomeModifier
      ? `${incomeModifier().toFixed(2)}× income`
      : "no difficulty";
    const destination = config.currencyMode === "player_country"
      ? "local currency"
      : `fixed ${config.currencyCode}`;
    return `${config.presentRewardAmount.toFixed(2)} / ${config.lateRewardAmount.toFixed(2)} ${config.currencyCode} · ` +
      `${difficulty} · ${destination}`;
  }

  function ensurePreviewRow() {
    const list = document.querySelector(".admin-terminal-settings-current-list");
    if (!list || list.querySelector("[data-attendance-reward-preview]")) return;
    const row = document.createElement("article");
    row.className = "admin-terminal-settings-current-row is-active is-attendance";
    row.dataset.attendanceRewardPreview = "";
    row.innerHTML = `
      <div><strong>Attendance</strong><small>Reward amount and payout policy.</small></div>
      <span><em>Current</em><b data-attendance-current>—</b></span>
      <i aria-hidden="true">→</i>
      <span><em>Changed</em><b data-attendance-changed>—</b></span>`;
    list.append(row);
  }

  function renderValues() {
    const card = document.querySelector(CARD_SELECTOR);
    if (!card) return;
    if (state.loaded) card.dataset.attendanceRewardLoaded = "true";
    else card.removeAttribute("data-attendance-reward-loaded");
    if (state.loadError) card.dataset.attendanceRewardLoadError = "true";
    else card.removeAttribute("data-attendance-reward-load-error");
    if (state.dirty) card.dataset.attendanceRewardDirty = "true";
    else card.removeAttribute("data-attendance-reward-dirty");
    const current = normalizedWindow(state.attendanceWindow);
    const changed = state.dirty ? activeDraft() : readDomDraft();
    setText(card.querySelector("[data-attendance-reward-formula] span"), summary(changed));
    setText(document.querySelector("[data-attendance-current]"), compactSummary(current));
    setText(document.querySelector("[data-attendance-changed]"), compactSummary(changed));
    const footerCopy = document.querySelector(".admin-terminal-settings-save-panel-v543 small");
    setText(footerCopy, "This button persists the approved difficulty and attendance reward settings.");
  }

  function ensureCard() {
    ensureStylesheet();
    const grid = document.querySelector(".admin-terminal-settings-tuning-grid");
    if (!grid) return;
    if (!grid.querySelector(CARD_SELECTOR)) {
      const template = document.createElement("template");
      template.innerHTML = cardMarkup(activeDraft()).trim();
      const card = template.content.firstElementChild;
      const moneyCard = grid.querySelector(".admin-terminal-settings-tuning-card.is-money");
      if (moneyCard?.nextSibling) grid.insertBefore(card, moneyCard.nextSibling);
      else grid.prepend(card);
      card.addEventListener("input", handleFieldChange);
      card.addEventListener("change", handleFieldChange);
    }
    ensurePreviewRow();
    renderValues();
  }

  function scheduleRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    window.requestAnimationFrame(() => {
      state.renderQueued = false;
      if (document.querySelector(".admin-terminal-settings-main-panel")) {
        const gameId = selectedGameId();
        prepareGameState(gameId);
        ensureCard();
        void loadSettings();
      }
    });
  }

  function clearValidation(input) {
    if (!(input instanceof HTMLInputElement)) return;
    input.removeAttribute("aria-invalid");
    input.closest(".admin-terminal-settings-change-tile")?.classList.remove("is-invalid");
    input.parentElement?.querySelector(".admin-terminal-attendance-field-error")?.remove();
  }

  function validate() {
    let valid = true;
    let focused = false;
    for (const name of ["presentRewardAmount", "lateRewardAmount"]) {
      const input = field(name);
      if (!(input instanceof HTMLInputElement)) continue;
      clearValidation(input);
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0 || value > 1000) {
        valid = false;
        input.setAttribute("aria-invalid", "true");
        input.closest(".admin-terminal-settings-change-tile")?.classList.add("is-invalid");
        const error = document.createElement("small");
        error.className = "admin-terminal-attendance-field-error";
        error.textContent = "Enter an amount from 0.00 to 1000.00.";
        input.insertAdjacentElement("afterend", error);
        if (!focused) {
          focused = true;
          input.focus({ preventScroll: false });
        }
      }
    }
    return valid;
  }

  function handleFieldChange(event) {
    if (event.target instanceof HTMLInputElement) clearValidation(event.target);
    state.draftAttendanceWindow = readDomDraft();
    state.dirty = true;
    renderValues();
  }

  async function loadSettings() {
    const gameId = selectedGameId();
    prepareGameState(gameId);
    if (!gameId || state.loading || state.loaded) return;
    const sequence = ++state.loadSequence;
    state.loading = true;
    state.loadError = false;
    try {
      const response = await delegatedFetch(`/api/admin/games/${encodeURIComponent(gameId)}/settings`, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });
      if (!response.ok) throw new Error(`settings_read_${response.status}`);
      const payload = await response.json();
      if (sequence !== state.loadSequence || selectedGameId() !== gameId) return;
      const root = object(payload);
      const data = object(root.data);
      const settings = object(root.settings || data.settings || data);
      state.attendanceWindow = normalizedWindow(
        settings.attendanceWindow || settings.attendance_window || object(settings.settings)?.attendanceWindow,
      );
      state.loaded = true;
      if (!state.dirty) {
        state.draftAttendanceWindow = null;
        clearRenderedState();
      }
    } catch (_) {
      if (sequence !== state.loadSequence || selectedGameId() !== gameId) return;
      state.attendanceWindow = normalizedWindow(state.attendanceWindow);
      state.loaded = true;
      state.loadError = true;
    } finally {
      if (sequence === state.loadSequence) state.loading = false;
      scheduleRender();
    }
  }

  function acknowledgeSaved(detail) {
    const gameId = text(detail?.gameId);
    if (!gameId || gameId !== state.gameId) return;
    state.attendanceWindow = normalizedWindow(detail.attendanceWindow);
    state.draftAttendanceWindow = null;
    state.dirty = false;
    state.loaded = true;
    state.loadError = false;
    const card = document.querySelector(CARD_SELECTOR);
    card?.removeAttribute("data-attendance-reward-dirty");
    renderValues();
  }

  document.addEventListener("click", (event) => {
    const save = event.target instanceof Element
      ? event.target.closest('[data-admin-terminal-action="save-settings"]')
      : null;
    if (!save || !document.querySelector(CARD_SELECTOR)) return;
    if (!validate()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener("change", (event) => {
    if (event.target instanceof Element && event.target.matches('[data-game-setting-key="incomeMultiplier"]')) {
      renderValues();
    }
  }, true);

  document.addEventListener("econovaria:attendance-reward-saved", (event) => {
    acknowledgeSaved(event instanceof CustomEvent ? event.detail : null);
  });

  new MutationObserver(scheduleRender).observe(document.body, {
    subtree: true,
    childList: true,
  });

  window.EconovariaAttendanceRewardSettings = {
    getGameId: () => state.gameId,
    getPersistedWindow: () => ({ ...normalizedWindow(state.attendanceWindow) }),
    getDraftWindow: () => ({ ...activeDraft() }),
    isDirty: () => state.dirty,
    isLoaded: () => state.loaded,
  };

  scheduleRender();
})();
