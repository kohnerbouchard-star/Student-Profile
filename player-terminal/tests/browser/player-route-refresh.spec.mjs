import { expect, test } from "@playwright/test";

const ROUTE_FAMILIES = [
  "news",
  "market",
  "portfolio",
  "business",
  "contracts",
  "store",
  "marketplace",
  "inventory",
  "crafting",
  "banking",
  "loans",
  "messages",
  "progression",
  "profile"
];

async function configurePreview(page) {
  await page.addInitScript(() => {
    globalThis.ECONOVARIA_PLAYER_TERMINAL_CONFIG = {
      usePreviewData: true,
      simulatePreviewWrites: true,
      preserveProductSurface: true,
    };
  });
}

async function waitForStableRoute(page) {
  await page.waitForFunction(async () => {
    const isReady = () => {
      const routePage = document.querySelector(
        ".player-terminal-page:not(.player-terminal-route-skeleton):not(.player-terminal-route-error)"
      );
      return Boolean(
        routePage?.querySelector(".player-terminal-page-heading h2") &&
        !document.querySelector(".player-terminal-route-skeleton")
      );
    };

    if (!isReady()) return false;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return isReady();
  });
}

async function openRoute(page, route) {
  await page.goto(`/?preview=1#${route}`);
  await waitForStableRoute(page);
  await expect(page.locator(".player-terminal-page:not(.player-terminal-route-skeleton)")).toBeVisible();
  await expect(page.locator(".player-terminal-page-heading h2")).toBeVisible();
  await expect(page.locator(".player-terminal-route-skeleton")).toHaveCount(0);
  await expect(page.locator(".player-terminal-route-error")).toHaveCount(0);
}

async function horizontalOverflow(page) {
  return page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
}

test.beforeEach(async ({ page }) => {
  await configurePreview(page);
});

test("shared route owner is active across every Player Terminal route family", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Full route-family scan runs once in desktop Chromium.");

  await openRoute(page, ROUTE_FAMILIES[0]);
  const stylesLoaded = await page.evaluate(() => {
    const hrefs = [...document.styleSheets].map((sheet) => String(sheet.href || ""));
    const sharedOwners = [
      "/css/routes/player-terminal-shared-layout.css",
      "/css/routes/player-terminal-shared-cards.css",
      "/css/routes/player-terminal-shared-lists.css",
      "/css/routes/player-terminal-shared-states.css",
      "/css/routes/player-terminal-shared-details.css",
      "/css/routes/player-terminal-shared-responsive.css",
      "/css/routes/player-terminal-shared-overlays.css",
    ];
    const retiredOwners = [
      "/css/player-terminal-base.css",
      "/css/player-terminal.css",
      "/css/player-terminal-ux.css",
      "/css/player-terminal-polish.css",
      "/css/player-terminal-normalization.css",
      "/css/player-terminal-shell-compat.css",
      "/css/player-terminal-route-compat.css",
    ];
    return {
      route: sharedOwners.every((suffix) => hrefs.some((href) => href.endsWith(suffix))),
      legacy: retiredOwners.some((suffix) => hrefs.some((href) => href.endsWith(suffix))),
    };
  });
  expect(stylesLoaded).toEqual({ route: true, legacy: false });

  for (const route of ROUTE_FAMILIES) {
    await openRoute(page, route);
    await expect(page).toHaveURL(new RegExp(`#${route}$`));
    const result = await page.evaluate(() => {
      const visible = (element) => Boolean(element && element.getClientRects().length);
      const numericStyle = (element, property) => element ? Number.parseFloat(getComputedStyle(element)[property]) : 0;
      const headingCopy = document.querySelector(".player-terminal-page-heading p");
      const routeSurface = [...document.querySelectorAll([
        ".player-terminal-panel",
        ".player-terminal-store-card",
        ".player-terminal-inventory-card",
        ".player-terminal-marketplace-card",
        ".player-terminal-business-product",
        ".player-terminal-recipe-row",
        ".player-terminal-loan-offer",
        ".player-terminal-news-row",
        ".player-terminal-asset-row",
        ".player-terminal-contract-row",
        ".player-terminal-transaction-row",
        ".player-terminal-thread-row",
        ".player-terminal-bank-card"
      ].join(","))].find(visible);
      const labels = [...document.querySelectorAll([
        ".player-terminal-metric-card small",
        ".player-terminal-filter-row button",
        ".player-terminal-chart-toolbar button",
        ".player-terminal-news-filters button",
        ".player-terminal-contract-tabs button",
        ".player-terminal-progression-tabs button",
        ".player-terminal-asset-row small",
        ".player-terminal-news-row small",
        ".player-terminal-contract-row small",
        ".player-terminal-transaction-row small",
        ".player-terminal-thread-row small"
      ].join(","))].filter(visible);
      return {
        headingCopySize: numericStyle(headingCopy, "fontSize"),
        surfaceRadius: numericStyle(routeSurface, "borderRadius"),
        minimumLabelSize: labels.length ? Math.min(...labels.map((element) => numericStyle(element, "fontSize"))) : 12,
      };
    });

    expect(result.headingCopySize).toBeGreaterThanOrEqual(13);
    expect(result.surfaceRadius).toBeGreaterThanOrEqual(6);
    expect(result.minimumLabelSize).toBeGreaterThanOrEqual(11);

    const overflow = await horizontalOverflow(page);
    expect(overflow.document, `${route} document overflow`).toBeLessThanOrEqual(1);
    expect(overflow.body, `${route} body overflow`).toBeLessThanOrEqual(1);
  }
});

