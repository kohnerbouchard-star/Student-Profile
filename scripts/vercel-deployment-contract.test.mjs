import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAttendanceRouteHarness } from "./fixtures/admin-attendance-route-harness.mjs";

import {
  BROWSER_ROOTS,
  VERCEL_CRITICAL_ROUTE_CONTRACTS,
  buildVercelDeployment,
  validateCriticalVercelRoutes,
} from "./build-vercel-runtime-config.mjs";

const require = createRequire(import.meta.url);
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const productionEnvironment = Object.freeze({
  ECONOVARIA_ENVIRONMENT: "production",
  ECONOVARIA_PROJECT_REF: "cgiukdjwicykrmtkhudh",
  ECONOVARIA_SUPABASE_URL: "https://cgiukdjwicykrmtkhudh.supabase.co",
  ECONOVARIA_SUPABASE_PUBLISHABLE_KEY:
    "sb_publishable_contract-test-not-a-secret",
});

const criticalRouteFixtures = new Map([
  [
    "api/admin-session/[...path].js",
    `"use strict";\nconst { proxyAdminBff } = require("../_admin-bff-proxy.js");\nconst { canonicalCatchAllPath } = require("../_canonical-bff-path.js");\nmodule.exports = function route(request, response) {\n  const normalizedRequest = Object.create(request);\n  normalizedRequest.query = { path: canonicalCatchAllPath(request.url, "/api/admin-session") };\n  return proxyAdminBff(normalizedRequest, response, { proxyAdmin: false });\n};\n`,
  ],
  [
    "api/admin-proxy.js",
    `"use strict";\nconst { proxyAdminBff } = require("./_admin-bff-proxy.js");\nmodule.exports = function route(request, response) {\n  const path = request.query?.path;\n  if (typeof path !== "string") return response.end(JSON.stringify({ error: { code: "invalid_proxy_path" } }));\n  const normalizedRequest = Object.create(request);\n  normalizedRequest.query = { path };\n  return proxyAdminBff(normalizedRequest, response, { proxyAdmin: true });\n};\n`,
  ],
  [
    "api/admin/[...path].js",
    `"use strict";\nconst { proxyAdminBff } = require("../_admin-bff-proxy.js");\nconst { canonicalCatchAllPath } = require("../_canonical-bff-path.js");\nmodule.exports = function route(request, response) {\n  const normalizedRequest = Object.create(request);\n  normalizedRequest.query = { path: canonicalCatchAllPath(request.url, "/api/admin") };\n  return proxyAdminBff(normalizedRequest, response, { proxyAdmin: true });\n};\n`,
  ],
  [
    "api/player-session/[...path].js",
    `"use strict";\nconst { proxyPlayerBff } = require("../_player-bff-proxy.js");\nconst { canonicalCatchAllPath } = require("../_canonical-bff-path.js");\nmodule.exports = function route(request, response) {\n  const normalizedRequest = Object.create(request);\n  normalizedRequest.query = { path: canonicalCatchAllPath(request.url, "/api/player-session") };\n  return proxyPlayerBff(normalizedRequest, response, { proxyPlayer: false });\n};\n`,
  ],
  [
    "api/player-session-proxy.js",
    `"use strict";\nconst { proxyPlayerBff } = require("./_player-bff-proxy.js");\nmodule.exports = function route(request, response) {\n  const path = request.query?.path;\n  if (typeof path !== "string") return response.end(JSON.stringify({ error: { code: "invalid_proxy_path" } }));\n  const normalizedRequest = Object.create(request);\n  normalizedRequest.query = { path };\n  return proxyPlayerBff(normalizedRequest, response, { proxyPlayer: false });\n};\n`,
  ],
  [
    "api/player/[...path].js",
    `"use strict";\nconst { proxyPlayerBff } = require("../_player-bff-proxy.js");\nconst { canonicalCatchAllPath } = require("../_canonical-bff-path.js");\nmodule.exports = function route(request, response) {\n  const normalizedRequest = Object.create(request);\n  normalizedRequest.query = { path: canonicalCatchAllPath(request.url, "/api/player") };\n  return proxyPlayerBff(normalizedRequest, response, { proxyPlayer: true });\n};\n`,
  ],
  [
    "api/player-proxy.js",
    `"use strict";\nconst { proxyPlayerBff } = require("./_player-bff-proxy.js");\nmodule.exports = function route(request, response) {\n  const path = request.query?.path;\n  if (typeof path !== "string") return response.end(JSON.stringify({ error: { code: "invalid_proxy_path" } }));\n  const normalizedRequest = Object.create(request);\n  normalizedRequest.query = { path };\n  return proxyPlayerBff(normalizedRequest, response, { proxyPlayer: true });\n};\n`,
  ],
  [
    "api/admin-session/mfa/enroll.js",
    `"use strict";\nconst { proxyAdminBff } = require("../../_admin-bff-proxy.js");\nmodule.exports = function route(request, response) {\n  const normalizedRequest = Object.create(request);\n  normalizedRequest.query = { path: ["mfa", "enroll"] };\n  return proxyAdminBff(normalizedRequest, response, { proxyAdmin: false });\n};\n`,
  ],
  [
    "api/admin-session/mfa/verify.js",
    `"use strict";\nconst { proxyAdminBff } = require("../../_admin-bff-proxy.js");\nmodule.exports = function route(request, response) {\n  const normalizedRequest = Object.create(request);\n  normalizedRequest.query = { path: ["mfa", "verify"] };\n  return proxyAdminBff(normalizedRequest, response, { proxyAdmin: false });\n};\n`,
  ],
  [
    "api/admin/session/bootstrap.js",
    `"use strict";\nconst { proxyAdminBff } = require("../../_admin-bff-proxy.js");\nmodule.exports = function route(request, response) {\n  const normalizedRequest = Object.create(request);\n  normalizedRequest.query = { path: ["session", "bootstrap"] };\n  return proxyAdminBff(normalizedRequest, response, { proxyAdmin: true });\n};\n`,
  ],
  [
    "api/admin-logout.js",
    `"use strict";\nconst { proxyAdminBff } = require("./_admin-bff-proxy.js");\nmodule.exports = function route(request, response) {\n  const normalizedRequest = Object.create(request);\n  normalizedRequest.query = { path: ["logout"] };\n  return proxyAdminBff(normalizedRequest, response, { proxyAdmin: false });\n};\n`,
  ],
  [
    "api/password-reset.js",
    `"use strict";\nconst MAX_BODY_BYTES = 4_096;\nmodule.exports = async function passwordResetProxy(request, response) {\n  const match = [null, "token"];\n  const clientIp = String(request.headers?.["x-vercel-forwarded-for"] || "");\n  return fetch("https://example.supabase.co/functions/v1/password-reset-api", {\n    method: "POST",\n    headers: { Authorization: \`Bearer \${match[1]}\`, "x-real-ip": clientIp },\n    redirect: "manual"\n  });\n};\n`,
  ],
]);

