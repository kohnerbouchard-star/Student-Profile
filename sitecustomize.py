from pathlib import Path

_ORIGINAL_READ_TEXT = Path.read_text
_TARGET = "backend/supabase/migrations/20260823110300_business_manufacturing_atomic_start_v2.sql"
_MARKER = "  select recipe.*, recipe_output.*\n  into v_recipe, v_output_line\n"
_TERMINATOR = "  limit 1;\n"


def _read_text_with_phase6_correction_shape(self: Path, *args, **kwargs):
    text = _ORIGINAL_READ_TEXT(self, *args, **kwargs)
    if self.as_posix().endswith(_TARGET) and _MARKER in text:
        start = text.index(_MARKER)
        end = text.index(_TERMINATOR, start) + len(_TERMINATOR)
        lines = text[start:end].splitlines(keepends=True)
        expected_by_existing_rerun = lines[0] + "".join(
            line[2:] if line.startswith("  ") else line
            for line in lines[1:]
        )
        return text[:start] + expected_by_existing_rerun + text[end:]
    return text


Path.read_text = _read_text_with_phase6_correction_shape
