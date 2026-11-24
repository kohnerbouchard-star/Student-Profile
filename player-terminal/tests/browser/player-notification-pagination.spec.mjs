import { expect, test } from "@playwright/test";

const FIXTURE_PATH = "/notification-pagination-fixture";
const PROCESSED_AT = "2026-11-22T02:00:00.000Z";
const OUTCOME_UNCONFIRMED = /Mark read outcome not confirmed/;
const deliveryId = (index) => `ndl_${String(index).padStart(32, "0")}`;

async function mount(page, { read = true, write = true, expectedRows = 20 } = {}) {
  const localFixture = new URL(FIXTURE_PATH, "http://127.0.0.1:4173");
  await page.route("**/*", (route) => {
    const target = new URL(route.request().url());
    if (target.origin !== localFixture.origin) return route.abort("blockedbyclient");
    if (target.pathname !== localFixture.pathname) return route.continue();
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en"><head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Player notification fixture</title>
        <link rel="stylesheet" href="/css/player-terminal-recovery-base.css">
        <link rel="stylesheet" href="/css/player-terminal-recovery-core.css">
        <link rel="stylesheet" href="/css/player-terminal-recovery-ux.css">
        <link rel="stylesheet" href="/css/player-terminal-recovery-polish.css">
        <link rel="stylesheet" href="/css/player-terminal-recovery-normalization.css">
        <link rel="stylesheet" href="/css/player-terminal-tokens.css">
        <link rel="stylesheet" href="/css/player-terminal-foundation.css">
        <link rel="stylesheet" href="/css/player-terminal-recovery-shell-compat.css">
        <link rel="stylesheet" href="/css/routes/player-terminal-shared-layout.css">
        <link rel="stylesheet" href="/css/routes/player-terminal-shared-cards.css">
        <link rel="stylesheet" href="/css/routes/player-terminal-shared-lists.css">
        <link rel="stylesheet" href="/css/routes/player-terminal-shared-states.css">
        <link rel="stylesheet" href="/css/routes/player-terminal-shared-details.css">
        <link rel="stylesheet" href="/css/routes/player-terminal-shared-responsive.css">
        <link rel="stylesheet" href="/css/routes/player-terminal-shared-overlays.css">
        <link rel="stylesheet" href="/css/player-terminal-recovery-route-compat.css">
        <link rel="stylesheet" href="/css/routes/player-terminal-dashboard.css">
        <link rel="stylesheet" href="/css/player-terminal-skeletons.css">
        <link rel="stylesheet" href="/css/player-terminal-skeleton-geometry.css">
        <link rel="stylesheet" href="/css/player-terminal-recovery.css">
        <link rel="stylesheet" href="/css/player-story-cutscene.css">
        <link rel="stylesheet" href="/css/player-world-runtime.css">
        <link rel="stylesheet" href="/css/player-terminal-interior-v2.css">
        <link rel="stylesheet" href="/css/player-terminal-finance-v2.css">
        <link rel="stylesheet" href="/css/player-terminal-communications-v2.css">
        <link rel="stylesheet" href="/css/player-terminal-economy-items-v2.css">
        <link rel="stylesheet" href="/css/player-terminal-operations-v2.css">
        <link rel="stylesheet" href="/css/player-terminal-business-v2.css">
        <link rel="stylesheet" href="/css/player-terminal-world-v2.css">
        <link rel="stylesheet" href="/css/business-phase12-touch-targets.css">
      </head><body><div id="fixture"></div></body></html>`,
    });
  });
  await page.goto(`${FIXTURE_PATH}#dashboard`);
  await page.clock.install({ time: new Date(PROCESSED_AT) });
  await page.evaluate(async ({ processedAt, read, write }) => {
    const { createPlayerTerminal } = await import("/src/app.js");
    const { buildPlayerTerminalConfig } = await import("/src/config/player-terminal.config.js");
    const { previewData } = await import("/src/data/preview-data.js");
    const { resolvePlayerBackendRequest } = await import("/src/api/backend-routes.js");
    const { installNotificationInboxFlow } = await import("/src/features/notifications/notification-inbox-flow.js");
    const { validateStudentProfileCapabilityManifest } = await import("/src/integrations/student-profile-capability-manifest.js");
    const data = structuredClone(previewData);
    const manifest = validateStudentProfileCapabilityManifest({
      schemaVersion: 1,
      service: "classroom-api",
      manifestVersion: "fixture",
      capabilities: { routes: { dashboard: true }, actions: { notificationsRead: write } },
      endpoints: [
        { key: "dashboard", operations: [{ method: "GET", pathTemplate: "/players/me/dashboard" }] },
        ...(read ? [{ key: "notifications", operations: [{ method: "GET", pathTemplate: "/players/me/notifications" }] }] : []),
        ...(write ? [{ key: "notificationsRead", operations: [{ method: "POST", pathTemplate: "/players/me/notifications/read" }] }] : []),
      ],
    });
    Object.assign(data.session, {
      capabilities: manifest.capabilities,
      capabilityEndpointKeys: manifest.endpoints.map((endpoint) => endpoint.key),
    });
    data.notifications = [];
    const ids = (index) => String(index).padStart(32, "0");
    const fixtureRows = Array.from({ length: 65 }, (_, offset) => ({
      deliveryId: `ndl_${ids(offset + 1)}`,
      notificationId: `ntf_${ids(offset + 1)}`,
      sourceType: "attendance",
      title: `Fixture alert ${offset + 1}`,
      summary: "Synthetic unread notification.",
      status: "unread",
    }));
    const fixture = {
      reads: [], writes: [], invalidReceipt: false, heldWrite: false, releaseWrite: null,
      removed: new Set(), readFailuresRemaining: 0,
    };
    const config = buildPlayerTerminalConfig({
      usePreviewData: false,
      authenticated: true,
      csrfToken: "B".repeat(43),
      gameSessionId: "notification-pagination-fixture",
      writeCooldownMs: 0,
      apiCall: async (context) => {
        if (context.endpointKey === "notificationsPage") {
          const request = resolvePlayerBackendRequest(context);
          const url = new URL(request.path, location.origin);
          const cursor = url.searchParams.get("cursor");
          if (request.method !== "GET" || url.pathname !== "/players/me/notifications") throw new Error("Unexpected inbox read");
          fixture.reads.push({ cursor, limit: Number(url.searchParams.get("limit")), status: url.searchParams.get("status") });
          if (fixture.readFailuresRemaining > 0) {
            fixture.readFailuresRemaining -= 1;
            throw Object.assign(new Error("Synthetic inbox outage"), { status: 503, code: "SERVICE_UNAVAILABLE" });
          }
          if (cursor !== null && !/^next-[1-9][0-9]?$/.test(cursor)) throw new Error("Unexpected mock cursor");
          const start = cursor === null ? 0 : Number(cursor.slice(5));
          const candidates = fixtureRows.slice(start).filter((item) => !fixture.removed.has(item.deliveryId));
          const items = candidates.slice(0, 20);
          const hasMore = candidates.length > items.length;
          return {
            items,
            page: { returned: items.length, hasMore, nextCursor: hasMore ? `next-${fixtureRows.indexOf(items.at(-1)) + 1}` : null },
            summary: { unreadCount: 65 - fixture.removed.size },
          };
        }
        if (context.endpointKey === "notificationsRead") {
          const request = resolvePlayerBackendRequest(context);
          const { deliveryIds } = request.payload;
          fixture.writes.push({ method: request.method, path: request.path, payload: request.payload });
          if (fixture.heldWrite) await new Promise((resolve) => { fixture.releaseWrite = resolve; });
          const deliveries = deliveryIds.map((deliveryId) => {
            const row = fixtureRows.find((item) => item.deliveryId === deliveryId);
            return { deliveryId, notificationId: row.notificationId, seenAt: processedAt };
          });
          // The simulated service may have committed even if its response
          // loses a delivery row. Only the next GET can reconcile that case.
          deliveryIds.forEach((deliveryId) => fixture.removed.add(deliveryId));
          return {
            ok: true, requestedCount: deliveryIds.length, newlyReadCount: deliveryIds.length - 1,
            alreadyReadCount: 1, processedAt, deliveries: fixture.invalidReceipt ? deliveries.slice(1) : deliveries,
          };
        }
        if (context.method !== "GET" || !Object.hasOwn(data, context.endpointKey)) throw new Error("Unexpected fixture command");
        return structuredClone(data[context.endpointKey]);
      },
    });
    const mount = document.querySelector("#fixture");
    fixture.terminal = createPlayerTerminal({ mount, config });
    fixture.inbox = installNotificationInboxFlow({ mount, terminal: fixture.terminal, config });
    window.notificationPagination = fixture;
  }, { processedAt: PROCESSED_AT, read, write });
  await expect.poll(() => page.evaluate(() => window.notificationPagination.terminal.getState().status)).toBe("ready");
  await expect(page.locator('#player-main-content [data-page="dashboard"]')).toBeVisible();
  expect(await page.evaluate(() => window.notificationPagination.reads)).toEqual([]);
  await page.getByRole("button", { name: /^Open notifications/ }).click();
  const drawer = page.getByRole("region", { name: "Player notifications" });
  await expect(drawer.locator("[data-player-notification-id]")).toHaveCount(expectedRows);
  return drawer;
}

async function expectReachableDrawer(drawer) {
  await expect.poll(() => drawer.evaluate((host) => ({
    scrolls: host.scrollHeight > host.clientHeight && getComputedStyle(host).overflowY === "auto",
    fitsViewport: host.getBoundingClientRect().bottom <= window.innerHeight + 1,
  }))).toEqual({ scrolls: true, fitsViewport: true });
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    const fixture = window.notificationPagination;
    fixture?.inbox?.destroy();
    fixture?.terminal?.destroy();
  });
});

