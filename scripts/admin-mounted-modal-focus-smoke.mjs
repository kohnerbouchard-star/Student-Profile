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
  const mountedVerifiedModalIds = [
    "add-contract",
    "add-player",
    "add-store-item",
    "admin-export-history",
    "attendance-scanner",
    "contract-submission-review",
    "dashboard-contract-profile",
    "player-created-confirmation",
    "player-log-event-detail",
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
  ];

  console.log(`Mounted Admin literal bundle modal IDs: ${JSON.stringify(literalBundleModalIds)}`);
  console.log(`Mounted Admin verified modal IDs: ${JSON.stringify(mountedVerifiedModalIds)}`);

  const auditLog = {
    id: "audit-log-accessibility-1",
    eventId: "audit-log-accessibility-1",
    createdAt: "2026-07-19T00:00:00.000Z",
    occurredAt: "2026-07-19T00:00:00.000Z",
    timestamp: "2026-07-19T00:00:00.000Z",
    category: "player",
    severity: "info",
    action: "player_profile_updated",
    eventType: "player_profile_updated",
    actorName: "Accessibility Administrator",
    actorLabel: "Accessibility Administrator",
    summary: "Accessibility player profile updated.",
    message: "Accessibility player profile updated.",
    detail: "Mounted log-detail accessibility evidence.",
    targetName: "Accessibility Matrix Player",
    targetId: "00000000-0000-4000-8000-000000002003",
    relatedRecord: {
      type: "player",
      id: "00000000-0000-4000-8000-000000002003",
      label: "Accessibility Matrix Player",
    },
    relatedRecordType: "player",
    relatedRecordId: "00000000-0000-4000-8000-000000002003",
  };
  const fixtureSource = source.replace("  logs: [],", `  logs: [${JSON.stringify(auditLog)}],`);
  if (fixtureSource === source) {
    throw new Error("Admin modal fixture log insertion point changed.");
  }

  const controllerWait = `async function assertFocusTrap(page, container, label) {\n  await container.evaluate(async (root, currentLabel) => {\n    for (let attempt = 0; attempt < 30; attempt += 1) {\n      const controller = window.EconovariaAdminModalAccessibility?.getActiveController?.();\n      if (controller?.dialog === root) return;\n      await new Promise((resolve) => requestAnimationFrame(resolve));\n    }\n    throw new Error(\`${'${currentLabel}'} did not become the active modal controller.\`);\n  }, label);\n  const activeInside`;
  const stabilizedSource = fixtureSource.replace(
    "async function assertFocusTrap(page, container, label) {\n  const activeInside",
    controllerWait,
  );
  if (stabilizedSource === fixtureSource) {
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

async function exerciseLogDetailModal(browser) {
  const { context, page, errors } = await createPage(browser, "Player Log Detail modal");
  try {
    await loadAdmin(page);
    await navigate(page, "Logs");
    const actions = await page.locator('[data-admin-terminal-action]:visible').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-admin-terminal-action") || ""));
    const action = actions.includes("open-log-detail") ? "open-log-detail" : actions.includes("open-related-record") ? "open-related-record" : "";
    assert(action, "Seeded audit log rendered no keyboard detail action: " + JSON.stringify(actions) + ".");
    const opener = page.locator(\`[data-admin-terminal-action="\${action}"]:visible\`).first();
    await keyboardActivate(page, opener);

    const surface = page.locator('[data-modal-id="player-log-event-detail"]:visible').last();
    const target = await controllerDialogForSurface(page, surface, "adminLogDetailA11yTarget", "Player Log Detail modal");
    const focusableCount = await assertFocusTrap(page, target.dialog, "Player Log Detail modal");
    await escapeAndRestore(page, surface, opener, "Player Log Detail modal");
    const pointerEvents = await page.evaluate(() => window.__adminAccessibilityPointerEvents || []);
    assert(pointerEvents.length === 0, \`Player Log Detail recorded pointer input: \${JSON.stringify(pointerEvents)}\`);
    assert(errors.length === 0, errors[0] || "Player Log Detail emitted an unexpected browser error.");
    return { action, focusableCount, escape: "dismissed", restored: true, pointerEvents: 0, ownership: target.ownership };
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
  playerProfile: null,
  shareGameAccess: null,
  exportHistory: null,
  logDetail: null,
};
try {
  report.playerProfile = await exercisePlayerProfileModal(browser);
  report.shareGameAccess = await exerciseShareGameAccessModal(browser);
  report.exportHistory = await exerciseExportHistoryModal(browser);
  report.logDetail = await exerciseLogDetailModal(browser);
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
