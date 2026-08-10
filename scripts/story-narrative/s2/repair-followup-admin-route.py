#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

patcher = Path("scripts/story-narrative/s2/diagnostic-followup.py")
text = patcher.read_text(encoding="utf-8")
old = """    replace_once(path,
'''      createElement(\"p\", { className: \"admin-messages-route__body\", text: message.body || \"Message body unavailable.\" }),
      message.hidden ? createElement(\"p\", {
''',
'''      createElement(\"p\", { className: \"admin-messages-route__body\", text: message.body || \"Message body unavailable.\" }),
      storyInteractionSummary(message),
      message.hidden ? createElement(\"p\", {
''')
"""
new = """    replace_once(path,
'''      createElement(\"p\", { className: \"admin-messages-route__body\", text: message.body || \"Message body unavailable.\" }),
''',
'''      createElement(\"p\", { className: \"admin-messages-route__body\", text: message.body || \"Message body unavailable.\" }),
      storyInteractionSummary(message),
''')
"""
if text.count(old) != 1:
    raise SystemExit(f"stale Admin V2 message-body patch block matched {text.count(old)} times")
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
    "### Run 2026-08-11 — S2 verification attempt 10",
    "",
    "Workflow run: `31435586222`",
    "Source head: `4dbc3a5d9c74b39e432344dba1236bda99f5aa06`",
    "Ephemeral generated migration: `20260810214933_add_story_structured_response_windows_v1.sql`",
    "",
    "Result: FAILED DURING GUARDED FOLLOWUP APPLICATION; NO S2 IMPLEMENTATION COMMIT WAS PUBLISHED.",
    "",
    "Passed before failure:",
    "",
    "- the full reconciled primary S2 transformation;",
    "- Player Messaging followup hydration and exact `handleRead` compatibility;",
    "- followup Player Story-choice command/read normalization and error mapping;",
    "- Admin Messaging service hydration and Admin controller interaction normalization reached the V2 route rendering stage.",
    "",
    "Failure:",
    "",
    "- `diagnostic-followup.py` expected the Admin V2 message body to be immediately followed by the moderation-hidden block;",
    "- current `MessagesRoute.js` inserts Story provenance between the body and moderation block;",
    "- guarded application stopped before dependencies or tests ran.",
    "",
    "Correction in this run:",
    "",
    "- anchor only the exact existing `admin-messages-route__body` element;",
    "- insert `storyInteractionSummary(message)` immediately after the message body without moving Story provenance, moderation state, or actions;",
    "- preserve Admin as read-only for Story response state;",
    "- compile the corrected followup patcher before publication.",
    "",
    "Next: retrigger the complete S2 V2 landing suite and continue into regression verification once guarded application completes.",
    "",
]
roadmap.write_text(roadmap_text.replace(marker, "\n".join(lines) + marker, 1), encoding="utf-8")
