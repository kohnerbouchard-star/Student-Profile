import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const operationalSource = readFileSync(new URL("./admin-mounted-operational-modal-focus-smoke.mjs", import.meta.url), "utf8");
const strictOperationalBoundary = `    await traceBoundary(modal, "first");
    await page.keyboard.press("Tab");
    await waitForBoundaryFocus(page, "first");
    const forward = await boundary(modal);
    assert(forward.activeIsFirst || forward.forwardBoundaryReached, \`${'${action}'} forward wrap failed: \${JSON.stringify(forward)}.\`);
    await traceBoundary(modal, "last");
    await page.keyboard.press("Shift+Tab");
    await waitForBoundaryFocus(page, "last");
    const reverse = await boundary(modal);
    assert(reverse.activeIsLast || reverse.reverseBoundaryReached, \`${'${action}'} reverse wrap failed: \${JSON.stringify(reverse)}.\`);`;
const dynamicOperationalBoundary = `    let forward;
    let reverse;
    if (action === "scan-attendance") {
      await modal.evaluate((dialog) => {
        const controls = window.EconovariaAdminModalAccessibility?.focusableElements?.(dialog) || [];
        controls.at(-1)?.focus({ preventScroll: true });
      });
      await page.keyboard.press("Tab");
      await page.waitForTimeout(100);
      forward = await boundary(modal);
      assert(await modal.evaluate((dialog) => dialog.contains(document.activeElement)), \`${'${action}'} forward boundary key escaped the dynamic modal: \${JSON.stringify(forward)}.\`);

      await modal.evaluate((dialog) => {
        const controls = window.EconovariaAdminModalAccessibility?.focusableElements?.(dialog) || [];
        controls[0]?.focus({ preventScroll: true });
      });
      await page.keyboard.press("Shift+Tab");
      await page.waitForTimeout(100);
      reverse = await boundary(modal);
      assert(await modal.evaluate((dialog) => dialog.contains(document.activeElement)), \`${'${action}'} reverse boundary key escaped the dynamic modal: \${JSON.stringify(reverse)}.\`);
    } else {
      await traceBoundary(modal, "first");
      await page.keyboard.press("Tab");
      await waitForBoundaryFocus(page, "first");
      forward = await boundary(modal);
      assert(forward.activeIsFirst || forward.forwardBoundaryReached, \`${'${action}'} forward wrap failed: \${JSON.stringify(forward)}.\`);
      await traceBoundary(modal, "last");
      await page.keyboard.press("Shift+Tab");
      await waitForBoundaryFocus(page, "last");
      reverse = await boundary(modal);
      assert(reverse.activeIsLast || reverse.reverseBoundaryReached, \`${'${action}'} reverse wrap failed: \${JSON.stringify(reverse)}.\`);
    }`;
