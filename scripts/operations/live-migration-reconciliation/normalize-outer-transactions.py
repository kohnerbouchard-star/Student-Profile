from pathlib import Path

changed = []
for path in sorted(Path("backend/supabase/migrations").glob("*.sql")):
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    nonempty = [index for index, line in enumerate(lines) if line.strip()]
    if not nonempty:
        continue
    first = nonempty[0]
    last = nonempty[-1]
    if lines[first].strip().lower() == "begin;" and lines[last].strip().lower() == "commit;":
        del lines[last]
        del lines[first]
        path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
        changed.append(path.name)

print(f"Normalized {len(changed)} migration file(s).")
for name in changed:
    print(f"  - {name}")
