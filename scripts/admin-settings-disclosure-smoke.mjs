import { createQualityHarness, BASE_URL } from "./admin-quality-smoke-fixture.mjs";

const harness = await createQualityHarness("settings-disclosure");
const { page, errors, capture, finish } = harness;
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
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".admin-terminal-settings-page")
    ?.getAttribute("data-settings-ux-baseline-ready") === "true", null, { timeout: 10_000 });
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
  await capture("settings-disclosure-persistence");
  if (errors.length) throw new Error(errors[0]);
  console.log("Shared Settings preserves native events, focus, save state, disclosure, and domain boundaries.");
  await finish({ afterOption, duringNumericEdit, ref014Writes, errors });
  clearTimeout(deadline);
} catch (error) {
  console.error(`Settings browser failure during ${phase}:`, error.stack || error.message || String(error));
  for (const release of [...releases]) release();
  const bounded = (operation) => Promise.race([operation, new Promise((resolve) => setTimeout(resolve, 5000))]);
  await bounded(capture("settings-disclosure-failure").catch(() => {}));
  await bounded(finish({ phase, failure: error.stack || error.message || String(error) }).catch(() => {}));
  process.exitCode = 1;
}
