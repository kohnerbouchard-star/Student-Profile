"use strict";

const { proxyPlayerBff } = require("./_player-bff-proxy.js");

module.exports = function playerNamespaceProxy(request, response) {
  const path = request.query?.path;
  if (typeof path !== "string" || !path.trim()) {
    response.statusCode = 400;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return response.end(JSON.stringify({
      ok: false,
      error: {
        code: "invalid_proxy_path",
        message: "Player proxy path is invalid.",
        retryable: false,
      },
    }));
  }

  const normalizedRequest = Object.create(request);
  normalizedRequest.query = {
    ...(request.query && typeof request.query === "object" ? request.query : {}),
    path,
  };
  return proxyPlayerBff(normalizedRequest, response, { proxyPlayer: true });
};
