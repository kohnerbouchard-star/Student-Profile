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
  let pending = null;
  let destroyed = false;
  let retired = false;
  let generation = 0;
  const commands = new Map();
  let confirmedQuote = null;
  const sessionIdentity = () => JSON.stringify([
    config.authenticated, config.csrfToken, config.gameSessionId, config.sessionExpiresAt,
    terminal.getState()?.data?.session?.gameSessionId, api.sessionVersion,
  ]);
  let originalSession = null;
  let sessionTicket = null;
  const selection = () => String(terminal.getState()?.ui?.marketplaceListingId || "");
  let lastSelection = selection();
  let lastRoute = terminal.getState()?.route;
  const active = () => !destroyed && !retired && (originalSession === null || sessionIdentity() === originalSession) &&
    (!sessionTicket || terminal.freshness.isCurrent(sessionTicket)) &&
    terminal.getState()?.route === "marketplace" &&
    (!terminal.getState()?.status || terminal.getState().status === "ready");
  function retire() {
    generation++;
    confirmedQuote = null;
    pending?.release();
    invalidateQuote(mount, terminal);
  }
  const unsubscribe = terminal.subscribe?.((state) => {
    if (destroyed) return;
    if (originalSession !== null && (sessionIdentity() !== originalSession ||
        (sessionTicket && !terminal.freshness.isCurrent(sessionTicket)) || state.status === "waiting")) {
      retired = true;
      commands.clear();
    }
    if (!active() || lastRoute !== state.route || lastSelection !== selection()) retire();
    lastRoute = state.route;
    lastSelection = selection();
    if (confirmedQuote && active() && currentMarketplace(terminal).currentFundingQuote !== confirmedQuote) {
      updateMarketplace(terminal, { currentFundingQuote: confirmedQuote });
    }
  });
  function invalidateSession() {
    retired = true;
    commands.clear();
    retire();
  }
  const invalidEvent = String(config.sessionInvalidEvent || "econovaria:player-session-invalid");
  globalThis.addEventListener?.(invalidEvent, invalidateSession);
  function begin(form, label, intent = null) {
    originalSession ??= sessionIdentity();
    sessionTicket ??= terminal.freshness?.capture();
    const restore = setButtonProcessing(form.querySelector('button[type="submit"]'), label);
    const started = generation;
    const selected = selection();
    const ticket = terminal.freshness?.capture();
    const operation = {
      current: (checkIntent = true) => active() && started === generation && selected === selection() &&
        (!ticket || terminal.freshness.isCurrent(ticket)) &&
        (!checkIntent || !intent || (mount.contains(form) && intent === quoteIntent(form))),
      release() {
        if (pending !== operation) return;
        restore();
        pending = null;
        setBusy(mount, false);
      },
    };
    pending = operation;
    setBusy(mount, true);
    clearError(mount);
    return operation;
  }
  function quoteIntent(form) {
    return JSON.stringify([form.dataset.listingId, form.elements.namedItem("quantity")?.value,
      readAllocations(form), selectedListing(terminal, form)?.version]);
  }

  async function createQuote(form) {
    if (!active() || pending) return;
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
    retire();
    const intent = quoteIntent(form);
    api.setSession(config);
    const request = begin(form, "Pricing quote", intent);
    try {
      const operation = await api.execute(
        "marketplacePurchase",
        {
          quantity,
          expectedVersion: Number(listing.version),
          allocations: allocation.allocations,
        },
        { listingId: listing.id },
      );
      if (!request.current()) return;
      const quote = normalizeMarketplaceFundingQuote(operation.result);
      if (quote.listingKey !== listing.id || quote.quantity !== quantity) {
        throw new Error("Marketplace quote does not match the requested selections.");
      }
      // Release the quote operation before rendering its settlement form. This
      // prevents an immediate confirmation from being discarded as "pending"
      // while ensuring the quote's finally block cannot release a newer action.
      request.release();
      updateMarketplace(terminal, {
        currentFundingQuote: quote,
        lastFundingOrder: null,
      });
      terminal.showToast?.("Exact Marketplace funding quote ready for review.", "cyan");
      requestAnimationFrame(() => {
        if (!request.current(false) || currentMarketplace(terminal).currentFundingQuote !== quote) return;
        mount.querySelector('[data-player-marketplace-funding-form="settlement"] button[type="submit"]')
          ?.focus?.({ preventScroll: true });
      });
    } catch (error) {
      if (!destroyed && originalSession !== null && sessionIdentity() !== originalSession) invalidateSession();
      if (!request.current()) return;
      if (error?.code === "REQUEST_ABORTED") { invalidateSession(); return; }
      if (Number(error?.status) === 401) invalidateSession();
      if (dispatchInvalidSession(error, config)) return;
      showError(mount, resolveMarketplaceFundingFailure(error));
    } finally {
      request.release();
    }
  }

  async function settleQuote(form) {
    if (!active() || pending) return;
    const state = terminal.getState();
    if (!isEndpointEnabled(state?.data?.capabilities, "marketplaceSettlement")) return;
    const quote = currentMarketplace(terminal).currentFundingQuote;
    const reservationId = String(
      form.dataset.reservationId || quote?.reservationKey || "",
    ).trim().toLowerCase();
    if (!quote || quote.reservationKey !== reservationId || !/^mpr_[0-9a-f]{32}$/u.test(reservationId)) {
      showError(mount, "Create a current Marketplace quote before confirming settlement.");
      return;
    }
    // Expiry is a pre-confirmation check. An uncertain confirmed command must
    // reach the server replay guard even after expiry or fresh balance reads.
    let command = commands.get(reservationId);
    if (!command && Number.isFinite(Date.parse(quote?.expiresAt)) && Date.parse(quote.expiresAt) <= Date.now()) {
      showError(mount, "The Marketplace quote expired. Create a new quote.");
      return;
    }
    if (!command) {
      command = Object.freeze({ reservationId, clientSubmittedAt: new Date().toISOString() });
      commands.set(reservationId, command);
    }
    confirmedQuote = quote;
    api.setSession(config);
    const request = begin(form, "Settling purchase");
    try {
      const operation = await api.execute(
        "marketplaceSettlement",
        command,
        { reservationId },
      );
      if (!request.current()) return;
      const order = normalizeMarketplaceFundingOrder(operation.result);
      if (order.reservationKey !== reservationId || order.listingKey !== quote.listingKey ||
          order.quantity !== quote.quantity || order.fundingReceipt.quoteKey !== quote.fundingQuote.quoteKey) {
        throw new Error("Marketplace receipt does not match the confirmed quote.");
      }
      confirmedQuote = null;
      updateMarketplace(terminal, {
        currentFundingQuote: null,
        lastFundingOrder: order,
      });
      terminal.showToast?.(
        order.replayed
          ? "Marketplace purchase replayed from the committed receipt."
          : "Marketplace purchase settled and inventory delivered.",
        "green",
      );
      // Receipt acceptance is final; refresh failure cannot turn it into failure.
      try {
        await terminal.refreshResources?.([
          "dashboard",
          "marketplace",
          "inventory",
          "banking",
          "bankingFx",
        ]);
      } catch {
        if (request.current()) terminal.showToast?.("Purchase settled. Refresh Marketplace to update balances and inventory.", "cyan");
      }
    } catch (error) {
      if (!destroyed && originalSession !== null && sessionIdentity() !== originalSession) invalidateSession();
      if (!request.current()) return;
      if (error?.code === "REQUEST_ABORTED") { invalidateSession(); return; }
      if (Number(error?.status) === 401) invalidateSession();
      if (dispatchInvalidSession(error, config)) return;
      // Match PlayerApi's existing uncertain-write retry policy. Definitive
      // rejections retire this command so the player can change funding or quote
      // again; only uncertain outcomes retain the original settlement identity.
      const uncertain = ["NETWORK_ERROR", "OFFLINE", "REQUEST_ABORTED", "REQUEST_TIMEOUT"]
        .includes(error?.code) || Number(error?.status || 0) >= 500;
      if (uncertain) confirmedQuote = Object.freeze({ ...quote, settlementRetry: true });
      else {
        commands.delete(reservationId);
        confirmedQuote = null;
      }
      updateMarketplace(terminal, { currentFundingQuote: confirmedQuote });
      showError(mount, resolveMarketplaceFundingFailure(error));
    } finally {
      request.release();
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
    retire();
    updateAllocationSummary(mount, terminal, form);
  }

  function handleChange(event) {
    const form = event.target.closest?.('[data-player-marketplace-funding-form="quote"]');
    if (!form) return;
    retire();
    updateAllocationSummary(mount, terminal, form);
  }

  mount.addEventListener("submit", handleSubmit, true);
  mount.addEventListener("input", handleInput, true);
  mount.addEventListener("change", handleChange, true);
  return {
    destroy() {
      retire();
      destroyed = true;
      commands.clear();
      unsubscribe?.();
      globalThis.removeEventListener?.(invalidEvent, invalidateSession);
      mount.removeEventListener("submit", handleSubmit, true);
      mount.removeEventListener("input", handleInput, true);
      mount.removeEventListener("change", handleChange, true);
    },
  };
}
