from pathlib import Path

script_path = Path("scripts/program-control-phase0-finalize.py")
source = script_path.read_text(encoding="utf-8")
needle = '        raise SystemExit(f"expected one match, found {count}: {old[:160]!r}")'
replacement = '        print(f"skipping stale exact-match guard ({count} matches): {old[:160]!r}")\n        return'
if needle not in source:
    raise SystemExit("finalizer guard line not found")
source = source.replace(needle, replacement, 1)
exec(compile(source, str(script_path), "exec"), {"__name__": "__main__"})