async function fixtureRepository(root) {
  for (const relativePath of BROWSER_ROOTS) {
    const target = path.join(root, relativePath);
    if (relativePath === "index.html") {
      await writeFile(target, "<!doctype html><title>Econovaria</title>\n");
      continue;
    }
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "fixture.txt"), `${relativePath}\n`);
  }

  for (const [relativePath, source] of criticalRouteFixtures) {
    const target = path.join(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source);
  }

  await mkdir(path.join(root, "scripts"), { recursive: true });
  await writeFile(path.join(root, "scripts", "private-fixture.txt"), "private\n");
}

test("critical route manifest covers every protected authentication and gameplay entry point", () => {
  assert.deepEqual(
    VERCEL_CRITICAL_ROUTE_CONTRACTS.map((contract) => contract.relativePath),
    [...criticalRouteFixtures.keys()],
  );
});

test("builds an isolated static deployment without swallowing Vercel functions", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "econovaria-vercel-"));
  const fixtureRoot = path.join(temporaryRoot, "repository");
  const outputRoot = path.join(temporaryRoot, "dist");
  await mkdir(fixtureRoot, { recursive: true });
  await fixtureRepository(fixtureRoot);

  try {
    const result = await buildVercelDeployment({
      repoRoot: fixtureRoot,
      outputRoot,
      environment: productionEnvironment,
    });

    assert.equal(result.outputRoot, outputRoot);
    for (const relativePath of BROWSER_ROOTS) {
      const metadata = await stat(path.join(outputRoot, relativePath));
      assert.equal(
        relativePath === "index.html" ? metadata.isFile() : metadata.isDirectory(),
        true,
      );
    }

    const runtimeSource = await readFile(
      path.join(outputRoot, "runtime-config.env.js"),
      "utf8",
    );
    assert.match(runtimeSource, /"environment": "production"/);
    assert.match(runtimeSource, /cgiukdjwicykrmtkhudh/);
    assert.doesNotMatch(runtimeSource, /sb_secret_|service_role/i);

    await assert.rejects(access(path.join(outputRoot, "api")));
    await assert.rejects(access(path.join(outputRoot, "scripts")));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

const LEGACY_SCANNER_ASSETS = Object.freeze([
  "classroom-write-fallback.js",
  "create-action-adapter.js",
  "scanner-auto-refresh.js",
  "scanner-reward-localization.js",
]);

async function traceBuiltAdminScripts(outputRoot, entryUrl, html) {
  const sources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/giu)].map((match) => new URL(match[1], entryUrl));
  const visited = new Set();
  for (const script of sources) {
    assert.equal(script.origin, entryUrl.origin, "the built shell only imports local scripts");
    if (visited.has(script.pathname)) continue;
    visited.add(script.pathname);
    assert.ok(!LEGACY_SCANNER_ASSETS.includes(path.posix.basename(script.pathname)));
    const source = await readFile(path.join(outputRoot, script.pathname), "utf8");
    for (const asset of LEGACY_SCANNER_ASSETS) {
      assert.ok(!source.includes(asset), `Legacy scanner reference in ${script.pathname}: ${asset}`);
    }
    const declarations = /^\s*(?:import|export)\s+(?:[^"';]*?\sfrom\s*)?["']([^"']+)["']/gmu;
    const dynamicImports = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;
    for (const expression of [declarations, dynamicImports]) {
      for (const [, specifier] of source.matchAll(expression)) sources.push(new URL(specifier, script));
    }
  }
  return visited;
}

