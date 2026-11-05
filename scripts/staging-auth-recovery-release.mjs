import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { buildAuthEmailConfig } from "./build-supabase-auth-email-config.mjs";

export const STAGING_PROJECT = "eecvbssdvarfcykcfrny";
const endpoint = `https://api.supabase.com/v1/projects/${STAGING_PROJECT}/config/auth`;
const files = ["auth/recovery-start.html", "auth/recovery-start.js", "auth/reset-password.html", "auth/reset-password.js"];

export function authorize(env, currentMain, checkedOut) {
  assert.equal(env.GITHUB_REPOSITORY, "kohnerbouchard-star/Student-Profile");
  assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  assert.equal(env.CONFIRM_PROJECT_REF, STAGING_PROJECT);
  assert.equal(env.CONFIRM_ACTION, "RECONCILE STAGING RECOVERY");
  assert.match(env.SOURCE_COMMIT || "", /^[a-f0-9]{40}$/u);
  for (const sha of [currentMain, checkedOut, env.GITHUB_SHA]) assert.equal(sha, env.SOURCE_COMMIT);
  // Only an explicitly bound Econovaria team preview, never a production alias.
  assert.match(env.STAGING_ORIGIN || "", /^https:\/\/econovaria-[a-z0-9-]+-econovaria\.vercel\.app$/u);
  assert.notEqual(env.STAGING_ORIGIN, "https://econovaria-git-main-econovaria.vercel.app");
  assert.ok(env.SUPABASE_ACCESS_TOKEN && env.GH_TOKEN);
}

export async function recoveryPatch(current, origin) {
  assert.ok(typeof current.uri_allow_list === "string" || Array.isArray(current.uri_allow_list));
  const redirects = Array.isArray(current.uri_allow_list)
    ? current.uri_allow_list : current.uri_allow_list.split(",").map((value) => value.trim()).filter(Boolean);
  assert.ok(redirects.every((value) => typeof value === "string"));
  const built = await buildAuthEmailConfig("staging");
  assert.equal(built.evidence.projectRef, STAGING_PROJECT);
  let template = built.payload.mailer_templates_recovery_content;
  const config = built.manifest.environments.staging;
  for (const url of [config.recoveryReviewUrl, config.appSignInUrl]) {
    const parsed = new URL(url);
    template = template.replaceAll(url, `${origin}${parsed.pathname}${parsed.search}`);
  }
  const recoveryLink = `${origin}/auth/recovery-start.html?token_hash={{ .TokenHash }}&amp;type=recovery`;
  assert.ok(template.includes(recoveryLink), "Expected canonical recovery link");
  template = template.replaceAll(recoveryLink, `${recoveryLink}&amp;project_ref=${STAGING_PROJECT}`);
  return {
    site_url: origin,
    uri_allow_list: [...new Set([...redirects, `${origin}/auth/recovery-start.html`, `${origin}/auth/reset-password.html`])].join(","),
    mailer_subjects_recovery: built.payload.mailer_subjects_recovery,
    mailer_templates_recovery_content: template,
  };
}

export async function reconcile(env, { request = fetch, currentMain, checkedOut, read = readFile }) {
  authorize(env, await currentMain(), checkedOut);
  async function get(url, options = {}) {
    const response = await request(url, { ...options, redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error("Staging recovery request failed; response body withheld.");
    return response;
  }
  const runtime = await (await get(`${env.STAGING_ORIGIN}/runtime-config.env.js`)).text();
  const match = /^window\.__ECONOVARIA_RUNTIME_CONFIG__ = (\{[\s\S]*\});\s*$/u.exec(runtime);
  assert.ok(match, "Expected generated runtime configuration");
  const config = JSON.parse(match[1]);
  assert.equal(config.environment, "staging");
  assert.equal(config.projectRef, STAGING_PROJECT);
  assert.equal(config.supabaseUrl, `https://${STAGING_PROJECT}.supabase.co`);
  assert.equal(config.apiTransport, "same-origin-bff");
  for (const file of files) {
    const deployed = await (await get(`${env.STAGING_ORIGIN}/${file}`)).text();
    assert.ok(deployed === await read(file, "utf8"), "Staging browser artifact differs from reviewed source");
  }
  const headers = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" };
  const current = await (await get(endpoint, { headers })).json();
  const patch = await recoveryPatch(current, env.STAGING_ORIGIN);
  authorize(env, await currentMain(), checkedOut);
  // One attempt only. An ambiguous write/readback failure requires operator inspection.
  await get(endpoint, { method: "PATCH", headers, body: JSON.stringify(patch) });
  const after = await (await get(endpoint, { headers })).json();
  for (const [key, value] of Object.entries(patch)) assert.ok(after[key] === value, `Staging readback mismatch: ${key}`);
  return { projectRef: STAGING_PROJECT, sourceCommit: env.SOURCE_COMMIT, verified: true };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const checkedOut = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const currentMain = async () => execFileSync("gh", ["api", "repos/kohnerbouchard-star/Student-Profile/git/ref/heads/main", "--jq", ".object.sha"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    console.log(JSON.stringify(await reconcile(process.env, { currentMain, checkedOut })));
  } catch {
    console.error("Staging recovery reconciliation failed. Inspect the approved source, bindings and staging state; do not retry an ambiguous write automatically.");
    process.exitCode = 1;
  }
}
