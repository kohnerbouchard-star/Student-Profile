import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createQualityHarness } from "./admin-quality-smoke-fixture.mjs";
import { captureAdminTerminalPermissionSource } from "./admin-terminal-permission-source-diagnostic.mjs";

const SURFACES = Object.freeze([
  ["add-player", "Overview", "Enter"],
  ["add-contract", "Overview", "Space"],
  ["add-store-item", "Store", "Enter"],
  ["scan-attendance", "Overview", "Space"],
]);
const SESSION_KEY = "econovaria.admin.auth.v1";
const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
const FULL_PERMISSIONS = Object.freeze([
  "account.read",
  "audit.read",
  "attendance.manage",
  "business.manage",
  "contracts.manage",
  "economy.adjust",
  "game.create",
  "game.read",
  "game.switch",
  "game.update",
  "inventory.redeem",
  "market.manage",
  "marketplace.moderate",
  "messaging.moderate",
  "players.manage",
  "progression.review",
  "settings.manage",
  "store.manage",
  "world.manage",
]);
const FULL_ROLES = Object.freeze(["game_admin"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sanitizeArtifactSegment(value) {
  return String(value || "surface")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "surface";
}

async function ensureDiagnosticDirectory() {
  const directory = "admin-browser-smoke-artifacts/terminal-permission-source";
  mkdirSync(directory, { recursive: true });
  return directory;
}

async function capturePermissionSource(page, label, error = null) {
  const directory = await ensureDiagnosticDirectory();
  const diagnostic = await captureAdminTerminalPermissionSource(page, {
    label,
    error,
  });
  writeFileSync(
    `${directory}/terminal-permission-source.json`,
    JSON.stringify(diagnostic, null, 2),
  );
  return diagnostic;
}

async function configureAuthorizedState(page) {
  await page.evaluate(({ sessionKey, selectedGameKey, permissions, roles }) => {
    const model = window.Econovaria?.features?.adminOverviewTerminal?.currentModel;
    const activeGameSessions = Array.isArray(model?.activeGameSessions)
      ? model.activeGameSessions
      : [];
    const selectedGameSessionId = String(
      model?.selectedGame?.id ||
        model?.selectedGame?.gameSessionId ||
        model?.gameId ||
        activeGameSessions[0]?.id ||
        "11111111-1111-4111-8111-111111111111",
    );
    const session = {
      authenticated: true,
      assuranceLevel: "aal2",
      mfaRequired: true,
      permissions: [...permissions],
      roles: [...roles],
      adminRole: "game_admin",
      staffSession: {
        permissions: [...permissions],
        roles: [...roles],
        adminRole: "game_admin",
      },
    };
    window.EconovariaAdminAuth = {
      isAuthenticated: () => true,
      session,
      permissions: [...permissions],
      roles: [...roles],
      adminRole: "game_admin",
      user: { role: "game_admin", app_metadata: { role: "game_admin" } },
    };
    window.sessionStorage.setItem(sessionKey, JSON.stringify(session));
    window.sessionStorage.setItem(selectedGameKey, selectedGameSessionId);

    const state = window.Econovaria?.state?.adminOverview;
    if (state?.staff && typeof state.staff === "object") {
      Object.assign(state.staff, {
        selectedGameSessionId,
        permissions: [...permissions],
        roles: [...roles],
        adminRole: "game_admin",
      });
    }
    if (model && typeof model === "object") {
      model.permissions = [...permissions];
      model.roles = [...roles];
      model.adminRole = "game_admin";
      model.staffSession = session.staffSession;
      model.staff = {
        ...(model.staff && typeof model.staff === "object" ? model.staff : {}),
        selectedGameSessionId,
        permissions: [...permissions],
        roles: [...roles],
        adminRole: "game_admin",
      };
    }
    window.dispatchEvent(new CustomEvent("econovaria:admin-session-refreshed", {
      detail: {
        session,
        activeGameSessions,
      },
    }));
  }, {
    sessionKey: SESSION_KEY,
    selectedGameKey: SELECTED_GAME_KEY,
    permissions: FULL_PERMISSIONS,
    roles: FULL_ROLES,
  });
}

async function selectSection(page, section) {
  const control = page.locator(`[data-admin-section="${section}"]`).first();
  await control.waitFor({ state: "visible", timeout: 5000 });
  if ((await control.getAttribute("aria-current")) !== "page") {
    await control.click();
  }
  return control;
}

async function visibleAction(page, action) {
  const locator = page.locator(
    `[data-admin-terminal-action="${action}"]:visible`,
  ).first();
  await locator.waitFor({ state: "visible", timeout: 5000 });
  await locator.scrollIntoViewIfNeeded();
  return locator;
}

async function tabTo(page, start, target, label) {
  await start.focus();
  for (let count = 0; count <= 50; count += 1) {
    if (await target.evaluate(node => document.activeElement === node)) return count;
    await page.keyboard.press("Tab");
  }
  throw new Error(`${label} was not reachable through Tab navigation.`);
}

async function boundary(modal, focusLast = false) {
  return modal.evaluate((dialog, shouldFocusLast) => {
    const controls = window.EconovariaAdminModalAccessibility?.focusableElements?.(dialog) || [];
    if (shouldFocusLast) controls.at(-1)?.focus({ preventScroll: true });
    const describe = node => ({
      action: node?.getAttribute?.("data-admin-terminal-action") || "",
      tag: node?.tagName || "",
      text: (node?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
    });
    return {
      count: controls.length,
      first: describe(controls[0]),
      last: describe(controls.at(-1)),
      activeIsFirst: document.activeElement === controls[0],
      activeIsLast: document.activeElement === controls.at(-1),
      forwardBoundaryReached: dialog.dataset.adminForwardBoundaryReached === "true",
      reverseBoundaryReached: dialog.dataset.adminReverseBoundaryReached === "true",
      active: describe(document.activeElement),
    };
  }, focusLast);
}

async function waitForBoundaryFocus(page, edge) {
  await page.waitForFunction(expectedEdge => {
    const dialog = document.querySelector(".admin-terminal-modal:not([hidden])");
    if (!(dialog instanceof HTMLElement)) return false;
    const controls = window.EconovariaAdminModalAccessibility?.focusableElements?.(dialog) || [];
    const expected = expectedEdge === "first" ? controls[0] : controls.at(-1);
    if (expectedEdge === "first" && dialog.dataset.adminForwardBoundaryReached === "true") return true;
    if (expectedEdge === "last" && dialog.dataset.adminReverseBoundaryReached === "true") return true;
    return Boolean(expected) && document.activeElement === expected;
  }, edge, { timeout: 5000 });
}

async function traceBoundary(modal, edge) {
  await modal.evaluate((dialog, expectedEdge) => {
    const controls = window.EconovariaAdminModalAccessibility?.focusableElements?.(dialog) || [];
    const target = expectedEdge === "first" ? controls[0] : controls.at(-1);
    const datasetKey = expectedEdge === "first"
      ? "adminForwardBoundaryReached"
      : "adminReverseBoundaryReached";
    dialog.dataset[datasetKey] = "false";
    const onFocus = event => {
      if (event.target !== target) return;
      dialog.dataset[datasetKey] = "true";
      dialog.removeEventListener("focusin", onFocus, true);
    };
    dialog.addEventListener("focusin", onFocus, true);
  }, edge);
}

async function exercise([action, section, key]) {
  const harness = await createQualityHarness(`mounted-modal-focus-${action}`);
  const { page, errors, state } = harness;
  const result = { action, section, key };
  state.delayReads = false;

  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.addInitScript(() => {
    window.__modalPointerEvents = [];
    for (const type of ["pointerdown", "mousedown", "touchstart"]) {
      window.addEventListener(type, event => window.__modalPointerEvents.push({
        type,
        target: event.target?.tagName || "",
      }), true);
    }
  });

  try {
    await configureAuthorizedState(page);
    const sectionControl = await selectSection(page, section);
    const opener = await visibleAction(page, action);
    const openerTabs = await tabTo(page, sectionControl, opener, action);
    await page.keyboard.press(key);
    const modal = page.locator(".admin-terminal-modal:visible").first();
    await modal.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForFunction(() => {
      const dialog = document.querySelector(".admin-terminal-modal:not([hidden])");
      return dialog instanceof HTMLElement && dialog.contains(document.activeElement);
    }, null, { timeout: 5000 });
    const initial = await page.evaluate(() => ({
      tag: document.activeElement?.tagName || "",
      action: document.activeElement?.getAttribute?.("data-admin-terminal-action") || "",
      inside: Boolean(document.activeElement?.closest?.(".admin-terminal-modal")),
    }));
    const bounds = await boundary(modal, true);
    assert(bounds.count > 0, `${action} modal contains no focusable controls.`);
    await traceBoundary(modal, "first");
    await page.keyboard.press("Tab");
    await waitForBoundaryFocus(page, "first");
    const forward = await boundary(modal);
    assert(
      forward.activeIsFirst || forward.forwardBoundaryReached,
      `${action} forward wrap failed: ${JSON.stringify(forward)}.`,
    );
    await traceBoundary(modal, "last");
    await page.keyboard.press("Shift+Tab");
    await waitForBoundaryFocus(page, "last");
    const reverse = await boundary(modal);
    assert(
      reverse.activeIsLast || reverse.reverseBoundaryReached,
      `${action} reverse wrap failed: ${JSON.stringify(reverse)}.`,
    );
    await page.keyboard.press("Escape");
    await modal.waitFor({ state: "hidden", timeout: 5000 });
    await page.waitForFunction(
      expected => document.activeElement?.getAttribute?.("data-admin-terminal-action") === expected,
      action,
      { timeout: 5000 },
    );
    const keyboard = await page.evaluate(() => ({
      modality: document.documentElement.getAttribute("data-admin-input-modality"),
      pointerEvents: window.__modalPointerEvents || [],
    }));
    assert(keyboard.modality === "keyboard", `${action} lost keyboard modality.`);
    assert(keyboard.pointerEvents.length === 0, `${action} emitted pointer input.`);
    assert(errors.length === 0, `${action} emitted browser errors: ${errors[0]}`);
    Object.assign(result, {
      openerTabs,
      initial,
      bounds,
      forward,
      reverse,
      restored: true,
      keyboard,
      errors: [...errors],
    });
    await harness.finish({ passed: true, ...result });
    return result;
  } catch (error) {
    const authorization = await capturePermissionSource(
      page,
      `${action}-failure`,
      error,
    ).catch(() => null);
    const diagnostics = await page.evaluate(() => ({
      active: {
        tag: document.activeElement?.tagName || "",
        action: document.activeElement?.getAttribute?.("data-admin-terminal-action") || "",
        text: (document.activeElement?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
      },
      dialog: (() => {
        const dialog = document.querySelector(".admin-terminal-modal:not([hidden])");
        const controls = dialog && window.EconovariaAdminModalAccessibility?.focusableElements?.(dialog) || [];
        return {
          visible: dialog instanceof HTMLElement,
          forwardBoundaryReached: dialog?.dataset.adminForwardBoundaryReached || "",
          reverseBoundaryReached: dialog?.dataset.adminReverseBoundaryReached || "",
          controls: controls.map(control => ({
            tag: control.tagName,
            action: control.getAttribute("data-admin-terminal-action") || "",
            text: (control.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
          })),
        };
      })(),
    })).catch(() => null);
    Object.assign(result, {
      failure: error.stack || error.message || String(error),
      errors: [...errors],
      authorization,
      diagnostics,
    });
    await harness.capture(`${sanitizeArtifactSegment(action)}-failure`).catch(() => {});
    await harness.finish({ passed: false, ...result }).catch(() => {});
    throw error;
  }
}

const output = [];
try {
  for (const surface of SURFACES) output.push(await exercise(surface));
  const directory = "admin-browser-smoke-artifacts/mounted-modal-focus";
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/mounted-modal-focus.json`, JSON.stringify({ surfaces: output }, null, 2));
  console.log("Mounted Admin operational modal focus and keyboard-only boundaries passed.");
} catch (error) {
  const directory = "admin-browser-smoke-artifacts/mounted-modal-focus";
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    `${directory}/mounted-modal-focus.json`,
    JSON.stringify({ surfaces: output, failure: error.stack || error.message || String(error) }, null, 2),
  );
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
}
