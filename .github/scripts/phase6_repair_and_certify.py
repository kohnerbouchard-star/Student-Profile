#!/usr/bin/env python3

from __future__ import annotations

import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

REPO = os.environ["GITHUB_REPOSITORY"]
TOKEN = os.environ["GH_TOKEN"]
HEAD_SHA = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
RUN_ID = int(os.environ["GITHUB_RUN_ID"])
VERIFY_RESULT = os.environ.get("VERIFY_RESULT", "unknown")
BRANCH = "feat/business-timed-manufacturing-v2"
BASE = "feat/business-equipment-capacity-v2"
STATE_PATH = Path("docs/roadmaps/business-phase6-repair-state-v1.json")
TRIGGER_PATH = Path("docs/roadmaps/.phase6-repair-trigger")
REPAIR_PREFIX = "fix(business): bounded Phase 6 repair iteration"

EXTERNAL_REQUIRED = [
    "Business Manufacturing Resource Hold V2",
    "Business Timed Manufacturing Resource Hold V2",
    "Business Manufacturing Completion V2",
    "Database Replay",
    "Backend Typecheck",
    "Player Terminal Verify",
    "Business Banking Runtime",
    "Business Economy V2",
    "Business Workforce Production Payroll V2",
    "Repository Quality",
    "Supply Chain Security",
    "Admin API Check",
    "Staging Readiness Preflight",
    "Required Game Market Timezone",
    "Exchange Calendar Runtime",
]

API_HEADERS = {
    "Accept": "application/vnd.github+json",
    "Authorization": f"Bearer {TOKEN}",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "econovaria-phase6-repair-controller",
}


def request_json(
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> Any:
    merged = dict(API_HEADERS)
    if headers:
        merged.update(headers)
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, headers=merged, method=method, data=data)
    with urllib.request.urlopen(request, timeout=120) as response:
        if response.status == 204:
            return None
        return json.load(response)


def latest_runs(sha: str) -> dict[str, dict[str, Any]]:
    payload = request_json(
        f"https://api.github.com/repos/{REPO}/actions/runs?head_sha={sha}&per_page=100"
    )
    selected: dict[str, dict[str, Any]] = {}
    for run in payload.get("workflow_runs", []):
        name = run.get("name")
        current = selected.get(name)
        if current is None or run.get("created_at", "") > current.get("created_at", ""):
            selected[name] = run
    return selected


def wait_for_external_gate(minutes: int = 48) -> tuple[dict[str, dict[str, Any]], list[str], list[str]]:
    deadline = time.time() + minutes * 60
    while time.time() < deadline:
        runs = latest_runs(HEAD_SHA)
        missing = [name for name in EXTERNAL_REQUIRED if name not in runs]
        pending = [
            name
            for name in EXTERNAL_REQUIRED
            if name in runs and runs[name].get("status") != "completed"
        ]
        failed = [
            name
            for name in EXTERNAL_REQUIRED
            if name in runs
            and runs[name].get("status") == "completed"
            and runs[name].get("conclusion") != "success"
        ]
        print(
            json.dumps(
                {
                    "headSha": HEAD_SHA,
                    "verifyResult": VERIFY_RESULT,
                    "missing": missing,
                    "pending": pending,
                    "failed": failed,
                },
                sort_keys=True,
            ),
            flush=True,
        )
        if not missing and not pending:
            return runs, failed, missing
        time.sleep(20)
    runs = latest_runs(HEAD_SHA)
    missing = [name for name in EXTERNAL_REQUIRED if name not in runs]
    failed = [
        name
        for name in EXTERNAL_REQUIRED
        if name in runs
        and runs[name].get("status") == "completed"
        and runs[name].get("conclusion") != "success"
    ]
    return runs, failed, missing


