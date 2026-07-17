export const ROUTES = Object.freeze(["dashboard", "news", "market", "portfolio", "business", "contracts", "store", "marketplace", "inventory", "crafting", "banking", "loans", "messages", "progression", "profile"]);

export function readRoute() {
  const route = (location.hash || "#dashboard").slice(1).split("?")[0].toLowerCase();
  return ROUTES.includes(route) ? route : "dashboard";
}

export function navigate(route) {
  const safeRoute = ROUTES.includes(route) ? route : "dashboard";
  if (location.hash === `#${safeRoute}`) {
    globalThis.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = safeRoute;
  }
}
