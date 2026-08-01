"use strict";

const { proxyPlayerBff } = require("../_player-bff-proxy.js");
const { canonicalCatchAllPath } = require("../_canonical-bff-path.js");

module.exports = function playerSessionRoute(request, response) {
  const normalizedRequest = Object.create(request);
  normalizedRequest.query = {
    path: canonicalCatchAllPath(request.url, "/api/player-session")
  };
  return proxyPlayerBff(normalizedRequest, response, { proxyPlayer: false });
};
