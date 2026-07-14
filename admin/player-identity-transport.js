(function initEconovariaPlayerIdentityTransport() {
  "use strict";

  const delegatedFetch = window.fetch.bind(window);
  const IDENTITY_ROUTE = /^https:\/\/cgiukdjwicykrmtkhudh\.supabase\.co\/functions\/v1\/classroom-api\/games\/[^/]+\/players\/[^/]+\/access-code\/reset$/;

  function headerEntries(headers) {
    return headers instanceof Headers
      ? [...headers.entries()]
      : [...new Headers(headers || {}).entries()];
  }

  function xhrResponseHeaders(xhr) {
    const headers = new Headers();
    const raw = xhr.getAllResponseHeaders() || "";
    for (const line of raw.trim().split(/[\r\n]+/)) {
      if (!line) continue;
      const separator = line.indexOf(":");
      if (separator <= 0) continue;
      headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return headers;
  }

  function directIdentityRequest(url, init = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.withCredentials = false;
      xhr.timeout = 20_000;

      for (const [name, value] of headerEntries(init.headers)) {
        if (["content-length", "cookie", "host"].includes(name.toLowerCase())) continue;
        xhr.setRequestHeader(name, value);
      }

      xhr.onload = () => {
        resolve(new Response(xhr.responseText || "", {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: xhrResponseHeaders(xhr),
        }));
      };
      xhr.onerror = () => reject(new TypeError("Player credential service could not be reached."));
      xhr.ontimeout = () => reject(new TypeError("Player credential request timed out."));
      xhr.onabort = () => reject(new DOMException("Player credential request was aborted.", "AbortError"));
      xhr.send(init.body == null ? null : init.body);
    });
  }

  window.fetch = function econovariaPlayerIdentityTransportFetch(input, init) {
    const url = input instanceof Request
      ? input.url
      : new URL(String(input), window.location.href).href;

    if (IDENTITY_ROUTE.test(url) && (!init?.method || String(init.method).toUpperCase() === "POST")) {
      return directIdentityRequest(url, init || {});
    }

    return delegatedFetch(input, init);
  };

  window.EconovariaPlayerIdentityTransport = {
    directIdentityRequest,
  };
})();
