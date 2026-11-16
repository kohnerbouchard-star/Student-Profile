begin;
-- Source support only. No target/admin binding is provisioned by this migration.
-- Refuse to reinterpret an active legacy operation or remove its restriction.
do $$ begin
  if exists(select 1 from recovery_private.attempts where restricted)
  then raise exception 'reconcile restricted legacy recovery attempts before migration'; end if;
end $$;
alter table recovery_private.attempts drop constraint attempts_project_ref_check;
alter table recovery_private.attempts add constraint attempts_project_ref_check
  check(project_ref in ('eecvbssdvarfcykcfrny','cgiukdjwicykrmtkhudh'));
create table recovery_private.target (
  singleton boolean primary key default true check(singleton),
  environment text not null, project_ref text not null,
  operator_subject text not null check(length(operator_subject) between 1 and 200),
  check((environment,project_ref) in (('staging','eecvbssdvarfcykcfrny'),('production','cgiukdjwicykrmtkhudh')))
);
create table recovery_private.operations (
  attempt_id uuid primary key references recovery_private.attempts(id),
  request jsonb not null, approval_receipt jsonb not null,
  digest text not null unique check(digest ~ '^[a-f0-9]{64}$')
);
alter table recovery_private.target enable row level security;
alter table recovery_private.operations enable row level security;
revoke all on recovery_private.target,recovery_private.operations from public,anon,authenticated,service_role;

