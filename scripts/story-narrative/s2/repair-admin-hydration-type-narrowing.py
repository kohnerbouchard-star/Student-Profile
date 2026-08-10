#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

patcher = Path("scripts/story-narrative/s2/diagnostic-followup.py")
text = patcher.read_text(encoding="utf-8")
old = '    if (!hydration.ok) return rpcError(hydration.error);\n'
new = '    if ("error" in hydration) return rpcError(hydration.error);\n'
if text.count(old) != 1:
    raise SystemExit(f"Admin hydration narrowing anchor matched {text.count(old)} times")
updated = text.replace(old, new, 1)
compile(updated, str(patcher), "exec")
patcher.write_text(updated, encoding="utf-8")

roadmap = Path("docs/story/STORY-NARRATIVE-CONVERGENCE-ROADMAP.md")
roadmap_text = roadmap.read_text(encoding="utf-8")
marker = "\n## Run-completion rule\n"
if marker not in roadmap_text:
    raise SystemExit("roadmap marker missing")
lines = [
    "",
    "### Run 2026-08-11 — S2 verification attempt 12",
    "",
    "Workflow run: `31436016503`",
    "Source head: `8efd570f46dc92850c97a3902a355cdce3654040`",
    "Ephemeral generated migration: `20260810215510_add_story_structured_response_windows_v1.sql`",
    "",
    "Result: FULL S2 TRANSFORMATION APPLIED EPHEMERALLY; FAILED IN ADMIN EDGE TYPECHECK; NO S2 IMPLEMENTATION COMMIT WAS PUBLISHED.",
    "",
    "Passed before failure:",
    "",
    "- exact branch/S1 boundary, toolchain, S2 payload integrity, migration generation, parser normalization, and full primary/followup application;",
    "- `git diff --check`;",
    "- `npm ci` with zero reported vulnerabilities;",
    "- backend TypeScript `tsc --noEmit`;",
    "- classroom Edge Deno check;",
    "- stock Edge Deno checks.",
    "",
    "Admin Edge typecheck failure:",
    "",
    "- `messagingOperationsCore.ts` receives an explicitly typed union from `hydrateAdminStoryInteractions`: success has `ok: true` + `threads`, failure has `ok: false` + `error`;",
    "- Deno Admin Edge checking did not narrow `hydration` sufficiently through `if (!hydration.ok)` and reported `TS2339` on `hydration.error`;",
    "- this is a type-narrowing issue in the newly injected Admin hydration call site, not a database/runtime contract failure.",
    "",
    "Correction in this run:",
    "",
    "- preserve the explicit success/failure return union;",
    "- change only the temporary followup patcher call-site guard to structural narrowing: `if (\"error\" in hydration) return rpcError(hydration.error);`;",
    "- do not weaken or cast away the Admin hydration result type;",
    "- compile the corrected followup patcher before publication.",
    "",
    "Next: trigger the complete S2 V2 landing suite; if all typechecks clear, continue directly into Player Messaging, security, capability, story, Admin, and Player-terminal regressions.",
    "",
]
roadmap.write_text(roadmap_text.replace(marker, "\n".join(lines) + marker, 1), encoding="utf-8")
