import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "admin/world-runtime-console.js"), "utf8");
const loader = fs.readFileSync(path.join(root, "admin/world-runtime-console-loader.js"), "utf8");
const index = fs.readFileSync(path.join(root, "admin/index.html"), "utf8");
const bootstrap = fs.readFileSync(path.join(root, "admin/admin-bootstrap.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/css/world-runtime-console.css"), "utf8");
const operations = fs.readFileSync(path.join(root, "backend/supabase/functions/admin-api/worldRuntimeOperations.ts"), "utf8");

for (const route of [
  "/campaign",
  "/campaign/history?limit=100",
  "/campaign/effects?status=all&limit=100",
  "/campaign/control",
  "/campaign/manual-trigger",
  "/arrival-classes?limit=100",
  "/geography",
  "/routes/state",
  "/travel?limit=100",
  "/residency?limit=100",
]) {
  assert.ok(source.includes(route), `Missing Admin World route ${route}.`);
}

for (const capability of [
  "Scheduler due",
  "emergency_disable",
  "Recover effect",
  "Correct class",
  "Close route",
  "TRAVEL OVERSIGHT",
  "RESIDENCY OVERSIGHT",
]) {
  assert.ok(
    source.toLowerCase().includes(capability.toLowerCase()),
    `Missing Admin World capability ${capability}.`,
  );
}

for (const operation of [
  "handleWorldRuntimeAdminOperation",
  "control_campaign_instance_atomic_v1",
  "execute_campaign_event_atomic_v2",
  "recover_campaign_effect_command_v1",
  "correct_arrival_class_assignment_v1",
  "apply_world_route_state_v1",
]) {
  assert.ok(
    operations.includes(operation),
    `Missing Admin World operation ${operation}.`,
  );
}

assert.match(index, /admin-bootstrap\.js/);
assert.match(bootstrap, /world-runtime-console-loader\.js/);
assert.doesNotMatch(index, /<link[^>]+world-runtime-console\.css/);
assert.match(loader, /const WORLD_STYLESHEET = "\.\/css\/world-runtime-console\.css"/);
assert.match(loader, /data-admin-world-stylesheet/);
assert.match(loader, /await import\("\.\/world-runtime-console\.js"\)/);
assert.doesNotMatch(loader, /MutationObserver|fetch\s*\(|XMLHttpRequest|SUPABASE_SERVICE_ROLE_KEY|service_role|authorization\s*:/i);
assert.doesNotMatch(loader, /import\s*\(\s*[^"']/);
assert.match(source, /aria-modal/);
assert.match(source, /aria-live/);
assert.match(source, /EconovariaAdminModalAccessibility/);
assert.match(source, /econovaria:admin-mounted/);
assert.match(source, /scheduleLauncher/);
assert.match(source, /window\.setTimeout\(createLauncher/);
assert.match(source, /AbortController/);
assert.match(source, /cache:\s*"no-store"/);
assert.match(source, /window\.addEventListener\("offline"/);
assert.match(source, /Connection restored/);
assert.match(source, /Number\(journey\.total_cost_minor\s*\?\?\s*0\)\s*\/\s*100/);
assert.doesNotMatch(source, /\$\{text\(journey\.currency_code\)\}\s+\$\{text\(journey\.total_cost_minor/);
assert.match(css, /@media\(max-width:900px\)/);
assert.match(css, /@media\(max-width:560px\)/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /forced-colors/);
for (const forbidden of [
  /(^|[},\s])body\s*\{/m,
  /(^|[},\s])html\s*\{/m,
  /\.admin-terminal-shell\s*\{/m,
  /\[data-admin-section\]\s*\{/m,
]) {
  assert.doesNotMatch(css, forbidden);
}

assert.doesNotMatch(source, /MutationObserver/);
assert.doesNotMatch(source, /@ts-nocheck|\beval\s*\(|new Function|document\.write/);
assert.doesNotMatch(source, /innerHTML\s*=\s*(?:payload|data|snapshot)/);
assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|service_role|authorization\s*:/i);
assert.doesNotMatch(index, /world-runtime-source-snapshot|materializer|reconstruction/);

console.log("Admin World runtime console contract passed");
