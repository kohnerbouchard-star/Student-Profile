import { focusFirstInteractive } from "../../core/dom.js";

// Keep the accepted receipt node outside the terminal's replaceable shell state.
export function createMarketReceiptLifecycle({ mount, terminal, onRetire }) {
  let receipt = null;
  let focused = null;
  let route = null;
  let generation = 0;
  let destroyed = false;
  function clear() {
    generation++;
    receipt?.remove();
    receipt = null;
    focused = null;
    route = null;
  }
  function rememberFocus(event) {
    if (receipt?.contains(event.target)) focused = event.target;
  }
  const unsubscribe = terminal.subscribe?.((state) => {
    if (destroyed || route === null) return;
    if (state.status !== "ready" || state.route !== route) {
      clear();
      onRetire();
      return;
    }
    if (!receipt || receipt.isConnected) return;
    mount.append(receipt);
    const root = mount.querySelector(".player-terminal-app-root");
    if (root) {
      root.inert = true;
      root.setAttribute("aria-hidden", "true");
    }
    if (focused?.isConnected) focused.focus({ preventScroll: true });
    else focusFirstInteractive(receipt);
  });
  mount.addEventListener("focusin", rememberFocus);
  return {
    clear,
    retain(node) {
      receipt = node;
      route = terminal.getState().route;
    },
    begin() {
      route = terminal.getState().route;
      const started = generation;
      const startedRoute = route;
      const ticket = terminal.freshness?.capture();
      return () => !destroyed && started === generation && terminal.getState().route === startedRoute &&
        (!terminal.getState().status || terminal.getState().status === "ready") &&
        (!ticket || terminal.freshness.isCurrent(ticket));
    },
    destroy() {
      destroyed = true;
      unsubscribe?.();
      mount.removeEventListener("focusin", rememberFocus);
      clear();
    },
  };
}
