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
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BROWSER_ROOTS,
  VERCEL_CRITICAL_ROUTE_CONTRACTS,
  buildVercelDeployment,
  validateCriticalVercelRoutes,
} from "./build-vercel-runtime-config.mjs";

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
    "api/admin/[...path].js",
    `"use strict";\nconst { proxyAdminBff } = require("../_admin-bff-proxy.js");\nconst { canonicalCatchAllPath } = require("../_canonical-bff-path.js");\nmodule.exports = function route(request, response) {\n  const normalizedRequest = Object.create(request);\n  normalizedRequest.query = { path: canonicalCatchAllPath(request.url, "/api/admin") };\n  return proxyAdminBff(normalizedRequest, response, { proxyAdmin: true });\n};\n`,
  ],
  [
    "api/admin-proxy.js",
    `"use strict";\nconst { proxyAdminBff } = require("./_admin-bff-proxy.js");\nmodule.exports = function route(request, response) {\n  const path = request.query?.path;\n  if (typeof path !== "string") return response.end("invalid_proxy_path");\n  const normalizedRequest = Object.create(request);\n  normalizedRequest.query = { path };\n  return proxyAdminBff(normalizedRequest, response, { proxyAdmin: true });\n};\n`,
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

test("critical route manifest covers every administrator authentication entry point", () => {
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

test("rejects missing recovery routes and retired logout targets", async () => {
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
      /retired target: api\/admin-logout\.js/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("rejects direct upstream transport in the Admin namespace proxy", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "econovaria-vercel-admin-proxy-"));
  const fixtureRoot = path.join(temporaryRoot, "repository");
  await mkdir(fixtureRoot, { recursive: true });
  await fixtureRepository(fixtureRoot);

  try {
    await writeFile(
      path.join(fixtureRoot, "api", "admin-proxy.js"),
      `${criticalRouteFixtures.get("api/admin-proxy.js")}\nfetch("/functions/v1/admin-api");\n`,
    );
    await assert.rejects(
      validateCriticalVercelRoutes({ repoRoot: fixtureRoot }),
      /retired target: api\/admin-proxy\.js/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("Vercel config preserves API function discovery and Admin namespace routing", async () => {
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
    configuration.rewrites?.find((entry) => entry.source === "/api/admin/:path*"),
    {
      source: "/api/admin/:path*",
      destination: "/api/admin-proxy?path=:path*",
    },
  );

  const adminSessionRoute = await stat(
    path.join(repositoryRoot, "api", "admin-session", "[...path].js"),
  );
  assert.equal(adminSessionRoute.isFile(), true);

  const adminNamespaceProxy = await stat(
    path.join(repositoryRoot, "api", "admin-proxy.js"),
  );
  assert.equal(adminNamespaceProxy.isFile(), true);
});
