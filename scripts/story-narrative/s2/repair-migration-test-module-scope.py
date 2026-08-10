#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

patcher = Path("scripts/story-narrative/s2/diagnostic-primary.py")
text = patcher.read_text(encoding="utf-8")
old = """    write(repo / \"backend/src/domains/messaging/tests/storyResponseWindowMigrationContract.test.ts\", f'''declare const Deno: {{ readTextFile(path: string): Promise<string>; test(name: string, run: () => void | Promise<void>): void }};
"""
new = """    write(repo / \"backend/src/domains/messaging/tests/storyResponseWindowMigrationContract.test.ts\", f'''export {{}};
declare const Deno: {{ readTextFile(path: string): Promise<string>; test(name: string, run: () => void | Promise<void>): void }};
"""
if text.count(old) != 1:
    raise SystemExit(f"migration contract test write anchor matched {text.count(old)} times")
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
    "### Run 2026-08-11 — S2 verification attempt 11",
    "",
    "Workflow run: `31435803912`",
    "Source head: `80e0fcf6ccf15f40c95bf2125ade49b960833bd6`",
    "Ephemeral generated migration: `20260810215226_add_story_structured_response_windows_v1.sql`",
    "",
    "Result: FULL S2 TRANSFORMATION APPLIED EPHEMERALLY; FAILED AT BACKEND TYPECHECK; NO S2 IMPLEMENTATION COMMIT WAS PUBLISHED.",
    "",
    "Passed before failure:",
    "",
    "- exact branch/S1 boundary, pinned toolchain, archive/member integrity, migration generation, and S1 parser normalization;",
    "- complete primary S2 transformation;",
    "- complete followup S2 transformation, including Player hydration/selection and Admin read-only response projection;",
    "- `git diff --check`;",
    "- `npm ci` with zero reported vulnerabilities.",
    "",
    "Typecheck failure:",
    "",
    "- `storyResponseWindowMigrationContract.test.ts` declared `Deno` in script/global scope;",
    "- existing `stockExchangeCalendarMigrationContract.test.ts` also declares `Deno` in script/global scope;",
    "- TypeScript reported `TS2451: Cannot redeclare block-scoped variable 'Deno'` for both files;",
    "- no runtime implementation file produced the reported type error.",
    "",
    "Correction in this run:",
    "",
    "- make the new S2 migration contract test an explicit module with `export {}` before its `Deno` declaration;",
    "- preserve the existing stock migration test unchanged;",
    "- compile the corrected primary patcher before publication.",
    "",
    "Next: the V2 verification workflow now watches patcher changes and will rerun automatically from this correction; proceed into Player Messaging/security/capability/story/Admin/terminal regressions if typecheck clears.",
    "",
]
roadmap.write_text(roadmap_text.replace(marker, "\n".join(lines) + marker, 1), encoding="utf-8")
