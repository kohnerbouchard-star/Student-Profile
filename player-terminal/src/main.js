import { installCountryFocusController } from "./accessibility/country-focus-controller.js";
import { installSkipLinkController } from "./accessibility/skip-link-controller.js";
import { createPlayerTerminal } from "./app.js";
import { resolvePlayerTerminalConfig } from "./config/player-terminal.config.js";
import { installMarketOrderFlow } from "./features/market/market-order-flow.js";
import { installStorePurchaseFlow } from "./features/store/store-purchase-flow.js";
import { installFormDraftPreserver } from "./forms/form-draft-preserver.js";
import { installPlayerInvalidationController } from "./realtime/player-invalidation-controller.js";

const mount = document.getElementById("playerTerminal");
const config = resolvePlayerTerminalConfig();
const skipLink = installSkipLinkController(mount);
const countryFocus = installCountryFocusController(mount);
const formDrafts = installFormDraftPreserver(mount, {
  sessionReadyEvent: config.sessionReadyEvent,
  sessionInvalidEvent: config.sessionInvalidEvent
});

const terminal = createPlayerTerminal({ mount, config });
const storePurchases = installStorePurchaseFlow({ mount, terminal, config });
const marketOrders = installMarketOrderFlow({ mount, terminal, config });
const invalidations = installPlayerInvalidationController({ terminal, config });
const destroyTerminal = terminal.destroy.bind(terminal);
terminal.destroy = () => {
  invalidations.destroy();
  marketOrders.destroy();
  storePurchases.destroy();
  formDrafts.destroy();
  countryFocus.destroy();
  skipLink.destroy();
  destroyTerminal();
};

globalThis.Econovaria = globalThis.Econovaria || {};
globalThis.Econovaria.playerTerminal = terminal;
