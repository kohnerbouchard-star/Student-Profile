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

// Successor provenance uses the immutable, already merged predecessor, not a
// caller-supplied trust root. These index-only fixtures never alter that history.
import {
  AMENDMENT_BASE,
  AMENDMENT_PATHS,
  AMENDMENT_REASON,
  BOOTSTRAP_DATA,
  verifyControlProvenance,
} from "./verify-held14-admission.mjs";

function amendmentFixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), "held14-amendment-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  execFileSync("git", ["clone", "--shared", "--no-checkout", ROOT, cwd], {
    stdio: "pipe",
  });
  git(cwd, "config", "user.name", "Fixture");
  git(cwd, "config", "user.email", "fixture@example.invalid");
  git(cwd, "read-tree", AMENDMENT_BASE);
  const read = (ref, file) =>
    execFileSync("git", ["show", `${ref}:${file}`], {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  const write = (file, content, mode = "100644") => {
    const oid = execFileSync("git", ["hash-object", "-w", "--stdin"], {
      cwd,
      input: content,
      encoding: "utf8",
    }).trim();
    git(cwd, "update-index", "--add", "--cacheinfo", `${mode},${oid},${file}`);
  };
  const remove = (file) => git(cwd, "update-index", "--force-remove", file);
  const original = JSON.parse(read(AMENDMENT_BASE, BOOTSTRAP_DATA));
  const policy = JSON.parse(read(AMENDMENT_BASE, REGISTRY));
  for (const file of AMENDMENT_PATHS) {
    if (file === REGISTRY) continue;
    let content;
    try {
      content = read(AMENDMENT_BASE, file);
    } catch {
      content = "reviewed finite addition\n";
    }
    write(file, `${content}\n`);
  }
  policy.records.find((r) => r.pullRequestNumber === 981).baseTreeDigest = "a"
    .repeat(64);
  write(REGISTRY, JSON.stringify(policy));
  const bootstrap = {
    ...original,
    amendment: {
      schemaVersion: 1,
      pullRequestNumber: 982,
      repository: REPO,
      baseRef: "main",
      baseSha: AMENDMENT_BASE,
      reason: AMENDMENT_REASON,
      originalBootstrap: {
        path: BOOTSTRAP_DATA,
        mode: "100644",
        oid: "e15ba9360faf53540bcfe353209dbf19f0f7526e",
      },
      originalRegistry: {
        path: REGISTRY,
        mode: "100644",
        oid: "a4cc33efaf27df8a9651655523d96f125508a7a1",
      },
      changes: [],
    },
  };
  const repin = () => {
    bootstrap.amendment.changes = changes(
      AMENDMENT_BASE,
      git(cwd, "write-tree"),
      cwd,
    ).filter((entry) => entry.path !== BOOTSTRAP_DATA);
  };
  const finish = (parent = AMENDMENT_BASE, bootstrapMode = "100644") => {
    write(BOOTSTRAP_DATA, JSON.stringify(bootstrap), bootstrapMode);
    return git(
      cwd,
      "commit-tree",
      git(cwd, "write-tree"),
      "-p",
      parent,
      "-m",
      "Synthetic independently reviewed successor fixture",
    );
  };
  repin();
  return {
    cwd,
    read,
    write,
    remove,
    original,
    policy,
    bootstrap,
    repin,
    finish,
  };
}

test("successor accepts one complete PR982 control transition and retains original979 provenance", (t) => {
  const f = amendmentFixture(t);
  assert.doesNotThrow(() => verifyControlProvenance(f.finish(), f.cwd));
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(f.bootstrap).filter(([key]) => key !== "amendment"),
    ),
    f.original,
  );
});

test("original merged bootstrap remains consumable without a successor object", () => {
  assert.doesNotThrow(() => verifyControlProvenance(AMENDMENT_BASE, ROOT));
});

