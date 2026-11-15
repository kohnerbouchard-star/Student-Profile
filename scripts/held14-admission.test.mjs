import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  baseDigest,
  changes,
  GENERATOR,
  INVENTORY,
  PREDECESSOR,
  REGISTRY,
  ROADMAP,
  ROOTS,
  SCOPE,
  VALIDATOR,
  verifyAdmission,
  verifyAuthority,
  verifyTrigger,
} from "./verify-held14-admission.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "kohnerbouchard-star/Student-Profile";
const scopes = JSON.parse(readFileSync(path.join(ROOT, SCOPE)));
const predecessor = JSON.parse(readFileSync(path.join(ROOT, PREDECESSOR)));
const market = ".github/workflows/full-financial-markets-expansion.yml";
const lab = ".github/workflows/economic-balance-exploit-lab.yml";
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
function put(cwd, file, text) {
  mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  writeFileSync(path.join(cwd, file), text);
}
function commit(cwd) {
  git(cwd, "add", "-A");
  git(cwd, "commit", "-qm", "fixture");
  return git(cwd, "rev-parse", "HEAD");
}
function insertAuthority(before, authority) {
  const after = before.replace(
    /(^  pull_request:\n(?: {4}.*\n)*?    paths:\n)/mu,
    `$1      - "${authority}"\n`,
  );
  assert.notEqual(
    after,
    before,
    "Fixture requires explicit pull_request.paths",
  );
  return after;
}
function fixture(t, tranche = "economy2", mutate = () => {}) {
  const number = tranche === "economy2" ? 980 : 981;
  const authority =
    `docs/operations/contracts/player-cross-cutting/pr-${number}.json`;
  const cwd = mkdtempSync(path.join(tmpdir(), "held14-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "config", "user.name", "Fixture");
  git(cwd, "config", "user.email", "fixture@example.invalid");
  for (const root of ROOTS) put(cwd, `${root}/fixture.txt`, "static\n");
  put(cwd, "backend/src/domains/fixture/fixture.ts", "export const x = 1;\n");
  for (
    const file of [
      SCOPE,
      VALIDATOR,
      "scripts/held14-admission-contracts.mjs",
      GENERATOR,
      PREDECESSOR,
      market,
      lab,
    ]
  ) {
    const content = readFileSync(path.join(ROOT, file), "utf8");
    // Model a new fixture admission even when this suite runs on that source PR.
    put(
      cwd,
      file,
      [market, lab].includes(file)
        ? content.replaceAll(`      - "${authority}"\n`, "")
        : content,
    );
  }
  put(cwd, REGISTRY, JSON.stringify({ schemaVersion: 1, records: [] }));
  put(cwd, ROADMAP, "Original roadmap\n");
  for (const file of scopes[tranche].originals) {
    put(cwd, file, "export const before = 1;\n");
  }
  mkdirSync(path.join(cwd, path.dirname(INVENTORY)), { recursive: true });
  execFileSync(process.execPath, [GENERATOR], { cwd, stdio: "pipe" });
  const originalBase = commit(cwd);
  for (const file of scopes[tranche].paths) {
    put(cwd, file, "export const after = 2;\n");
  }
  put(cwd, ROADMAP, "Original roadmap\nReviewed finite refactor\n");
  const before = readFileSync(path.join(cwd, market), "utf8");
  put(cwd, market, insertAuthority(before, authority));
  execFileSync(process.execPath, [GENERATOR], { cwd, stdio: "pipe" });
  let manifest = {
    ...predecessor,
    authorityId: `econovaria.held14-pr-${number}.v1`,
    pullRequestNumber: number,
    allowedPaths: [],
    requiredFiles: [],
    requiredChecks: [...predecessor.requiredChecks],
    criticalJobChecks: [...predecessor.criticalJobChecks],
  };
  if (tranche === "economy2") {
    manifest.requiredChecks.push(
      "Economic Balance and Exploit Lab",
      "Validate isolated economic simulation tranche",
    );
    manifest.criticalJobChecks.push(
      "Validate isolated economic simulation tranche",
    );
  }
  put(cwd, authority, "{}");
  const source = commit(cwd);
  manifest.allowedPaths = [
    ...changes(originalBase, source, cwd).map((x) => x.path),
    "scripts/verify-player-cross-cutting-authority.mjs",
    "scripts/player-cross-cutting-authority.test.mjs",
  ];
  put(cwd, authority, JSON.stringify(manifest));
  mutate({ cwd, manifest, authority, originalBase });
  const candidate = commit(cwd);
  const record = {
    repository: REPO,
    pullRequestNumber: number,
    baseRef: "main",
    purpose: "held14-structural-refactor",
    tranche,
    baseTreeDigest: baseDigest(originalBase, cwd),
    sourceReaderPaths: [],
    evidencePaths: [],
    changes: changes(originalBase, candidate, cwd),
  };
  git(cwd, "checkout", "--detach", originalBase);
  put(cwd, REGISTRY, JSON.stringify({ schemaVersion: 1, records: [record] }));
  commit(cwd);
  const registryOid = git(cwd, "rev-parse", `HEAD:${REGISTRY}`);
  put(
    cwd,
    "docs/operations/contracts/held14/control-bootstrap.json",
    JSON.stringify({
      schemaVersion: 1,
      pullRequestNumber: 979,
      baseSha: "f5db830bca8aab9fad2b04c028563b32dfd38ef2",
      repository: REPO,
      changes: [{ path: REGISTRY, newOid: registryOid, newMode: "100644" }],
    }),
  );
  const base = commit(cwd);
  git(cwd, "checkout", "--detach", candidate);
  git(cwd, "merge", "--no-edit", base);
  let head = git(cwd, "rev-parse", "HEAD");
  const event = {
    number,
    repository: { full_name: REPO },
    pull_request: {
      number,
      base: { sha: base, ref: "main", repo: { full_name: REPO } },
      head: { sha: head, repo: { full_name: REPO } },
    },
  };
  const options = {
    event,
    mode: tranche === "economy2" ? "lab" : "markets",
    cwd,
    repository: REPO,
    eventName: "pull_request",
  };
  return {
    cwd,
    event,
    options,
    record,
    manifest,
    authority,
    base,
    head,
    modify(file, text) {
      put(cwd, file, text);
      head = commit(cwd);
      event.pull_request.head.sha = head;
    },
  };
}

test("exact independently registered Economy snapshot passes both guards with actual inventory regeneration", (t) => {
  const f = fixture(t);
  assert.equal(verifyAdmission(f.options).tranche, "economy2");
  assert.equal(
    verifyAdmission({ ...f.options, mode: "markets" }).tranche,
    "economy2",
  );
});
test("exact Admin snapshot passes Markets but cannot borrow Lab authority", (t) => {
  const f = fixture(t, "admin12");
  assert.equal(verifyAdmission(f.options).tranche, "admin12");
  assert.throws(
    () => verifyAdmission({ ...f.options, mode: "lab" }),
    /never admits Admin/,
  );
});
for (
  const [name, mutate] of [
    ["unknown PR", (o) => {
      o.event.number++;
      o.event.pull_request.number++;
    }],
    ["absent PR", (o) => {
      delete o.event.pull_request;
    }],
    ["wrong target", (o) => {
      o.event.pull_request.base.ref = "other";
    }],
    ["wrong repository", (o) => {
      o.repository = "someone/else";
    }],
    ["foreign source repository", (o) => {
      o.event.pull_request.head.repo.full_name = "someone/else";
    }],
    ["dispatch", (o) => {
      o.eventName = "workflow_dispatch";
    }],
    ["invalid SHA", (o) => {
      o.event.pull_request.base.sha = "main";
    }],
    ["different head", (o) => {
      o.event.pull_request.head.sha = o.event.pull_request.base.sha;
    }],
  ]
) {
  test(`fails closed: ${name}`, (t) => {
    const f = fixture(t);
    mutate(f.options);
    assert.throws(() => verifyAdmission(f.options));
  });
}
for (
  const [name, file] of [
    ["unlisted byte", scopes.economy2.originals[0]],
    ["head self-authorization", REGISTRY],
    [
      "bootstrap data modification",
      "docs/operations/contracts/held14/control-bootstrap.json",
    ],
    ["validator modification", VALIDATOR],
    ["generator modification", GENERATOR],
    ["extra unrelated source", "backend/src/domains/markets/activate.ts"],
    ["seed collision", "docs/seed-content/catalog.json"],
    ["migration", "backend/supabase/migrations/new.sql"],
    ["rate-limit dispatch", "backend/src/security/playerRateLimitDispatch.ts"],
    ["public route registry", "player-terminal/src/api/backend-routes.js"],
  ]
) {
  test(`rejects modified candidate: ${name}`, (t) => {
    const f = fixture(t);
    f.modify(file, "changed\n");
    assert.throws(
      () => verifyAdmission(f.options),
      /snapshot mismatch|cannot modify control policy/,
    );
  });
}
for (
  const [name, mutate, pattern] of [
    [
      "stale inventory",
      ({ cwd }) => put(cwd, INVENTORY, "{}\n"),
      /Inventory differs/,
    ],
    ["deployment flag", ({ cwd, manifest, authority }) => {
      manifest.productionDeploymentAllowed = true;
      put(cwd, authority, JSON.stringify(manifest));
    }, /escalates/],
    ["reordered required checks", ({ cwd, manifest, authority }) => {
      manifest.requiredChecks.reverse();
      put(cwd, authority, JSON.stringify(manifest));
    }, /ordered/],
    ["removed critical check", ({ cwd, manifest, authority }) => {
      manifest.criticalJobChecks.shift();
      put(cwd, authority, JSON.stringify(manifest));
    }, /ordered/],
    ["workflow permission escalation", ({ cwd }) =>
      put(
        cwd,
        market,
        readFileSync(path.join(cwd, market), "utf8").replace(
          "contents: read",
          "contents: write",
        ),
      ), /Only the own-authority/],
    [
      "new source mode",
      ({ cwd }) => chmodSync(path.join(cwd, scopes.economy2.paths[0]), 0o755),
      /mode change/,
    ],
    [
      "deleted original",
      ({ cwd }) => rmSync(path.join(cwd, scopes.economy2.originals[0])),
      /Missing original/,
    ],
    ["symlink source", ({ cwd }) => {
      const file = path.join(cwd, scopes.economy2.paths[0]);
      rmSync(file);
      symlinkSync("/etc/passwd", file);
    }, /mode change/],
    ["explicitly pinned mixed Market source", ({ cwd }) =>
      put(
        cwd,
        "backend/src/domains/markets/activate.ts",
        "export const enabled = true;",
      ), /outside finite tranche/],
    [
      "explicitly pinned Seed",
      ({ cwd }) => put(cwd, "docs/seed-content/catalog.json", "{}"),
      /Seed authority/,
    ],
  ]
) {
  test(`even a matching record cannot admit ${name}`, (t) => {
    const f = fixture(t, "economy2", mutate);
    assert.throws(() => verifyAdmission(f.options), pattern);
  });
}

test("base digest binds every path/mode except the two base-owned data records, rejecting changed baseline", (t) => {
  const f = fixture(t);
  const before = baseDigest(f.base, f.cwd);
  git(f.cwd, "checkout", "--detach", f.base);
  put(f.cwd, "unrelated.txt", "drift");
  const drift = commit(f.cwd);
  assert.notEqual(baseDigest(drift, f.cwd), before);
  git(f.cwd, "checkout", "--detach", f.head);
  git(f.cwd, "merge", "--no-edit", drift);
  f.event.pull_request.base.sha = drift;
  f.event.pull_request.head.sha = git(f.cwd, "rev-parse", "HEAD");
  assert.throws(() => verifyAdmission(f.options), /baseline drift/);
});
for (const preceding of [[], [979], [979, 980]]) {
  test(`trigger validator preserves all negative mutations after ${preceding.join("/") || "legacy"} paths`, () => {
    let before = readFileSync(path.join(ROOT, market), "utf8").replace(
      /^      - "docs\/operations\/contracts\/player-cross-cutting\/pr-(979|980)\.json"\n/gmu,
      "",
    );
    for (const number of preceding) {
      before = insertAuthority(
        before,
        `docs/operations/contracts/player-cross-cutting/pr-${number}.json`,
      );
    }
    const authority =
      "docs/operations/contracts/player-cross-cutting/pr-90001.json";
    const after = insertAuthority(before, authority);
    assert.doesNotThrow(() => verifyTrigger(before, after, authority));
    for (
      const changed of [
        after.replace("contents: read", "contents: write"),
        after.replace(
          "runs-on: ubuntu-latest",
          "if: false\n    runs-on: ubuntu-latest",
        ),
        after.replace("npm ci", "true"),
        after.replace("actions/checkout@v7", "actions/checkout@main"),
        after.replace("cancel-in-progress: true", "cancel-in-progress: false"),
        after.replace(
          "  workflow_dispatch:",
          "  workflow_dispatch:\n    inputs: {}",
        ),
        after.replace('      - "backend/src/domains/markets/**"\n', ""),
      ]
    ) assert.throws(() => verifyTrigger(before, changed, authority));
  });
}
function guardCommand(file) {
  const text = readFileSync(path.join(ROOT, file), "utf8");
  const step = text.slice(text.indexOf("      - name: Enforce ")).split(
    "\n      - name:",
  )[0];
  return step.slice(
    step.indexOf("        run: |\n") + "        run: |\n".length,
  ).split("\n").map((line) => line.replace(/^          /u, "")).join("\n");
}
test("the actual workflow shell invocation admits exact fixture and exits nonzero on invalid fixture", (t) => {
  const f = fixture(t);
  git(f.cwd, "remote", "add", "origin", f.cwd);
  const eventPath = path.join(f.cwd, ".git", "event.json");
  const run = () => {
    writeFileSync(eventPath, JSON.stringify(f.event));
    return spawnSync("bash", ["-c", guardCommand(lab)], {
      cwd: f.cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_REPOSITORY: REPO,
        GITHUB_EVENT_PATH: eventPath,
        HELD14_EVENT_BASE: f.base,
      },
    });
  };
  const valid = run();
  assert.equal(valid.status, 0, valid.stderr + valid.stdout);
  assert.match(valid.stdout, /Finite reviewed held14 admission/);
  f.modify(scopes.economy2.originals[0], "tampered source");
  const invalid = run();
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /snapshot mismatch/);
});

