import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bindPullRequest, main, resolveManualPullRequest, validateRequest } from "./manual-pr-context.mjs";

const HEAD = "1".repeat(40);
const BASE = "2".repeat(40);
const repository = "example/project";
const request = () => ({ eventName: "workflow_dispatch", repository, prNumber: "938", expectedHeadSha: HEAD,
  workflowSha: HEAD, checkoutSha: HEAD, ref: "refs/heads/feat/roster", refName: "feat/roster" });
const pr = () => ({ number: 938, state: "open", merged: false, draft: true,
  head: { sha: HEAD, ref: "feat/roster", repo: { full_name: repository } },
  base: { sha: BASE, ref: "main", repo: { full_name: repository } } });
const response = (data = pr()) => ({ ok: true, status: 200, json: async () => data });

test("binds exact current draft PR head to immutable base and authority number", () => {
  assert.deepEqual(bindPullRequest(request(), pr()), { pr_number: "938", base_ref: "main", base_sha: BASE, head_sha: HEAD });
});

for (const [key, values] of Object.entries({
  eventName: ["push", "pull_request", ""], repository: ["", "example/project/../other", "example/project\noutput=1"],
  prNumber: ["", "0", "-1", "01", "938x", "9007199254740992", "938\nnext=1"],
  expectedHeadSha: ["", "1".repeat(39), "x".repeat(40), BASE], workflowSha: [BASE, ""], checkoutSha: [BASE, ""],
  ref: ["refs/tags/feat/roster", "refs/heads/main"], refName: ["", "foo\nbar", "foo;touch /tmp/injected", "x..y", "a//b", "-branch", "a.lock", ".hidden"],
})) {
  test(`rejects invalid request field ${key} before network access`, async () => {
    for (const value of values) {
      let calls = 0;
      await assert.rejects(resolveManualPullRequest({ ...request(), [key]: value }, {
        token: "synthetic-token", fetchImpl: async () => { calls++; return response(); },
      }));
      assert.equal(calls, 0);
    }
  });
}

for (const [label, change] of [
  ["wrong number", (p) => { p.number = 674; }], ["closed", (p) => { p.state = "closed"; }],
  ["merged", (p) => { p.merged = true; }], ["missing merged flag", (p) => { delete p.merged; }],
  ["fork head", (p) => { p.head.repo.full_name = "other/project"; }],
  ["wrong base repository", (p) => { p.base.repo.full_name = "other/project"; }],
  ["stale API head", (p) => { p.head.sha = BASE; }], ["wrong branch", (p) => { p.head.ref = "other"; }],
  ["missing head", (p) => { delete p.head; }], ["missing base", (p) => { delete p.base; }],
  ["base injection", (p) => { p.base.ref = "main\nhead_sha=bad"; }],
  ["invalid base sha", (p) => { p.base.sha = "main"; }],
  ["same branch", (p) => { p.base.ref = p.head.ref; }], ["same sha", (p) => { p.base.sha = HEAD; }],
]) {
  test(`rejects ${label}`, () => { const data = pr(); change(data); assert.throws(() => bindPullRequest(request(), data)); });
}

test("queries only fixed GitHub PR endpoint with read-only token and refuses redirects", async () => {
  const bound = await resolveManualPullRequest(request(), { token: "synthetic-token", fetchImpl: async (url, options) => {
    assert.equal(url, "https://api.github.com/repos/example/project/pulls/938");
    assert.equal(options.headers.Authorization, "Bearer synthetic-token");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.method, undefined);
    return response();
  } });
  assert.equal(bound.base_sha, BASE);
});

test("API errors, non-JSON and missing token fail closed without exposing response body", async () => {
  await assert.rejects(resolveManualPullRequest(request(), { token: "" }), /token/);
  for (const status of [403, 404, 429, 500]) {
    await assert.rejects(resolveManualPullRequest(request(), { token: "synthetic", fetchImpl: async () => ({ ok: false, status,
      json: async () => { throw new Error("sensitive body must not be read"); } }) }), new RegExp(`HTTP ${status}`));
  }
  await assert.rejects(resolveManualPullRequest(request(), { token: "synthetic", fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("invalid JSON"); } }) }));
});

const environment = () => ({ GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REPOSITORY: repository,
  MANUAL_PR_NUMBER: "938", MANUAL_HEAD_SHA: HEAD, GITHUB_SHA: HEAD, GITHUB_REF: "refs/heads/feat/roster",
  GITHUB_REF_NAME: "feat/roster", GITHUB_TOKEN: "synthetic-token", GITHUB_OUTPUT: "synthetic-output" });
function gitMock(calls) {
  return (...args) => {
    calls.push(args);
    if (args.join(" ") === "rev-parse HEAD") return HEAD;
    if (args.join(" ") === "remote get-url origin") return `https://github.com/${repository}.git`;
    if (args[0] === "fetch") { assert.deepEqual(args, ["fetch", "--no-tags", "origin", BASE]); return ""; }
    if (args[0] === "rev-parse") return BASE;
    if (args[0] === "merge-base") return BASE;
    throw new Error("Unexpected git operation");
  };
}

