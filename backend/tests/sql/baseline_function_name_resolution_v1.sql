-- Disposable database only, after full main migration replay but BEFORE this fix.
-- psql -X -v ON_ERROR_STOP=1 -f backend/tests/sql/baseline_function_name_resolution_v1.sql
-- Captures all identity/security metadata, applies and reapplies the real migration,
-- and requires every repaired function to have no error-level plpgsql_check finding.
\set ON_ERROR_STOP on
create extension if not exists plpgsql_check with schema extensions;
create temporary table baseline_function_before as
select p.oid, p.proname, p.proowner, p.proacl, p.prosecdef, p.proconfig,
       p.provolatile, p.proparallel, p.prorettype, p.proargtypes, p.proallargtypes,
       p.proargmodes, p.proargnames, p.proretset,
       pg_get_functiondef(p.oid) as original_definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
    'correct_arrival_class_assignment_v1',
    'execute_campaign_event_atomic_v1',
    'control_campaign_instance_atomic_v1',
    'seed_initial_player_balances',
    'create_business_workforce_candidate_v2',
    'reserve_business_labor_v2',
    'upsert_business_recipe_labor_requirement_v2',
    'moderate_admin_message_atomic_v2',
    'run_business_production_labor_v2',
    'grant_business_recipe_access_v2',
    'accept_business_ownership_transfer_offer_v2'
);
do $test$
begin
  if (select count(*) from baseline_function_before) <> 11 then
    raise exception 'BASELINE_TEST_EXPECTED_ELEVEN_FUNCTIONS';
  end if;
end;
$test$;
-- Independent expected-definition oracle: only these explicit replacements are
-- permitted. Any mutation elsewhere, including later monetary identity patches,
-- is rejected by full-string comparison after applying the migration.
create temporary table baseline_function_expected as
select oid, proname, original_definition as definition from baseline_function_before;
do $expected$
declare
  v_patch record;
  v_definition text;
begin
  for v_patch in select * from (values
    ('correct_arrival_class_assignment_v1', $old$revision = revision + 1$old$, $new$revision = arrival_class_assignments.revision + 1$new$, 1),
    ('execute_campaign_event_atomic_v1', $old$revision = revision + 1$old$, $new$revision = campaign_instances.revision + 1$new$, 1),
    ('execute_campaign_event_atomic_v1', $old$event_sequence = event_sequence + 1$old$, $new$event_sequence = campaign_instances.event_sequence + 1$new$, 1),
    ('control_campaign_instance_atomic_v1', $old$revision = revision + 1$old$, $new$revision = campaign_instances.revision + 1$new$, 4),
    ('seed_initial_player_balances', $old$order by created_at asc$old$, $new$order by players.created_at asc$new$, 1),
    ('seed_initial_player_balances', $old$and account_type = v_account_type$old$, $new$and account_balances.account_type = v_account_type$new$, 1),
    ('seed_initial_player_balances', $old$and currency_code = v_currency_code$old$, $new$and account_balances.currency_code = v_currency_code$new$, 1),
    ('create_business_workforce_candidate_v2', $old$    digest($old$, $new$    extensions.digest($new$, 1),
    ('reserve_business_labor_v2', $old$    digest($old$, $new$    extensions.digest($new$, 1),
    ('upsert_business_recipe_labor_requirement_v2', $old$on conflict (recipe_definition_id, role_definition_id) do update$old$, $new$on conflict on constraint business_recipe_labor_scope_unique do update$new$, 1),
    ('moderate_admin_message_atomic_v2', $old$and thread_id = v_thread.id$old$, $new$and messages.thread_id = v_thread.id$new$, 1),
    ('run_business_production_labor_v2', $old$and status = 'reserved'$old$, $new$and business_labor_reservations.status = 'reserved'$new$, 1),
    ('grant_business_recipe_access_v2', $old$where recipe_key = btrim(p_recipe_key)$old$, $new$where physical_economy_recipe_definitions.recipe_key = btrim(p_recipe_key)$new$, 1),
    ('accept_business_ownership_transfer_offer_v2', $old$coalesce(units, 0)$old$, $new$coalesce(business_ownership_positions.units, 0)$new$, 2),
    ('accept_business_ownership_transfer_offer_v2', $old$and status = 'active'$old$, $new$and business_ownership_positions.status = 'active'$new$, 3),
    ('accept_business_ownership_transfer_offer_v2', $old$units = units - v_offer.units$old$, $new$units = business_ownership_positions.units - v_offer.units$new$, 1),
    ('accept_business_ownership_transfer_offer_v2', $old$units = units + v_offer.units$old$, $new$units = business_ownership_positions.units + v_offer.units$new$, 1),
    ('accept_business_ownership_transfer_offer_v2', $old$returning units into$old$, $new$returning business_ownership_positions.units into$new$, 3)
  ) as patches(function_name, old_fragment, new_fragment, expected_count)
  loop
    select definition into strict v_definition from baseline_function_expected
    where proname = v_patch.function_name;
    if (length(v_definition) - length(replace(v_definition, v_patch.old_fragment, ''))) / length(v_patch.old_fragment) <> v_patch.expected_count
       or strpos(v_definition, v_patch.new_fragment) <> 0 then
      raise exception 'BASELINE_TEST_NOT_UNCORRECTED_BASELINE: %', v_patch.function_name;
    end if;
    update baseline_function_expected set definition = replace(definition, v_patch.old_fragment, v_patch.new_fragment)
    where proname = v_patch.function_name;
  end loop;
end;
$expected$;
\ir ../../supabase/migrations/20261117050144_baseline_function_name_resolution_v1.sql
create temporary table baseline_function_after as
select oid, pg_get_functiondef(oid) as definition from baseline_function_before;
\ir ../../supabase/migrations/20261117050144_baseline_function_name_resolution_v1.sql

do $test$
declare
  v_target record;
  v_checker_schema text;
  v_errors integer;
begin
  if exists (
    select 1 from baseline_function_before b
    left join pg_proc p on p.oid = b.oid
    where p.oid is null or
      row(p.proname, p.proowner, p.proacl, p.prosecdef, p.proconfig,
          p.provolatile, p.proparallel, p.prorettype, p.proargtypes,
          p.proallargtypes, p.proargmodes, p.proargnames, p.proretset)
      is distinct from
      row(b.proname, b.proowner, b.proacl, b.prosecdef, b.proconfig,
          b.provolatile, b.proparallel, b.prorettype, b.proargtypes,
          b.proallargtypes, b.proargmodes, b.proargnames, b.proretset)
  ) then
    raise exception 'BASELINE_TEST_IDENTITY_OR_SECURITY_CHANGED';
  end if;
  if exists (select 1 from baseline_function_expected where definition <> pg_get_functiondef(oid)) then
    raise exception 'BASELINE_TEST_UNEXPECTED_DEFINITION_CHANGE';
  end if;
  if exists (select 1 from baseline_function_after where definition <> pg_get_functiondef(oid)) then
    raise exception 'BASELINE_TEST_REPLAY_CHANGED_DEFINITION';
  end if;
  select n.nspname into strict v_checker_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'plpgsql_check';
  for v_target in select oid, proname from baseline_function_before loop
    execute format(
      'select count(*) from %I.plpgsql_check_function_tb($1::regprocedure, fatal_errors := false) where level = ''error''',
      v_checker_schema
    ) into v_errors using v_target.oid;
    if v_errors <> 0 then
      raise exception 'BASELINE_TEST_LINT_ERRORS: % (%)', v_target.proname, v_errors;
    end if;
  end loop;
end;
$test$;
