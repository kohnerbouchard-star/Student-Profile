import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const compatibility = await readFile(new URL("../admin/overview-quick-actions.js", import.meta.url), "utf8");
const loadingCss = await readFile(new URL("../admin/css/loading-scope-overrides.css", import.meta.url), "utf8");
const index = await readFile(new URL("../admin/index.html", import.meta.url), "utf8");

assert.match(compatibility, /compatibility-noop/, "The former Quick Actions controller must remain an inert compatibility shim.");
assert.match(compatibility, /MAX_BOOT_FRAMES\s*=\s*0/, "The compatibility shim must not schedule mount retries.");
assert.doesNotMatch(
  compatibility,
  /document\.|querySelector|insertAdjacentElement|\.append\(|\.prepend\(|\.remove\(|setAttribute\(|removeAttribute\(/,
  "Loader-only work must not query, move, hide, create, or remove interface elements."
);

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

console.log("Admin loader-only scope and inert compatibility contract passed.");