test("actual workflow default mode preserves every held category, Lab isolation and Seed rejection", (t) => {
  const f = fixture(t);
  git(f.cwd, "remote", "add", "origin", f.cwd);
  const eventPath = path.join(f.cwd, ".git", "default-event.json");
  const cases = [
    [market, "backend/supabase/migrations/a.sql", false],
    [market, "backend/supabase/functions/admin-api/a.test.ts", false],
    [market, "backend/supabase/functions/classroom-api/a.ts", false],
    [
      market,
      "backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts",
      false,
    ],
    [market, "backend/src/security/playerRateLimitDispatch.ts", false],
    [market, "player-terminal/src/api/backend-routes.js", false],
    [
      market,
      "player-terminal/src/integrations/student-profile-capability-manifest.js",
      false,
    ],
    [market, "backend/src/domains/markets/fixture.ts", true],
    [lab, "backend/src/simulations/economy/fixture.ts", true],
    [lab, "backend/src/simulations/economy/link.ts", false, "symlink"],
    [lab, "backend/src/simulations/economy/module", false, "submodule"],
    [lab, "docs/simulations/fixture.md", true],
    [lab, "docs/architecture/inventories/extra.json", false],
    [lab, "backend/src/simulations/economy/catalog/data.ts", false],
    [market, "backend/supabase/functions/admin-api/quoted\nfile.ts", false],
  ];
  for (const [workflow, file, expected, kind] of cases) {
    git(f.cwd, "checkout", "--detach", f.base);
    put(f.cwd, file, "unapproved fixture");
    if (kind === "symlink") {
      rmSync(path.join(f.cwd, file));
      symlinkSync("/etc/passwd", path.join(f.cwd, file));
    }
    git(f.cwd, "add", "--", file);
    if (kind === "submodule") {
      git(f.cwd, "update-index", "--cacheinfo", `160000,${f.base},${file}`);
    }
    git(f.cwd, "commit", "-qm", "unapproved fixture");
    f.event.number = 99999;
    f.event.pull_request.number = 99999;
    f.event.pull_request.head.sha = git(f.cwd, "rev-parse", "HEAD");
    writeFileSync(eventPath, JSON.stringify(f.event));
    const result = spawnSync("bash", ["-c", guardCommand(workflow)], {
      cwd: f.cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_REPOSITORY: REPO,
        GITHUB_EVENT_PATH: eventPath,
        HELD14_EVENT_BASE: f.base,
      },
    });
    assert.equal(
      result.status === 0,
      expected,
      `${workflow}: ${JSON.stringify(file)}\n${result.stderr}`,
    );
  }
});
test("default workflow rejects malformed event even when no legacy forbidden path changed", (t) => {
  const f = fixture(t);
  git(f.cwd, "remote", "add", "origin", f.cwd);
  const eventPath = path.join(f.cwd, ".git", "malformed-event.json");
  f.event.pull_request.head.sha = f.base;
  writeFileSync(eventPath, JSON.stringify(f.event));
  const result = spawnSync("bash", ["-c", guardCommand(market)], {
    cwd: f.cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REPOSITORY: REPO,
      GITHUB_EVENT_PATH: eventPath,
      HELD14_EVENT_BASE: f.base,
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AssertionError/);
});
test("both excluded base DATA files are immovable in source and code remains digest-bound", (t) => {
  const f = fixture(t);
  const digest = baseDigest(f.base, f.cwd);
  git(f.cwd, "checkout", "--detach", f.base);
  put(f.cwd, REGISTRY, '{"schemaVersion":1,"records":[]}');
  const registryOnly = commit(f.cwd);
  assert.equal(baseDigest(registryOnly, f.cwd), digest);
  put(f.cwd, "docs/operations/contracts/held14/control-bootstrap.json", "{}");
  assert.equal(baseDigest(commit(f.cwd), f.cwd), digest);
  put(f.cwd, VALIDATOR, "tampered code");
  assert.notEqual(baseDigest(commit(f.cwd), f.cwd), digest);
});
