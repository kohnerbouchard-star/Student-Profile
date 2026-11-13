#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SHA = /^[0-9a-f]{40}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeBranch(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_./-]*$/u.test(value) &&
    !value.includes("..") && !value.includes("//") && !value.endsWith("/") &&
    value.split("/").every((part) => !part.startsWith(".") && !part.endsWith(".") && !part.endsWith(".lock"));
}

export function validateRequest(input) {
  assert(input.eventName === "workflow_dispatch", "Manual PR binding requires workflow_dispatch.");
  assert(REPOSITORY.test(input.repository), "Invalid repository identity.");
  assert(/^[1-9][0-9]*$/u.test(input.prNumber) && Number.isSafeInteger(Number(input.prNumber)), "Explicit PR number is required.");
  assert(SHA.test(input.expectedHeadSha), "Explicit full expected head SHA is required.");
  assert(input.workflowSha === input.expectedHeadSha && input.checkoutSha === input.expectedHeadSha,
    "Dispatch and checkout must match the expected head SHA.");
  assert(safeBranch(input.refName) && input.ref === `refs/heads/${input.refName}`, "Dispatch must use a valid branch ref.");
  return input;
}

export function bindPullRequest(input, pullRequest) {
  validateRequest(input);
  assert(pullRequest?.number === Number(input.prNumber) && pullRequest.state === "open" &&
    pullRequest.merged === false, "PR must be the requested open, unmerged PR.");
  assert(pullRequest.head?.repo?.full_name === input.repository &&
    pullRequest.base?.repo?.full_name === input.repository, "PR must belong to this repository without a fork head.");
  assert(pullRequest.head.sha === input.expectedHeadSha && pullRequest.head.ref === input.refName,
    "PR current head does not match the dispatch branch and SHA.");
  assert(safeBranch(pullRequest.base.ref) && SHA.test(pullRequest.base.sha), "Invalid PR base identity.");
  assert(pullRequest.base.ref !== pullRequest.head.ref && pullRequest.base.sha !== pullRequest.head.sha,
    "PR base and head must be distinct.");
  return {
    pr_number: String(pullRequest.number),
    base_ref: pullRequest.base.ref,
    base_sha: pullRequest.base.sha,
    head_sha: pullRequest.head.sha,
  };
}

export async function resolveManualPullRequest(input, { fetchImpl = fetch, token } = {}) {
  validateRequest(input);
  assert(typeof token === "string" && token.trim().length > 0, "Read-only GitHub token is required.");
  const response = await fetchImpl(`https://api.github.com/repos/${input.repository}/pulls/${input.prNumber}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  assert(response.ok, `PR metadata request failed (HTTP ${response.status}).`);
  return bindPullRequest(input, await response.json());
}

export async function main(env = process.env, dependencies = {}) {
  const git = dependencies.git || ((...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim());
  const context = await resolveManualPullRequest({
    eventName: env.GITHUB_EVENT_NAME,
    repository: env.GITHUB_REPOSITORY,
    prNumber: env.MANUAL_PR_NUMBER,
    expectedHeadSha: env.MANUAL_HEAD_SHA,
    workflowSha: env.GITHUB_SHA,
    checkoutSha: git("rev-parse", "HEAD"),
    ref: env.GITHUB_REF,
    refName: env.GITHUB_REF_NAME,
  }, { token: env.GITHUB_TOKEN, fetchImpl: dependencies.fetchImpl });
  // Fetch only the verified immutable base, never a caller-selected URL or branch.
  assert(git("remote", "get-url", "origin") === `https://github.com/${env.GITHUB_REPOSITORY}` ||
    git("remote", "get-url", "origin") === `https://github.com/${env.GITHUB_REPOSITORY}.git`, "Origin must match the repository.");
  git("fetch", "--no-tags", "origin", context.base_sha);
  assert(git("rev-parse", `${context.base_sha}^{commit}`) === context.base_sha, "Exact base commit was not fetched.");
  assert(SHA.test(git("merge-base", context.base_sha, context.head_sha)), "PR has no common base.");
  assert(env.GITHUB_OUTPUT, "GitHub output file is required.");
  (dependencies.appendOutput || appendFileSync)(env.GITHUB_OUTPUT, Object.entries(context).map(([key, value]) => `${key}=${value}\n`).join(""));
  process.stdout.write(`Bound PR #${context.pr_number} to exact head ${context.head_sha} and base ${context.base_sha}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // No response body, request headers, or credentials in failure logs.
    process.stderr.write("Manual PR binding failed. Verify the open PR, selected branch, expected SHA and read-only access.\n");
    process.exitCode = 1;
  });
}
