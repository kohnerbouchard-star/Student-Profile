import {
  isActionEnabled,
  isEndpointEnabled,
  isRouteEnabled
} from "../api/capabilities.js";

const ENDPOINT_CONTROLS = Object.freeze([
  ["[data-player-marketplace-cancel]", "marketplaceCancel"],
  ["[data-player-skill-unlock]", "progressionUnlock"],
  ["[data-player-reward-claim]", "progressionClaim"],
  ["[data-player-market-watchlist]", "marketWatchlist"],
  ["[data-player-purchase]", "storePurchase"],
  ["[data-player-contract-accept]", "contractAccept"],
  ["[data-player-inventory-use]", "inventoryUse"],
  ['[data-player-action="notifications-read"]', "notificationsRead"]
]);

const LOCAL_CONTROLS = Object.freeze({
  "download-transactions": "bankingExport",
  "market-search": "marketSearch",
  "chart-range": "chartRange",
  "message-search": "messageSearch",
  "message-attachment": "messageAttachment"
});

function disableControl(control, reason = "Not available in this game.") {
  if (!(control instanceof HTMLElement)) return;
  if (control.matches("form")) {
    control.querySelectorAll("input, select, textarea, button").forEach((field) => {
      field.disabled = true;
    });
  } else if ("disabled" in control) {
    control.disabled = true;
  }
  control.setAttribute("aria-disabled", "true");
  control.setAttribute("title", reason);
}

export function applyCapabilityControls(mount, capabilities) {
  mount.querySelectorAll("[data-route]").forEach((control) => {
    if (!isRouteEnabled(capabilities, control.dataset.route)) {
      disableControl(control, "This section is not enabled for the current game.");
    }
  });

  mount.querySelectorAll("[data-player-form][data-endpoint]").forEach((form) => {
    if (!isEndpointEnabled(capabilities, form.dataset.endpoint)) disableControl(form);
  });

  ENDPOINT_CONTROLS.forEach(([selector, endpointKey]) => {
    if (!isEndpointEnabled(capabilities, endpointKey)) {
      mount.querySelectorAll(selector).forEach((control) => disableControl(control));
    }
  });

  mount.querySelectorAll("[data-player-local-action]").forEach((control) => {
    const action = LOCAL_CONTROLS[control.dataset.playerLocalAction];
    if (action && !isActionEnabled(capabilities, action)) disableControl(control);
  });
}
