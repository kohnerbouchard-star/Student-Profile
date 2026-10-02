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

test("optional terminal freshness fences final publishers and retired lifecycle effects", async ({ page }) => {
  await openRoute(page, "dashboard");
  const evidence = await page.evaluate(async () => {
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
      const freshness = createResourceFreshnessCoordinator();
      let invalidSessions = 0;
      const config = { usePreviewData: true, simulatePreviewWrites: true, sessionReadyEvent: "fixture:session", onSessionInvalid: () => invalidSessions++ };
      const terminal = createPlayerTerminal({ mount, config, freshness });
      await wait(() => terminal.getState().status === "ready" && !terminal.getState().routeLoading.dashboard);
      return { mount, freshness, terminal, config, invalidSessions: () => invalidSessions, dispose() { terminal.destroy(); mount.remove(); } };
    }
    function button(f, action) {
      const node = document.createElement("button"); node.dataset.playerAction = action; node.textContent = "Original"; f.mount.append(node); return node;
    }
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
          // API has settled; invalidate before its consumer's await continuation.
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
    assert(listeners.size === 0, `terminal listeners retained: ${[...listeners.values()]}`);
    globalThis.addEventListener = add; globalThis.removeEventListener = remove;
    Object.assign(PlayerApi.prototype, originals);
    return records;
  });
  expect(evidence).toHaveLength(24);
});
