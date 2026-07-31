import { mkdirSync, writeFileSync } from "node:fs";
import {
  BASE_URL,
  createQualityHarness,
} from "./admin-quality-smoke-fixture.mjs";

const OUT = process.env.ADMIN_SMOKE_ARTIFACT_DIR ||
  "admin-browser-smoke-artifacts/mounted-modal-focus";
const SURFACES = [
  ["add-player", "Overview", "Enter"],
  ["add-contract", "Overview", "Space"],
  ["add-store-item", "Store", "Enter"],
  ["scan-attendance", "Overview", "Space"],
];
mkdirSync(OUT, { recursive: true });

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function selectSection(page, name) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  const control = page.locator(`[data-admin-section="${name}"]`).first();
  await control.waitFor({ state: "visible", timeout: 15_000 });
  await control.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(expected => [...document.querySelectorAll("[data-admin-section]")].some(node =>
    node.getAttribute("data-admin-section") === expected && (
      node.getAttribute("aria-current") === "page" ||
      node.getAttribute("aria-selected") === "true" ||
      node.classList.contains("active") ||
      node.classList.contains("is-active")
    )
  ), name, { timeout: 5000 });
  return control;
}

async function visibleAction(page, action) {
  await page.waitForFunction(
    () => typeof window.EconovariaAdminOverviewQuickActions?.reconcile === "function",
    null,
    { timeout: 15_000 },
  );
  await page.evaluate(() => window.EconovariaAdminOverviewQuickActions.reconcile());
  await page.waitForFunction(expected => [...document.querySelectorAll(
    `[data-admin-terminal-action="${CSS.escape(expected)}"]`,
  )].some(node => {
    if (
      !(node instanceof HTMLElement) ||
      node.hidden ||
      node.closest("[data-admin-shape-skeleton-stage], .admin-shape-surface-overlay")
    ) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" &&
      rect.width > 1 && rect.height > 1;
  }), action, { timeout: 15_000 });
  return page.locator(`[data-admin-terminal-action="${action}"]:visible`).first();
}

async function authorizationDiagnostics(page) {
  return page.evaluate(() => {
    const authorization = value => ({
      permissions: Array.isArray(value?.permissions) ? [...value.permissions] : [],
      roles: Array.isArray(value?.roles) ? [...value.roles] : [],
      adminRole: String(value?.adminRole || ""),
    });
    const session = window.EconovariaAdminAuth?.getSession?.() || null;
    const legacy = window.currentSession || null;
    const stateStaff = window.state?.staffSession || null;
    const feature = window.Econovaria?.features?.adminOverviewTerminal || null;
    const model = feature?.currentModel || null;
    const featureFunctions = {};
    for (const [key, value] of Object.entries(feature || {})) {
      if (typeof value !== "function") continue;
      const source = Function.prototype.toString.call(value);
      if (
        /permission|access|section|role|session|renderShell/i.test(`${key}\n${source}`)
      ) {
        featureFunctions[key] = source.slice(0, 20_000);
      }
    }
    const relatedGlobals = {};
    for (const key of Object.keys(window).filter(name =>
      /^EconovariaAdmin/i.test(name) && /permission|access|session|overview/i.test(name)
    )) {
      const value = window[key];
      relatedGlobals[key] = {
        type: typeof value,
        keys: value && typeof value === "object" ? Object.keys(value).sort() : [],
        source: typeof value === "function"
          ? Function.prototype.toString.call(value).slice(0, 10_000)
          : "",
      };
    }
    return {
      auth: {
        authenticated: session?.authenticated === true,
        assuranceLevel: String(session?.assuranceLevel || ""),
        ...authorization(session),
      },
      legacy: {
        ...authorization(legacy),
        staffSession: authorization(legacy?.staffSession),
        keys: legacy && typeof legacy === "object" ? Object.keys(legacy).sort() : [],
      },
      stateStaff: {
        ...authorization(stateStaff),
        keys: stateStaff && typeof stateStaff === "object"
          ? Object.keys(stateStaff).sort()
          : [],
      },
      model: {
        ...authorization(model),
        staffSession: authorization(model?.staffSession),
        keys: model && typeof model === "object" ? Object.keys(model).sort() : [],
      },
      feature: {
        keys: feature && typeof feature === "object" ? Object.keys(feature).sort() : [],
        functions: featureFunctions,
      },
      relatedGlobals,
      navigation: [...document.querySelectorAll("[data-admin-section]")].map(node => ({
        section: node.getAttribute("data-admin-section") || "",
        disabled: node.hasAttribute("disabled"),
        ariaDisabled: node.getAttribute("aria-disabled") || "",
        title: node.getAttribute("title") || "",
      })),
      quickActions: [...document.querySelectorAll("[data-admin-terminal-action]")].map(node => ({
        action: node.getAttribute("data-admin-terminal-action") || "",
        hidden: node.hidden,
        disabled: node.hasAttribute("disabled"),
      })).filter(entry => entry.action),
      gate: document.querySelector(".admin-terminal-session-gate-v604")?.textContent
        ?.trim().replace(/\s+/g, " ") || "",
    };
  });
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
    return result;
  } catch (error) {
    result.failure = error?.stack || error?.message || String(error);
    result.errors = [...errors];
    result.authorization = await authorizationDiagnostics(page).catch(() => null);
    await harness.capture(`${action}-failure`).catch(() => {});
    throw error;
  } finally {
    await harness.finish(result);
  }
}

const report = { surfaces: [] };
try {
  for (const surface of SURFACES) report.surfaces.push(await exercise(surface));
  writeFileSync(`${OUT}/mounted-modal-focus.json`, JSON.stringify(report, null, 2));
  console.log("Mounted Admin operational modal focus, Escape, and restoration smoke passed through the BFF harness.");
} catch (error) {
  report.failure = error?.stack || error?.message || String(error);
  writeFileSync(`${OUT}/mounted-modal-focus.json`, JSON.stringify(report, null, 2));
  console.error(report.failure);
  process.exitCode = 1;
}
