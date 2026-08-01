import {
  BASE_URL,
  createQualityHarness,
  GAME_ID,
} from "./admin-quality-smoke-fixture.mjs";

const REQUEST_ID = `red_${"b".repeat(32)}`;
const CSRF_TOKEN = "C".repeat(43);
const ADMIN_URL = new URL(BASE_URL);
ADMIN_URL.searchParams.set("game", GAME_ID);

function redemption(status = "pending") {
  return {
    id: REQUEST_ID,
    itemId: "meal-pass",
    quantity: 1,
    status,
    requestNote: "Lunch reward",
    resolutionNote: status === "pending" ? null : "Approved for classroom fulfillment",
    requestedAt: "2026-07-18T12:00:00.000Z",
    reviewedAt: status === "pending" ? null : "2026-07-18T12:05:00.000Z",
    fulfilledAt: null,
    updatedAt: status === "pending" ? "2026-07-18T12:00:00.000Z" : "2026-07-18T12:05:00.000Z",
    player: {
      reference: "P-100",
      displayName: "Test Player",
      rosterLabel: "A1",
    },
    item: {
      id: "meal-pass",
      name: "Meal Pass",
      category: "consumable",
    },
  };
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "http://127.0.0.1:4173",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers":
      "apikey,content-type,x-econovaria-csrf-token,x-econovaria-device-id,x-econovaria-game-id,x-idempotency-key,x-request-id",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "cache-control": "private, no-store",
  };
}

function assertSecureBffRequest(request, errors) {
  const headers = request.headers();
  if (headers.authorization !== undefined) {
    errors.push(`${request.method()} ${request.url()} exposed Staff Authorization`);
  }
  if (!headers.apikey) {
    errors.push(`${request.method()} ${request.url()} omitted publishable application identity`);
  }
  if (headers["x-econovaria-game-id"] !== GAME_ID) {
    errors.push(`${request.method()} ${request.url()} omitted selected-game scope`);
  }
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
    headers["x-econovaria-csrf-token"] !== CSRF_TOKEN
  ) {
    errors.push(`${request.method()} ${request.url()} omitted cookie-bound CSRF`);
  }
}

