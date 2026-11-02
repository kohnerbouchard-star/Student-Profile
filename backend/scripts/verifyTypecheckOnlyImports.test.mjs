import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fixture(check) {
  const target = mkdtempSync(join(tmpdir(), "cutover-trusted-typecheck-"));
  try {
    for (const name of [lock, map, vendor, ...configs]) {
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
