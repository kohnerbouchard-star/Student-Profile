from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROADMAP = Path("docs/story/STORY-NARRATIVE-CONVERGENCE-ROADMAP.md")
PACK = Path("docs/seed-content/story/content/act1-august-content-pack-v1.json")
MARKER = "\n## Run-completion rule\n"


def append_once(text: str, heading: str, body: str) -> str:
    if heading in text:
        return text
    if MARKER not in text:
        raise SystemExit("roadmap run-completion marker missing")
    return text.replace(MARKER, f"\n{heading}\n\n{body}\n{MARKER}", 1)


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    text = ROADMAP.read_text(encoding="utf-8")
    run_id = os.environ.get("GITHUB_RUN_ID", "unknown")
    sha = os.environ.get("GITHUB_SHA", "unknown")

    if mode == "--launch":
        heading = "### Run 2026-08-11 — S5 August executable content pack launched"
        body = "\n".join([
            f"Workflow run: `{run_id}`",
            f"Source head: `{sha}`",
            "",
            "Target: convert the August Days 1–31 calendar into parser-valid authored Story content using S1–S4 mechanics.",
            "",
            "Acceptance for this run: 10-country recurring-character coverage; four structured choice points per country; later S4 callbacks for every consequential choice; News and Contract/system asset manifests; full Day 1–31 coverage; no hidden-canon leakage; Story parser validation; existing Messaging/callback/scheduler regressions remain green.",
            "",
            "Scope boundary: August Contract and non-Story system adapters remain explicitly `PLANNED_BINDING` until separate authoritative adapter work lands.",
        ])
        text = append_once(text, heading, body)

    elif mode == "--success":
        data = json.loads(PACK.read_text(encoding="utf-8"))
        events = data["storyEvents"]
        news = data["news"]
        contracts = data["contractPlans"]
        systems = data["systemBindingPlans"]
        interactions = []
        message_count = 0
        relationship_adjustments = 0
        for event in events:
            for rule in event["playerRules"]:
                for effect in rule["effects"]:
                    if effect["type"] == "character_message":
                        message_count += 1
                        if effect.get("responseWindow"):
                            interactions.append(effect["interactionKey"])
                    if effect["type"] == "relationship_adjust":
                        relationship_adjustments += 1

        heading = "### Run 2026-08-11 — S5 August authored Story source pack landed"
        body = "\n".join([
            f"Workflow run: `{run_id}`",
            f"Source head verified by runner: `{sha}`",
            "",
            "Result: AUGUST AUTHORED STORY SOURCE + PARSER/REGRESSION CONTRACT GREEN ON BRANCH.",
            "",
            f"Pack: `story.content.act1.august.v1` covering Days {data['days']['start']}–{data['days']['end']}.",
            f"Authored Story event nodes: {len(events)}.",
            f"Character-message effects: {message_count}.",
            f"Structured interactions: {len(set(interactions))}.",
            f"Relationship-adjustment callback effects: {relationship_adjustments}.",
            f"News records: {len(news)}.",
            f"Country Contract plans: {len(contracts)}.",
            f"System binding plans: {len(systems)}.",
            "",
            "The four consequential choice days are Day 7, Day 13, Day 20, and Day 26; their authoritative callbacks resolve on Days 11, 16, 21, and 28 through `player_story_choice_is` and S3 relationship effects.",
            "",
            "Verification completed: `git diff --check`; `npm run typecheck:all`; parser-level August content contract; `npm run test:story-choice-callbacks`; `npm run test:player-messaging`; and `npm run test:stock-market-calendar`.",
            "",
            "Honest execution boundary: character Messages, structured Choices, and relationship callbacks are authored against proven S1–S4 mechanics; August Contract plans and system binding plans remain `PLANNED_BINDING`; News records are authored source records but still require the authoritative seed/runtime adapter before they are automatically pushed in a live game.",
            "",
            "Next: implement the August Story seed/runtime adapter and map News/Contract/system plans to existing authoritative runtime contracts without inventing endpoints.",
        ])
        text = append_once(text, heading, body)

    elif mode == "--failure":
        heading = f"### Run 2026-08-11 — S5 August content verification failure `{run_id}`"
        body = "\n".join([
            f"Source head: `{sha}`",
            "",
            "Result: FAILED; NO AUGUST AUTHORED CONTENT IMPLEMENTATION COMMIT WAS PUBLISHED.",
            "",
            f"Builder: `{os.environ.get('AUGUST_BUILDER_OUTCOME', 'unknown')}`; typecheck: `{os.environ.get('AUGUST_TYPECHECK_OUTCOME', 'unknown')}`; content contract: `{os.environ.get('AUGUST_CONTENT_TEST_OUTCOME', 'unknown')}`; callback regression: `{os.environ.get('AUGUST_CALLBACK_OUTCOME', 'unknown')}`; Messaging regression: `{os.environ.get('AUGUST_MESSAGING_OUTCOME', 'unknown')}`; scheduler regression: `{os.environ.get('AUGUST_SCHEDULER_OUTCOME', 'unknown')}`.",
            "",
            "Review the exact failing workflow step before editing content or code. Do not weaken parser, callback, privacy, or coverage assertions to make the pack pass.",
        ])
        text = append_once(text, heading, body)

    else:
        raise SystemExit("usage: roadmap-act1-august.py --launch|--success|--failure")

    ROADMAP.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
