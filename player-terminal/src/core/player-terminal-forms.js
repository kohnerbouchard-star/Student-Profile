import { bankAvailability } from "../api/banking-balance-values.js";
import { formatCurrency, serializeForm } from "./format.js";
import { marketplaceDraftInventory, marketplaceListableItems } from "../features/marketplace/marketplace-read-model.js";

// Keep validation, estimates and form dispatch together. Economic authority and
// mutation lifetime remain in the existing API/lifecycle owners.
export function createPlayerTerminalForms({ store, mount, showToast, executeEndpoint }) {
  function clearFormError(form) {
    form?.querySelector("[data-player-form-error]")?.remove();
  }

  function showFormError(form, message) {
    clearFormError(form);
    const error = document.createElement("p");
    error.className = "player-terminal-form-error";
    error.dataset.playerFormError = "true";
    error.setAttribute("role", "alert");
    error.textContent = message;
    form.prepend(error);
  }

  function updateMarketOrderEstimate(form) {
    const state = store.getState();
    const assetId = form.elements.namedItem("assetId")?.value;
    const asset = state.data?.market?.assets?.find((item) => item.id === assetId);
    if (!asset) return;
    const quantity = Math.max(0, Number(form.elements.namedItem("quantity")?.value) || 0);
    const orderType = form.elements.namedItem("orderType")?.value || "market";
    const limitField = form.elements.namedItem("limitPrice");
    if (limitField) {
      limitField.required = orderType === "limit";
      limitField.placeholder = orderType === "limit" ? "Required for limit order" : "Optional for market order";
    }
    const price = orderType === "limit" && Number(limitField?.value) > 0 ? Number(limitField.value) : Number(asset.price) || 0;
    const subtotal = quantity * price;
    const fees = subtotal * 0.0025;
    const code = state.data?.session?.currencyCode || "NVC";
    const valueNode = form.querySelector("[data-player-market-estimated-value]");
    const feeNode = form.querySelector("[data-player-market-estimated-fees]");
    if (valueNode) valueNode.textContent = formatCurrency(subtotal, code);
    if (feeNode) feeNode.textContent = formatCurrency(fees, code);
  }

  function updateMarketplaceEstimate(form) {
    const state = store.getState();
    const listing = state.data?.marketplace?.listings?.find((item) => item.id === form.dataset.listingId);
    const output = form.querySelector("[data-player-marketplace-estimated-total]");
    if (!listing || !output) return;
    const quantity = Math.max(0, Number(form.elements.namedItem("quantity")?.value) || 0);
    const feeRate = Number(state.data?.marketplace?.feeRate) || 0;
    output.textContent = formatCurrency(quantity * listing.unitPrice * (1 + feeRate / 100), state.data?.session?.currencyCode);
  }

  function handleInput(event) {
    const field = event.target.closest("input, select, textarea");
    field?.setCustomValidity?.("");
    const parentForm = field?.closest("[data-player-form]");
    parentForm?.classList.remove("has-validation-error");
    clearFormError(parentForm);
    if (parentForm?.dataset.endpoint === "marketOrder") updateMarketOrderEstimate(parentForm);
    if (parentForm?.dataset.endpoint === "marketplacePurchase") updateMarketplaceEstimate(parentForm);

    const search = event.target.closest("[data-player-store-search]");
    if (!search) return;
    const term = String(search.value || "").trim().toLowerCase();
    const cards = [...mount.querySelectorAll(".player-terminal-store-card")];
    cards.forEach((card) => {
      card.hidden = Boolean(term) && !card.textContent.toLowerCase().includes(term);
    });
    const grid = mount.querySelector(".player-terminal-catalog-grid");
    let empty = grid?.querySelector("[data-player-search-empty]");
    const visibleCount = cards.filter((card) => !card.hidden).length;
    if (!visibleCount && grid) {
      if (!empty) {
        empty = document.createElement("p");
        empty.className = "player-terminal-inline-empty player-terminal-search-empty";
        empty.dataset.playerSearchEmpty = "true";
        grid.append(empty);
      }
      empty.textContent = term ? `No store items match “${search.value.trim()}”.` : "No store items are available.";
      empty.hidden = false;
    } else if (empty) {
      empty.hidden = true;
    }
  }

  async function handleSubmit(event) {
    const form = event.target.closest("[data-player-form]");
    if (!form) return;
    event.preventDefault();
    form.classList.add("was-validated");
    const endpointKey = form.dataset.endpoint;
    const state = store.getState();
    const available = bankAvailability(state.data.banking?.checking, state.data.session.currencyCode);
    [...form.elements].forEach((control) => control?.setCustomValidity?.(""));

    if (endpointKey === "savingsTransfer") {
      const from = form.elements.namedItem("fromAccount");
      const to = form.elements.namedItem("toAccount");
      const amount = form.elements.namedItem("amount");
      if (from?.value && from.value === to?.value) to.setCustomValidity("Choose a different destination account.");
      const savingsAvailable = bankAvailability(state.data.banking?.savings, state.data.session.currencyCode);
      const sourceAvailable = from?.value === "savings" ? savingsAvailable : available;
      if (sourceAvailable !== null && Number(amount?.value) > sourceAvailable) amount?.setCustomValidity("The transfer exceeds the available balance in the source account.");
    }

    if (endpointKey === "bankTransfer") {
      const amount = form.elements.namedItem("amount");
      if (available !== null && Number(amount?.value) > available) amount?.setCustomValidity("The transfer exceeds your available checking balance.");
    }

    if (endpointKey === "marketOrder") {
      const asset = state.data.market.assets.find((item) => item.id === form.elements.namedItem("assetId")?.value);
      const side = form.elements.namedItem("side")?.value;
      const orderType = form.elements.namedItem("orderType")?.value;
      const quantityField = form.elements.namedItem("quantity");
      const limitField = form.elements.namedItem("limitPrice");
      const quantity = Number(quantityField?.value) || 0;
      if (orderType === "limit" && !(Number(limitField?.value) > 0)) limitField?.setCustomValidity("Enter a limit price for a limit order.");
      if (asset) {
        const price = orderType === "limit" && Number(limitField?.value) > 0 ? Number(limitField.value) : Number(asset.price);
        if (side === "buy" && available !== null && quantity * price * 1.0025 > available) quantityField?.setCustomValidity("The estimated order total exceeds your available cash.");
        if (side === "sell" && quantity > Number(asset.owned || 0)) quantityField?.setCustomValidity(`You currently own ${Number(asset.owned || 0)} shares.`);
      }
    }

    if (endpointKey === "marketplacePurchase") {
      const listing = state.data.marketplace.listings.find((item) => item.id === form.dataset.listingId);
      const quantityField = form.elements.namedItem("quantity");
      const quantity = Number(quantityField?.value) || 0;
      if (listing && quantity > Number(listing.quantity)) quantityField?.setCustomValidity("The requested quantity exceeds the available listing quantity.");
      if (listing && available !== null && quantity * listing.unitPrice * (1 + Number(state.data.marketplace.feeRate || 0) / 100) > available) quantityField?.setCustomValidity("The estimated purchase total exceeds your available cash.");
    }

    if (endpointKey === "marketplaceListing") {
      const inventory = marketplaceDraftInventory(state.data);
      const itemKey = form.elements.namedItem("itemKey");
      const quantityField = form.elements.namedItem("quantity");
      const matchingItem = itemKey && marketplaceListableItems(inventory)
        .find((item) => item.itemKey === itemKey.value);
      if (inventory === null || !matchingItem) {
        const message = inventory === null
          ? "Inventory unavailable. Refresh before creating a draft."
          : "Choose an Inventory item with available units before creating a draft.";
        form.classList.add("has-validation-error");
        showFormError(form, message);
        itemKey?.focus();
        return;
      }
      const quantity = Number(quantityField?.value);
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        quantityField?.setCustomValidity("Enter a whole number of at least one unit.");
      } else if (quantity > matchingItem.quantityAvailable) {
        quantityField?.setCustomValidity(`Only ${matchingItem.quantityAvailable} units are available in inventory.`);
      }
    }

    // Repayments use the facility's server-bound account and currency, not
    // necessarily home Checking. This read model has no authoritative bound-
    // account availability; retain amount validation and let the command check funds.

    if (endpointKey === "messageSend") {
      const body = form.elements.namedItem("body");
      if (!String(body?.value || "").trim()) body?.setCustomValidity("Enter a message before sending.");
    }

    if (endpointKey === "loanApply") {
      const source = form.elements.namedItem("repaymentSource");
      if (!String(source?.value || "").trim()) source?.setCustomValidity("Describe the expected repayment source.");
    }

    if (!form.checkValidity()) {
      form.classList.add("has-validation-error");
      const invalidField = form.querySelector(":invalid");
      showFormError(form, invalidField?.validationMessage || "Complete the highlighted fields before continuing.");
      invalidField?.focus();
      showToast("Complete the highlighted fields before continuing.", "red");
      return;
    }
    clearFormError(form);
    form.classList.remove("has-validation-error");
    const payload = serializeForm(form);
    const button = form.querySelector('button[type="submit"]');
    const params = {};
    if (endpointKey === "contractSubmit") params.contractId = form.dataset.contractId || payload.contractId;
    if (endpointKey === "businessPrice") params.productId = form.dataset.productId;
    if (endpointKey === "businessManufacturingStart") {
      params.businessId = form.dataset.businessId || payload.businessId || payload.businessKey;
    }
    if (endpointKey === "businessManufacturingCancel") {
      params.businessId = form.dataset.businessId || payload.businessId || payload.businessKey;
      params.jobId = form.dataset.jobId || payload.jobId || payload.jobKey;
    }
    if (endpointKey === "marketplacePurchase") params.listingId = form.dataset.listingId;
    if (endpointKey === "craftItem") params.recipeId = form.dataset.recipeId;
    if (endpointKey === "loanApply") params.offerId = form.dataset.offerId;
    if (endpointKey === "loanRepay") params.loanId = form.dataset.loanId;
    if (endpointKey === "messageSend") params.threadId = form.dataset.threadId;
    payload.gameSessionId = state.data.session.gameSessionId;
    await executeEndpoint(endpointKey, payload, params, button);
  }

  return { handleInput, handleSubmit };
}
