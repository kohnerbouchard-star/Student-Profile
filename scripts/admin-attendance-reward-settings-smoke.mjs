import { writeFileSync } from "node:fs";
import { createQualityHarness, BASE_URL, GAME_ID } from "./admin-quality-smoke-fixture.mjs";

const harness = await createQualityHarness("attendance-reward-settings");
const { page, writes, errors, capture, finish } = harness;

try {
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
  await page.waitForSelector("[data-admin-attendance-reward-settings]", { timeout: 10_000 });

  const present = page.locator('[data-attendance-reward-field="presentRewardAmount"]');
  const late = page.locator('[data-attendance-reward-field="lateRewardAmount"]');
  const currencyMode = page.locator('[data-attendance-reward-field="currencyMode"]');
  const difficulty = page.locator('[data-attendance-reward-field="applyDifficultyIncomeModifier"]');

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

  await capture("attendance-reward-settings");

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
    settingsBody,
    attendanceWindow,
    formula,
    reward,
    errors,
  }, null, 2));

  if (errors.length) throw new Error(errors[0]);
  console.log("Attendance reward settings and player-country currency smoke passed.");
  await finish({ settingsBody, attendanceWindow, formula, reward });
} catch (error) {
  await capture("attendance-reward-failure").catch(() => {});
  await finish({ failure: error.stack || error.message || String(error) });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}