for (
  const [name, mutate] of [
    ["wrong amendment PR", (a) => a.pullRequestNumber = 983],
    ["wrong repository", (a) => a.repository = "attacker/Student-Profile"],
    ["wrong target ref", (a) => a.baseRef = "other"],
    ["wrong exact predecessor", (a) => a.baseSha = "f".repeat(40)],
    ["wrong schema", (a) => a.schemaVersion = 2],
    ["wrong reason", (a) => a.reason = "generic-registration"],
    ["extra field", (a) => a.approved = true],
    ["missing field", (a) => delete a.reason],
    ["amendment list", (a, f) => f.bootstrap.amendment = [a]],
    ["reordered fields", (a, f) => {
      f.bootstrap.amendment = Object.fromEntries(Object.entries(a).reverse());
    }],
    [
      "original bootstrap identity",
      (a) => a.originalBootstrap.oid = "0".repeat(40),
    ],
    [
      "original registry identity",
      (a) => a.originalRegistry.oid = "0".repeat(40),
    ],
    ["original bootstrap mode", (a) => a.originalBootstrap.mode = "100755"],
    ["original registry mode", (a) => a.originalRegistry.mode = "120000"],
    ["original registry path", (a) => a.originalRegistry.path = BOOTSTRAP_DATA],
    ["original identity extra field", (a) => a.originalRegistry.extra = true],
    ["missing manifest", (a) => delete a.changes],
    ["empty manifest", (a) => a.changes = []],
    ["omitted manifest entry", (a) => a.changes.pop()],
    ["duplicate manifest entry", (a) => a.changes.push(a.changes[0])],
    ["reordered manifest", (a) => a.changes.reverse()],
    ["false new hash", (a) => a.changes[0].newOid = "0".repeat(40)],
    ["false old hash", (a) => a.changes[0].oldOid = "0".repeat(40)],
    ["false old mode", (a) => a.changes[0].oldMode = "100755"],
    ["false new mode", (a) => a.changes[0].newMode = "100755"],
    ["manifest entry extra field", (a) => a.changes[0].approved = true],
    ["manifest entry missing field", (a) => delete a.changes[0].oldOid],
    ["self-hash entry", (a) =>
      a.changes.push({
        path: BOOTSTRAP_DATA,
        oldOid: "e15ba9360faf53540bcfe353209dbf19f0f7526e",
        newOid: "0".repeat(40),
        oldMode: "100644",
        newMode: "100644",
      })],
  ]
) {
  test(`successor rejects ${name}`, (t) => {
    const f = amendmentFixture(t);
    mutate(f.bootstrap.amendment, f);
    assert.throws(() => verifyControlProvenance(f.finish(), f.cwd));
  });
}

for (
  const [name, mutate] of [
    ["original bootstrap schema", (b) => b.schemaVersion = 2],
    ["original bootstrap PR", (b) => b.pullRequestNumber = 982],
    ["original bootstrap predecessor", (b) => b.baseSha = AMENDMENT_BASE],
    ["original bootstrap repository", (b) => b.repository = "attacker/repo"],
    [
      "original bootstrap manifest",
      (b) => b.changes[0].newOid = "0".repeat(40),
    ],
    ["original registry binding", (b) => {
      b.changes.find((entry) => entry.path === REGISTRY).newOid = "0".repeat(
        40,
      );
    }],
    ["extra top-level bootstrap field", (b) => b.extra = true],
  ]
) {
  test(`successor cannot rewrite ${name}`, (t) => {
    const f = amendmentFixture(t);
    mutate(f.bootstrap);
    assert.throws(() => verifyControlProvenance(f.finish(), f.cwd));
  });
}

test("changed registry without successor provenance fails original binding", (t) => {
  const f = amendmentFixture(t);
  delete f.bootstrap.amendment;
  assert.throws(() => verifyControlProvenance(f.finish(), f.cwd));
});

for (
  const [name, mutate] of [
    [
      "third source record",
      (p) => p.records.push({ ...p.records[1], pullRequestNumber: 983 }),
    ],
    [
      "Economy record mutation",
      (p) => p.records[0].baseTreeDigest = "b".repeat(64),
    ],
    [
      "Economy complete manifest mutation",
      (p) => p.records[0].changes[0].newOid = "0".repeat(40),
    ],
    [
      "Admin support permission",
      (p) => p.records[1].sourceReaderPaths.push("arbitrary.ts"),
    ],
    [
      "Admin evidence permission",
      (p) => p.records[1].evidencePaths.push("docs/arbitrary.md"),
    ],
    ["Admin record identity", (p) => p.records[1].pullRequestNumber = 982],
    ["removed Economy record", (p) => p.records.shift()],
    ["reordered registry", (p) => p.records.reverse()],
  ]
) {
  test(`successor rejects repinned ${name}`, (t) => {
    const f = amendmentFixture(t);
    mutate(f.policy);
    f.write(REGISTRY, JSON.stringify(f.policy));
    f.repin();
    assert.throws(() => verifyControlProvenance(f.finish(), f.cwd));
  });
}

