(function installMarketplaceLifecycleClient(global) {
  "use strict";

  function text(value) { return String(value ?? "").trim(); }
  function adapter() {
    const current = global.AdminAdapter;
    if (!current?.request) {
      throw new Error("Marketplace lifecycle controls are unavailable until the Admin adapter is connected.");
    }
    return current;
  }
  function clientError(message, options) {
    const ErrorType = global.AdminAdapter?.ApiClientError || Error;
    return new ErrorType(message, options);
  }
  function gamePath(gameId, suffix = "") {
    const id = text(gameId);
    if (!id) throw clientError("Select a game before using Marketplace controls.", { code: "GAME_REQUIRED" });
    return `/games/${encodeURIComponent(id)}/marketplace${suffix}`;
  }
  function publicId(value, pattern, field) {
    const result = text(value).toLowerCase();
    if (!pattern.test(result)) throw clientError(`${field} is invalid.`, { code: "MARKETPLACE_PUBLIC_ID_INVALID" });
    return result;
  }
  function version(value) {
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < 1) throw clientError("Marketplace version is invalid.", { code: "MARKETPLACE_VERSION_INVALID" });
    return result;
  }
  function idempotency(value) {
    const result = text(value);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(result)) throw clientError("Marketplace idempotency key is invalid.", { code: "MARKETPLACE_IDEMPOTENCY_INVALID" });
    return result;
  }
  function bodyData(response) {
    const body = response?.body || {};
    return body.data || body;
  }
  function request(options) {
    return adapter().request({ timeoutMs: 20000, ...options }).then(bodyData);
  }
  function reviewBody({ expectedVersion, reason, idempotencyKey }) {
    const note = text(reason);
    if (!note || note.length > 1000) throw clientError("Provide a review reason of 1–1000 characters.", { code: "MARKETPLACE_REASON_INVALID" });
    return { expectedVersion: version(expectedVersion), reason: note, idempotencyKey: idempotency(idempotencyKey) };
  }

  const client = Object.freeze({
    async read(gameId, { signal } = {}) {
      return request({ method: "GET", path: gamePath(gameId), signal });
    },
    async reviewListing(gameId, input) {
      const listingId = publicId(input.listingId, /^lst_[0-9a-f]{32}$/, "listingId");
      const action = text(input.action).toLowerCase();
      if (!["hold", "approve", "reject"].includes(action)) throw clientError("Listing review action is invalid.", { code: "MARKETPLACE_ACTION_INVALID" });
      return request({ method: "POST", path: gamePath(gameId, `/listings/${encodeURIComponent(listingId)}/${action}`), body: reviewBody(input) });
    },
    async reviewDispute(gameId, input) {
      const disputeId = publicId(input.disputeId, /^dsp_[0-9a-f]{32}$/, "disputeId");
      const action = text(input.action).toLowerCase();
      if (!["refund", "resolve-seller", "reject"].includes(action)) throw clientError("Dispute review action is invalid.", { code: "MARKETPLACE_ACTION_INVALID" });
      return request({ method: "POST", path: gamePath(gameId, `/disputes/${encodeURIComponent(disputeId)}/${action}`), body: reviewBody(input) });
    },
    async updatePolicy(gameId, policy) {
      return request({ method: "PATCH", path: gamePath(gameId, "/policy"), body: policy });
    },
  });

  global.AdminMarketplaceLifecycleClient = client;
})(window);
