#!/usr/bin/env bash
# Called only by the manually approved probe workflow; tests replace curl entirely.
set -euo pipefail

deny() {
  printf '%s\n' "Production probe authorization rejected: $1" >&2
  exit 1
}

[[ "$#" == "1" ]] || deny 'one guard mode is required'
mode="$1"
[[ "$mode" == "authorize" || "$mode" == "recheck" ]] || deny 'invalid guard mode'
[[ "${GITHUB_REPOSITORY:-}" == "kohnerbouchard-star/Student-Profile" ]] || deny 'repository mismatch'
[[ "${GITHUB_EVENT_NAME:-}" == "workflow_dispatch" ]] || deny 'manual dispatch required'
[[ "${GITHUB_REF:-}" == "refs/heads/main" ]] || deny 'main ref required'
# A rerun must not reuse an earlier environment approval, even on the same SHA.
[[ "${GITHUB_RUN_ATTEMPT:-}" == "1" ]] || deny 'a new dispatch and approval are required'
[[ "${SOURCE_COMMIT:-}" =~ ^[a-f0-9]{40}$ ]] || deny 'invalid source commit'
[[ "$SOURCE_COMMIT" == "${GITHUB_SHA:-}" ]] || deny 'workflow commit mismatch'
[[ -n "${PRODUCTION_ORIGIN:-}" ]] || deny 'reviewed origin is missing'
[[ "${CONFIRM_ORIGIN:-}" == "$PRODUCTION_ORIGIN" ]] || deny 'origin mismatch'
[[ "${CONFIRM_ACTION:-}" == "PROBE PRODUCTION ADMIN SESSION ROUTE" ]] || deny 'action mismatch'
if [[ "$mode" == "recheck" ]]; then
  [[ "${APPROVED_COMMIT:-}" =~ ^[a-f0-9]{40}$ ]] || deny 'approved commit is missing or invalid'
  [[ "$APPROVED_COMMIT" == "$SOURCE_COMMIT" ]] || deny 'approved commit mismatch'
fi
[[ -n "${GH_TOKEN:-}" ]] || deny 'read-only repository authentication is missing'

# Do not use a cached checkout, the dispatch SHA alone, or an input-selected URL.
# No redirect, curl configuration file, response logging, or automatic retry.
current_main="$(curl --disable --fail --silent --show-error \
  --proto '=https' --connect-timeout 10 --max-time 20 \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  -H 'Cache-Control: no-cache' \
  'https://api.github.com/repos/kohnerbouchard-star/Student-Profile/git/ref/heads/main' \
  | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => {
      input += chunk;
      if (input.length > 65536) process.exit(1);
    });
    process.stdin.on("end", () => {
      try {
        const value = JSON.parse(input);
        if (value?.ref !== "refs/heads/main" || value?.object?.type !== "commit" ||
            typeof value.object.sha !== "string" || !/^[a-f0-9]{40}$/.test(value.object.sha)) {
          process.exit(1);
        }
        process.stdout.write(value.object.sha);
      } catch { process.exit(1); }
    });
  ')" || deny 'authoritative main lookup failed'
[[ "$current_main" == "$SOURCE_COMMIT" ]] || deny 'main advanced; dispatch and approve the new commit'

if [[ "$mode" == "authorize" ]]; then
  [[ -n "${GITHUB_OUTPUT:-}" ]] || deny 'approval output is unavailable'
  printf 'approved_commit=%s\n' "$SOURCE_COMMIT" >> "$GITHUB_OUTPUT"
fi
