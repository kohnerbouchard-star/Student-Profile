-- DB-BASELINE-NAME-RESOLUTION-001: definition-only forward corrections.
-- Preserve the actual replayed definition, including all later identity patches,
-- ownership, ACLs, security mode, search_path, signatures and economic semantics.
-- No domain routine is invoked and no business data is modified.
-- Temporary-table lint context is a separate verification concern, not suppressed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
do $migration$
declare
  v_patch record;
  v_oid oid;
  v_matches integer;
  v_definition text;
  v_old_count integer;
  v_new_count integer;
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
    select count(*), min(p.oid::bigint)::oid into v_matches, v_oid
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_patch.function_name
      and p.prokind = 'f';
    if v_matches <> 1 then
      raise exception 'BASELINE_LINT_FUNCTION_IDENTITY_MISMATCH: %', v_patch.function_name;
    end if;
    v_definition := pg_catalog.pg_get_functiondef(v_oid);
    v_old_count := (length(v_definition) - length(replace(v_definition, v_patch.old_fragment, ''))) / length(v_patch.old_fragment);
    v_new_count := (length(v_definition) - length(replace(v_definition, v_patch.new_fragment, ''))) / length(v_patch.new_fragment);
    if v_old_count = v_patch.expected_count and v_new_count = 0 then
      execute replace(v_definition, v_patch.old_fragment, v_patch.new_fragment);
    elsif v_old_count = 0 and v_new_count = v_patch.expected_count then
      null; -- Exact replay of this fragment; mixed occurrences within a fragment fail.
    else
      raise exception 'BASELINE_LINT_SOURCE_DRIFT: % (% old, % new)', v_patch.function_name, v_old_count, v_new_count;
    end if;
  end loop;
end;
$migration$;
commit;
