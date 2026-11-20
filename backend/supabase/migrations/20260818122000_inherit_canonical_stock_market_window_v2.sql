begin;

do $patch$
declare
  v_definition text;
  v_old text := E'case when jsonb_typeof(v_settings->''stock_market_window'') = ''object'' then v_settings->''stock_market_window'' else ''{}''::jsonb end';
  v_new text := E'(\n        coalesce(\n          (\n            select source_settings.stock_market_window\n            from public.game_settings as source_settings\n            where source_settings.game_session_id = v_source_release.game_session_id\n          ),\n          jsonb_build_object(''timezone'', ''UTC'')\n        )\n        || case\n          when jsonb_typeof(v_settings->''stock_market_window'') = ''object''\n            then v_settings->''stock_market_window''\n          else ''{}''::jsonb\n        end\n      )';
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_provisioned_game_v1'
    and pg_get_function_identity_arguments(p.oid) =
      'p_staff_user_id uuid, p_game_name text, p_game_settings jsonb, p_idempotency_key text, p_pack_id text';

  if v_definition is null then
    raise exception 'GAME_PROVISIONING_FUNCTION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if position('select source_settings.stock_market_window' in v_definition) > 0 then
    return;
  end if;

  if position(v_old in v_definition) = 0 then
    raise exception 'GAME_PROVISIONING_STOCK_WINDOW_PATTERN_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end;
$patch$;

comment on function public.create_provisioned_game_v1(uuid,text,jsonb,text,text) is
  'Atomic canonical game provisioning. Stock-market settings inherit the versioned canonical source window, including its required timezone, and caller-supplied object fields override those defaults.';

commit;
