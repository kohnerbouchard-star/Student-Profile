from __future__ import annotations

from pathlib import Path


def replace_required(path: str, old: str, new: str, label: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"missing narrowing marker: {label}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_required(
    "backend/src/domains/storylines/tests/act1AugustStoryContentPack.test.ts",
    '      if (condition.type === "player_story_choice_is") {',
    '      if ("type" in condition && condition.type === "player_story_choice_is") {',
    "August choice condition leaf guard",
)

monthly = Path("backend/src/domains/storylines/tests/monthlyStoryContentPackContract.test.ts")
text = monthly.read_text(encoding="utf-8")
text = text.replace(
    '      if (condition.type === "player_story_choice_is") {',
    '      if ("type" in condition && condition.type === "player_story_choice_is") {',
    1,
)
text = text.replace(
    '    if (condition.type !== "player_story_choice_is") {',
    '    if (!("type" in condition) || condition.type !== "player_story_choice_is") {',
    1,
)
text = text.replace(
    '    callbacks.push({ day, interactionKey: condition.interactionKey, choiceKey: condition.choiceKey });',
    '    callbacks.push({ day, eventKey, interactionKey: condition.interactionKey, choiceKey: condition.choiceKey });',
    1,
)
if 'if (condition.type === "player_story_choice_is")' in text:
    raise SystemExit("monthly content test still dereferences composite StoryCondition.type without a leaf guard")
if 'callbacks.push({ day, interactionKey:' in text:
    raise SystemExit("monthly deferred callback still omits eventKey")
monthly.write_text(text, encoding="utf-8")

print("Story content test narrowing corrections applied")
