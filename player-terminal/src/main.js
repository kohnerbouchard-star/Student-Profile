import { installCountryFocusController } from "./accessibility/country-focus-controller.js";
import { installSkipLinkController } from "./accessibility/skip-link-controller.js";
import { createPlayerTerminal } from "./app.js";
import { resolvePlayerTerminalConfig } from "./config/player-terminal.config.js";
import { installBankingReadFlow } from "./features/banking/banking-read-flow.js";
import { installLocalControlsFlow } from "./features/local-controls/local-controls-flow.js";
import { installMarketOrderFlow } from "./features/market/market-order-flow.js";
import { installMessageIntentAdapter } from "./features/messages/message-intent-adapter.js";
import { installNotificationInboxFlow } from "./features/notifications/notification-inbox-flow.js";
import { installStoryDeliveryFlow } from "./features/notifications/story-delivery-flow.js";
import { installStorePurchaseFlow } from "./features/store/store-purchase-flow.js";
import { installWorldRuntimeFlow } from "./features/world/world-runtime-flow.js";
import { installFormDraftPreserver } from "./forms/form-draft-preserver.js";
import { installPlayerLogoutController } from "./integrations/player-logout-controller.js";
import { installStudentProfileRuntime } from "./integrations/student-profile-runtime.js";
import { renderWorldPage } from "./pages/world-page.js";
import { installPlayerInvalidationController } from "./realtime/player-invalidation-controller.js";
import { installPlayerSessionSafeExit } from "./session-timeout-safe-exit.js";

function installWorldRouteRenderBridge({ mount, terminal, worldRuntime }) {
  let scheduled = false;
  let retryTimer = 0;

  const synchronize = (state) => {
    if (state?.status !== "ready" || state?.route !== "world") return;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const current = terminal.getState();
      if (current?.status !== "ready" || current?.route !== "world") return;
      const host = mount.querySelector(".player-terminal-page-host");
      if (!host) return;
      const flowState = worldRuntime.getState();
      const model = flowState.model?.runtimeAvailable === true
        ? flowState.model
        : current.data?.worldRuntime
          ? { ...current.data.worldRuntime, runtimeAvailable: true }
          : null;
      if (!model) {
        clearTimeout(retryTimer);
        retryTimer = globalThis.setTimeout(() => synchronize(terminal.getState()), 100);
        return;
      }
      const hasLiveArrivalSurface = Boolean(
        host.querySelector("#world-arrival-title") ||
        host.querySelector('[data-world-form="arrivalClass"]'),
      );
      if (hasLiveArrivalSurface) return;
      host.innerHTML = renderWorldPage(model, {
        state: flowState.state || "ready",
        message: flowState.message || "",
        quote: flowState.quote || null,
        offline: globalThis.navigator?.onLine === false,
        stale: false,
        capabilities: current.data.capabilities || { routes: {}, actions: {} },
      });
    });
  };

  const unsubscribe = terminal.subscribe(synchronize);
  synchronize(terminal.getState());
  return Object.freeze({
    destroy() {
      clearTimeout(retryTimer);
      unsubscribe();
    },
  });
}

const mount = document.getElementById("playerTerminal");
const config = installStudentProfileRuntime(resolvePlayerTerminalConfig());
const skipLink = installSkipLinkController(mount);
const countryFocus = installCountryFocusController(mount);
const formDrafts = installFormDraftPreserver(mount, {
  sessionReadyEvent: config.sessionReadyEvent,
  sessionInvalidEvent: config.sessionInvalidEvent,
});
const messageIntents = installMessageIntentAdapter({ mount, drafts: formDrafts });

const terminal = createPlayerTerminal({ mount, config });
const sessionSafeExit = installPlayerSessionSafeExit({ terminal, config, mount });
const logout = installPlayerLogoutController({ terminal, config, mount });
const localControls = installLocalControlsFlow({ mount, terminal });
const storePurchases = installStorePurchaseFlow({ mount, terminal, config });
const marketOrders = installMarketOrderFlow({ mount, terminal, config });
const bankingReads = installBankingReadFlow({ mount, terminal, config });
const notifications = installNotificationInboxFlow({ mount, terminal, config });
const storyDeliveries = installStoryDeliveryFlow({ mount, terminal, config });
const worldRuntime = installWorldRuntimeFlow({ mount, terminal, config });
const worldRouteRenderBridge = installWorldRouteRenderBridge({ mount, terminal, worldRuntime });
const invalidations = installPlayerInvalidationController({ terminal, config });
const destroyTerminal = terminal.destroy.bind(terminal);
terminal.destroy = () => {
  logout.destroy();
  sessionSafeExit.destroy();
  invalidations.destroy();
  worldRouteRenderBridge.destroy();
  worldRuntime.destroy();
  storyDeliveries.destroy();
  notifications.destroy();
  bankingReads.destroy();
  marketOrders.destroy();
  storePurchases.destroy();
  localControls.destroy();
  messageIntents.destroy();
  formDrafts.destroy();
  countryFocus.destroy();
  skipLink.destroy();
  destroyTerminal();
};

globalThis.Econovaria = globalThis.Econovaria || {};
globalThis.Econovaria.playerTerminal = terminal;
globalThis.Econovaria.playerWorldRuntime = worldRuntime;
