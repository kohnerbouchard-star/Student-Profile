import assert from "node:assert/strict";

const V2_EXTERNAL_MODULES = new Set([
  "/admin/inventory-redemption-queue-client.js", // app.js import
  "/player-terminal/assets/store-item-media.mjs", // StoreRoute.js import
]);

/** Only script loads belonging to the document an asserted session redirect left. */
export function isDepartingAdminModuleAbort(failure, { sourceUrl, destinationUrl, expectedReasons } = {}) {
  try {
    const source = new URL(sourceUrl);
    const destination = new URL(destinationUrl);
    const resource = new URL(failure.url);
    const document = new URL(failure.documentUrl);
    source.hash = ""; document.hash = "";
    // The existing session boundary may clear only the selected-game query.
    const clearedGameSource = new URL(source);
    clearedGameSource.searchParams.delete("game");
    return source.pathname === "/admin/v2.html"
      && (document.href === source.href || document.href === clearedGameSource.href)
      && destination.origin === source.origin && destination.pathname === "/"
      && destination.searchParams.get("mode") === "admin"
      && Array.isArray(expectedReasons) && expectedReasons.includes(destination.searchParams.get("reason"))
      && failure.mainFrame === true && failure.navigation === false
      && failure.method === "GET" && failure.resourceType === "script"
      && failure.errorText === "net::ERR_ABORTED"
      && resource.origin === source.origin && !resource.search && !resource.hash
      && (/^\/admin\/v2\/src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.js$/.test(resource.pathname)
        || V2_EXTERNAL_MODULES.has(resource.pathname));
  } catch { return false; }
}

/** A cancelled load is not evidence an asset works: require an independent HTTP/MIME check. */
export async function verifyDepartingAdminModuleAborts(failures, redirect, request) {
  const verified = new Set();
  for (let index = 0; index < failures.length; index += 1) {
    const failure = failures[index];
    if (!isDepartingAdminModuleAbort(failure, redirect)) continue;
    const response = await request.get(failure.url, { maxRedirects: 0, timeout: 10_000 });
    try {
      assert.equal(response.status(), 200, `Cancelled Admin module is unavailable: ${failure.url}`);
      const mime = (response.headers()["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
      assert.ok(["application/javascript", "text/javascript"].includes(mime),
        `Cancelled Admin module has invalid JavaScript MIME: ${failure.url}`);
      assert.ok((await response.body()).length > 0, `Cancelled Admin module is empty: ${failure.url}`);
      verified.add(index);
    } finally { await response.dispose(); }
  }
  return verified;
}