-- Sole operator boundary for new attempts and their durable side effects.
-- Human approval is verified by the external adapter, never by app-role claims.
create function public.system_recovery_operator_v2(
  p_request jsonb,p_digest text,p_action text,p_payload jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare t recovery_private.target; o recovery_private.operations;
  u uuid; rid uuid; src text; evidence text; expiry timestamptz; factors text[];
  old_request jsonb; old_id uuid; new_id uuid; expected_digest text;
begin
  select * into strict t from recovery_private.target where singleton;
  if jsonb_typeof(p_request) is distinct from 'object' or
    (select count(*) from jsonb_object_keys(p_request))<>11 or
    exists(select 1 from jsonb_object_keys(p_request) k where k not in
      ('version','environment','projectRef','authUserId','operation','requestId','sourceCommit','supportRequestRef','identityEvidenceRef','expiresAt','factorIds')) or
    exists(select 1 from jsonb_each(p_request) x where x.key<>'factorIds' and jsonb_typeof(x.value)<>'string') or
    p_request->>'version' is distinct from '2' or p_request->>'operation' is distinct from 'reset-individual-mfa' or
    (p_request->>'environment',p_request->>'projectRef') is distinct from (t.environment,t.project_ref) or
    coalesce(p_request->>'sourceCommit','') !~ '^[a-f0-9]{40}$' or
    coalesce(p_request->>'supportRequestRef','') !~ '^[a-zA-Z0-9][a-zA-Z0-9._/-]{7,159}$' or
    coalesce(p_request->>'identityEvidenceRef','') !~ '^[a-zA-Z0-9][a-zA-Z0-9._/-]{7,159}$' or
    jsonb_typeof(p_request->'factorIds') is distinct from 'array'
  then raise exception 'individual recovery request unavailable'; end if;
  if jsonb_array_length(p_request->'factorIds')>20 or
    exists(select 1 from jsonb_array_elements(p_request->'factorIds') f where jsonb_typeof(f)<>'string')
  then raise exception 'individual factors unavailable'; end if;
  select coalesce(array_agg(f order by f),'{}') into factors from jsonb_array_elements_text(p_request->'factorIds') f;
  if cardinality(factors)<>(select count(distinct f) from unnest(factors) f) or
    exists(select 1 from unnest(factors || array[p_request->>'authUserId',p_request->>'requestId']) f
      where coalesce(f,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') or
    p_request->'factorIds' is distinct from to_jsonb(factors)
  then raise exception 'individual factor identity unavailable'; end if;
  u:=(p_request->>'authUserId')::uuid; rid:=(p_request->>'requestId')::uuid;
  src:=p_request->>'sourceCommit'; evidence:=p_request->>'identityEvidenceRef'; expiry:=(p_request->>'expiresAt')::timestamptz;
  if to_char(expiry at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') is distinct from p_request->>'expiresAt'
  then raise exception 'individual expiry unavailable'; end if;
  expected_digest:=encode(sha256(convert_to(concat_ws(E'\n','2',t.environment,t.project_ref,u::text,'reset-individual-mfa',rid::text,
    src,p_request->>'supportRequestRef',evidence,p_request->>'expiresAt',array_to_string(factors,',')),'UTF8')),'hex');
  if p_digest is distinct from expected_digest then raise exception 'individual digest mismatch'; end if;
  -- Serialize begin/restart against the existing per-account state machine.
  perform 1 from public.staff_users where supabase_auth_user_id=u for update;
  select * into o from recovery_private.operations where attempt_id=rid;
  if found and (o.request,o.digest) is distinct from (p_request,p_digest)
  then raise exception 'immutable individual operation mismatch'; end if;
  if p_action in ('begin','restart') then
    if p_payload->>'operator' is distinct from t.operator_subject or
      p_payload->>'confirmedOperationDigest' is distinct from p_digest or
      p_payload->'supportRequestVerified' is distinct from 'true'::jsonb or
      (t.environment='production' and p_payload->'productionConfirmed' is distinct from 'true'::jsonb) or
      jsonb_typeof(p_payload->'authenticatedAt') is distinct from 'number' or
      to_timestamp((p_payload->>'authenticatedAt')::numeric/1000)>clock_timestamp() or
      to_timestamp((p_payload->>'authenticatedAt')::numeric/1000)<clock_timestamp()-interval '5 minutes'
    then raise exception 'fresh sole operator confirmation unavailable'; end if;
    if expiry<=clock_timestamp() or expiry>clock_timestamp()+interval '15 minutes'
    then raise exception 'individual approval expired'; end if;
    if p_action='begin' then
      if o.attempt_id is null and exists(select 1 from unnest(factors) f where not exists(
        select 1 from auth.mfa_factors m where m.id=f::uuid and m.user_id=u))
      then raise exception 'approved factor belongs to another account or is absent'; end if;
      perform public.system_recovery_begin_v1(rid,u,t.project_ref,src,t.operator_subject,evidence,expiry);
    else
      old_request:=p_payload->'previous'; old_id:=(old_request->>'requestId')::uuid;
      if not exists(select 1 from recovery_private.operations where attempt_id=old_id and request=old_request) or
        (old_request->>'environment',old_request->>'projectRef',old_request->>'authUserId',old_request->>'operation',
          old_request->>'supportRequestRef',old_request->'factorIds') is distinct from
        (t.environment,t.project_ref,u::text,p_request->>'operation',p_request->>'supportRequestRef',p_request->'factorIds')
      then raise exception 'previous individual operation mismatch'; end if;
      new_id:=public.system_recovery_restart_v1(old_id,old_request->>'sourceCommit',old_request->>'identityEvidenceRef',
        (old_request->>'expiresAt')::timestamptz,rid,u,src,t.operator_subject,evidence,expiry);
    end if;
    insert into recovery_private.operations(attempt_id,request,digest,approval_receipt) values(rid,p_request,p_digest,
      jsonb_build_object('operator',t.operator_subject,'authenticatedAt',p_payload->'authenticatedAt',
        'confirmedOperationDigest',p_digest,'productionConfirmed',p_payload->'productionConfirmed','supportRequestVerified',true)) on conflict do nothing;
    return to_jsonb(rid);
  end if;
  if o.attempt_id is null then raise exception 'approved individual operation absent'; end if;
  if p_action='read' then return public.system_recovery_operator_state_v1(rid,u,src,evidence);
  elsif p_action='advance' then
    if expiry<=clock_timestamp() then raise exception 'individual approval expired'; end if;
    perform public.system_recovery_advance_v1(rid,u,src,p_payload->>'expected',p_payload->>'next',p_payload->>'grantDigest',
      case when p_payload->>'expiresAt' is null then null else to_timestamp((p_payload->>'expiresAt')::numeric/1000) end);
    return 'true'::jsonb;
  elsif p_action='delivery' then
    return public.system_recovery_delivery_v1(rid,u,src,evidence,expiry,p_payload->>'action',p_payload->'record');
  elsif p_action='notice' then
    return public.system_recovery_notice_v1(rid,u,src,p_payload->>'kind',coalesce((p_payload->>'ack')::boolean,false));
  end if;
  raise exception 'individual action unavailable';
end $$;
revoke all on function public.system_recovery_operator_v2(jsonb,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.system_recovery_operator_v2(jsonb,text,text,jsonb) to service_role;
-- Preserve the legacy implementation internally, but remove operator bypasses.
do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
    ('system_recovery_begin_v1','system_recovery_operator_state_v1','system_recovery_advance_v1',
     'system_recovery_restart_v1','system_recovery_delivery_v1','system_recovery_notice_v1') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
end $$;
commit;
