#!/usr/bin/env node
// Initial reviewed CI-policy trust root only. This is not an inherited-policy approval.
// Source tranches NEVER execute this fallback; they require a validator/record in base.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  changes,
  PREDECESSOR,
  REGISTRY,
  ROADMAP,
  SCOPE,
  tree,
  validateRegistry,
  VALIDATOR,
  verifyAuthority,
  verifyTrigger,
} from "./verify-held14-admission.mjs";

export const CONTROL_PR = 979; // Actual source-pending control draft, never a source tranche.
export const BOOTSTRAP_BASE = "f5db830bca8aab9fad2b04c028563b32dfd38ef2";
export const BOOTSTRAP_RECORD =
  "docs/operations/contracts/held14/control-bootstrap.json";
const REPOSITORY = "kohnerbouchard-star/Student-Profile";
const CONTROL_FILES = new Set([
  VALIDATOR,
  "scripts/held14-admission-contracts.mjs",
  "scripts/held14-admission.test.mjs",
  "scripts/verify-held14-control-bootstrap.mjs",
  "scripts/held14-control-bootstrap.test.mjs",
  REGISTRY,
  SCOPE,
  ".github/workflows/full-financial-markets-expansion.yml",
  ".github/workflows/economic-balance-exploit-lab.yml",
]);
const fail = (condition, message) => assert.ok(condition, message);
function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  }).trimEnd();
}
function blob(ref, file, cwd) {
  return execFileSync("git", ["show", `${ref}:${file}`], {
    cwd,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
}
export function verifyBootstrap(
  {
    event,
    repository = process.env.GITHUB_REPOSITORY,
    eventName = process.env.GITHUB_EVENT_NAME,
    cwd = process.cwd(),
  },
) {
  fail(
    Number.isSafeInteger(CONTROL_PR) && CONTROL_PR > 0,
    "Control bootstrap has no assigned real PR",
  );
  fail(eventName === "pull_request", "Bootstrap requires PR event");
  const pr = event?.pull_request, base = pr?.base?.sha, head = pr?.head?.sha;
  fail(
    event.number === CONTROL_PR && pr?.number === CONTROL_PR,
    "Not the one reviewed control PR",
  );
  fail(
    repository === REPOSITORY && event.repository?.full_name === REPOSITORY &&
      pr.base.repo?.full_name === REPOSITORY &&
      pr.head.repo?.full_name === REPOSITORY,
    "Bootstrap repository mismatch",
  );
  fail(
    base === BOOTSTRAP_BASE && pr.base.ref === "main" &&
      /^[a-f0-9]{40}$/u.test(head ?? ""),
    "Bootstrap baseline/head mismatch",
  );
  assert.equal(
    git(["rev-parse", "HEAD"], cwd),
    head,
    "Bootstrap checkout mismatch",
  );
  assert.equal(
    git(["merge-base", base, head], cwd),
    base,
    "Bootstrap candidate lacks exact predecessor",
  );
  fail(
    !tree(base, cwd).some((x) => x.path === VALIDATOR),
    "Bootstrap already consumed: base has validator",
  );
  const record = JSON.parse(blob(head, BOOTSTRAP_RECORD, cwd));
  assert.deepEqual(
    Object.keys(record).sort(),
    ["schemaVersion", "pullRequestNumber", "baseSha", "repository", "changes"]
      .sort(),
    "Unexpected bootstrap record fields",
  );
  fail(
    record.schemaVersion === 1 && record.pullRequestNumber === CONTROL_PR &&
      record.baseSha === base && record.repository === repository,
    "Bootstrap record binding mismatch",
  );
  const delta = changes(base, head, cwd);
  // This one new DATA file is excluded to avoid self-hashing. Independent review of
  // the exact control head establishes trust; self-authored blob IDs do not do so.
  assert.deepEqual(
    delta.filter((x) => x.path !== BOOTSTRAP_RECORD),
    record.changes,
    "Complete reviewed control payload mismatch",
  );
  fail(
    delta.some((x) => x.path === BOOTSTRAP_RECORD && x.oldOid === null),
    "Bootstrap record must be new",
  );
  const authority =
    `docs/operations/contracts/player-cross-cutting/pr-${CONTROL_PR}.json`;
  for (const file of [...CONTROL_FILES, authority, ROADMAP]) {
    fail(delta.some((x) => x.path === file), `Missing control file ${file}`);
  }
  for (const change of delta) {
    const file = change.path;
    fail(
      /^[A-Za-z0-9_./-]+$/u.test(file) &&
        !file.split("/").some((x) => x === "." || x === ".." || x === ""),
      "Unsafe bootstrap path",
    );
    fail(
      change.newMode === "100644" &&
        (change.oldMode === "100644" || change.oldMode === null),
      "Bootstrap deletion/mode change",
    );
    if (
      CONTROL_FILES.has(file) || file === BOOTSTRAP_RECORD ||
      file === authority || file === ROADMAP ||
      /^docs\/operations\/evidence\/held14-control-v1\/[A-Za-z0-9_/-]+\.(md|json)$/u
        .test(file)
    ) continue;
    if (
      /^\.github\/workflows\/[a-zA-Z0-9-]+\.yml$/u.test(file) && change.oldOid
    ) verifyTrigger(blob(base, file, cwd), blob(head, file, cwd), authority);
    else throw new Error(`Bootstrap forbids runtime/unreviewed path: ${file}`);
  }
  // Source records are separately reviewed, finite PR980/981 only. Their exact bytes
  // are pinned above; source baseline digests exclude these two DATA records only.
  const registry = JSON.parse(blob(head, REGISTRY, cwd));
  validateRegistry(registry);
  fail(
    registry.records.length === 2,
    "Bootstrap requires both independently reviewed source records",
  );
  const manifest = JSON.parse(blob(head, authority, cwd));
  verifyAuthority(manifest, JSON.parse(blob(base, PREDECESSOR, cwd)), {
    pullRequestNumber: CONTROL_PR,
    tranche: "economy2",
  }, delta.map((x) => x.path));
  const files = new Set(tree(head, cwd).map((x) => x.path));
  for (const file of manifest.requiredFiles) {
    fail(files.has(file), `Required control file absent: ${file}`);
  }
  return {
    purpose: "reviewed-initial-control-trust-root",
    pullRequestNumber: CONTROL_PR,
    base,
    head,
    changedPaths: delta.length,
  };
}
if (
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    fail(process.argv.length === 2, "Bootstrap accepts no scope overrides");
    process.stdout.write(
      `Initial reviewed control bootstrap: ${
        JSON.stringify(
          verifyBootstrap({
            event: JSON.parse(
              readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
            ),
          }),
        )
      }\n`,
    );
  } catch (error) {
    process.stderr.write(`Control bootstrap denied: ${error.message}\n`);
    process.exitCode = 1;
  }
}
