import { LoansRoute } from "./LoansRoute.js";

const NOT_CONFIGURED_STATE = Object.freeze({
  status: "not-configured",
  hasResolved: true,
  requestVersion: 1,
  data: Object.freeze({ implementationStatus: "not_configured" }),
});

export function createLoansController({ onChange = () => {} } = {}) {
  let destroyed = false;
  let currentView = null;

  async function load() {
    if (!destroyed) onChange(NOT_CONFIGURED_STATE);
    return NOT_CONFIGURED_STATE;
  }

  function render() {
    if (destroyed) throw new Error("Loans controller has been destroyed.");
    currentView?.destroy?.();
    currentView = LoansRoute();
    return currentView;
  }

  return Object.freeze({
    getState: () => NOT_CONFIGURED_STATE,
    load,
    render,
    deactivate() {
      currentView?.destroy?.();
      currentView = null;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      currentView?.destroy?.();
      currentView = null;
    },
  });
}
