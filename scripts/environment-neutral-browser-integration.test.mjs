import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

function filesUnder(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!statSync(absolute).isDirectory()) return [relativePath];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relativePath, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

function assertOrdered(source, fragments) {
  let previous = -1;
  for (const fragment of fragments) {
    const index = source.indexOf(fragment);
    assert.notEqual(index, -1, `Missing ${fragment}`);
    assert.ok(index > previous, `${fragment} is loaded out of order`);
    previous = index;
  }
}

function assertNoBearerConstruction(source, label) {
  assert.doesNotMatch(
    source,
    /headers\s*:\s*\{[^}]*Authorization\s*:/s,
    `${label} constructs an Authorization request header`,
  );
  assert.doesNotMatch(
    source,
    /headers\.(?:set|append)\(\s*["']Authorization["']/iu,
    `${label} mutates an Authorization request header`,
  );
}

test("deployable browser surface keeps project bindings inside reviewed auth boundaries", () => {
  const reviewedProjectRefs = [
    "eecvbssdvarfcykcfrny",
    "cgiukdjwicykrmtkhudh",
  ];
  const reviewedProjectRefConsumers = new Set([
    "auth/recovery-start.js",
    "auth/security-review.js",
    "auth/reset-password.js",
  ]);
  const productionPublishableKey =
    "sb_publishable_caHEJkH8LxlDVU9VFcYrUQ_6HTrCGP8";
  const deployableFiles = [
    ...filesUnder("frontend"),
    ...filesUnder("admin"),
    ...filesUnder("auth"),
    ...filesUnder("player-terminal"),
    "index.html",
    "docs/operations/environments/runtime-config.env.template.js",
  ].filter((relativePath) => /\.(?:html|js|mjs|json|css)$/u.test(relativePath));

  for (const relativePath of deployableFiles) {
    const source = read(relativePath);
    if (!reviewedProjectRefConsumers.has(relativePath)) {
      for (const projectRef of reviewedProjectRefs) {
        assert.equal(
          source.includes(projectRef),
          false,
          `${relativePath} embeds a reviewed project ref outside the auth boundary`,
        );
      }
    }
    assert.equal(
      source.includes(productionPublishableKey),
      false,
      `${relativePath} embeds the production publishable key`,
    );
  }
});

test("browser URL owners use the validated runtime authority", () => {
  for (const relativePath of [
    "frontend/src/core/constants.js",
    "auth/reset-password.js",
    "admin/auth-session-manager.js",
    "player-terminal/host-runtime.js",
    "admin/admin-auth.js",
    "admin/classroom-write-fallback.js",
  ]) {
    assert.match(
      read(relativePath),
      /EconovariaRuntimeConfig/,
      `${relativePath} does not consume runtime config`,
    );
  }

  const apiSource = read("frontend/src/core/api.js");
  assert.match(apiSource, /window\.Econovaria\?\.core\?\.constants/);
  assert.doesNotMatch(apiSource, /supabase\.co/);
  assert.doesNotMatch(apiSource, /sb_publishable_[A-Za-z0-9_-]+/);
});

test("same-origin Player credential adapter creates no remote authority", () => {
  const source = read("admin/player-access-code-bridge.js");
  assert.doesNotMatch(source, /supabase\.co/);
  assert.doesNotMatch(source, /sb_publishable_/);
  assertNoBearerConstruction(source, "Player credential adapter");
  assert.match(source, /\/api\/admin/);
});

test("entry points load deployment config and validator before consumers", () => {
  assertOrdered(read("index.html"), [
    'src="runtime-config.env.js"',
    'src="frontend/src/core/runtime-config.js"',
    'src="frontend/src/core/constants.js"',
    'src="frontend/src/core/api.js"',
    'src="frontend/src/core/login.js"',
  ]);
  assertOrdered(read("admin/index.html"), [
    'src="../runtime-config.env.js"',
    'src="../frontend/src/core/runtime-config.js"',
    'src="./auth-session-manager.js"',
    'src="./admin-auth.js"',
  ]);
  assertOrdered(read("auth/reset-password.html"), [
    'src="../runtime-config.env.js"',
    'src="../frontend/src/core/runtime-config.js"',
    'src="./reset-password.js"',
  ]);
  assertOrdered(read("player-terminal/index.html"), [
    'src="../runtime-config.env.js"',
    'src="../frontend/src/core/runtime-config.js"',
    'src="./host-runtime.js"',
  ]);
});

test("Admin metadata is populated only with the validated BFF authority", () => {
  const runtime = read("frontend/src/core/runtime-config.js");
  const adminHtml = read("admin/index.html");
  assert.match(runtime, /adminBffApiUrl/);
  assert.match(runtime, /adminApiMeta\.content = runtimeConfig\.adminBffApiUrl/);
  assert.match(
    adminHtml,
    /meta name="econovaria-admin-api-base" content=""/,
  );
});

test("recovery and Admin browser consumers use dedicated reviewed boundaries", () => {
  const runtime = read("frontend/src/core/runtime-config.js");
  const recovery = read("auth/reset-password.js");
  const adminManager = read("admin/auth-session-manager.js");
  const adminAuth = read("admin/admin-auth.js");
  const writeAdapter = read("admin/classroom-write-fallback.js");

  assert.match(runtime, /passwordResetApiUrl/);
  assert.match(runtime, /webSessionApiUrl/);
  assert.match(runtime, /adminBffApiUrl/);
  assert.match(recovery, /PASSWORD_RESET_API_URL/);
  assert.doesNotMatch(recovery, /\/auth\/v1\/user/);
  assert.match(adminManager, /credentials:\s*"include"/);
  assert.match(adminManager, /\/session\/bootstrap/);
  assertNoBearerConstruction(adminManager, "Admin session manager");
  assert.match(adminAuth, /ADMIN_BFF_BASE/);
  assert.doesNotMatch(adminAuth, /Bearer/);
  assert.match(writeAdapter, /legacyClassroomFallbackRetired:\s*true/);
  assert.doesNotMatch(writeAdapter, /classroom-api/);
  assertNoBearerConstruction(writeAdapter, "Admin write lifecycle adapter");
});
