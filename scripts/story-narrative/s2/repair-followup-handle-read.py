#!/usr/bin/env python3
from __future__ import annotations

import os
from pathlib import Path

patcher = Path("scripts/story-narrative/s2/diagnostic-followup.py")
text = patcher.read_text(encoding="utf-8")
old = """    replace_once(path,
'''  client: EdgeSupabaseClient,
  gameId: string,
  playerId: string,
): Promise<Response> {
''',
'''  client: EdgeSupabaseClient,
  gameId: string,
  playerId: string,
  now: Date,
): Promise<Response> {
''')
"""
new = """    replace_once(path,
'''async function handleRead(
  request: Request,
  route: ReadRoute,
  client: EdgeSupabaseClient,
  gameId: string,
  playerId: string,
): Promise<Response> {
''',
'''async function handleRead(
  request: Request,
  route: ReadRoute,
  client: EdgeSupabaseClient,
  gameId: string,
  playerId: string,
  now: Date,
): Promise<Response> {
''')
"""
if text.count(old) != 1:
    raise SystemExit(f"generic handleRead signature patch block matched {text.count(old)} times")
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
    "### Run 2026-08-11 — S2 verification attempt 9",
    "",
    "Workflow run: `31435292286`",
    "Source head: `ff4e7b96f1f2e26240fd86f6d5e915d5919c7f28`",
    "Ephemeral generated migration: `20260810214532_add_story_structured_response_windows_v1.sql`",
    "",
    "Result: FAILED DURING GUARDED FOLLOWUP APPLICATION; NO S2 IMPLEMENTATION COMMIT WAS PUBLISHED.",
    "",
    "Passed before failure:",
    "",
    "- exact branch/S1 boundary, pinned toolchain, S2 archive/member integrity, exact-checkout patcher compilation, migration generation, and S1 parser normalization;",
    "- the complete reconciled primary S2 transformation, including current Player routing, dispatcher, capability manifest, and Player-terminal compatibility, reached the followup layer.",
    "",
    "Failure:",
    "",
    "- `diagnostic-followup.py` used a generic function-signature fragment to add `now: Date`;",
    "- that fragment appears in both `handleRead` and `handleSend` in current `playerMessagingHttpHandler.ts`;",
    "- `replace_once` correctly failed closed because the anchor matched twice;",
    "- `npm ci`, typecheck, and focused regressions did not run.",
    "",
    "Correction in this run:",
    "",
    "- narrow the temporary followup patch to the complete `async function handleRead(...)` signature;",
    "- leave `handleSend` unchanged;",
    "- compile the corrected followup patcher before publication.",
    "",
    "Next: retrigger the complete S2 V2 landing suite; if guarded application completes, proceed immediately into dependency/type/regression verification.",
    "",
]
roadmap.write_text(roadmap_text.replace(marker, "\n".join(lines) + marker, 1), encoding="utf-8")
