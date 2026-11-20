import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const workflowPath = ".github/workflows/production-web-session-vercel-proxy-verify.yml";
const workflow = readFileSync(join(root, workflowPath), "utf8");
const A = "a".repeat(40);
const B = "b".repeat(40);
const origin = "https://production.example.invalid";
const mainResponse = (sha = A) => JSON.stringify({ ref: "refs/heads/main", object: { type: "commit", sha } });

// Extract the real job/step shell, not a second implementation of its policy.
// This intentionally accepts only this workflow's simple indentation structure.
function job(name) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `missing job ${name}`);
  const tail = workflow.slice(start + 1);
  const next = tail.slice(3).search(/^  [a-z_]+:\s*$/m);
  return next < 0 ? tail : tail.slice(0, next + 3);
}
function shell(jobName, stepName) {
  const text = job(jobName);
  const start = text.indexOf(`      - name: ${stepName}\n`);
  assert.ok(start >= 0, `missing step ${stepName}`);
  const next = text.indexOf("      - name:", start + 1);
  const step = text.slice(start, next < 0 ? undefined : next);
  const match = step.match(/^        run: (.*)\n/m);
  assert.ok(match, `missing shell in ${stepName}`);
  if (match[1] !== "|") return match[1];
  return step.slice(match.index + match[0].length).split("\n").map(line => {
    assert.ok(line === "" || line.startsWith("          "), "unexpected shell indentation");
    return line.slice(10);
  }).join("\n");
}
const authorization = shell("authorize_production_probe", "Enforce explicit production probe authorization");
const probe = shell("verify_production", "Wait for controlled production proxy response");
const pending = shell("publish_pending", "Publish pending commit status");
const final = shell("publish_final", "Publish terminal commit status");

