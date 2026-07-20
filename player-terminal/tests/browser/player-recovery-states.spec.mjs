import { expect, test } from "@playwright/test";

async function openTerminal(page, route = "store") {
  await page.goto(`/#${route}`);
  await expect(page.locator("#player-main-content")).toBeVisible();
  await expect(page.locator(".player-terminal-page")).toBeVisible();
}

test("offline recovery preserves visible data and pauses economic actions", async ({ page, context }) => {
  await openTerminal(page, "store");
  const purchase = page.locator("[data-player-purchase]:not([disabled])").first();
  await expect(purchase).toBeVisible();

  await context.setOffline(true);
  const notice = page.locator("[data-player-recovery-region]");
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute("role", "alert");
  await expect(notice).toContainText("OFFLINE · READ ONLY");
  await expect(notice).toContainText("Previously loaded information remains visible");
  await expect(purchase).toBeDisabled();
  await expect(page.locator(".player-terminal-store-card").first()).toBeVisible();

  await context.setOffline(false);
  await expect(notice).toContainText("CONNECTION RESTORED");
  await expect(purchase).toBeEnabled();
});

test("ambiguous idempotent write offers the same UI action instead of claiming failure", async ({ page }) => {
  await openTerminal(page, "store");
  const purchase = page.locator("[data-player-purchase]:not([disabled])").first();
  const selector = `[data-player-purchase="${await purchase.getAttribute("data-player-purchase")}"]`;

  await page.evaluate(({ selector }) => {
    window.dispatchEvent(new CustomEvent("econovaria:player-operation-state", {
      detail: {
        phase: "failed",
        endpointKey: "storePurchase",
        method: "POST",
        idempotentWrite: true,
        operationLabel: "the Store purchase",
        retryTargetSelector: selector,
        error: { status: 0, code: "NETWORK_ERROR", retryAfterMs: 0 }
      }
    }));
  }, { selector });

  const notice = page.locator("[data-player-recovery-region]");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("OUTCOME NOT CONFIRMED");
  await expect(notice).toContainText("idempotency key");
  const retry = notice.getByRole("button", { name: "Retry the same action" });
  await retry.click();
  await expect(page.locator('[aria-labelledby="storePurchaseModalTitle"]')).toBeVisible();
});

test("rate-limit recovery honors retry timing", async ({ page }) => {
  await openTerminal(page, "store");
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("econovaria:player-operation-state", {
      detail: {
        phase: "failed",
        endpointKey: "storePurchase",
        method: "POST",
        idempotentWrite: true,
        operationLabel: "the Store purchase",
        retryTargetSelector: "[data-player-purchase]",
        error: { status: 429, code: "RATE_LIMITED", retryAfterMs: 1200 }
      }
    }));
  });

  const notice = page.locator("[data-player-recovery-region]");
  await expect(notice).toContainText("REQUEST LIMITED");
  const retry = notice.locator("button");
  await expect(retry).toBeDisabled();
  await expect(retry).toContainText(/Retry in [12]s/);
  await expect(retry).toBeEnabled({ timeout: 3500 });
  await expect(retry).toHaveText("Retry the same action");
});

test("confirmed success with a failed refresh remains a success state", async ({ page }) => {
  await openTerminal(page, "dashboard");
  await page.evaluate(() => {
    const toast = document.createElement("div");
    toast.className = "player-terminal-toast is-amber";
    toast.textContent = "Action completed. Some information will refresh when the service is available.";
    document.getElementById("playerTerminal").append(toast);
  });

  const notice = page.locator("[data-player-recovery-region]");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("ACTION COMPLETED");
  await expect(notice).toContainText("completed successfully");
  await expect(notice.getByRole("button", { name: "Refresh current information" })).toBeVisible();
});
