(function installEconovariaEconomicWriteContract() {
  "use strict";

  const delegatedFetch = window.fetch.bind(window);
  const cryptoRuntime = window.crypto || globalThis.crypto;
  let sequence = 0;

  function text(value) {
    return String(value ?? "").trim();
  }

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function first(source, keys) {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
        return source[key];
      }
    }
    return undefined;
  }

  function requestId() {
    if (typeof cryptoRuntime?.randomUUID === "function") {
      return cryptoRuntime.randomUUID();
    }
    sequence += 1;
    return `economic-write-${Date.now()}-${sequence}`;
  }

  function isLedgerAdjustment(url, method) {
    return method === "POST" &&
      /\/games\/[^/]+\/players\/[^/]+\/ledger-adjustments$/.test(url.pathname);
  }

  async function readBody(request) {
    const contentType = text(request.headers.get("content-type")).toLowerCase();
    try {
      if (contentType.includes("application/json")) {
        return record(await request.clone().json());
      }
      if (contentType.includes("application/x-www-form-urlencoded")) {
        return Object.fromEntries(new URLSearchParams(await request.clone().text()));
      }
      if (contentType.includes("multipart/form-data")) {
        const entries = {};
        for (const [key, value] of (await request.clone().formData()).entries()) {
          if (typeof value === "string") entries[key] = value;
        }
        return entries;
      }
    } catch (_) {
      return {};
    }
    return {};
  }

  function normalizeLedgerBody(source, request) {
    const normalized = { ...source };
    const amount = first(source, [
      "amount",
      "value",
      "delta",
      "adjustmentAmount",
      "ledgerAmount",
      "balanceAdjustment",
    ]);
    if (amount !== undefined) normalized.amount = amount;

    const adjustmentType = first(source, [
      "adjustmentType",
      "entryType",
      "direction",
      "transactionType",
    ]);
    if (adjustmentType !== undefined) normalized.adjustmentType = adjustmentType;

    const reason = first(source, ["reason", "note", "ledgerNote", "memo"]);
    if (reason !== undefined) normalized.reason = reason;

    normalized.accountType = text(first(source, ["accountType", "account"])) || "cash";
    normalized.currencyCode = (
      text(first(source, ["currencyCode", "currency"])) || "ECO"
    ).toUpperCase();
    normalized.idempotencyKey = text(
      source.idempotencyKey ||
      request.headers.get("x-idempotency-key") ||
      request.headers.get("x-request-id"),
    ) || requestId();
    return normalized;
  }

  window.fetch = async function econovariaEconomicWriteFetch(input, init) {
    const initial = input instanceof Request
      ? new Request(input, init)
      : new Request(new URL(String(input), window.location.href), init);
    const url = new URL(initial.url, window.location.href);

    if (!isLedgerAdjustment(url, initial.method.toUpperCase())) {
      return delegatedFetch(initial);
    }

    const body = normalizeLedgerBody(await readBody(initial), initial);
    const headers = new Headers(initial.headers);
    headers.set("Content-Type", "application/json");
    headers.set("X-Idempotency-Key", body.idempotencyKey);
    headers.delete("Content-Length");

    return delegatedFetch(new Request(initial, {
      headers,
      body: JSON.stringify(body),
    }));
  };

  window.EconovariaEconomicWriteContract = Object.freeze({
    normalizeLedgerBody,
  });
})();
