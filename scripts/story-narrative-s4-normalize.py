from pathlib import Path

path = Path("scripts/story-narrative-s4-apply.py")
text = path.read_text(encoding="utf-8")
start_marker = 'path = "backend/src/domains/storylines/infrastructure/supabasePlayerStoryContextRepository.test.ts"\n'
next_marker = "replace_once(path,\n'''  tables.story_relationships = [];\\n'''"
start = text.find(start_marker)
if start < 0:
    raise SystemExit("S4 Player context test section missing")
ambiguous = text.find("replace_once(path,\n'''  const contexts = await repository.listPlayerStoryContexts", start)
if ambiguous < 0:
    raise SystemExit("S4 ambiguous context-call replacement missing")
next_block = text.find(next_marker, ambiguous)
if next_block < 0:
    raise SystemExit("S4 next Player context transform block missing")
text = text[:ambiguous] + text[next_block:]
compile(text, str(path), "exec")
path.write_text(text, encoding="utf-8")
