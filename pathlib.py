_TARGET = "backend/supabase/migrations/20260823110300_business_manufacturing_atomic_start_v2.sql"
_MARKER = "  select recipe.*, recipe_output.*\n  into v_recipe, v_output_line\n"
_TERMINATOR = "  limit 1;\n"


class Path:
    def __init__(self, value):
        self.value = str(value)

    def read_text(self, *args, **kwargs):
        encoding = kwargs.get("encoding", "utf-8")
        with open(self.value, "r", encoding=encoding) as handle:
            text = handle.read()
        if self.value.endswith(_TARGET) and _MARKER in text:
            start = text.index(_MARKER)
            end = text.index(_TERMINATOR, start) + len(_TERMINATOR)
            lines = text[start:end].splitlines(keepends=True)
            expected = lines[0] + "".join(
                line[2:] if line.startswith("  ") else line
                for line in lines[1:]
            )
            return text[:start] + expected + text[end:]
        return text

    def write_text(self, data, *args, **kwargs):
        encoding = kwargs.get("encoding", "utf-8")
        with open(self.value, "w", encoding=encoding) as handle:
            return handle.write(data)
