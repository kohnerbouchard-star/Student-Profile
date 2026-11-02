import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { verifyTypecheckOnlyImports } from "./verifyTypecheckOnlyImports.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const url = "https://esm.sh/tslib@2.8.1/denonext/tslib.mjs";
const lock = "supabase/functions/deno.lock";
const map = "scripts/typecheck-only/import-map.json";
const vendor = "scripts/typecheck-only/vendor/tslib-2.8.1/tslib.mjs";
const configs = ["supabase/functions/deno.json", "supabase/functions/admin-api/deno.json"];
const classroom = "supabase/functions/classroom-api/deno.json";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fixture(check) {
  const target = mkdtempSync(join(tmpdir(), "cutover-trusted-typecheck-"));
  try {
    for (const name of [lock, map, vendor, classroom, ...configs]) {
      mkdirSync(dirname(join(target, name)), { recursive: true });
      copyFileSync(join(root, name), join(target, name));
    }
    check(target);
  } finally { rmSync(target, { recursive: true, force: true }); }
}

test("CI typecheck copy independently matches the unchanged original remote pin", () => {
  assert.equal(verifyTypecheckOnlyImports(root), join(root, map));
  const bytes = readFileSync(join(root, vendor));
  assert.equal(bytes.length, 11226);
  assert.equal(hash(bytes), "c38da5dd6da6281964435002ce204cd586634fe3bdfb24a0ee116f48cf3292e9");
  assert(lstatSync(join(root, vendor)).isFile());
  const license = readFileSync(join(root, "scripts/typecheck-only/vendor/tslib-2.8.1/LICENSE"));
  assert.equal(license.length, 644);
  assert.equal(hash(license), "0e8d2550baea17eb3072c4f919b36fbf9852bb49dba948549872e713863c0834");
});

function checkerFixture(target) {
  for (const name of ["scripts/typecheckAllEdgeRoots.mjs", "scripts/verifyTypecheckOnlyImports.mjs"]) {
    mkdirSync(dirname(join(target, name)), { recursive: true });
    copyFileSync(join(root, name), join(target, name));
  }
  const functions = join(root, "supabase/functions");
  const slugs = readdirSync(functions, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(functions, entry.name, "index.ts")))
    .map((entry) => entry.name).sort();
  for (const slug of slugs) {
    const path = join(target, "supabase/functions", slug, "index.ts");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "export {};\n");
  }
  const bin = join(target, "bin"), log = join(target, "deno-arguments.log");
  mkdirSync(bin);
  const executable = join(bin, "deno");
  writeFileSync(executable, [
    "#!/bin/sh",
    'printf "%s\\n" "$@" >> "$TEST_ARGUMENT_LOG"',
    'printf "%s\\n" "--END--" >> "$TEST_ARGUMENT_LOG"',
    'if [ -n "$TEST_CORRUPT_PATH" ]; then printf bad > "$TEST_CORRUPT_PATH"; fi',
    'if [ "$TEST_FAIL_SIGNAL" = yes ]; then kill -TERM $$; fi',
    'if [ -n "$TEST_FAIL_EXIT" ]; then exit "$TEST_FAIL_EXIT"; fi',
    "exit 0", "",
  ].join("\n"));
  chmodSync(executable, 0o755);
  const run = (extraEnv = {}) => spawnSync(process.execPath, [join(target, "scripts/typecheckAllEdgeRoots.mjs")], {
    cwd: target, encoding: "utf8", timeout: 10_000,
    env: { ...process.env, PATH: bin, TEST_ARGUMENT_LOG: log,
      TEST_CORRUPT_PATH: "", TEST_FAIL_SIGNAL: "", TEST_FAIL_EXIT: "", ...extraEnv },
  });
  const calls = () => existsSync(log)
    ? readFileSync(log, "utf8").split("--END--\n").filter(Boolean).map((part) => part.trimEnd().split("\n"))
    : [];
  return { bin, calls, run, slugs };
}

test("every-root checker preserves all 28 roots, order, config groups and frozen operands", () => {
  fixture((target) => {
    const check = checkerFixture(target), result = check.run();
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(check.slugs.length, 28);
    const defaultRoots = check.slugs.filter((slug) => !["admin-api", "classroom-api"].includes(slug));
    const groups = [
      ["supabase/functions/admin-api/deno.json", ["admin-api"]],
      ["supabase/functions/deno.json", defaultRoots],
      ["supabase/functions/classroom-api/deno.json", ["classroom-api"]],
    ];
    assert.deepEqual(check.calls(), groups.map(([config, slugs]) => [
      "check", `--config=${join(target, config)}`, `--lock=${join(target, lock)}`,
      "--frozen", `--import-map=${join(target, map)}`,
      ...slugs.map((slug) => join(target, "supabase/functions", slug, "index.ts")),
    ]));
    assert.match(result.stdout, /Typechecked every Supabase Edge root \(28\)/u);
  });
});

test("every-root checker rejects missing or corrupt map, module, lock and Classroom config before Deno", () => {
  for (const change of [
    (target) => rmSync(join(target, map)),
    (target) => writeFileSync(join(target, map), '{"imports":{}}'),
    (target) => rmSync(join(target, vendor)),
    (target) => { const path = join(target, vendor), bytes = readFileSync(path); bytes[0] ^= 1; writeFileSync(path, bytes); },
    (target) => rmSync(join(target, lock)),
    (target) => { const path = join(target, lock), value = JSON.parse(readFileSync(path)); value.remote[url] = "a".repeat(64); writeFileSync(path, JSON.stringify(value)); },
    (target) => writeFileSync(join(target, classroom), '{"compilerOptions":{"strict":false}}'),
  ]) fixture((target) => {
    const check = checkerFixture(target); change(target);
    const result = check.run(); assert.ifError(result.error); assert.notEqual(result.status, 0);
    assert.deepEqual(check.calls(), [], "Rejected input must not launch Deno");
  });
});