async function runViewport(viewport, fullFlow) {
  const harness = await createQualityHarness(`inventory-redemption-${viewport.width}`);
  const { page, errors } = harness;
  await page.setViewportSize(viewport);
  let committed = false;
  let failRefresh = false;

  page.on("console", (message) => {
    const value = message.text();
    const expectedRefreshFailure = failRefresh && /status of 503|503 \(Service Unavailable\)/i.test(value);
    if (message.type() === "error" && !expectedRefreshFailure) errors.push(value);
  });

  await page.route("**/functions/v1/web-session-api/proxy/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!/\/inventory\/redemptions(?:\/|$)/.test(url.pathname)) {
      await route.fallback();
      return;
    }

    assertSecureBffRequest(request, errors);
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(), body: "" });
      return;
    }

    if (request.method() === "POST") {
      committed = true;
      failRefresh = true;
      const action = url.pathname.split("/").at(-1);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders(),
        body: JSON.stringify({ data: {
          outcome: "applied",
          action,
          redemption: redemption(action === "reject" ? "rejected" : action === "fulfill" ? "fulfilled" : "approved"),
          effectApplication: "not_automated",
        } }),
      });
      return;
    }

    if (failRefresh) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: corsHeaders(),
        body: JSON.stringify({
          code: "inventory_redemption_schema_not_applied",
          message: "Inventory redemption is temporarily unavailable.",
          retryable: true,
        }),
      });
      return;
    }

    const history = url.searchParams.get("status") === "all";
    const rows = history && committed ? [redemption("approved")] : [redemption("pending")];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(),
      body: JSON.stringify({ data: {
        redemptions: rows,
        requests: rows,
        summary: { returned: 999 },
        pagination: { limit: 10, offset: 0, returned: rows.length, hasMore: false },
        filters: { status: history ? "all" : "pending" },
      } }),
    });
  });

  try {
    await page.goto(ADMIN_URL.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
    await page.waitForSelector('[data-admin-section="Store"]', { timeout: 15_000 });
    await page.locator('[data-admin-section="Store"]').click();
    await page.waitForSelector("[data-admin-inventory-redemptions-open]", { timeout: 5_000 });
    await page.locator("[data-admin-inventory-redemptions-open]").click();
    await page.waitForSelector(`#adminInventoryRedemptionDrawer:not([hidden]) [data-admin-redemption-request="${REQUEST_ID}"]`, { timeout: 10_000 });

    const structure = await page.evaluate(() => ({
      drawerRole: document.getElementById("adminInventoryRedemptionDrawer")?.getAttribute("role"),
      selectedTab: document.querySelector('[data-admin-redemption-filter][aria-selected="true"]')?.getAttribute("data-admin-redemption-filter"),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      snapshot: window.EconovariaAdminInventoryRedemptionQueue?.snapshot?.(),
    }));
    if (structure.drawerRole !== "dialog") throw new Error("Redemption drawer dialog semantics are missing.");
    if (structure.selectedTab !== "pending") throw new Error("Pending filter was not selected.");
    if (structure.documentWidth > structure.viewportWidth + 2) throw new Error(`Redemption drawer overflows at ${viewport.width}px.`);
    if (structure.snapshot?.returned !== 1) throw new Error("Redemption queue did not expose one validated request.");

    if (fullFlow) {
      await page.locator('[data-admin-redemption-review="approve"]').click();
      const modal = page.locator('[data-modal-id="inventory-redemption-review"]');
      await modal.waitFor({ state: "visible", timeout: 5_000 });
      if (await modal.locator('[role="dialog"][aria-modal="true"]').count() !== 1) {
        throw new Error("Approve confirmation is not an accessible modal dialog.");
      }
      await modal.locator('textarea[name="note"]').fill("Approved for classroom fulfillment");
      await modal.locator('button[type="submit"]').click();
      await modal.waitFor({ state: "detached", timeout: 10_000 });
      await page.waitForFunction(() => {
        const snapshot = window.EconovariaAdminInventoryRedemptionQueue?.snapshot?.();
        return snapshot?.stale === true && Boolean(snapshot?.success);
      }, null, { timeout: 10_000 });
      const committedState = await page.evaluate((requestId) => ({
        snapshot: window.EconovariaAdminInventoryRedemptionQueue.snapshot(),
        live: document.querySelector("[data-admin-redemption-status]")?.textContent || "",
        requestStillVisible: Boolean(document.querySelector(`[data-admin-redemption-request="${requestId}"]`)),
      }), REQUEST_ID);
      if (!committedState.snapshot.success.toLowerCase().includes("approve")) {
        throw new Error("Committed success was not retained after refresh failure.");
      }
      if (!committedState.live.toLowerCase().includes("refresh failed")) {
        throw new Error("Stale refresh failure was not surfaced after committed success.");
      }
      if (committedState.requestStillVisible) {
        throw new Error("Approved request was not optimistically removed from the pending queue.");
      }
    }

    await page.locator('[data-admin-section="Overview"]').click();
    await page.waitForTimeout(700);
    const closed = await page.evaluate(() => ({
      drawerHidden: document.getElementById("adminInventoryRedemptionDrawer")?.hidden === true,
      launchPresent: Boolean(document.querySelector("[data-admin-inventory-redemptions-open]")),
    }));
    if (!closed.drawerHidden || closed.launchPresent) throw new Error("Queue surface did not close when leaving Store.");
    if (errors.length) throw new Error(errors[0]);
  } catch (error) {
    await harness.capture(`inventory-redemption-failure-${viewport.width}`).catch(() => {});
    throw error;
  } finally {
    await harness.finish({ viewport, fullFlow, committed, failRefresh });
  }
}

await runViewport({ width: 1440, height: 1000 }, true);
await runViewport({ width: 1024, height: 768 }, false);
await runViewport({ width: 768, height: 900 }, false);
console.log("Admin inventory redemption queue browser smoke passed at desktop, compact, and narrow widths.");