def failed_job_logs(run_id: int) -> str:
    jobs = request_json(
        f"https://api.github.com/repos/{REPO}/actions/runs/{run_id}/jobs?per_page=100"
    ).get("jobs", [])
    sections: list[str] = []
    for job in jobs:
        if job.get("conclusion") == "success":
            continue
        command = [
            "gh",
            "run",
            "view",
            str(run_id),
            "--repo",
            REPO,
            "--job",
            str(job["id"]),
            "--log",
        ]
        result = subprocess.run(command, text=True, capture_output=True, check=False)
        text = result.stdout or result.stderr or "No log output returned."
        sections.append(
            f"\n===== RUN {run_id} / JOB {job['id']} / {job['name']} =====\n{text[-60000:]}"
        )
    return "\n".join(sections)


def current_run_failed_logs() -> str:
    if VERIFY_RESULT == "success":
        return ""
    return failed_job_logs(RUN_ID)


def allowed_implementation_files() -> list[str]:
    subprocess.run(["git", "fetch", "origin", BASE], check=True)
    changed = subprocess.check_output(
        ["git", "diff", "--name-only", f"origin/{BASE}...HEAD"], text=True
    ).splitlines()
    result: list[str] = []
    for name in changed:
        if name.startswith("backend/supabase/migrations/2026082311") and name.endswith(".sql"):
            result.append(name)
        elif name.startswith("backend/supabase/functions/") and name.endswith((".ts", ".js")):
            result.append(name)
        elif name.startswith("backend/src/") and name.endswith((".ts", ".js")):
            result.append(name)
        elif name.startswith("player-terminal/src/") and name.endswith((".ts", ".js", ".svelte")):
            result.append(name)
        elif name.startswith("player-terminal/app/") and name.endswith((".ts", ".js", ".tsx", ".jsx")):
            result.append(name)
        elif name.startswith("player-terminal/server/") and name.endswith((".ts", ".js")):
            result.append(name)
    return sorted(set(result))


def count_prior_repairs() -> int:
    messages = subprocess.check_output(
        ["git", "log", f"origin/{BASE}..HEAD", "--format=%s"], text=True
    ).splitlines()
    return sum(message.startswith(REPAIR_PREFIX) for message in messages)


def run_local_gate() -> None:
    commands = [
        "set -euo pipefail; for script in scripts/business-phase6-manufacturing-*.mjs; do node \"$script\"; done",
        "node scripts/business-phase5-equipment-foundation-contract.mjs",
        "node scripts/business-phase5-equipment-capacity-simulation.mjs",
        "node scripts/business-phase5-equipment-recipe-sync-contract.mjs",
        "node scripts/business-phase5-equipment-production-contract.mjs",
        "node scripts/business-phase5-equipment-production-simulation.mjs",
        "node scripts/business-phase4c-production-labor-contract.mjs",
        "node scripts/business-phase4c-labor-reservation-simulation.mjs",
        "node scripts/business-phase4c-payroll-settlement-contract.mjs",
        "node scripts/business-phase4c-payroll-simulation.mjs",
        "node scripts/business-banking-runtime-contract.mjs",
        "node scripts/validate-supabase-migrations.mjs",
        "git diff --check",
    ]
    for command in commands:
        subprocess.run(["bash", "-lc", command], check=True)


