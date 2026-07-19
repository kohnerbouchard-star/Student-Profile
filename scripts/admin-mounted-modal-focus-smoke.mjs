import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

await import("./admin-mounted-operational-modal-focus-smoke.mjs");

if (!process.exitCode) {
  const sourceUrl = new URL("./admin-modal-drawer-accessibility-smoke.mjs", import.meta.url);
  const bundleUrl = new URL("../admin/dist/admin-overview-terminal.js", import.meta.url);
  const source = readFileSync(sourceUrl, "utf8");
  const bundle = readFileSync(bundleUrl, "utf8");
  const literalBundleModalIds = [...new Set(
    [...bundle.matchAll(/data-modal-id=["']([a-z][a-z0-9-]{2,})["']/g)].map((match) => match[1]),
  )].sort();
  const mountedEvidenceModalIds = [...new Set([
    ...literalBundleModalIds,
    "contract-submission-review",
    "dashboard-contract-profile",
    "player-settings-editor",
  ])].sort();

  console.log(`Mounted Admin literal bundle modal IDs: ${JSON.stringify(literalBundleModalIds)}`);
  console.log(`Mounted Admin evidenced modal IDs: ${JSON.stringify(mountedEvidenceModalIds)}`);

  const controllerWait = `async function assertFocusTrap(page, container, label) {\n  await container.evaluate(async (root, currentLabel) => {\n    for (let attempt = 0; attempt < 30; attempt += 1) {\n      const controller = window.EconovariaAdminModalAccessibility?.getActiveController?.();\n      if (controller?.dialog === root) return;\n      await new Promise((resolve) => requestAnimationFrame(resolve));\n    }\n    throw new Error(\`${'${currentLabel}'} did not become the active modal controller.\`);\n  }, label);\n  const activeInside`;
  const stabilizedSource = source.replace(
    "async function assertFocusTrap(page, container, label) {\n  const activeInside",
    controllerWait,
  );
  if (stabilizedSource === source) {
    throw new Error("Admin modal focus-trap fixture contract changed.");
  }

  const marker = "const browser = await chromium.launch({ headless: true });";
  const markerIndex = stabilizedSource.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("Admin modal fixture launch marker changed.");
  }

  const helpers = `
async function exercisePlayerProfileModal(browser) {
  const { context, page, errors } = await createPage(browser, "Edit Player Profile modal");
  try {
    await loadAdmin(page);
    await navigate(page, "Players");

    let opener = page.locator('[data-admin-terminal-action="player-settings"]:visible').first();
    if (await opener.count() === 0) {
      const playerSelector = page.locator(
        \`[data-admin-terminal-action="select-player-panel"][data-player-id="\${PLAYER_ID}"]:visible\`,
      ).first();
      await keyboardActivate(page, playerSelector);
      const drawer = page.locator("[data-admin-terminal-player-drawer]:visible").first();
      await drawer.waitFor({ state: "visible", timeout: 5000 });
      await page.keyboard.press("Escape");
      await drawer.waitFor({ state: "hidden", timeout: 5000 }).catch(async () => {
        await drawer.waitFor({ state: "detached", timeout: 5000 });
      });
      await page.waitForTimeout(150);
      opener = page.locator('[data-admin-terminal-action="player-settings"]:visible').first();
    }

    await keyboardActivate(page, opener);
    const backdrop = page.locator(
      '[data-admin-terminal-modal-backdrop][data-modal-id="player-settings-editor"]:visible',
    ).last();
    const dialog = backdrop.locator('[role="dialog"]').first();
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    const focusableCount = await assertFocusTrap(page, dialog, "Edit Player Profile modal");
    await escapeAndRestore(page, backdrop, opener, "Edit Player Profile modal");
    const pointerEvents = await page.evaluate(() => window.__adminAccessibilityPointerEvents || []);
    assert(pointerEvents.length === 0, \`Edit Player Profile recorded pointer input: \${JSON.stringify(pointerEvents)}\`);
    assert(errors.length === 0, errors[0] || "Edit Player Profile emitted an unexpected browser error.");
    return { focusableCount, escape: "dismissed", restored: true, pointerEvents: 0 };
  } finally {
    await context.close();
  }
}

async function exerciseShareGameAccessModal(browser) {
  const { context, page, errors } = await createPage(browser, "Share Game Access modal");
  try {
    await loadAdmin(page);
    const opener = page.locator([
      '[data-admin-terminal-action="share-current-game"]:visible',
      '[data-admin-terminal-action="share-game-code"]:visible',
      '[data-admin-terminal-share-button]:visible',
    ].join(", ")).first();
    await keyboardActivate(page, opener);

    const backdrop = page.locator('[data-modal-id="share-game-access"]:visible').last();
    const dialog = backdrop.locator('[role="dialog"]').first();
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    const focusableCount = await assertFocusTrap(page, dialog, "Share Game Access modal");
    await escapeAndRestore(page, backdrop, opener, "Share Game Access modal");
    const pointerEvents = await page.evaluate(() => window.__adminAccessibilityPointerEvents || []);
    assert(pointerEvents.length === 0, \`Share Game Access recorded pointer input: \${JSON.stringify(pointerEvents)}\`);
    assert(errors.length === 0, errors[0] || "Share Game Access emitted an unexpected browser error.");
    return { focusableCount, escape: "dismissed", restored: true, pointerEvents: 0 };
  } finally {
    await context.close();
  }
}

async function exerciseExportHistoryModal(browser) {
  const { context, page, errors } = await createPage(browser, "Export History modal");
  try {
    await loadAdmin(page);
    await navigate(page, "Logs");
    const opener = page.locator('[data-admin-terminal-action="open-export-history"]:visible').first();
    await keyboardActivate(page, opener);

    const surface = page.locator('[data-modal-id="admin-export-job-status"]:visible').last();
    await surface.waitFor({ state: "visible", timeout: 5000 });
    const ownership = await surface.evaluate((root) => {
      const controller = window.EconovariaAdminModalAccessibility?.getActiveController?.();
      const dialog = controller?.dialog;
      const related = dialog instanceof HTMLElement && (
        dialog === root || root.contains(dialog) || dialog.contains(root)
      );
      if (related) dialog.dataset.adminExportHistoryA11yTarget = "true";
      return {
        related,
        surfaceTag: root.tagName,
        surfaceClass: root.className,
        surfaceRole: root.getAttribute("role") || "",
        controllerDialogTag: dialog?.tagName || "",
        controllerDialogClass: dialog?.className || "",
      };
    });
    assert(ownership.related, "Export History is not owned by the shared modal controller: " + JSON.stringify(ownership) + ".");
    const dialog = page.locator('[data-admin-export-history-a11y-target="true"]');
    const focusableCount = await assertFocusTrap(page, dialog, "Export History modal");
    await escapeAndRestore(page, surface, opener, "Export History modal");
    const pointerEvents = await page.evaluate(() => window.__adminAccessibilityPointerEvents || []);
    assert(pointerEvents.length === 0, \`Export History recorded pointer input: \${JSON.stringify(pointerEvents)}\`);
    assert(errors.length === 0, errors[0] || "Export History emitted an unexpected browser error.");
    return { focusableCount, escape: "dismissed", restored: true, pointerEvents: 0, ownership };
  } finally {
    await context.close();
  }
}
`;

  const runtimeTail = `
const browser = await chromium.launch({ headless: true });
const report = {
  literalBundleModalIds: ${JSON.stringify(literalBundleModalIds)},
  mountedEvidenceModalIds: ${JSON.stringify(mountedEvidenceModalIds)},
  playerProfile: null,
  shareGameAccess: null,
  exportHistory: null,
};
try {
  report.playerProfile = await exercisePlayerProfileModal(browser);
  report.shareGameAccess = await exerciseShareGameAccessModal(browser);
  report.exportHistory = await exerciseExportHistoryModal(browser);
  writeFileSync(
    \`\${ARTIFACT_DIR}/secondary-modal-accessibility.json\`,
    JSON.stringify(report, null, 2),
  );
  console.log("Admin secondary modal focus, Escape, restoration, and zero-pointer matrix passed.");
} catch (error) {
  report.failure = error.stack || error.message || String(error);
  writeFileSync(
    \`\${ARTIFACT_DIR}/secondary-modal-accessibility.json\`,
    JSON.stringify(report, null, 2),
  );
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await browser.close();
}
`;

  const prefix = join(dirname(fileURLToPath(import.meta.url)), ".admin-modal-inventory-");
  const runtimeDir = mkdtempSync(prefix);
  const secondaryRuntimePath = join(runtimeDir, "secondary-runtime.mjs");
  const inheritedRuntimePath = join(runtimeDir, "inherited-runtime.mjs");

  function runRuntime(path) {
    const result = spawnSync(process.execPath, [path], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status || 1;
  }

  try {
    writeFileSync(
      secondaryRuntimePath,
      `${stabilizedSource.slice(0, markerIndex)}${helpers}${runtimeTail}`,
    );
    writeFileSync(inheritedRuntimePath, stabilizedSource);
    runRuntime(secondaryRuntimePath);
    if (!process.exitCode) runRuntime(inheritedRuntimePath);
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true });
  }
}
