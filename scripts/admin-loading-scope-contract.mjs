import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const quickActions = await readFile(new URL("../admin/overview-quick-actions.js", import.meta.url), "utf8");
const quickCss = await readFile(new URL("../admin/css/overview-quick-actions.css", import.meta.url), "utf8");
const loadingCss = await readFile(new URL("../admin/css/loading-scope-overrides.css", import.meta.url), "utf8");
const index = await readFile(new URL("../admin/index.html", import.meta.url), "utf8");

for (const action of ["scan-attendance", "add-contract", "add-player"]) {
  assert.ok(quickActions.includes(`"${action}"`), `Overview quick actions must include ${action}.`);
}
assert.ok(quickActions.includes('const STORE_ACTION = "add-store-item"'), "Store item creation must be handled separately.");
assert.match(quickActions, /storeButton\.hidden = true/, "Add Store Item must be hidden on Overview.");
assert.match(quickActions, /section !== "Store"/, "Add Store Item may reappear only on the Store section.");
assert.match(quickActions, /admin-overview-quick-actions-card/, "Overview actions must move into a content card.");
assert.match(quickActions, /MAX_BOOT_FRAMES/, "Quick-action placement must tolerate a delayed v606 shell mount.");
assert.match(quickActions, /function activeAccountSurface\(\)/, "Quick-action placement must detect active account surfaces.");
assert.match(quickActions, /if \(activeAccountSurface\(\)\) return "Account"/, "Overview actions must be excluded while an account surface is open.");
assert.doesNotMatch(quickActions, /MutationObserver|window\.fetch\s*=/, "The correction must not add another observer or transport wrapper.");

assert.match(quickCss, /grid-template-columns:\s*repeat\(3/, "Desktop quick actions must render as a bounded three-column card.");
assert.match(quickCss, /@media \(max-width: 900px\)/, "Quick actions must stack responsively.");

assert.match(loadingCss, /background:\s*transparent\s*!important/, "The route overlay must not paint an opaque full-page loading screen.");
assert.match(loadingCss, /> \.admin-shape-skeleton-stage[\s\S]*visibility:\s*hidden/, "The cloned page must be hidden by default.");
for (const component of ["metrics", "activity", "roster", "list", "grid", "summary", "records", "table", "sections", "content", "body"]) {
  assert.ok(loadingCss.includes(`[data-admin-skeleton-component="${component}"]`), `Loading scope must allow the ${component} data container.`);
}
for (const component of ["heading", "toolbar", "actions", "controls", "tabs", "footer"]) {
  assert.ok(loadingCss.includes(`[data-admin-skeleton-component="${component}"]`), `Loading scope must explicitly suppress ${component}.`);
}
assert.match(loadingCss, /button,[\s\S]*input,[\s\S]*textarea,[\s\S]*select/, "Cloned form controls must stay hidden rather than becoming fake loaders.");

const quickCssIndex = index.indexOf("./css/overview-quick-actions.css");
const shapeCssIndex = index.indexOf("./css/shape-accurate-skeletons.css");
const scopeCssIndex = index.indexOf("./css/loading-scope-overrides.css");
assert.ok(quickCssIndex >= 0, "Admin index must load the quick-action card stylesheet.");
assert.ok(shapeCssIndex >= 0 && scopeCssIndex > shapeCssIndex, "Loading scope overrides must load after the original shape skeleton stylesheet.");

const stabilizationScriptIndex = index.indexOf("./admin-stabilization.js");
const quickScriptIndex = index.indexOf("./overview-quick-actions.js");
const interactionScriptIndex = index.indexOf("./interaction-quality.js");
assert.ok(stabilizationScriptIndex >= 0 && quickScriptIndex > stabilizationScriptIndex, "Quick-action placement must load after Admin stabilization.");
assert.ok(interactionScriptIndex > quickScriptIndex, "Quick-action placement must be installed before request/loading lifecycle reconciliation.");

console.log("Admin loading scope, account exclusion, and Overview quick-action contract passed.");
