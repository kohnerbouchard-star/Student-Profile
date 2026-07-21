import { expect, test } from "@playwright/test";

const DELIVERY_REQUIRED = "ndl_00000000000000000000000000000001";
const DELIVERY_OPTIONAL = "ndl_00000000000000000000000000000002";
const NOW = "2026-07-20T03:00:00.000Z";

function story(deliveryId, required) {
  return {
    deliveryId,
    notificationId: `ntf_${deliveryId.slice(4)}`,
    category: "story",
    title: required ? "Required story briefing" : "Optional story briefing",
    summary: "A bounded story update is ready.",
    priority: "major",
    displayMode: "modal_on_next_login",
    publishedAt: NOW,
    deliveredAt: NOW,
    seenAt: null,
    acknowledgedAt: null,
    requiresAcknowledgement: required,
    content: { videoAssetKey: "missing-safe-asset", posterAssetKey: null, tone: "briefing", act: 1, sequence: 1 },
  };
}

async function installConnectedStory(page, item, options = {}) {
  await page.goto("/#dashboard");
  await expect(page.locator("#player-main-content")).toBeVisible();
  await page.locator("#player-main-content").focus();
  await page.evaluate(async ({ item, failAction }) => {
    const { installStoryDeliveryFlow } = await import("/src/features/notifications/story-delivery-flow.js");
    const terminal = window.Econovaria.playerTerminal;
    const mount = document.getElementById("playerTerminal");
    window.__storyWrites = [];
    window.__storyInvalid = null;
    window.addEventListener("test-story-session-invalid", (event) => { window.__storyInvalid = event.detail; });
    window.__storyController?.destroy?.();
    window.__storyController = installStoryDeliveryFlow({
      mount,
      terminal,
      runtime: window,
      config: {
        usePreviewData: false,
        playerSessionToken: "browser-session-token",
        playerSessionId: "browser-session-id",
        gameSessionId: "00000000-0000-4000-8000-000000000001",
        sessionInvalidEvent: "test-story-session-invalid",
        storyMediaAssets: {},
      },
      api: {
        setSession() {},
        async request() { return { items: [item] }; },
        async execute(_key, payload, params) {
          window.__storyWrites.push({ action: payload.action, deliveryId: params.deliveryId });
          if (failAction && payload.action === failAction) throw Object.assign(new Error("expired"), { status: 401, code: "player_session_expired" });
          return { result: { ok: true, action: payload.action, delivery: {
            deliveryId: params.deliveryId,
            notificationId: item.notificationId,
            deliveredAt: item.deliveredAt,
            seenAt: new Date().toISOString(),
            dismissedAt: payload.action === "dismissed" ? new Date().toISOString() : null,
            acknowledgedAt: payload.action === "acknowledged" ? new Date().toISOString() : null,
            requiresAcknowledgement: item.requiresAcknowledgement,
          } } };
        },
      },
    });
  }, { item, failAction: options.failAction || "" });
  await expect(page.locator(".player-story-cutscene-modal[role=dialog]")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__storyWrites?.map((entry) => entry.action) || [])).toContain("seen");
}

test("required cutscene traps focus, blocks Escape, and restores focus after acknowledgement", async ({ page }) => {
  await installConnectedStory(page, story(DELIVERY_REQUIRED, true));
  const dialog = page.locator(".player-story-cutscene-modal[role=dialog]");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute("aria-labelledby", "storyCutsceneTitle");
  await expect(dialog).toHaveAttribute("aria-describedby", "storyCutsceneSummary");
  await expect(dialog).not.toContainText("playerUuid");
  const action = dialog.locator('[data-player-story-action="acknowledged"]');
  await expect(action).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(action).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("Acknowledge");
  await action.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#player-main-content")).toBeFocused();
  const writes = await page.evaluate(() => window.__storyWrites);
  expect(writes.map((entry) => entry.action)).toEqual(["seen", "acknowledged"]);
});

test("optional cutscene dismisses through Escape and backdrop on desktop and mobile", async ({ page }) => {
  await installConnectedStory(page, story(DELIVERY_OPTIONAL, false));
  await page.keyboard.press("Escape");
  await expect(page.locator(".player-story-cutscene-modal")).toHaveCount(0);
  let writes = await page.evaluate(() => window.__storyWrites);
  expect(writes.map((entry) => entry.action)).toEqual(["seen", "dismissed"]);

  await installConnectedStory(page, story(DELIVERY_OPTIONAL, false));
  await page.locator("[data-player-modal-backdrop]").click({ position: { x: 2, y: 2 } });
  await expect(page.locator(".player-story-cutscene-modal")).toHaveCount(0);
  writes = await page.evaluate(() => window.__storyWrites);
  expect(writes.map((entry) => entry.action)).toEqual(["seen", "dismissed"]);
});

test("session expiry closes the cutscene and emits a safe invalid-session event", async ({ page }) => {
  await installConnectedStory(page, story(DELIVERY_REQUIRED, true), { failAction: "acknowledged" });
  await page.locator('[data-player-story-action="acknowledged"]').click();
  await expect(page.locator(".player-story-cutscene-modal")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__storyInvalid?.code || "")).toBe("player_session_expired");
});
