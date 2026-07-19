import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const controllerPath = resolve(root, "admin/keyboard-navigation.js");
const stylesheetPath = resolve(root, "admin/css/keyboard-navigation.css");
const indexPath = resolve(root, "admin/index.html");
const mountedSmokePath = resolve(root, "scripts/admin-mounted-keyboard-navigation-smoke.mjs");
const workflowSmokePath = resolve(root, "scripts/admin-keyboard-workflows-smoke.mjs");
const focusOrderSmokePath = resolve(root, "scripts/admin-keyboard-focus-order-smoke.mjs");
const contractReviewSmokePath = resolve(root, "scripts/admin-contract-review-smoke.mjs");
const playerDrawerSmokePath = resolve(root, "scripts/admin-player-drawer-smoke.mjs");
const accountSurfacesSmokePath = resolve(root, "scripts/admin-account-surfaces-smoke.mjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const evidencePaths = [
  controllerPath,
  stylesheetPath,
  indexPath,
  mountedSmokePath,
  workflowSmokePath,
  focusOrderSmokePath,
  contractReviewSmokePath,
  playerDrawerSmokePath,
  accountSurfacesSmokePath,
];
for (const path of evidencePaths) {
  assert(existsSync(path), `Missing Admin keyboard-navigation file: ${path}`);
}

const controller = readFileSync(controllerPath, "utf8");
const stylesheet = readFileSync(stylesheetPath, "utf8");
const html = readFileSync(indexPath, "utf8");
const mountedSmoke = readFileSync(mountedSmokePath, "utf8");
const workflowSmoke = readFileSync(workflowSmokePath, "utf8");
const focusOrderSmoke = readFileSync(focusOrderSmokePath, "utf8");
const contractReviewSmoke = readFileSync(contractReviewSmokePath, "utf8");
const playerDrawerSmoke = readFileSync(playerDrawerSmokePath, "utf8");
const accountSurfacesSmoke = readFileSync(accountSurfacesSmokePath, "utf8");

for (const [label, path] of [
  ["Keyboard navigation", controllerPath],
  ["Mounted keyboard smoke", mountedSmokePath],
  ["Keyboard workflow smoke", workflowSmokePath],
  ["Focus-order smoke", focusOrderSmokePath],
  ["Contract review smoke", contractReviewSmokePath],
  ["Player drawer smoke", playerDrawerSmokePath],
  ["Account surfaces smoke", accountSurfacesSmokePath],
]) {
  const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  assert(result.status === 0, `${label} syntax failed:\n${result.stderr || result.stdout}`);
}

