"use strict";

const { proxyPlayerBff } = require("../_player-bff-proxy.js");

module.exports = async function playerRoute(request, response) {
  return proxyPlayerBff(request, response, { proxyPlayer: true });
}