test("representative mobile routes retain readable cards and page-level containment", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile route density runs in the mobile Chromium project.");

  for (const route of ["market", "contracts", "store", "banking", "messages", "profile"]) {
    await openRoute(page, route);
    const overflow = await horizontalOverflow(page);
    expect(overflow.document, `${route} document overflow`).toBeLessThanOrEqual(1);
    expect(overflow.body, `${route} body overflow`).toBeLessThanOrEqual(1);

    const measurements = await page.evaluate(() => {
      const visible = (element) => Boolean(element && element.getClientRects().length);
      const panel = [...document.querySelectorAll(".player-terminal-panel")].find(visible);
      const button = [...document.querySelectorAll(".player-terminal-page button")].find(visible);
      return {
        panelWidth: panel?.getBoundingClientRect().width || 0,
        viewportWidth: document.documentElement.clientWidth,
        buttonHeight: button?.getBoundingClientRect().height || 44,
      };
    });
    expect(measurements.panelWidth).toBeLessThanOrEqual(measurements.viewportWidth + 1);
    expect(measurements.buttonHeight).toBeGreaterThanOrEqual(40);
  }
});

test("shared transactional modal uses the refreshed, contained presentation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Modal geometry is verified once in desktop Chromium.");
  await openRoute(page, "store");
  await page.locator("[data-player-purchase]:not([disabled])").first().click();
  const dialog = page.locator('[aria-labelledby="storePurchaseModalTitle"]');
  await expect(dialog).toBeVisible();
  const geometry = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      radius: Number.parseFloat(style.borderRadius),
      width: rect.width,
      viewportWidth: document.documentElement.clientWidth,
      maxHeight: rect.height,
      viewportHeight: document.documentElement.clientHeight,
    };
  });
  expect(geometry.radius).toBeGreaterThanOrEqual(10);
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewportWidth - 16);
  expect(geometry.maxHeight).toBeLessThanOrEqual(geometry.viewportHeight - 8);
});

