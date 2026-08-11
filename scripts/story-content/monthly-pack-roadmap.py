from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROADMAP = Path("docs/story/STORY-NARRATIVE-CONVERGENCE-ROADMAP.md")
MARKER = "\n## Run-completion rule\n"


def append_once(text: str, heading: str, body: str) -> str:
    if heading in text:
        return text
    if MARKER not in text:
        raise SystemExit("roadmap run-completion marker missing")
    return text.replace(MARKER, f"\n{heading}\n\n{body}\n{MARKER}", 1)


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    label = os.environ.get("STORY_MONTH_LABEL", "month")
    slug = os.environ.get("STORY_MONTH_SLUG", label.lower().replace(" ", "-"))
    pack_path = Path(os.environ.get("STORY_PACK_PATH", ""))
    run_id = os.environ.get("GITHUB_RUN_ID", "unknown")
    sha = os.environ.get("GITHUB_SHA", "unknown")
    text = ROADMAP.read_text(encoding="utf-8")

    if mode == "--launch":
        heading = f"### Run 2026-08-11 — S5 {label} authored content pack launched"
        body = "\n".join([
            f"Workflow run: `{run_id}`",
            f"Source head: `{sha}`",
            "",
            f"Target: convert the {label} daily calendar into parser-valid authored Story source with ten-country variants, recurring-character continuity, structured choices, and S4 callbacks.",
            "",
            "S5 remains IN PROGRESS. Contract and non-Story system bindings remain `PLANNED_BINDING` until separately mapped to existing authoritative runtime contracts.",
        ])
        text = append_once(text, heading, body)

    elif mode == "--success":
        if not pack_path.is_file():
            raise SystemExit(f"Story pack missing: {pack_path}")
        data = json.loads(pack_path.read_text(encoding="utf-8"))
        events = data.get("storyEvents", [])
        news = data.get("news", [])
        contracts = data.get("contractPlans", [])
        systems = data.get("systemBindingPlans", [])
        deferred = data.get("deferredCallbacks", [])
        messages = 0
        interactions = set()
        relationship_adjustments = 0
        for event in events:
            for rule in event.get("playerRules", []):
                for effect in rule.get("effects", []):
                    if effect.get("type") == "character_message":
                        messages += 1
                        if effect.get("responseWindow") and effect.get("interactionKey"):
                            interactions.add(effect["interactionKey"])
                    if effect.get("type") == "relationship_adjust":
                        relationship_adjustments += 1

        heading = f"### Run 2026-08-11 — S5 {label} authored Story source pack landed"
        body = "\n".join([
            f"Workflow run: `{run_id}`",
            f"Source head verified by runner: `{sha}`",
            "",
            "Result: AUTHORED STORY SOURCE + SHARED PARSER/CALLBACK/REGRESSION CONTRACT GREEN ON BRANCH.",
            "",
            f"Pack: `{data.get('packId', slug)}` covering Days {data['days']['start']}–{data['days']['end']}.",
            f"Story event nodes: {len(events)}; character-message effects: {messages}; structured interactions: {len(interactions)}; relationship callback effects: {relationship_adjustments}.",
            f"News records: {len(news)}; country Contract plans: {len(contracts)}; system binding plans: {len(systems)}; deferred cross-month callbacks: {len(deferred)}.",
            "",
            "Verification completed: `git diff --check`; `npm run typecheck:all`; shared monthly Story content contract; `npm run test:story-choice-callbacks`; `npm run test:player-messaging`; and `npm run test:stock-market-calendar`.",
            "",
            "Execution boundary: Story Messages, structured Choices, and relationship/callback source are authored against S1–S4 mechanics; News is authored source data; Contract/system plans remain explicitly `PLANNED_BINDING` until authoritative adapters land.",
        ])
        text = append_once(text, heading, body)

    elif mode == "--failure":
        heading = f"### Run 2026-08-11 — S5 {label} content verification failure `{run_id}`"
        body = "\n".join([
            f"Source head: `{sha}`",
            "",
            "Result: FAILED; NO MONTHLY AUTHORED CONTENT IMPLEMENTATION COMMIT WAS PUBLISHED.",
            "",
            f"Builder: `{os.environ.get('MONTH_BUILDER_OUTCOME', 'unknown')}`; typecheck: `{os.environ.get('MONTH_TYPECHECK_OUTCOME', 'unknown')}`; content contract: `{os.environ.get('MONTH_CONTENT_TEST_OUTCOME', 'unknown')}`; callback regression: `{os.environ.get('MONTH_CALLBACK_OUTCOME', 'unknown')}`; Messaging regression: `{os.environ.get('MONTH_MESSAGING_OUTCOME', 'unknown')}`; scheduler regression: `{os.environ.get('MONTH_SCHEDULER_OUTCOME', 'unknown')}`.",
            "",
            "Review the exact failing workflow step before changing content or code. Do not weaken parser, callback, privacy, coverage, or country-parity requirements.",
        ])
        text = append_once(text, heading, body)
    else:
        raise SystemExit("usage: monthly-pack-roadmap.py --launch|--success|--failure")

    ROADMAP.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
