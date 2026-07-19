import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const loadingCss = await readFile(new URL("../admin/css/loading-scope-overrides.css", import.meta.url), "utf8");
const index = await readFile(new URL("../admin/index.html", import.meta.url), "utf8");

assert.match(loadingCss, /background:\s*transparent\s*!important/, "The route overlay must not paint an opaque full-page loading screen.");
assert.match(loadingCss, /> \.admin-shape-skeleton-stage[\s\S]*visibility:\s*hidden/, "The cloned page must be hidden by default.");
for (const component of ["metrics", "activity", "roster", "list", "grid", "summary", "records", "table", "sections", "content", "body"]) {
  assert.ok(loadingCss.includes(`[data-admin-skeleton-component="${component}"]`), `Loading scope must allow the ${component} data container.`);
}
for (const component of ["heading", "toolbar", "actions", "controls", "tabs", "footer"]) {
  assert.ok(loadingCss.includes(`[data-admin-skeleton-component="${component}"]`), `Loading scope must explicitly suppress ${component}.`);
}
assert.match(loadingCss, /button,[\s\S]*input,[\s\S]*textarea,[\s\S]*select/, "Cloned form controls must stay hidden rather than becoming fake loaders.");

const shapeCssIndex = index.indexOf("./css/shape-accurate-skeletons.css");
const scopeCssIndex = index.indexOf("./css/loading-scope-overrides.css");
assert.ok(shapeCssIndex >= 0 && scopeCssIndex > shapeCssIndex, "Loading scope overrides must load after the original shape skeleton stylesheet.");
assert.ok(!index.includes("overview-quick-actions"), "Loader-only work must not move or replace Admin actions.");

console.log("Admin loader-only scope contract passed.");
