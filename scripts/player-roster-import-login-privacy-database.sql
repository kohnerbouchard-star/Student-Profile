\set ON_ERROR_STOP on
\set VERBOSITY terse
-- Synthetic, rollback-only qualification. Never print rows, codes or credentials.
begin;
set local request.jwt.claim.role = 'service_role';

do $test$
declare
  staff uuid := 'f3100000-0000-4000-8000-000000000001';
  game uuid := 'f3200000-0000-4000-8000-000000000001';
  other_game uuid := 'f3200000-0000-4000-8000-000000000002';
  player uuid := 'f3300000-0000-4000-8000-000000000001';
  other_player uuid := 'f3300000-0000-4000-8000-000000000002';
  identity text := 'STU-AAAAAAAAAAAAAAAAAAAAAAAA';
  foreign_identity text := 'STU-BBBBBBBBBBBBBBBBBBBBBBBB';
  rpc regprocedure := 'public.lookup_player_login_identity_v1(uuid,text)'::regprocedure;
  role_name text;
  denied boolean;
  result jsonb;
  before_players jsonb;
  before_credentials bigint;
  before_sessions bigint;
begin
  if has_function_privilege('anon', rpc, 'EXECUTE')
     or has_function_privilege('authenticated', rpc, 'EXECUTE')
     or not has_function_privilege('service_role', rpc, 'EXECUTE')
     or exists (
       select 1 from pg_catalog.pg_proc p,
         lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
       where p.oid = rpc and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
     ) then
    raise exception 'login identity RPC ACL mismatch';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc p
    where p.oid = rpc and not p.prosecdef and p.provolatile = 's') then
    raise exception 'login identity RPC must remain stable and security invoker';
  end if;

  insert into public.staff_users(id,supabase_auth_user_id,email,display_name,status,role)
    values(staff,'f3100000-0000-4000-8000-000000000002',
      'login-privacy-fixture@example.invalid','Synthetic login privacy owner','active','game_admin');
  insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state,provisioning_status,game_join_code_status)
    values(game,staff,'Synthetic login privacy game','active','active','pending','pending'),
          (other_game,staff,'Synthetic login privacy other game','active','active','pending','pending');
  insert into public.players(id,game_session_id,display_name,roster_label,player_identifier,player_identifier_normalized,status)
    values(player,game,'Synthetic login identity','Synthetic roster label',identity,identity,'active'),
          (other_player,other_game,'Synthetic other identity',null,identity,identity,'active'),
          ('f3300000-0000-4000-8000-000000000003',other_game,'Synthetic foreign identity',null,foreign_identity,foreign_identity,'active'),
          ('f3300000-0000-4000-8000-000000000004',game,'Synthetic archived duplicate',null,identity,identity,'archived'),
          ('f3300000-0000-4000-8000-000000000005',game,'Synthetic archived identity',null,'STU-CCCCCCCCCCCCCCCCCCCCCCCC','STU-CCCCCCCCCCCCCCCCCCCCCCCC','archived'),
          ('f3300000-0000-4000-8000-000000000006',game,'Synthetic removed identity',null,'STU-DDDDDDDDDDDDDDDDDDDDDDDD','STU-DDDDDDDDDDDDDDDDDDDDDDDD','removed');

  -- Exercise real database roles, not only role names in JWT claims.
  foreach role_name in array array['anon','authenticated'] loop
    execute format('set local role %I', role_name);
    denied := false;
    begin
      perform * from public.lookup_player_login_identity_v1(game, identity);
    exception when insufficient_privilege then
      denied := true;
    end;
    reset role;
    if not denied then raise exception 'unprivileged login identity RPC call allowed'; end if;
  end loop;

  set local role service_role;
  if current_user <> 'service_role' then raise exception 'service role fixture not active'; end if;
  select jsonb_agg(to_jsonb(p) order by p.id) into before_players
    from public.players p where p.game_session_id in (game,other_game);
  select count(*) into before_credentials from public.player_access_credentials
    where game_session_id in (game,other_game);
  select count(*) into before_sessions from public.player_sessions
    where game_session_id in (game,other_game);

  if (select count(*) from public.lookup_player_login_identity_v1(game,identity)) <> 1 then
    raise exception 'active exact-scope login identity cardinality mismatch';
  end if;
  select to_jsonb(lookup_row) into result from public.lookup_player_login_identity_v1(game,identity) lookup_row;
  if (select array_agg(key order by key) from jsonb_object_keys(result) as keys(key))
       is distinct from array['display_name','id','player_identifier','roster_label','status']
     or result is distinct from jsonb_build_object('id',player,'display_name','Synthetic login identity',
       'roster_label','Synthetic roster label','player_identifier',identity,'status','active') then
    raise exception 'login identity five-field projection mismatch';
  end if;
  if (select count(*) from public.lookup_player_login_identity_v1(other_game,identity)) <> 1 then
    raise exception 'same identifier in another game cardinality mismatch';
  end if;
  select to_jsonb(lookup_row) into result from public.lookup_player_login_identity_v1(other_game,identity) lookup_row;
  if result is distinct from jsonb_build_object('id',other_player,'display_name','Synthetic other identity',
       'roster_label',null,'player_identifier',identity,'status','active') then
    raise exception 'same identifier crossed game scope or changed nullable projection';
  end if;
  if (select count(*) from public.lookup_player_login_identity_v1(other_game,foreign_identity)) <> 1
     or exists(select 1 from public.lookup_player_login_identity_v1(game,foreign_identity))
     or exists(select 1 from public.lookup_player_login_identity_v1('f3200000-0000-4000-8000-000000000099',identity)) then
    raise exception 'foreign or missing game login identity scope mismatch';
  end if;
  if exists(select 1 from public.lookup_player_login_identity_v1(game,'STU-CCCCCCCCCCCCCCCCCCCCCCCC'))
     or exists(select 1 from public.lookup_player_login_identity_v1(game,'STU-DDDDDDDDDDDDDDDDDDDDDDDD')) then
    raise exception 'inactive player returned by login identity lookup';
  end if;
  if exists(select 1 from public.lookup_player_login_identity_v1(null,identity))
     or exists(select 1 from public.lookup_player_login_identity_v1(game,null))
     or exists(select 1 from public.lookup_player_login_identity_v1(null,null))
     or exists(select 1 from public.lookup_player_login_identity_v1(game,'')) then
    raise exception 'null or empty login identity scope matched';
  end if;
  if exists(select 1 from public.lookup_player_login_identity_v1(game,lower(identity)))
     or exists(select 1 from public.lookup_player_login_identity_v1(game,' ' || identity || ' '))
     or exists(select 1 from public.lookup_player_login_identity_v1(game,'STU-%')) then
    raise exception 'login identity lookup changed exact normalized comparison';
  end if;
  if before_players is distinct from (select jsonb_agg(to_jsonb(p) order by p.id)
       from public.players p where p.game_session_id in (game,other_game))
     or before_credentials is distinct from (select count(*) from public.player_access_credentials
       where game_session_id in (game,other_game))
     or before_sessions is distinct from (select count(*) from public.player_sessions
       where game_session_id in (game,other_game)) then
    raise exception 'login identity lookup changed player or authentication state';
  end if;
  reset role;
end;
$test$;
rollback;
