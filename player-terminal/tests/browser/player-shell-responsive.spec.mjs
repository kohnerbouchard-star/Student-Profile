import { expect, test } from "@playwright/test";

async function activateByKeyboard(page, control) {
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  // Hold the same DOM node throughout the interaction. A locator could resolve
  // to its replacement after a shell paint and hide the interrupted focus.
  const target = await control.elementHandle();
  try {
    await target.focus();
    const focused = await target.evaluate((button) => {
      globalThis.shellKeyboardEvidence = null;
      document.addEventListener("keydown", (event) => {
        globalThis.shellKeyboardEvidence = {
          key: event.key,
          trusted: event.isTrusted,
          onOriginalControl: event.target === button && document.activeElement === button && button.isConnected,
        };
      }, { capture: true, once: true });
      return button.isConnected && button.tabIndex >= 0 && document.activeElement === button;
    });
    expect(focused, "The original control must still own focus and be in tab order").toBe(true);
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => globalThis.shellKeyboardEvidence)).toEqual({
      key: "Enter",
      trusted: true,
      onOriginalControl: true,
    });
  } finally {
    await target.dispose();
  }
}

async function expectCurrentSection(page, group, section, route) {
  const content = page.getByRole("main");
  await expect(page).toHaveURL(new RegExp(`#${route}$`));
  await expect(content.locator(`[data-page="${route}"]`)).toBeVisible();
  const context = content.getByRole("navigation", { name: `${group} sections` });
  await expect(context).toBeVisible();
  await expect(context.getByRole("button", { name: section, exact: true })).toHaveAttribute("aria-current", "page");
  // The hash and the next context nav can appear before the route read and
  // queued focus frame finish. Start the next interaction only after both.
  await expect.poll(() => page.evaluate(async (expectedRoute) => {
    function currentMain() {
      const state = globalThis.Econovaria?.playerTerminal?.getState();
      if (state?.status !== "ready" || state.route !== expectedRoute || state.routeLoading[expectedRoute] !== false) return null;
      const main = document.getElementById("player-main-content");
      return main?.querySelector(`[data-page="${expectedRoute}"]`) ? main : null;
    }
    const main = currentMain();
    if (!main) return false;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return main === currentMain();
  }, route), { message: `Wait for the installed ${section} route and shell paint` }).toBe(true);
}

for (const width of [860, 861]) {
  test(`Player shell switches navigation at ${width}px and keeps Market and Business keyboard reachable`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Exact CSS viewport boundary runs once in desktop Chromium.");
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      globalThis.ECONOVARIA_PLAYER_TERMINAL_CONFIG = {
        usePreviewData: true,
        preserveProductSurface: true,
      };
    });
    await page.goto("/?preview=1#market");
    await expectCurrentSection(page, "Finance", "Market", "market");

    const sidebar = page.locator('aside[aria-label="Player terminal navigation"]');
    const mobile = page.locator('nav[aria-label="Mobile primary navigation"]');
    const compact = width === 860;
    const active = compact ? mobile : sidebar;
    const inactive = compact ? sidebar : mobile;

    // Check that the expected element exists but is hidden, rather than letting a missing control pass.
    await expect(inactive).toHaveCount(1);
    await expect(inactive).toBeHidden();
    await expect(active).toBeVisible();
    await expect(active.getByRole("button", { name: "Finance", exact: true })).toHaveAttribute("aria-current", "page");
    await expect.poll(() => page.evaluate(() => ({
      width: window.innerWidth,
      compact: window.matchMedia("(max-width: 860px)").matches,
    }))).toEqual({ width, compact });

    await activateByKeyboard(page, active.getByRole("button", { name: "Work", exact: true }));
    await expectCurrentSection(page, "Work", "Contracts", "contracts");
    const work = page.getByRole("main").getByRole("navigation", { name: "Work sections" });
    await activateByKeyboard(page, work.getByRole("button", { name: "Business", exact: true }));
    await expectCurrentSection(page, "Work", "Business", "business");
    await expect(active.getByRole("button", { name: "Work", exact: true })).toHaveAttribute("aria-current", "page");

    await activateByKeyboard(page, active.getByRole("button", { name: "Finance", exact: true }));
    await expectCurrentSection(page, "Finance", "Market", "market");
  });
}