for (
  const [name, mutate] of [
    [
      "extra runtime addition",
      (f) =>
        f.write("backend/src/amendment-injection.ts", "export const x = 1;\n"),
    ],
    [
      "extra metadata addition",
      (f) => f.write("docs/amendment-extra.md", "extra\n"),
    ],
    [
      "Seed addition",
      (f) => f.write("docs/seed-content/amendment.json", "{}\n"),
    ],
    ["control deletion", (f) => f.remove(VALIDATOR)],
    ["control rename", (f) => {
      f.remove(VALIDATOR);
      f.write("scripts/renamed-held14-admission.mjs", "export {};\n");
    }],
    [
      "control executable mode",
      (f) => f.write(VALIDATOR, "export {};\n", "100755"),
    ],
    ["control symlink", (f) => f.write(VALIDATOR, "/etc/passwd", "120000")],
    [
      "missing finite path",
      (f) => f.write(VALIDATOR, f.read(AMENDMENT_BASE, VALIDATOR)),
    ],
  ]
) {
  test(`even a repinned successor manifest rejects ${name}`, (t) => {
    const f = amendmentFixture(t);
    mutate(f);
    f.repin();
    assert.throws(() => verifyControlProvenance(f.finish(), f.cwd));
  });
}

for (const file of [REGISTRY, VALIDATOR, ROADMAP, SCOPE, GENERATOR]) {
  test(`successor detects unrepinned base drift in ${file}`, (t) => {
    const f = amendmentFixture(t);
    f.write(file, "unreviewed drift\n");
    assert.throws(() => verifyControlProvenance(f.finish(), f.cwd));
  });
}

for (const mode of ["100755", "120000"]) {
  test(`successor bootstrap itself must remain regular100644, not ${mode}`, (t) => {
    const f = amendmentFixture(t);
    assert.throws(() =>
      verifyControlProvenance(f.finish(AMENDMENT_BASE, mode), f.cwd)
    );
  });
}

test("successor rejects a matching tree without exact predecessor ancestry", (t) => {
  const f = amendmentFixture(t);
  f.finish();
  const unrelated = git(
    f.cwd,
    "commit-tree",
    git(f.cwd, "write-tree"),
    "-m",
    "Unrelated root",
  );
  assert.throws(() => verifyControlProvenance(unrelated, f.cwd));
});

test("successor rejects reordered manifest entry fields", (t) => {
  const f = amendmentFixture(t);
  f.bootstrap.amendment.changes[0] = Object.fromEntries(
    Object.entries(f.bootstrap.amendment.changes[0]).reverse(),
  );
  assert.throws(() => verifyControlProvenance(f.finish(), f.cwd));
});

for (
  const file of [
    "scripts/held14-admission-contracts.mjs",
    "scripts/verify-held14-control-bootstrap.mjs",
    "scripts/held14-admission.test.mjs",
    "scripts/held14-control-bootstrap.test.mjs",
    SCOPE,
  ]
) {
  test(`source cannot supply its own control bytes in ${file}`, (t) => {
    const f = fixture(t);
    f.modify(file, "unapproved source-side control\n");
    assert.throws(() => verifyAdmission(f.options));
  });
}

for (const file of [VALIDATOR, "scripts/held14-admission-contracts.mjs"]) {
  test(`actual Lab shell does not execute malicious source copy of ${file}`, (t) => {
    const f = fixture(t);
    git(f.cwd, "remote", "add", "origin", f.cwd);
    f.modify(
      file,
      'process.stdout.write("SOURCE_SELF_APPROVED\\n"); process.exit(0);\n',
    );
    const eventPath = path.join(f.cwd, ".git", "malicious-event.json");
    writeFileSync(eventPath, JSON.stringify(f.event));
    const result = spawnSync("bash", ["-c", guardCommand(lab)], {
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
    assert.notEqual(result.status, 0, result.stderr + result.stdout);
    assert.doesNotMatch(result.stdout, /SOURCE_SELF_APPROVED/);
    assert.match(result.stderr, /snapshot mismatch/);
  });
}