assert(html.includes("./css/keyboard-navigation.css"), "Admin keyboard focus stylesheet is not loaded.");
assert(html.includes("import('./keyboard-navigation.js')"), "Admin keyboard controller is not loaded through the accepted script order.");
assert(controller.includes("[data-admin-section]"), "Primary Admin section navigation is not covered.");
assert(controller.includes('[role="tab"]'), "Admin tab controls are not covered.");
assert(controller.includes("[data-admin-terminal-action]"), "Delegated Admin actions are not covered.");
assert(controller.includes("ArrowDown") && controller.includes("ArrowUp"), "Vertical arrow navigation is missing.");
assert(controller.includes("ArrowRight") && controller.includes("ArrowLeft"), "Horizontal arrow navigation is missing.");
assert(controller.includes('key === "Home"') && controller.includes('key === "End"'), "Home/End navigation is missing.");
assert(controller.includes("Enter") && controller.includes("Spacebar"), "Keyboard activation keys are incomplete.");
assert(controller.includes("data-admin-input-modality"), "Keyboard modality tracking is missing.");
for (const token of ["[inert]", '[data-admin-stale="true"]', "data-admin-shape-skeleton-route", "data-admin-shape-surface-overlay"]) {
  assert(controller.includes(token), `Keyboard exclusion boundary is missing ${token}.`);
  assert(mountedSmoke.includes(token), `Mounted keyboard smoke does not exercise ${token}.`);
}
assert(!controller.includes('[aria-busy="true"]'), "A busy region must not be treated as stale or disabled by keyboard navigation.");
assert(!mountedSmoke.includes('[aria-busy="true"]'), "Mounted focus evidence must not classify a busy region as stale.");
assert(controller.includes("element.closest(EXCLUDED_ANCESTOR_SELECTOR)"), "Keyboard eligibility does not reject excluded ancestors.");
for (const token of ["1440", "1024", "768", "Shift+Tab", "ArrowDown", "add-player", "add-contract", "add-store-item", "scan-attendance"]) {
  assert(mountedSmoke.includes(token), `Mounted keyboard evidence is missing ${token}.`);
}
for (const token of [
  "page.keyboard.type",
  'page.keyboard.press("Control+A")',
  'page.keyboard.press("Home")',
  'page.keyboard.press("ArrowDown")',
  "create-player",
  "create-contract",
  "save-store-item",
  "submit-attendance-scan",
  "PLAYER-CODE-123",
  "document.activeElement === input",
]) {
  assert(workflowSmoke.includes(token), `Keyboard workflow evidence is missing ${token}.`);
}
for (const token of [
  "PAGE_ORDERS",
  "Overview",
  "Attendance",
  "Players",
  "Assignments",
  "Store",
  "Market",
  "Settings",
  "Logs",
  "dataset.adminQolState",
  "writesDuringLoading",
  "button.disabled",
  "__adminKeyboardPointerEvents",
]) {
  assert(focusOrderSmoke.includes(token), `Focus-order evidence is missing ${token}.`);
}
for (const forbidden of [".click(", ".fill(", ".selectOption(", "page.mouse", "mouse.click", "touchscreen.tap"]) {
  assert(!focusOrderSmoke.includes(forbidden), `Focus-order evidence uses forbidden non-keyboard helper ${forbidden}.`);
}
for (const [label, source, tokens] of [
  ["Contract review", contractReviewSmoke, ["contract-submission-accept", "contract-submission-confirm-decision", "keyboardActivate", "__adminKeyboardPointerEvents"]],
  ["Player drawer", playerDrawerSmoke, ["select-player-panel", "data-player-drawer-tab", 'page.keyboard.press("ArrowRight")', "__adminKeyboardPointerEvents"]],
  ["Account surfaces", accountSurfacesSmoke, ["open-admin-profile", "open-admin-games", "keyboardActivate", "__adminKeyboardPointerEvents"]],
]) {
  for (const token of tokens) assert(source.includes(token), `${label} keyboard evidence is missing ${token}.`);
  for (const forbidden of [".click(", "page.mouse", "mouse.click", "touchscreen.tap"]) {
    assert(!source.includes(forbidden), `${label} keyboard evidence uses forbidden pointer helper ${forbidden}.`);
  }
}
assert(!mountedSmoke.includes(".click("), "Mounted keyboard smoke must not use pointer-style click activation.");
assert(!mountedSmoke.includes("page.mouse") && !mountedSmoke.includes("mouse.click"), "Mounted keyboard smoke must not use mouse input.");
for (const forbidden of [".click(", ".fill(", ".selectOption(", "page.mouse", "mouse.click", "touchscreen.tap"]) {
  assert(!workflowSmoke.includes(forbidden), `Keyboard workflow smoke uses forbidden non-keyboard helper ${forbidden}.`);
}
assert(workflowSmoke.includes("__adminKeyboardPointerEvents"), "Keyboard workflow smoke does not record pointer-input violations.");
assert(!controller.includes("MutationObserver"), "Keyboard navigation must not add DOM observation.");
assert(!controller.includes("window.fetch ="), "Keyboard navigation must not intercept requests.");
assert(!controller.includes("style.cssText") && !controller.includes('createElement("style")'), "Keyboard navigation must not create runtime styles.");
assert(stylesheet.includes(":focus-visible"), "Visible keyboard focus treatment is missing.");
assert(stylesheet.includes("forced-colors: active"), "Forced-colors focus treatment is missing.");

console.log("Admin keyboard-navigation source, focus-order, in-flight, and deep workflow contracts passed.");
