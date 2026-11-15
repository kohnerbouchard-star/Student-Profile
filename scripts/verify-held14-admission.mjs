#!/usr/bin/env node
// Execute this file from the event BASE, never the proposed source tree.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  verifyAuthority,
  verifyRetainedEvidence,
  verifyTrigger,
  withClassroomReads,
} from "./held14-admission-contracts.mjs";
export {
  verifyAuthority,
  verifyRetainedEvidence,
  verifyTrigger,
  withClassroomReads,
} from "./held14-admission-contracts.mjs";

export const BOOTSTRAP_DATA =
  "docs/operations/contracts/held14/control-bootstrap.json";
export const REGISTRY = "docs/operations/contracts/held14/admissions.json";
export const SCOPE = "docs/operations/contracts/held14/source-scope.json";
export const VALIDATOR = "scripts/verify-held14-admission.mjs";
export const INVENTORY =
  "docs/architecture/inventories/econovaria-architecture-inventory-v2.json";
export const GENERATOR =
  "scripts/architecture/build-architecture-inventory.mjs";
export const PREDECESSOR =
  "docs/operations/contracts/player-cross-cutting/pr-978.json";
export const RETAINED_EVIDENCE =
  "docs/operations/evidence/refactor-execution-v1/REF-003/candidates.json";
