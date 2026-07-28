"use strict";

const { proxyPlayerBff } = require("../_player-bff-proxy.js");

module.exports = async function playerSessionRoute(request, response) {
  return proxyPlayerBff(request, response, { proxyPlayer: false });
}
