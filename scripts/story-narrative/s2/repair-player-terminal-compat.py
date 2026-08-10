#!/usr/bin/env python3
from __future__ import annotations

import os
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


patcher = Path("scripts/story-narrative/s2/diagnostic-primary.py")
text = patcher.read_text(encoding="utf-8")
start_marker = '    path = repo / "player-terminal/src/api/messaging-backend-routes.js"\n'
end_marker = '    write(repo / "backend/src/domains/storylines/contracts/storyCharacterResponseWindowContract.test.ts"'
start = text.find(start_marker)
end = text.find(end_marker, start + 1)
if start < 0 or end < 0 or end <= start:
    raise SystemExit("Player terminal patcher section boundaries were not found")
replacement = Path("scripts/story-narrative/s2/player-terminal-patch-section.txt").read_text(encoding="utf-8")
text = text[:start] + replacement + text[end:]

text = replace_once(
    text,
    'import { PLAYER_ENDPOINTS } from "../src/api/endpoints.js";\n',
    'import { PLAYER_ENDPOINTS, resolveEndpoint } from "../src/api/endpoints.js";\nimport { resolveMessagingBackendRequest } from "../src/api/messaging-backend-routes.js";\n',
    "terminal S2 test import",
)
old_test = '''  assert.equal(PLAYER_ENDPOINTS.messageStoryChoice.path({ threadId: `thr_${"a".repeat(32)}`, interactionKey: "jonis.arrival.offer" }),
    `/players/me/messages/threads/thr_${"a".repeat(32)}/story-interactions/jonis.arrival.offer/select`);
  assert.deepEqual(normalizeWritePayload("messageStoryChoice", { choiceKey: "accept" }), { choiceKey: "accept" });
'''
new_test = '''  const threadId = `thr_${"a".repeat(32)}`;
  const interactionKey = "jonis.arrival.offer";
  assert.equal(
    resolveEndpoint(PLAYER_ENDPOINTS.messageStoryChoice, { threadId, interactionKey }),
    `/messages/threads/${threadId}/story-interactions/jonis.arrival.offer/select`,
  );
  assert.deepEqual(normalizeWritePayload("messageStoryChoice", { choiceKey: "accept" }), { choiceKey: "accept" });
  assert.deepEqual(
    resolveMessagingBackendRequest({
      endpointKey: "messageStoryChoice",
      payload: { choiceKey: "accept", idempotencyKey: "story-choice:1" },
      params: { threadId, interactionKey },
    }),
    {
      method: "POST",
      path: `/players/me/messages/threads/${threadId}/story-interactions/jonis.arrival.offer/select`,
      payload: { choiceKey: "accept", idempotencyKey: "story-choice:1" },
    },
  );
'''
text = replace_once(text, old_test, new_test, "terminal S2 endpoint assertion")
compile(text, str(patcher), "exec")
patcher.write_text(text, encoding="utf-8")

roadmap = Path("docs/story/STORY-NARRATIVE-CONVERGENCE-ROADMAP.md")
roadmap_text = roadmap.read_text(encoding="utf-8")
marker = "\n## Run-completion rule\n"
if marker not in roadmap_text:
    raise SystemExit("roadmap marker missing")
lines = [
    "",
    "### Run 2026-08-11 — S2 verification attempt 8",
    "",
    "Workflow run: `31434648108`",
    "Source head: `0e4d64cff4a8fb34deb2424fcb22d80ce68f4501`",
    "Ephemeral generated migration: `20260810213706_add_story_structured_response_windows_v1.sql`",
    "",
    "Result: FAILED DURING GUARDED SOURCE APPLICATION; NO S2 IMPLEMENTATION COMMIT WAS PUBLISHED.",
    "",
    "Passed before failure:",
    "",
    "- exact branch/S1 boundary, toolchain setup, S2 archive/member integrity, exact-checkout patcher compilation, migration generation, and S1 parser normalization;",
    "- canonical segment Player API route compatibility;",
    "- current classroom Messaging dispatcher compatibility;",
    "- current TypeScript `PlayerCapabilityEndpointKey` union compatibility.",
    "",
    "Failure:",
    "",
    "- the temporary primary patcher expected an older Player-terminal Messaging route registry without the current trailing comma and expected a deprecated `resolveMessagingBackendRoute` helper shape;",
    "- current terminal uses static `PLAYER_ENDPOINTS`, specialized `resolveMessagingBackendRequest`, capability-manifest coverage, shared idempotency injection, and generic `resolveEndpoint` path substitution;",
    "- guarded application stopped before dependencies or tests ran.",
    "",
    "### Run 2026-08-11 — S2 Player-terminal compatibility workflow parse failure",
    "",
    "Workflow run: `31435059387`",
    "",
    "Result: FAILED BEFORE JOB CREATION.",
    "",
    "- the first consolidated terminal compatibility workflow was rejected at YAML parsing;",
    "- it executed no checkout, patcher mutation, roadmap mutation, migration generation, or tests;",
    "- correction moved the transformation into this standalone repository script so workflow YAML contains no embedded patch literals.",
    "",
    "### Run 2026-08-11 — S2 current Player-terminal compatibility repair",
    "",
    f"Workflow run: `{os.environ.get('GITHUB_RUN_ID', '')}`",
    f"Source head: `{os.environ.get('GITHUB_SHA', '')}`",
    "",
    "Result: TEMPORARY S2 PATCHER RECONCILED; NO S2 IMPLEMENTATION SOURCE APPLIED IN THIS RUN.",
    "",
    "Corrections:",
    "",
    "- reconciled the full remaining Player-terminal S2 patch section against current source instead of fixing one stale anchor at a time;",
    "- `messageStoryChoice` is added to the specialized Messaging backend route registry with bounded thread, interaction, choice, and adapter-injected idempotency handling;",
    "- the current static `PLAYER_ENDPOINTS` route and `storyChoiceSelect` capability mapping are preserved and extended rather than replaced;",
    "- capability-manifest endpoint coverage/action requirements and write invalidations are extended additively;",
    "- bounded choice payload normalization, click handling, focus-selector restoration, and authored response-window rendering are added using current terminal contracts;",
    "- the terminal S2 test now checks both generic endpoint resolution and the authoritative specialized Messaging backend request projection;",
    "- the reconciled primary patcher compiles before publication.",
    "",
    "Next: retrigger the complete S2 V2 landing suite and continue fail-closed through the followup/backend test boundary.",
    "",
]
roadmap.write_text(roadmap_text.replace(marker, "\n".join(lines) + marker, 1), encoding="utf-8")
