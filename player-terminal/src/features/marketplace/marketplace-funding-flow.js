import { isEndpointEnabled, isRouteEnabled } from "../../api/capabilities.js";
import { PlayerApi } from "../../api/player-api.js";
import { setButtonProcessing } from "../../core/dom.js";
import { formatCurrency } from "../../core/format.js";
import {
  normalizeMarketplaceFundingOrder,
  normalizeMarketplaceFundingQuote,
  resolveMarketplaceFundingFailure,
} from "./marketplace-funding-read-model.js";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
      return Array.isArray(value) ? value : [];
    }
    function currencyMinorUnit(terminal, currencyCode) {
      const code = String(currencyCode || "").trim().toUpperCase();
      const currencies = list(terminal.getState()?.data?.bankingFx?.currencies);
      const minorUnit = Number(
        currencies.find((entry) => entry?.currencyCode === code)?.minorUnit,
      );
      return Number.isSafeInteger(minorUnit) && minorUnit >= 0 && minorUnit <= 4
        ? minorUnit
        : 2;
    }
    function roundCurrency(value, minorUnit) {
      const factor = 10 ** minorUnit;
      return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
    }
    function estimatedMarketplaceBill(terminal, listing, quantity) {
      const market = currentMarketplace(terminal);
      const minorUnit = currencyMinorUnit(terminal, listing?.currencyCode);
      const subtotal = roundCurrency(
        Math.max(0, Number(listing?.unitPrice) || 0) * Math.max(0, Number(quantity) || 0),
        minorUnit,
      );
      const feeAmount = roundCurrency(
        subtotal * Math.max(0, Number(market.platformFeeRate) || 0) / 100,
        minorUnit,
      );
      const taxAmount = roundCurrency(
        subtotal * Math.max(0, Number(market.taxRate) || 0) / 100,
        minorUnit,
      );
      return roundCurrency(subtotal + feeAmount + taxAmount, minorUnit);
    }
function dispatchInvalidSession(error, config, runtime = globalThis) {
  if (Number(error?.status) !== 401) return false;
  const detail = Object.freeze({
    reason: "invalid_player_session",
    terminal: "player",
    status: 401,
    code: String(error?.code || "SESSION_INVALID"),
    requestId: String(error?.requestId || ""),
  });
  try {
    config.onSessionInvalid?.(detail);
  } catch {
    // Host callbacks cannot block the safe-exit event.
  }
  const eventName = String(
    config.sessionInvalidEvent || "econovaria:player-session-invalid",
  );
  runtime.dispatchEvent?.(new runtime.CustomEvent(eventName, { detail }));
  return true;
}
function currentMarketplace(terminal) {
  return object(terminal.getState()?.data?.marketplace);
}
function updateMarketplace(terminal, patch) {
  const state = terminal.getState();
  if (!state?.data) return;
  state.data.marketplace = { ...currentMarketplace(terminal), ...patch };
  terminal.requestRender?.();
}
function showError(mount, message) {
  const host = mount.querySelector("[data-player-marketplace-funding-error]");
  if (!host) return;
  host.textContent = message;
  host.hidden = false;
  host.focus?.({ preventScroll: true });
}
function clearError(mount) {
  const host = mount.querySelector("[data-player-marketplace-funding-error]");
  if (!host) return;
  host.textContent = "";
  host.hidden = true;
}
function setBusy(mount, busy) {
  const panel = mount.querySelector(".player-terminal-marketplace-detail");
  if (!panel) return;
  if (busy) panel.setAttribute("aria-busy", "true");
  else panel.removeAttribute("aria-busy");
}
function selectedListing(terminal, form) {
  const listingId = String(form.dataset.listingId || "").trim().toLowerCase();
  return list(currentMarketplace(terminal).listings).find(
    (listing) => listing.id === listingId,
  ) || null;
}
function estimatedBill(terminal, form) {
      const listing = selectedListing(terminal, form);
      const quantity = Math.max(0, Number(form.elements.namedItem("quantity")?.value) || 0);
      return listing ? estimatedMarketplaceBill(terminal, listing, quantity) : 0;
    }
