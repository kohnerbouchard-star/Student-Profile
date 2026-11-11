import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createAccountDocument } from "./admin-account-controls-dom-fixture.mjs";

const read = path => readFileSync(path, "utf8");
const app = read("admin/v2/src/app.js");
function fragment(start, end) {
  const first = app.indexOf(start);
  const last = app.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Missing source boundary: ${start}`);
  return app.slice(first, last);
}
function setup() {
  const { document, Element } = createAccountDocument();
  const calls = { confirms: 0, signOut: 0, redirects: [], allowed: false };
  let resolveSignOut;
  const pendingSignOut = new Promise(resolve => { resolveSignOut = resolve; });
  const context = vm.createContext({
    document, Node: Element, HTMLElement: Element, URL,
    CustomEvent: class { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } },
    queueMicrotask() {},
    window: {
      location: { href: "https://example.test/admin/v2.html#overview", replace: url => calls.redirects.push(url) },
      confirm: () => { calls.confirms++; return calls.allowed; },
      EconovariaAdminAuthSession: { signOut: () => { calls.signOut++; return pendingSignOut; } },
      getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    },
    AdminIcon: () => new Element("svg"),
  });
  const run = source => vm.runInContext(source, context);
  for (const path of ["components/dom.js", "components/AdminDialog.js", "components/AdminDrawer.js", "shell-ux-enhancements.js"]) {
    run(read(`admin/v2/src/${path}`).replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm, "").replace(/^export /gm, ""));
  }
  run([
    fragment("function selectedSessionGame(", "function navigationGroups("),
    fragment("function accountDrawerContent(", "function gameDrawerContent("),
    fragment("  function updateOverviewShell(", "  function handleHashChange("),
  ].join("\n"));
  run(`
    const session = { user: { displayName: 'Synthetic Admin' }, activeGameSessions: [{ id: 'fixture', name: 'Initial game' }] };
    const selectedGameId = 'fixture';
    const initialGame = selectedGameContext(session, selectedGameId);
    const mount = createElement('div', { children: createElement('button', { className: 'admin-topbar__identity' }) });
    document.body.append(mount);
    let accountDrawer;
    ${fragment('  const accountDetails =', '  gameDrawer = AdminDrawer(')}
    const cleanup = enhanceAccountDrawer({ mount });
    const duplicateCleanup = enhanceAccountDrawer({ mount });
    const navigation = { setGameContext() {} };
    const topbar = { setIdentity() {}, setNotificationCount() {} };
    const notificationDrawer = { setContent() {} };
    const overview = { renderNotifications() { return null; } };
    const gameDrawer = { setContent() {} };
    function selectGame() {}
    function gameDrawerContent() { return null; }
  `);
  return { run, calls, resolveSignOut, document };
}

test("Overview updates preserve original connected account controls and refreshed identity details", () => {
  const { run, document } = setup();
  const actions = document.body.querySelector(".admin-shell-account-actions");
  const buttons = [...actions.querySelectorAll("button")];
  assert.deepEqual(buttons.map(button => button.textContent), ["Settings", "Switch game", "Sign out"]);
  for (let index = 0; index < 4; index++) {
    run(`updateOverviewShell({ model: { game: { name: 'Resolved ${index}' } }, panels: {} }); accountDrawer.open();`);
    assert.equal(document.body.querySelectorAll(".admin-shell-account-actions").length, 1);
    assert.equal(document.body.querySelector(".admin-shell-account-actions"), actions);
    for (const button of buttons) { assert.equal(button.isConnected, true); assert.equal(button.listeners.get("click").size, 1); }
    assert.equal(run(`accountDetails.textContent.includes('Resolved ${index}')`), true);
    run("accountDrawer.close();");
  }
  run("accountDrawer.open(); updateOverviewShell({ model: { game: { name: 'Open refresh' } }, panels: {} });");
  assert.equal(run("accountDrawer.isOpen()"), true);
  assert.equal(actions.isConnected, true);
  assert.equal(run("accountDetails.textContent.includes('Open refresh')"), true);
  run("duplicateCleanup(); cleanup(); accountDrawer.destroy();");
  assert.equal(actions.isConnected, false);
  assert.equal(run("accountDrawer.element.isConnected"), false);
  for (const button of buttons) assert.equal(button.listeners.get("click").size, 0);
});

test("preserved Sign out cancels without side effects and confirms only one pending sign-out", async () => {
  const { run, calls, resolveSignOut, document } = setup();
  run("updateOverviewShell({ model: { game: { name: 'Loaded game' } }, panels: {} }); accountDrawer.open();");
  const signOut = document.body.querySelector(".admin-shell-account-actions").querySelectorAll("button")[2];
  signOut.click();
  assert.equal(calls.confirms, 1);
  assert.equal(calls.signOut, 0);
  assert.equal(run("accountDrawer.isOpen()"), true);
  assert.equal(signOut.disabled, undefined);
  assert.deepEqual(calls.redirects, []);
  calls.allowed = true;
  signOut.click();
  signOut.click();
  assert.equal(calls.confirms, 2);
  assert.equal(calls.signOut, 1);
  assert.equal(signOut.disabled, true);
  assert.deepEqual(calls.redirects, []);
  resolveSignOut();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.redirects, ["https://example.test/?mode=admin&reason=signed-out"]);
  run("cleanup(); accountDrawer.destroy();");
  assert.equal(signOut.listeners.get("click").size, 0);
});


test("native account checks preserve baseline and validate each fresh BFF read batch", () => {
  const runner = read("scripts/admin-v2-browser-smoke.mjs");
  const start = runner.indexOf('for (const viewport of VIEWPORTS)');
  const end = runner.indexOf('const runtime = await createScenarioRuntime(browser, fixture, "ready", SHORT_DESKTOP_VIEWPORT)', start);
  const ready = runner.slice(start, end);
  assert.ok(ready.indexOf("await assertBffReadBoundary(fixture, runtime.runId)") < ready.indexOf("await verifyAccountControls("));
  assert.match(ready, /if \(STATIC_ROOT === REPOSITORY_ROOT\)/);
  assert.match(ready, /requestsFor\(runtime.runId\)\.slice\(requestOffset\)/);
  assert.match(ready, /assertBffReadBoundary\(\{ requestsFor: \(\) => batch \}, runtime.runId\)/);
  const check = read("scripts/admin-account-controls-browser-check.mjs");
  assert.match(check, /button\?\.isConnected && !button.disabled/);
  assert.match(check, /data-admin-v2-state="ready"/);
  assert.match(check, /await verifyRefreshBoundary\(\)/);
});