def request_repair_patch(logs: str, files: list[str]) -> str:
    sections: list[str] = []
    remaining = 260_000
    for name in files:
        path = Path(name)
        if not path.exists() or remaining <= 0:
            continue
        text = path.read_text(errors="replace")
        payload = f"\n===== FILE: {name} =====\n{text}"
        payload = payload[:remaining]
        remaining -= len(payload)
        sections.append(payload)

    prompt = f"""You are repairing Phase 6 timed manufacturing in a PostgreSQL/Supabase TypeScript repository.

Return ONLY a valid unified git diff. Do not explain. Modify only files whose complete contents are supplied below. Do not modify tests, workflows, roadmap documents, authority manifests, package files, or certified Phase 1-5 migrations. Do not weaken validation, remove concurrency controls, bypass RLS, bypass idempotency, skip exact-source gates, or fabricate evidence.

Preserve these invariants:
- exact canonical Warehouse -> WIP materials, role/headcount/skill labor, and installed-equipment capacity reserve atomically before a job exists;
- server-owned timing and bounded game-scoped workers;
- exact-once WIP consumption and Finished Goods completion;
- exact-once cancellation/failure resource release;
- public-key-only Player boundaries;
- no Store selling, durability/repair economics, IPO, merge, staging, or deployment.

Fix the root cause demonstrated by the logs. Prefer a later corrective Phase 6 migration over rewriting an earlier Phase 6 migration when database compatibility permits. Keep the patch minimal.

FAILING LOGS:
{logs[-220000:]}

ALLOWED FILES:
{''.join(sections)}
"""
    models = ["openai/gpt-4.1", "openai/gpt-4o"]
    last_error: Exception | None = None
    for model in models:
        try:
            result = request_json(
                "https://models.github.ai/inference/chat/completions",
                method="POST",
                payload={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "Return only a valid unified git diff."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.05,
                    "max_tokens": 16000,
                },
                headers={"Content-Type": "application/json"},
            )
            content = result["choices"][0]["message"]["content"].strip()
            content = re.sub(r"^```(?:diff)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)
            return content + "\n"
        except Exception as error:  # noqa: BLE001
            last_error = error
    raise RuntimeError(f"GitHub Models repair request failed: {last_error}")


def validate_patch(diff: str, allowed: set[str]) -> None:
    paths = set(
        re.findall(r"^(?:\+\+\+|---) [ab]/(.+)$", diff, flags=re.MULTILINE)
    )
    forbidden = sorted(path for path in paths if path not in allowed and path != "/dev/null")
    if forbidden:
        raise RuntimeError(f"Repair patch attempted forbidden paths: {forbidden}")
    if not paths:
        raise RuntimeError("Repair model returned no file paths.")
    if len(diff.splitlines()) > 3000:
        raise RuntimeError("Repair patch exceeds the bounded line limit.")


def write_state(status: str, **details: Any) -> None:
    STATE_PATH.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "status": status,
                "evaluatedHeadSha": HEAD_SHA,
                "workflowRunId": RUN_ID,
                "verifyResult": VERIFY_RESULT,
                **details,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )


def commit_and_push(message: str) -> str:
    subprocess.run(["git", "add", "-A"], check=True)
    subprocess.run(["git", "commit", "-m", message], check=True)
    subprocess.run(["git", "push", "origin", f"HEAD:{BRANCH}"], check=True)
    return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()


def repair(runs: dict[str, dict[str, Any]], failed: list[str], missing: list[str]) -> None:
    iteration = count_prior_repairs() + 1
    if iteration > 6:
        write_state(
            "BLOCKED",
            reason="bounded_repair_limit_exceeded",
            failedWorkflows=failed,
            missingWorkflows=missing,
        )
        commit_and_push("docs(business): record bounded Phase 6 repair blocker")
        raise RuntimeError("Phase 6 exceeded six bounded implementation repairs.")

    logs = current_run_failed_logs()
    for name in failed:
        logs += failed_job_logs(int(runs[name]["id"]))
    if missing:
        logs += "\nMISSING REQUIRED WORKFLOWS AFTER TIMEOUT: " + ", ".join(missing)

    files = allowed_implementation_files()
    if not files:
        raise RuntimeError("No bounded Phase 6 implementation files are available for repair.")
    diff = request_repair_patch(logs, files)
    validate_patch(diff, set(files))
    patch_path = Path("/tmp/phase6-repair.diff")
    patch_path.write_text(diff)
    subprocess.run(["git", "apply", "--check", str(patch_path)], check=True)
    subprocess.run(["git", "apply", str(patch_path)], check=True)
    run_local_gate()
    write_state(
        "PATCHED_AWAITING_EXACT_HEAD_TRIGGER",
        iteration=iteration,
        failedWorkflows={
            name: {
                "runId": runs[name]["id"],
                "conclusion": runs[name].get("conclusion"),
                "htmlUrl": runs[name].get("html_url"),
            }
            for name in failed
        },
        missingWorkflows=missing,
        allowedImplementationFiles=files,
    )
    new_sha = commit_and_push(f"{REPAIR_PREFIX} {iteration}")
    print(f"Pushed bounded Phase 6 repair {iteration}: {new_sha}")


