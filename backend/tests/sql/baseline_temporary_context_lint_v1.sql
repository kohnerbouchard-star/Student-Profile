-- Fail-on-error gate with runtime temporary context; equivalent CLI v2.109.1 coverage.
-- Coverage mirrors Supabase CLI v2.109.1 commit6d4c19870ed213ba7f682f117d0345c8a40bfa94:
-- apps/cli-go/pkg/migration/drop.go, queries/list.sql and internal/db/lint/templates/check.sql.
-- This covers exactly CLI non-trigger PL/pgSQL scope, not every PostgreSQL object.
\set ON_ERROR_STOP on
begin;
\if :context_negative
create function public.baseline_context_lint_negative_control() returns void
language plpgsql as $canary$
begin
  perform baseline_context_deliberately_missing_column from public.game_sessions;
end;
$canary$;
\set context_public_count 428
\else
\set context_public_count 427
\endif
create extension if not exists plpgsql_check with schema extensions;
create temporary table context_lint_targets on commit drop as
select p.oid, n.nspname, p.proname, p.oid::regprocedure::text as signature,
       pg_get_functiondef(p.oid) as original_definition
from pg_catalog.pg_namespace n
join pg_catalog.pg_proc p on p.pronamespace = n.oid
join pg_catalog.pg_language l on p.prolang = l.oid
where l.lanname = 'plpgsql' and p.prorettype <> 2279
  and n.nspname in (
    select pn.nspname
    from pg_namespace pn left join pg_depend pd on pd.objid = pn.oid
    where pd.deptype is null
      and not pn.nspname like any(array[
        'information\_schema', 'pg\_%', '\_analytics', '\_realtime', '\_supavisor',
        'pgbouncer', 'pgmq', 'pgsodium', 'pgtle', 'supabase\_migrations', 'vault'
      ])
      and pn.nspowner::regrole::text != 'supabase_admin'
  );
-- This PR changes no routine identities. Any baseline coverage drift must be
-- reviewed, not silently admitted by changing an expected count.
create temporary table context_lint_expected_scope(schema_name, function_count) on commit drop as
values ('economy_private',30), ('extensions',6), ('private',68), ('public',:context_public_count);
do $coverage$
begin
  if exists (
    (select nspname::text, count(*)::integer from context_lint_targets group by nspname
     except select * from context_lint_expected_scope)
    union all
    (select * from context_lint_expected_scope
     except select nspname::text, count(*)::integer from context_lint_targets group by nspname)
  ) then raise exception 'CONTEXT_LINT_COVERAGE_DRIFT'; end if;
end;
$coverage$;
select 'coverage' as evidence, nspname, count(*) as function_count,
       md5(string_agg(signature, E'\n' order by signature)) as signature_digest
from context_lint_targets group by nspname order by nspname;
create temporary table context_lint_findings (
  signature text, level text, sqlstate text, message text
) on commit drop;
do $proof$
declare
  v_core oid := 'private.create_purchase_funding_quote_core_v1(uuid,uuid,text,numeric,text,text,text,jsonb,text)'::regprocedure;
  v_definition text := pg_get_functiondef(v_core);
  v_fixture text := $fixture$create temporary table if not exists pg_temp.purchase_funding_line_stage_v1 (
      line_number integer,
      source_account_id uuid,
      source_currency_code text,
      source_minor_unit integer,
      source_posted_snapshot numeric(38, 18),
      source_held_snapshot numeric(38, 18),
      source_available_snapshot numeric(38, 18),
      target_contribution numeric(38, 18),
      source_debit numeric(38, 18),
      reference_rate numeric(38, 18),
      customer_rate numeric(38, 18),
      effective_rate numeric(38, 18),
      spread_rate numeric(18, 8),
      requires_fx boolean,
      rounding_disclosure text,
      evidence_hash text
    ) on commit drop;$fixture$;
  v_schema text;
  v_count integer;
  v_target record;
begin
  select n.nspname into strict v_schema from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace where e.extname = 'plpgsql_check';
  if not exists (select 1 from context_lint_targets where oid = v_core) then
    raise exception 'CONTEXT_LINT_CORE_NOT_IN_COVERAGE';
  end if;
  -- Exact source shape required. Never execute arbitrary extracted SQL.
  if (length(v_definition) - length(replace(v_definition, v_fixture, ''))) / length(v_fixture) <> 1 then
    raise exception 'CONTEXT_LINT_STAGE_DEFINITION_DRIFT';
  end if;
  if to_regclass('pg_temp.purchase_funding_line_stage_v1') is not null then
    raise exception 'CONTEXT_LINT_UNEXPECTED_PREEXISTING_STAGE';
  end if;
  -- Negative control: absent context must expose the original finding.
  execute format('select count(*) from %I.plpgsql_check_function_tb($1::regprocedure, fatal_errors := false) where level = ''error'' and sqlstate = ''42P01''', v_schema)
    into v_count using v_core;
  if v_count = 0 then raise exception 'CONTEXT_LINT_ABSENT_STAGE_CONTROL_FAILED'; end if;
  execute v_fixture;
  alter table pg_temp.purchase_funding_line_stage_v1 drop column evidence_hash;
  -- Negative control: incomplete context must NOT pass the checker.
  execute format('select count(*) from %I.plpgsql_check_function_tb($1::regprocedure, fatal_errors := false) where level = ''error''', v_schema)
    into v_count using v_core;
  if v_count = 0 then raise exception 'CONTEXT_LINT_BAD_STAGE_CONTROL_FAILED'; end if;
  drop table pg_temp.purchase_funding_line_stage_v1;
  -- No function exclusions or finding suppression. Every CLI-covered OID is checked.
  for v_target in select * from context_lint_targets order by signature loop
    -- Runtime context belongs ONLY to this core. Every other function is checked
    -- with the temporary stage absent, so accidental stage dependencies fail.
    if to_regclass('pg_temp.purchase_funding_line_stage_v1') is not null then
      raise exception 'CONTEXT_LINT_STAGE_LEAKED_BETWEEN_TARGETS';
    end if;
    if v_target.oid = v_core then execute v_fixture; end if;
    execute format('insert into context_lint_findings select $2, level, sqlstate, message from %I.plpgsql_check_function_tb($1::regprocedure, fatal_errors := false)', v_schema)
      using v_target.oid, v_target.signature;
    if v_target.oid = v_core then drop table pg_temp.purchase_funding_line_stage_v1; end if;
  end loop;
  if exists (select 1 from context_lint_targets where pg_get_functiondef(oid) <> original_definition) then
    raise exception 'CONTEXT_LINT_ANY_DEFINITION_CHANGED';
  end if;
  if pg_get_functiondef(v_core) <> v_definition then
    raise exception 'CONTEXT_LINT_CORE_DEFINITION_CHANGED';
  end if;
end;
$proof$;
select * from context_lint_findings order by signature, level, sqlstate, message;
do $assert$
begin
  if exists (select 1 from context_lint_findings where level = 'error') then
    raise exception 'CONTEXT_LINT_ERROR_LEVEL_FINDINGS_REMAIN';
  end if;
end;
$assert$;
rollback;
