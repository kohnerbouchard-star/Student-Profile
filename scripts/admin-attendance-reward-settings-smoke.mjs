import { writeFileSync } from "node:fs";
import { createQualityHarness, BASE_URL, GAME_ID } from "./admin-quality-smoke-fixture.mjs";

const SECOND_GAME_ID = "00000000-0000-4000-8000-000000000099";
const harness = await createQualityHarness("attendance-reward-settings");
const { page, writes, errors, capture, finish } = harness;
let rejectSettingsRead = false;

async function switchFixtureGame(gameId) {
  await page.evaluate((nextGameId) => {
    sessionStorage.setItem("econovaria.admin.selected-game.v1", nextGameId);
    const terminal = window.Econovaria?.features?.adminOverviewTerminal;
    const current = terminal?.currentModel || {};
    if (terminal) {
      terminal.currentModel = {
        ...current,
        gameId: nextGameId,
        activeGameId: nextGameId,
        selectedGameSessionId: nextGameId,
        activeGame: { ...(current.activeGame || {}), id: nextGameId },
        selectedGame: { ...(current.selectedGame || {}), id: nextGameId },
      };
    }
    const marker = document.createElement("i");
    marker.hidden = true;
    marker.dataset.attendanceRewardGameSwitch = nextGameId;
    document.body.append(marker);
    marker.remove();
  }, gameId);

  await page.waitForFunction((expectedGameId) =>
    window.EconovariaAttendanceRewardSettings?.getGameId?.() === expectedGameId &&
    window.EconovariaAttendanceRewardSettings?.isLoaded?.() === true &&
    document.querySelector(".admin-terminal-settings-page")
      ?.getAttribute("data-settings-ux-ready") === "true" &&
    document.querySelector(".admin-terminal-settings-page")
      ?.getAttribute("data-settings-ux-baseline-ready") === "true",
  gameId, { timeout: 10_000 });
}

function overlap(left, right) {
  return left.left < right.right - 0.5 &&
    left.right > right.left + 0.5 &&
    left.top < right.bottom - 0.5 &&
    left.bottom > right.top + 0.5;
}