for (const group of ["session isolation", "publisher lifecycle"]) test(`default terminal freshness fences ${group}`, async ({ page }) => {
  await openRoute(page, "dashboard");
  const evidence = await page.evaluate(async (group) => {
    globalThis.Econovaria.playerTerminal.destroy();
    const { createPlayerTerminal } = await import("/src/app.js");
    const { PlayerApi } = await import("/src/api/player-api.js");
    const { createResourceFreshnessCoordinator } = await import("/src/api/resource-freshness-coordinator.js");
    const originals = Object.fromEntries(["bootstrap", "loadRoute", "refreshResources", "execute"].map((key) => [key, PlayerApi.prototype[key]]));
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const assert = (value, message) => { if (!value) throw new Error(message); };
    const wait = async (check) => { for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10)); assert(check(), "fixture did not settle"); };
    const records = [], listeners = new Map();
    const add = globalThis.addEventListener, remove = globalThis.removeEventListener;
    globalThis.addEventListener = function (type, fn, options) { listeners.set(fn, type); return add.call(this, type, fn, options); };
    globalThis.removeEventListener = function (type, fn, options) { listeners.delete(fn); return remove.call(this, type, fn, options); };
    async function fixture() {
      const mount = document.createElement("div"); document.body.append(mount);
      let invalidSessions = 0;
      const config = { usePreviewData: true, simulatePreviewWrites: true, writeCooldownMs: 250, sessionReadyEvent: "fixture:session", onSessionInvalid: () => invalidSessions++ };
      const terminal = createPlayerTerminal({ mount, config });
      const freshness = terminal.freshness;
      await wait(() => terminal.getState().status === "ready" && !terminal.getState().routeLoading.dashboard);
      return { mount, freshness, terminal, config, invalidSessions: () => invalidSessions, dispose() { terminal.destroy(); mount.remove(); } };
    }
    function button(f, action) {
      const node = document.createElement("button"); node.dataset.playerAction = action; node.textContent = "Original"; f.mount.append(node); return node;
    }
    const { PreviewTransport } = await import("/src/api/preview-transport.js");
    const transportRequest = PreviewTransport.prototype.request;
    if (group === "session isolation") {
      for (const admission of ["request", "publication"]) for (const order of ["bootstrap", "partial"]) {
        let phase = "Session A", releaseOld, releasePartial, releaseRecovery, dashboardReads = 0;
        PreviewTransport.prototype.request = async function (request) {
          const response = await transportRequest.call(this, request);
          if (request.endpointKey === "session") return { ...response, displayName: phase };
          if (request.endpointKey !== "dashboard") return response;
          if (phase === "Session B") {
            const index = ++dashboardReads;
            if (index === 1 && admission === "request") await new Promise((resolve) => { releaseOld = resolve; });
            if (index === 2) await new Promise((resolve) => { releasePartial = resolve; });
          }
          return { ...response, netWorth: phase === "Session A" ? 700001 : 700002 };
        };
        const scoped = await fixture(), oldCapabilities = scoped.terminal.getState().data.capabilities;
        let staleReady = false;
        const unsubscribe = scoped.terminal.subscribe((state) => {
          if (state.status === "ready" && (state.data?.session?.displayName === "Session A" || state.data?.capabilities === oldCapabilities)) staleReady = true;
        });
        let bootstraps = 0;
        PlayerApi.prototype.bootstrap = async function (...args) {
          const attempt = ++bootstraps, result = await originals.bootstrap.apply(this, args);
          if (attempt === 1 && admission === "publication") await new Promise((resolve) => { releaseOld = resolve; });
          if (attempt === 2) await new Promise((resolve) => { releaseRecovery = resolve; });
          return result;
        };
        phase = "Session B";
        const connection = scoped.terminal.connectSession({ authenticated: true, csrfToken: "B".repeat(43), gameSessionId: "session-b" });
        await wait(() => releaseOld);
        const partial = scoped.terminal.refreshResources(["dashboard"]); await wait(() => releasePartial);
        if (order === "bootstrap") { releaseOld(); await tick(); } else { releasePartial(); await partial; }
        assert(scoped.terminal.getState().status !== "ready", "partial session was promoted to ready");
        if (order === "bootstrap") { releasePartial(); await partial; } else { releaseOld(); }
        await wait(() => releaseRecovery);
        assert(!staleReady && !scoped.mount.textContent.includes("Session A"), "session A values/capabilities resurfaced");
        assert(scoped.terminal.getState().status !== "ready", "superseded bootstrap admitted partial state");
        releaseRecovery(); await connection;
        PlayerApi.prototype.bootstrap = originals.bootstrap;
        assert(scoped.terminal.getState().data.session.displayName === "Session B" && scoped.terminal.getState().data.dashboard.netWorth === 700002, "complete B snapshot missing");
        unsubscribe(); scoped.dispose(); PreviewTransport.prototype.request = transportRequest;
        records.push(`${admission}:${order}`);
      }
    } else {
      const reload = await fixture();
      let releaseWrite, posts = 0, committed = false;
      PreviewTransport.prototype.request = async function (request) {
        if (request.method === "POST") { posts++; await new Promise((resolve) => { releaseWrite = resolve; }); committed = true; }
        const response = await transportRequest.call(this, request);
        return request.endpointKey === "dashboard" ? { ...response, netWorth: committed ? 900002 : 900001 } : response;
      };
      button(reload, "notifications-read").click(); await wait(() => posts === 1);
      await reload.terminal.refresh();
      assert(reload.terminal.getState().data.dashboard.netWorth === 900001, "replacement read did not precede commit");
      releaseWrite(); await wait(() => reload.terminal.getState().data.dashboard.netWorth === 900002);
      assert(posts === 1 && !reload.freshness.isPending("dashboard"), "same-session reload lost or duplicated write invalidation");
      PreviewTransport.prototype.request = transportRequest; reload.dispose();
      const overlap = await fixture(), sameControl = button(overlap, "notifications-read");
      let secondWrite, overlapPosts = 0;
      PreviewTransport.prototype.request = async function (request) {
        if (request.method === "POST" && ++overlapPosts === 2) await new Promise((resolve) => { secondWrite = resolve; });
        return transportRequest.call(this, request);
      };
      sameControl.click(); await wait(() => overlap.mount.querySelector(".player-terminal-toast"));
      await new Promise((r) => setTimeout(r, 300));
      overlap.mount.append(sameControl); sameControl.click(); await wait(() => secondWrite);
      await new Promise((r) => setTimeout(r, 1250));
      assert(sameControl.disabled && sameControl.getAttribute("aria-busy") === "true", "old delayed restore released newer operation");
      secondWrite(); await wait(() => !sameControl.disabled);
      assert(overlapPosts === 2, "overlap changed write count");
      PreviewTransport.prototype.request = transportRequest; overlap.dispose();
      const real = await fixture();
      const refreshed = await real.terminal.refreshResources(["dashboard"]);
      assert(refreshed && real.terminal.getState().data.dashboard === refreshed.data.dashboard, "real API targeted refresh did not publish");
      const previousDashboard = real.terminal.getState().data.dashboard;
      button(real, "notifications-read").click();
      await wait(() => real.mount.querySelector(".player-terminal-toast"));
      assert(real.terminal.getState().data.dashboard !== previousDashboard, "real API post-write refresh did not publish");
      assert(!real.freshness.isPending("dashboard"), "real successful read left pending invalidation");
      real.dispose();
      for (const publisher of ["bootstrap", "loadRoute", "refreshResources", "execute"]) {
        for (const failure of [false, true]) {
          const f = await fixture(), before = f.terminal.getState().data;
          const readMethod = publisher === "execute" ? "refreshResources" : publisher;
          let reached = false;
          PlayerApi.prototype[readMethod] = async function () {
            reached = true;
            const ticket = f.freshness.capture(["dashboard"]);
            const data = { ...before, dashboard: { ...before.dashboard, staleMarker: true }, resourceStatus: { dashboard: { state: "unavailable", code: "STALE" } }, capabilities: { routes: {}, actions: {} } };
            const result = publisher === "bootstrap" ? data : { data, errors: failure ? { dashboard: { status: 401 } } : {} };
            f.freshness.track(result, ticket);
            // Invalidate after invocation returns, before consumer publication.
            await Promise.resolve();
            f.freshness.invalidate(["dashboard"]);
            if (failure) throw Object.assign(new Error("retired 401"), { status: 401 });
            return result;
          };
          if (publisher === "execute") PlayerApi.prototype.execute = async () => ({ result: {}, invalidatedResources: ["dashboard"] });
          let control;
          if (publisher === "bootstrap") await f.terminal.refresh();
          else if (publisher === "refreshResources") await f.terminal.refreshResources(["dashboard"]).catch((error) => assert(error.code === "REQUEST_SUPERSEDED", "wrong superseded error"));
          else { control = button(f, publisher === "execute" ? "notifications-read" : "refresh-data"); control.click(); await wait(() => reached); await tick(); }
          assert(reached, `${publisher} was not exercised`);
          assert(f.terminal.getState().status === "ready", `${publisher} left replacement state loading`);
          assert(f.terminal.getState().data === before, `${publisher} published stale values/status/capabilities`);
          assert(!f.terminal.getState().error && !f.terminal.getState().routeErrors.dashboard, `${publisher} published stale error`);
          assert(f.invalidSessions() === 0 && !f.mount.querySelector(".player-terminal-toast"), `${publisher} emitted retired side effects`);
          if (control) assert(!control.disabled && !control.hasAttribute("aria-busy"), "processing control leaked");
          assert(f.freshness.isPending("dashboard"), "old publication cleared new invalidation");
          Object.assign(PlayerApi.prototype, originals); f.dispose(); records.push(`${publisher}:${failure ? "401" : "value"}`);
        }
      }
      for (const publisher of ["bootstrap", "loadRoute", "refreshResources", "execute"]) {
        for (const retirement of ["session", "logout", "destroy", "remount"]) {
          const f = await fixture(), before = f.terminal.getState().data;
          let release, reached = false;
          const ticket = f.freshness.capture(["dashboard"]);
          const result = publisher === "bootstrap" ? before : publisher === "execute" ? { result: {}, invalidatedResources: ["dashboard"] } : { data: before, errors: {} };
          f.freshness.track(result, ticket);
          PlayerApi.prototype[publisher] = () => { reached = true; return new Promise((resolve) => { release = () => resolve(result); }); };
          let operation, control;
          if (publisher === "bootstrap") operation = f.terminal.refresh();
          else if (publisher === "refreshResources") operation = f.terminal.refreshResources(["dashboard"]).catch((error) => assert(error.code === "REQUEST_ABORTED", "retired read error"));
          else { control = button(f, publisher === "execute" ? "notifications-read" : "refresh-data"); control.click(); }
          await wait(() => reached); Object.assign(PlayerApi.prototype, originals);
          f.terminal.showToast("old toast");
          if (retirement === "session") await f.terminal.connectSession({ authenticated: true, csrfToken: "D".repeat(43), gameSessionId: "new-game" });
          else if (retirement === "logout") button(f, "logout").click();
          else f.terminal.destroy();
          const replacement = retirement === "remount" ? createPlayerTerminal({ mount: f.mount, config: f.config, freshness: createResourceFreshnessCoordinator() }) : null;
          release(); await operation; await tick(); await tick();
          if (control) assert(!control.disabled && !control.hasAttribute("aria-busy"), "retirement lost control restoration");
          assert(!f.mount.querySelector(".player-terminal-toast"), "retired publisher emitted a toast");
          assert(f.invalidSessions() === 0, "retired publisher invalidated session");
          if (retirement === "logout") assert(f.terminal.getState().data === before, "logout publisher wrote data");
          if (retirement === "destroy") assert(f.mount.innerHTML === "", "destroyed publisher repopulated mount");
          replacement?.destroy(); f.dispose(); records.push(`${publisher}:${retirement}`);
        }
      }
      const first = await fixture(), second = await fixture(), secondData = second.terminal.getState().data;
      const secondTicket = second.freshness.capture(["dashboard"]);
      first.terminal.destroy();
      assert(second.freshness.isCurrent(secondTicket) && second.terminal.getState().data === secondData, "terminal retirement crossed ownership");
      first.dispose(); second.dispose();
    }
    assert(listeners.size === 0, `terminal listeners retained: ${[...listeners.values()]}`);
    globalThis.addEventListener = add; globalThis.removeEventListener = remove;
    Object.assign(PlayerApi.prototype, originals);
    return records;
  }, group);
  expect(evidence).toHaveLength(group === "session isolation" ? 4 : 24);
});

