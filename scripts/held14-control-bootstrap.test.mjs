import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  changes,
  PREDECESSOR,
  REGISTRY,
  ROADMAP,
  SCOPE,
  VALIDATOR,
} from "./verify-held14-admission.mjs";
import {
  BOOTSTRAP_BASE,
  BOOTSTRAP_RECORD,
  CONTROL_PR,
  verifyBootstrap,
} from "./verify-held14-control-bootstrap.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "kohnerbouchard-star/Student-Profile";
function fixture(t, mutate = () => {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), "held14-bootstrap-test-"));
  t.after(() => rmSync(cwd, { force: true, recursive: true }));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  execFileSync("git", ["clone", "--shared", "--no-checkout", ROOT, cwd], {
    stdio: "pipe",
  });
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("read-tree", BOOTSTRAP_BASE);
  const put = (file, content) => {
    const oid = execFileSync("git", ["hash-object", "-w", "--stdin"], {
      cwd,
      input: content,
      encoding: "utf8",
    }).trim();
    git("update-index", "--add", "--cacheinfo", `100644,${oid},${file}`);
  };
  const fields = [
    VALIDATOR,
    "scripts/held14-admission-contracts.mjs",
    SCOPE,
    REGISTRY,
    "scripts/held14-admission.test.mjs",
    "scripts/verify-held14-control-bootstrap.mjs",
    "scripts/held14-control-bootstrap.test.mjs",
    ".github/workflows/full-financial-markets-expansion.yml",
    ".github/workflows/economic-balance-exploit-lab.yml",
  ];
  for (const file of fields) {
    put(file, readFileSync(path.join(ROOT, file), "utf8"));
  }
  put(
    REGISTRY,
    JSON.stringify({
      schemaVersion: 1,
      records: ["economy2", "admin12"].map((tranche, i) => ({
        repository: REPO,
        pullRequestNumber: 980 + i,
        baseRef: "main",
        purpose: "held14-structural-refactor",
        tranche,
        baseTreeDigest: "0".repeat(64),
        sourceReaderPaths: [],
        evidencePaths: [],
        changes: [{
          path: "synthetic-reviewed-source.ts",
          oldOid: null,
          newOid: "1".repeat(40),
          oldMode: null,
          newMode: "100644",
        }],
      })),
    }),
  );
  put(ROADMAP, "Reviewed control bootstrap, not completed source.\n");
  const authority =
    `docs/operations/contracts/player-cross-cutting/pr-${CONTROL_PR}.json`;
  const inherited = JSON.parse(git("show", `${BOOTSTRAP_BASE}:${PREDECESSOR}`));
  const manifest = {
    ...inherited,
    authorityId: `econovaria.held14-control-pr-${CONTROL_PR}.v1`,
    pullRequestNumber: CONTROL_PR,
    requiredFiles: [],
    requiredChecks: [
      ...inherited.requiredChecks,
      "Economic Balance and Exploit Lab",
      "Validate isolated economic simulation tranche",
    ],
    criticalJobChecks: [
      ...inherited.criticalJobChecks,
      "Validate isolated economic simulation tranche",
    ],
  };
  put(authority, "{}");
  put(BOOTSTRAP_RECORD, "{}");
  manifest.allowedPaths = [
    ...changes(BOOTSTRAP_BASE, git("write-tree"), cwd).map((x) => x.path),
    "scripts/verify-player-cross-cutting-authority.mjs",
    "scripts/player-cross-cutting-authority.test.mjs",
  ];
  put(authority, JSON.stringify(manifest));
  mutate({ put, git, manifest, authority });
  const record = {
    schemaVersion: 1,
    pullRequestNumber: CONTROL_PR,
    baseSha: BOOTSTRAP_BASE,
    repository: REPO,
    changes: changes(BOOTSTRAP_BASE, git("write-tree"), cwd).filter((x) =>
      x.path !== BOOTSTRAP_RECORD
    ),
  };
  put(BOOTSTRAP_RECORD, JSON.stringify(record));
  const head = git(
    "commit-tree",
    git("write-tree"),
    "-p",
    BOOTSTRAP_BASE,
    "-m",
    "Synthetic control fixture",
  );
  git("update-ref", "refs/heads/fixture", head);
  git("symbolic-ref", "HEAD", "refs/heads/fixture");
  const event = {
    number: CONTROL_PR,
    repository: { full_name: REPO },
    pull_request: {
      number: CONTROL_PR,
      base: { sha: BOOTSTRAP_BASE, ref: "main", repo: { full_name: REPO } },
      head: { sha: head, repo: { full_name: REPO } },
    },
  };
  return {
    cwd,
    event,
    git,
    put,
    options: { event, cwd, repository: REPO, eventName: "pull_request" },
  };
}
test("bootstrap accepts only complete initial control payload (review establishes trust, not self-hash)", (t) => {
  const f = fixture(t);
  assert.equal(verifyBootstrap(f.options).pullRequestNumber, CONTROL_PR);
  const eventPath = path.join(f.cwd, ".git", "event.json");
  writeFileSync(eventPath, JSON.stringify(f.event));
  const cli = spawnSync(process.execPath, [
    path.join(ROOT, "scripts/verify-held14-control-bootstrap.mjs"),
  ], {
    cwd: f.cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_REPOSITORY: REPO,
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: eventPath,
    },
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /Initial reviewed control bootstrap/);
});
for (const number of [980, 981, 978, 90000]) {
  test(`bootstrap rejects non-control PR ${number}`, (t) => {
    const f = fixture(t);
    f.event.number = number;
    f.event.pull_request.number = number;
    assert.throws(() => verifyBootstrap(f.options), /one reviewed control PR/);
  });
}
for (
  const file of [
    "backend/src/simulations/economy/injected.ts",
    "backend/supabase/functions/admin-api/held.ts",
    "backend/package.json",
    "package.json",
    "backend/supabase/migrations/new.sql",
    "docs/seed-content/seed.json",
    "scripts/arbitrary.mjs",
  ]
) {
  test(`matching bootstrap record still forbids ${file}`, (t) => {
    const f = fixture(t, ({ put }) => put(file, "arbitrary payload"));
    assert.throws(
      () => verifyBootstrap(f.options),
      /forbids runtime\/unreviewed path/,
    );
  });
}
test("bootstrap rejects wrong baseline, event and repository", (t) => {
  const f = fixture(t);
  assert.throws(
    () => verifyBootstrap({ ...f.options, eventName: "workflow_dispatch" }),
    /PR event/,
  );
  assert.throws(
    () => verifyBootstrap({ ...f.options, repository: "other/repo" }),
    /repository/,
  );
  f.event.pull_request.base.sha = f.event.pull_request.head.sha;
  assert.throws(() => verifyBootstrap(f.options), /baseline/);
});
test("bootstrap cannot remove inherited checks or allow production", (t) => {
  const f = fixture(t, ({ put, manifest, authority }) => {
    manifest.productionMutationAllowed = true;
    put(authority, JSON.stringify(manifest));
  });
  assert.throws(() => verifyBootstrap(f.options), /escalates/);
});
test("bootstrap cannot quietly activate unknown source PRs", (t) => {
  const f = fixture(
    t,
    ({ put }) =>
      put(
        REGISTRY,
        JSON.stringify({
          schemaVersion: 1,
          records: [{ pullRequestNumber: 99999 }],
        }),
      ),
  );
  assert.throws(
    () => verifyBootstrap(f.options),
    /Unexpected admission fields|Only reviewed source/,
  );
});

