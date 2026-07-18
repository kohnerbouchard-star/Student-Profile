import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const controllerPath = resolve(root, "admin/keyboard-navigation.js");
const stylesheetPath = resolve(root, "admin/css/keyboard-navigation.css");
const indexPath = resolve(root, "admin/index.html");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const path of [controllerPath, stylesheetPath, indexPath]) {
  assert(existsSync(path), `Missing Admin keyboard-navigation file: ${path}`);
}

const controller = readFileSync(controllerPath, "utf8");
const stylesheet = readFileSync(stylesheetPath, "utf8");
const html = readFileSync(indexPath, "utf8");
const syntax = spawnSync(process.execPath, ["--check", controllerPath], { encoding: "utf8" });

assert(syntax.status === 0, `Keyboard-navigation syntax failed:\n${syntax.stderr || syntax.stdout}`);
assert(html.includes("./css/keyboard-navigation.css"), "Admin keyboard focus stylesheet is not loaded.");
assert(html.includes("import('./keyboard-navigation.js')"), "Admin keyboard controller is not loaded through the accepted script order.");
assert(controller.includes("[data-admin-section]"), "Primary Admin section navigation is not covered.");
assert(controller.includes('[role=\"tab\"]'), "Admin tab controls are not covered.");
assert(controller.includes("[data-admin-terminal-action]"), "Delegated Admin actions are not covered.");
assert(controller.includes("ArrowDown") && controller.includes("ArrowUp"), "Vertical arrow navigation is missing.");
assert(controller.includes("ArrowRight") && controller.includes("ArrowLeft"), "Horizontal arrow navigation is missing.");
assert(controller.includes('key === "Home"') && controller.includes('key === "End"'), "Home/End navigation is missing.");
assert(controller.includes("Enter") && controller.includes("Spacebar"), "Keyboard activation keys are incomplete.");
assert(controller.includes("data-admin-input-modality"), "Keyboard modality tracking is missing.");
assert(!controller.includes("MutationObserver"), "Keyboard navigation must not add DOM observation.");
assert(!controller.includes("window.fetch ="), "Keyboard navigation must not intercept requests.");
assert(!controller.includes("style.cssText") && !controller.includes('createElement("style")'), "Keyboard navigation must not create runtime styles.");
assert(stylesheet.includes(":focus-visible"), "Visible keyboard focus treatment is missing.");
assert(stylesheet.includes("forced-colors: active"), "Forced-colors focus treatment is missing.");

console.log("Admin keyboard-navigation source contract passed.");