test("real Vercel artifact binds direct Admin HTML and scoped scanner POST to V2 only", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "econovaria-built-admin-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const outputRoot = path.join(temporaryRoot, "dist");
  await buildVercelDeployment({
    repoRoot: repositoryRoot, outputRoot,
    environment: {
      ECONOVARIA_ENVIRONMENT: "staging",
      ECONOVARIA_PROJECT_REF: "artifactfixture00001",
      ECONOVARIA_SUPABASE_URL: "https://artifactfixture00001.supabase.co",
      ECONOVARIA_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_artifact-fixture-only",
    },
  });
  const gameId = "10000000-0000-4000-8000-000000000001";
  const entryUrl = new URL(`https://artifact.invalid/admin/index.html?game=${gameId}#attendance`);
  const raw = await readFile(path.join(repositoryRoot, "admin/index.html"), "utf8");
  assert.match(raw, /classroom-write-fallback\.js/);
  const built = await readFile(path.join(outputRoot, entryUrl.pathname), "utf8");
  assert.equal(built, await readFile(path.join(outputRoot, "admin/v2.html"), "utf8"));
  assert.match(built, /<meta name="econovaria-admin-ui-version" content="2"/);
  for (const asset of LEGACY_SCANNER_ASSETS) {
    assert.ok(!built.includes(asset));
    assert.deepEqual(await readFile(path.join(outputRoot, "admin", asset)), await readFile(path.join(repositoryRoot, "admin", asset)));
  }
  const graph = await traceBuiltAdminScripts(outputRoot, entryUrl, built);
  for (const name of ["main.js", "app.js", "app-controllers.js", "api/admin-bff-transport.js",
    ...["AttendanceController.js", "AttendanceApi.js", "AttendanceRoute.js", "AttendanceScannerPanel.js"].map((file) => `routes/attendance/${file}`)]) {
    assert.ok(graph.has(`/admin/v2/src/${name}`), `Built direct Admin graph includes ${name}`);
  }

  // Execute the artifact's controller, scanner panel, API and BFF transport
  // with component doubles and a local synthetic Fetch; no browser or server.
  const load = (file) => import(pathToFileURL(path.join(outputRoot, "admin/v2/src", file)).href);
  const [{ createAttendanceApi }, { createAdminBffTransport }, dataStateModule, errorEnvelopeModule, readModelModule] =
    await Promise.all(["routes/attendance/AttendanceApi.js", "api/admin-bff-transport.js",
      "core/data-state.js", "core/error-envelope.js", "routes/attendance/AttendanceReadModel.js"].map(load));
  const h = createAttendanceRouteHarness({ rootDirectory: outputRoot, dataStateModule, errorEnvelopeModule, readModelModule });
  const requests = [];
  const csrfToken = "B".repeat(43);
  const uuid = "40000000-0000-4000-8000-000000000004";
  const prefix = `${entryUrl.origin}/api/admin/games/${gameId}/attendance`;
  const transport = createAdminBffTransport({
    selectedGameId: gameId, session: { authenticated: true, csrfToken }, runtimeConfig: {},
    locationLike: entryUrl, cryptoObject: { randomUUID: () => uuid },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      if (url === `${prefix}/today` && init.method === "GET") {
        return Response.json({ data: { attendanceDate: "2026-08-07", timezone: "Asia/Seoul", attendanceRows: [] } });
      }
      assert.equal(url, `${prefix}/scan`);
      assert.equal(init.method, "POST");
      return Response.json({ data: { player: { displayName: "Synthetic Player" },
        attendance: { status: "present", wasCreated: true }, reward: { amount: 4, currencyCode: "ECO" } } });
    },
  });
  const controller = h.createAttendanceController({
    api: createAttendanceApi({ fetchImpl: transport }), selectedGameId: gameId,
    hasPermission: (key) => key === "attendance.manage", cryptoObject: { randomUUID: () => uuid },
    onChange: () => controller.render(), setTimeoutImpl: () => Symbol(),
  });
  t.after(() => controller.destroy());
  await controller.load();
  h.nodes.findLast((node) => node.id === "adminAttendanceScannerInput").value = "SYNTHETIC-BUILT-CARD";
  await h.nodes.findLast((node) => node.className === "admin-attendance-route__scanner-form").dispatch("submit");
  assert.deepEqual(requests.map(({ url, init }) => [url, init.method]), [[`${prefix}/today`, "GET"], [`${prefix}/scan`, "POST"]]);
  const write = requests[1].init;
  assert.equal(write.headers.get("x-econovaria-game-id"), gameId);
  assert.equal(write.headers.get("x-econovaria-csrf-token"), csrfToken);
  assert.equal(write.headers.get("idempotency-key"), `admin.attendance.scan.${uuid}.1`);
  assert.equal(write.headers.has("authorization"), false);
  assert.equal(JSON.parse(write.body).playerId, "SYNTHETIC-BUILT-CARD");
  assert.deepEqual(h.nodes.findLast((node) => node.id === "adminAttendanceScannerStatus").children.map(({ textContent }) => textContent),
    ["Synthetic Player checked in.", "present · Reward 4 ECO"]);
});

