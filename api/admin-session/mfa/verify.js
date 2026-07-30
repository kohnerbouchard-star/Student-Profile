"use strict";

const { proxyAdminBff } = require("../../_admin-bff-proxy.js");

module.exports = async function adminMfaVerifyRoute(request, response) {
  const normalizedRequest = Object.create(request);
  normalizedRequest.query = {
    ...(request.query && typeof request.query === "object" ? request.query : {}),
    path: ["mfa", "verify"]
  };
  return proxyAdminBff(normalizedRequest, response, { proxyAdmin: false });
};
