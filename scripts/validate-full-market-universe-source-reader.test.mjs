import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

const workflow = readFileSync(
  ".github/workflows/full-financial-markets-expansion.yml",
  "utf8",
);
const step = workflow.split(
  "      - name: Verify prohibited features remain disabled\n",
)[1]?.split("      - name:")[0];
assert.ok(step, "The prohibited-feature verification step must remain present.");
const body = step.match(/          node - <<'NODE'\n([\s\S]*?)          NODE\n/u);
assert.ok(body, "Execute the workflow's actual inline Node verification.");
const guard = body[1].replace(/^          /gmu, "");

// Keep this independent of the workflow reader and its required-marker list.
const sourcePaths = [
  "backend/src/domains/markets/contracts/financialMarketContracts.ts",
  "backend/src/domains/markets/contracts/financialMarketTradingContracts.ts",
  "backend/src/domains/markets/contracts/financialMarketInvestmentContracts.ts",
  "backend/src/domains/markets/validation/publicContractGuards.ts",
];
const markers = [
  "shortSellingSupported: false",
  "derivativesSupported: false",
  "physicalDeliverySupported: false",
  "complexPricingSupported: false",
  "activationAuthorized: false",
  "realWorldFeedsSupported: false",
  "automaticFullUniverseActivationSupported: false",
];
const sources = new Map(sourcePaths.map((path) => [path, readFileSync(path, "utf8")]));

function fixture(t, transform = (source) => source) {
  const root = mkdtempSync(join(tmpdir(), "full-market-source-reader-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, source] of sources) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), transform(source));
  }
  return root;
}

function run(root) {
  const result = spawnSync(process.execPath, ["-"], {
    cwd: root,
    input: guard,
    encoding: "utf8",
  });
  assert.ifError(result.error);
  return result;
}

function assertMissingMarker(root, marker) {
  const result = run(root);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(
    result.stderr.includes(`Missing fail-closed contract marker: ${marker}`),
    result.stderr,
  );
}

test("the workflow preserves all seven mandatory markers in their original order", () => {
  const required = guard.match(/const required = \[([\s\S]*?)\];/u);
  assert.ok(required);
  assert.deepEqual([...required[1].matchAll(/'([^']+)'/gu)].map((match) => match[1]), markers);
});

test("the actual workflow reads exactly the three contract owners and retained guard", () => {
  const reads = [];
  runInNewContext(guard, {
    require(module) {
      assert.equal(module, "node:fs");
      return {
        readFileSync(path, encoding) {
          assert.ok(sources.has(path), `Unapproved source path: ${path}`);
          assert.equal(encoding, "utf8");
          reads.push(path);
          return sources.get(path);
        },
      };
    },
  });
  assert.deepEqual(reads, sourcePaths);
});

test("the actual workflow accepts unchanged extracted production owners", (t) => {
  const result = run(fixture(t));
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

for (const marker of markers) {
  test(`the workflow rejects missing mandatory marker: ${marker}`, (t) => {
    assertMissingMarker(fixture(t, (source) => source.replaceAll(marker, "")), marker);
  });

  test(`the workflow rejects enabling a prohibited flag: ${marker}`, (t) => {
    assertMissingMarker(
      fixture(t, (source) => source.replaceAll(marker, marker.replace("false", "true"))),
      marker,
    );
  });

  test(`unread test and sibling files cannot supply missing marker: ${marker}`, (t) => {
    const root = fixture(t, (source) => source.replaceAll(marker, ""));
    const directory = dirname(join(root, sourcePaths[0]));
    writeFileSync(join(directory, "unrelated.ts"), markers.join("\n"));
    writeFileSync(join(directory, "financialMarketContractBindings.test.ts"), markers.join("\n"));
    assertMissingMarker(root, marker);
  });
}

for (const path of sourcePaths) {
  test(`an absent source owner fails closed: ${path}`, (t) => {
    const root = fixture(t);
    rmSync(join(root, path));
    const result = run(root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.ok(result.stderr.includes("ENOENT"), result.stderr);
    assert.ok(result.stderr.includes(path), result.stderr);
  });

  test(`a non-file source owner fails closed: ${path}`, (t) => {
    const root = fixture(t);
    rmSync(join(root, path));
    mkdirSync(join(root, path));
    const result = run(root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.ok(result.stderr.includes("EISDIR"), result.stderr);
  });
}

test("the existing validator step runs the regression without dropping either suite", () => {
  const validationStep = workflow.split("      - name: Run universe and editorial validator tests\n")[1]
    ?.split("      - name:")[0];
  assert.ok(validationStep);
  for (const path of [
    "scripts/validate-full-market-universe.test.mjs",
    "scripts/review-full-market-universe.test.mjs",
    "scripts/validate-full-market-universe-source-reader.test.mjs",
  ]) {
    assert.ok(validationStep.includes(`node --test ${path}\n`), path);
  }
});
