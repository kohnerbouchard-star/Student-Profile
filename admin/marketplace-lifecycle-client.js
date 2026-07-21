(function installMarketplaceLifecycleClient(global) {
  "use strict";

  const AdminAdapter = global.AdminAdapter;
  const ApiClientError = AdminAdapter?.ApiClientError || Error;
  if (!AdminAdapter?.request) throw new Error("Marketplace lifecycle client requires AdminAdapter.request.");

  function text(value) { return String(value ?? "").trim(); }
  function gamePath(gameId, suffix = "") {
    const id = text(gameId);
    if (!id) throw new ApiClientError("Select a game before using Marketplace controls.", { code: "GAME_REQUIRED" });
    return `/games/${encodeURIComponent(id)}/marketplace${suffix}`;
  }
  function publicId(value, pattern, field) {
    const result = text(value).toLowerCase();
    if (!pattern.test(result)) throw new ApiClientError(`${field} is invalid.`, { code: "MARKETPLACE_PUBLIC_ID_INVALID" });
    return result;
  }
  function version(value) {
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < 1) throw new ApiClientError("Marketplace version is invalid.", { code: "MARKETPLACE_VERSION_INVALID" });
    return result;
  }
  function idempotency(value) {
    const result = text(value);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(result)) throw new ApiClientError("Marketplace idempotency key is invalid.", { code: "MARKETPLACE_IDEMPOTENCY_INVALID" });
    return result;
  }
  function bodyData(response) {
    const body = response?.body || {};
    return body.data || body;
  }
  function request(options) {
    return AdminAdapter.request({ timeoutMs: 20000, ...options }).then(bodyData);
  }
  function reviewBody({ expectedVersion, reason, idempotencyKey }) {
    const note = text(reason);
    if (!note || note.length > 1000) throw new ApiClientError("Provide a review reason of 1–1000 characters.", { code: "MARKETPLACE_REASON_INVALID" });
    return { expectedVersion: version(expectedVersion), reason: note, idempotencyKey: idempotency(idempotencyKey) };
  }

  const client = Object.freeze({
    async read(gameId, { signal } = {}) {
      return request({ method: "GET", path: gamePath(gameId), signal });
    },
    async reviewListing(gameId, input) {
      const listingId = publicId(input.listingId, /^lst_[0-9a-f]{32}$/, "listingId");
      const action = text(input.action).toLowerCase();
      if (!["hold", "approve", "reject"].includes(action)) throw new ApiClientError("Listing review action is invalid.", { code: "MARKETPLACE_ACTION_INVALID" });
      return request({ method: "POST", path: gamePath(gameId, `/listings/${encodeURIComponent(listingId)}/${action}`), body: reviewBody(input) });
    },
    async reviewDispute(gameId, input) {
      const disputeId = publicId(input.disputeId, /^dsp_[0-9a-f]{32}$/, "disputeId");
      const action = text(input.action).toLowerCase();
      if (!["refund", "resolve-seller", "reject"].includes(action)) throw new ApiClientError("Dispute review action is invalid.", { code: "MARKETPLACE_ACTION_INVALID" });
      return request({ method: "POST", path: gamePath(gameId, `/disputes/${encodeURIComponent(disputeId)}/${action}`), body: reviewBody(input) });
    },
    async updatePolicy(gameId, policy) {
      return request({ method: "PATCH", path: gamePath(gameId, "/policy"), body: policy });
    },
  });

  global.AdminMarketplaceLifecycleClient = client;
})(window);
