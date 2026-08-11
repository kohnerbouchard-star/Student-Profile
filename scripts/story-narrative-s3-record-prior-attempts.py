from pathlib import Path

path = Path("docs/story/STORY-NARRATIVE-CONVERGENCE-ROADMAP.md")
text = path.read_text(encoding="utf-8")
marker = "\n## Run-completion rule\n"
if marker not in text:
    raise SystemExit("roadmap run-completion marker missing")

entries = []
if "### Run 2026-08-11 — S3 verification attempt 3" not in text:
    entries.append("""
### Run 2026-08-11 — S3 verification attempt 3

Workflow run: `31447867568`
Workflow head: `315de96898a68d04c3098427d87d1ae31dfb072e`
Ephemeral generated migration: `20260811005947_add_story_relationship_state_v1.sql`

Result: FULL S3 SOURCE TRANSFORM APPLIED EPHEMERALLY; FAILED AT TYPECHECK; NO S3 IMPLEMENTATION COMMIT WAS PUBLISHED.

Passed before failure: exact branch/S2 ancestry and staged-input guard; pinned Node/Deno/Supabase CLI; migration generation; full guarded transform; `git diff --check`; and `npm ci`.

Failure was limited to generated tests: optional relationship access and fake generic RPC typing. Runtime S3 files produced no reported compiler error.

Correction: generated context test uses optional chaining and generated writer test casts its intentionally minimal fake client at the test boundary.
""")

if "### Run 2026-08-11 — S3 verification attempt 4" not in text:
    entries.append("""
### Run 2026-08-11 — S3 verification attempt 4

Workflow run: `31447994052`
Workflow head: `9564f87caa44ced64424da36fd2a9e857ce72ad3`

Result: WORKFLOW PARSE FAILURE; ZERO JOBS CREATED; NO S3 SOURCE OR MIGRATION WAS APPLIED.

Failure: embedded multi-line Python text escaped the YAML block indentation. Correction: prior-run roadmap text moved to a standalone Python helper.
""")

if "### Run 2026-08-11 — S3 verification attempt 5" not in text:
    entries.append("""
### Run 2026-08-11 — S3 verification attempt 5

Workflow run: `31448062461`
Workflow head: `028227e3bd011a535625a29b676955a494f9e02e`

Result: FAILED DURING PRIOR-RUN ROADMAP PERSISTENCE; NO S3 SOURCE OR MIGRATION WAS APPLIED.

Failure: Markdown hard-break trailing spaces from the ledger helper were rejected by `git diff --check`. Correction: helper output was made diff-clean.
""")

if "### Run 2026-08-11 — S3 verification attempt 6" not in text:
    entries.append("""
### Run 2026-08-11 — S3 verification attempt 6

Workflow run: `31448141052`
Workflow head: `1e0efc87596052be5b881b01150f85caafe8a160`
Ephemeral generated migration: `20260811010438_add_story_relationship_state_v1.sql`

Result: TYPECHECK + NEW S3 CONTRACT TESTS GREEN; FAILED IN EXISTING PLAYER STORY CONTEXT FIXTURE; NO S3 IMPLEMENTATION COMMIT WAS PUBLISHED.

Passed before failure:

- prior attempts 3–5 were successfully persisted to the roadmap in commit `292e9846b60ba6524606002824f5cc74205a1ee4`;
- exact branch/S2 guard and pinned toolchain;
- CLI migration generation and complete guarded S3 transform;
- `git diff --check` and `npm ci`;
- `npm run typecheck:all`;
- `npm run test:story-relationships` (2/2 passed);
- all 14 existing Story condition-engine tests;
- all 12 existing Story effect-engine tests.

Failure:

- one existing `supabasePlayerStoryContextRepository.test.ts` fixture expected checking cash `1250` but omitted the `currency_code` fields required by the current production repository contract;
- the repository correctly returned `0` because no valuation currency could be resolved;
- this was an inherited stale fixture exposed by the expanded S3 focused suite, not a relationship runtime defect.

Correction:

- fixture country profiles now carry canonical NRC/YRC currency codes;
- checking-balance rows now carry the matching currency codes;
- no production cash/banking logic was changed.

Next: rerun S3 from the corrected fixture normalization, then proceed through migration-contract and stock-story scheduler checks.
""")

if entries:
    path.write_text(text.replace(marker, "\n".join(entries) + marker, 1), encoding="utf-8")
