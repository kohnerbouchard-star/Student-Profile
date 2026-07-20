#!/usr/bin/env python3
"""Migrate browser consumers to the validated deployment runtime configuration."""

from __future__ import annotations

from pathlib import Path


PRODUCTION_PROJECT_REF = "cgiukdjwicykrmtkhudh"
PRODUCTION_PUBLISHABLE_KEY = "sb_publishable_zkbXiJ1_zlmQIBMky6oi5w_4A24T1iV"


def replace_once(path_value: str, old: str, new: str) -> None:
    path = Path(path_value)
    source = path.read_text(encoding="utf-8")
    if old in source:
        path.write_text(source.replace(old, new, 1), encoding="utf-8")
        return
    if new in source:
        return
    raise RuntimeError(f"{path}: replacement target was not found")


def migrate_javascript() -> None:
    replace_once(
        "frontend/src/core/constants.js",
        f'''const SUPABASE_URL = "https://{PRODUCTION_PROJECT_REF}.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "{PRODUCTION_PUBLISHABLE_KEY}";
const CLASSROOM_API_URL = `${{SUPABASE_URL}}/functions/v1/classroom-api`;
''',
        '''const runtimeConfig = window.EconovariaRuntimeConfig;
if (!runtimeConfig) {
  throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
}
const SUPABASE_URL = runtimeConfig.supabaseUrl;
const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
const CLASSROOM_API_URL = runtimeConfig.classroomApiUrl;
''',
    )

    shared_runtime = '''  const runtimeConfig = window.EconovariaRuntimeConfig;
  if (!runtimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }
'''
    shared_api = '''  const SUPABASE_URL = runtimeConfig.supabaseUrl;
  const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
'''

    for path_value in (
        "auth/reset-password.js",
        "admin/auth-session-manager.js",
    ):
        replace_once(
            path_value,
            f'''  const SUPABASE_URL = "https://{PRODUCTION_PROJECT_REF}.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "{PRODUCTION_PUBLISHABLE_KEY}";
''',
            shared_runtime + shared_api,
        )

    replace_once(
        "player-terminal/host-runtime.js",
        f'''  const STORAGE_KEY = "econovaria.player.auth.v1";
  const CLASSROOM_API_URL = "https://{PRODUCTION_PROJECT_REF}.supabase.co/functions/v1/classroom-api";
  const SUPABASE_PUBLISHABLE_KEY = "{PRODUCTION_PUBLISHABLE_KEY}";
''',
        '''  const runtimeConfig = runtime.EconovariaRuntimeConfig;
  if (!runtimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }
  const STORAGE_KEY = "econovaria.player.auth.v1";
  const CLASSROOM_API_URL = runtimeConfig.classroomApiUrl;
  const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
''',
    )
    replace_once(
        "player-terminal/host-runtime.js",
        '  const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);\n',
        "",
    )
    replace_once(
        "player-terminal/host-runtime.js",
        '''  const hostname = String(runtime.location.hostname || "").toLowerCase();
  const development = !hostname || LOCAL_HOSTS.has(hostname);
''',
        '  const development = runtimeConfig.environment === "development";\n',
    )
    replace_once(
        "player-terminal/host-runtime.js",
        '    environment: development ? "development" : "production",\n',
        '    environment: runtimeConfig.environment,\n',
    )

    replacements = {
        "admin/player-access-code-bridge.js": (
            "CLASSROOM_API_BASE",
            "classroomApiUrl",
        ),
        "admin/admin-auth.js": (
            "ADMIN_API_BASE",
            "adminApiUrl",
        ),
        "admin/classroom-write-fallback.js": (
            "CLASSROOM_API_BASE",
            "classroomApiUrl",
        ),
    }
    for path_value, (api_constant, runtime_property) in replacements.items():
        function_slug = "admin-api" if api_constant == "ADMIN_API_BASE" else "classroom-api"
        replace_once(
            path_value,
            f'''  const SUPABASE_URL = "https://{PRODUCTION_PROJECT_REF}.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "{PRODUCTION_PUBLISHABLE_KEY}";
  const {api_constant} = `${{SUPABASE_URL}}/functions/v1/{function_slug}`;
''',
            shared_runtime
            + shared_api
            + f"  const {api_constant} = runtimeConfig.{runtime_property};\n",
        )


def migrate_entry_points() -> None:
    replace_once(
        "index.html",
        '  <script src="frontend/src/core/constants.js"></script>\n',
        '''  <script src="runtime-config.env.js"></script>
  <script src="frontend/src/core/runtime-config.js"></script>
  <script src="frontend/src/core/constants.js"></script>
''',
    )
    replace_once(
        "auth/reset-password.html",
        '  <script defer src="./reset-password.js"></script>\n',
        '''  <script defer src="../runtime-config.env.js"></script>
  <script defer src="../frontend/src/core/runtime-config.js"></script>
  <script defer src="./reset-password.js"></script>
''',
    )
    replace_once(
        "player-terminal/index.html",
        '  <script src="./host-runtime.js"></script>\n',
        '''  <script src="../runtime-config.env.js"></script>
  <script src="../frontend/src/core/runtime-config.js"></script>
  <script src="./host-runtime.js"></script>
''',
    )
    replace_once(
        "admin/index.html",
        f'  <meta name="econovaria-admin-api-base" content="https://{PRODUCTION_PROJECT_REF}.supabase.co/functions/v1/admin-api" />\n',
        '  <meta name="econovaria-admin-api-base" content="" />\n',
    )
    replace_once(
        "admin/index.html",
        '  <script defer src="./auth-session-manager.js" onload="void import(\'./session-timeout-safe-exit.js\')"></script>\n',
        '''  <script src="../runtime-config.env.js"></script>
  <script src="../frontend/src/core/runtime-config.js"></script>
  <script defer src="./auth-session-manager.js" onload="void import('./session-timeout-safe-exit.js')"></script>
''',
    )


