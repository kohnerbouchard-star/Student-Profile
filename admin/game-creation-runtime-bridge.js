const CREATE_ACTION = "create-multiplayer-game";
const CREATE_PATH_SUFFIXES = Object.freeze([
  "/api/admin/games",
  "/functions/v1/admin-api/games",
]);
const delegatedFetch = window.fetch.bind(window);

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function requestUrl(input) {
  try {
    return new URL(
      input instanceof Request ? input.url : String(input),
      window.location.href,
    );
  } catch {
    return null;
  }
}

function headerValue(headers, name) {
  try {
    return new Headers(headers || {}).get(name) || "";
  } catch {
    return "";
  }
}

function isGameCreationRequest(input, init = {}) {
  const url = requestUrl(input);
  if (!url) return false;
  const method = text(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "POST") return false;
  if (!CREATE_PATH_SUFFIXES.some((suffix) => url.pathname.endsWith(suffix))) return false;
  const headers = init.headers || (input instanceof Request ? input.headers : undefined);
  return /^game\.create\.[0-9a-f-]{36}$/i.test(headerValue(headers, "x-idempotency-key"));
}

function responseHeaders(xhr) {
  const headers = new Headers();
  for (const line of String(xhr.getAllResponseHeaders() || "").split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return headers;
}

function sendGameCreationRequest(input, init = {}) {
  const url = requestUrl(input);
  if (!url) return Promise.reject(new TypeError("Invalid game creation URL."));
  const method = text(init.method || (input instanceof Request ? input.method : "POST")).toUpperCase();
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  const body = init.body;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url.href, true);
    xhr.timeout = 20_000;
    xhr.withCredentials = init.credentials === "include" ||
      (init.credentials === "same-origin" && url.origin === window.location.origin);
    headers.forEach((value, name) => xhr.setRequestHeader(name, value));

    const abort = () => xhr.abort();
    if (init.signal) {
      if (init.signal.aborted) {
        reject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      init.signal.addEventListener("abort", abort, { once: true });
    }

    const cleanup = () => init.signal?.removeEventListener?.("abort", abort);
    xhr.onload = () => {
      cleanup();
      resolve(new Response(xhr.responseText || "", {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: responseHeaders(xhr),
      }));
    };
    xhr.onerror = () => {
      cleanup();
      reject(new TypeError("Administrator game provisioning request failed."));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new DOMException("Administrator game provisioning request timed out.", "TimeoutError"));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    xhr.send(body == null ? null : body);
  });
}

function createButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "econovaria-admin-create-game-button";
  button.dataset.econovariaCreateGame = "true";
  button.dataset.adminTerminalAction = CREATE_ACTION;
  button.textContent = "New game";
  button.setAttribute("aria-label", "Create and provision a new multiplayer game");
  return button;
}

function mountButtonSynchronously() {
  window.EconovariaAdminGameSessionControls?.reconcile?.();
  const card = document.querySelector("[data-econovaria-game-session-card]");
  if (!(card instanceof HTMLElement)) return false;
  if (card.querySelector("[data-econovaria-create-game]")) return true;
  const logout = card.querySelector("[data-econovaria-admin-logout]");
  card.insertBefore(createButton(), logout || null);
  return true;
}

window.fetch = function econovariaGameCreationFetch(input, init) {
  if (isGameCreationRequest(input, init)) {
    return sendGameCreationRequest(input, init);
  }
  return delegatedFetch(input, init);
};

mountButtonSynchronously();
window.addEventListener("econovaria:admin-session-refreshed", mountButtonSynchronously);
window.addEventListener("econovaria:admin-game-created", mountButtonSynchronously);

window.EconovariaAdminGameCreationRuntimeBridge = Object.freeze({
  isGameCreationRequest,
  mountButtonSynchronously,
  sendGameCreationRequest,
});
