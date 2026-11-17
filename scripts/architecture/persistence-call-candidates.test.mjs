import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { hasPersistenceCallCandidate } from "./persistence-call-candidates.mjs";

for (const [name, source] of [
  ["plain table call", 'client.from("players")'],
  ["plain RPC call", 'client.rpc("command")'],
  ["client factory", 'createClient(url, key)'],
  ["generic RPC", 'client.rpc<boolean>("command")'],
  ["generic table", 'client.from<{ readonly id: unknown }>("players")'],
  ["multiline union type", 'client.rpc<\n readonly Row[] | Row\n>("command")'],
  ["nested generic type", 'client.rpc<Readonly<Record<string, readonly Row[]>>>("command")'],
  ["function type", 'client.rpc<{ callback: () => Promise<Row> }>("command")'],
  ["whitespace before type arguments", 'client.rpc \n <Row>("command")'],
  ["collection exclusion beside real direct call", 'Array.from(rows); client.rpc("command")'],
  ["nested collection and real generic RPC", 'Array.from<Row>(rows); client.rpc<Row>("command")'],
  ["retained comment candidate", '// client.rpc("command")'],
  ["retained string candidate", 'const marker = \'client.from("players")\''],
  ["generic instantiation candidate, not a proven call", 'const command = client.rpc<Row>'],
]) {
  test(name, () => assert.equal(hasPersistenceCallCandidate(source), true));
}

for (const constructor of [
  "Array", "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array",
  "Uint16Array", "Int32Array", "Uint32Array", "BigInt64Array", "BigUint64Array",
  "Float32Array", "Float64Array",
]) {
  test(`${constructor}.from is not persistence`, () => {
    assert.equal(hasPersistenceCallCandidate(`${constructor}.from(values)`), false);
    assert.equal(hasPersistenceCallCandidate(`${constructor}.from \n <number>(values)`), false);
  });
}

for (const source of ["", "client.from", "client.rpc", "client.rpcOther<Row>()", "rpc<Row>()", "object.createClient"]) {
  test(`no candidate: ${JSON.stringify(source)}`, () => assert.equal(hasPersistenceCallCandidate(source), false));
}

test("inventory generator uses the tested detector", () => {
  const source = readFileSync(new URL("./build-architecture-inventory.mjs", import.meta.url), "utf8");
  assert.match(source, /import \{ hasPersistenceCallCandidate \} from "\.\/persistence-call-candidates\.mjs"/u);
  assert.match(source, /if \(hasPersistenceCallCandidate\(source\)\)/u);
});

test("all recorded predecessor candidates remain detected", () => {
  // Test immutable main source, not the newly generated candidate inventory.
  const baseline = "e71a92a2df85bc359a480570b20882603c9df1b9";
  const result = spawnSync("git", ["show", `${baseline}:docs/architecture/inventories/econovaria-architecture-inventory-v2.json`], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(result.stdout);
  for (const { file } of inventory.measuredDebt.persistenceOutsideInfrastructure) {
    const blob = spawnSync("git", ["show", `${baseline}:${file}`], { encoding: "utf8" });
    assert.equal(blob.status, 0, blob.stderr);
    assert.equal(hasPersistenceCallCandidate(blob.stdout), true, file);
  }
});

for (const workflow of ["ref-009-contract-reward-qualification.yml", "ref-018-attendance-qualification.yml"]) {
  test(`${workflow} retains history for immutable persistence regressions`, () => {
    const source = readFileSync(new URL(`../../.github/workflows/${workflow}`, import.meta.url), "utf8");
    const checkout = source.match(/^      - name: Check out exact qualification head\n(?:(?!      - ).*\n)*/mu)?.[0];
    assert.ok(checkout, "named qualification checkout is present");
    assert.match(checkout, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/u);
    assert.match(checkout, /fetch-depth: 0/u);
    assert.match(checkout, /persist-credentials: false/u);
    assert.match(source, /run: npm run audit:architecture/u);
  });
}