def write_integration_test() -> None:
    Path("scripts/environment-neutral-browser-integration.test.mjs").write_text(
        r'''import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productionProjectRef = "cgiukdjwicykrmtkhudh";
const productionPublishableKey = "sb_publishable_zkbXiJ1_zlmQIBMky6oi5w_4A24T1iV";
const textExtensions = new Set([".html", ".js", ".mjs", ".json", ".css"]);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walk(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const result = [];
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    const childRelative = path.join(relativePath, entry.name);
    if (entry.isDirectory()) result.push(...walk(childRelative));
    else if (textExtensions.has(path.extname(entry.name))) result.push(childRelative);
  }
  return result;
}

function assertOrdered(source, orderedFragments, label) {
  let previous = -1;
  for (const fragment of orderedFragments) {
    const position = source.indexOf(fragment);
    assert.notEqual(position, -1, `${label} is missing ${fragment}`);
    assert.ok(position > previous, `${label} loads ${fragment} out of order`);
    previous = position;
  }
}

test("deployable browser surface contains no committed production binding", () => {
  const files = ["index.html", ...walk("frontend"), ...walk("auth"), ...walk("admin"), ...walk("player-terminal")];
  for (const relativePath of files) {
    const source = read(relativePath);
    assert.equal(source.includes(productionProjectRef), false, `${relativePath} embeds the production project ref`);
    assert.equal(source.includes(productionPublishableKey), false, `${relativePath} embeds the production publishable key`);
  }
});

test("all browser API consumers use the validated runtime authority", () => {
  for (const relativePath of [
    "frontend/src/core/constants.js",
    "auth/reset-password.js",
    "admin/auth-session-manager.js",
    "player-terminal/host-runtime.js",
    "admin/player-access-code-bridge.js",
    "admin/admin-auth.js",
    "admin/classroom-write-fallback.js",
  ]) {
    assert.match(read(relativePath), /EconovariaRuntimeConfig/, `${relativePath} does not consume runtime config`);
  }
});

test("entry points load deployment config and validator before consumers", () => {
  assertOrdered(read("index.html"), [
    'src="runtime-config.env.js"',
    'src="frontend/src/core/runtime-config.js"',
    'src="frontend/src/core/constants.js"',
  ], "root login");
  assertOrdered(read("auth/reset-password.html"), [
    'src="../runtime-config.env.js"',
    'src="../frontend/src/core/runtime-config.js"',
    'src="./reset-password.js"',
  ], "password recovery");
  assertOrdered(read("player-terminal/index.html"), [
    'src="../runtime-config.env.js"',
    'src="../frontend/src/core/runtime-config.js"',
    'src="./host-runtime.js"',
  ], "player terminal");
  assertOrdered(read("admin/index.html"), [
    'src="../runtime-config.env.js"',
    'src="../frontend/src/core/runtime-config.js"',
    'src="./auth-session-manager.js"',
  ], "admin console");
});

test("admin API metadata is populated only by validated runtime config", () => {
  assert.match(read("admin/index.html"), /name="econovaria-admin-api-base" content=""/);
  assert.match(read("frontend/src/core/runtime-config.js"), /adminApiMeta\.content = runtimeConfig\.adminApiUrl/);
});
''',
        encoding="utf-8",
    )


def write_workflow() -> None:
    Path(".github/workflows/environment-neutral-browser.yml").write_text(
        '''name: Environment Neutral Browser

on:
  pull_request:
    paths:
      - "index.html"
      - "frontend/**"
      - "auth/**"
      - "admin/**"
      - "player-terminal/**"
      - "docs/operations/environments/runtime-config.env.template.js"
      - "scripts/runtime-config-contract.test.mjs"
      - "scripts/environment-neutral-browser-integration.test.mjs"
      - ".github/workflows/environment-neutral-browser.yml"
  push:
    branches:
      - agent/environment-neutral-frontend-v1
    paths:
      - "index.html"
      - "frontend/**"
      - "auth/**"
      - "admin/**"
      - "player-terminal/**"
      - "docs/operations/environments/runtime-config.env.template.js"
      - "scripts/runtime-config-contract.test.mjs"
      - "scripts/environment-neutral-browser-integration.test.mjs"
      - ".github/workflows/environment-neutral-browser.yml"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  runtime-config-contract:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.23.1
      - name: Validate runtime configuration contracts
        run: node --test scripts/runtime-config-contract.test.mjs scripts/environment-neutral-browser-integration.test.mjs
      - name: Validate browser consumer syntax
        run: |
          node --check frontend/src/core/runtime-config.js
          node --check frontend/src/core/constants.js
          node --check auth/reset-password.js
          node --check admin/auth-session-manager.js
          node --check player-terminal/host-runtime.js
          node --check admin/player-access-code-bridge.js
          node --check admin/admin-auth.js
          node --check admin/classroom-write-fallback.js
''',
        encoding="utf-8",
    )


def main() -> None:
    migrate_javascript()
    migrate_entry_points()
    write_integration_test()
    write_workflow()


if __name__ == "__main__":
    main()
