import { createQualityHarness, BASE_URL } from "./admin-quality-smoke-fixture.mjs";

const harness = await createQualityHarness("settings-disclosure");
const { page, errors, capture, finish } = harness;

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.waitForFunction(() => {
    const root = document.querySelector(".admin-terminal-settings-page");
    return root?.getAttribute("data-settings-ux-ready") === "true" &&
      root?.getAttribute("data-settings-ux-baseline-ready") === "true";
  }, null, { timeout: 10_000 });

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

  await capture("settings-disclosure-persistence");
  if (errors.length) throw new Error(errors[0]);
  console.log("Custom Settings disclosure remains open across option changes and Settings rerenders.");
  await finish({ afterOption, errors });
} catch (error) {
  await capture("settings-disclosure-failure").catch(() => {});
  await finish({ failure: error.stack || error.message || String(error) });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}
