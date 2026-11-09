import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isDepartingAdminModuleAbort, verifyDepartingAdminModuleAborts } from "./admin-session-redirect-diagnostics.mjs";
const sourceUrl = "http://127.0.0.1:4283/admin/v2.html?game=fixture#overview";
const redirect = { sourceUrl, destinationUrl: "http://127.0.0.1:4283/?mode=admin&reason=session-required", expectedReasons: ["session-required"] };
const failure = { method: "GET", url: "http://127.0.0.1:4283/admin/v2/src/app.js", documentUrl: sourceUrl, mainFrame: true, navigation: false, resourceType: "script", errorText: "net::ERR_ABORTED" };

test("only departing-document V2 module aborts after the verified session redirect are candidates", () => {
  assert.equal(isDepartingAdminModuleAbort(failure, redirect), true);
  assert.equal(isDepartingAdminModuleAbort({ ...failure, documentUrl: sourceUrl.replace("?game=fixture", "") }, redirect), true);
  for (const path of ["/admin/inventory-redemption-queue-client.js", "/player-terminal/assets/store-item-media.mjs"]) assert.equal(isDepartingAdminModuleAbort({ ...failure, url: `http://127.0.0.1:4283${path}` }, redirect), true);
  for (const patch of [{ method: "POST" }, { resourceType: "fetch" }, { resourceType: "stylesheet" }, { navigation: true }, { mainFrame: false }, { errorText: "net::ERR_CONNECTION_RESET" }, { documentUrl: "http://127.0.0.1:4283/" }, { documentUrl: sourceUrl.replace("fixture", "other") }, { url: "http://other.test/admin/v2/src/app.js" }, { url: "http://127.0.0.1:4283/api/admin/games" }, { url: "http://127.0.0.1:4283/admin/auth-session-manager.js" }, { url: failure.url + "?secret=example" }, { url: "http://127.0.0.1:4283/admin/v2/src/../app.js" }]) assert.equal(isDepartingAdminModuleAbort({ ...failure, ...patch }, redirect), false, JSON.stringify(patch));
  for (const patch of [{ destinationUrl: sourceUrl }, { destinationUrl: "https://other.test/?mode=admin&reason=session-required" }, { expectedReasons: ["session-expired"] }, { expectedReasons: [] }, { sourceUrl: "invalid" }]) assert.equal(isDepartingAdminModuleAbort(failure, { ...redirect, ...patch }), false, JSON.stringify(patch));
});

test("cancelled modules must independently succeed without redirect and with nonempty JavaScript", async () => {
  let disposed = 0; let calls = 0;
  const request = (status = 200, mime = "application/javascript", body = "export {};") => ({ get: async (url, options) => {
    ++calls; assert.equal(url, failure.url); assert.equal(options.maxRedirects, 0); assert.equal(options.timeout, 10_000);
    return { status: () => status, headers: () => ({ "content-type": mime }), body: async () => Buffer.from(body), dispose: async () => { ++disposed; } };
  } });
  assert.deepEqual(await verifyDepartingAdminModuleAborts([failure, { ...failure, resourceType: "fetch" }], redirect, request()), new Set([0]));
  for (const args of [[404], [500], [302], [200, "text/html"], [200, "application/javascript-invalid"], [200, "text/javascript+json"], [200, "application/javascript", ""]]) await assert.rejects(verifyDepartingAdminModuleAborts([failure], redirect, request(...args)));
  assert.deepEqual(await verifyDepartingAdminModuleAborts([failure], redirect, request(200, " Text/JavaScript ; charset=utf-8")), new Set([0]));
  assert.equal(disposed, 9); assert.equal(calls, 9);
  await assert.rejects(verifyDepartingAdminModuleAborts([failure], redirect, { get: async () => { throw new Error("connection reset"); } }), /connection reset/);
});


test("external module allowances remain backed by concrete V2 imports, not broad Admin paths", () => {
  assert.match(readFileSync("admin/v2/src/app.js", "utf8"), /from "\.\.\/\.\.\/inventory-redemption-queue-client\.js"/);
  assert.match(readFileSync("admin/v2/src/routes/store/StoreRoute.js", "utf8"), /from "\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/player-terminal\/assets\/store-item-media\.mjs"/);
});

test("keyboard smoke waits for installed controller and retains modality, pointer and no-early-write assertions", () => {
  const source = readFileSync("scripts/admin-keyboard-workflows-smoke.mjs", "utf8");
  const open = source.slice(source.indexOf("async function openAction"), source.indexOf("async function replace"));
  const readiness = open.indexOf("await page.waitForFunction(() => typeof window.EconovariaAdminKeyboardNavigation?.enabled");
  assert.ok(readiness >= 0 && readiness < open.indexOf('await page.keyboard.press("Enter")'));
  assert.match(open, /did not preserve keyboard modality/);
  assert.match(source, /pointerEvents.length === 0/);
  assert.match(source, /writes.length === writesBeforeEditing/);
  const select = source.slice(source.indexOf("async function selectValue"), source.indexOf("async function activate"));
  assert.match(select, /page.keyboard.press\("Tab"\)/);
  assert.match(select, /process.platform === "darwin"/);
  assert.match(select, /page.keyboard.type\(label\)/);
  assert.doesNotMatch(select, /selectOption|dispatchEvent|\.value\s*=(?!=)/);
  assert.match(select, /locator.inputValue\(\) === value/);
});
