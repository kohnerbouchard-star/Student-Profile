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
  cohort_size integer;
  cohort_game uuid;
  cohort_names jsonb;
  cohort_credentials jsonb;
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
  insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state,provisioning_status,game_join_code_status)
    values(game,staff,'Synthetic roster fixture','active','active','pending','pending'),
          (other_game,staff,'Synthetic other fixture','active','active','pending','pending');
  -- Active, non-joinable synthetic games use the migration-seeded countries.
  -- Keep lifecycle/status consistent; the canonical lifecycle trigger is intact.
  if not exists(select 1 from public.country_profiles where status='active') then
    raise exception 'canonical country fixtures missing';
  end if;
  select jsonb_agg(jsonb_build_object(
    'playerIdentifier','STU-' || lpad(to_hex(i),24,'0'),
    'lookupDigest',lpad(to_hex(i),64,'0'),
    'credentialVersion','pbkdf2-sha256-v2',
    'salt',repeat('a',22),'verifier',repeat('b',43),'iterations',600000
  ) order by i) into credentials from generate_series(1,2) as i;

  select * into result from public.admin_import_player_roster_v1(game,staff,
    '["Synthetic Name","Synthetic Name"]',credentials,'roster-fixture-success','fixture-request');
  first_body := result.response_body;
  if result.was_replayed is distinct from false or result.response_status is distinct from 201 or first_body ->> 'createdCount' <> '2'
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
  if result.was_replayed is distinct from true or result.response_status is distinct from 201 or result.response_body is distinct from first_body
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
  -- Typical 30-student class and a 40-student margin, with repeated names.
  foreach cohort_size in array array[30,40] loop
    cohort_game := gen_random_uuid();
    insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state,provisioning_status,game_join_code_status)
      values(cohort_game,staff,'Synthetic class-size fixture','active','active','pending','pending');
    select jsonb_agg('Synthetic Class Student ' || ((i+1)/2)::text order by i),
      jsonb_agg(jsonb_build_object(
        'playerIdentifier','STU-' || upper(lpad(to_hex(cohort_size*1000+i),24,'0')),
        'lookupDigest',lpad(to_hex(cohort_size*1000+i),64,'0'),
        'credentialVersion','pbkdf2-sha256-v2',
        'salt',repeat('a',22),'verifier',repeat('b',43),'iterations',600000
      ) order by i)
      into cohort_names,cohort_credentials from generate_series(1,cohort_size) as i;
    select * into result from public.admin_import_player_roster_v1(cohort_game,staff,
      cohort_names,cohort_credentials,'roster-class-size-'||cohort_size,'synthetic-class');
    first_body := result.response_body;
    if result.was_replayed is distinct from false or result.response_status is distinct from 201
       or jsonb_typeof(first_body->'createdCount') is distinct from 'number'
       or (first_body->>'createdCount')::integer is distinct from cohort_size
       or jsonb_array_length(first_body->'students') is distinct from cohort_size
       or (select count(*) from public.players where game_session_id=cohort_game) <> cohort_size
       or (select count(distinct display_name) from public.players where game_session_id=cohort_game) <> cohort_size/2
       or (select count(*) from public.player_country_assignments where game_session_id=cohort_game and status='active') <> cohort_size
       or (select count(*) from public.player_access_credentials where game_session_id=cohort_game and status='active') <> cohort_size
       or (select count(*) from public.audit_log where game_session_id=cohort_game and action='players.roster_imported') <> 1 then
      raise exception 'class-size atomic provisioning mismatch';
    end if;
    if exists(select 1 from jsonb_array_elements(first_body->'students') with ordinality as student_row(value,position)
      where jsonb_typeof(value->'row') is distinct from 'number'
         or jsonb_typeof(value->'displayName') is distinct from 'string'
         or jsonb_typeof(value->'playerIdentifier') is distinct from 'string'
         or (value->>'row')::bigint is distinct from position
         or (value->>'displayName') is distinct from (cohort_names->>(position::integer-1))
         or (value->>'playerIdentifier') is distinct from (cohort_credentials->(position::integer-1)->>'playerIdentifier')) then
      raise exception 'class-size ordered receipt mismatch';
    end if;
    if first_body::text ~ 'accessCode|lookupDigest|verifier|salt|player_id|[a-f0-9]{8}-[a-f0-9]{4}-' then
      raise exception 'class-size private material in persisted receipt';
    end if;
    select * into result from public.admin_import_player_roster_v1(cohort_game,staff,
      cohort_names,'[]','roster-class-size-'||cohort_size,'synthetic-class-retry');
    if result.was_replayed is distinct from true or result.response_status is distinct from 201 or result.response_body is distinct from first_body
       or (select count(*) from public.players where game_session_id=cohort_game) <> cohort_size
       or (select count(*) from public.audit_log where game_session_id=cohort_game and action='players.roster_imported') <> 1 then
      raise exception 'class-size replay changed state';
    end if;
  end loop;
  if exists(select 1 from public.players where game_session_id=other_game) then
    raise exception 'foreign game changed';
  end if;
end;
$test$;
rollback;
