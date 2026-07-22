(function installCraftingOversightClient(global) {
  "use strict";
  const JOB = /^cft_[0-9a-f]{32}$/;
  const ITEM = /^[a-z0-9][a-z0-9_-]{0,63}$/;
  const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
  const text = (value) => String(value ?? "").trim();
  const adapter = () => {
    if (!global.AdminAdapter?.request) throw new Error("Crafting oversight requires the Admin request adapter.");
    return global.AdminAdapter;
  };
  const path = (gameId, suffix = "") => {
    const id = text(gameId);
    if (!id) throw new Error("Select a game before opening Crafting oversight.");
    return `/games/${encodeURIComponent(id)}/crafting${suffix}`;
  };
  const request = (options) => adapter().request({ timeoutMs: 20000, ...options }).then((response) => response?.body?.data ?? response?.body ?? response);
  global.AdminCraftingOversightClient = Object.freeze({
    read(gameId, { status = "", limit = 100, signal } = {}) {
      const query = new URLSearchParams();
      if (status) query.set("status", text(status));
      query.set("limit", String(limit));
      return request({ method: "GET", path: `${path(gameId, "/oversight")}?${query}`, signal });
    },
    recover(gameId, input) {
      const jobKey = text(input.jobKey).toLowerCase();
      if (!JOB.test(jobKey) || !SAFE_KEY.test(text(input.idempotencyKey))) throw new Error("Crafting recovery input is invalid.");
      return request({ method: "POST", path: path(gameId, `/jobs/${encodeURIComponent(jobKey)}/recover`), body: {
        outcome: text(input.outcome), reason: text(input.reason), idempotencyKey: text(input.idempotencyKey),
      } });
    },
    applySupply(gameId, input) {
      const itemKey = text(input.itemKey).toLowerCase();
      if (!ITEM.test(itemKey) || !SAFE_KEY.test(text(input.idempotencyKey))) throw new Error("Crafting supply input is invalid.");
      return request({ method: "POST", path: path(gameId, `/supply/${encodeURIComponent(itemKey)}`), body: {
        countryCode: input.countryCode || null,
        scarcityBand: text(input.scarcityBand),
        availableQuantity: input.availableQuantity === "" ? null : Number(input.availableQuantity),
        eventMultiplier: Number(input.eventMultiplier || 1),
        routeMultiplier: Number(input.routeMultiplier || 1),
        sourceEventKey: input.sourceEventKey || null,
        expiresAt: input.expiresAt || null,
        idempotencyKey: text(input.idempotencyKey),
      } });
    },
  });
})(window);
