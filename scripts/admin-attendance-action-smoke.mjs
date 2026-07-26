import { writeFileSync } from "node:fs";
import {
  BASE_URL,
  createSpecializedQualityHarness,
  GAME_ID,
} from "./admin-specialized-quality-fixture.mjs";

function flatten(value) {
  const source = value && typeof value === "object" ? value : {};
  const payload = source.payload && typeof source.payload === "object" ? source.payload : {};
  return { ...source, ...payload };
}

const harness = await createSpecializedQualityHarness("attendance-action", {
  handleProxy: ({ method, path }) => {
    if (method === "POST" && /\/attendance\/(?:scan|scans)$/.test(path)) {
      return {
        body: {
          ok: true,
          gameSession: { id: GAME_ID, name: "Quality Game", status: "active" },
          player: {
            id: "00000000-0000-4000-8000-000000000003",
            displayName: "Attendance Smoke Player",
            rosterLabel: "ATT-001",
            status: "active",
          },
          attendance: {
            id: "00000000-0000-4000-8000-000000000004",
            status: "present",
            attendanceDate: "2026-07-14",
            clockedInAt: new Date().toISOString(),
            wasCreated: true,
            timezone: "Asia/Seoul",
          },
          reward: { amount: 1, currencyCode: "XAL", ledgerEntryId: null },
        },
      };
    }
    return null;
  },
});
const { page, errors, writes, dir } = harness;

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.locator('[data-admin-terminal-action="scan-attendance"]').first().click();
  await page.waitForSelector(".admin-terminal-modal:visible", { timeout: 5000 });

  const replacedScanner = page.locator(".admin-terminal-modal:visible img.admin-terminal-scanner-video");
  if (await replacedScanner.count()) {
    throw new Error("Attendance scanner video was replaced with an image.");
  }
  const scannerVideo = page.locator(".admin-terminal-modal:visible video.admin-terminal-scanner-video").first();
  await scannerVideo.waitFor({ state: "visible", timeout: 5000 });
  const scannerSource = await scannerVideo.locator("source").getAttribute("src");
  if (!String(scannerSource || "").endsWith("/assets/videos/scanner-background.mp4")) {
    throw new Error(`Attendance scanner used ${scannerSource || "no source"} instead of scanner-background.mp4.`);
  }

  await page.locator('[data-admin-terminal-set-mode="manual"]').click();
  const panel = page.locator("[data-admin-terminal-manual-panel]");
  await panel.waitFor({ state: "visible", timeout: 5000 });
  await panel.locator("[data-admin-terminal-manual-scan-input]").fill("PLAYER-CODE-123");
  await panel.locator('[data-admin-terminal-action="submit-attendance-scan"]').click();
  await page.waitForFunction(() => {
    const state = document.querySelector("[data-admin-terminal-scanner-state]")?.textContent || "";
    return /confirmed|completed/i.test(state);
  }, null, { timeout: 10_000 });

  const browserResult = await page.evaluate(() => ({
    player: document.querySelector("[data-admin-terminal-last-scan-player]")?.textContent?.trim() || "",
    status: document.querySelector("[data-admin-terminal-last-scan-status]")?.textContent?.trim() || "",
    resultHidden: document.querySelector("[data-admin-terminal-last-scan-result]")?.hasAttribute("hidden") ?? true,
    emptyHidden: document.querySelector("[data-admin-terminal-last-scan-empty]")?.hasAttribute("hidden") ?? false,
    scannerState: document.querySelector("[data-admin-terminal-scanner-state]")?.textContent?.trim() || "",
  }));
  const result = { ...browserResult, scannerSource };
  const attendanceWrites = writes.filter((write) => /\/attendance\/(?:scan|scans)$/.test(write.path));

  writeFileSync(`${dir}/attendance-action-runtime.json`, JSON.stringify({ result, writes, errors }, null, 2));
  await harness.capture("attendance-action");

  if (errors.length) throw new Error(errors[0]);
  if (attendanceWrites.length !== 1) {
    throw new Error(`Expected one BFF attendance mutation: ${JSON.stringify(writes)}.`);
  }
  const write = attendanceWrites[0];
  const payload = flatten(write.parsedBody);
  if (payload.playerId !== "PLAYER-CODE-123") {
    throw new Error(`Attendance mutation sent unexpected body ${JSON.stringify(write.parsedBody)}.`);
  }
  if (write.headers.authorization !== undefined) {
    throw new Error("Attendance mutation exposed Staff Authorization.");
  }
  if (
    write.headers["x-econovaria-game-id"] !== GAME_ID ||
    !write.headers["x-econovaria-csrf-token"]
  ) {
    throw new Error("Attendance mutation omitted BFF game scope or cookie-bound CSRF.");
  }
  if (result.resultHidden || !result.emptyHidden || !/confirmed|completed/i.test(result.scannerState)) {
    throw new Error(`Attendance result did not reach confirmed visible state: ${JSON.stringify(result)}.`);
  }
  if (!result.player || !result.status) {
    throw new Error(`Attendance result omitted player or status: ${JSON.stringify(result)}.`);
  }
  await harness.finish({ result, attendanceWrite: write });
  console.log("Admin attendance scanner BFF submission and original video smoke passed.");
} catch (error) {
  writeFileSync(`${dir}/attendance-action-error.json`, JSON.stringify({
    error: error.stack || error.message || String(error),
    writes,
    errors,
  }, null, 2));
  await harness.capture("attendance-action-error").catch(() => {});
  await harness.finish({ failure: error.stack || error.message || String(error) });
  throw error;
}