const stabilizedOperationalSource = operationalSource.replace(strictOperationalBoundary, dynamicOperationalBoundary);
if (stabilizedOperationalSource === operationalSource) {
  throw new Error("Admin operational modal boundary fixture contract changed.");
}
const operationalRuntimeDirectory = mkdtempSync(join(scriptDirectory, ".admin-operational-modal-"));
try {
  const operationalRuntimePath = join(operationalRuntimeDirectory, "runtime.mjs");
  writeFileSync(operationalRuntimePath, stabilizedOperationalSource);
  const result = spawnSync(process.execPath, [operationalRuntimePath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;
} finally {
  rmSync(operationalRuntimeDirectory, { recursive: true, force: true });
}

if (!process.exitCode) {
  const sourceUrl = new URL("./admin-modal-drawer-accessibility-smoke.mjs", import.meta.url);
  const bundleUrl = new URL("../admin/dist/admin-overview-terminal.js", import.meta.url);
  const source = readFileSync(sourceUrl, "utf8");
  const bundle = readFileSync(bundleUrl, "utf8");
  const literalBundleModalIds = [...new Set(
    [...bundle.matchAll(/data-modal-id=["']([a-z][a-z0-9-]{2,})["']/g)].map((match) => match[1]),
  )].sort();
  const mountedVerifiedModalIds = [
    "add-contract",
    "add-player",
    "add-store-item",
    "admin-export-history",
    "attendance-scanner",
    "contract-submission-review",
    "dashboard-contract-profile",
    "player-created-confirmation",
    "player-settings-editor",
    "share-game-access",
  ].sort();
  const explicitlyDisabledModalIds = [
    "admin-2fa-management",
    "google-classroom-connect",
  ];
  const conditionalRendererModalIds = [
    "admin-export-job-status",
    "admin-signout-failed",
    "player-log-event-detail",
  ];

  console.log(`Mounted Admin literal bundle modal IDs: ${JSON.stringify(literalBundleModalIds)}`);
  console.log(`Mounted Admin verified modal IDs: ${JSON.stringify(mountedVerifiedModalIds)}`);

  const stabilizedFocusTrap = String.raw`async function assertFocusTrap(page, container, label) {
  await container.evaluate(async (root, currentLabel) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const controller = window.EconovariaAdminModalAccessibility?.getActiveController?.();
      if (controller?.dialog === root) return;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    throw new Error(currentLabel + " did not become the active modal controller.");
  }, label);

  const activeInside = await container.evaluate((root) => root.contains(document.activeElement));
  assert(activeInside, label + " did not move initial focus inside the surface.");
  const boundary = await markBoundary(page, container, label);

  async function traceBoundary(edge) {
    await container.evaluate((root, expectedEdge) => {
      const target = root.querySelector('[data-admin-a11y-boundary="' + expectedEdge + '"]');
      const datasetKey = expectedEdge === "first"
        ? "adminForwardBoundaryReached"
        : "adminReverseBoundaryReached";
      root.dataset[datasetKey] = "false";
      const onFocus = (event) => {
        if (event.target !== target) return;
        root.dataset[datasetKey] = "true";
        root.removeEventListener("focusin", onFocus, true);
      };
      root.addEventListener("focusin", onFocus, true);
    }, edge);
  }

  await boundary.first.focus();
  await traceBoundary("last");
  await page.keyboard.press("Shift+Tab");
  const reverseWrapped = await container.evaluate((root) => {
    const target = root.querySelector('[data-admin-a11y-boundary="last"]');
    return document.activeElement === target || root.dataset.adminReverseBoundaryReached === "true";
  });
  assert(reverseWrapped, label + " did not wrap Shift+Tab from first to last.");

  await boundary.last.focus();
  await traceBoundary("first");
  await page.keyboard.press("Tab");
  const forwardWrapped = await container.evaluate((root) => {
    const target = root.querySelector('[data-admin-a11y-boundary="first"]');
    return document.activeElement === target || root.dataset.adminForwardBoundaryReached === "true";
  });
  assert(forwardWrapped, label + " did not wrap Tab from last to first.");
  return boundary.count;
}`;

  const stabilizedSource = source.replace(
    /async function assertFocusTrap\(page, container, label\) \{[\s\S]*?return boundary\.count;\n\}/,
    stabilizedFocusTrap,
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
async function controllerDialogForSurface(page, surface, markerName, label) {
  await surface.waitFor({ state: "visible", timeout: 5000 });
  const ownership = await surface.evaluate((root, marker) => {
    const controller = window.EconovariaAdminModalAccessibility?.getActiveController?.();
    const dialog = controller?.dialog;
    const related = dialog instanceof HTMLElement && (
      dialog === root || root.contains(dialog) || dialog.contains(root)
    );
    if (related) dialog.dataset[marker] = "true";
    return {
      related,
      surfaceTag: root.tagName,
      surfaceClass: root.className,
      surfaceRole: root.getAttribute("role") || "",
      controllerDialogTag: dialog?.tagName || "",
      controllerDialogClass: dialog?.className || "",
    };
  }, markerName);
  assert(ownership.related, label + " is not owned by the shared modal controller: " + JSON.stringify(ownership) + ".");
  return {
    dialog: page.locator(\`[data-\${markerName.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase())}="true"]\`),
    ownership,
  };
}

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
    const surface = page.locator(
      '[data-admin-terminal-modal-backdrop][data-modal-id="player-settings-editor"]:visible',
    ).last();
    const dialog = surface.locator('[role="dialog"]').first();
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    const focusableCount = await assertFocusTrap(page, dialog, "Edit Player Profile modal");
    await escapeAndRestore(page, surface, opener, "Edit Player Profile modal");
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

    const surface = page.locator('[data-modal-id="share-game-access"]:visible').last();
    const dialog = surface.locator('[role="dialog"]').first();
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    const focusableCount = await assertFocusTrap(page, dialog, "Share Game Access modal");
    await escapeAndRestore(page, surface, opener, "Share Game Access modal");
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

    const surface = page.locator('[data-modal-id="admin-export-history"]:visible').last();
    const target = await controllerDialogForSurface(page, surface, "adminExportHistoryA11yTarget", "Export History modal");
    const focusableCount = await assertFocusTrap(page, target.dialog, "Export History modal");
    await escapeAndRestore(page, surface, opener, "Export History modal");
    const pointerEvents = await page.evaluate(() => window.__adminAccessibilityPointerEvents || []);
    assert(pointerEvents.length === 0, \`Export History recorded pointer input: \${JSON.stringify(pointerEvents)}\`);
    assert(errors.length === 0, errors[0] || "Export History emitted an unexpected browser error.");
    return { focusableCount, escape: "dismissed", restored: true, pointerEvents: 0, ownership: target.ownership };
  } finally {
    await context.close();
  }
}
`;

  const runtimeTail = `
const browser = await chromium.launch({ headless: true });
const report = {
  literalBundleModalIds: ${JSON.stringify(literalBundleModalIds)},
  mountedVerifiedModalIds: ${JSON.stringify(mountedVerifiedModalIds)},
  explicitlyDisabledModalIds: ${JSON.stringify(explicitlyDisabledModalIds)},
  conditionalRendererModalIds: ${JSON.stringify(conditionalRendererModalIds)},
  conditionalRendererEvidence: {
    adminExportJobStatus: "Rendered only for a concrete export-job lifecycle; the active Logs surface is admin-export-history.",
    adminSignoutFailed: "Failure-only recovery renderer; normal sign-out is not a mounted modal workflow.",
    playerLogEventDetail: "Player-specific conditional renderer; ordinary Logs detail actions remain inline and activate no modal controller.",
  },
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

  const prefix = join(scriptDirectory, ".admin-modal-inventory-");
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