function allocationRows(form) {
  return [...form.querySelectorAll("[data-player-marketplace-funding-row]")];
}
function readAllocations(form) {
  const allocations = [];
  const accountKeys = new Set();
  for (const row of allocationRows(form)) {
    const sourceAccountKey = String(
      row.querySelector('[name="sourceAccountKey"]')?.value || "",
    ).trim().toLowerCase();
    const targetAmount = Number(
      row.querySelector('[name="targetAmount"]')?.value,
    );
    if (!sourceAccountKey && !(targetAmount > 0)) continue;
    if (!/^bac_[0-9a-f]{32}$/u.test(sourceAccountKey)) {
      return { error: "Choose a valid Checking account for every allocation." };
    }
    if (accountKeys.has(sourceAccountKey)) {
      return { error: "Each Checking account may be selected only once." };
    }
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      return { error: "Enter a positive listing-currency amount for every selected account." };
    }
    accountKeys.add(sourceAccountKey);
    allocations.push({ sourceAccountKey, targetAmount });
  }
  if (allocations.length < 1 || allocations.length > 3) {
    return { error: "Select between one and three Checking accounts." };
  }
  return { allocations };
}
function updateAllocationSummary(mount, terminal, form) {
  const estimate = estimatedBill(terminal, form);
  const allocation = readAllocations(form);
  const funded = allocation.allocations
    ? allocation.allocations.reduce((sum, row) => sum + row.targetAmount, 0)
    : 0;
  const listing = selectedListing(terminal, form);
    const currencyCode = String(listing?.currencyCode || "ECO").toUpperCase();
    const minorUnit = currencyMinorUnit(terminal, currencyCode);
  const estimateNode = form.querySelector("[data-player-marketplace-estimated-total]");
  const allocatedNode = form.querySelector("[data-player-marketplace-allocated-total]");
  const remainingNode = form.querySelector("[data-player-marketplace-remaining-total]");
  if (estimateNode) estimateNode.textContent = formatCurrency(estimate, currencyCode);
  if (allocatedNode) allocatedNode.textContent = formatCurrency(funded, currencyCode);
  if (remainingNode) {
    remainingNode.textContent = formatCurrency(
    Math.max(roundCurrency(estimate - funded, minorUnit), 0),
    currencyCode,
  );
  }
  const submit = form.querySelector('button[type="submit"]');
  const coherent = !allocation.error && estimate > 0 &&
    Math.abs(roundCurrency(funded, minorUnit) - estimate) <= 10 ** -(minorUnit + 6);
  if (submit) submit.disabled = !coherent;
}
function invalidateQuote(mount, terminal) {
  const marketplace = currentMarketplace(terminal);
  if (!marketplace.currentFundingQuote) return;
  marketplace.currentFundingQuote = null;
  const quote = mount.querySelector("[data-player-marketplace-funding-quote]");
  if (quote) {
    quote.innerHTML = "<small>QUOTE INVALIDATED</small><strong>Selections changed</strong><p>Create a new exact quote before confirming settlement.</p>";
  }
}

