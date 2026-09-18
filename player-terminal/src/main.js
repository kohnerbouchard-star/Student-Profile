import { installCountryFocusController } from "./accessibility/country-focus-controller.js";
import { installSkipLinkController } from "./accessibility/skip-link-controller.js";
import { installToastHostController } from "./accessibility/toast-host-controller.js";
import { createPlayerTerminal } from "./app.js";
import { resolvePlayerTerminalConfig } from "./config/player-terminal.config.js";
import { installBankingReadFlow } from "./features/banking/banking-read-flow.js";
import { installBusinessTreasuryFlow } from "./features/business-treasury/business-treasury-flow.js";
import { installStoryDecisionFlow } from "./features/contracts/story-decision-flow.js";
import { installInventoryActionFlow } from "./features/inventory/inventory-action-flow.js";
import { installLocalControlsFlow } from "./features/local-controls/local-controls-flow.js";
import { installMarketOrderFlow } from "./features/market/market-order-flow.js";
import { installMarketplaceFundingFlow } from "./features/marketplace/marketplace-funding-flow.js";
import { installMessageIntentAdapter } from "./features/messages/message-intent-adapter.js";
import { installMessageReadFlow } from "./features/messages/message-read-flow.js";
import { installNotificationInboxFlow } from "./features/notifications/notification-inbox-flow.js";
import { installStoryDeliveryFlow } from "./features/notifications/story-delivery-flow.js";
import { installStorePurchaseFlow } from "./features/store/store-purchase-flow.js";
import { installWorldRuntimeFlow } from "./features/world/world-runtime-flow.js";
import { installFormDraftPreserver } from "./forms/form-draft-preserver.js";
import { installPlayerLogoutController } from "./integrations/player-logout-controller.js";
import { installStudentProfileRuntime } from "./integrations/student-profile-runtime.js";
import { installLiveStatusPresenter } from "./realtime/live-status-presenter.js";
import { installPlayerInvalidationController } from "./realtime/player-invalidation-controller.js";
import { installPlayerSessionSafeExit } from "./session-timeout-safe-exit.js";

const mount = document.getElementById("playerTerminal");
const config = installStudentProfileRuntime(resolvePlayerTerminalConfig());
const skipLink = installSkipLinkController(mount);
const countryFocus = installCountryFocusController(mount);
const toastHost = installToastHostController(mount);
const formDrafts = installFormDraftPreserver(mount, {
  sessionReadyEvent: config.sessionReadyEvent,
  sessionInvalidEvent: config.sessionInvalidEvent,
});
const messageIntents = installMessageIntentAdapter({ mount, drafts: formDrafts });

const terminal = createPlayerTerminal({ mount, config });
const storyDecisions = installStoryDecisionFlow({ mount, terminal, config });
const messageReads = installMessageReadFlow({ mount, terminal, config });
const sessionSafeExit = installPlayerSessionSafeExit({ terminal, config, mount });
const logout = installPlayerLogoutController({ terminal, config, mount });
const localControls = installLocalControlsFlow({ mount, terminal });
const inventoryActions = installInventoryActionFlow({ mount, terminal, config });
const storePurchases = installStorePurchaseFlow({ mount, terminal, config });
const marketOrders = installMarketOrderFlow({ mount, terminal, config });
const marketplaceFunding = installMarketplaceFundingFlow({ mount, terminal, config });
const bankingReads = installBankingReadFlow({ mount, terminal, config });
const businessTreasury = installBusinessTreasuryFlow({ mount, terminal, config });
const notifications = installNotificationInboxFlow({ mount, terminal, config });
const storyDeliveries = installStoryDeliveryFlow({ mount, terminal, config });
const worldRuntime = installWorldRuntimeFlow({ mount, terminal, config });
const invalidations = installPlayerInvalidationController({ terminal, config, mount });
const liveStatus = installLiveStatusPresenter({ mount, terminal, config });
const destroyTerminal = terminal.destroy.bind(terminal);
let coreTerminalDestroyed = false;
const stopCoreTerminal = () => {
  if (coreTerminalDestroyed) return;
  coreTerminalDestroyed = true;
  destroyTerminal();
};
terminal.prepareForSessionExit = stopCoreTerminal;
terminal.destroy = () => {
  logout.destroy();
  sessionSafeExit.destroy();
  liveStatus.destroy();
  invalidations.destroy();
  worldRuntime.destroy();
  storyDeliveries.destroy();
  notifications.destroy();
  businessTreasury.destroy();
  bankingReads.destroy();
  marketplaceFunding.destroy();
  marketOrders.destroy();
  storePurchases.destroy();
  inventoryActions.destroy();
  localControls.destroy();
  messageReads.destroy();
  storyDecisions.destroy();
  messageIntents.destroy();
  formDrafts.destroy();
  toastHost.destroy();
  countryFocus.destroy();
  skipLink.destroy();
  stopCoreTerminal();
};

globalThis.Econovaria = globalThis.Econovaria || {};
globalThis.Econovaria.playerTerminal = terminal;
globalThis.Econovaria.playerWorldRuntime = worldRuntime;
