import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PLAYER_SKELETON_ROUTES, renderRouteSkeleton } from "../src/components/route-skeletons.js";

const expectedRoutes = [
  "dashboard", "news", "market", "portfolio", "store", "contracts", "inventory",
  "banking", "messages", "marketplace", "business", "crafting", "loans", "progression", "profile"
];

assert.deepEqual([...PLAYER_SKELETON_ROUTES].sort(), [...expectedRoutes].sort(), "Every approved route must have one skeleton renderer.");

for (const route of expectedRoutes) {
  const html = renderRouteSkeleton(route);
  assert.match(html, new RegExp(`data-skeleton-route="${route}"`), `${route} must identify its skeleton.`);
  assert.match(html, /role="status"/, `${route} must expose one polite loading status.`);
  assert.match(html, /<h2>[^<]+<\/h2>/, `${route} must preserve the real page heading.`);
  assert.ok((html.match(/player-terminal-skeleton-surface/g) || []).length >= 2, `${route} must skeletonize its principal data containers.`);
  assert.ok((html.match(/aria-busy="true"/g) || []).length >= 2, `${route} must mark the loading containers busy.`);
  assert.ok((html.match(/player-terminal-skeleton-shape/g) || []).length > 6, `${route} must provide useful card-level placeholder geometry.`);
  assert.doesNotMatch(html, /<(?:button|input|select|textarea)\b/i, `${route} loading output must not create fake controls.`);
  assert.doesNotMatch(html, /player-terminal-heading-actions|is-control|is-filter|is-tab|is-field/i, `${route} must not skeletonize header actions, filters, tabs, or forms.`);
  assert.doesNotMatch(html, /player_uuid|playerUuid|recipientUuid|ownerUuid/i, `${route} skeleton must not expose ownership identifiers.`);
}

assert.match(renderRouteSkeleton("world"), /data-skeleton-route="dashboard"/, "World loading must preserve the Dashboard world-map shell.");
assert.match(renderRouteSkeleton("not-a-route"), /data-skeleton-route="dashboard"/, "Unknown routes must fail closed to the Dashboard skeleton.");

const skeletonSource = await readFile(new URL("../src/components/route-skeletons.js", import.meta.url), "utf8");
assert.match(skeletonSource, /switch\s*\(normalizedRoute\)/, "Skeleton routing must use explicit static dispatch.");
assert.doesNotMatch(skeletonSource, /\bRENDERERS\s*\[/, "Skeleton routing must not use dynamic renderer table invocation.");
for (const route of expectedRoutes.filter((route) => route !== "dashboard")) {
  assert.match(skeletonSource, new RegExp(`case ["']${route}["']:`), `${route} must have an explicit dispatch case.`);
}
assert.match(skeletonSource, /case ["']dashboard["']:[\s\S]*default:[\s\S]*dashboardSkeleton\(\)/, "Dashboard must remain the explicit fail-closed default.");

const css = await readFile(new URL("../css/player-terminal-skeletons.css", import.meta.url), "utf8");
for (const marker of [
  ".player-terminal-route-skeleton",
  ".player-terminal-skeleton-surface",
  ".player-terminal-skeleton-map",
  ".player-terminal-skeleton-chart",
  "@media (prefers-reduced-motion: reduce)",
  "animation: none"
]) {
  assert.ok(css.includes(marker), `Skeleton stylesheet is missing ${marker}.`);
}
for (const forbidden of [".is-control", ".is-filter", ".is-tab", ".is-field"]) {
  assert.ok(!css.includes(forbidden), `Skeleton stylesheet must not define fake control geometry: ${forbidden}.`);
}

const geometryCss = await readFile(new URL("../css/player-terminal-skeleton-geometry.css", import.meta.url), "utf8");
assert.ok(geometryCss.includes(".player-terminal-marketplace-detail"), "Marketplace card geometry must remain calibrated.");
assert.ok(geometryCss.includes(".player-terminal-inventory-card"), "Inventory card geometry must remain calibrated.");
assert.ok(geometryCss.includes("grid-template-columns: 96px minmax(0, 1fr)"), "Inventory skeleton must retain its two-column card footprint.");

const layoutSource = await readFile(new URL("../src/components/layout.js", import.meta.url), "utf8");
assert.match(layoutSource, /renderContextNav|player-terminal-context-nav/, "Skeleton work must preserve the existing Player context navigation.");
assert.doesNotMatch(layoutSource, /function renderPageContent\(pageHtml\)/, "Skeleton work must not rewrite page-heading actions.");

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.ok(index.includes("css/player-terminal-skeletons.css"), "Skeleton stylesheet must be loaded by index.html.");
assert.ok(index.includes("css/player-terminal-skeleton-geometry.css"), "Card geometry calibration must load after the base skeleton stylesheet.");

console.log(`Skeleton registry passed: ${expectedRoutes.length} routes preserve the existing shell and actions, skeletonize only principal data containers, avoid fake controls, and respect reduced motion.`);
