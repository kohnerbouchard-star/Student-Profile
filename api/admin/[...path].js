"use strict";

const { proxyAdminBff } = require("../_admin-bff-proxy.js");
const { canonicalCatchAllPath } = require("../_canonical-bff-path.js");

module.exports = async function adminApiRoute(request, response) {
  const normalizedRequest = Object.create(request);
  normalizedRequest.query = {
    ...(request.query && typeof request.query === "object" ? request.query : {}),
    path: canonicalCatchAllPath(request.url, "/api/admin")
  };
  return proxyAdminBff(normalizedRequest, response, { proxyAdmin: true });
};
