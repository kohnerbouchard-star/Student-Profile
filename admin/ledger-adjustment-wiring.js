(function initEconovariaLedgerAdjustmentWiring() {
  "use strict";

  const ACTION = "confirm-player-balance-adjustment";
  const inFlight = new WeakSet();

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

  function numericBalance(player) {
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
    return null;
  }

  function adjustmentAmount(modal, player) {
    const requested = Number(controlValue(modal, "amount"));
    if (!Number.isFinite(requested) || requested === 0) {
      throw new Error("Enter a non-zero ledger adjustment amount.");
    }

    const type = controlValue(modal, "adjustmentType").toLowerCase();
    if (type.includes("debit")) return -Math.abs(requested);
    if (type.includes("set exact")) {
      const current = numericBalance(player);
      if (!Number.isFinite(current)) {
        throw new Error("The current checking balance is unavailable.");
      }
      const delta = Math.round((requested - current) * 100) / 100;
      if (delta === 0) throw new Error("The requested checking balance is unchanged.");
      return delta;
    }
    return Math.abs(requested);
  }

  function currencyCode(modal, player) {
    const unit = controlValue(modal, "valueUnit").toLowerCase();
    if (!unit.includes("local")) return "ECO";
    return text(
      player.currencyCode ||
      player.localCurrencyCode ||
      player.countryCurrencyCode ||
      record(player.country).currencyCode ||
      "ECO",
    ).toUpperCase();
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
          amount: adjustmentAmount(modal, player),
          reason,
          accountType: "checking",
          currencyCode: currencyCode(modal, player),
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

  document.addEventListener("click", onClick, true);

  window.EconovariaLedgerAdjustmentWiring = Object.freeze({ action: ACTION });
})();