export function installMarketplaceFundingFlow({ mount, terminal, config }) {
  if (!(mount instanceof HTMLElement)) return { destroy() {} };
  if (!terminal || typeof terminal.getState !== "function") {
    throw new TypeError("The Marketplace funding flow requires an active Player terminal.");
  }
  const api = new PlayerApi(config);
  let pending = false;
  let destroyed = false;

  async function createQuote(form) {
    if (destroyed || pending) return;
    const state = terminal.getState();
    if (
      state?.route !== "marketplace" ||
      !isRouteEnabled(state.data?.capabilities, "marketplace") ||
      !isEndpointEnabled(state.data?.capabilities, "marketplacePurchase")
    ) return;
    const listing = selectedListing(terminal, form);
    const allocation = readAllocations(form);
    const quantity = Number(form.elements.namedItem("quantity")?.value);
    if (!listing || allocation.error || !Number.isSafeInteger(quantity) || quantity < 1) {
      showError(mount, allocation.error || "Marketplace quote selections are incomplete.");
      return;
    }
    if (quantity > Number(listing.quantity)) {
    showError(mount, "The requested quantity exceeds the available listing quantity.");
    return;
  }
  const minorUnit = currencyMinorUnit(terminal, listing.currencyCode);
  if (allocation.allocations.some((row) =>
    Math.abs(row.targetAmount - roundCurrency(row.targetAmount, minorUnit)) >
      10 ** -(minorUnit + 6)
  )) {
    showError(mount, `Use ${minorUnit} decimal places for ${listing.currencyCode}.`);
    return;
  }
  const expectedTotal = estimatedMarketplaceBill(terminal, listing, quantity);
  const allocatedTotal = roundCurrency(
    allocation.allocations.reduce((sum, row) => sum + row.targetAmount, 0),
    minorUnit,
  );
  if (Math.abs(allocatedTotal - expectedTotal) > 10 ** -(minorUnit + 6)) {
    showError(mount, "Funding allocations must pay the exact listing-currency bill.");
    return;
  }
    const button = form.querySelector('button[type="submit"]');
    const restore = setButtonProcessing(button, "Pricing quote");
    pending = true;
    setBusy(mount, true);
    clearError(mount);
    try {
      api.setSession(config);
      const operation = await api.execute(
        "marketplacePurchase",
        {
          quantity,
          expectedVersion: Number(listing.version),
          allocations: allocation.allocations,
        },
        { listingId: listing.id },
      );
      const quote = normalizeMarketplaceFundingQuote(operation.result);
      updateMarketplace(terminal, {
        currentFundingQuote: quote,
        lastFundingOrder: null,
      });
      terminal.showToast?.("Exact Marketplace funding quote ready for review.", "cyan");
      requestAnimationFrame(() => {
        mount.querySelector('[data-player-marketplace-funding-form="settlement"] button[type="submit"]')
          ?.focus?.({ preventScroll: true });
      });
    } catch (error) {
      if (dispatchInvalidSession(error, config)) return;
      showError(mount, resolveMarketplaceFundingFailure(error));
    } finally {
      restore();
      pending = false;
      setBusy(mount, false);
    }
  }

  async function settleQuote(form) {
    if (destroyed || pending) return;
    const state = terminal.getState();
    if (!isEndpointEnabled(state?.data?.capabilities, "marketplaceSettlement")) return;
    const quote = currentMarketplace(terminal).currentFundingQuote;
    const reservationId = String(
      form.dataset.reservationId || quote?.reservationKey || "",
    ).trim().toLowerCase();
    if (!/^mpr_[0-9a-f]{32}$/u.test(reservationId)) {
      showError(mount, "Create a current Marketplace quote before confirming settlement.");
      return;
    }
    if (Number.isFinite(Date.parse(quote?.expiresAt)) && Date.parse(quote.expiresAt) <= Date.now()) {
      showError(mount, "The Marketplace quote expired. Create a new quote.");
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const restore = setButtonProcessing(button, "Settling purchase");
    pending = true;
    setBusy(mount, true);
    clearError(mount);
    try {
      api.setSession(config);
      const operation = await api.execute(
        "marketplaceSettlement",
        { reservationId, clientSubmittedAt: new Date().toISOString() },
        { reservationId },
      );
      const order = normalizeMarketplaceFundingOrder(operation.result);
      updateMarketplace(terminal, {
        currentFundingQuote: null,
        lastFundingOrder: order,
      });
      await terminal.refreshResources?.([
        "dashboard",
        "marketplace",
        "inventory",
        "banking",
        "bankingFx",
      ]);
      terminal.showToast?.(
        order.replayed
          ? "Marketplace purchase replayed from the committed receipt."
          : "Marketplace purchase settled and inventory delivered.",
        "green",
      );
    } catch (error) {
      if (dispatchInvalidSession(error, config)) return;
      showError(mount, resolveMarketplaceFundingFailure(error));
    } finally {
      restore();
      pending = false;
      setBusy(mount, false);
    }
  }

  function handleSubmit(event) {
    const form = event.target.closest?.("[data-player-marketplace-funding-form]");
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (form.dataset.playerMarketplaceFundingForm === "quote") {
      void createQuote(form);
    } else if (form.dataset.playerMarketplaceFundingForm === "settlement") {
      void settleQuote(form);
    }
  }

  function handleInput(event) {
    const form = event.target.closest?.('[data-player-marketplace-funding-form="quote"]');
    if (!form) return;
    invalidateQuote(mount, terminal);
    updateAllocationSummary(mount, terminal, form);
  }

  function handleChange(event) {
    const form = event.target.closest?.('[data-player-marketplace-funding-form="quote"]');
    if (!form) return;
    invalidateQuote(mount, terminal);
    updateAllocationSummary(mount, terminal, form);
  }

  mount.addEventListener("submit", handleSubmit, true);
  mount.addEventListener("input", handleInput, true);
  mount.addEventListener("change", handleChange, true);
  return {
    destroy() {
      destroyed = true;
      mount.removeEventListener("submit", handleSubmit, true);
      mount.removeEventListener("input", handleInput, true);
      mount.removeEventListener("change", handleChange, true);
    },
  };
}