test("outputs only after exact base fetch and common ancestry verification", async () => {
  const calls = [];
  let output;
  await main(environment(), { fetchImpl: async () => response(), git: gitMock(calls), appendOutput: (path, text) => {
    assert.equal(path, "synthetic-output");
    assert.equal(calls.at(-1)[0], "merge-base");
    output = text;
  } });
  assert.equal(output, `pr_number=938\nbase_ref=main\nbase_sha=${BASE}\nhead_sha=${HEAD}\n`);
  assert.equal(output.includes("synthetic-token"), false);
});

test("wrong origin, missing base object, unrelated history and fetch failure produce no outputs", async () => {
  for (const mode of ["origin", "object", "history", "fetch"]) {
    const baseGit = gitMock([]);
    let writes = 0;
    await assert.rejects(main(environment(), { fetchImpl: async () => response(), git: (...args) => {
      if (mode === "origin" && args[0] === "remote") return "https://evil.invalid/repo";
      if (mode === "object" && args[0] === "rev-parse" && args[1] !== "HEAD") return HEAD;
      if (mode === "history" && args[0] === "merge-base") throw new Error("no common ancestor");
      if (mode === "fetch" && args[0] === "fetch") throw new Error("fetch failed");
      return baseGit(...args);
    }, appendOutput: () => { writes++; } }));
    assert.equal(writes, 0);
  }
});

test("pinned base SHA retains triple-dot scope when the base branch advances", () => {
  const dir = mkdtempSync(join(tmpdir(), "manual-pr-context-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "-b", "main"); git("config", "user.name", "Synthetic Test"); git("config", "user.email", "test@example.invalid");
    writeFileSync(join(dir, "base.txt"), "base\n"); git("add", "."); git("commit", "-m", "base");
    const pinned = git("rev-parse", "HEAD");
    git("switch", "-c", "feat/roster"); writeFileSync(join(dir, "feature.txt"), "feature\n"); git("add", "."); git("commit", "-m", "feature");
    const head = git("rev-parse", "HEAD");
    git("branch", "-f", "main", head);
    assert.equal(git("diff", "--name-only", `${pinned}...${head}`), "feature.txt");
    assert.equal(git("diff", "--name-only", `main...${head}`), "");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

export const WORKFLOWS = ["admin-business-supervision", "multicurrency-store-funding-v1", "multicurrency-marketplace-funding-v1",
  "multicurrency-stock-funding-v1", "business-multicurrency-treasury-v1", "business-player-store-fx-final-v2",
  "business-store-sales-convergence-v2", "banking-fx-clearing-v1"];

test("all eight source lanes validate manual inputs and consume bound outputs without changing PR concurrency", () => {
  for (const workflow of WORKFLOWS) {
    const source = readFileSync(`.github/workflows/${workflow}.yml`, "utf8");
    assert.match(source, /workflow_dispatch:\n    inputs:\n      pr_number:[\s\S]+?required: true[\s\S]+?expected_head_sha:[\s\S]+?required: true/u);
    assert.match(source, /id: manual_pr\n        if: github.event_name == 'workflow_dispatch'/u);
    assert.match(source, /run: node scripts\/manual-pr-context.mjs/u);
    assert.match(source, /node --test scripts\/manual-pr-context.test.mjs/u);
    assert.match(source, /github.event.pull_request.number \|\| steps.manual_pr.outputs.pr_number \|\|/u);
    assert.match(source, /github.event.pull_request.base.ref \|\| steps.manual_pr.outputs.base_ref \|\|/u);
    assert.match(source, /MANUAL_BASE_SHA: \$\{\{ steps.manual_pr.outputs.base_sha \}\}/u);
    assert.match(source, /\$\{MANUAL_BASE_SHA:-origin\/\$\{(?:AUTHORITY_)?BASE_REF\}\}\.\.\.HEAD/u);
    assert.match(source, /group: .*github.event.pull_request.number \|\| github.ref/u);
    assert.match(source, /cancel-in-progress: true/u);
    assert.match(source, /scripts\/verify-player-cross-cutting-authority.mjs/u);
    assert.match(source, /persist-credentials: false/u);
    assert.equal((source.match(/pull-requests: read/gu) || []).length, 1);
    assert.equal((source.match(/GITHUB_TOKEN:/gu) || []).length, 1);
    assert.equal(source.includes("${{ inputs.pr_number }}"), true);
    assert.equal(source.includes("${{ inputs.expected_head_sha }}"), true);
    // Inputs must be environment values, never direct shell interpolation.
    assert.equal(/run:[\s\S]*?\$\{\{ inputs\./u.test(source.slice(source.indexOf("run: node scripts/manual-pr-context.mjs"))), false);
  }
});
