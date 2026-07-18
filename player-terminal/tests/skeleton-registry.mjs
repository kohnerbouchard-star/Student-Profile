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
  assert.match(html, /aria-busy="true"/, `${route} must expose busy state.`);
  assert.match(html, /role="status"/, `${route} must expose a polite loading status.`);
  assert.match(html, /<h2>[^<]+<\/h2>/, `${route} must preserve the page heading.`);
  assert.ok((html.match(/player-terminal-skeleton-shape/g) || []).length > 8, `${route} must use a shape-specific layout.`);
  assert.doesNotMatch(html, /player_uuid|playerUuid|recipientUuid|ownerUuid/i, `${route} skeleton must not expose ownership identifiers.`);
}

assert.match(renderRouteSkeleton("world"), /data-skeleton-route="dashboard"/, "World loading must preserve the Dashboard world-map shell.");
assert.match(renderRouteSkeleton("not-a-route"), /data-skeleton-route="dashboard"/, "Unknown routes must fail closed to the Dashboard skeleton.");

const skeletonSource = await readFile(new URL("../src/components/route-skeletons.js", import.meta.url), "utf8");
assert.match(skeletonSource, /switch\s*\(normalizedRoute\)/, "Skeleton routing must use explicit static dispatch.");
assert.doesNotMatch(skeletonSource, /\bRENDERERS\s*\[/, "Skeleton routing must not use dynamic renderer table invocation.");
assert.doesNotMatch(skeletonSource, /\[[^\]]*normalizedRoute[^\]]*\]\s*\(/, "Normalized routes must never be invoked as computed methods.");
for (const route of expectedRoutes.filter((route) => route !== "dashboard")) {
  assert.match(skeletonSource, new RegExp(`case ["']${route}["']:`), `${route} must have an explicit dispatch case.`);
}
assert.match(skeletonSource, /case ["']dashboard["']:[\s\S]*default:[\s\S]*dashboardSkeleton\(\)/, "Dashboard must remain the explicit fail-closed default.");

const css = await readFile(new URL("../css/player-terminal-skeletons.css", import.meta.url), "utf8");
for (const marker of [
  ".player-terminal-route-skeleton",
  ".player-terminal-skeleton-map",
  ".player-terminal-skeleton-chart",
  "@media (prefers-reduced-motion: reduce)",
  "animation: none"
]) {
  assert.ok(css.includes(marker), `Skeleton stylesheet is missing ${marker}.`);
}

const geometryCss = await readFile(new URL("../css/player-terminal-skeleton-geometry.css", import.meta.url), "utf8");
for (const marker of [
  ".player-terminal-marketplace-detail",
  ".player-terminal-inventory-card",
  "grid-template-columns: 96px minmax(0, 1fr) 132px"
]) {
  assert.ok(geometryCss.includes(marker), `Skeleton geometry stylesheet is missing ${marker}.`);
}

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.ok(index.includes("css/player-terminal-skeletons.css"), "Skeleton stylesheet must be loaded by index.html.");
assert.ok(index.includes("css/player-terminal-skeleton-geometry.css"), "Calibrated skeleton geometry must be loaded after the base skeleton stylesheet.");

console.log(`Skeleton registry passed: ${expectedRoutes.length} route layouts, explicit static dispatch, accessibility state, privacy, reduced-motion controls, and calibrated dense shells verified.`);
