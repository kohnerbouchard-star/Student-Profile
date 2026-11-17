"""Source-only checks. These are NOT a PostgreSQL replay or runtime certification."""
import re
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / 'backend/supabase/migrations'
FIX = MIGRATIONS / '20261117050144_baseline_function_name_resolution_v1.sql'
PATCHES = re.findall(r"\('([^']+)', \$old\$(.*?)\$old\$, \$new\$(.*?)\$new\$, (\d+)\)", FIX.read_text(), re.S)

def apply(source, old, new, expected):
    if source.count(old) == expected and source.count(new) == 0:
        return source.replace(old, new)
    if source.count(old) == 0 and source.count(new) == expected:
        return source
    raise ValueError('source drift')

def source_for(name):
    original = 'run_business_production_v1' if name == 'run_business_production_labor_v2' else name
    sources = []
    for path in sorted(MIGRATIONS.glob('*.sql')):
        if path == FIX:
            continue
        pattern = r'create or replace function public\.' + original + r'\(.*?as (\$\w*\$)(.*?)\1;'
        for match in re.finditer(pattern, path.read_text(), re.I | re.S):
            sources.append((path, match.group(0)))
    if name == 'run_business_production_labor_v2':
        return next(source for path, source in sources if path.name.startswith('20260822140300'))
    assert len(sources) == 1, (name, [p.name for p, _ in sources])
    return sources[0][1]

class NameResolutionTests(unittest.TestCase):
    def test_exact_baseline_and_replay(self):
        names = {p[0] for p in PATCHES}
        self.assertEqual(len(names), 11)
        for name in names:
            with self.subTest(function=name):
                source = source_for(name)
                for fn, old, new, count in PATCHES:
                    if fn == name:
                        fixed = apply(source, old, new, int(count))
                        self.assertEqual(fixed, apply(fixed, old, new, int(count)))
                        source = fixed
    def test_unexpected_or_partial_source_is_rejected(self):
        for _, old, new, count in PATCHES:
            with self.subTest(fragment=old):
                for bad in ('', old * (int(count)+1), old * int(count) + new):
                    with self.assertRaises(ValueError):
                        apply(bad, old, new, int(count))
    def test_sql_oracle_covers_exact_replacements_and_full_definition(self):
        sql = (ROOT / 'backend/tests/sql/baseline_function_name_resolution_v1.sql').read_text()
        oracle = re.findall(r"\('([^']+)', \$old\$(.*?)\$old\$, \$new\$(.*?)\$new\$, (\d+)\)", sql, re.S)
        self.assertEqual(oracle, PATCHES)
        self.assertIn('BASELINE_TEST_NOT_UNCORRECTED_BASELINE', sql)
        self.assertIn('from baseline_function_expected where definition <> pg_get_functiondef(oid)', sql)
        self.assertIn('BASELINE_TEST_UNEXPECTED_DEFINITION_CHANGE', sql)

    def test_temporary_context_is_supplemental_and_source_exact(self):
        sql = (ROOT / 'backend/tests/sql/baseline_temporary_context_lint_v1.sql').read_text()
        source = (MIGRATIONS / '20260827090000_multicurrency_funding_quote_v1.sql').read_text()
        fixture = sql.split('$fixture$')[1]
        self.assertEqual(source.count(fixture), 1)
        self.assertIn("l.lanname = 'plpgsql' and p.prorettype <> 2279", sql)
        self.assertIn("pd.deptype is null", sql)
        self.assertIn("pn.nspowner::regrole::text != 'supabase_admin'", sql)
        self.assertIn('for v_target in select * from context_lint_targets order by signature loop', sql)
        self.assertIn('CONTEXT_LINT_ABSENT_STAGE_CONTROL_FAILED', sql)
        self.assertIn('CONTEXT_LINT_BAD_STAGE_CONTROL_FAILED', sql)
        self.assertIn('CONTEXT_LINT_ERROR_LEVEL_FINDINGS_REMAIN', sql)
        self.assertTrue(sql.rstrip().endswith('rollback;'))
        self.assertNotIn('exception when', sql.lower())
        workflow = (ROOT / '.github/workflows/db-baseline-lint-qualification.yml').read_text()
        self.assertIn('Fail on any error across exact CLI-covered scope with runtime temporary context', workflow)
        self.assertIn('node scripts/db-baseline-lint-qualification.mjs --database', workflow)
        self.assertIn('CONTEXT_LINT_STAGE_LEAKED_BETWEEN_TARGETS', sql)
        self.assertIn('if v_target.oid = v_core then execute v_fixture; end if;', sql)
        self.assertIn('CONTEXT_LINT_COVERAGE_DRIFT', sql)
        self.assertIn('CONTEXT_LINT_ANY_DEFINITION_CHANGED', sql)
        self.assertNotIn('continue-on-error', workflow)

    def test_no_lint_or_security_bypass(self):
        sql = FIX.read_text().lower()
        for forbidden in ('#variable_conflict', 'check_function_bodies', 'grant execute', 'drop function', 'alter function', 'create temporary', 'plpgsql_check_pragma'):
            self.assertNotIn(forbidden, sql)
        self.assertIn('pg_catalog.pg_get_functiondef(v_oid)', sql)
        self.assertIn('baseline_lint_source_drift', sql)

if __name__ == '__main__':
    unittest.main()
