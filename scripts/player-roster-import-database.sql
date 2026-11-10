\set ON_ERROR_STOP on
begin;
set local request.jwt.claim.role = 'service_role';
-- Synthetic, rollback-only qualification on a disposable migration-replayed DB.
do $test$
declare
  staff uuid := 'f1000000-0000-4000-8000-000000000001';
  game uuid := 'f2000000-0000-4000-8000-000000000001';
  other_game uuid := 'f2000000-0000-4000-8000-000000000002';
  credentials jsonb;
  result record;
  first_body jsonb;
  bad jsonb;
  rejected boolean;
  forbidden text;
  rpc regprocedure := 'public.admin_import_player_roster_v1(uuid,uuid,jsonb,jsonb,text,text)'::regprocedure;
begin
  if has_function_privilege('anon', rpc, 'EXECUTE') or has_function_privilege('authenticated', rpc, 'EXECUTE')
     or not has_function_privilege('service_role', rpc, 'EXECUTE') then
    raise exception 'roster RPC ACL mismatch';
  end if;
  insert into public.staff_users(id,supabase_auth_user_id,email,display_name,status,role)
    values(staff,'f1000000-0000-4000-8000-000000000002','roster-fixture@example.invalid','Synthetic roster owner','active','game_admin');
  insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state,provisioning_status)
    values(game,staff,'Synthetic roster fixture','active','draft','pending'),
          (other_game,staff,'Synthetic other fixture','active','draft','pending');
  -- Existing canonical country profiles are normally seeded by migrations.
  insert into public.country_profiles(country_code,country_name,capital_name,currency_code,status)
    values('ROSTER_TEST','Synthetic country','Synthetic capital','ECO','active');
  select jsonb_agg(jsonb_build_object(
    'playerIdentifier','STU-' || lpad(to_hex(i),24,'0'),
    'lookupDigest',lpad(to_hex(i),64,'0'),
    'credentialVersion','pbkdf2-sha256-v2',
    'salt',repeat('a',22),'verifier',repeat('b',43),'iterations',600000
  ) order by i) into credentials from generate_series(1,2) as i;

  select * into result from public.admin_import_player_roster_v1(game,staff,
    '["Synthetic Name","Synthetic Name"]',credentials,'roster-fixture-success','fixture-request');
  first_body := result.response_body;
  if result.was_replayed or result.response_status <> 201 or first_body ->> 'createdCount' <> '2'
     or (select count(*) from public.players where game_session_id=game) <> 2
     or (select count(*) from public.player_country_assignments where game_session_id=game and status='active') <> 2
     or (select count(*) from public.player_access_credentials where game_session_id=game and status='active') <> 2
     or (select count(*) from public.audit_log where game_session_id=game and action='players.roster_imported') <> 1 then
    raise exception 'fresh atomic roster receipt or canonical assignment mismatch';
  end if;
  if first_body::text ~ 'accessCode|lookupDigest|verifier|salt|player_id|[a-f0-9]{8}-[a-f0-9]{4}-' then
    raise exception 'private material in persisted receipt';
  end if;
  select * into result from public.admin_import_player_roster_v1(game,staff,
    '["Synthetic Name","Synthetic Name"]','[]','roster-fixture-success','retry-request');
  if not result.was_replayed or result.response_body <> first_body
    or (select count(*) from public.players where game_session_id=game) <> 2
    or (select count(*) from public.audit_log where game_session_id=game and action='players.roster_imported') <> 1 then
    raise exception 'replay changed state';
  end if;
  rejected := false;
  begin
    perform public.admin_import_player_roster_v1(game,staff,'["Changed"]','[]','roster-fixture-success','fixture');
  exception when others then
    if sqlerrm <> 'ADMIN_MUTATION_IDEMPOTENCY_CONFLICT' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'changed-payload replay allowed'; end if;
  rejected := false;
  begin
    perform public.admin_import_player_roster_v1(other_game,staff,'["Synthetic Name","Synthetic Name"]',credentials,'roster-fixture-success','fixture');
  exception when others then
    if sqlerrm <> 'ADMIN_MUTATION_IDEMPOTENCY_CONFLICT' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'cross-game replay allowed'; end if;
  rejected := false;
  begin
    perform public.admin_import_player_roster_v1(game,'f1000000-0000-4000-8000-000000000099','["Synthetic"]','[]','roster-fixture-foreign','fixture');
  exception when others then
    if sqlerrm <> 'ADMIN_MUTATION_GAME_NOT_OWNED' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'foreign staff allowed'; end if;

  foreach forbidden in array array[U&'Synthetic\0085Name', U&'Synthetic\202eName', U&'Synthetic\2066Name', U&'Synthetic\fffdName', '10000000-0000-4000-8000-000000000001', U&'Jose\0301'] loop
    rejected := false;
    begin
      perform public.admin_import_player_roster_v1(game,staff,jsonb_build_array(forbidden),'[]','roster-fixture-invalid','fixture');
    exception when others then
      if sqlerrm <> 'ADMIN_ROSTER_IMPORT_INVALID' then raise; end if;
      rejected := true;
    end;
    if not rejected then raise exception 'invalid presentation name accepted'; end if;
  end loop;

  -- Row 1 succeeds internally, row 2 fails after its player has been inserted.
  bad := jsonb_build_array(
    (credentials->0) || jsonb_build_object('playerIdentifier','STU-'||repeat('A',24),'lookupDigest',repeat('a',64)),
    (credentials->1) || jsonb_build_object('playerIdentifier','STU-'||repeat('A',24),'lookupDigest',repeat('c',64))
  );
  rejected := false;
  begin
    perform public.admin_import_player_roster_v1(game,staff,'["Synthetic Rollback One","Synthetic Rollback Two"]',bad,'roster-fixture-rollback','fixture');
  exception when others then rejected := true;
  end;
  if not rejected or (select count(*) from public.players where game_session_id=game) <> 2
     or exists(select 1 from private.admin_mutation_requests where staff_user_id=staff and idempotency_key='roster-fixture-rollback')
     or (select count(*) from public.player_country_assignments where game_session_id=game and status='active') <> 2
     or (select count(*) from public.player_access_credentials where game_session_id=game and status='active') <> 2
     or (select count(*) from public.audit_log where game_session_id=game and action='players.roster_imported') <> 1 then
    raise exception 'later-row failure was not fully rolled back';
  end if;
  if exists(select 1 from public.players where game_session_id=other_game) then
    raise exception 'foreign game changed';
  end if;
end;
$test$;
rollback;
