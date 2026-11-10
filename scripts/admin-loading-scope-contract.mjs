import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const compatibility = await readFile(new URL("../admin/overview-quick-actions.js", import.meta.url), "utf8");
const bootstrap = await readFile(new URL("../admin/admin-bootstrap.js", import.meta.url), "utf8");
const interactionQuality = await readFile(new URL("../admin/interaction-quality.js", import.meta.url), "utf8");
const interactionQualityCss = await readFile(new URL("../admin/css/interaction-quality.css", import.meta.url), "utf8");
const responsiveGrid = await readFile(new URL("../admin/css/responsive-card-grid.css", import.meta.url), "utf8");
const sessionSkeleton = await readFile(new URL("../admin/css/session-skeleton.css", import.meta.url), "utf8");
const loadingScannerSmoke = await readFile(new URL("./admin-loading-scanner-smoke.mjs", import.meta.url), "utf8");
const index = await readFile(new URL("../admin/index.html", import.meta.url), "utf8");

assert.match(compatibility, /compatibility-noop/, "The former Quick Actions controller must remain an inert compatibility shim.");
assert.match(compatibility, /MAX_BOOT_FRAMES\s*=\s*0/, "The compatibility shim must not schedule mount retries.");
assert.doesNotMatch(
  compatibility,
  /document\.|querySelector|insertAdjacentElement|\.append\(|\.prepend\(|\.remove\(|setAttribute\(|removeAttribute\(/,
  "Loader-only work must not query, move, hide, create, or remove interface elements."
);

assert.match(index, /\.\/css\/session-skeleton\.css/, "The single Admin startup loader must use its dedicated stylesheet.");
assert.match(index, /\.\/css\/responsive-card-grid\.css/, "The startup skeleton and live cards must load shared grid geometry.");
assert.equal(
  (index.match(/class="admin-session-skeleton__metric"/g) || []).length,
  5,
  "The fixed startup skeleton must mirror the five-card Overview grid without runtime measurement."
);
assert.doesNotMatch(index, /shape-accurate-skeletons\.js/, "The duplicate shape-skeleton runtime must not be loaded.");
assert.doesNotMatch(index, /shape-accurate-skeletons\.css/, "The removed shape-skeleton stylesheet must not be loaded.");
assert.doesNotMatch(index, /loading-scope-overrides\.css/, "The removed shape-loader scope overrides must not be loaded.");
assert.doesNotMatch(
  bootstrap,
  /shape-accurate-skeleton-lifecycle\.js/,
  "The removed shape-skeleton lifecycle must not be dynamically loaded."
);

assert.doesNotMatch(interactionQuality, /initialPageLoad/, "The page loader must not have an automatic initial-load mode.");
assert.match(
  interactionQuality,
  /detail\.pageRead\s*&&\s*navigationLoad/,
  "Page skeleton requests must be limited to explicit in-console navigation."
);
assert.doesNotMatch(
  interactionQuality,
  /reconcile\([^)]*\)[\s\S]*showPageSkeleton\(\)[\s\S]*900/,
  "Mount reconciliation must not create a second startup skeleton."
);
assert.doesNotMatch(
  interactionQualityCss,
  /\.admin-session-skeleton(?:\b|__)/,
  "Route-loading styles must not override the authoritative session skeleton."
);

assert.match(sessionSkeleton, /single startup loader/i, "The retained loader stylesheet must declare its single-loader ownership.");
assert.match(
  responsiveGrid,
  /\.admin-session-skeleton__metrics,\s*\n\.admin-terminal-action-grid/,
  "The skeleton metrics and live overview cards must share one selector contract."
);
assert.match(responsiveGrid, /repeat\([\s\S]*auto-fit[\s\S]*220px[\s\S]*1fr/, "The shared grid must derive columns from available width.");
assert.doesNotMatch(
  loadingScannerSmoke,
  /getBoundingClientRect|gridTemplateColumns|gridColumnCount|expectedColumns/,
  "Browser loading tests must not sample or compare skeleton and live-card geometry."
);
assert.match(
  loadingScannerSmoke,
  /responsive-card-grid\.css/,
  "Browser loading tests must verify that the repository-owned shared stylesheet is loaded."
);

console.log("Admin single-loader and CSS-owned responsive card-grid contract passed.");

// Deterministic coverage for the browser harness's navigation boundary. No
// browser is launched, and rejected network/body reads must remain failures.
const { observeStartupOverviewReads } = await import("./admin-quality-smoke-fixture.mjs");
const gameId = "fixture-game";
const prefix = "/functions/v1/web-session-api/proxy";
const paths = [
  `${prefix}/games/${gameId}/join-code/reset`,
  `${prefix}/games/${gameId}/dashboard`,
  `${prefix}/games`,
  `${prefix}/notifications`,
  `${prefix}/games/${gameId}/store/items`,
];
const responseFor = (path, { method = "GET", status = 200, finished = async () => null } = {}) => ({
  request: () => ({ method: () => method }),
  url: () => `https://fixture.example.test${path}`,
  status: () => status,
  finished,
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// The list is the actual non-demo Overview startup, not only the last endpoint
// that happened to abort in CI. Fail if retained application startup drifts.
const terminal = await readFile(new URL("../admin/dist/admin-overview-terminal.js", import.meta.url), "utf8");
assert.match(terminal, /Overview: \["Overview", "Games", "AdminNotifications", "Store"\]/);
for (const [name, path] of [
  ["Overview", "/games/:gameId/dashboard"],
  ["Games", "/games"],
  ["AdminNotifications", "/notifications?scope=admin-console"],
  ["Store", "/games/:gameId/store/items?include=stock,prices,purchaseStats"],
]) assert.ok(terminal.includes(`${name}: { method: "GET", path: "${path}"`), `${name} startup path drifted.`);

// Every endpoint is independently held last, including dashboard after the
// join-code body. Each observer must exist before any response is delivered.
for (const lastPath of paths) {
  const headers = new Map(paths.map((path) => [path, deferred()]));
  const body = deferred();
  const registered = [];
  const finishReads = observeStartupOverviewReads({
    waitForResponse(predicate, options) {
      assert.equal(options.timeout, 15000);
      const matches = paths.filter((path) => predicate(responseFor(path)));
      assert.equal(matches.length, 1, "Each observer must bind one distinct startup read.");
      const [path] = matches;
      assert.equal(predicate(responseFor(`${path}?fixture=1`)), true);
      for (const candidate of [
        responseFor(path, { method: "POST" }),
        responseFor(path, { method: "HEAD" }),
        responseFor(`${path}/extra`),
        responseFor(`${prefix}/games/other-game/join-code/reset`),
        responseFor(`${prefix}/games/other-game/store/items`),
        responseFor(`${prefix}/games/other-game/dashboard`),
        responseFor(`${prefix}/games/${gameId}/settings`),
      ]) assert.equal(predicate(candidate), false);
      registered.push(path);
      return headers.get(path).promise;
    },
  }, gameId);
  assert.deepEqual(registered, paths, "All reads must be observed before navigation starts.");
  let settled = false;
  const completion = finishReads().then(() => { settled = true; });
  for (const path of paths.filter((path) => path !== lastPath)) headers.get(path).resolve(responseFor(path));
  await new Promise(setImmediate);
  assert.equal(settled, false, `Missing ${lastPath} must prevent completion.`);
  headers.get(lastPath).resolve(responseFor(lastPath, { finished: () => body.promise }));
  await new Promise(setImmediate);
  assert.equal(settled, false, `${lastPath} headers must not substitute for the completed body.`);
  body.resolve(null);
  await completion;
}

for (const failedPath of paths) {
  for (const [name, response, message] of [
    ["HTTP failure", () => Promise.resolve(responseFor(failedPath, { status: 500 })), /returned 500/],
    ["redirect", () => Promise.resolve(responseFor(failedPath, { status: 302 })), /returned 302/],
    ["body failure", () => Promise.resolve(responseFor(failedPath, { finished: async () => new Error("body aborted") })), /body aborted/],
    ["response failure", () => Promise.reject(new Error("request aborted")), /request aborted/],
  ]) {
    const requireReads = observeStartupOverviewReads({
      waitForResponse(predicate) {
        const path = paths.find((path) => predicate(responseFor(path)));
        assert.ok(path);
        return path === failedPath ? response() : Promise.resolve(responseFor(path));
      },
    }, gameId);
    // Exercise early rejection before the UI snapshot's later assertion.
    await new Promise(setImmediate);
    await assert.rejects(requireReads(), message, `${failedPath}: ${name}`);
  }
  for (const response of [
    () => new Promise(() => {}),
    () => Promise.resolve(responseFor(failedPath, { finished: () => new Promise(() => {}) })),
  ]) {
    const requireReads = observeStartupOverviewReads({
      waitForResponse(predicate, options) {
        assert.equal(options.timeout, 10, "Every response shares the single deadline.");
        const path = paths.find((path) => predicate(responseFor(path)));
        assert.ok(path);
        return path === failedPath ? response() : Promise.resolve(responseFor(path));
      },
    }, gameId, 10);
    await assert.rejects(requireReads(), /did not finish within 10ms/);
  }
}
const mounted = loadingScannerSmoke.slice(
  loadingScannerSmoke.indexOf("async function mountedAdminContract"),
  loadingScannerSmoke.indexOf("async function scannerLifecycleSnapshot"),
);
const observedAt = mounted.indexOf("observeStartupOverviewReads(page, GAME_ID)");
assert.ok(observedAt >= 0 && observedAt < mounted.indexOf("await page.goto"));
assert.ok(mounted.indexOf("await finishStartupReads()") > mounted.indexOf("if (result.overflow > 2)"));
assert.match(loadingScannerSmoke, /const scanner = await scannerLifecycleSnapshot\(\);\s*await finishStartupReads\(\);\s*if \(errors.length\) fail\(errors\[0\]\)/);
console.log("All five Admin startup reads preserve snapshots, complete bodies, and reject HTTP, network and deadline failures.");
