from __future__ import annotations

import sys
from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one normalization anchor, found {count}: {old[:100]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def pre() -> None:
    path = Path("scripts/story-narrative-s3-apply.py")
    text = path.read_text(encoding="utf-8")

    write_old = '''def write(path, text):
    Path(path).write_text(text, encoding='utf-8')
'''
    write_new = '''def write(path, text):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')
'''
    if text.count(write_old) != 1:
        raise SystemExit(f"S3 write helper anchor matched {text.count(write_old)} times")
    text = text.replace(write_old, write_new, 1)

    old = '''replace_once(path,
''' + "'''    game_session_story_flags: [],\\n'''" + ''',
''' + "'''    game_session_story_flags: [],\\n    story_relationships: [\\n      { game_session_id: \"game-1\", player_id: \"player-1\", character_key: \"character.northreach.jonis-hale.v1\", trust: 42, respect: 30, affinity: 10, obligation: 5, suspicion: 0, standing: \"trusted\" },\\n    ],\\n'''" + ''')'''
    new = '''insert_before(path,
''' + "'''    game_session_story_flags: [\\n'''" + ''',
''' + "'''    story_relationships: [\\n      { game_session_id: \"game-1\", player_id: \"player-1\", character_key: \"character.northreach.jonis-hale.v1\", trust: 42, respect: 30, affinity: 10, obligation: 5, suspicion: 0, standing: \"trusted\" },\\n    ],\\n'''" + ''')'''
    if text.count(old) != 1:
        raise SystemExit(f"S3 fixture transform anchor matched {text.count(old)} times")
    updated = text.replace(old, new, 1)
    compile(updated, str(path), "exec")
    path.write_text(updated, encoding="utf-8")


def post() -> None:
    context = Path("backend/src/domains/storylines/contracts/playerStoryContext.ts")
    replace_once(
        context,
        "  readonly relationships: PlayerStoryRelationships;\n",
        "  readonly relationships?: PlayerStoryRelationships;\n",
    )

    condition_engine = Path("backend/src/domains/storylines/services/storyConditionEngine.ts")
    text = condition_engine.read_text(encoding="utf-8")
    count = text.count("player.relationships[")
    if count != 3:
        raise SystemExit(f"expected three relationship condition reads, found {count}")
    condition_engine.write_text(
        text.replace("player.relationships[", "player.relationships?.["),
        encoding="utf-8",
    )

    execution = Path("backend/src/domains/storylines/contracts/storyEffectExecutionContracts.ts")
    text = execution.read_text(encoding="utf-8")
    import_anchor = 'import type { PlayerStoryContext } from "./playerStoryContext.ts";\n'
    if text.count(import_anchor) != 1:
        raise SystemExit("effect execution PlayerStoryContext import anchor missing")
    text = text.replace(
        import_anchor,
        import_anchor + 'import type { StoryRelationshipMetric } from "./storyRelationshipContracts.ts";\n',
        1,
    )
    old = "  readonly deltas: Readonly<Record<string, number>>;\n"
    new = "  readonly deltas: Readonly<Partial<Record<StoryRelationshipMetric, number>>>;\n"
    if text.count(old) != 1:
        raise SystemExit("relationship write delta type anchor missing")
    execution.write_text(text.replace(old, new, 1), encoding="utf-8")

    context_test = Path("backend/src/domains/storylines/infrastructure/supabasePlayerStoryContextRepository.test.ts")
    replace_once(
        context_test,
        '  assertEquals(contexts[0]?.relationships["character.northreach.jonis-hale.v1"]?.standing, "trusted");\n',
        '  assertEquals(contexts[0]?.relationships?.["character.northreach.jonis-hale.v1"]?.standing, "trusted");\n',
    )

    writer_test = Path("backend/src/domains/storylines/infrastructure/supabaseStoryRelationshipWriter.test.ts")
    replace_once(
        writer_test,
        '  });\n  const result = await writer.adjustRelationship({\n',
        '  } as never);\n  const result = await writer.adjustRelationship({\n',
    )


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "--pre":
        pre()
    elif mode == "--post":
        post()
    else:
        raise SystemExit("usage: story-narrative-s3-normalize.py --pre|--post")
