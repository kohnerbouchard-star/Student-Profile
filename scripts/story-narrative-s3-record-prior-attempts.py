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

Passed before failure:

- exact branch/S2 ancestry and staged-input guard;
- pinned Node, Deno, and Supabase CLI setup;
- CLI-generated migration placement;
- guarded pre-normalization, complete S3 source transform, and post-normalization;
- `git diff --check`;
- `npm ci` with zero reported vulnerabilities.

Typecheck failure was limited to generated tests:

- `supabasePlayerStoryContextRepository.test.ts` accessed optional `relationships` without optional chaining;
- `supabaseStoryRelationshipWriter.test.ts` used a concrete fake RPC function that did not satisfy the writer client's generic RPC signature;
- no S3 runtime implementation file produced the reported compiler errors.

Correction:

- generated context test now uses optional chaining for the compatibility-optional relationship map;
- generated writer test casts its intentionally minimal fake client at the test boundary while preserving the runtime generic client contract.

Next: rerun full S3 verification and proceed to focused relationship/runtime tests if typecheck clears.
""")

if "### Run 2026-08-11 — S3 verification attempt 4" not in text:
    entries.append("""
### Run 2026-08-11 — S3 verification attempt 4

Workflow run: `31447994052`  
Workflow head: `9564f87caa44ced64424da36fd2a9e857ce72ad3`

Result: WORKFLOW PARSE FAILURE; ZERO JOBS CREATED; NO S3 SOURCE OR MIGRATION WAS APPLIED.

Failure:

- the temporary workflow embedded a multi-line Python string whose contents escaped the YAML block indentation;
- GitHub rejected the workflow before job creation (`jobs: []`);
- the S3 source/test typing corrections were therefore not exercised by this run.

Correction:

- moved prior-run roadmap text into this standalone Python helper;
- the verification workflow now calls the helper instead of embedding multi-line Markdown inside YAML.

Next: launch a fresh S3 workflow from the corrected YAML and generated-test typing fixes.
""")

if entries:
    path.write_text(text.replace(marker, "\n".join(entries) + marker, 1), encoding="utf-8")