test("a validated GET-only manifest opens Player Alerts without mark-read authority", async ({ page }) => {
  const drawer = await mount(page, { write: false });
  await expect(drawer.getByText("Fixture alert 1", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Mark loaded alerts read", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => ({
    reads: window.notificationPagination.reads, writes: window.notificationPagination.writes,
  }))).toEqual({ reads: [{ cursor: null, limit: 20, status: "unread" }], writes: [] });
});

test("a validated manifest without either descriptor cannot read or mark Player Alerts", async ({ page }) => {
  const drawer = await mount(page, { read: false, write: false, expectedRows: 0 });
  await expect(drawer.getByText("Notifications are unavailable for this session.", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Refresh newest alerts", exact: true })).toBeDisabled();
  await expect(drawer.getByRole("button", { name: "Mark loaded alerts read", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => ({
    reads: window.notificationPagination.reads, writes: window.notificationPagination.writes,
  }))).toEqual({ reads: [], writes: [] });
});

test("Player alert pages survive a timed poll and shell paint; mark read sends at most 50 and preserves the tail", async ({ page }) => {
  const drawer = await mount(page);
  const notices = drawer.locator("[data-player-notification-id]");
  const more = drawer.getByRole("button", { name: "Load more", exact: true });
  await expectReachableDrawer(drawer);
  const reads = () => page.evaluate(() => window.notificationPagination.reads);
  // Prove the real 15-second interval is active before loading older pages.
  await page.clock.runFor(15_000);
  await expect.poll(async () => (await reads()).length).toBe(2);
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(notices).toHaveCount(40);
  await expect(more).toBeFocused();
  await more.click();
  await expect(notices).toHaveCount(60);
  expect(await reads()).toEqual([null, null, "next-20", "next-40"].map((cursor) => ({ cursor, limit: 20, status: "unread" })));

  await page.clock.runFor(15_000);
  expect(await reads()).toHaveLength(4);
  await expect(notices).toHaveCount(60);
  await expect(more).toBeFocused();
  await page.evaluate(() => window.notificationPagination.terminal.requestRender());
  await expect(notices).toHaveCount(60);
  await expect(drawer.locator(`[data-player-notification-id="${deliveryId(60)}"]`)).toBeAttached();

  const boundedMark = drawer.getByRole("button", { name: "Mark first 50 loaded alerts read", exact: true });
  await page.evaluate(() => { window.notificationPagination.heldWrite = true; });
  await boundedMark.focus();
  await page.keyboard.press("Enter");
  const writes = () => page.evaluate(() => window.notificationPagination.writes);
  await expect.poll(async () => (await writes()).length).toBe(1);
  await expect(notices).toHaveCount(60);
  const marking = drawer.locator("[data-player-notification-mark-read]");
  await expect(marking).toHaveText("Marking read…");
  await expect(marking).toHaveAttribute("aria-disabled", "true");
  await expect(marking).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await writes()).toEqual([{
    method: "POST",
    path: "/players/me/notifications/read",
    payload: { deliveryIds: Array.from({ length: 50 }, (_, offset) => deliveryId(offset + 1)) },
  }]);

  await page.evaluate(() => window.notificationPagination.releaseWrite());
  await expect(notices).toHaveCount(10);
  await expect(drawer).toContainText("65 Unread (last checked)");
  await expect(drawer.getByRole("status")).toHaveText("50 loaded alerts confirmed read. The total is from the last check.");
  await expect(drawer.getByRole("button", { name: "Mark loaded alerts read", exact: true })).toBeFocused();
  await expect(drawer.locator(`[data-player-notification-id="${deliveryId(51)}"]`)).toBeAttached();
  await more.click();
  await expect(notices).toHaveCount(15);
  expect((await reads()).at(-1)?.cursor).toBe("next-60");
  await expect(more).toHaveCount(0);
  await expect(drawer).toBeFocused();
});

test("an incomplete 50-alert receipt retains all 60 loaded notices through a failed recheck", async ({ page }) => {
  const drawer = await mount(page);
  const notices = drawer.locator("[data-player-notification-id]");
  const more = drawer.getByRole("button", { name: "Load more", exact: true });
  await expectReachableDrawer(drawer);
  await more.click();
  await expect(notices).toHaveCount(40);
  await more.click();
  await expect(notices).toHaveCount(60);
  await page.evaluate(() => { window.notificationPagination.invalidReceipt = true; });
  const mark = drawer.getByRole("button", { name: "Mark first 50 loaded alerts read", exact: true });
  await mark.click();
  await expect(drawer.getByRole("status").filter({ hasText: OUTCOME_UNCONFIRMED })).toBeVisible();
  await expect(notices).toHaveCount(60);
  await expect(mark).toBeDisabled();
  await expect(drawer).toContainText("65 Unread (last checked)");
  const transcript = () => page.evaluate(() => ({
    cursors: window.notificationPagination.reads.map(({ cursor }) => cursor),
    writes: window.notificationPagination.writes,
  }));
  const write = {
    method: "POST",
    path: "/players/me/notifications/read",
    payload: { deliveryIds: Array.from({ length: 50 }, (_, offset) => deliveryId(offset + 1)) },
  };
  const initial = [null, "next-20", "next-40"];
  expect(await transcript()).toEqual({ cursors: initial, writes: [write] });

  const refresh = drawer.getByRole("button", { name: "Refresh newest alerts", exact: true });
  await page.evaluate(() => { window.notificationPagination.readFailuresRemaining = 2; });
  await refresh.click();
  await expect.poll(async () => (await transcript()).cursors.length).toBeGreaterThanOrEqual(4);
  // AdapterTransport performs one 75 ms retry on a GET 503.
  await page.clock.runFor(100);
  await expect(drawer.getByRole("status").filter({ hasText: /temporarily unavailable/ })).toBeVisible();
  await expect(drawer.getByRole("status").filter({ hasText: OUTCOME_UNCONFIRMED })).toBeVisible();
  await expect(notices).toHaveCount(60);
  await expect(mark).toBeDisabled();
  await expect(refresh).toBeFocused();
  expect(await transcript()).toEqual({ cursors: [...initial, null, null], writes: [write] });

  await refresh.click();
  await expect(drawer).not.toContainText(OUTCOME_UNCONFIRMED);
  await expect(drawer.getByRole("button", { name: "Mark loaded alerts read", exact: true })).toBeEnabled();
  await expect(notices).toHaveCount(15);
  await expect(notices.first()).toHaveAttribute("data-player-notification-id", deliveryId(51));
  await expect(drawer).toContainText("15 Unread");
  await expect(drawer).not.toContainText("last checked");
  await expect(refresh).toBeFocused();
  expect(await transcript()).toEqual({ cursors: [...initial, null, null, null], writes: [write] });
});