test("actual Lab workflow invokes the one-control bootstrap and fails a source-PR replay", (t) => {
  const f = fixture(t);
  f.git("remote", "set-url", "origin", f.cwd);
  // Materialize only the three bootstrap executable modules; the gate inspects Git trees.
  execFileSync("git", [
    "checkout-index",
    "-f",
    "--",
    "scripts/verify-held14-control-bootstrap.mjs",
    VALIDATOR,
    "scripts/held14-admission-contracts.mjs",
  ], { cwd: f.cwd });
  const text = readFileSync(
    path.join(ROOT, ".github/workflows/economic-balance-exploit-lab.yml"),
    "utf8",
  );
  const step = text.slice(text.indexOf("      - name: Enforce ")).split(
    "\n      - name:",
  )[0];
  const command = step.slice(
    step.indexOf("        run: |\n") + "        run: |\n".length,
  ).split("\n").map((line) => line.replace(/^          /u, "")).join("\n");
  const eventPath = path.join(f.cwd, ".git", "workflow-event.json");
  const run = () => {
    writeFileSync(eventPath, JSON.stringify(f.event));
    return spawnSync("bash", ["-c", command], {
      cwd: f.cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_REPOSITORY: REPO,
        GITHUB_EVENT_PATH: eventPath,
        HELD14_EVENT_BASE: BOOTSTRAP_BASE,
      },
    });
  };
  const valid = run();
  assert.equal(valid.status, 0, valid.stderr + valid.stdout);
  assert.match(valid.stdout, /Initial reviewed control bootstrap/);
  // A source PR must be rejected by the workflow BEFORE any head-authored fallback.
  writeFileSync(
    path.join(f.cwd, "scripts/verify-held14-control-bootstrap.mjs"),
    'console.log("UNTRUSTED_BOOTSTRAP_EXECUTED"); process.exit(0);',
  );
  f.event.number = 980;
  f.event.pull_request.number = 980;
  const invalid = run();
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /restricted to control PR979/);
  assert.doesNotMatch(invalid.stdout, /UNTRUSTED_BOOTSTRAP_EXECUTED/);
});
