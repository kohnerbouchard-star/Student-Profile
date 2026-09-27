#!/usr/bin/env node
// REF-011: only the config operand changes between each compatibility/parity run.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const NEUTRAL = "supabase/functions/deno.json";
export const CLASSROOM = "supabase/functions/classroom-api/deno.json";
export const LOCK = "supabase/functions/deno.lock";
export const GROUPS = Object.freeze({
  "REF-011a": ["test:player-request-scope", "test:player-security", "test:player-capabilities", "test:player-logout"],
  "REF-011b": ["test:player-world", "test:player-notifications", "test:player-messaging", "test:player-progression"],
  "REF-011c": ["test:world-runtime", "test:player-inventory", "test:player-contract-acceptance", "test:player-contract-lifecycle", "test:player-market-assets", "test:player-store-public", "test:player-banking-public", "test:player-banking-fx", "test:economic-ledger-invariants", "test:player-marketplace", "test:player-crafting"],
});
export const SUITES = Object.values(GROUPS).flat();
const digest = (value) => createHash("sha256").update(value).digest("hex");

export function validateConfigs(neutral, classroom) {
  assert.deepEqual(neutral, { compilerOptions: { strict: true } }, "Neutral effective settings changed; review resolution before migration");
  const { tasks, ...effective } = classroom;
  assert.deepEqual(effective, neutral, "Classroom/neutral effective settings differ");
  assert.deepEqual(tasks, { check: "deno check index.ts" }, "Unexpected Classroom task configuration");
}

// Restricted to the existing literal command grammar; never execute shell input.
export function commandArgs(command) {
  const first = command.split(" && ")[0];
  assert.match(first, /^deno test /u);
  assert(!/["'`$;|<>\\\r\n]/u.test(first), "Dynamic/quoted shell syntax needs explicit review");
  const tokens = first.trim().split(/\s+/u);
  assert.equal(tokens.shift(), "deno");
  assert(tokens.includes("--frozen"), "Frozen dependency enforcement missing");
  assert(tokens.includes(`--lock=${LOCK}`), "Shared lock operand changed");
  assert.equal(tokens.filter((value) => value === "--config").length, 1, "Expected exactly one literal config operand");
  return tokens;
}

export function withConfig(args, config) {
  const index = args.indexOf("--config");
  assert(index >= 0 && args[index + 1], "Missing config operand");
  const copy = [...args];
  copy[index + 1] = config;
  return copy;
}

export function validateScripts(scripts, preflight = false) {
  for (const key of SUITES) {
    assert.equal(typeof scripts[key], "string", `Missing registered suite: ${key}`);
    const args = commandArgs(scripts[key]);
    const actual = args[args.indexOf("--config") + 1];
    assert(actual === NEUTRAL || (preflight && actual === CLASSROOM), `${key} must use neutral config`);
    assert(args.some((arg) => arg.endsWith(".test.ts")), `${key} has no test files`);
    assert(!args.some((arg) => ["-A", "--allow-all", "--allow-net", "--allow-env", "--no-check", "--permit-no-files"].includes(arg)), `${key} weakens test verification`);
  }
  for (const [key, command] of Object.entries(scripts)) {
    // Inspect every explicit config spelling, including quote and relative-path variants.
    for (const match of command.matchAll(/(?:--config(?:=|\s+)|-c(?:=|\s+))(["']?)([^\s"';&]+)\1/gu)) {
      if (posix.normalize(match[2]) !== CLASSROOM) continue;
      assert(key === "typecheck:edge" || (preflight && SUITES.includes(key)), `Unrelated Classroom config consumer: ${key}`);
    }
  }
  assert.equal(scripts["typecheck:edge"], `deno check --config ${CLASSROOM} --lock=${LOCK} --frozen supabase/functions/classroom-api/index.ts`, "Retained Classroom root check changed");
}

export function junitCases(output) {
  assert.match(output, /<testsuites?\b/u, "Missing JUnit report");
  assert(!/<(?:failure|error)\b/u.test(output), "JUnit contains failing cases");
  const cases = [...output.matchAll(/<testcase\b([^>]*)>/gu)].map((match) => {
    const attributes = Object.fromEntries([...match[1].matchAll(/([\w:-]+)="([^"]*)"/gu)].map((item) => [item[1], item[2]]));
    assert(attributes.name, "JUnit case has no identity");
    return [attributes.classname ?? attributes.file ?? "", attributes.name];
  });
  assert(cases.length > 0, "No tests executed");
  return { cases: cases.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), skipped: [...output.matchAll(/<skipped\b/gu)].length };
}

export function runParity(scripts, backendRoot, run = spawnSync) {
  const lockPath = join(backendRoot, LOCK);
  const before = readFileSync(lockPath);
  const evidence = [];
  for (const [group, keys] of Object.entries(GROUPS)) {
    for (const key of keys) {
      const args = commandArgs(scripts[key]);
      const results = [CLASSROOM, NEUTRAL].map((config) => {
        const result = run("deno", [...withConfig(args, config), "--reporter=junit"], {
          cwd: backendRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
          timeout: 180000, env: { ...process.env, NO_COLOR: "1" },
        });
        assert(!result.error, `${key}: ${result.error?.message}`);
        assert.equal(result.status, 0, `${key} under ${config}:\n${result.stderr}\n${result.stdout}`);
        assert.deepEqual(readFileSync(lockPath), before, "Frozen lock bytes changed during parity");
        return junitCases(result.stdout);
      });
      assert.deepEqual(results[0], results[1], `${key}: test identities/skip outcomes differ`);
      const item = { group, key, cases: results[0].cases.length, skipped: results[0].skipped, testIdentitySha256: digest(JSON.stringify(results[0])), unchangedArgumentSha256: digest(JSON.stringify(withConfig(args, "CONFIG"))), lockSha256: digest(before) };
      evidence.push(item);
      console.log(`REF011_PARITY ${JSON.stringify(item)}`);
    }
  }
  return evidence;
}

function main() {
  const options = process.argv.slice(2);
  assert(options.every((value) => ["--preflight", "--static"].includes(value)), "Unknown option");
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
  validateConfigs(read(NEUTRAL), read(CLASSROOM));
  const { scripts } = read("package.json");
  validateScripts(scripts, options.includes("--preflight"));
  if (!options.includes("--static")) runParity(scripts, root);
  console.log(`REF-011 ${options.includes("--static") ? "static" : "parity"} verification passed for ${SUITES.length} suites`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
