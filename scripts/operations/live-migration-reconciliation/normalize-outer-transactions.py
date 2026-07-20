from pathlib import Path

changed = []
for path in sorted(Path("backend/supabase/migrations").glob("*.sql")):
    original = path.read_text(encoding="utf-8")
    lines = original.splitlines()
    nonempty = [index for index, line in enumerate(lines) if line.strip()]

    if nonempty:
        first = nonempty[0]
        last = nonempty[-1]
        if (
            lines[first].strip().lower() == "begin;"
            and lines[last].strip().lower() == "commit;"
        ):
            del lines[last]
            del lines[first]

    normalized = "\n".join(lines).rstrip() + "\n"

    # Supabase CLI 2.81.3 can mis-group trailing REVOKE/GRANT statements
    # after functions delimited with the equivalent named $function$ tag.
    # Standard $$ delimiters preserve PostgreSQL semantics and allow the
    # migration runner to split the statements correctly. This modifies only
    # the ephemeral CI checkout; committed migration source remains unchanged.
    normalized = normalized.replace("$function$", "$$")

    if normalized != original:
        path.write_text(normalized, encoding="utf-8")
        changed.append(path.name)

print(f"Normalized {len(changed)} migration file(s) for remote CLI replay.")
for name in changed:
    print(f"  - {name}")
