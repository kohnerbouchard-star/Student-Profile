#!/usr/bin/env node

import { readFile, writeFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(SCRIPT_DIR, "admin-game-creation-browser-smoke.mjs");
const RUN_PATH = path.join(SCRIPT_DIR, ".admin-game-creation-browser-smoke.run.mjs");

const LEGACY_BLOCK = `  const hitTarget = await createButton.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      enabled: !button.disabled,
      width: rect.width,
      height: rect.height,
      pointerEvents: getComputedStyle(button).pointerEvents,
      topTargetIsButton: target === button || button.contains(target),
    };
  });
  assert(hitTarget.enabled, "New game button is disabled.");
  assert(hitTarget.height >= 36 && hitTarget.width > 60,
    \`New game hit target is too small: \${JSON.stringify(hitTarget)}.\`);
  assert(hitTarget.pointerEvents !== "none" && hitTarget.topTargetIsButton,
    \`New game button is not clickable: \${JSON.stringify(hitTarget)}.\`);

  await createButton.focus();
  assert(await createButton.evaluate((node) => document.activeElement === node),
    "New game button could not receive keyboard focus.");
  await page.keyboard.press("Enter");
`;

const COMPACT_SAFE_BLOCK = `  const hitTarget = await createButton.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return {
      enabled: !button.disabled,
      width: rect.width,
      height: rect.height,
      pointerEvents: getComputedStyle(button).pointerEvents,
      compactRail: rect.width < 64,
    };
  });
  assert(hitTarget.enabled, "New game button is disabled.");
  assert(hitTarget.height >= 36 && hitTarget.width >= 44,
    \`New game hit target is too small: \${JSON.stringify(hitTarget)}.\`);
  assert(hitTarget.pointerEvents !== "none",
    \`New game button disables pointer interaction: \${JSON.stringify(hitTarget)}.\`);

  await createButton.focus();
  assert(await createButton.evaluate((node) => document.activeElement === node),
    "New game button could not receive keyboard focus.");
  await page.keyboard.press("Enter");
  const keyboardModal = page.locator('[data-modal-id="create-multiplayer-game"]:visible');
  await keyboardModal.waitFor({ state: "visible", timeout: 5_000 });
  await page.keyboard.press("Escape");
  await keyboardModal.waitFor({ state: "hidden", timeout: 5_000 });

  await createButton.click({ timeout: 5_000 });
`;

async function main() {
  const source = await readFile(SOURCE_PATH, "utf8");
  if (!source.includes(LEGACY_BLOCK)) {
    throw new Error("Game creation browser smoke source changed; compact pointer contract was not applied.");
  }
  const patched = source.replace(LEGACY_BLOCK, COMPACT_SAFE_BLOCK);
  if (patched.includes("topTargetIsButton")) {
    throw new Error("Legacy elementFromPoint proxy remains after compact pointer adaptation.");
  }
  if (!patched.includes("await createButton.click({ timeout: 5_000 });")) {
    throw new Error("Real pointer click is missing from compact creation acceptance.");
  }

  await writeFile(RUN_PATH, patched, "utf8");
  try {
    const result = spawnSync(process.execPath, [RUN_PATH], {
      cwd: path.dirname(SCRIPT_DIR),
      stdio: "inherit",
      env: process.env,
    });
    if (result.status !== 0) process.exitCode = result.status || 1;
  } finally {
    await unlink(RUN_PATH).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
