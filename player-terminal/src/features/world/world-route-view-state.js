const DEFAULT_WORLD_ROUTE_VIEW = Object.freeze({
  model: null,
  quote: null,
  state: "idle",
  message: "",
  updatedAt: 0
});

// This module is the non-DOM handoff between the World interaction controller
// and the Player Terminal's single route renderer. It deliberately contains no
// subscriptions or rendering side effects.
let worldRouteView = DEFAULT_WORLD_ROUTE_VIEW;

export function getWorldRouteViewState() {
  return worldRouteView;
}

export function setWorldRouteViewState(next = {}) {
  const candidateModel = next.model === undefined ? worldRouteView.model : next.model;
  const authoritativeModel = candidateModel?.runtimeAvailable === false ? null : candidateModel;
  worldRouteView = Object.freeze({
    ...worldRouteView,
    ...next,
    model: authoritativeModel,
    quote: next.quote === undefined ? worldRouteView.quote : next.quote,
    state: String(next.state || worldRouteView.state || "idle"),
    message: String(next.message ?? worldRouteView.message ?? ""),
    updatedAt: Number(next.updatedAt ?? worldRouteView.updatedAt ?? 0)
  });
  return worldRouteView;
}

export function resetWorldRouteViewState() {
  worldRouteView = DEFAULT_WORLD_ROUTE_VIEW;
}
