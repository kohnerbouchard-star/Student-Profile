export function isAffectedMutation(method: string, suffix: string): boolean {
  if (
    method === "POST" && [
      "/players",
      "/attendance/scans",
      "/attendance/scan",
      "/attendance/corrections",
      "/store/items",
      "/contracts",
      "/join-code/reset",
    ].includes(suffix)
  ) return true;
  if (/^\/contracts\/[^/]+\/publish$/.test(suffix)) {
    return method === "POST";
  }
  if (/^\/contracts\/[^/]+$/.test(suffix)) {
    return method === "PATCH";
  }
  if (/^\/contracts\/[^/]+\/(?:archive|duplicate)$/.test(suffix)) {
    return method === "POST";
  }
  if (/^\/players\/[^/]+\/archive$/.test(suffix)) {
    return method === "POST";
  }
  if (/^\/players\/[^/]+$/.test(suffix)) {
    return method === "DELETE";
  }
  if (/^\/store\/items\/[^/]+\/(?:restock|rebalance-price)$/.test(suffix)) {
    return method === "POST";
  }
  if (/^\/store\/items\/[^/]+\/status$/.test(suffix)) {
    return ["POST", "PATCH", "PUT"].includes(method);
  }
  if (/^\/store\/items\/[^/]+$/.test(suffix)) {
    return ["PATCH", "PUT", "DELETE"].includes(method);
  }
  return isSettingsMutation(method, suffix);
}

export function isSettingsMutation(method: string, suffix: string): boolean {
  if (!["POST", "PUT", "PATCH"].includes(method)) return false;
  return suffix === "/settings" || /^\/settings\/[^/]+$/.test(suffix) ||
    (method === "POST" && /^\/settings\/[^/]+\/reset$/.test(suffix));
}