def permanent_workflow() -> str:
    return """name: Business Timed Manufacturing V2

on:
  pull_request:
    paths:
      - \"backend/supabase/migrations/2026082311*.sql\"
      - \"backend/supabase/functions/**\"
      - \"player-terminal/src/**\"
      - \"scripts/business-phase6-manufacturing-*.mjs\"
      - \"docs/roadmaps/business-phase6-timed-manufacturing-scope-v1.md\"
      - \".github/workflows/business-timed-manufacturing-v2.yml\"
  push:
    branches: [main]
    paths:
      - \"backend/supabase/migrations/2026082311*.sql\"
      - \"backend/supabase/functions/**\"
      - \"player-terminal/src/**\"
      - \"scripts/business-phase6-manufacturing-*.mjs\"
      - \".github/workflows/business-timed-manufacturing-v2.yml\"

permissions:
  contents: read

jobs:
  verify-manufacturing:
    runs-on: ubuntu-latest
    timeout-minutes: 35
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22.23.1
          cache: npm
          cache-dependency-path: |
            package-lock.json
            backend/package-lock.json
            player-terminal/package-lock.json
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.9.3
      - run: npm install --global npm@10.9.8
      - run: npm ci --ignore-scripts
      - name: Verify timed manufacturing and retained authorities
        shell: bash
        run: |
          set -euo pipefail
          for script in scripts/business-phase6-manufacturing-*.mjs; do
            node \"$script\"
          done
          node scripts/business-phase5-equipment-foundation-contract.mjs
          node scripts/business-phase5-equipment-capacity-simulation.mjs
          node scripts/business-phase5-equipment-recipe-sync-contract.mjs
          node scripts/business-phase5-equipment-production-contract.mjs
          node scripts/business-phase5-equipment-production-simulation.mjs
          node scripts/business-phase4c-production-labor-contract.mjs
          node scripts/business-phase4c-labor-reservation-simulation.mjs
          node scripts/business-phase4c-payroll-settlement-contract.mjs
          node scripts/business-phase4c-payroll-simulation.mjs
          node scripts/business-banking-runtime-contract.mjs
          node scripts/validate-supabase-migrations.mjs
          git diff --check
      - name: Run repository quality suite
        run: npm test
      - name: Install backend dependencies
        working-directory: backend
        run: npm ci --ignore-scripts
      - name: Verify all backend and Edge TypeScript
        working-directory: backend
        run: npm run typecheck:all
      - name: Install Player Terminal dependencies
        working-directory: player-terminal
        run: npm ci --no-audit --no-fund
      - name: Verify retained Player Business surface
        working-directory: player-terminal
        run: |
          npm run check
          node tests/business-banking-surface.mjs
          npm run adapter
          npm run capability-manifest-current
          npm run runtime-integration
"""


