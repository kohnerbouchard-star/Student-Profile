"use strict";

const { proxyAdminBff } = require("../_admin-bff-proxy.js");

module.exports = async function adminSessionRoute(request, response) {
  return proxyAdminBff(request, response, { proxyAdmin: false });
};
