from __future__ import annotations

import os
import sys
from pathlib import Path

path = Path("docs/story/STORY-NARRATIVE-CONVERGENCE-ROADMAP.md")
text = path.read_text(encoding="utf-8")
marker = "\n## Run-completion rule\n"
if marker not in text:
    raise SystemExit("roadmap run-completion marker missing")

mode = sys.argv[1] if len(sys.argv) > 1 else ""
run_id = os.environ.get("GITHUB_RUN_ID", "unknown")
sha = os.environ.get("GITHUB_SHA", "unknown")

if mode == "--launch":
    text = text.replace(
        "### S4 — Choice consequences and delayed callbacks\n\nStatus: PLANNED",
        "### S4 — Choice consequences and delayed callbacks\n\nStatus: IN PROGRESS",
        1,
    )
    heading = "### Run 2026-08-11 — S4 choice callback implementation launched"
    if heading not in text:
        entry = f"""
### Run 2026-08-11 — S4 choice callback implementation launched

Workflow run: `{run_id}`
Source head: `{sha}`

Locked S4 design:

- S2 remains the sole authority for Player selections and authored defaults;
- `PlayerStoryContext` will hydrate only effective choices: an explicit selection at or before Story evaluation time, or the authored default after the response window closes;
- effective choice state records whether it came from `selected` or `default`, so silence can have different consequences from an explicit answer;
- Story rules gain `player_story_choice_is` with optional source matching;
- consequential response windows should use a finite close time;
- delayed callbacks are normal scheduled Story events placed after the response window closes, then branched per Player with `player_story_choice_is`;
- callback branches reuse existing Story effects such as relationship adjustment, cash/ledger, contract unlock, policy, flags, messages, and later content variants;
- no per-Player consequence timer, second scheduler, browser-written consequence state, or free-form interpretation is introduced.

Acceptance target for this run: demonstrate a due Story event consuming an authoritative prior choice and applying an existing effect only to the matching Player branch.
"""
        text = text.replace(marker, entry + marker, 1)

elif mode == "--success":
    text = text.replace(
        "### S4 — Choice consequences and delayed callbacks\n\nStatus: IN PROGRESS",
        "### S4 — Choice consequences and delayed callbacks\n\nStatus: COMPLETE ON BRANCH / CONNECTED STAGING PENDING",
        1,
    )
    heading = "### Run 2026-08-11 — S4 authoritative choice callbacks landed"
    if heading not in text:
        entry = f"""
### Run 2026-08-11 — S4 authoritative choice callbacks landed

Workflow run: `{run_id}`
Source head verified by runner: `{sha}`

Result: SOURCE + FOCUSED REGRESSION GREEN ON BRANCH.

Implemented:

- server-side effective-choice projection in `PlayerStoryContext` using existing S2 interaction/selection tables;
- deterministic evaluation at the Story runner's authoritative `generatedAt` timestamp;
- explicit `selected` versus authored `default` choice provenance;
- `player_story_choice_is` Story condition with optional source matching;
- stock-tick Story runner passes its exact Story evaluation time into Player context construction;
- runner-level delayed-callback proof: a scheduled event applies a consequence only to the Player whose earlier effective choice matches;
- no new database table, scheduler, browser mutation, or duplicated decision authority.

Verification completed: `git diff --check`, `npm run typecheck:all`, S4 choice/callback tests, Player Story-context tests, and `npm run test:stock-market-calendar`.

Remaining S4 acceptance: connected staging proof across actual S2 selection/default rows -> later scheduled callback -> S3/existing consequence before merge.

Next: S5 narrative content saturation using only S1–S4 proven mechanics.
"""
        text = text.replace(marker, entry + marker, 1)

elif mode == "--failure":
    heading = f"### Run 2026-08-11 — S4 verification failure `{run_id}`"
    if heading not in text:
        transform = os.environ.get("S4_TRANSFORM_OUTCOME", "unknown")
        types = os.environ.get("S4_TYPECHECK_OUTCOME", "unknown")
        callbacks = os.environ.get("S4_CALLBACK_TEST_OUTCOME", "unknown")
        contexts = os.environ.get("S4_CONTEXT_TEST_OUTCOME", "unknown")
        scheduler = os.environ.get("S4_SCHEDULER_OUTCOME", "unknown")
        entry = f"""
### Run 2026-08-11 — S4 verification failure `{run_id}`

Source head: `{sha}`

Result: FAILED; NO S4 IMPLEMENTATION COMMIT WAS PUBLISHED.

Step outcomes:

- guarded source transform: `{transform}`;
- backend/Edge typecheck: `{types}`;
- choice/callback tests: `{callbacks}`;
- Player Story-context tests: `{contexts}`;
- stock-story scheduler regression: `{scheduler}`.

The branch remains on S4 IN PROGRESS. Review the referenced workflow run before changing source; do not bypass or weaken a failing contract.
"""
        text = text.replace(marker, entry + marker, 1)
else:
    raise SystemExit("usage: story-narrative-s4-roadmap.py --launch|--success|--failure")

path.write_text(text, encoding="utf-8")
