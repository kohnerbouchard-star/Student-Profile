import { installCountryFocusController } from "./accessibility/country-focus-controller.js";
import { installSkipLinkController } from "./accessibility/skip-link-controller.js";
import { createPlayerTerminal } from "./app.js";
import { resolvePlayerTerminalConfig } from "./config/player-terminal.config.js";
import { installBankingReadFlow } from "./features/banking/banking-read-flow.js";
import { installMarketOrderFlow } from "./features/market/market-order-flow.js";
import { installNotificationInboxFlow } from "./features/notifications/notification-inbox-flow.js";
import { installStoryDeliveryFlow } from "./features/notifications/story-delivery-flow.js";
import { installStorePurchaseFlow } from "./features/store/store-purchase-flow.js";
import { installWorldRuntimeFlow } from "./features/world/world-runtime-flow.js";
import { installFormDraftPreserver } from "./forms/form-draft-preserver.js";
import { installPlayerLogoutController } from "./integrations/player-logout-controller.js";
import { installStudentProfileRuntime } from "./integrations/student-profile-runtime.js";
import { installPlayerInvalidationController } from "./realtime/player-invalidation-controller.js";
import { installPlayerSessionSafeExit } from "./session-timeout-safe-exit.js";

const mount = document.getElementById("playerTerminal");
const config = installStudentProfileRuntime(resolvePlayerTerminalConfig());
const skipLink = installSkipLinkController(mount);
const countryFocus = installCountryFocusController(mount);
const formDrafts = installFormDraftPreserver(mount, {
  sessionReadyEvent: config.sessionReadyEvent,
  sessionInvalidEvent: config.sessionInvalidEvent,
});

const terminal = createPlayerTerminal({ mount, config });
const sessionSafeExit = installPlayerSessionSafeExit({ terminal, config, mount });
const logout = installPlayerLogoutController({ terminal, config, mount });
const storePurchases = installStorePurchaseFlow({ mount, terminal, config });
const marketOrders = installMarketOrderFlow({ mount, terminal, config });
const bankingReads = installBankingReadFlow({ mount, terminal, config });
const notifications = installNotificationInboxFlow({ mount, terminal, config });
const storyDeliveries = installStoryDeliveryFlow({ mount, terminal, config });
const worldRuntime = installWorldRuntimeFlow({ mount, terminal, config });
const invalidations = installPlayerInvalidationController({ terminal, config });
const destroyTerminal = terminal.destroy.bind(terminal);
terminal.destroy = () => {
  logout.destroy();
  sessionSafeExit.destroy();
  invalidations.destroy();
  worldRuntime.destroy();
  storyDeliveries.destroy();
  notifications.destroy();
  bankingReads.destroy();
  marketOrders.destroy();
  storePurchases.destroy();
  formDrafts.destroy();
  countryFocus.destroy();
  skipLink.destroy();
  destroyTerminal();
};

globalThis.Econovaria = globalThis.Econovaria || {};
globalThis.Econovaria.playerTerminal = terminal;
globalThis.Econovaria.playerWorldRuntime = worldRuntime;
