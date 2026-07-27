const DEFAULT_WORLD_ROUTE_VIEW = Object.freeze({
  model: null,
  quote: null,
  state: "idle",
  message: "",
  updatedAt: 0
});

let worldRouteView = DEFAULT_WORLD_ROUTE_VIEW;

export function getWorldRouteViewState() {
  return worldRouteView;
}

export function setWorldRouteViewState(next = {}) {
  worldRouteView = Object.freeze({
    ...worldRouteView,
    ...next,
    model: next.model === undefined ? worldRouteView.model : next.model,
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
