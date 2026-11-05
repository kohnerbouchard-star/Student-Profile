import { createQualityHarness, BASE_URL } from "./admin-quality-smoke-fixture.mjs";

const harness = await createQualityHarness("settings-disclosure");
const { page, errors, capture, finish } = harness;
const styleMeasurements = [];
const styleFailures = [];
const readyDiagnostics = [];
const targetStyle = /\/(?:attendance-reward-settings|settings-simplified|settings-final-polish)\.css(?:\?|$)/;
async function measureStyles(target, label) {
  if (label !== "after-save-remount") await target.waitForLoadState("networkidle");
  const cdp = await target.context().newCDPSession(target);
  const scriptUrls = new Map();
  cdp.on("Debugger.scriptParsed", ({ scriptId, url }) => scriptUrls.set(scriptId, url ? new URL(url, BASE_URL).pathname : "inline"));
  await cdp.send("Debugger.enable");
  const listeners = [], listenerSignatures = [], listenerOrder = [];
  for (const expression of ["window", "document"]) {
    const { result } = await cdp.send("Runtime.evaluate", { expression });
    const entries = (await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId })).listeners;
    listeners.push(entries.length);
    listenerOrder.push(entries.map((entry) => `${entry.type}:${entry.useCapture}:${scriptUrls.get(entry.scriptId)}:${entry.lineNumber}:${entry.columnNumber}`));
    listenerSignatures.push(entries.map((entry) => `${entry.type}:${entry.useCapture}:${entry.lineNumber}:${entry.columnNumber}`).sort());
  }
  await cdp.detach();
  const styles = await target.evaluate(() => ({
    order: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.getAttribute("href")),
    count: document.querySelectorAll("#econovaria-settings-final-polish-style").length,
    requests: performance.getEntriesByType("resource").filter((entry) => /\/settings-save-error-bridge\.js(?:\?|$)|\/settings-final-polish\.css(?:\?|$)/.test(entry.name)).map((entry) => new URL(entry.name).pathname),
    stylesheetRequests: performance.getEntriesByType("resource").filter((entry) => /\.css(?:\?|$)/.test(entry.name)).map((entry) => new URL(entry.name).pathname).sort(),
    visuals: [...document.querySelectorAll('.admin-terminal-settings-page, .admin-terminal-settings-tuning-grid, [data-settings-custom-toggle], [data-attendance-reward-field="presentRewardAmount"], .admin-terminal-settings-save-bar')].map((node) => ({
      tag: node.tagName, bounds: node.getBoundingClientRect().toJSON(),
      computed: Object.fromEntries([...getComputedStyle(node)].map((name) => [name, getComputedStyle(node).getPropertyValue(name)])),
    })),
    observerRegistrations: window.__ref015Observers, events: window.__ref015Events,
    diagnostic: { originalSignal: window.__ref015D1.originalSignal || null, state: window.__ref015D1.state(), ready: window.__ref015D1.ready(), records: window.__ref015D1.records, errors: window.__ref015D1.errors, overflow: window.__ref015D1.overflow },
    selectorVisuals: Object.fromEntries(window.__ref015D1.selectors.map((selector) => {
      const root = document.querySelector(window.__ref015D1.selectors[0]);
      const node = selector === window.__ref015D1.selectors[0] ? root : root?.querySelector(selector);
      return [selector, node ? { tag: node.tagName, bounds: node.getBoundingClientRect().toJSON(), computed: Object.fromEntries([...getComputedStyle(node)].map((name) => [name, getComputedStyle(node).getPropertyValue(name)])) } : null];
    })),
  }));
  if (styles.count !== 1) throw new Error(`${label}: final-polish stylesheet is not unique.`);
  if (!label.startsWith("standalone")) {
    const expected = label === "off-page-bootstrap" ? ["settings-simplified.css", "settings-final-polish.css"] : ["attendance-reward-settings.css", "settings-simplified.css", "settings-final-polish.css"];
    if (JSON.stringify(styles.order.filter((href) => targetStyle.test(href)).map((href) => href.split("/").at(-1))) !== JSON.stringify(expected)) styleFailures.push(`${label}: target stylesheet precedence changed`);
    const reference = styleMeasurements.find((sample) => sample.label === "canonical-settings");
    if (reference && JSON.stringify(styles.order.filter((href) => !targetStyle.test(href))) !== JSON.stringify(reference.order.filter((href) => !targetStyle.test(href)))) styleFailures.push(`${label}: unrelated stylesheet order changed`);
    if (reference && JSON.stringify(styles.stylesheetRequests.filter((href) => !targetStyle.test(href))) !== JSON.stringify(reference.stylesheetRequests.filter((href) => !targetStyle.test(href)))) styleFailures.push(`${label}: unrelated stylesheet requests changed`);
  }
  styleMeasurements.push({ label, listeners, listenerSignatures, listenerOrder, ...styles });
}
page.setDefaultTimeout(10_000);
page.setDefaultNavigationTimeout(30_000);
let phase = "initial page load";
const releases = new Set();
const enterPhase = (value) => { phase = value; console.log(`Settings browser phase: ${phase}`); };
const deadline = setTimeout(() => {
  console.error(`Settings browser exceeded its bounded execution window during ${phase}.`);
  process.exit(1);
}, 120_000);
deadline.unref();