def certify(runs: dict[str, dict[str, Any]]) -> None:
    evidence = {
        "Business Timed Manufacturing V2": {
            "runId": RUN_ID,
            "conclusion": "success",
            "verificationJob": "verify-manufacturing",
        },
        **{
            name: {
                "runId": runs[name]["id"],
                "conclusion": runs[name]["conclusion"],
                "htmlUrl": runs[name]["html_url"],
            }
            for name in EXTERNAL_REQUIRED
        },
    }
    evidence_lines = "\n".join(
        f"- **{name} — PASS** (`{payload['runId']}`)."
        for name, payload in evidence.items()
    )
    date = dt.date.today().isoformat()

    scope_path = Path("docs/roadmaps/business-phase6-timed-manufacturing-scope-v1.md")
    scope = scope_path.read_text()
    scope = re.sub(
        r"\*\*Status:\*\*[^\n]*",
        "**Status:** COMPLETE — certified timed manufacturing lifecycle",
        scope,
        count=1,
    )
    section = f"""

## Certified Phase 6 result

- **Exact implementation and verification source:** `{HEAD_SHA}`.
- Atomic canonical Warehouse → WIP material holds, eligible labor, and installed equipment commit before one queued job exists.
- Server-owned timing, bounded deterministic queue/due-job workers, exact-once Finished Goods completion/cost basis, and exact-once cancellation/failure release are authoritative.
- Player manufacturing surfaces use public keys only and instant production is retired.

### Exact-source verification

{evidence_lines}

### Phase 6 exit result

Every Phase 6 completion rule is met on `{HEAD_SHA}`. **Phase 7 — Store seller offers and sellable Finished Goods is OPEN.**
"""
    scope = (
        scope.split("## Certified Phase 6 result", 1)[0].rstrip() + section
        if "## Certified Phase 6 result" in scope
        else scope.rstrip() + section
    )
    scope_path.write_text(scope + "\n")

    plan_path = Path("docs/roadmaps/business-v2-development-execution-plan-v1.md")
    plan = plan_path.read_text()
    plan = re.sub(
        r"(## Phase 6[^\n]*\n)(?:\*\*Status:\*\*[^\n]*\n)?",
        r"\1**Status:** COMPLETE — certified on `" + HEAD_SHA + "`\n",
        plan,
        count=1,
        flags=re.IGNORECASE,
    )
    checkpoint = f"""

### Phase 6 certified checkpoint

- Exact implementation and verification source: `{HEAD_SHA}`.
- Timed jobs, atomic resource holds, bounded workers, exact-once completion/recovery, Player integration, and instant-production retirement are complete.
- **Phase 7 — Store seller offers and sellable Finished Goods is OPEN.**
"""
    plan = (
        plan.split("### Phase 6 certified checkpoint", 1)[0].rstrip() + checkpoint
        if "### Phase 6 certified checkpoint" in plan
        else plan.rstrip() + checkpoint
    )
    plan_path.write_text(plan + "\n")

    log_path = Path("docs/roadmaps/business-v2-development-execution-log-v1.md")
    log = log_path.read_text()
    heading = f"## {date} — Phase 6 COMPLETE: timed manufacturing"
    entry = f"""

---

{heading}

- **Exact certified implementation and verification source:** `{HEAD_SHA}`.
- PR #661 remained open, draft, unmerged, and undeployed; no merge, staging/production deployment, secret mutation, or live database mutation occurred.
- Atomic canonical materials, labor, and equipment holds; server timing; bounded workers; exact-once completion; cancellation/failure recovery; public-key-only Player integration; and instant-production retirement are complete.

### Exact-source verification

{evidence_lines}

### Next authorized step

**Phase 7 — Store seller offers and sellable Finished Goods is OPEN.** Store sales, automatic revenue convergence, durability/repair economics, equity/IPO, merge, staging, and production deployment remain unauthorized.
"""
    if heading in log:
        log = log.split(heading, 1)[0].rstrip()
        if log.endswith("---"):
            log = log[:-3].rstrip()
    log_path.write_text(log.rstrip() + entry + "\n")

    marker = {
        "schemaVersion": 1,
        "status": "CERTIFIED",
        "implementationSourceSha": HEAD_SHA,
        "certificationWorkflowRunId": RUN_ID,
        "prNumber": 661,
        "branch": BRANCH,
        "workflows": evidence,
        "mergeAuthorized": False,
        "deploymentAuthorized": False,
        "nextAuthorizedPhase": "Phase 7 — Store seller offers and sellable Finished Goods",
    }
    Path("docs/roadmaps/business-phase6-certified-v1.json").write_text(
        json.dumps(marker, indent=2, sort_keys=True) + "\n"
    )

    Path(".github/workflows/business-timed-manufacturing-v2.yml").write_text(
        permanent_workflow()
    )
    for temporary in [
        Path(".github/scripts/phase6_repair_and_certify.py"),
        TRIGGER_PATH,
        STATE_PATH,
        Path(".github/workflows/business-phase6-final-certification.yml"),
        Path(".github/workflows/business-phase6-convergence.yml"),
        Path(".github/workflows/business-phase6-status-snapshot.yml"),
        Path(".github/workflows/business-phase6-status-reconciler.yml"),
        Path(".github/workflows/business-phase6-bounded-repair.yml"),
        Path(".github/workflows/business-phase6-deterministic-repair.yml"),
        Path(".github/workflows/business-phase6-source-correction.yml"),
        Path(".github/workflows/business-phase6-authority-sync.yml"),
        Path(".github/workflows/business-phase6-repair-status-probe.yml"),
        Path(".github/workflows/business-phase6-workflow-inventory.yml"),
        Path("docs/roadmaps/business-phase6-bounded-repair-status-v1.json"),
        Path("docs/roadmaps/business-phase6-workflow-inventory-v1.json"),
        Path("docs/roadmaps/business-phase6-blocked-v1.json"),
        Path("docs/roadmaps/business-phase6-status-v1.json"),
        Path("docs/roadmaps/business-phase6-status-v1.png"),
        Path("sitecustomize.py"),
        Path("pathlib.py"),
    ]:
        temporary.unlink(missing_ok=True)

    certification_sha = commit_and_push("docs(business): certify Phase 6 timed manufacturing")
    checks = "\n".join(
        f"- {name} (`{payload['runId']}`)" for name, payload in evidence.items()
    )
    body = f"""## Certified scope

Phase 6 provides the authoritative server-timed Business manufacturing lifecycle on the certified Phase 5 stack.

- **Exact Phase 6 implementation and verification source:** `{HEAD_SHA}`.
- **Durable Phase 6 certification head:** `{certification_sha}`.
- Parent PR: #660.

PR #661 remains intentionally **draft, open, unmerged, and undeployed**. It does not authorize merge, staging deployment, production deployment, secret mutation, or live database mutation.

## Certified behavior

- atomic canonical Warehouse → WIP materials, eligible labor, and installed-equipment holds before job creation;
- server-owned timing and bounded deterministic queue/due-job workers;
- exact-once WIP consumption, Finished Goods output, cost basis, and reservation settlement;
- exact-once cancellation/failure release and terminal immutability;
- authenticated public-key-only Player mutations, reads, and UI lifecycle state;
- explicit retirement of instant physical production.

## Exact-source verification

{checks}

**Next authorized phase: Phase 7 — Store seller offers and sellable Finished Goods.**
"""
    subprocess.run(
        [
            "gh",
            "pr",
            "edit",
            "661",
            "--repo",
            REPO,
            "--title",
            "Draft: Business V2 Phase 6 timed manufacturing — certified",
            "--body",
            body,
        ],
        check=True,
    )
    print(f"Certified Phase 6 source {HEAD_SHA}; documentation head {certification_sha}")


def main() -> int:
    runs, failed, missing = wait_for_external_gate()
    local_failed = VERIFY_RESULT != "success"
    if local_failed or failed or missing:
        repair(runs, failed, missing)
        return 0
    certify(runs)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001
        write_state("CONTROLLER_FAILED", error=repr(error))
        subprocess.run(["git", "add", str(STATE_PATH)], check=False)
        subprocess.run(
            ["git", "commit", "-m", "docs(business): record Phase 6 repair controller failure"],
            check=False,
        )
        subprocess.run(["git", "push", "origin", f"HEAD:{BRANCH}"], check=False)
        raise
