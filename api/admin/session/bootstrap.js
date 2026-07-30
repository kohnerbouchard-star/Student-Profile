"use strict";

const { proxyAdminBff } = require("../../_admin-bff-proxy.js");

module.exports = async function adminSessionBootstrapRoute(request, response) {
  const normalizedRequest = Object.create(request);
  normalizedRequest.query = {
    ...(request.query && typeof request.query === "object" ? request.query : {}),
    path: ["session", "bootstrap"]
  };
  return proxyAdminBff(normalizedRequest, response, { proxyAdmin: true });
};