export const ROADMAP = "docs/roadmaps/econovaria-beta-completion-roadmap-v1.md";
export const ROOTS = [
  "backend/src",
  "backend/supabase/functions",
  "admin",
  "frontend/src",
  "player-terminal/src",
];
// One independently reviewed successor, never an extensible registration mechanism.
export const AMENDMENT_BASE = "023ca4d70948bebf8cdc71460cbe8c6141af6934";
export const AMENDMENT_REASON = "retained-history-and-admin-formatting-pr981";
export const AMENDMENT_PATHS = [
  ".github/workflows/admin-api-check.yml",
  ".github/workflows/admin-browser-e2e.yml",
  ".github/workflows/admin-game-lifecycle-controls-v1.yml",
  ".github/workflows/admin-scroll-integrity.yml",
  ".github/workflows/admin-v2-attendance.yml",
  ".github/workflows/admin-v2-banking.yml",
  ".github/workflows/admin-v2-contracts.yml",
  ".github/workflows/admin-v2-crafting.yml",
  ".github/workflows/admin-v2-market.yml",
  ".github/workflows/admin-v2-messages.yml",
  ".github/workflows/admin-v2-news-events.yml",
  ".github/workflows/admin-v2-settings-check.yml",
  ".github/workflows/backend-typecheck.yml",
  ".github/workflows/banking-fx-clearing-v1.yml",
  ".github/workflows/business-economy-v2.yml",
  ".github/workflows/business-equipment-capacity-v2.yml",
  ".github/workflows/business-financial-market.yml",
  ".github/workflows/business-manufacturing-completion-v2.yml",
  ".github/workflows/business-manufacturing-recovery-v2.yml",
  ".github/workflows/business-manufacturing-resource-hold-v2.yml",
  ".github/workflows/business-player-store-cutover-v2.yml",
  ".github/workflows/business-primary-ipo.yml",
  ".github/workflows/business-store-atomic-settlement-v2.yml",
  ".github/workflows/business-store-listing-inventory-v2.yml",
  ".github/workflows/business-store-seller-offers-v2.yml",
  ".github/workflows/business-store-withdrawal-safety-v2.yml",
  ".github/workflows/business-timed-manufacturing-v2.yml",
  ".github/workflows/business-workforce-hiring-v2.yml",
  ".github/workflows/business-workforce-payroll-v2.yml",
  ".github/workflows/business-workforce-production-payroll-v2.yml",
  ".github/workflows/button-action-coverage.yml",
  ".github/workflows/configurable-stock-market-timezone-v1.yml",
  ".github/workflows/crafting-item-runtime.yml",
  ".github/workflows/database-replay.yml",
  ".github/workflows/economic-core-request-claims.yml",
  ".github/workflows/environment-neutral-browser.yml",
  ".github/workflows/exchange-calendar-runtime-v1.yml",
  ".github/workflows/full-financial-markets-expansion.yml",
  ".github/workflows/loans-lifecycle-read-v1.yml",
  ".github/workflows/multicurrency-marketplace-funding-v1.yml",
  ".github/workflows/multicurrency-stock-funding-v1.yml",
  ".github/workflows/multicurrency-store-funding-v1.yml",
  ".github/workflows/player-button-click-safety.yml",
  ".github/workflows/player-local-currency-authority.yml",
  ".github/workflows/player-multiplayer-load-e2e.yml",
  ".github/workflows/player-response-privacy.yml",
  ".github/workflows/ref-009-contract-reward-qualification.yml",
  ".github/workflows/ref-010-access-reset-qualification.yml",
  ".github/workflows/ref-018-attendance-qualification.yml",
  ".github/workflows/repository-quality.yml",
  ".github/workflows/runtime-interaction-wiring.yml",
  ".github/workflows/story-replay-safety.yml",
  ".github/workflows/world-runtime.yml",
  "docs/operations/contracts/held14/admissions.json",
  "docs/operations/contracts/player-cross-cutting/pr-982.json",
  "docs/operations/evidence/held14-history-amendment-v1/scope.md",
  "docs/roadmaps/econovaria-beta-completion-roadmap-v1.md",
  "scripts/held14-admission.test.mjs",
  "scripts/verify-held14-admission.mjs",
];
const ORIGINAL_BOOTSTRAP = {
  path: BOOTSTRAP_DATA,
  mode: "100644",
  oid: "e15ba9360faf53540bcfe353209dbf19f0f7526e",
};
const ORIGINAL_REGISTRY = {
  path: REGISTRY,
  mode: "100644",
  oid: "a4cc33efaf27df8a9651655523d96f125508a7a1",
};
const SHA = /^[a-f0-9]{40}$/u;
const REPOSITORY = "kohnerbouchard-star/Student-Profile";
const fail = (condition, message) => assert.ok(condition, message);
const same = (a, b, message) => assert.deepEqual(a, b, message);
function git(args, cwd, encoding = "utf8") {
  return execFileSync("git", args, {
    cwd,
    encoding,
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
function blob(ref, file, cwd) {
  return git(["show", `${ref}:${file}`], cwd);
}
function json(ref, file, cwd) {
  return JSON.parse(blob(ref, file, cwd));
}
export function tree(ref, cwd) {
  return git(["ls-tree", "-r", "-z", "--full-tree", ref], cwd).split("\0")
    .filter(Boolean).map((line) => {
      const match = line.match(/^(\d{6}) (blob|commit) ([a-f0-9]{40})\t(.+)$/u);
      fail(match, "Invalid tree entry");
      return { path: match[4], mode: match[1], oid: match[3] };
    });
}
export function baseDigest(ref, cwd) {
  // Two explicitly partitioned DATA records avoid R -> B -> R self-reference.
  // Bootstrap B pins registry R; R binds every other tree entry, including all code.
  // Both records are base-owned and source PRs may NEVER change either one.
  return createHash("sha256").update(
    JSON.stringify(
      tree(ref, cwd).filter((x) =>
        x.path !== REGISTRY && x.path !== BOOTSTRAP_DATA
      ),
    ),
  ).digest("hex");
}
export function changes(base, head, cwd) {
  const before = new Map(tree(base, cwd).map((x) => [x.path, x]));
  const after = new Map(tree(head, cwd).map((x) => [x.path, x]));
  return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap(
    (file) => {
      const a = before.get(file), b = after.get(file);
      return a?.oid === b?.oid && a?.mode === b?.mode ? [] : [{
        path: file,
        oldOid: a?.oid ?? null,
        newOid: b?.oid ?? null,
        oldMode: a?.mode ?? null,
        newMode: b?.mode ?? null,
      }];
    },
  );
}
function verifyInventory(base, head, cwd) {
  const entries = tree(head, cwd).filter((x) =>
    ROOTS.some((root) => x.path.startsWith(`${root}/`))
  );
  fail(
    entries.every((x) => x.mode === "100644" || x.mode === "100755"),
    "Non-regular source in inventory roots",
  );
  const temp = mkdtempSync(path.join(tmpdir(), "held14-inventory-"));
  try {
    const archive = git(["archive", head, ...ROOTS], cwd, null);
    execFileSync("tar", ["-x", "-C", temp], { input: archive });
    mkdirSync(path.join(temp, path.dirname(INVENTORY)), { recursive: true });
    const generator = path.join(temp, "trusted-inventory-generator.mjs");
    writeFileSync(generator, blob(base, GENERATOR, cwd));
    execFileSync(process.execPath, [generator], { cwd: temp, stdio: "pipe" });
    same(
      readFileSync(path.join(temp, INVENTORY), "utf8"),
      blob(head, INVENTORY, cwd),
      "Inventory differs from unchanged trusted generator",
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
export function validateRegistry(policy) {
  same(
    Object.keys(policy).sort(),
    ["records", "schemaVersion"],
    "Unexpected registry fields",
  );
  fail(
    policy.schemaVersion === 1 && Array.isArray(policy.records) &&
      policy.records.length <= 2,
    "Invalid finite registry",
  );
  fail(
    new Set(policy.records.map((r) => r.tranche)).size ===
      policy.records.length,
    "Duplicate tranche",
  );
  const keys = [
    "repository",
    "pullRequestNumber",
    "baseRef",
    "purpose",
    "tranche",
    "baseTreeDigest",
    "sourceReaderPaths",
    "evidencePaths",
    "changes",
  ].sort();
  for (const record of policy.records) {
    same(Object.keys(record).sort(), keys, "Unexpected admission fields");
    fail(
      record.pullRequestNumber ===
        ({ economy2: 980, admin12: 981 })[record.tranche],
      "Only reviewed source PR980/981 may be registered",
    );
    fail(
      record.repository === REPOSITORY && record.baseRef === "main" &&
        record.purpose === "held14-structural-refactor",
      "Invalid record binding",
    );
    fail(
      /^[a-f0-9]{64}$/u.test(record.baseTreeDigest),
      "Invalid source baseline digest",
    );
    for (const key of ["sourceReaderPaths", "evidencePaths"]) {
      fail(
        Array.isArray(record[key]) && record[key].every((x) =>
          typeof x === "string"
        ) && new Set(record[key]).size === record[key].length,
        `Invalid ${key}`,
      );
    }
    fail(
      Array.isArray(record.changes) && record.changes.length > 0,
      "Missing complete source manifest",
    );
    fail(
      !record.changes.some((x) =>
        [
          REGISTRY,
          BOOTSTRAP_DATA,
          VALIDATOR,
          "scripts/held14-admission-contracts.mjs",
          SCOPE,
          "scripts/verify-held14-control-bootstrap.mjs",
          "scripts/held14-admission.test.mjs",
          "scripts/held14-control-bootstrap.test.mjs",
        ].includes(x.path)
      ),
      "Source record cannot modify control policy",
    );
  }
}
// This validates provenance consumed from the EVENT BASE. Independent review of
// that exact control tree establishes trust; its self-authored hashes do not.
// Source changes are still checked against the complete base-owned manifest.
export function verifyControlProvenance(base, cwd) {
  const bootstrap = json(base, BOOTSTRAP_DATA, cwd);
  fail(
    bootstrap.schemaVersion === 1 && bootstrap.pullRequestNumber === 979 &&
      bootstrap.baseSha === "f5db830bca8aab9fad2b04c028563b32dfd38ef2" &&
      bootstrap.repository === REPOSITORY,
    "Invalid base bootstrap provenance",
  );
  const registryEntry = tree(base, cwd).find((x) => x.path === REGISTRY);
  fail(
    tree(base, cwd).find((x) => x.path === BOOTSTRAP_DATA)?.mode === "100644",
    "Bootstrap data must remain a regular non-executable file",
  );
  if (Object.hasOwn(bootstrap, "amendment")) {
    const predecessorEntries = tree(AMENDMENT_BASE, cwd);
    for (const expected of [ORIGINAL_BOOTSTRAP, ORIGINAL_REGISTRY]) {
      same(
        predecessorEntries.find((x) => x.path === expected.path),
        expected,
        "Immutable amendment predecessor data identity changed",
      );
    }
    const original = json(AMENDMENT_BASE, BOOTSTRAP_DATA, cwd);
    same(
      Object.keys(bootstrap),
      [...Object.keys(original), "amendment"],
      "Unexpected successor bootstrap fields or order",
    );
    const { amendment, ...preserved } = bootstrap;
    same(preserved, original, "Original PR979 bootstrap provenance changed");
    same(
      original.changes.filter((x) => x.path === REGISTRY).map((x) => ({
        path: x.path,
        mode: x.newMode,
        oid: x.newOid,
      })),
      [ORIGINAL_REGISTRY],
      "Original registry binding changed",
    );
    same(
      Object.keys(amendment),
      [
        "schemaVersion",
        "pullRequestNumber",
        "repository",
        "baseRef",
        "baseSha",
        "reason",
        "originalBootstrap",
        "originalRegistry",
        "changes",
      ],
      "Unexpected amendment fields or order",
    );
    fail(
      amendment.schemaVersion === 1 && amendment.pullRequestNumber === 982 &&
        amendment.repository === REPOSITORY && amendment.baseRef === "main" &&
        amendment.baseSha === AMENDMENT_BASE &&
        amendment.reason === AMENDMENT_REASON,
      "Only the exact PR982 predecessor transition is permitted",
    );
    same(
      amendment.originalBootstrap,
      ORIGINAL_BOOTSTRAP,
      "Wrong original bootstrap identity",
    );
    same(
      amendment.originalRegistry,
      ORIGINAL_REGISTRY,
      "Wrong original registry identity",
    );
    same(
      git(["merge-base", AMENDMENT_BASE, base], cwd).trim(),
      AMENDMENT_BASE,
      "Amended base must descend from the exact predecessor",
    );
    fail(
      Array.isArray(amendment.changes) && amendment.changes.length > 0,
      "Missing complete amendment manifest",
    );
    same(
      amendment.changes.map((x) => x.path),
      AMENDMENT_PATHS,
      "Amendment differs from the exact finite control path set",
    );
    for (const change of amendment.changes) {
      same(Object.keys(change), [
        "path",
        "oldOid",
        "newOid",
        "oldMode",
        "newMode",
      ], "Unexpected amendment manifest fields or order");
      fail(
        SHA.test(change.newOid ?? "") &&
          (change.oldOid === null || SHA.test(change.oldOid ?? "")) &&
          change.newMode === "100644" &&
          (change.oldMode === null || change.oldMode === "100644"),
        "Amendment deletion, symlink, submodule or mode change forbidden",
      );
    }
    same(
      changes(AMENDMENT_BASE, base, cwd).filter((x) =>
        x.path !== BOOTSTRAP_DATA
      ),
      amendment.changes,
      "Complete reviewed control amendment snapshot mismatch",
    );
    const pinnedRegistry = amendment.changes.filter((x) => x.path === REGISTRY);
    fail(
      pinnedRegistry.length === 1 &&
        pinnedRegistry[0].oldOid === ORIGINAL_REGISTRY.oid &&
        pinnedRegistry[0].oldMode === ORIGINAL_REGISTRY.mode &&
        pinnedRegistry[0].newOid === registryEntry?.oid &&
        pinnedRegistry[0].newMode === registryEntry?.mode,
      "Amended base registry no longer matches reviewed amendment payload",
    );
    const policy = json(base, REGISTRY, cwd);
    validateRegistry(policy);
    const expectedPolicy = json(AMENDMENT_BASE, REGISTRY, cwd);
    const admin = policy.records.find((x) => x.pullRequestNumber === 981);
    fail(admin, "Amendment requires the existing Admin record");
    expectedPolicy.records[1].baseTreeDigest = admin.baseTreeDigest;
    expectedPolicy.records[1].changes = admin.changes;
    same(
      policy,
      expectedPolicy,
      "Only PR981 base digest and complete snapshot may be re-pinned",
    );
    return bootstrap;
  }
  const pinnedRegistry = bootstrap.changes?.filter((x) => x.path === REGISTRY);
  fail(
    pinnedRegistry?.length === 1 &&
      pinnedRegistry[0].newOid === registryEntry.oid &&
      pinnedRegistry[0].newMode === registryEntry.mode,
    "Base registry no longer matches reviewed bootstrap payload",
  );
  return bootstrap;
}

export function verifyAdmission(
  {
    event,
    mode,
    cwd = process.cwd(),
    repository = process.env.GITHUB_REPOSITORY,
    eventName = process.env.GITHUB_EVENT_NAME,
  },
) {
  fail(eventName === "pull_request", "Admission requires a pull_request event");
  fail(mode === "markets" || mode === "lab", "Unknown scope mode");
  const pr = event?.pull_request, base = pr?.base?.sha, head = pr?.head?.sha;
  fail(
    SHA.test(base ?? "") && SHA.test(head ?? ""),
    "Missing exact event SHAs",
  );
  fail(
    Number.isSafeInteger(event.number) && event.number > 0 &&
      pr.number === event.number,
    "Missing exact PR number",
  );
  fail(
    repository === REPOSITORY && event.repository?.full_name === repository &&
      pr.base.repo?.full_name === repository &&
      pr.head.repo?.full_name === repository,
    "Repository binding mismatch",
  );
  fail(pr.base.ref === "main", "Target must be main");
  same(
    git(["rev-parse", "HEAD"], cwd).trim(),
    head,
    "Checkout is not exact event head",
  );
  same(
    git(["merge-base", base, head], cwd).trim(),
    base,
    "Candidate must include exact event base",
  );
  const policy = json(base, REGISTRY, cwd);
  validateRegistry(policy);
  verifyControlProvenance(base, cwd);
  const records = policy.records.filter((r) =>
    r.pullRequestNumber === event.number
  );
  fail(records.length === 1, "No unique trusted admission for this PR");
  const record = records[0];
  fail(
    record.repository === repository && record.baseRef === "main" &&
      record.purpose === "held14-structural-refactor",
    "Record binding mismatch",
  );
  fail(["economy2", "admin12"].includes(record.tranche), "Unknown tranche");
  fail(
    mode !== "lab" || record.tranche === "economy2",
    "Lab never admits Admin source",
  );
  same(baseDigest(base, cwd), record.baseTreeDigest, "Approved baseline drift");
  const delta = changes(base, head, cwd), paths = delta.map((x) => x.path);
  same(
    delta,
    record.changes,
    "Complete reviewed source/metadata snapshot mismatch",
  );
  fail(delta.length > 0, "Empty admission");
  const scope = json(base, SCOPE, cwd)[record.tranche];
  const authority =
    `docs/operations/contracts/player-cross-cutting/pr-${event.number}.json`;
  fail(
    Array.isArray(record.sourceReaderPaths) &&
      Array.isArray(record.evidencePaths),
    "Missing explicit support lists",
  );
  fail(
    record.tranche === "admin12" || record.sourceReaderPaths.length === 0,
    "Economy has no source-reader exception",
  );
  for (const file of record.sourceReaderPaths) {
    fail(
      scope.sourceReaderPaths.includes(file),
      "Support outside independently enumerated source-reader scope",
    );
    fail(paths.includes(file), "Unused source-reader permission");
  }
  for (const file of record.evidencePaths) {
    fail(
      (scope.evidencePaths ?? []).includes(file) ||
        (scope.evidenceDirectory && file.startsWith(scope.evidenceDirectory) &&
          /\.(md|json)$/u.test(file)),
      "Evidence outside exact tranche scope",
    );
    fail(paths.includes(file), "Unused evidence permission");
  }
  for (const original of scope.originals) {
    fail(
      delta.some((x) => x.path === original && x.oldOid && x.newOid),
      `Missing original ${original}`,
    );
  }
  same(
    paths.filter((x) => scope.paths.includes(x)).sort(),
    [...scope.paths].sort(),
    "Tranche source path set changed",
  );
  fail(
    paths.includes(INVENTORY) && paths.includes(authority) &&
      paths.includes(ROADMAP),
    "Required inventory/authority/roadmap missing",
  );
  for (const change of delta) {
    const file = change.path;
    fail(
      /^[A-Za-z0-9_./-]+$/u.test(file) &&
        !file.split("/").some((x) => x === "." || x === ".." || x === ""),
      "Unsafe path",
    );
    fail(
      change.newMode === "100644" &&
        (change.oldMode === null || change.oldMode === "100644"),
      "Deletion, symlink or mode change forbidden",
    );
    fail(
      !/(^|\/)(seed|seed-content|catalogs?)(\/|\.|$)/u.test(file),
      "Seed authority collision",
    );
    if (scope.paths.includes(file)) {
      fail(
        scope.originals.includes(file) || change.oldOid === null,
        "Helpers must be new additions",
      );
    } else if (
      file === "backend/package.json" && record.sourceReaderPaths.includes(file)
    ) {
      same(
        blob(head, file, cwd),
        withClassroomReads(blob(base, file, cwd)),
        "Only four exact Classroom reader permissions may change",
      );
    } else if (
      file === RETAINED_EVIDENCE && record.tranche === "admin12" &&
      record.evidencePaths.includes(file)
    ) {
      const hashes = Object.fromEntries(
        tree(head, cwd).map((x) => [x.path, x.oid]),
      );
      verifyRetainedEvidence(
        json(base, file, cwd),
        json(head, file, cwd),
        hashes,
      );
    } else if (
      file === INVENTORY || file === authority || file === ROADMAP ||
      record.evidencePaths.includes(file) ||
      record.sourceReaderPaths.includes(file)
    ) {
      // These exact bytes were independently reviewed in the base-owned record.
    } else if (/^\.github\/workflows\/[a-zA-Z0-9-]+\.yml$/u.test(file)) {
      fail(change.oldOid, "Cannot add workflow");
      const before = blob(base, file, cwd);
      const expected = record.tranche === "admin12" &&
          file === ".github/workflows/business-player-store-cutover-v2.yml"
        ? withClassroomReads(before)
        : before;
      verifyTrigger(expected, blob(head, file, cwd), authority);
    } else throw new Error(`Path outside finite tranche: ${file}`);
  }
  const manifest = json(head, authority, cwd);
  verifyAuthority(manifest, json(base, PREDECESSOR, cwd), record, paths);
  const files = new Set(tree(head, cwd).map((x) => x.path));
  for (const file of manifest.requiredFiles) {
    fail(files.has(file), `Required file absent: ${file}`);
  }
  verifyInventory(base, head, cwd);
  return {
    tranche: record.tranche,
    pullRequestNumber: event.number,
    changedPaths: paths.length,
    head,
    base,
  };
}
if (
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    fail(
      process.argv.length === 4 && process.argv[2] === "--mode",
      "Usage: verify-held14-admission.mjs --mode markets|lab",
    );
    const result = verifyAdmission({
      event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")),
      mode: process.argv[3],
    });
    process.stdout.write(
      `Finite reviewed held14 admission: ${JSON.stringify(result)}\n`,
    );
  } catch (error) {
    process.stderr.write(`Held14 admission denied: ${error.message}\n`);
    process.exitCode = 1;
  }
}
