import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { authorize, reconcile, STAGING_PROJECT } from "./staging-auth-recovery-release.mjs";

const sha = "a".repeat(40);
const env = {
  GITHUB_REPOSITORY: "kohnerbouchard-star/Student-Profile", GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main", GITHUB_SHA: sha, SOURCE_COMMIT: sha,
  CONFIRM_PROJECT_REF: STAGING_PROJECT, CONFIRM_ACTION: "RECONCILE STAGING RECOVERY",
  STAGING_ORIGIN: "https://econovaria-review-fixture-econovaria.vercel.app",
  SUPABASE_ACCESS_TOKEN: "fixture-management-token", GH_TOKEN: "fixture-github-token",
};
const endpoint = `https://api.supabase.com/v1/projects/${STAGING_PROJECT}/config/auth`;
const workflow = await readFile(".github/workflows/admin-password-recovery-release.yml", "utf8");

test("actual workflow admits only explicit staging dispatch; ordinary merges have no credentialed job", () => {
  assert.deepEqual([...workflow.matchAll(/^  ([\w-]+):\n(?=    (?:name|if):)/gmu)].map((m) => m[1]), ["validate", "reconcile-staging"]);
  const [validation, staging] = workflow.split("  reconcile-staging:\n");
  assert.doesNotMatch(validation, /secrets\.|environment:|SUPABASE_ACCESS_TOKEN|PATCH|reconcile-production/u);
  assert.doesNotMatch(workflow, /environment: production|cgiukdjwicykrmtkhudh|REQUEST_PATH|allowedProductionMutations/u);
  assert.match(workflow, /pull_request:\n    branches: \[main\]/u);
  assert.match(workflow, /push:\n    branches: \[main\]\n    paths: \*recovery-paths/u);
  for (const path of ["scripts/staging-auth-recovery-release*.mjs", "auth/recovery-start.*", "auth/reset-password.*"]) assert.ok(validation.includes(path));
  assert.match(validation, /node --test scripts\/password-recovery-frontend-contract\.test\.mjs scripts\/staging-auth-recovery-release\.test\.mjs/u);
  assert.match(staging, /needs: validate\n/u);
  assert.match(staging, /environment: staging\n/u);
  assert.match(staging, /ref: \$\{\{ github.sha \}\}/u);
  assert.match(staging, /STAGING_ORIGIN: \$\{\{ vars.ECONOVARIA_STAGING_ORIGIN \}\}/u);
  assert.match(staging, /run: node scripts\/staging-auth-recovery-release\.mjs/u);
  assert.doesNotMatch(staging, /run:.*\$\{\{/u);
  const condition = staging.match(/^    if: (.+)$/mu)[1];
  for (const event_name of ["pull_request", "push", "workflow_dispatch", "workflow_run", "schedule"]) {
    for (const ref of ["refs/heads/main", "refs/heads/feature", "refs/tags/main"]) {
      for (const project of [STAGING_PROJECT, "cgiukdjwicykrmtkhudh", ""]) {
        for (const action of [env.CONFIRM_ACTION, "", "APPROVE PRODUCTION"]) {
          const actual = vm.runInNewContext(condition, { github: { event_name, ref }, inputs: { confirm_project_ref: project, confirm_action: action } });
          assert.equal(actual, event_name === "workflow_dispatch" && ref === "refs/heads/main" && project === STAGING_PROJECT && action === env.CONFIRM_ACTION);
        }
      }
    }
  }
});

function fixture({ runtime = {}, mismatch = false, failPatch = false, badReadback = false, advance = false } = {}) {
  const calls = [];
  let patch;
  let reads = 0;
  return {
    calls, checkedOut: sha,
    currentMain: async () => advance && reads++ > 0 ? "b".repeat(40) : sha,
    read: async () => "reviewed browser artifact",
    request: async (url, options) => {
      calls.push({ url, ...options });
      assert.equal(options.redirect, "error");
      if (url === endpoint) {
        if (options.method === "PATCH") {
          if (failPatch) throw new Error("ambiguous transport failure");
          patch = JSON.parse(options.body);
          return Response.json({});
        }
        return Response.json(patch ? { ...patch, ...(badReadback ? { site_url: "wrong" } : {}) } : { uri_allow_list: "https://retained.example/path", smtp_host: "untouched", security_setting: true });
      }
      assert.equal(options.headers, undefined, "management token must never reach preview");
      if (url.endsWith("runtime-config.env.js")) return new Response(`window.__ECONOVARIA_RUNTIME_CONFIG__ = ${JSON.stringify({ environment: "staging", projectRef: STAGING_PROJECT, supabaseUrl: `https://${STAGING_PROJECT}.supabase.co`, apiTransport: "same-origin-bff", ...runtime })};\n`);
      return new Response(mismatch ? "stale browser artifact" : "reviewed browser artifact");
    },
  };
}

test("reconciliation changes exactly four staging settings, retains redirects and reads back without retry", async () => {
  const mock = fixture();
  assert.deepEqual(await reconcile(env, mock), { projectRef: STAGING_PROJECT, sourceCommit: sha, verified: true });
  const writes = mock.calls.filter((call) => call.method === "PATCH");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].url, endpoint);
  const patch = JSON.parse(writes[0].body);
  assert.deepEqual(Object.keys(patch).sort(), ["mailer_subjects_recovery", "mailer_templates_recovery_content", "site_url", "uri_allow_list"]);
  assert.equal(patch.site_url, env.STAGING_ORIGIN);
  assert.equal(patch.uri_allow_list, `https://retained.example/path,${env.STAGING_ORIGIN}/auth/recovery-start.html,${env.STAGING_ORIGIN}/auth/reset-password.html`);
  assert.ok(patch.mailer_templates_recovery_content.includes(`${env.STAGING_ORIGIN}/auth/recovery-start.html?token_hash={{ .TokenHash }}`));
  assert.ok(patch.mailer_templates_recovery_content.includes(`&amp;type=recovery&amp;project_ref=${STAGING_PROJECT}`));
  assert.match(patch.mailer_templates_recovery_content, /STAGING ENVIRONMENT/u);
  assert.doesNotMatch(patch.mailer_templates_recovery_content, /ConfirmationURL|https:\/\/(?:www\.)?econovaria\.com/u);
});

test("wrong authority, production aliases, malformed origin, missing bindings and stale source fail before fetch", async () => {
  const rejected = { GITHUB_EVENT_NAME: ["push", "pull_request"], GITHUB_REF: ["refs/heads/feature"], GITHUB_REPOSITORY: ["other/repository"], CONFIRM_PROJECT_REF: ["cgiukdjwicykrmtkhudh"], CONFIRM_ACTION: [""], SOURCE_COMMIT: ["main", "b".repeat(40)], GITHUB_SHA: ["b".repeat(40)], STAGING_ORIGIN: ["https://econovaria.vercel.app", "https://econovaria-econovaria.vercel.app", "https://econovaria-git-main-econovaria.vercel.app", "https://www.econovaria.com", "https://attacker.example", `${env.STAGING_ORIGIN}/path`, `${env.STAGING_ORIGIN}?a=b`, "http://econovaria-test-econovaria.vercel.app", ""], SUPABASE_ACCESS_TOKEN: [""], GH_TOKEN: [""] };
  for (const [key, values] of Object.entries(rejected)) for (const value of values) {
    const mock = fixture();
    await assert.rejects(reconcile({ ...env, [key]: value }, mock));
    assert.equal(mock.calls.length, 0, key);
  }
  assert.throws(() => authorize(env, "b".repeat(40), sha));
  assert.throws(() => authorize(env, sha, "b".repeat(40)));
});

test("deployment mismatch and advancing main prevent write; ambiguous PATCH/readback failure never retries", async () => {
  for (const options of [{ runtime: { environment: "production" } }, { runtime: { projectRef: "cgiukdjwicykrmtkhudh" } }, { runtime: { apiTransport: "direct" } }, { mismatch: true }, { advance: true }, { failPatch: true }, { badReadback: true }]) {
    const mock = fixture(options);
    await assert.rejects(reconcile(env, mock));
    assert.equal(mock.calls.filter((call) => call.method === "PATCH").length, options.failPatch || options.badReadback ? 1 : 0);
  }
});
