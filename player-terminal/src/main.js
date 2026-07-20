import { installCountryFocusController } from "./accessibility/country-focus-controller.js";
import { installSkipLinkController } from "./accessibility/skip-link-controller.js";
import { createPlayerTerminal } from "./app.js";
import { resolvePlayerTerminalConfig } from "./config/player-terminal.config.js";
import { installBankingReadFlow } from "./features/banking/banking-read-flow.js";
import { installMarketOrderFlow } from "./features/market/market-order-flow.js";
import { installNotificationInboxFlow } from "./features/notifications/notification-inbox-flow.js";
import { installStorePurchaseFlow } from "./features/store/store-purchase-flow.js";
import { installFormDraftPreserver } from "./forms/form-draft-preserver.js";
import { installPlayerLogoutController } from "./integrations/player-logout-controller.js";
import { installStudentProfileRuntime } from "./integrations/student-profile-runtime.js";
import { installPlayerInvalidationController } from "./realtime/player-invalidation-controller.js";
import {
  installPlayerRecoveryController,
  installPlayerRecoveryInstrumentation
} from "./recovery/player-recovery-controller.js";
import { installPlayerSessionSafeExit } from "./session-timeout-safe-exit.js";

const mount = document.getElementById("playerTerminal");
const config = installStudentProfileRuntime(resolvePlayerTerminalConfig());
const recoveryInstrumentation = installPlayerRecoveryInstrumentation({ runtime: globalThis });
const skipLink = installSkipLinkController(mount);
const countryFocus = installCountryFocusController(mount);
const formDrafts = installFormDraftPreserver(mount, {
  sessionReadyEvent: config.sessionReadyEvent,
  sessionInvalidEvent: config.sessionInvalidEvent,
});

const terminal = createPlayerTerminal({ mount, config });
const recovery = installPlayerRecoveryController({ mount, terminal, config, runtime: globalThis });
const sessionSafeExit = installPlayerSessionSafeExit({
  terminal,
  config,
  mount,
});
const logout = installPlayerLogoutController({ terminal, config, mount });
const storePurchases = installStorePurchaseFlow({ mount, terminal, config });
const marketOrders = installMarketOrderFlow({ mount, terminal, config });
const bankingReads = installBankingReadFlow({ mount, terminal, config });
const notifications = installNotificationInboxFlow({ mount, terminal, config });
const invalidations = installPlayerInvalidationController({ terminal, config });
const destroyTerminal = terminal.destroy.bind(terminal);
terminal.destroy = () => {
  recovery.destroy();
  logout.destroy();
  sessionSafeExit.destroy();
  invalidations.destroy();
  notifications.destroy();
  bankingReads.destroy();
  marketOrders.destroy();
  storePurchases.destroy();
  formDrafts.destroy();
  countryFocus.destroy();
  skipLink.destroy();
  destroyTerminal();
  recoveryInstrumentation.destroy();
};

globalThis.Econovaria = globalThis.Econovaria || {};
globalThis.Econovaria.playerTerminal = terminal;
