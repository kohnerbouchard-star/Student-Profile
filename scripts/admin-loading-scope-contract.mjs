import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const compatibility = await readFile(new URL("../admin/overview-quick-actions.js", import.meta.url), "utf8");
const bootstrap = await readFile(new URL("../admin/admin-bootstrap.js", import.meta.url), "utf8");
const interactionQuality = await readFile(new URL("../admin/interaction-quality.js", import.meta.url), "utf8");
const interactionQualityCss = await readFile(new URL("../admin/css/interaction-quality.css", import.meta.url), "utf8");
const responsiveGrid = await readFile(new URL("../admin/css/responsive-card-grid.css", import.meta.url), "utf8");
const sessionSkeleton = await readFile(new URL("../admin/css/session-skeleton.css", import.meta.url), "utf8");
const loadingScannerSmoke = await readFile(new URL("./admin-loading-scanner-smoke.mjs", import.meta.url), "utf8");
const index = await readFile(new URL("../admin/index.html", import.meta.url), "utf8");

assert.match(compatibility, /compatibility-noop/, "The former Quick Actions controller must remain an inert compatibility shim.");
assert.match(compatibility, /MAX_BOOT_FRAMES\s*=\s*0/, "The compatibility shim must not schedule mount retries.");
assert.doesNotMatch(
  compatibility,
  /document\.|querySelector|insertAdjacentElement|\.append\(|\.prepend\(|\.remove\(|setAttribute\(|removeAttribute\(/,
  "Loader-only work must not query, move, hide, create, or remove interface elements."
);

assert.match(index, /\.\/css\/session-skeleton\.css/, "The single Admin startup loader must use its dedicated stylesheet.");
assert.match(index, /\.\/css\/responsive-card-grid\.css/, "The startup skeleton and live cards must load shared grid geometry.");
assert.doesNotMatch(index, /shape-accurate-skeletons\.js/, "The duplicate shape-skeleton runtime must not be loaded.");
assert.doesNotMatch(index, /shape-accurate-skeletons\.css/, "The removed shape-skeleton stylesheet must not be loaded.");
assert.doesNotMatch(index, /loading-scope-overrides\.css/, "The removed shape-loader scope overrides must not be loaded.");
assert.doesNotMatch(
  bootstrap,
  /shape-accurate-skeleton-lifecycle\.js/,
  "The removed shape-skeleton lifecycle must not be dynamically loaded."
);

assert.doesNotMatch(interactionQuality, /initialPageLoad/, "The page loader must not have an automatic initial-load mode.");
assert.match(
  interactionQuality,
  /detail\.pageRead\s*&&\s*navigationLoad/,
  "Page skeleton requests must be limited to explicit in-console navigation."
);
assert.doesNotMatch(
  interactionQuality,
  /reconcile\([^)]*\)[\s\S]*showPageSkeleton\(\)[\s\S]*900/,
  "Mount reconciliation must not create a second startup skeleton."
);
assert.doesNotMatch(
  interactionQualityCss,
  /\.admin-session-skeleton(?:\b|__)/,
  "Route-loading styles must not override the authoritative session skeleton."
);

assert.match(sessionSkeleton, /single startup loader/i, "The retained loader stylesheet must declare its single-loader ownership.");
assert.match(
  responsiveGrid,
  /\.admin-session-skeleton__metrics,\s*\n\.admin-terminal-action-grid/,
  "The skeleton metrics and live overview cards must share one selector contract."
);
assert.match(responsiveGrid, /repeat\([\s\S]*auto-fit[\s\S]*220px[\s\S]*1fr/, "The shared grid must derive columns from available width.");
assert.doesNotMatch(
  loadingScannerSmoke,
  /getBoundingClientRect|gridTemplateColumns|gridColumnCount|expectedColumns/,
  "Browser loading tests must not sample or compare skeleton and live-card geometry."
);
assert.match(
  loadingScannerSmoke,
  /responsive-card-grid\.css/,
  "Browser loading tests must verify that the repository-owned shared stylesheet is loaded."
);

console.log("Admin single-loader and CSS-owned responsive card-grid contract passed.");