for (const group of ["actions", "settlement"]) test(`default composition ${group}`, async ({ page }) => {
  await openRoute(page, "inventory");
  await page.evaluate(async (group) => {
    globalThis.Econovaria.playerTerminal.destroy();
    const { createPlayerTerminal } = await import("/src/app.js");
    const { PlayerApi } = await import("/src/api/player-api.js");
    const { previewData } = await import("/src/data/preview-data.js");
    const { installInventoryActionFlow } = await import("/src/features/inventory/inventory-action-flow.js");
    const { installPlayerInvalidationController } = await import("/src/realtime/player-invalidation-controller.js");
    const assert = (value, message) => { if (!value) throw new Error(message); };
    const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
    const wait = async (check) => { for (let i = 0; i < 200 && !check(); i++) await delay(10); assert(check(), "combined fixture did not settle"); };
    const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
    const listeners = new Set(), listenerOwners = [globalThis, document];
    const methods = listenerOwners.map((owner) => [owner.addEventListener, owner.removeEventListener]);
    listenerOwners.forEach((owner, index) => {
      owner.addEventListener = function (type, fn, options) { listeners.add(fn); return methods[index][0].call(this, type, fn, options); };
      owner.removeEventListener = function (type, fn, options) { listeners.delete(fn); return methods[index][1].call(this, type, fn, options); };
    });
    async function fixture(startup = false) {
      const mount = document.createElement("div"); document.body.append(mount);
      const requests = [], holds = new Map(); let marker = 0, write, outcome = "created";
      const config = {
        usePreviewData: false, authenticated: true, csrfToken: "C".repeat(43), gameSessionId: "fixture-game",
        deviceId: "11111111-1111-4111-8111-111111111111", publishableKey: "sb_publishable_fixture",
        requestTimeoutMs: 5000, writeCooldownMs: 0, allowedImageHosts: [], capabilities: { routes: { inventory: true }, actions: { notificationsRead: true, logout: true } },
        sessionReadyEvent: "fixture:ready", sessionRequiredEvent: "fixture:required", sessionInvalidEvent: "fixture:invalid",
        apiCall: async (context) => {
          requests.push(`${context.method}:${context.endpointKey}`);
          if (context.method === "POST") { await write.promise; if (outcome !== "replayed") marker++; return { ok: true, outcome }; }
          const value = structuredClone(previewData[context.endpointKey]);
          if (context.endpointKey === "inventory") value.marker = marker;
          const held = holds.get(context.endpointKey);
          if (held) { holds.delete(context.endpointKey); held.started = true; await held.promise; }
          return value;
        }
      };
      let first;
      if (startup) { first = deferred(); holds.set("dashboard", first); }
      config.resourceInvalidationEvent = "fixture:invalidation";
      const terminal = createPlayerTerminal({ mount, config });
      if (first) {
        const early = installPlayerInvalidationController({ mount, terminal, config, checkIntervalMs: 60000 });
        await wait(() => first.started);
        globalThis.dispatchEvent(new CustomEvent(config.resourceInvalidationEvent, { detail: { resources: ["dashboard"], gameSessionId: config.gameSessionId } }));
        first.resolve();
        await wait(() => terminal.getState().status === "ready");
        assert(requests.filter((r) => r === "GET:dashboard").length === 2 && !terminal.freshness.isPending("dashboard"), `startup did not recover complete publication: ${JSON.stringify({requests,pending:terminal.freshness.isPending("dashboard")})}`);
        early.destroy();
      }
      await wait(() => terminal.getState().status === "ready" && !terminal.getState().routeLoading.inventory);
      const flow = installInventoryActionFlow({ mount, terminal, config });
      const realtime = (checkIntervalMs = 60000) => installPlayerInvalidationController({ mount, terminal, config, checkIntervalMs });
      const controller = realtime();
      return {
        mount, config, terminal, controller, realtime, requests,
        hold(key) { const hold = deferred(); holds.set(key, hold); return hold; },
        begin(replay = false) { outcome = replay ? "replayed" : "created"; if (replay) marker = 1; write = deferred(); return write; },
        click(kind = "use") {
          const button = document.createElement("button"); button.textContent = "Original";
          button.dataset[kind === "redeem" ? "playerInventoryRedeem" : "playerInventoryEffectUse"] = "fixture-item";
          mount.append(button); button.click(); button.click(); return button;
        },
        close() { controller.destroy(); flow.destroy(); terminal.destroy(); mount.remove(); }
      };
    }
    if (group === "actions") {
      const prompt = globalThis.prompt; globalThis.prompt = () => "1";
      for (const mode of ["use", "redeem", "replay", "failed", "rejected", "race", "race401"]) {
        const f = await fixture(), other = await fixture(), otherTicket = other.terminal.freshness.capture(["inventory"]);
        const receipt = f.begin(mode === "replay"); let old;
        if (mode.startsWith("race")) {
          old = f.hold("inventory"); f.controller.refreshNow(["inventory"]); await wait(() => old.started);
        }
        f.requests.length = 0;
        const failed = mode === "failed" ? f.hold("inventory") : null;
        const button = f.click(mode === "redeem" ? "redeem" : "use");
        await wait(() => f.requests.length === 1);
        assert(button.disabled, "duplicate click escaped processing ownership");
        if (mode === "rejected") receipt.reject(Object.assign(new Error("rejected"), { status: 409 }));
        else receipt.resolve();
        if (failed) { await wait(() => failed.started); failed.reject(Object.assign(new Error("unavailable"), { status: 400 })); }
        await wait(() => !button.disabled);
        assert(f.requests.filter((r) => r.startsWith("POST:")).length === 1, "write budget");
        assert(f.requests.filter((r) => r.startsWith("GET:")).length === (mode === "rejected" ? 0 : mode === "redeem" ? 2 : 3), "targeted GET budget");
        assert(f.terminal.getState().data.inventory.marker === (["failed", "rejected"].includes(mode) ? 0 : 1), "authoritative publication");
        if (failed) assert(f.terminal.freshness.isPending("inventory"), "failed refresh lost pending");
        if (old) {
          const before = f.terminal.getState().data;
          f.terminal.freshness.invalidate(["inventory"]);
          if (mode === "race401") old.reject(Object.assign(new Error("stale session"), { status: 401 })); else old.resolve();
          await delay(30);
          assert(f.config.authenticated && f.terminal.getState().data === before, "stale read/401 changed values/status/errors/capabilities/session");
          assert(f.terminal.getState().data.inventory.marker === 1 && f.terminal.freshness.isPending("inventory"), "late realtime regressed or settled newer work");
        }
        assert(other.terminal.freshness.isCurrent(otherTicket) && other.terminal.getState().data.inventory.marker === 0, "independent terminal changed");
        assert(button.textContent === "Original", "processing label not restored");
        f.close(); other.close();
      }
      globalThis.prompt = prompt;
      for (const retirement of ["session", "abort", "destroy", "logout"]) {
        const f = await fixture(), receipt = f.begin(), button = f.click();
        await wait(() => f.requests.length && button.disabled);
        let logout, redirects = 0;
        if (retirement === "session") await f.terminal.connectSession({ authenticated: true, csrfToken: "D".repeat(43), gameSessionId: "next-game" });
        if (retirement === "abort") {
          const { abortPlayerApiSessionRequests } = await import("/src/api/player-api.js");
          abortPlayerApiSessionRequests(f.config);
        }
        if (retirement === "destroy") f.terminal.destroy();
        if (retirement === "logout") {
          const { installPlayerLogoutController } = await import("/src/integrations/player-logout-controller.js");
          f.config.logoutRequestedEvent = "fixture:logout";
          f.terminal.prepareForSessionExit = () => f.terminal.destroy();
          const runtime = { addEventListener: (...args) => globalThis.addEventListener(...args), removeEventListener: (...args) => globalThis.removeEventListener(...args),
            CustomEvent, dispatchEvent: (event) => globalThis.dispatchEvent(event), setTimeout: (...args) => globalThis.setTimeout(...args), clearTimeout: (...args) => globalThis.clearTimeout(...args), location: { href: location.href, replace: () => redirects++ } };
          logout = installPlayerLogoutController({ terminal: f.terminal, config: f.config, mount: f.mount, runtime });
          const exit = document.createElement("button"); exit.dataset.playerAction = "logout"; f.mount.append(exit); exit.click();
          await wait(() => !f.config.authenticated);
          assert(f.mount.inert && f.mount.textContent.includes("SIGNING OUT"), "logout did not secure shell");
        }
        receipt.resolve(); await wait(() => !button.disabled); await delay(150);
        assert(!f.mount.querySelector(".player-terminal-toast"), "retired action emitted toast");
        if (logout) { await wait(() => redirects === 1); logout.destroy(); }
        f.close();
      }
    } else {
      const startup = await fixture(true); startup.close();
      for (const publisher of ["bootstrap", "loadRoute", "refreshResources", "execute"]) {
        const f = await fixture(), key = ["bootstrap", "execute"].includes(publisher) ? "dashboard" : "inventory";
        const method = publisher === "execute" ? "refreshResources" : publisher;
        const original = PlayerApi.prototype[method]; let admitted = false;
        PlayerApi.prototype[method] = async function (...args) {
          const result = await original.apply(this, args);
          if (this.config === f.config) {
            assert(f.terminal.freshness.isPending(key), `${publisher} settled before publication`);
            admitted = true;
          }
          return result;
        };
        f.terminal.freshness.invalidate([key]);
        if (publisher === "bootstrap") await f.terminal.refresh();
        else if (publisher === "refreshResources") await f.terminal.refreshResources([key]);
        else {
          const receipt = publisher === "execute" ? f.begin() : null;
          const control = document.createElement("button"); control.dataset.playerAction = receipt ? "notifications-read" : "refresh-data";
          f.mount.append(control); control.click(); receipt?.resolve();
          await wait(() => admitted && !f.terminal.freshness.isPending(key)).catch((error) => { throw new Error(`${publisher}: ${error.message}`); });
        }
        assert(admitted && !f.terminal.freshness.isPending(key), `${publisher} did not settle publication`);
        PlayerApi.prototype[method] = original; f.close();
      }
      for (const order of ["success-first", "error-first", "new-generation"]) {
        const f = await fixture(), inventory = f.hold("inventory"), dashboard = f.hold("dashboard");
        const refresh = f.terminal.refreshResources(["inventory", "dashboard"]).catch((error) => error);
        await wait(() => inventory.started && dashboard.started);
        if (order === "error-first") { dashboard.reject(Object.assign(new Error("unavailable"), { status: 400 })); await delay(); }
        if (order === "error-first") assert(f.terminal.freshness.isPending("inventory"), "unresolved resource settled");
        inventory.resolve(); await delay();
        if (order !== "error-first") assert(f.terminal.freshness.isPending("inventory"), "read settled before aggregate publication");
        if (order === "new-generation") { f.terminal.freshness.invalidate(["dashboard"]); dashboard.resolve(); }
        else if (order === "success-first") dashboard.reject(Object.assign(new Error("unavailable"), { status: 400 }));
        const result = await refresh;
        assert(f.terminal.freshness.isPending("inventory") === (order === "new-generation"), "sibling pending lost");
        assert(f.terminal.freshness.isPending("dashboard"), "error/new invalidation settled");
        if (order === "new-generation") assert(result.code === "REQUEST_SUPERSEDED", "stale aggregate admitted");
        await f.terminal.refreshResources(["inventory", "dashboard"]);
        assert(!f.terminal.freshness.isPending("inventory") && !f.terminal.freshness.isPending("dashboard"), "recovery did not settle");
        f.close();
      }
      const f = await fixture(), held = f.hold("inventory");
      f.controller.refreshNow(["inventory"]); await wait(() => held.started);
      const replacement = f.realtime(500); f.controller.destroy();
      held.resolve(); await delay(20);
      assert(f.terminal.freshness.isPending("inventory"), "destroyed read settled unpublished data");
      const joined = f.hold("inventory");
      await wait(() => joined.started);
      const reading = new PlayerApi(f.config, { freshness: f.terminal.freshness, deferFreshnessSettlement: true });
      const coalesced = reading.loadResources(["inventory"], { force: true });
      const count = f.requests.length; joined.resolve(); await coalesced; await delay(20);
      assert(f.requests.length === count && !f.terminal.freshness.isPending("inventory"), "coalesced publication failed");
      replacement.destroy(); f.close();
      const ui = await fixture();
      const details = document.createElement("details"); details.dataset.playerLiveRefreshPause = "";
      details.innerHTML = '<summary>Draft</summary><form data-player-form="fixture"><textarea name="note">Retained draft</textarea></form>';
      ui.mount.append(details); details.open = true;
      const field = details.querySelector("textarea"); field.focus(); field.setSelectionRange(2, 7);
      const reads = ui.requests.length;
      ui.controller.refreshNow(["inventory"]); await delay(40);
      assert(ui.requests.length === reads && details.open && document.activeElement === field && field.selectionStart === 2 && field.selectionEnd === 7 && field.value === "Retained draft", "live update disturbed disclosure/draft/focus/selection");
      ui.terminal.openModal({ type: "connection", endpointKey: "inventory", method: "GET", path: "/inventory" });
      await delay(40);
      assert(ui.terminal.getState().modal && ui.requests.length === reads, "modal allowed realtime publication");
      ui.terminal.closeModal(); ui.close();
    }
    assert(listeners.size === 0, "composition leaked event listeners");
    listenerOwners.forEach((owner, index) => { [owner.addEventListener, owner.removeEventListener] = methods[index]; });
  }, group);
});
