"use strict";

const {
  checkRuntimeHealth,
  proxyAdminBff,
  readHealthConfiguration,
  runtimeHealthRoute,
} = require("./_admin-bff-proxy.js");

const HEALTH_PATH = "__health";

async function adminNamespaceProxy(request, response) {
  const path = request.query?.path;
  if (path === HEALTH_PATH) {
    return runtimeHealthRoute(request, response);
  }
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
        message: "Administrator proxy path is invalid.",
        retryable: false,
      },
    }));
  }

  const normalizedRequest = Object.create(request);
  normalizedRequest.query = {
    ...(request.query && typeof request.query === "object" ? request.query : {}),
    path,
  };
  return proxyAdminBff(normalizedRequest, response, { proxyAdmin: true });
}

module.exports = adminNamespaceProxy;
module.exports.__healthTest = Object.freeze({
  checkRuntimeHealth,
  readHealthConfiguration,
});
