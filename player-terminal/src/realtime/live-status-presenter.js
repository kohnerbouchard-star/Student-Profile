import { renderLiveIndicator } from "../components/player-interior.js";
import { DEFAULT_PLAYER_LIVE_STATE_EVENT } from "./player-invalidation-controller.js";

export function installLiveStatusPresenter({ mount, terminal, config, runtime = globalThis }) {
  if (!(mount instanceof HTMLElement) || config?.usePreviewData === true) return { destroy() {} };
  let destroyed = false;
  let scheduled = false;

  function render() {
    scheduled = false;
    if (destroyed) return;
    const host = mount.querySelector(".player-terminal-topbar-status");
    if (!host) return;
    const state = terminal.getState?.();
    const live = state?.live || { status: runtime.navigator?.onLine === false ? "offline" : "connected", updatedAt: 0 };
    const template = runtime.document.createElement("template");
    template.innerHTML = renderLiveIndicator(live).trim();
    const next = template.content.firstElementChild;
    if (!next) return;
    const existing = host.querySelector("[data-player-live-status]");
    if (existing) existing.replaceWith(next);
    else {
      const legacy = [...host.querySelectorAll(".player-terminal-status-pill")].find((item) => /CONNECTED/i.test(item.textContent || ""));
      if (legacy) legacy.replaceWith(next);
      else host.querySelector(".player-terminal-system-clock")?.before(next);
    }
  }

  function schedule() {
    if (destroyed || scheduled) return;
    scheduled = true;
    queueMicrotask(render);
  }

  const unsubscribe = terminal.subscribe?.(schedule) || (() => {});
  runtime.addEventListener?.(String(config?.liveStateEvent || DEFAULT_PLAYER_LIVE_STATE_EVENT), schedule);
  const timer = runtime.setInterval?.(schedule, 5000) || 0;
  schedule();

  return {
    destroy() {
      destroyed = true;
      unsubscribe();
      runtime.removeEventListener?.(String(config?.liveStateEvent || DEFAULT_PLAYER_LIVE_STATE_EVENT), schedule);
      if (timer) runtime.clearInterval?.(timer);
    },
  };
}
