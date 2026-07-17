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
  if (/stopImmediatePropagation|NUMERIC_EDITOR_SELECTOR|deferredNumericControls/.test(bridgeText)) {
    throw new Error("Settings error bridge still owns numeric input propagation.");
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
  console.log("Shared Settings state preserves native events, focus, save feedback, and disclosure state.");
  await finish({ afterOption, duringNumericEdit, errors });
} catch (error) {
  await capture("settings-disclosure-failure").catch(() => {});
  await finish({ failure: error.stack || error.message || String(error) });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}