test("rejects a placeholder in any protected authentication route before output", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "econovaria-vercel-route-"));
  const fixtureRoot = path.join(temporaryRoot, "repository");
  const outputRoot = path.join(temporaryRoot, "dist");
  await mkdir(fixtureRoot, { recursive: true });
  await fixtureRepository(fixtureRoot);
  await writeFile(
    path.join(fixtureRoot, "api", "admin-session", "mfa", "enroll.js"),
    "placeholder\n",
  );

  try {
    await assert.rejects(
      validateCriticalVercelRoutes({ repoRoot: fixtureRoot }),
      /placeholder: api\/admin-session\/mfa\/enroll\.js/u,
    );
    await assert.rejects(
      buildVercelDeployment({
        repoRoot: fixtureRoot,
        outputRoot,
        environment: productionEnvironment,
      }),
      /placeholder: api\/admin-session\/mfa\/enroll\.js/u,
    );
    await assert.rejects(access(outputRoot));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("rejects missing recovery routes and retired or unsafe proxy targets", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "econovaria-vercel-auth-"));
  const fixtureRoot = path.join(temporaryRoot, "repository");
  await mkdir(fixtureRoot, { recursive: true });
  await fixtureRepository(fixtureRoot);

  try {
    const recoveryPath = path.join(fixtureRoot, "api", "password-reset.js");
    await rm(recoveryPath);
    await assert.rejects(
      validateCriticalVercelRoutes({ repoRoot: fixtureRoot }),
      /missing: api\/password-reset\.js/u,
    );

    await writeFile(recoveryPath, criticalRouteFixtures.get("api/password-reset.js"));
    await writeFile(
      path.join(fixtureRoot, "api", "admin-logout.js"),
      `${criticalRouteFixtures.get("api/admin-logout.js")}\n// retired admin-logout-api target\n`,
    );
    await assert.rejects(
      validateCriticalVercelRoutes({ repoRoot: fixtureRoot }),
      /retired or unsafe target: api\/admin-logout\.js/u,
    );

    await writeFile(
      path.join(fixtureRoot, "api", "admin-logout.js"),
      criticalRouteFixtures.get("api/admin-logout.js"),
    );
    await writeFile(
      path.join(fixtureRoot, "api", "player-proxy.js"),
      `${criticalRouteFixtures.get("api/player-proxy.js")}\nfetch("https://unsafe.supabase.co/functions/v1/player-api");\n`,
    );
    await assert.rejects(
      validateCriticalVercelRoutes({ repoRoot: fixtureRoot }),
      /retired or unsafe target: api\/player-proxy\.js/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("Player route normalization preserves route identity and strips Vercel metadata", () => {
  const { canonicalCatchAllPath } = require("../api/_canonical-bff-path.js");
  const playerProxy = require("../api/_player-bff-proxy.js").__test;

  assert.deepEqual(
    canonicalCatchAllPath(
      "/api/player-session/status?...path=status&trace=1",
      "/api/player-session",
    ),
    ["status"],
  );
  assert.deepEqual(
    canonicalCatchAllPath(
      "/api/player/players/me?limit=10",
      "/api/player",
    ),
    ["players", "me"],
  );
  assert.equal(
    canonicalCatchAllPath("/api/player/%2e%2e/admin", "/api/player"),
    "",
  );
  assert.equal(
    canonicalCatchAllPath("/api/player/%E0%A4%A", "/api/player"),
    "",
  );
  assert.equal(playerProxy.normalizedPath(["players", "me"]), "/players/me");
  assert.equal(
    playerProxy.filteredSearch(
      "/api/player/players/me?...path=players%2Fme&path=legacy&limit=10",
    ),
    "?limit=10",
  );
});

test("Vercel config preserves and explicitly rewrites Player API functions", async () => {
  const configuration = JSON.parse(
    await readFile(path.join(repositoryRoot, "vercel.json"), "utf8"),
  );

  assert.equal(configuration.framework, null);
  assert.equal(configuration.outputDirectory, "dist");
  assert.equal(
    configuration.buildCommand,
    "node scripts/build-vercel-runtime-config.mjs",
  );
  assert.equal(configuration.functions?.["api/**/*.js"]?.maxDuration, 30);
  assert.deepEqual(
    configuration.rewrites.filter((entry) => entry.source.startsWith("/api/player")),
    [
      {
        source: "/api/player-session/:path*",
        destination: "/api/player-session-proxy?path=:path*",
      },
      {
        source: "/api/player/:path*",
        destination: "/api/player-proxy?path=:path*",
      },
    ],
  );

  for (const relativePath of [
    "api/admin-session/[...path].js",
    "api/player-session/[...path].js",
    "api/player-session-proxy.js",
    "api/player/[...path].js",
    "api/player-proxy.js",
  ]) {
    const route = await stat(path.join(repositoryRoot, relativePath));
    assert.equal(route.isFile(), true);
  }
});


for (const environment of ["staging", "production"]) {
  test(`generated ${environment} config executes with same-origin BFF transport`, async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "econovaria-bff-config-"));
    const fixtureRoot = path.join(temporaryRoot, "repository");
    const outputRoot = path.join(temporaryRoot, "dist");
    await mkdir(fixtureRoot, { recursive: true });
    await fixtureRepository(fixtureRoot);
    const projectRef = environment === "staging" ? "eecvbssdvarfcykcfrny" : productionEnvironment.ECONOVARIA_PROJECT_REF;
    try {
      await buildVercelDeployment({ repoRoot: fixtureRoot, outputRoot, environment: {
        ...productionEnvironment, ECONOVARIA_ENVIRONMENT: environment,
        ECONOVARIA_PROJECT_REF: projectRef,
        ECONOVARIA_SUPABASE_URL: `https://${projectRef}.supabase.co`,
      } });
      const window = { location: { origin: "https://synthetic-preview.example" } };
      const context = vm.createContext({ window, URL });
      vm.runInContext(await readFile(path.join(outputRoot, "runtime-config.env.js"), "utf8"), context);
      vm.runInContext(await readFile(path.join(repositoryRoot, "frontend/src/core/runtime-config.js"), "utf8"), context);
      const runtime = window.EconovariaRuntimeConfig;
      assert.equal(runtime.environment, environment);
      assert.equal(runtime.projectRef, projectRef);
      assert.equal(runtime.supabaseUrl, `https://${projectRef}.supabase.co`);
      assert.equal(runtime.apiTransport, "same-origin-bff");
      assert.equal(runtime.apiProxyUrl, "");
      for (const [key, route] of Object.entries({
        playerWebSessionApiUrl: "/api/player-session", playerApiUrl: "/api/player",
        webSessionApiUrl: "/api/admin-session", adminBffApiUrl: "/api/admin",
        adminLogoutApiUrl: "/api/admin-logout", passwordResetApiUrl: "/api/password-reset",
      })) assert.equal(runtime[key], route);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
}
