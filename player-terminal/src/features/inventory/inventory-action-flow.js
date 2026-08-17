import { PlayerApi } from "../../api/player-api.js";
import { playerSafeErrorMessage } from "../../api/errors.js";
import { setButtonProcessing } from "../../core/dom.js";

function safeInventoryMessage(error, fallback) {
  const code = String(error?.code || "").trim().toUpperCase();
  const status = Number(error?.status || 0);
  if (code || status) return playerSafeErrorMessage({ status, code });
  return String(error?.message || fallback);
}

function notify(terminal, message, tone = "success") {
  if (typeof terminal?.showToast === "function") {
    terminal.showToast(message, tone);
    return;
  }
  globalThis.dispatchEvent?.(new CustomEvent("econovaria:player-toast", {
    detail: { message, tone }
  }));
}

export function installInventoryActionFlow({ mount, terminal, config }) {
  if (!(mount instanceof HTMLElement)) return { destroy() {} };
  if (!terminal || typeof terminal.refresh !== "function") {
    throw new TypeError("The inventory action flow requires an active player terminal.");
  }

  const api = new PlayerApi(config);

  async function useItem(button) {
    const itemKey = String(button.dataset.playerInventoryEffectUse || "").trim();
    if (!itemKey) return;
    const restoreButton = setButtonProcessing(button, "Using");
    try {
      api.setSession(config);
      await api.execute("itemEffectUse", {
        itemKey,
        idempotencyKey: `item-use-${itemKey}-${Date.now()}`
      });
      notify(terminal, "Item used.", "success");
      await terminal.refresh();
    } catch (error) {
      notify(terminal, safeInventoryMessage(error, "The item could not be used."), "error");
    } finally {
      restoreButton();
    }
  }

  async function requestRedemption(button) {
    const inventoryItemId = String(button.dataset.playerInventoryRedeem || "").trim();
    if (!inventoryItemId) return;

    const quantityRaw = globalThis.prompt?.("Quantity to redeem:", "1");
    if (quantityRaw === null || quantityRaw === undefined) return;
    const quantity = Number(quantityRaw);
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      notify(terminal, "Enter a whole-number redemption quantity of at least 1.", "error");
      return;
    }

    const note = globalThis.prompt?.("Optional note for the teacher:", "") || "";
    const restoreButton = setButtonProcessing(button, "Requesting");
    try {
      api.setSession(config);
      await api.execute("inventoryUse", {
        inventoryItemId,
        quantity,
        note,
        idempotencyKey: `redemption-${inventoryItemId}-${Date.now()}`
      });
      notify(terminal, "Redemption request submitted.", "success");
      await terminal.refresh();
    } catch (error) {
      notify(terminal, safeInventoryMessage(error, "The redemption request could not be submitted."), "error");
    } finally {
      restoreButton();
    }
  }

  function handleClick(event) {
    const useButton = event.target.closest?.("[data-player-inventory-effect-use]");
    if (useButton && mount.contains(useButton)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!useButton.disabled && useButton.getAttribute("aria-disabled") !== "true") {
        void useItem(useButton);
      }
      return;
    }

    const redeemButton = event.target.closest?.("[data-player-inventory-redeem]");
    if (redeemButton && mount.contains(redeemButton)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!redeemButton.disabled && redeemButton.getAttribute("aria-disabled") !== "true") {
        void requestRedemption(redeemButton);
      }
    }
  }

  mount.addEventListener("click", handleClick, true);
  return {
    destroy() {
      mount.removeEventListener("click", handleClick, true);
    }
  };
}
