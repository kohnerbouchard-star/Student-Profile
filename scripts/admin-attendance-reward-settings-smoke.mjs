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
    window.EconovariaAttendanceRewardSettings?.isLoaded?.() === true,
  gameId, { timeout: 10_000 });
}

function rectanglesOverlap(left, right) {
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
  await page.waitForSelector("[data-admin-attendance-reward-settings][data-attendance-reward-loaded='true']", {
    timeout: 10_000,
  });

  const present = page.locator('[data-attendance-reward-field="presentRewardAmount"]');
  const late = page.locator('[data-attendance-reward-field="lateRewardAmount"]');
  const currencyMode = page.locator('[data-attendance-reward-field="currencyMode"]');
  const difficulty = page.locator('[data-attendance-reward-field="applyDifficultyIncomeModifier"]');

  const initialPolicy = await page.evaluate(() => ({
    currencyMode: document.querySelector('[data-attendance-reward-field="currencyMode"]')?.value || "",
    difficulty: document.querySelector('[data-attendance-reward-field="applyDifficultyIncomeModifier"]')?.value || "",
    dirty: window.EconovariaAttendanceRewardSettings?.isDirty?.() === true,
  }));
  if (initialPolicy.currencyMode !== "fixed" || initialPolicy.difficulty !== "false" || initialPolicy.dirty) {
    throw new Error(`Legacy attendance settings did not remain opt-in: ${JSON.stringify(initialPolicy)}`);
  }

  await present.fill("2.50");
  await late.fill("0.50");
  await currencyMode.selectOption("player_country");
  await difficulty.selectOption("true");

  const formula = await page.locator("[data-attendance-reward-formula]").innerText();
  if (!/2\.50 ECO present/i.test(formula) || !/player country currency/i.test(formula)) {
    throw new Error(`Attendance reward formula did not update: ${formula}`);
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
    throw new Error(`Attendance settings payload was incomplete: ${JSON.stringify(settingsBody)}`);
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
    window.EconovariaAttendanceRewardSettings?.isDirty?.() === false,
  null, { timeout: 5_000 });
  const savedComparison = await page.evaluate(() => ({
    current: document.querySelector("[data-attendance-current]")?.textContent?.trim() || "",
    changed: document.querySelector("[data-attendance-changed]")?.textContent?.trim() || "",
    cardDirty: document.querySelector("[data-admin-attendance-reward-settings]")
      ?.getAttribute("data-attendance-reward-dirty") || "",
  }));
  if (!savedComparison.current || savedComparison.current !== savedComparison.changed || savedComparison.cardDirty) {
    throw new Error(`Saved attendance state was not acknowledged: ${JSON.stringify(savedComparison)}`);
  }

  const comparisonBounds = await page.evaluate(() => {
    const row = document.querySelector("[data-attendance-reward-preview]");
    const description = row?.querySelector(":scope > div small");
    const current = row?.querySelector("[data-attendance-current]");
    const arrow = row?.querySelector(":scope > i");
    const changed = row?.querySelector("[data-attendance-changed]");
    const parentCurrent = current?.parentElement;
    const parentChanged = changed?.parentElement;
    const rect = (element) => {
      const value = element?.getBoundingClientRect();
      return value
        ? { left: value.left, right: value.right, top: value.top, bottom: value.bottom }
        : null;
    };
    return {
      row: rect(row),
      description: rect(description),
      current: rect(current),
      arrow: rect(arrow),
      changed: rect(changed),
      currentContained: Boolean(
        current && parentCurrent &&
        current.getBoundingClientRect().left >= parentCurrent.getBoundingClientRect().left - 0.5 &&
        current.getBoundingClientRect().right <= parentCurrent.getBoundingClientRect().right + 0.5 &&
        parentCurrent.scrollWidth <= parentCurrent.clientWidth + 1
      ),
      changedContained: Boolean(
        changed && parentChanged &&
        changed.getBoundingClientRect().left >= parentChanged.getBoundingClientRect().left - 0.5 &&
        changed.getBoundingClientRect().right <= parentChanged.getBoundingClientRect().right + 0.5 &&
        parentChanged.scrollWidth <= parentChanged.clientWidth + 1
      ),
    };
  });
  if (
    !comparisonBounds.row ||
    !comparisonBounds.description ||
    !comparisonBounds.current ||
    !comparisonBounds.arrow ||
    !comparisonBounds.changed ||
    !comparisonBounds.currentContained ||
    !comparisonBounds.changedContained ||
    rectanglesOverlap(comparisonBounds.description, comparisonBounds.current) ||
    rectanglesOverlap(comparisonBounds.current, comparisonBounds.arrow) ||
    rectanglesOverlap(comparisonBounds.arrow, comparisonBounds.changed)
  ) {
    throw new Error(`Attendance comparison columns overlap or overflow: ${JSON.stringify(comparisonBounds)}`);
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

  rejectSettingsRead = false;
  await switchFixtureGame(SECOND_GAME_ID);
  const secondGameState = await page.evaluate(() => {
    const button = document.querySelector('[data-admin-terminal-action="save-settings"]');
    return {
      value: document.querySelector('[data-attendance-reward-field="presentRewardAmount"]')?.value || "",
      currencyMode: document.querySelector('[data-attendance-reward-field="currencyMode"]')?.value || "",
      difficulty: document.querySelector('[data-attendance-reward-field="applyDifficultyIncomeModifier"]')?.value || "",
      dirty: window.EconovariaAttendanceRewardSettings?.isDirty?.() === true,
      buttonDirty: button?.getAttribute("data-attendance-reward-dirty") || "",
      buttonError: button?.getAttribute("data-attendance-reward-error") || "",
      corePending: button?.getAttribute("data-attendance-reward-core-pending") || "",
    };
  });
  if (
    secondGameState.value === "3.00" ||
    secondGameState.currencyMode !== "fixed" ||
    secondGameState.difficulty !== "false" ||
    secondGameState.dirty ||
    secondGameState.buttonDirty ||
    secondGameState.buttonError ||
    secondGameState.corePending
  ) {
    throw new Error(`Attendance state leaked into another game: ${JSON.stringify(secondGameState)}`);
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
    initialPolicy,
    settingsBody,
    attendanceWindow,
    formula,
    savedComparison,
    comparisonBounds,
    secondGameState,
    reward,
    errors,
  }, null, 2));

  if (errors.length) throw new Error(errors[0]);
  console.log("Attendance reward settings and player-country currency smoke passed.");
  await finish({
    initialPolicy,
    settingsBody,
    attendanceWindow,
    formula,
    savedComparison,
    comparisonBounds,
    secondGameState,
    reward,
  });
} catch (error) {
  await capture("attendance-reward-failure").catch(() => {});
  await finish({ failure: error.stack || error.message || String(error) });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}
