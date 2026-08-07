(function initEconovariaLedgerAdjustmentWiring() {
  "use strict";

  const ACTION = "confirm-player-balance-adjustment";
  const inFlight = new WeakSet();
  const COUNTRY_CURRENCY_BY_CODE = Object.freeze({
    NORTHREACH: "NRC",
    YRETHIA: "YRC",
    THALORIS: "THD",
    SOLVEND: "SLV",
    ELDORAN: "ELD",
    VALERION: "VAL",
    LUMENOR: "LUM",
    XALVORIA: "XAL",
    DRAVENLOK: "DRV",
    SYNDALIS: "SYN",
  });

  function text(value) {
    return String(value ?? "").trim();
  }

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function feature() {
    return window.Econovaria?.features?.adminOverviewTerminal || null;
  }

  function currentModel() {
    return record(feature()?.currentModel);
  }

  function modalFor(control) {
    return control.closest(
      '[role="dialog"], [data-admin-terminal-modal-backdrop], .admin-terminal-modal-backdrop',
    );
  }

  function controlValue(modal, name) {
    const control = modal?.querySelector(`[name="${CSS.escape(name)}"]`);
    return control && "value" in control ? text(control.value) : "";
  }

  function selectedPlayer(model, modal, control) {
    const explicitId = text(
      control.dataset.playerId ||
      modal?.dataset?.playerId ||
      modal?.querySelector("[data-player-id]")?.getAttribute("data-player-id") ||
      model.selectedPlayerId ||
      record(model.selectedPlayer).id,
    );
    if (explicitId) {
      const match = Array.isArray(model.players)
        ? model.players.find((player) => text(player?.id) === explicitId)
        : null;
      return Object.keys(record(match)).length ? record(match) : { id: explicitId };
    }

    const modalText = text(modal?.textContent).toLowerCase();
    const match = Array.isArray(model.players)
      ? model.players.find((player) => {
          const name = text(player?.displayName || player?.name).toLowerCase();
          return Boolean(name && modalText.includes(name));
        })
      : null;
    return record(match);
  }

  function activeGameId(model) {
    return text(
      model.gameId ||
      model.activeGameId ||
      record(model.selectedGame).id ||
      record(model.selectedGame).gameId ||
      record(model.activeGame).id ||
      record(model.game).id,
    );
  }

  function playerLocalCurrencyCode(player) {
    const countryCode = text(
      player.countryCode ||
      record(player.country).countryCode ||
      record(player.country).code,
    ).toUpperCase();
    const mapped = COUNTRY_CURRENCY_BY_CODE[countryCode];
    if (mapped) return mapped;

    const candidates = [
      player.countryCurrencyCode,
      player.localCurrencyCode,
      record(player.country).currencyCode,
      player.currencyCode,
    ];
    for (const candidate of candidates) {
      const code = text(candidate).toUpperCase();
      if (/^[A-Z]{3,16}$/.test(code) && code !== "ECO") return code;
    }
    return "";
  }

  function balanceRows(player) {
    const candidates = [
      player.balances,
      player.accountBalances,
      player.accounts,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  }

  function numericBalance(player, currencyCode) {
    const normalizedCurrency = text(currencyCode).toUpperCase();
    const row = balanceRows(player).find((entry) => {
      const accountType = text(entry?.accountType || entry?.account_type).toLowerCase();
      const code = text(entry?.currencyCode || entry?.currency_code).toUpperCase();
      return ["cash", "checking"].includes(accountType) && code === normalizedCurrency;
    });
    if (row) {
      const amount = Number(row.balance);
      if (Number.isFinite(amount)) return amount;
    }

    if (text(player.currencyCode).toUpperCase() !== normalizedCurrency) return 0;
    const candidates = [
      player.checkingBalance,
      player.cashBalance,
      record(player.balances).checking,
      record(player.accountBalances).checking,
      record(player.accounts).checking,
    ];
    for (const candidate of candidates) {
      const amount = Number(candidate);
      if (Number.isFinite(amount)) return amount;
    }
    return 0;
  }

  function preferLocalCurrency(modal) {
    const select = modal?.querySelector('select[name="valueUnit"]');
    if (!(select instanceof HTMLSelectElement)) return;
    if (select.dataset.econovariaCurrencyChoiceTouched === "true") return;

    const option = [...select.options].find((candidate) => {
      const label = `${candidate.value} ${candidate.textContent || ""}`.toLowerCase();
      return label.includes("local");
    });
    if (!option) return;

    select.value = option.value;
    select.dataset.econovariaLocalDefaultApplied = "true";
  }

  function currencySelection(modal, player) {
    preferLocalCurrency(modal);
    const unit = controlValue(modal, "valueUnit").toLowerCase();
    if (!unit.includes("local")) {
      return { currencyMode: "global_eco", currencyCode: "ECO" };
    }

    const currencyCode = playerLocalCurrencyCode(player);
    if (!currencyCode) {
      throw new Error("The player's active country currency is unavailable.");
    }
    return { currencyMode: "player_country", currencyCode };
  }

  function adjustmentAmount(modal, player, currencyCode) {
    const requested = Number(controlValue(modal, "amount"));
    if (!Number.isFinite(requested) || requested === 0) {
      throw new Error("Enter a non-zero ledger adjustment amount.");
    }

    const type = controlValue(modal, "adjustmentType").toLowerCase();
    if (type.includes("debit")) return -Math.abs(requested);
    if (type.includes("set exact")) {
      const current = numericBalance(player, currencyCode);
      const delta = Math.round((requested - current) * 100) / 100;
      if (delta === 0) throw new Error("The requested checking balance is unchanged.");
      return delta;
    }
    return Math.abs(requested);
  }

  function failureMessage(payload, status) {
    return text(
      payload?.error?.message ||
      payload?.message ||
      payload?.error ||
      `Ledger adjustment failed with status ${status}.`,
    );
  }

  function showFailure(modal, control, message) {
    control.disabled = false;
    control.removeAttribute("aria-busy");
    if (!modal) return;
    let status = modal.querySelector("[data-ledger-adjustment-error]");
    if (!status) {
      status = document.createElement("p");
      status.setAttribute("data-ledger-adjustment-error", "");
      status.setAttribute("role", "alert");
      control.parentElement?.prepend(status);
    }
    status.textContent = message;
    control.focus({ preventScroll: true });
  }

  async function submit(control) {
    const modal = modalFor(control);
    const model = currentModel();
    const player = selectedPlayer(model, modal, control);
    const gameId = activeGameId(model);
    const playerId = text(player.id || player.playerId);
    if (!modal || !gameId || !playerId) {
      throw new Error("The active game or selected player could not be resolved.");
    }

    const note = controlValue(modal, "ledgerNote");
    const category = controlValue(modal, "reasonCategory");
    const reason = note || category;
    if (!reason) throw new Error("Enter a reason for the ledger adjustment.");

    const currency = currencySelection(modal, player);
    const amount = adjustmentAmount(modal, player, currency.currencyCode);

    control.disabled = true;
    control.setAttribute("aria-busy", "true");
    const response = await window.fetch(
      `/api/admin/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(playerId)}/ledger-adjustments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          action: ACTION,
          amount,
          reason,
          accountType: "checking",
          currencyMode: currency.currencyMode,
          currencyCode: currency.currencyCode,
        }),
      },
    );
    const payload = await response.clone().json().catch(() => null);
    if (!response.ok) throw new Error(failureMessage(payload, response.status));

    window.setTimeout(() => window.location.reload(), 0);
  }

  function onClick(event) {
    const control = event.target instanceof Element
      ? event.target.closest(`[data-admin-terminal-action="${ACTION}"]`)
      : null;
    if (!(control instanceof HTMLButtonElement) || inFlight.has(control)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    inFlight.add(control);
    void submit(control)
      .catch((error) => showFailure(modalFor(control), control, text(error?.message) || "Ledger adjustment failed."))
      .finally(() => inFlight.delete(control));
  }

  function onCurrencyChoice(event) {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || select.name !== "valueUnit") return;
    select.dataset.econovariaCurrencyChoiceTouched = "true";
  }

  function applyLocalDefaults(root = document) {
    if (root instanceof Element && root.matches('[role="dialog"]')) {
      preferLocalCurrency(root);
    }
    root.querySelectorAll?.('[role="dialog"]').forEach(preferLocalCurrency);
  }

  function onMountedModalBound(event) {
    const root = event.target instanceof Element ? event.target : document;
    applyLocalDefaults(root);
  }

  document.addEventListener("click", onClick, true);
  document.addEventListener("change", onCurrencyChoice, true);
  document.addEventListener("econovaria:admin-mounted-modal-bound", onMountedModalBound);
  applyLocalDefaults();

  window.EconovariaLedgerAdjustmentWiring = Object.freeze({
    action: ACTION,
    countryCurrencyByCode: COUNTRY_CURRENCY_BY_CODE,
  });
})();