// These executables cannot make network requests. Unknown URLs fail closed.
const fakeCurl = `#!${process.execPath}
const fs = require("node:fs");
const assert = require("node:assert/strict");
const args = process.argv.slice(2);
const env = process.env;
const config = JSON.parse(fs.readFileSync(env.FIXTURE_CONFIG, "utf8"));
const calls = fs.existsSync(env.FIXTURE_LOG) ? fs.readFileSync(env.FIXTURE_LOG, "utf8").trim().split("\\n").filter(Boolean).map(JSON.parse) : [];
function record(value) { fs.appendFileSync(env.FIXTURE_LOG, JSON.stringify(value) + "\\n"); }
const mainUrl = "https://api.github.com/repos/kohnerbouchard-star/Student-Profile/git/ref/heads/main";
if (args.includes(mainUrl)) {
  const index = calls.filter(call => call.kind === "main").length;
  record({ kind: "main" });
  assert.equal(args[0], "--disable");
  for (const flag of ["--fail", "--proto", "--connect-timeout", "--max-time", "Cache-Control: no-cache"]) assert.ok(args.includes(flag));
  assert.ok(!args.includes("--location") && !args.includes("--retry"));
  assert.ok(!args.includes("POST"));
  if ((config.failReads || []).includes(index)) process.exit(22);
  const responses = config.mainResponses || [${JSON.stringify(mainResponse())}];
  process.stdout.write(responses[Math.min(index, responses.length - 1)]);
} else if (args.includes(${JSON.stringify(origin + "/api/admin-session/login")})) {
  assert.equal(env.PRODUCTION_ORIGIN, ${JSON.stringify(origin)});
  assert.ok(args.includes("POST") && args.includes("{}"));
  const index = calls.filter(call => call.kind === "probe").length;
  record({ kind: "probe" });
  const responses = config.probeResponses || [{ status: "400", code: "invalid_login_request" }];
  const response = responses[Math.min(index, responses.length - 1)];
  fs.writeFileSync(args[args.indexOf("--output") + 1], JSON.stringify({ error: { code: response.code } }));
  process.stdout.write(response.status);
} else if (args.includes("https://api.github.com/repos/kohnerbouchard-star/Student-Profile/statuses/" + env.APPROVED_COMMIT)) {
  assert.ok(args.includes("POST"));
  const payload = JSON.parse(fs.readFileSync(args[args.indexOf("--data-binary") + 1].slice(1), "utf8"));
  record({ kind: "status", sha: env.APPROVED_COMMIT, state: payload.state });
} else { throw new Error("Unexpected synthetic request; no network implementation exists"); }
`;
function fixture(t, config = {}) {
  const dir = mkdtempSync(join(tmpdir(), "econovaria-probe-guard-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "curl"), fakeCurl, { mode: 0o755 });
  writeFileSync(join(bin, "sleep"), `#!${process.execPath}\nif (process.argv[2] !== "10") process.exit(1);\n`, { mode: 0o755 });
  writeFileSync(join(dir, "config.json"), JSON.stringify(config));
  const env = {
    PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: dir,
    GITHUB_REPOSITORY: "kohnerbouchard-star/Student-Profile",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_SHA: A,
    SOURCE_COMMIT: A,
    APPROVED_COMMIT: A,
    PRODUCTION_ORIGIN: origin,
    CONFIRM_ORIGIN: origin,
    CONFIRM_ACTION: "PROBE PRODUCTION ADMIN SESSION ROUTE",
    GH_TOKEN: "synthetic-repository-read-token",
    GITHUB_OUTPUT: join(dir, "approval.txt"),
    INVALID_PATH: join(dir, "invalid.json"),
    PAYLOAD_PATH: join(dir, "payload.json"),
    RUN_URL: "https://example.invalid/synthetic-run",
    STATUS_CONTEXT: "econovaria/vercel-admin-session-route",
    PENDING_RESULT: "success", VALIDATE_RESULT: "success", VERIFY_RESULT: "success",
    FIXTURE_CONFIG: join(dir, "config.json"),
    FIXTURE_LOG: join(dir, "calls.jsonl"),
    MARKER: join(dir, "input-was-executed"),
  };
  return {
    env,
    run(script, overrides = {}) {
      const result = spawnSync("/bin/bash", ["--noprofile", "--norc", "-euo", "pipefail", "-c", script], {
        cwd: root, env: { ...env, ...overrides }, encoding: "utf8", timeout: 30000,
      });
      assert.equal(result.error, undefined);
      assert.equal(existsSync(env.MARKER), false, "dispatch input was executed");
      return result;
    },
    calls() {
      return existsSync(env.FIXTURE_LOG) ? readFileSync(env.FIXTURE_LOG, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
    },
    output() { return existsSync(env.GITHUB_OUTPUT) ? readFileSync(env.GITHUB_OUTPUT, "utf8") : ""; },
  };
}
function passed(result) { assert.equal(result.status, 0, result.stderr); }
function denied(result) { assert.notEqual(result.status, 0, result.stdout); }

test("workflow binds inert inputs, protected approval output and all side-effect jobs", () => {
  for (const [name, input] of [["SOURCE_COMMIT", "source_commit"], ["CONFIRM_ORIGIN", "confirm_origin"], ["CONFIRM_ACTION", "confirm_action"]]) {
    assert.ok(workflow.includes(`  ${name}: \${{ inputs.${input} }}`));
  }
  for (const run of [authorization, pending, probe, final]) assert.ok(!run.includes("${{"));
  assert.match(job("authorize_production_probe"), /environment: production\n/);
  assert.match(job("authorize_production_probe"), /approved_commit: \$\{\{ steps\.approval\.outputs\.approved_commit \}\}/);
  assert.equal(authorization, "bash scripts/production-admin-probe-guard.sh authorize");
  for (const name of ["authorize_production_probe", "publish_pending", "verify_production", "publish_final"]) {
    const block = job(name);
    assert.match(block, /if:.*github\.event_name == 'workflow_dispatch'/);
    assert.match(block, /ref: \$\{\{ github\.sha \}\}/);
    assert.match(block, /persist-credentials: false/);
    if (name !== "authorize_production_probe") {
      assert.match(block, /needs:\n(?:      - [a-z_]+\n)*      - authorize_production_probe\n/);
      assert.match(block, /APPROVED_COMMIT: \$\{\{ needs\.authorize_production_probe\.outputs\.approved_commit \}\}/);
    }
  }
  assert.match(job("publish_final"), /needs\.authorize_production_probe\.result == 'success'/);
  assert.equal((workflow.match(/statuses: write/g) || []).length, 2);
  assert.ok(!job("validate").includes("environment: production"));
  assert.match(probe, /for attempt in \$\(seq 1 72\); do\n +#.*\n +bash scripts\/production-admin-probe-guard\.sh recheck\n +status=/);
  for (const run of [pending, final]) {
    assert.match(run, /bash scripts\/production-admin-probe-guard\.sh recheck\ncurl/);
    assert.ok(run.includes("/statuses/$APPROVED_COMMIT"));
  }
  assert.match(job("verify_production"), /timeout-minutes: 15/);
  assert.ok(probe.includes("sleep 10"));
  assert.ok(probe.includes("--connect-timeout 10") && probe.includes("--max-time 20"));
  for (const path of ["scripts/production-admin-probe-guard.sh", "scripts/production-admin-probe-guard.test.mjs", "docs/operations/contracts/player-cross-cutting/pr-735.json", "docs/operations/contracts/player-cross-cutting/pr-871.json"]) {
    assert.equal(workflow.split(`      - "${path}"`).length - 1, 2, `${path} must trigger synthetic PR/push checks`);
  }
  assert.ok(job("validate").includes("node --test scripts/production-admin-probe-guard.test.mjs"));
});

test("successful approval emits only the immutable reviewed SHA", t => {
  const f = fixture(t);
  passed(f.run(authorization));
  assert.equal(f.output(), `approved_commit=${A}\n`);
  assert.deepEqual(f.calls(), [{ kind: "main" }]);
});

test("shell-like dispatch values remain data and are rejected before network", async t => {
  const payloads = ['$(touch "$MARKER")', '`touch "$MARKER"`', '"; touch "$MARKER"; #', "'; exit 0; #", '"\ntouch "$MARKER"\n#', '*', '${GITHUB_SHA}', 'a'.repeat(40) + '\napproved_commit=' + B];
  for (const field of ["SOURCE_COMMIT", "CONFIRM_ORIGIN", "CONFIRM_ACTION"]) {
    for (const [index, payload] of payloads.entries()) {
      await t.test(`${field} inert payload ${index + 1}`, child => {
        const f = fixture(child);
        denied(f.run(authorization, { [field]: payload }));
        assert.equal(f.output(), "");
        assert.deepEqual(f.calls(), []);
      });
    }
  }
});

test("missing or mismatched context and reused run approvals fail closed", async t => {
  const cases = [
    { GITHUB_REPOSITORY: "other/Student-Profile" }, { GITHUB_REF: "refs/heads/topic" },
    { GITHUB_EVENT_NAME: "push" }, { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_SHA: B }, { SOURCE_COMMIT: "A".repeat(40) }, { SOURCE_COMMIT: A + "0" },
    { GITHUB_RUN_ATTEMPT: "2" }, { GITHUB_RUN_ATTEMPT: "" }, { GH_TOKEN: "" },
    { APPROVED_COMMIT: "" }, { APPROVED_COMMIT: B }, { CONFIRM_ORIGIN: origin + "/" },
    { CONFIRM_ACTION: "probe production admin session route" },
  ];
  for (const [index, overrides] of cases.entries()) {
    await t.test(`invalid binding ${index + 1}`, child => {
      const f = fixture(child);
      denied(f.run("bash scripts/production-admin-probe-guard.sh recheck", overrides));
      assert.deepEqual(f.calls(), []);
    });
  }
});

test("authoritative lookup failures, malformed responses and wrong refs are rejected", async t => {
  const responses = ["", "not-json", "{}", "[]", mainResponse(B),
    JSON.stringify({ ref: "refs/heads/topic", object: { type: "commit", sha: A } }),
    JSON.stringify({ ref: "refs/heads/main", object: { type: "tag", sha: A } }),
    JSON.stringify({ ref: "refs/heads/main", object: { type: "commit", sha: A + "\n" } }),
    JSON.stringify({ ref: "refs/heads/main", object: { type: "commit", sha: 123 } })];
  for (const [index, response] of responses.entries()) {
    await t.test(`bad main response ${index + 1}`, child => {
      const f = fixture(child, { mainResponses: [response] });
      denied(f.run(authorization));
      assert.equal(f.output(), "");
      assert.deepEqual(f.calls(), [{ kind: "main" }]);
    });
  }
  const f = fixture(t, { failReads: [0] });
  denied(f.run(authorization));
  assert.equal(f.output(), "");
});

test("main advancing while environment approval waits cannot authorize the old run", t => {
  const f = fixture(t, { mainResponses: [mainResponse(B)] });
  denied(f.run(authorization));
  assert.equal(f.output(), "");
  assert.deepEqual(f.calls(), [{ kind: "main" }]);
});

for (const [name, script] of [["pending publisher", pending], ["production probe", probe], ["final publisher", final]]) {
  test(`main advancing while ${name} queues rejects the earlier approval before side effects`, t => {
    const f = fixture(t, { mainResponses: [mainResponse(A), mainResponse(B)] });
    passed(f.run(authorization));
    denied(f.run(script));
    assert.equal(f.output(), `approved_commit=${A}\n`);
    assert.deepEqual(f.calls(), [{ kind: "main" }, { kind: "main" }]);
  });
}

test("main advancing during retry sleep prevents a second production request", t => {
  const f = fixture(t, { mainResponses: [mainResponse(A), mainResponse(A), mainResponse(B)], probeResponses: [{ status: "503", code: "admin_bff_unavailable" }] });
  passed(f.run(authorization));
  denied(f.run(probe));
  assert.deepEqual(f.calls().map(call => call.kind), ["main", "main", "probe", "main"]);
});

test("lookup failure immediately before production prevents every production request", t => {
  const f = fixture(t, { failReads: [1] });
  passed(f.run(authorization));
  denied(f.run(probe));
  assert.deepEqual(f.calls().map(call => call.kind), ["main", "main"]);
});

test("unchanged main permits synthetic pending/probe/final, all bound to approved SHA", t => {
  const f = fixture(t);
  for (const run of [authorization, pending, probe, final]) passed(f.run(run));
  assert.deepEqual(f.calls(), [
    { kind: "main" }, { kind: "main" }, { kind: "status", sha: A, state: "pending" },
    { kind: "main" }, { kind: "probe" }, { kind: "main" }, { kind: "status", sha: A, state: "success" },
  ]);
});

test("main advancing after successful probe cannot publish stale success", t => {
  const f = fixture(t, { mainResponses: [mainResponse(A), mainResponse(A), mainResponse(A), mainResponse(B)] });
  for (const run of [authorization, pending, probe]) passed(f.run(run));
  denied(f.run(final));
  assert.deepEqual(f.calls().filter(call => call.kind === "status"), [{ kind: "status", sha: A, state: "pending" }]);
});

test("unchanged main retains all 72 bounded attempts and rechecks before each", t => {
  const f = fixture(t, { probeResponses: [{ status: "400", code: "route_not_found" }] });
  passed(f.run(authorization));
  denied(f.run(probe));
  const calls = f.calls().slice(1);
  assert.equal(calls.length, 144);
  for (let index = 0; index < calls.length; index += 2) {
    assert.equal(calls[index].kind, "main");
    assert.equal(calls[index + 1].kind, "probe");
  }
});

test("existing observable contract still passes without a production call", t => {
  const f = fixture(t);
  passed(f.run(shell("validate", "Validate observable verification contract")));
  assert.deepEqual(f.calls(), []);
});

test("shared ownership preserves PR735 scope and PR871's six-path boundary", async () => {
  const { verifyAuthority, authorityPathForPullRequest } = await import("./verify-player-cross-cutting-authority.mjs");
  const manifests = [735, 871].map(pr => JSON.parse(readFileSync(join(root, authorityPathForPullRequest(pr)), "utf8")));
  const [canonical, guard] = manifests;
  assert.deepEqual(canonical.sharedWorkflowOwnership, guard.sharedWorkflowOwnership);
  assert.equal(guard.sharedWorkflowOwnership.guardOwnerPullRequest, 871);
  assert.equal(guard.sharedWorkflowOwnership.canonicalOriginOwnerPullRequest, 735);
  assert.equal(guard.sharedWorkflowOwnership.mergeAuthorized, false);
  assert.deepEqual(guard.sharedWorkflowOwnership.releaseHolds, ["REF-019", "REF-020", "existing production release holds"]);
  const canonicalPaths = ["deploy", "final-verify", "hotfix", "post-deploy-verify", "release", "route-observer", "secrets", "vercel-proxy-verify"].map(name => `.github/workflows/production-web-session-${name}.yml`).concat([
    authorityPathForPullRequest(735), "docs/operations/evidence/production-web-session-recovery-v1.json", "docs/operations/release-requests/production-web-session-release-v1.json", "docs/roadmaps/econovaria-beta-completion-roadmap-v1.md", "scripts/player-cross-cutting-authority.test.mjs", "scripts/production-web-session-release-orchestrator.test.mjs", "scripts/verify-player-cross-cutting-authority.mjs", "scripts/web-session-release-contract.test.mjs",
  ]);
  assert.deepEqual(canonical.allowedPaths, canonicalPaths);
  const changedPaths = [workflowPath, "scripts/production-admin-probe-guard.sh", "scripts/production-admin-probe-guard.test.mjs", authorityPathForPullRequest(871), authorityPathForPullRequest(735), "docs/roadmaps/production-admin-probe-guard-v1.md"];
  const input = { manifest: guard, changedPaths, pullRequestNumber: 871, baseRef: "main", manifestPath: authorityPathForPullRequest(871) };
  assert.equal(verifyAuthority(input).changedPathCount, 6);
  assert.throws(() => verifyAuthority({ ...input, pullRequestNumber: 735 }), /not bound/);
  assert.throws(() => verifyAuthority({ ...input, baseRef: "release/production" }), /base ref/);
  for (const path of ["api/password-reset.js", ".github/workflows/admin-password-recovery-release.yml", "docs/operations/release-requests/production-web-session-release-v1.json"]) {
    assert.throws(() => verifyAuthority({ ...input, changedPaths: [...changedPaths, path] }), /does not allow/);
  }
  for (const manifest of manifests) {
    assert.deepEqual(manifest.requiredFiles, [authorityPathForPullRequest(manifest.pullRequestNumber), "scripts/player-cross-cutting-authority.test.mjs", "scripts/verify-player-cross-cutting-authority.mjs"]);
    assert.deepEqual(manifest.requiredChecks, ["player-terminal-verify", "player-edge-trusted-ip-entrypoint-contract", "player-production-secret-provision-contract", "player-api-read-resilience"]);
    for (const flag of ["productionDeploymentAllowed", "productionMutationAllowed", "secretValuesAllowed"]) {
      assert.equal(manifest[flag], false);
      assert.throws(() => verifyAuthority({ ...input, manifest: { ...guard, [flag]: true } }), /must deny/);
    }
  }
});