test("every-root checker revalidates map, module and lock before each config group", () => {
  for (const path of [map, vendor, lock]) fixture((target) => {
    const check = checkerFixture(target), result = check.run({ TEST_CORRUPT_PATH: join(target, path) });
    assert.ifError(result.error); assert.notEqual(result.status, 0);
    assert.equal(check.calls().length, 1, "Corruption after the first child must block the second");
    assert(!result.stdout.includes("Typechecked every Supabase Edge root"));
  });
});

test("every-root checker propagates child exit, signal and launch failure without continuing", () => {
  for (const [env, status] of [[{ TEST_FAIL_EXIT: "17" }, 17], [{ TEST_FAIL_SIGNAL: "yes" }, 1]]) {
    fixture((target) => {
      const check = checkerFixture(target), result = check.run(env);
      assert.ifError(result.error); assert.equal(result.status, status);
      assert.equal(check.calls().length, 1); assert(!result.stdout.includes("Typechecked every Supabase Edge root"));
    });
  }
  fixture((target) => {
    const check = checkerFixture(target); rmSync(join(check.bin, "deno"));
    const result = check.run(); assert.ifError(result.error); assert.equal(result.status, 1);
    assert.match(result.stderr, /ENOENT/u); assert.deepEqual(check.calls(), []);
  });
});

test("missing, truncated, modified and symlinked helper copies fail before Deno", () => {
  for (const change of [
    (path) => rmSync(path),
    (path) => writeFileSync(path, readFileSync(path).subarray(1)),
    (path) => { const bytes = readFileSync(path); bytes[0] ^= 1; writeFileSync(path, bytes); },
    (path) => { const copy = `${path}.copy`; copyFileSync(path, copy); rmSync(path); symlinkSync(copy, path); },
  ]) fixture((target) => { change(join(target, vendor)); assert.throws(() => verifyTypecheckOnlyImports(target)); });
});

test("missing or changed original remote pin fails despite accepted local bytes", () => {
  for (const change of [
    (value) => { delete value.remote[url]; },
    (value) => { value.remote[url] = "a".repeat(64); },
  ]) fixture((target) => {
    const value = JSON.parse(readFileSync(join(target, lock)));
    change(value); writeFileSync(join(target, lock), JSON.stringify(value));
    assert.throws(() => verifyTypecheckOnlyImports(target), /Original tslib lock entry changed/u);
  });
});

test("CI map rejects omitted, wrong, extra, prefix, query and scoped mappings", () => {
  const local = "./vendor/tslib-2.8.1/tslib.mjs";
  for (const value of [
    { imports: {} }, { imports: { [url]: "./other.mjs" } },
    { imports: { [url]: local, "https://esm.sh/other": local } },
    { imports: { "https://esm.sh/tslib@2.8.1/": "./vendor/tslib-2.8.1/" } },
    { imports: { [`${url}?target=deno`]: local } },
    { imports: { [url]: local }, scopes: {} },
  ]) fixture((target) => {
    writeFileSync(join(target, map), JSON.stringify(value));
    assert.throws(() => verifyTypecheckOnlyImports(target), /only the exact accepted URL/u);
  });
});

test("both retained effective configs reject compiler or resolution drift", () => {
  for (const name of configs) for (const change of [
    (value) => { value.compilerOptions.strict = !value.compilerOptions.strict; },
    (value) => { value.imports = { [url]: "./other.mjs" }; },
  ]) fixture((target) => {
    const value = JSON.parse(readFileSync(join(target, name)));
    change(value); writeFileSync(join(target, name), JSON.stringify(value));
    assert.throws(() => verifyTypecheckOnlyImports(target));
  });
});

test("Cutover retains all strict roots then Admin, original configs, lock and frozen guards", () => {
  const workflow = readFileSync(join(root, "../.github/workflows/business-player-store-cutover-v2.yml"), "utf8");
  const block = workflow.split("      - name: Verify backend TypeScript and every Edge root\n")[1].split("\n  verify-database-settlement:")[0];
  const expected = [
    "        working-directory: backend", "        shell: bash", "        run: |",
    "          set -euo pipefail", "          npm run typecheck", "          mapfile -t STRICT_EDGE_ROOTS < <(",
    "            find supabase/functions -mindepth 2 -maxdepth 2 -name index.ts \\",
    "              ! -path 'supabase/functions/admin-api/index.ts' -print | sort", "          )",
    '          test "${#STRICT_EDGE_ROOTS[@]}" -gt 0',
    "          node --test scripts/verifyTypecheckOnlyImports.test.mjs",
    "          node scripts/verifyTypecheckOnlyImports.mjs", "          deno check \\",
    "            --config supabase/functions/deno.json \\",
    "            --lock=supabase/functions/deno.lock \\", "            --frozen \\",
    "            --import-map=scripts/typecheck-only/import-map.json \\", '            "${STRICT_EDGE_ROOTS[@]}"',
    "          node scripts/verifyTypecheckOnlyImports.mjs", "          deno check \\",
    "            --config supabase/functions/admin-api/deno.json \\",
    "            --lock=supabase/functions/deno.lock \\", "            --frozen \\",
    "            --import-map=scripts/typecheck-only/import-map.json \\",
    "            supabase/functions/admin-api/index.ts", "",
  ].join("\n");
  assert.equal(block, expected);
});