await page.addInitScript(() => window.addEventListener("econovaria:admin-bootstrap-complete", () => { window.__ref015BootstrapComplete = true; }, { once: true }));
await harness.context.addInitScript(() => {
  window.__ref015Observers = []; window.__ref015Events = [];
  const selectors = [".admin-terminal-settings-page", ".admin-terminal-settings-tuning-grid", "[data-settings-custom-toggle]", '[data-attendance-reward-field="presentRewardAmount"]', ".admin-terminal-settings-save-bar"];
  const pages = new WeakMap(), nodes = new WeakMap(), games = new Map(), requests = new Map(), contexts = new Map(), reads = new Map(), mounted = new WeakMap();
  let identity = 0;
  const token = (map, value, prefix) => { if (!value) return null; if (!map.has(value)) map.set(value, `${prefix}${++identity}`); return map.get(value); };
  const flag = (node, name) => { const value = node?.getAttribute(name) ?? null; return [null, "true", "false"].includes(value) ? value : "other"; };
  const diagnostic = window.__ref015D1 = { selectors, records: [], errors: [], overflow: false };
  function state() {
    const root = document.querySelector(selectors[0]), elements = selectors.map((selector, index) => index ? root?.querySelector(selector) : root);
    const rawGame = window.Econovaria?.features?.adminOverviewTerminal?.currentModel?.gameId || window.EconovariaAdminGameSelection?.read?.();
    const game = token(games, rawGame, "g"), card = root?.querySelector("[data-admin-attendance-reward-settings]"), save = root?.querySelector('[data-admin-terminal-action="save-settings"]');
    const [page, grid, toggle] = elements;
    const value = { page: token(pages, root, "p"), game, connected: Boolean(root?.isConnected), ids: elements.map((node) => token(nodes, node, "n")), counts: selectors.map((selector, index) => (index ? root : document)?.querySelectorAll(selector).length || 0),
      structural: flag(root, "data-settings-ux-ready"), baseline: flag(root, "data-settings-ux-baseline-ready"), disclosure: flag(root, "data-settings-disclosure-initialized"),
      attendanceLoaded: flag(card, "data-attendance-reward-loaded"), attendanceError: flag(card, "data-attendance-reward-load-error"), attendanceGameMatches: Boolean(rawGame && window.EconovariaAttendanceRewardSettings?.getGameId?.() === rawGame),
      busy: flag(save, "aria-busy"), saveDisabled: save?.disabled ?? null, expanded: flag(toggle, "aria-expanded"), open: Boolean(page?.classList.contains("is-custom-settings-open")), controlsMatch: Boolean(toggle && grid && toggle.getAttribute("aria-controls") === grid.id),
      pendingSettingsReads: reads.get(game)?.pending.size ?? 0, terminalSettingsRead: reads.get(game)?.terminal ?? null };
    value.complete = value.connected && value.counts.every((count) => count === 1) && [value.structural, value.baseline, value.disclosure, value.attendanceLoaded].every((v) => v === "true") && value.attendanceGameMatches && value.busy !== "true" && value.controlsMatch && value.expanded === String(value.open);
    return value;
  }
  const signature = (value) => JSON.stringify([value.page, value.game, value.ids]);
  function record(value) {
    if (diagnostic.records.length >= 2000) { diagnostic.overflow = true; return; }
    const entry = { seq: diagnostic.records.length, timeMs: performance.now(), ...value };
    diagnostic.records.push(entry); return entry;
  }
  const safe = (operation) => { try { return operation(); } catch { diagnostic.errors.push("diagnostic instrumentation error"); return null; } };
  diagnostic.state = () => safe(state);
  diagnostic.ready = () => Boolean(safe(() => {
    const value = state(), root = document.querySelector(selectors[0]);
    const display = value.complete ? getComputedStyle(root.querySelector(selectors[1])).display !== "none" : null;
    const mount = mounted.get(root), terminal = value.terminalSettingsRead;
    return Boolean(!diagnostic.overflow && !diagnostic.errors.length && value.complete && terminal?.startObserved && !value.pendingSettingsReads && mount?.signature === signature(value) && mount.terminal === terminal.request && mount.seq > terminal.seq && display === value.open);
  }));
  diagnostic.begin = (event, target) => safe(() => {
    const before = state(), detail = event.detail || {}, path = typeof detail.pathname === "string" ? detail.pathname : "";
    const request = token(requests, detail.requestId, "r"), resource = /\/games\/[^/]+\/([^/]+)/.exec(path)?.[1];
    const context = contexts.get(request) || { request, resource: ["settings", "overview", "players", "attendance", "contracts", "economy", "store", "inventory"].includes(resource) ? resource : "other", method: ["GET", "HEAD", "PATCH", "POST", "DELETE"].includes(detail.method) ? detail.method : null,
      requestGame: token(games, /\/games\/([^/]+)/.exec(path)?.[1], "g"), pageAtStart: detail.phase === "started" ? before.page : null, startObserved: detail.phase === "started" };
    if (request && detail.phase === "started") contexts.set(request, context);
    if (event.type === "econovaria:admin-request-lifecycle" && request && context.resource === "settings" && ["GET", "HEAD"].includes(context.method)) {
      const read = reads.get(context.requestGame) || { pending: new Set(), terminal: null }; reads.set(context.requestGame, read);
      if (detail.phase === "started") read.pending.add(request);
      else if (["committed", "failed", "cancelled"].includes(detail.phase)) { read.pending.delete(request); read.terminal = { request, phase: detail.phase, seq: diagnostic.records.length, startObserved: context.startObserved }; }
    }
    const value = { kind: "dispatch", event: event.type, phase: detail.phase || null, reason: ["navigation", "request-complete", "game-context", "attendance-saved", "window-load", "module-load", "explicit"].includes(detail.reason) ? detail.reason : null,
      ...context, targetPage: target?.matches?.(selectors[0]) ? token(pages, target, "p") : null, before };
    return record(value);
  });
  diagnostic.end = (value, event, target) => safe(() => {
    if (!value) return;
    value.after = state();
    if (event.type === "econovaria:admin-settings-mounted" && target === document.querySelector(selectors[0]) && value.after.complete) mounted.set(target, { signature: signature(value.after), terminal: value.after.terminalSettingsRead?.request, seq: value.seq });
  });
  diagnostic.observe = (before, mutations, observer) => safe(() => {
    const after = state(), changes = [];
    for (const mutation of mutations) if (mutation.type === "childList") for (const action of ["addedNodes", "removedNodes"]) for (const node of mutation[action]) {
      if (!(node instanceof Element)) continue;
      const affected = selectors.filter((selector) => node.matches(selector) || node.querySelector(selector));
      if (affected.length) changes.push({ action, node: token(nodes, node, "n"), tag: node.tagName, affected });
    }
    if (changes.length || JSON.stringify(before) !== JSON.stringify(after)) record({ kind: "observer", observer: token(nodes, observer, "o"), before, after, changes });
  });
  window.MutationObserver = new Proxy(window.MutationObserver, { construct(Type, args, newTarget) {
    const [callback, ...rest] = args;
    if (typeof callback !== "function") return Reflect.construct(Type, args, newTarget);
    function track(...values) {
      const before = diagnostic.state();
      try { return Reflect.apply(callback, this, values); }
      finally { diagnostic.observe(before, values[0], values[1]); }
    }
    const observer = Reflect.construct(Type, [track, ...rest], newTarget), observe = observer.observe;
    observer.observe = function (target, options) {
      const result = Reflect.apply(observe, this, [target, options]);
      window.__ref015Observers.push({ target: target === document.body ? "body" : target === document.documentElement ? "html" : target.nodeName, options });
      return result;
    };
    return observer;
  } });
  const dispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (event) {
    if (event.type.startsWith("econovaria:")) window.__ref015Events.push({ type: event.type, phase: event.detail?.phase || null, target: this === window ? "window" : this === document ? "document" : this.nodeName });
    const value = event.type.startsWith("econovaria:") ? diagnostic.begin(event, this) : null;
    try { return Reflect.apply(dispatch, this, [event]); }
    finally { diagnostic.end(value, event, this); }
  };
});

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.waitForFunction(() => {
    const root = document.querySelector(".admin-terminal-settings-page");
    return root?.getAttribute("data-settings-ux-ready") === "true" &&
      root?.getAttribute("data-settings-ux-baseline-ready") === "true";
  }, null, { timeout: 10_000 });
  await page.waitForFunction(() => window.__ref015BootstrapComplete);
  await measureStyles(page, "canonical-settings");
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("#adminPreview:not([hidden])");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".admin-terminal-settings-page")?.getAttribute("data-settings-ux-ready") === "true");
  await page.waitForFunction(() => window.__ref015BootstrapComplete);
  await measureStyles(page, "reused-session-settings");
  for (const sample of styleMeasurements) if (sample.requests.filter((path) => path.endsWith("settings-save-error-bridge.js")).length !== Number(process.env.REF015_EXPECT_BRIDGE ?? 0)) throw new Error("Unexpected normal-path bridge request count.");
  const standalone = await harness.context.newPage();
  await standalone.route("**/ref015-style-fixture.html", (route) => route.fulfill({
    contentType: "text/html", body: '<!doctype html><link rel="stylesheet" href="./css/settings-simplified.css"><script src="./settings-save-error-bridge.js"></script><script>window.styleWasSynchronous = !!document.getElementById("econovaria-settings-final-polish-style");</script><script src="./settings-save-error-bridge.js?repeat"></script>',
  }));
  await standalone.goto(`${BASE_URL.replace(/\/$/, "")}/ref015-style-fixture.html`, { waitUntil: "load" });
  if (!await standalone.evaluate(() => window.styleWasSynchronous && !window.EconovariaSimplifiedSettings)) {
    throw new Error("Standalone classic-script stylesheet insertion was not synchronous.");
  }
  await measureStyles(standalone, "standalone-repeat");
  const fallback = styleMeasurements.at(-1);
  if (fallback.listeners.some(Boolean) || fallback.requests.filter((path) => path.endsWith(".css")).length !== 1 ||
      fallback.order.join(",") !== "./css/settings-simplified.css,./css/settings-final-polish.css") {
    throw new Error("Standalone stylesheet order/request/listener contract changed.");
  }
  await standalone.reload({ waitUntil: "load" });
  await measureStyles(standalone, "standalone-repeat-reload");
  await standalone.close();

  await page.locator("[data-settings-custom-toggle]").click();
  await page.waitForFunction(() =>
    document.querySelector(".admin-terminal-settings-page")
      ?.classList.contains("is-custom-settings-open") === true,
  null, { timeout: 5_000 });

  const option = page.locator(
    "[data-settings-segmented] [data-settings-segment-value]:not(.is-selected)",
  ).first();
  await option.click();
  await page.waitForTimeout(250);

  const afterOption = await page.evaluate(() => {
    const root = document.querySelector(".admin-terminal-settings-page");
    const grid = root?.querySelector(".admin-terminal-settings-tuning-grid");
    const toggle = root?.querySelector("[data-settings-custom-toggle]");
    return {
      open: root?.classList.contains("is-custom-settings-open") || false,
      gridDisplay: grid ? getComputedStyle(grid).display : "",
      toggleText: toggle?.textContent?.trim() || "",
      expanded: toggle?.getAttribute("aria-expanded") || "",
    };
  });
  if (
    !afterOption.open ||
    afterOption.gridDisplay === "none" ||
    !/Hide custom settings/i.test(afterOption.toggleText) ||
    afterOption.expanded !== "true"
  ) {
    throw new Error(`Custom option closed the disclosure: ${JSON.stringify(afterOption)}`);
  }

  const numeric = page.locator('[data-attendance-reward-field="presentRewardAmount"]');
  await page.evaluate(() => {
    const root = document.querySelector(".admin-terminal-settings-page");
    const input = document.querySelector('[data-attendance-reward-field="presentRewardAmount"]');
    if (!(root instanceof HTMLElement) || !(input instanceof HTMLInputElement)) {
      throw new Error("Numeric Settings fixture was not found.");
    }
    root.dataset.settingsNumericRootToken = "stable-root";
    input.dataset.settingsNumericInputToken = "stable-input";
    window.__settingsNativeInputCount = 0;
    document.addEventListener("input", (event) => {
      if (event.target === input) window.__settingsNativeInputCount += 1;
    });
  });

  await numeric.focus();
  await numeric.press("ControlOrMeta+A");
  await numeric.type("2.75", { delay: 35 });
  await page.waitForTimeout(250);

  const duringNumericEdit = await page.evaluate(() => {
    const root = document.querySelector(".admin-terminal-settings-page");
    const input = document.querySelector('[data-attendance-reward-field="presentRewardAmount"]');
    const save = root?.querySelector('[data-admin-terminal-action="save-settings"]');
    const saveBar = root?.querySelector(".admin-terminal-settings-save-bar");
    const status = root?.querySelector("[data-settings-save-status]");
    return {
      rootStable: root?.dataset.settingsNumericRootToken === "stable-root",
      inputStable: input?.dataset.settingsNumericInputToken === "stable-input",
      focused: document.activeElement === input,
      open: root?.classList.contains("is-custom-settings-open") || false,
      value: input instanceof HTMLInputElement ? input.value : "",
      nativeInputCount: Number(window.__settingsNativeInputCount || 0),
      attendanceDirty: window.EconovariaAttendanceRewardSettings?.isDirty?.() === true,
      sharedDirty: window.EconovariaSimplifiedSettings?.isDirty?.() === true,
      saveEnabled: save instanceof HTMLButtonElement && !save.disabled,
      saveVisible: Boolean(saveBar && !saveBar.hidden && getComputedStyle(saveBar).display !== "none"),
      statusRole: status?.getAttribute("role") || "",
      statusText: status?.textContent?.trim() || "",
    };
  });
  if (
    !duringNumericEdit.rootStable ||
    !duringNumericEdit.inputStable ||
    !duringNumericEdit.focused ||
    !duringNumericEdit.open ||
    duringNumericEdit.value !== "2.75" ||
    duringNumericEdit.nativeInputCount < 1 ||
    !duringNumericEdit.attendanceDirty ||
    !duringNumericEdit.sharedDirty ||
    !duringNumericEdit.saveEnabled ||
    !duringNumericEdit.saveVisible ||
    duringNumericEdit.statusRole !== "status" ||
    !/unsaved/i.test(duringNumericEdit.statusText)
  ) {
    throw new Error(`Numeric Settings state boundary failed: ${JSON.stringify(duringNumericEdit)}`);
  }

  await numeric.blur();
  await page.waitForFunction(() => {
    const root = document.querySelector(".admin-terminal-settings-page");
    const save = root?.querySelector('[data-admin-terminal-action="save-settings"]');
    return root?.classList.contains("is-custom-settings-open") &&
      root?.classList.contains("has-unsaved-settings") &&
      save instanceof HTMLButtonElement && !save.disabled;
  }, null, { timeout: 5_000 });

  const bridgeSource = await page.request.get(`${BASE_URL}/settings-save-error-bridge.js`);
  const bridgeText = await bridgeSource.text();
  if (/MutationObserver|addEventListener|requestAnimationFrame|stopImmediatePropagation|NUMERIC_EDITOR_SELECTOR|deferredNumericControls/.test(bridgeText)) {
    throw new Error("Settings error bridge still intercepts document or numeric input lifecycle.");
  }

  const presenterSource = await page.request.get(`${BASE_URL}/settings-simplified.js`);
  const presenterText = await presenterSource.text();
  if (
    /forceAutomaticAttendancePolicy/.test(presenterText) ||
    /difficulty\.value\s*=\s*["']true["']/.test(presenterText) ||
    /currency\.value\s*=\s*["']player_country["']/.test(presenterText)
  ) {
    throw new Error("Shared Settings presenter still mutates attendance policy values.");
  }

  const attendanceSource = await page.request.get(`${BASE_URL}/attendance-reward-settings-v4.js`);
  const attendanceText = await attendanceSource.text();
  if (
    !/AUTOMATIC_CURRENCY_MODE\s*=\s*["']player_country["']/.test(attendanceText) ||
    !/AUTOMATIC_DIFFICULTY_ADJUSTMENT\s*=\s*true/.test(attendanceText)
  ) {
    throw new Error("Attendance domain no longer owns the automatic payout policy invariant.");
  }

  await page.evaluate(() => {
    const current = document.querySelector(".admin-terminal-settings-page");
    if (!(current instanceof HTMLElement)) throw new Error("Settings page was not found.");
    const replacement = current.cloneNode(true);
    replacement.classList.remove("is-custom-settings-open");
    replacement.removeAttribute("data-settings-disclosure-initialized");
    replacement.removeAttribute("data-settings-ux-ready");
    replacement.querySelector("[data-settings-custom-toggle]")?.remove();
    current.replaceWith(replacement);
  });

  await page.waitForFunction(() => {
    const root = document.querySelector(".admin-terminal-settings-page");
    const grid = root?.querySelector(".admin-terminal-settings-tuning-grid");
    const toggle = root?.querySelector("[data-settings-custom-toggle]");
    return root?.getAttribute("data-settings-ux-ready") === "true" &&
      root.classList.contains("is-custom-settings-open") &&
      grid && getComputedStyle(grid).display !== "none" &&
      toggle?.getAttribute("aria-expanded") === "true" &&
      /Hide custom settings/i.test(toggle.textContent || "");
  }, null, { timeout: 5_000 });

  await page.locator("[data-settings-custom-toggle]").click();
  await page.waitForFunction(() => {
    const root = document.querySelector(".admin-terminal-settings-page");
    const toggle = root?.querySelector("[data-settings-custom-toggle]");
    return !root?.classList.contains("is-custom-settings-open") &&
      toggle?.getAttribute("aria-expanded") === "false" &&
      /Edit custom settings/i.test(toggle?.textContent || "");
  }, null, { timeout: 5_000 });

  // Exercise the source-owned save promise, not an alternative test controller.
  enterPhase("fresh save lifecycle page");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.waitForFunction(() => window.__ref015BootstrapComplete);
  await measureStyles(page, "off-page-bootstrap");
  if (await page.evaluate(() => document.getElementById("econovaria-attendance-reward-settings-style") || performance.getEntriesByType("resource").some((entry) => entry.name.includes("/attendance-reward-settings.css")))) throw new Error("Off-page bootstrap eagerly installed Attendance CSS.");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.waitForFunction(() => {
    const passed = document.querySelector(".admin-terminal-settings-page")?.getAttribute("data-settings-ux-baseline-ready") === "true";
    if (passed) window.__ref015D1.originalSignal = window.__ref015D1.state();
    return passed;
  }, null, { timeout: 10_000 });
  await measureStyles(page, "late-first-settings-mount");
  try {
    await page.waitForFunction(() => window.__ref015D1.ready(), null, { timeout: 10_000 });
    await measureStyles(page, "late-first-settings-mount-ready");
    readyDiagnostics.push({ status: styleMeasurements.at(-1).diagnostic.ready ? "passed" : "incomplete", state: styleMeasurements.at(-1).diagnostic.state });
    if (!styleMeasurements.at(-1).diagnostic.ready) styleFailures.push("Ready capture lost its qualifying page/state");
  } catch (error) {
    styleFailures.push(`Ready-state diagnostic failed: ${error.message}`);
    readyDiagnostics.push({ status: "failed", state: await page.evaluate(() => window.__ref015D1.state()), message: error.message });
  }
  await page.locator("[data-settings-custom-toggle]").click();
  const saveControl = page.locator('[data-admin-terminal-action="save-settings"]');
  const amountControl = page.locator('[data-attendance-reward-field="presentRewardAmount"]');
  const ref014Writes = [];
  let responseStatus = 200;
  let delayedResponse = null;
  await page.evaluate(() => {
    window.__ref014SavedEvents = 0;
    document.addEventListener("econovaria:attendance-reward-saved", () => { window.__ref014SavedEvents += 1; });
  });
  await page.route("**/functions/v1/web-session-api/proxy/games/*/settings", async (route) => {
    const request = route.request();
    if (request.method() !== "PATCH") return route.fallback();
    const headers = request.headers();
    const body = request.postDataJSON();
    const status = responseStatus;
    const pending = delayedResponse;
    delayedResponse = null;
    ref014Writes.push({ status, body, headers });
    if (!headers["x-econovaria-csrf-token"] || !headers["x-econovaria-game-id"] ||
        headers.authorization || headers["x-idempotency-key"] !== body.idempotencyKey ||
        headers["x-request-id"] !== body.idempotencyKey) {
      errors.push("REF-014 save lost its authenticated game/retry header contract.");
    }
    if (pending) await pending.promise;
    await route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": new URL(BASE_URL).origin,
        "access-control-allow-credentials": "true", "cache-control": "no-store" },
      body: JSON.stringify(status === 200 ? { data: { saved: true } } : {
        message: status === 400 ? "Invalid timezone" : status === 403 ? "Wrong game or permission denied" : "Service unavailable",
      }),
    });
  });
  for (const [index, status] of [400, 403, 503].entries()) {
    enterPhase(`denial ${status}`);
    const value = String(9 + index);
    await amountControl.fill(value);
    responseStatus = status;
    const savedBefore = await page.evaluate(() => window.__ref014SavedEvents);
    await saveControl.click();
    await page.waitForFunction(() => document.querySelector('[data-admin-terminal-action="save-settings"]')
      ?.getAttribute("data-admin-terminal-api-state") === "error");
    const failure = await page.locator("[data-settings-save-status]").innerText();
    if (!/not saved/i.test(failure) || await amountControl.inputValue() !== value ||
        await page.locator(".admin-terminal-settings-save-bar.is-saved").count() ||
        await page.evaluate(() => window.__ref014SavedEvents) !== savedBefore) {
      throw new Error(`REF-014 ${status} rejection lost the draft or presented success.`);
    }
    const failedKey = ref014Writes.at(-1).body.idempotencyKey;
    responseStatus = 200;
    enterPhase(`retry after ${status}`);
    await saveControl.click();
    await page.waitForFunction(() => document.querySelector("[data-settings-save-status]")?.textContent === "Settings saved");
    if (ref014Writes.at(-1).body.idempotencyKey !== failedKey) {
      throw new Error("REF-014 same-payload retry changed its idempotency key.");
    }
  }
  function delayNextResponse() {
    let release;
    delayedResponse = { promise: new Promise((resolve) => { release = resolve; }) };
    const releaseOnce = () => { releases.delete(releaseOnce); release(); };
    releases.add(releaseOnce);
    return releaseOnce;
  }
  enterPhase("duplicate-click suppression");
  await amountControl.fill("12.5");
  const beforeDouble = ref014Writes.length;
  const releaseDouble = delayNextResponse();
  await page.evaluate(() => {
    const button = document.querySelector('[data-admin-terminal-action="save-settings"]');
    button.click();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => document.querySelector('[data-admin-terminal-action="save-settings"]')?.getAttribute("aria-busy") === "true");
  for (let attempt = 0; attempt < 100 && ref014Writes.length === beforeDouble; attempt++) await page.waitForTimeout(10);
  if (ref014Writes.length !== beforeDouble + 1) throw new Error("REF-014 double save posted duplicate writes.");
  releaseDouble();
  await page.waitForFunction(() => document.querySelector("[data-settings-save-status]")?.textContent === "Settings saved");

  enterPhase("stale page response");
  await amountControl.fill("13.5");
  enterPhase("stale request start");
  const beforeStale = ref014Writes.length;
  const savedBeforeStale = await page.evaluate(() => window.__ref014SavedEvents);
  const releaseStale = delayNextResponse();
  await saveControl.click();
  for (let attempt = 0; attempt < 100 && ref014Writes.length === beforeStale; attempt++) await page.waitForTimeout(10);
  if (ref014Writes.length !== beforeStale + 1) throw new Error("REF-014 stale-response fixture did not send one write.");
  const staleKey = ref014Writes.at(-1).body.idempotencyKey;
  enterPhase("replace in-flight Settings page");
  await page.evaluate(() => {
    const oldPage = document.querySelector(".admin-terminal-settings-page");
    const replacement = oldPage.cloneNode(true);
    replacement.removeAttribute("data-settings-ux-ready");
    replacement.removeAttribute("data-settings-disclosure-initialized");
    replacement.querySelector("[data-settings-custom-toggle]")?.remove();
    const button = replacement.querySelector('[data-admin-terminal-action="save-settings"]');
    for (const name of ["aria-busy", "aria-disabled", "data-admin-terminal-api-state", "data-attendance-reward-status", "data-attendance-reward-direct-save"]) button.removeAttribute(name);
    oldPage.replaceWith(replacement);
  });
  enterPhase("release stale Settings response");
  releaseStale();
  // Wait for the application to consume the mutation result, not for a
  // Playwright request-finished event on an intentionally delayed mock route.
  // The controller completes the matching retry key before its stale UI guard.
  await page.waitForFunction((key) => {
    const prefix = "econovaria.admin.attendance-settings-mutation.v1.";
    return !Object.keys(sessionStorage).some((name) => {
      if (!name.startsWith(prefix)) return false;
      try { return JSON.parse(sessionStorage.getItem(name) || "{}").key === key; }
      catch { return false; }
    });
  }, staleKey, { timeout: 10_000 });
  enterPhase("verify rejected stale acknowledgement");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (await page.evaluate(() => window.__ref014SavedEvents) !== savedBeforeStale ||
      await page.locator(".admin-terminal-settings-save-bar.is-saved").count()) {
    throw new Error("REF-014 old-page response acknowledged the replacement page.");
  }
  enterPhase("final diagnostics");
  await measureStyles(page, "after-save-remount");
  const sameIdentity = await page.evaluate(async () => {
    const before = [...document.querySelectorAll('link[rel="stylesheet"]')];
    await import("./settings-simplified.js"); await import("./attendance-reward-settings-v4.js"); await import("./settings-save-error-bridge.js"); await import("./settings-save-error-bridge.js?ref015-repeat");
    const after = [...document.querySelectorAll('link[rel="stylesheet"]')];
    return before.length === after.length && before.every((node, index) => node === after[index]);
  });
  const repeated = await page.evaluate(() => ({ unique: document.querySelectorAll("#econovaria-settings-final-polish-style").length, order: [...document.querySelectorAll('link[rel="stylesheet"]')].map((node) => node.getAttribute("href")) }));
  if (!sameIdentity || repeated.unique !== 1 || JSON.stringify(repeated.order) !== JSON.stringify(styleMeasurements.at(-1).order)) throw new Error("Repeated owner/bridge/query load changed stylesheet identity/order.");
  await capture("settings-disclosure-persistence");
  if (styleMeasurements.some((sample) => sample.diagnostic.overflow || sample.diagnostic.errors.length)) styleFailures.push("Diagnostic evidence is incomplete");
  if (styleFailures.length) throw new Error(styleFailures.join("; "));
  if (errors.length) throw new Error(errors[0]);
  console.log("Shared Settings preserves native events, focus, save state, disclosure, and domain boundaries.");
  await finish({ afterOption, duringNumericEdit, ref014Writes, styleMeasurements, readyDiagnostics, errors });
  clearTimeout(deadline);
} catch (error) {
  console.error(`Settings browser failure during ${phase}:`, error.stack || error.message || String(error));
  for (const release of [...releases]) release();
  const bounded = (operation) => Promise.race([operation, new Promise((resolve) => setTimeout(resolve, 5000))]);
  await bounded(capture("settings-disclosure-failure").catch(() => {}));
  await bounded(finish({ phase, styleMeasurements, styleFailures, readyDiagnostics, failure: error.stack || error.message || String(error) }).catch(() => {}));
  process.exitCode = 1;
}