try {
  await page.route("**/functions/v1/admin-api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (
      rejectSettingsRead &&
      request.method() === "GET" &&
      path.endsWith(`/games/${GAME_ID}/settings`)
    ) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
        body: JSON.stringify({ message: "Settings temporarily unavailable." }),
      });
      return;
    }
    await route.fallback();
  });

  await page.route("**/functions/v1/classroom-api/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id",
          "access-control-allow-methods": "POST,OPTIONS",
        },
        body: "",
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify({
        ok: true,
        player: {
          id: "00000000-0000-4000-8000-000000000003",
          displayName: "Lumenor Player",
          playerIdentifier: "LUM-001",
          rosterLabel: "Lumenor roster",
          status: "active",
        },
        attendance: {
          id: "00000000-0000-4000-8000-000000000004",
          status: "present",
          attendanceDate: "2026-07-16",
          clockedInAt: "2026-07-15T23:42:00.000Z",
          wasCreated: true,
          timezone: "Asia/Seoul",
        },
        reward: {
          amount: 1.2,
          currencyCode: "LUM",
          ledgerEntryId: "00000000-0000-4000-8000-000000000005",
          configuredBaseAmount: 1,
          baseCurrencyCode: "ECO",
          currencyMode: "player_country",
          countryCode: "LUMENOR",
          incomeModifier: 1,
          exchangeRateIndex: 1.2,
        },
      }),
    });
  });

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.waitForFunction(() => {
    const root = document.querySelector(".admin-terminal-settings-page");
    const attendance = root?.querySelector("[data-admin-attendance-reward-settings]");
    return root?.getAttribute("data-settings-ux-ready") === "true" &&
      root?.getAttribute("data-settings-ux-baseline-ready") === "true" &&
      attendance?.getAttribute("data-attendance-reward-loaded") === "true";
  }, null, { timeout: 10_000 });

  const presetFirstLayout = await page.evaluate(() => {
    const pageRoot = document.querySelector(".admin-terminal-settings-page");
    const grid = pageRoot?.querySelector(".admin-terminal-settings-tuning-grid");
    const cards = grid ? [...grid.querySelectorAll(":scope > .admin-terminal-settings-tuning-card")] : [];
    const money = pageRoot?.querySelector(".admin-terminal-settings-tuning-card.is-money");
    const attendance = pageRoot?.querySelector("[data-admin-attendance-reward-settings]");
    const saveBar = pageRoot?.querySelector(".admin-terminal-settings-save-bar");
    const toggle = pageRoot?.querySelector("[data-settings-custom-toggle]");
    const summary = pageRoot?.querySelector("[data-settings-config-summary]");
    const currency = attendance?.querySelector('[data-attendance-reward-field="currencyMode"]');
    const difficulty = attendance?.querySelector(
      '[data-attendance-reward-field="applyDifficultyIncomeModifier"]',
    );
    const rect = (element) => {
      const value = element?.getBoundingClientRect();
      return value
        ? { left: value.left, right: value.right, top: value.top, bottom: value.bottom }
        : null;
    };
    return {
      ready: pageRoot?.getAttribute("data-settings-ux-ready") || "",
      collapsed: !pageRoot?.classList.contains("is-custom-settings-open"),
      gridDisplay: grid ? getComputedStyle(grid).display : "",
      summaryText: summary?.textContent?.replace(/\s+/g, " ").trim() || "",
      summaryRows: summary?.querySelectorAll(".admin-terminal-settings-summary-list > div").length || 0,
      toggleText: toggle?.textContent?.trim() || "",
      toggleExpanded: toggle?.getAttribute("aria-expanded") || "",
      saveBarHidden: !saveBar || saveBar.hidden || getComputedStyle(saveBar).display === "none",
      sectionCount: cards.length,
      sectionClasses: cards.map((card) => card.className),
      economyGroupExists: Boolean(pageRoot?.querySelector("[data-settings-economy-group]")),
      segmentedCount: pageRoot?.querySelectorAll("[data-settings-segmented]").length || 0,
      money: rect(money),
      attendance: rect(attendance),
      currencyValue: currency?.value || "",
      difficultyValue: difficulty?.value || "",
      currencyHidden: Boolean(currency?.closest(".admin-terminal-settings-change-tile")?.hidden),
      difficultyHidden: Boolean(difficulty?.closest(".admin-terminal-settings-change-tile")?.hidden),
      visibleAttendanceControls: attendance
        ? [...attendance.querySelectorAll(".admin-terminal-settings-change-tile")]
          .filter((tile) => !tile.hidden).length
        : 0,
    };
  });

  if (
    presetFirstLayout.ready !== "true" ||
    !presetFirstLayout.collapsed ||
    presetFirstLayout.gridDisplay !== "none" ||
    presetFirstLayout.summaryRows !== 4 ||
    !/Current configuration/i.test(presetFirstLayout.summaryText) ||
    !/Economy/i.test(presetFirstLayout.summaryText) ||
    !/Attendance/i.test(presetFirstLayout.summaryText) ||
    !/Edit custom settings/i.test(presetFirstLayout.toggleText) ||
    presetFirstLayout.toggleExpanded !== "false" ||
    !presetFirstLayout.saveBarHidden ||
    presetFirstLayout.sectionCount !== 4 ||
    presetFirstLayout.economyGroupExists ||
    presetFirstLayout.segmentedCount < 5 ||
    presetFirstLayout.currencyValue !== "player_country" ||
    presetFirstLayout.difficultyValue !== "true" ||
    !presetFirstLayout.currencyHidden ||
    !presetFirstLayout.difficultyHidden ||
    presetFirstLayout.visibleAttendanceControls !== 2
  ) {
    throw new Error(`Preset-first Settings layout failed: ${JSON.stringify(presetFirstLayout)}`);
  }

  await page.locator("[data-settings-custom-toggle]").click();
  await page.waitForFunction(() =>
    document.querySelector(".admin-terminal-settings-page")?.classList.contains("is-custom-settings-open") &&
    getComputedStyle(document.querySelector(".admin-terminal-settings-tuning-grid")).display !== "none",
  null, { timeout: 5_000 });

  const expandedLayout = await page.evaluate(() => {
    const pageRoot = document.querySelector(".admin-terminal-settings-page");
    const money = pageRoot?.querySelector(".admin-terminal-settings-tuning-card.is-money")?.getBoundingClientRect();
    const attendance = pageRoot?.querySelector("[data-admin-attendance-reward-settings]")?.getBoundingClientRect();
    return {
      expanded: pageRoot?.classList.contains("is-custom-settings-open") || false,
      toggleText: pageRoot?.querySelector("[data-settings-custom-toggle]")?.textContent?.trim() || "",
      money: money ? { left: money.left, right: money.right, top: money.top, bottom: money.bottom } : null,
      attendance: attendance
        ? { left: attendance.left, right: attendance.right, top: attendance.top, bottom: attendance.bottom }
        : null,
    };
  });
  if (
    !expandedLayout.expanded ||
    !/Hide custom settings/i.test(expandedLayout.toggleText) ||
    !expandedLayout.money ||
    !expandedLayout.attendance ||
    overlap(expandedLayout.money, expandedLayout.attendance)
  ) {
    throw new Error(`Expanded Settings layout failed: ${JSON.stringify(expandedLayout)}`);
  }

  const present = page.locator('[data-attendance-reward-field="presentRewardAmount"]');
  const late = page.locator('[data-attendance-reward-field="lateRewardAmount"]');
  await present.fill("2.50");
  await late.fill("0.50");

  await page.waitForFunction(() => {
    const pageRoot = document.querySelector(".admin-terminal-settings-page");
    const bar = pageRoot?.querySelector(".admin-terminal-settings-save-bar");
    const button = bar?.querySelector('[data-admin-terminal-action="save-settings"]');
    return pageRoot?.classList.contains("has-unsaved-settings") &&
      bar && !bar.hidden && button && !button.disabled;
  }, null, { timeout: 5_000 });
  await page.waitForFunction(() =>
    /unsaved/i.test(document.querySelector("[data-settings-save-status]")?.textContent || ""),
  null, { timeout: 5_000 });

  const formula = await page.locator("[data-attendance-reward-formula]").innerText();
  const summaryAfterChange = await page.locator("[data-settings-config-summary]").innerText();
  const saveStatus = await page.locator("[data-settings-save-status]").innerText();
  if (
    !/Present 2\.50/i.test(formula) ||
    !/0\.75/i.test(formula) ||
    !/player-country exchange rate/i.test(formula) ||
    !/Present reward 2\.50/i.test(summaryAfterChange) ||
    !/unsaved/i.test(saveStatus)
  ) {
    throw new Error(`Settings change feedback failed: ${JSON.stringify({ formula, summaryAfterChange, saveStatus })}`);
  }

  await page.locator('[data-admin-terminal-action="save-settings"]').click();
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-admin-terminal-action="save-settings"]');
    return button && !button.hasAttribute("aria-busy");
  }, null, { timeout: 10_000 });

  const settingsWrite = writes.find((entry) =>
    entry.method === "PATCH" && entry.path.endsWith(`/games/${GAME_ID}/settings`)
  );
  if (!settingsWrite) {
    throw new Error(`Settings save did not issue a PATCH request: ${JSON.stringify(writes)}`);
  }
  const settingsBody = JSON.parse(settingsWrite.body || "{}");
  const bodyRoot = settingsBody.settings || settingsBody.payload || settingsBody;
  const attendanceWindow = bodyRoot.attendanceWindow;
  if (
    attendanceWindow?.presentRewardAmount !== 2.5 ||
    attendanceWindow?.lateRewardAmount !== 0.5 ||
    attendanceWindow?.currencyMode !== "player_country" ||
    attendanceWindow?.applyDifficultyIncomeModifier !== true ||
    attendanceWindow?.currencyCode !== "ECO"
  ) {
    throw new Error(`Automatic attendance policy payload was incomplete: ${JSON.stringify(settingsBody)}`);
  }

  const difficultyKeys = [
    "difficultyPreset",
    "difficulty",
    "priceMultiplier",
    "incomeMultiplier",
    "shockFrequency",
    "shockSeverity",
    "tradeMultiplier",
    "recoverySupport",
  ];
  const leakedDifficultyKeys = difficultyKeys.filter((key) => Object.hasOwn(bodyRoot, key));
  if (leakedDifficultyKeys.length) {
    throw new Error(`Attendance-only save leaked difficulty settings: ${leakedDifficultyKeys.join(", ")}`);
  }

  await page.waitForFunction(() =>
    window.EconovariaAttendanceRewardSettings?.isDirty?.() === false &&
    window.EconovariaSimplifiedSettings?.isDirty?.() === false,
  null, { timeout: 5_000 });

  const savedState = await page.evaluate(() => ({
    cardDirty: document.querySelector("[data-admin-attendance-reward-settings]")
      ?.getAttribute("data-attendance-reward-dirty") || "",
    formula: document.querySelector("[data-attendance-reward-formula]")?.textContent?.trim() || "",
    saveStatus: document.querySelector("[data-settings-save-status]")?.textContent?.trim() || "",
    saveBarVisible: !document.querySelector(".admin-terminal-settings-save-bar")?.hidden,
  }));
  if (
    savedState.cardDirty ||
    !/Example payout/i.test(savedState.formula) ||
    !/Settings saved/i.test(savedState.saveStatus) ||
    !savedState.saveBarVisible
  ) {
    throw new Error(`Saved Settings state was not acknowledged: ${JSON.stringify(savedState)}`);
  }

  await capture("attendance-reward-settings");

  rejectSettingsRead = true;
  await present.fill("3.00");
  const patchCountBeforeFailedSave = writes.filter((entry) =>
    entry.method === "PATCH" && entry.path.endsWith(`/games/${GAME_ID}/settings`)
  ).length;
  await page.locator('[data-admin-terminal-action="save-settings"]').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-admin-terminal-action="save-settings"]')
      ?.getAttribute("data-admin-terminal-api-state") === "error",
  null, { timeout: 10_000 });
  const patchCountAfterFailedSave = writes.filter((entry) =>
    entry.method === "PATCH" && entry.path.endsWith(`/games/${GAME_ID}/settings`)
  ).length;
  if (patchCountAfterFailedSave !== patchCountBeforeFailedSave) {
    throw new Error("A settings PATCH was emitted after the authoritative settings read failed.");
  }

  const failedStatus = await page.locator("[data-settings-save-status]").innerText();
  if (!/not saved/i.test(failedStatus)) {
    throw new Error(`Failed save did not remain visible and actionable: ${failedStatus}`);
  }

  rejectSettingsRead = false;
  await switchFixtureGame(SECOND_GAME_ID);
  const secondGameState = await page.evaluate(() => {
    const button = document.querySelector('[data-admin-terminal-action="save-settings"]');
    const saveBar = document.querySelector(".admin-terminal-settings-save-bar");
    return {
      value: document.querySelector('[data-attendance-reward-field="presentRewardAmount"]')?.value || "",
      currencyMode: document.querySelector('[data-attendance-reward-field="currencyMode"]')?.value || "",
      difficulty: document.querySelector(
        '[data-attendance-reward-field="applyDifficultyIncomeModifier"]',
      )?.value || "",
      dirty: window.EconovariaAttendanceRewardSettings?.isDirty?.() === true,
      uxDirty: window.EconovariaSimplifiedSettings?.isDirty?.() === true,
      buttonDirty: button?.getAttribute("data-attendance-reward-dirty") || "",
      buttonError: button?.getAttribute("data-attendance-reward-error") || "",
      corePending: button?.getAttribute("data-attendance-reward-core-pending") || "",
      ready: document.querySelector(".admin-terminal-settings-page")
        ?.getAttribute("data-settings-ux-ready") || "",
      baselineReady: document.querySelector(".admin-terminal-settings-page")
        ?.getAttribute("data-settings-ux-baseline-ready") || "",
      saveBarHidden: !saveBar || saveBar.hidden || getComputedStyle(saveBar).display === "none",
    };
  });
  if (
    secondGameState.value === "3.00" ||
    secondGameState.currencyMode !== "player_country" ||
    secondGameState.difficulty !== "true" ||
    secondGameState.dirty ||
    secondGameState.uxDirty ||
    secondGameState.buttonDirty ||
    secondGameState.buttonError ||
    secondGameState.corePending ||
    secondGameState.ready !== "true" ||
    secondGameState.baselineReady !== "true" ||
    !secondGameState.saveBarHidden
  ) {
    throw new Error(`Settings state leaked into another game: ${JSON.stringify(secondGameState)}`);
  }

  await switchFixtureGame(GAME_ID);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.locator('[data-admin-terminal-action="scan-attendance"]').first().click();
  await page.locator('[data-admin-terminal-set-mode="manual"]').click();
  await page.locator("[data-admin-terminal-manual-scan-input]").fill("LUM-001");
  await page.locator('[data-admin-terminal-action="submit-attendance-scan"]').click();
  await page.waitForFunction(() =>
    /completed/i.test(document.querySelector("[data-admin-terminal-scanner-state]")?.textContent || ""),
    null,
    { timeout: 10_000 },
  );

  const reward = await page.locator("[data-admin-terminal-last-scan-reward]").evaluate((element) => ({
    text: element.textContent?.trim() || "",
    title: element.getAttribute("title") || "",
    currency: element.getAttribute("data-admin-scanner-reward-currency") || "",
  }));
  if (reward.text !== "+1.20 LUM" || reward.currency !== "LUM" || !/LUMENOR exchange/i.test(reward.title)) {
    throw new Error(`Scanner did not render the localized reward: ${JSON.stringify(reward)}`);
  }

  await capture("attendance-local-currency-scan");
  writeFileSync(`${harness.dir}/attendance-reward-runtime.json`, JSON.stringify({
    presetFirstLayout,
    expandedLayout,
    settingsBody,
    attendanceWindow,
    formula,
    summaryAfterChange,
    saveStatus,
    savedState,
    failedStatus,
    secondGameState,
    reward,
    errors,
  }, null, 2));

  if (errors.length) throw new Error(errors[0]);
  console.log("Preset-first Settings UX and automatic attendance reward policy smoke passed.");
  await finish({
    presetFirstLayout,
    expandedLayout,
    settingsBody,
    attendanceWindow,
    formula,
    summaryAfterChange,
    saveStatus,
    savedState,
    failedStatus,
    secondGameState,
    reward,
  });
} catch (error) {
  await capture("attendance-reward-failure").catch(() => {});
  await finish({ failure: error.stack || error.message || String(error) });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}
